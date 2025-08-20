// src/index.js — AriBot (모집 + 스티키 공지 + 공지수정 + rooms.json 저장)
require("dotenv").config();
const DEBUG = process.env.DEBUG === "true";
console.log("[AriBot] boot. tokenLen =", (process.env.BOT_TOKEN || "").length);
if (DEBUG) console.log("[AriBot] DEBUG is ON");

// server.js가 루트에 있으면 아래 경로 유지
const keepAlive = require("../server.js");

const fs = require("fs");
const path = require("path");
const ROOMS_PATH = path.join(__dirname, "rooms.json");

const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ChannelType, PermissionFlagsBits,
} = require("discord.js");

// ── 권한/상수
const CLOSE_ROLE_IDS = ["1276555695390457929", "1403607361360236575"];
const MAX_SHOW_HARD = 120;
const STICKY_DEBOUNCE_MS = 0; // 0이면 새 메시지마다 즉시 끌올

function canClose(i) {
  if (!i.inGuild()) return false;
  if (i.guild?.ownerId && i.user?.id === i.guild.ownerId) return true;
  if (i.member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roles = i.member?.roles?.cache;
  return roles?.some(r => CLOSE_ROLE_IDS.includes(r.id)) ?? false;
}

// ── 상태
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
let BOT_AVATAR_URL = null;
const rooms = new Map();         // messageId -> room
const stickyNotices = new Map(); // channelId -> { style,title,content,pin,expiresAt,lastMsgId,lastPostAt }

// ── utils (embed/plain 편집 등)
const utils = require("./utils");

// ── commands 연결: notice-edit
const setupNoticeEdit = require("../commands/notice-edit");
const noticeEditCmd = setupNoticeEdit({ stickyNotices, utils });

// ── 공지 스타일 빌더 (보내기/스티키용)
function buildEmbedPurple({ title, content }) {
  return new EmbedBuilder().setColor(0xCDC1FF).setTitle(title || null).setDescription(content);
}
function buildEmbedBlue({ title, content }) {
  return new EmbedBuilder().setColor(0x2b6cff).setTitle(title || null).setDescription(content);
}
function buildEmbedMin({ title, content }) {
  return new EmbedBuilder().setColor(0x2b2d31).setTitle(title || null).setDescription(content);
}
function buildNoticePayload({ style, title, content }) {
  if (style === "embed-purple") return { embeds: [buildEmbedPurple({ title, content })] };
  if (style === "embed-blue")   return { embeds: [buildEmbedBlue({ title, content })] };
  if (style === "embed-min")    return { embeds: [buildEmbedMin({ title, content })] };
  if (style === "code") {
    const body = title ? `**${title}**\n\`\`\`\n${content}\n\`\`\`` : `\`\`\`\n${content}\n\`\`\``;
    return { content: body, embeds: [] };
  }
  // plain (노멀)
  return { content: title ? `**${title}**\n${content}` : content, embeds: [] };
}

// ── rooms 저장/로드
function saveRooms() {
  try {
    const plain = Object.fromEntries(rooms);
    fs.writeFileSync(ROOMS_PATH, JSON.stringify(plain, null, 2), "utf8");
    if (DEBUG) console.log("[AriBot] rooms saved:", rooms.size);
  } catch (e) { console.warn("[AriBot] saveRooms fail:", e?.message || e); }
}
function loadRooms() {
  try {
    if (!fs.existsSync(ROOMS_PATH)) { if (DEBUG) console.log("[AriBot] rooms.json not found"); return; }
    const data = JSON.parse(fs.readFileSync(ROOMS_PATH, "utf8"));
    rooms.clear();
    for (const [mid, r] of Object.entries(data)) rooms.set(mid, r);
    console.log("📦 rooms loaded:", rooms.size);
  } catch (e) { console.warn("[AriBot] loadRooms fail:", e?.message || e); }
}

// 모집 UI
const removeFrom = (arr, id) => { const k = arr.indexOf(id); if (k >= 0) { arr.splice(k,1); return true; } return false; };
const promoteFromWaitlist = (room) => { while (room.participants.length < room.max && room.waitlist.length) room.participants.push(room.waitlist.shift()); };

function pad(n){ return String(n).padStart(2,"0"); }
function fmtTime(ts){
  if(!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildUI(room) {
  const countLine = `현재 인원: **${room.participants.length}/${room.max}**`;
  const showCount = Math.min(room.max, MAX_SHOW_HARD);
  const joinedList = room.participants.slice(0, showCount);
  const overflow   = room.participants.slice(showCount);
  const waitAll    = [...overflow, ...room.waitlist];

  const joined = joinedList.length
    ? joinedList.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n")
    : "아직 없음";

  const waiting = waitAll.length
    ? `\n\n⏳ **예비자 (${waitAll.length})**\n` + waitAll.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n")
    : "";

  const statusLine = (room.closed && room.closedBy)
    ? `\n\n**🔒 마감됨 — 마감자: <@${room.closedBy}> • ${fmtTime(room.closedAt)}**`
    : "";

  const embed = new EmbedBuilder()
    .setTitle(`${room.closed ? "🔒" : "🎯"} ${room.title} - 정원 ${room.max}명`)
    .setDescription(`${countLine}\n${joined}${waiting}${statusLine}`)
    .setColor(room.closed ? 0x777777 : 0x5865f2);

  const makeId = (k) => `${k}:${room.messageId}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(makeId("join")).setLabel("참가").setStyle(ButtonStyle.Success).setDisabled(room.closed),
    new ButtonBuilder().setCustomId(makeId("cancel")).setLabel("취소").setStyle(ButtonStyle.Secondary).setDisabled(room.closed),
    new ButtonBuilder().setCustomId(makeId("list")).setLabel("목록").setStyle(ButtonStyle.Primary).setDisabled(room.closed),
    new ButtonBuilder().setCustomId(makeId("close")).setLabel("마감").setStyle(ButtonStyle.Danger).setDisabled(room.closed),
  );
  return { embed, row };
}

// ── ready
client.once(Events.ClientReady, (c) => {
  console.log("✅ READY as", c.user.tag);
  try { c.user.setActivity("킬내기모집봇 + 공지"); } catch {}
  BOT_AVATAR_URL = c.user.displayAvatarURL({ extension: "png", size: 256 });
  loadRooms();
});

// ── slash commands
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;

  // notice-edit
  if (i.commandName === "notice-edit") {
    try { return await noticeEditCmd.execute(i); }
    catch (err) {
      console.error("Interaction(notice-edit) error:", err);
      if (i.deferred || i.replied) return i.followUp({ content: "공지 수정 중 오류가 났어요 ㅠㅠ", ephemeral: true }).catch(()=>{});
      return i.reply({ content: "공지 수정 중 오류가 났어요 ㅠㅠ", ephemeral: true }).catch(()=>{});
    }
  }

  // 기존 notice/ari 명령은 네가 쓰던 그대로 유지 (생성/수정/스티키 등)
  // 필요 시 여기에 추가로 연결해 사용하면 됨.
});

// ── 버튼(참가/취소/목록/마감)
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isButton()) return;
  try { if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true }); } catch {}

  try {
    const [action, msgId] = i.customId.split(":");
    if (!msgId) { if (!i.replied) await i.editReply("잘못된 버튼이에요."); return; }

    let room = rooms.get(msgId);
    if (!room) { if (DEBUG) console.log("[button] room miss → reload"); loadRooms(); room = rooms.get(msgId); }
    if (!room) { await i.editReply("이 모집글 정보를 찾을 수 없어요. (봇 재시작 등으로 초기화됨)"); return; }

    if (room.closed && action !== "list") { await i.editReply("이미 마감된 모집이에요."); return; }

    const uid = i.user.id;
    let changed = false;

    if (action === "join") {
      if (room.participants.includes(uid) || room.waitlist.includes(uid)) {
        await i.editReply("이미 참가/예비자 목록에 있어요.");
      } else {
        if (room.participants.length < room.max) room.participants.push(uid);
        else room.waitlist.push(uid);
        changed = true; await i.editReply("✅ 접수 완료!");
      }
    } else if (action === "cancel") {
      if (removeFrom(room.participants, uid) || removeFrom(room.waitlist, uid)) {
        promoteFromWaitlist(room);
        changed = true; await i.editReply("✅ 취소 완료!");
      } else {
        await i.editReply("목록에 없어 취소할 수 없어요.");
      }
    } else if (action === "close") {
      if (!canClose(i)) { await i.editReply("마감 권한이 없어요."); }
      else {
        room.closed = true; room.closedBy = i.user.id; room.closedAt = Date.now();
        changed = true; await i.editReply("🔒 마감했습니다.");
      }
    } else if (action === "list") {
      const joined  = room.participants.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n") || "없음";
      const waiting = room.waitlist.length ? `\n\n⏳ 예비자\n${room.waitlist.map((id,idx)=>`${idx+1}. <@${id}>`).join("\n")}` : "";
      await i.editReply(`**${room.title}**\n정원: ${room.participants.length}/${room.max}\n${joined}${waiting}`);
    } else { await i.editReply("알 수 없는 버튼이에요."); }

    if (changed) {
      try {
        const channel = await client.channels.fetch(room.channelId);
        let msg = null;
        try { msg = await channel.messages.fetch(room.messageId); } catch {}
        const ui = buildUI(room);
        if (msg) await msg.edit({ embeds: [ui.embed], components: [ui.row] });
        else {
          const newMsg = await channel.send({ embeds: [ui.embed], components: [ui.row] });
          room.messageId = newMsg.id;
        }
        saveRooms();
      } catch (e) { console.warn("update room view fail:", e?.message || e); }
    }
  } catch (err) {
    console.error("Interaction(button) error:", err);
    try { await i.editReply("버튼 처리 중 오류가 났어요 ㅠㅠ"); } catch {}
  }
});

// ── 스티키 끌올
client.on(Events.MessageCreate, async (m) => {
  try {
    if (m.author.bot || !m.inGuild()) return;
    const st = stickyNotices.get(m.channelId);
    if (!st) return;

    if (st.expiresAt && Date.now() > st.expiresAt) {
      if (st.lastMsgId) {
        const prev = await m.channel.messages.fetch(st.lastMsgId).catch(()=>null);
        if (prev) await prev.delete().catch(()=>{});
      }
      stickyNotices.delete(m.channelId);
      return;
    }

    if (STICKY_DEBOUNCE_MS && Date.now() - (st.lastPostAt || 0) < STICKY_DEBOUNCE_MS) return;

    if (st.lastMsgId) {
      const prev = await m.channel.messages.fetch(st.lastMsgId).catch(()=>null);
      if (prev) await prev.delete().catch(()=>{});
    }

    const payload = buildNoticePayload(st);
    const sent = await m.channel.send({ allowedMentions: { parse: [] }, ...payload });
    stickyNotices.set(m.channelId, { ...st, lastMsgId: sent.id, lastPostAt: Date.now() });
  } catch (e) { console.warn("[AriBot] sticky bump fail:", e?.message || e); }
});

// ── 실행
if (!process.env.BOT_TOKEN) { console.error("[AriBot] BOT_TOKEN missing! .env 확인"); process.exit(1); }
keepAlive();
client.login(process.env.BOT_TOKEN).catch((e) => console.error("[AriBot] login failed:", e));
