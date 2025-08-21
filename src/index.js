require("dotenv").config();

const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, PermissionFlagsBits
} = require("discord.js");

const keepAlive = require("../server.js");
keepAlive();
const fs = require("fs");
const path = require("path");

// ===== 설정 =====
const DEBUG = process.env.DEBUG === "true";
console.log("[AriBot] boot. tokenLen =", (process.env.BOT_TOKEN || "").length, DEBUG ? "(DEBUG ON)" : "");

// 마감 권한 (관리자/길드주 이외에 허용할 역할 ID)
const CLOSE_ROLE_IDS = ["1276555695390457929", "1403607361360236575"];

// 내부 상태
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const rooms = new Map();          // messageId -> room
const stickyNotices = new Map();  // channelId -> { style,title,content,pin,expiresAt,lastMsgId,lastPostAt }
const ROOMS_PATH = path.join(__dirname, "rooms.json");

// ===== 유틸 =====
const canClose = (i) => {
  if (!i.inGuild()) return false;
  if (i.user?.id === i.guild?.ownerId) return true;
  if (i.member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return i.member?.roles?.cache?.some(r => CLOSE_ROLE_IDS.includes(r.id)) ?? false;
};

const normalize = (t) =>
  (t || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\s*\/\/\s*/g, "\n");

const buildEmbed = (hex, { title, content }) =>
  new EmbedBuilder().setColor(hex).setTitle(title || null).setDescription(content);

const buildNoticePayload = ({ style, title, content }) => {
  if (style === "embed-purple") return { embeds: [buildEmbed(0xCDC1FF, { title, content })] };
  if (style === "embed-blue")   return { embeds: [buildEmbed(0x2b6cff,  { title, content })] };
  if (style === "embed-min")    return { embeds: [buildEmbed(0x2b2d31,  { title, content })] };
  if (style === "code") {
    const body = title ? `**${title}**\n\`\`\`\n${content}\n\`\`\`` : `\`\`\`\n${content}\n\`\`\``;
    return { content: body, embeds: [] };
  }
  return { content: title ? `**${title}**\n${content}` : content, embeds: [] }; // plain
};

async function sendStyledNotice(channel, { style, title, content, pin }) {
  const payload = buildNoticePayload({ style, title, content });
  const msg = await channel.send({ allowedMentions: { parse: [] }, ...payload });
  if (pin) { try { await msg.pin(); } catch {} }
  return msg;
}

async function editStyledNoticeById(channel, messageId, { style, title, content, pin }) {
  const payload = buildNoticePayload({ style, title, content });
  const msg = await channel.messages.fetch(messageId);
  await msg.edit(payload);
  if (typeof pin === "boolean") {
    try {
      if (pin && !msg.pinned) await msg.pin();
      if (!pin && msg.pinned) await msg.unpin();
    } catch {}
  }
  return msg;
}

const saveRooms = () => {
  try {
    fs.writeFileSync(ROOMS_PATH, JSON.stringify(Object.fromEntries(rooms), null, 2), "utf8");
    if (DEBUG) console.log("[rooms] saved", rooms.size);
  } catch (e) { console.log("[rooms] save fail:", e.message); }
};

const loadRooms = () => {
  try {
    if (!fs.existsSync(ROOMS_PATH)) return;
    const data = JSON.parse(fs.readFileSync(ROOMS_PATH, "utf8"));
    rooms.clear();
    for (const [k, v] of Object.entries(data)) rooms.set(k, v);
    console.log("📦 rooms loaded", rooms.size);
  } catch (e) { console.log("[rooms] load fail:", e.message); }
};

const removeFrom = (arr, id) => { const i = arr.indexOf(id); if (i >= 0) { arr.splice(i,1); return true; } return false; };
const promoteFromWait = (room) => { while (room.participants.length < room.max && room.waitlist.length) room.participants.push(room.waitlist.shift()); };

const pad = n => String(n).padStart(2, "0");
const fmt = ts => { const d=new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function buildUI(room) {
  const joined = room.participants.map((id, i) => `${i+1}. <@${id}>`).join("\n") || "아직 없음";
  const waiting = room.waitlist.length ? `\n\n⏳ **예비자(${room.waitlist.length})**\n` + room.waitlist.map((id,i)=>`${i+1}. <@${id}>`).join("\n") : "";
  const status = room.closed ? `\n\n**🔒 마감됨 — <@${room.closedBy}> • ${fmt(room.closedAt)}**` : "";

  const embed = new EmbedBuilder()
    .setTitle(`${room.closed ? "🔒" : "🎯"} ${room.title} - 정원 ${room.max}명`)
    .setDescription(`현재 인원: **${room.participants.length}/${room.max}**\n${joined}${waiting}${status}`)
    .setColor(room.closed ? 0x777777 : 0x5865f2);

  const mk = (k) => `${k}:${room.messageId}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(mk("join")).setLabel("참가").setStyle(ButtonStyle.Success).setDisabled(room.closed),
    new ButtonBuilder().setCustomId(mk("cancel")).setLabel("취소").setStyle(ButtonStyle.Secondary).setDisabled(room.closed),
    new ButtonBuilder().setCustomId(mk("list")).setLabel("목록").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(mk("close")).setLabel("마감").setStyle(ButtonStyle.Danger).setDisabled(room.closed),
  );
  return { embed, row };
}

// ===== 명령 모듈 로드 =====
const ctx = {
  stickyNotices,
  rooms,
  utils: { sendStyledNotice, editStyledNoticeById, buildNoticePayload, normalize, saveRooms, loadRooms, buildUI, canClose, promoteFromWait, removeFrom }
};

// commands 폴더에서 모듈 require
const commands = new Map();
function use(command) { commands.set(command.data.name, command); }

// 공지 등록/스티키
use(require("./commands/notice")(ctx));
// 공지 수정/삭제
use(require("./commands/notice-edit")(ctx));
// 모집(만들기/수정/삭제/핑/복사/현황)
use(require("./commands/recruit")(ctx));

client.once(Events.ClientReady, (c) => {
  console.log("✅ READY as", c.user.tag);
  loadRooms();
});

// 슬래시 인터랙션 라우팅
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;
  const mod = commands.get(i.commandName);
  if (!mod) return;
  try {
    await mod.execute(i, ctx);
  } catch (e) {
    console.error(`[${i.commandName}]`, e);
    const msg = "처리 중 오류가 났어요 ㅠㅠ";
    if (i.deferred || i.replied) await i.followUp({ content: msg, ephemeral: true }).catch(()=>{});
    else await i.reply({ content: msg, ephemeral: true }).catch(()=>{});
  }
});

// 버튼(모집)
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isButton()) return;
  const [action, mid] = i.customId.split(":");
  const room = rooms.get(mid);
  try { if (!i.replied && !i.deferred) await i.deferReply({ ephemeral: true }); } catch {}
  if (!room) { await i.editReply("이 모집글 정보를 찾지 못했어요."); return; }

  const uid = i.user.id;
  let changed = false;
  try {
    if (action === "join") {
      if (room.participants.includes(uid) || room.waitlist.includes(uid)) {
        await i.editReply("이미 목록에 있어요.");
      } else {
        (room.participants.length < room.max ? room.participants : room.waitlist).push(uid);
        changed = true; await i.editReply("✅ 접수 완료!");
      }
    } else if (action === "cancel") {
      if (removeFrom(room.participants, uid) || removeFrom(room.waitlist, uid)) {
        promoteFromWait(room);
        changed = true; await i.editReply("✅ 취소 완료!");
      } else {
        await i.editReply("목록에 없어요.");
      }
    } else if (action === "list") {
      const j = room.participants.map((id, n)=>`${n+1}. <@${id}>`).join("\n") || "없음";
      const w = room.waitlist.length ? `\n\n⏳ 예비자\n` + room.waitlist.map((id,n)=>`${n+1}. <@${id}>`).join("\n") : "";
      await i.editReply(`**${room.title}**\n정원 ${room.participants.length}/${room.max}\n${j}${w}`);
    } else if (action === "close") {
      if (!canClose(i)) { await i.editReply("마감 권한이 없어요."); }
      else { room.closed = true; room.closedBy = i.user.id; room.closedAt = Date.now(); changed = true; await i.editReply("🔒 마감했습니다."); }
    } else {
      await i.editReply("알 수 없는 버튼입니다.");
    }

    if (changed) {
      const ch = await client.channels.fetch(room.channelId);
      const msg = await ch.messages.fetch(room.messageId).catch(()=>null);
      const ui = buildUI(room);
      if (msg) await msg.edit({ embeds: [ui.embed], components: [ui.row] });
      saveRooms();
    }
  } catch (e) {
    console.error("[button]", e);
    try { await i.editReply("버튼 처리 중 오류"); } catch {}
  }
});

keepAlive();

if (!process.env.BOT_TOKEN) {
  console.error("BOT_TOKEN이 .env에 없습니다.");
  process.exit(1);
}
client.login(process.env.BOT_TOKEN);
