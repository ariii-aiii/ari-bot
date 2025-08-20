// index.js — AriBot (모집 + 공지 + 스티키) 단일 파일 버전
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ChannelType, PermissionFlagsBits,
} = require("discord.js");

const DEBUG = process.env.DEBUG === "true";

// ───────────────────────── 설정/상수
const ROOMS_JSON = path.join(__dirname, "rooms.json");

const CLOSE_ROLE_IDS = ["1276555695390457929", "1403607361360236575"]; // 마감 권한 역할(원하면 비워둬도 됨)
const MAX_SHOW_HARD = 120;   // 모집표시 최대 인원
const STICKY_DEBOUNCE_MS = 0; // 0 = 새 메시지 올 때마다 바로 끌올

// 모집 정원 선택지 (고정)
const MAX_CHOICES = [8, 12, 16, 20, 28, 32, 40, 56, 60];

// ───────────────────────── 상태
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ],
});

let BOT_AVATAR_URL = null;

// 모집글 저장소: messageId -> room
const rooms = new Map();
// 스티키 공지 저장소: channelId -> { style,title,content,pin,expiresAt,lastMsgId,lastPostAt }
const stickyNotices = new Map();

// ───────────────────────── 유틸
function canClose(i) {
  if (!i.inGuild()) return false;
  if (i.guild?.ownerId && i.user?.id === i.guild.ownerId) return true;
  if (i.member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roles = i.member?.roles?.cache;
  return roles?.some(r => CLOSE_ROLE_IDS.includes(r.id)) ?? false;
}

function saveRooms() {
  try {
    const plain = Object.fromEntries(rooms);
    fs.writeFileSync(ROOMS_JSON, JSON.stringify(plain, null, 2), "utf8");
    if (DEBUG) console.log("[rooms] saved:", rooms.size);
  } catch (e) { console.warn("[rooms] save fail:", e?.message || e); }
}
function loadRooms() {
  try {
    if (!fs.existsSync(ROOMS_JSON)) { if (DEBUG) console.log("[rooms] not found"); return; }
    const data = JSON.parse(fs.readFileSync(ROOMS_JSON, "utf8"));
    rooms.clear();
    for (const [mid, r] of Object.entries(data)) rooms.set(mid, r);
    console.log("📦 rooms loaded:", rooms.size);
  } catch (e) { console.warn("[rooms] load fail:", e?.message || e); }
}

const removeFrom = (arr, id) => { const k = arr.indexOf(id); if (k >= 0) { arr.splice(k,1); return true; } return false; };
const promoteFromWaitlist = (room) => { while (room.participants.length < room.max && room.waitlist.length) room.participants.push(room.waitlist.shift()); };

function pad(n){ return String(n).padStart(2,"0"); }
function fmtTime(ts){
  if(!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 줄바꿈 정규화
function normalize(text) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
}

// 공지 style → payload
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
  // plain
  const body = title ? `**${title}**\n${content}` : content;
  return { content: body, embeds: [] };
}

// 모집 UI
function buildRoomUI(room) {
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

// ───────────────────────── Ready
client.once(Events.ClientReady, (c) => {
  console.log("✅ READY as", c.user.tag);
  try { c.user.setActivity("모집봇 + 공지"); } catch {}
  BOT_AVATAR_URL = c.user.displayAvatarURL({ extension: "png", size: 256 });
  loadRooms();
});

// ───────────────────────── Slash Commands
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;

  // 모든 커맨드는 즉시 defer → 타임아웃 방지
  try { await i.deferReply({ ephemeral: true }); } catch {}

  try {
    // /notice (ko: 아리공지)
    if (i.commandName === "notice") {
      const channel = i.channel;
      const raw     = i.options.getString("content", true);
      const title   = i.options.getString("title") || "";
      const style   = i.options.getString("style") || "embed-purple";
      const pin     = i.options.getBoolean("pin") || false;

      const sticky  = i.options.getBoolean("sticky") || false;
      const holdMin = i.options.getInteger("hold") || 0; // 0=무한
      const edit    = i.options.getBoolean("edit") || false;

      const content = normalize(raw);

      // 수정 플래그가 켜진 경우: 현재 스티키(있다면) 편집
      if (sticky && edit) {
        const st = stickyNotices.get(channel.id);
        if (!st?.lastMsgId) {
          return i.editReply("수정할 스티키가 없어요.");
        }
        const msg = await channel.messages.fetch(st.lastMsgId);
        // 봇이 보낸 메시지만 편집 가능
        if (msg.author.id !== client.user.id) {
          return i.editReply("봇이 보낸 공지만 수정할 수 있어요.");
        }
        await msg.edit({ allowedMentions: { parse: [] }, ...buildNoticePayload({ style, title, content }) });
        if (typeof pin === "boolean") {
          try {
            if (pin && !msg.pinned) await msg.pin();
            if (!pin && msg.pinned) await msg.unpin();
          } catch {}
        }
        stickyNotices.set(channel.id, {
          style, title, content, pin,
          lastMsgId: msg.id, lastPostAt: Date.now(),
          expiresAt: holdMin > 0 ? (Date.now() + holdMin * 60 * 1000) : null,
        });
        return i.editReply(`✏️ 스티키 공지를 수정했어요${holdMin>0 ? ` • 유지 ${holdMin}분` : " • 무기한"}.`);
      }

      // 새 공지 발송
      // 기존 스티키가 있으면 지우고 새로
      if (sticky) {
        const prev = stickyNotices.get(channel.id);
        if (prev?.lastMsgId) {
          const old = await channel.messages.fetch(prev.lastMsgId).catch(()=>null);
          if (old && old.author.id === client.user.id) { try { await old.delete(); } catch {} }
        }
      }

      const sent = await channel.send({
        allowedMentions: { parse: [] },
        ...buildNoticePayload({ style, title, content })
      });
      if (pin) { try { await sent.pin(); } catch {} }

      if (sticky) {
        stickyNotices.set(channel.id, {
          style, title, content, pin,
          lastMsgId: sent.id, lastPostAt: Date.now(),
          expiresAt: holdMin > 0 ? (Date.now() + holdMin * 60 * 1000) : null,
        });
        return i.editReply(`✅ 스티키 공지를 보냈어요${holdMin>0 ? ` • 유지 ${holdMin}분` : " • 무기한"}.`);
      }

      return i.editReply(`✅ 공지를 보냈어요${pin ? " (핀 고정)" : ""}.`);
    }

    // /notice-edit (ko: 아리공지수정)
    if (i.commandName === "notice-edit") {
      const channel = i.channel;
      const raw     = i.options.getString("content", true);
      const title   = i.options.getString("title") || "";
      const style   = i.options.getString("style") || "embed-purple";
      const pin     = i.options.getBoolean("pin");
      const msgArg  = i.options.getString("message");

      const content = normalize(raw);

      // 수정 대상 메시지 찾기: 명시 메시지ID > 스티키 lastMsg
      let targetId = null;
      if (msgArg) {
        const m = msgArg.match(/\d{17,20}$/);
        if (m) targetId = m[0];
      } else {
        const st = stickyNotices.get(channel.id);
        if (st?.lastMsgId) targetId = st.lastMsgId;
      }
      if (!targetId) return i.editReply("수정할 메시지를 못 찾았어요.");

      const msg = await channel.messages.fetch(targetId).catch(()=>null);
      if (!msg) return i.editReply("대상 메시지를 찾을 수 없어요.");
      if (msg.author.id !== client.user.id) return i.editReply("봇이 보낸 메시지만 수정할 수 있어요.");

      await msg.edit({ allowedMentions: { parse: [] }, ...buildNoticePayload({ style, title, content }) });
      if (typeof pin === "boolean") {
        try {
          if (pin && !msg.pinned) await msg.pin();
          if (!pin && msg.pinned) await msg.unpin();
        } catch {}
      }

      // 스티키 상태 갱신
      const st = stickyNotices.get(channel.id);
      if (st && st.lastMsgId === msg.id) {
        stickyNotices.set(channel.id, { ...st, style, title, content, pin, lastPostAt: Date.now() });
      }

      return i.editReply("✏️ 공지를 수정했어요!");
    }

    // /ari ... (ko: 아리 …)
    if (i.commandName === "ari") {
      const sub = i.options.getSubcommand(false);

      // 만들기
      if (sub === "create" || sub == null) {
        const title = i.options.getString("content", true);
        const max   = i.options.getInteger("max", true);

        const room = {
          channelId: i.channel.id, hostId: i.user.id,
          title, max,
          participants: [], waitlist: [],
          closed: false, closedBy: null, closedAt: null,
          messageId: null
        };

        const ui1 = buildRoomUI(room);
        const msg = await i.channel.send({ embeds: [ui1.embed], components: [ui1.row] });
        room.messageId = msg.id;
        const ui2 = buildRoomUI(room);
        await msg.edit({ embeds: [ui2.embed], components: [ui2.row] });

        rooms.set(msg.id, room);
        saveRooms();

        const link = `https://discord.com/channels/${i.guildId}/${i.channelId}/${msg.id}`;
        return i.editReply(`✅ 모집글 생성!\n🆔 \`${msg.id}\`\n🔗 ${link}`);
      }

      // 수정
      if (sub === "edit") {
        const msgArg  = i.options.getString("message");
        const newText = i.options.getString("content") ?? null;
        const newMax  = i.options.getInteger("max") ?? null;

        if (newText === null && newMax === null) return i.editReply("수정할 값이 없어요!");

        let targetId = null, room = null;
        if (msgArg) {
          const m = msgArg.match(/\d{17,20}$/); if (m) targetId = m[0];
          if (targetId && rooms.has(targetId)) room = rooms.get(targetId);
        } else {
          for (const [mid, r] of Array.from(rooms).reverse()) {
            if (r.channelId === i.channel.id && r.hostId === i.user.id && !r.closed) { targetId = mid; room = r; break; }
          }
        }
        if (!room || !targetId) return i.editReply("수정할 모집글을 못 찾았어요 😢");
        if (room.closed) return i.editReply("이미 마감된 모집은 수정할 수 없어요.");

        if (newText !== null) room.title = newText;
        if (newMax !== null) {
          if (newMax > room.max) { room.max = newMax; promoteFromWaitlist(room); }
          else if (newMax < room.max) {
            room.max = newMax;
            while (room.participants.length > room.max) {
              const kicked = room.participants.pop();
              room.waitlist.unshift(kicked);
            }
          }
        }

        const channel = await client.channels.fetch(room.channelId);
        const msg = await channel.messages.fetch(targetId);
        const ui = buildRoomUI(room);
        await msg.edit({ embeds: [ui.embed], components: [ui.row] });
        saveRooms();
        return i.editReply("✅ 수정 완료!");
      }

      // 현황
      if (sub === "status") {
        const myRooms = [...rooms.values()].filter(r => r.hostId === i.user.id);
        if (!myRooms.length) return i.editReply("🔍 생성한 모집글이 없습니다.");
        const info = myRooms.map(r => `- **${r.title}**: ${r.participants.length}/${r.max}명`).join("\n");
        return i.editReply(`📊 내 모집글 현황:\n${info}`);
      }

      // 모두 삭제
      if (sub === "delete") {
        let deleted = 0;
        for (const [mid, room] of rooms) {
          if (room.hostId === i.user.id) {
            try {
              const ch = await client.channels.fetch(room.channelId);
              const msg = await ch.messages.fetch(mid);
              await msg.delete();
              rooms.delete(mid);
              saveRooms();
              deleted++;
            } catch {}
          }
        }
        return i.editReply(`🗑️ ${deleted}개의 모집글을 삭제했습니다.`);
      }

      // 핑
      if (sub === "ping") {
        const msgId = i.options.getString("message", true);
        let room = rooms.get(msgId);
        if (!room) { loadRooms(); room = rooms.get(msgId); }
        if (!room) return i.editReply("❌ 해당 모집글을 찾을 수 없습니다.");
        const mentions = room.participants.map(id => `<@${id}>`).join(" ");
        await i.channel.send(`📣 **[${room.title}]** 참가자 호출: ${mentions}`);
        return i.editReply("✅ 멘션 전송 완료!");
      }

      // 복사
      if (sub === "copy") {
        const msgId = i.options.getString("message", true);
        let room = rooms.get(msgId);
        if (!room) { loadRooms(); room = rooms.get(msgId); }
        if (!room) return i.editReply("❌ 해당 모집글을 찾을 수 없습니다.");

        const newRoom = {
          channelId: room.channelId, hostId: i.user.id,
          title: room.title, max: room.max,
          participants: [], waitlist: [],
          closed: false, closedBy: null, closedAt: null,
          messageId: null
        };
        const ui = buildRoomUI(newRoom);
        const msg = await i.channel.send({ embeds: [ui.embed], components: [ui.row] });
        newRoom.messageId = msg.id;
        const ui2 = buildRoomUI(newRoom);
        await msg.edit({ embeds: [ui2.embed], components: [ui2.row] });
        rooms.set(msg.id, newRoom);
        saveRooms();
        return i.editReply(`✅ 모집글 복사 완료! 새 ID: \`${msg.id}\``);
      }

      return i.editReply(`지원하지 않는 서브커맨드: ${sub}`);
    }

    // 그 외
    return i.editReply("지원하지 않는 명령입니다.");
  } catch (err) {
    console.error("Interaction error:", err);
    try { await i.editReply("오류가 났어요 ㅠㅠ"); } catch {}
  }
});

// ───────────────────────── 버튼(참가/취소/목록/마감)
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
        const ui = buildRoomUI(room);
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

// ───────────────────────── 스티키 끌올
client.on(Events.MessageCreate, async (m) => {
  try {
    if (m.author.bot || !m.inGuild()) return;
    const st = stickyNotices.get(m.channelId);
    if (!st) return;

    if (st.expiresAt && Date.now() > st.expiresAt) {
      if (st.lastMsgId) {
        const prev = await m.channel.messages.fetch(st.lastMsgId).catch(()=>null);
        if (prev && prev.author.id === client.user.id) try { await prev.delete(); } catch {}
      }
      stickyNotices.delete(m.channelId);
      return;
    }

    if (STICKY_DEBOUNCE_MS && Date.now() - (st.lastPostAt || 0) < STICKY_DEBOUNCE_MS) return;

    if (st.lastMsgId) {
      const prev = await m.channel.messages.fetch(st.lastMsgId).catch(()=>null);
      if (prev && prev.author.id === client.user.id) try { await prev.delete(); } catch {}
    }

    const sent = await m.channel.send({ allowedMentions: { parse: [] }, ...buildNoticePayload(st) });
    stickyNotices.set(m.channelId, { ...st, lastMsgId: sent.id, lastPostAt: Date.now() });
  } catch (e) { console.warn("[sticky bump] fail:", e?.message || e); }
});

// ───────────────────────── 실행
if (!process.env.BOT_TOKEN) {
  console.error("[AriBot] BOT_TOKEN missing! .env 확인");
  process.exit(1);
}
client.login(process.env.BOT_TOKEN).catch((e) => console.error("[AriBot] login failed:", e));
