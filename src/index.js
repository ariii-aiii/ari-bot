// src/index.js — 아리봇 (모집 + 공지/스티키 + 공지수정)
require("dotenv").config();
const keepAlive = require("../server.js"); // 선택

const fs = require("fs");
const path = require("path");
const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ChannelType, PermissionFlagsBits,
} = require("discord.js");

const DEBUG = process.env.DEBUG === "true";
const ROOMS_PATH = path.join(__dirname, "rooms.json");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// ───────── 상태저장
const rooms = new Map();          // messageId -> room
const stickyNotices = new Map();  // channelId -> { style,title,content,pin,expiresAt,lastMsgId,lastPostAt }

// ───────── 유틸
const pad = n => String(n).padStart(2, "0");
const fmtTime = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const normalize = t => (t || "").replace(/\r\n/g, "\n").replace(/\\n/g, "\n").replace(/<br\s*\/?>/gi, "\n");

// 저장/로드
function saveRooms() {
  try {
    const plain = Object.fromEntries(rooms);
    fs.writeFileSync(ROOMS_PATH, JSON.stringify(plain, null, 2), "utf8");
  } catch (e) { console.warn("saveRooms fail:", e?.message || e); }
}
function loadRooms() {
  try {
    if (!fs.existsSync(ROOMS_PATH)) return;
    const data = JSON.parse(fs.readFileSync(ROOMS_PATH, "utf8"));
    rooms.clear();
    for (const [mid, r] of Object.entries(data)) rooms.set(mid, r);
    console.log("📦 rooms loaded:", rooms.size);
  } catch (e) { console.warn("loadRooms fail:", e?.message || e); }
}

// 공지 스타일
function buildEmbed({ color, title, content }) {
  return new EmbedBuilder().setColor(color).setTitle(title || null).setDescription(content);
}
function buildNoticePayload({ style, title, content }) {
  const c = normalize(content);
  const t = normalize(title || "");
  if (style === "embed-purple") return { embeds: [buildEmbed({ color: 0xCDC1FF, title: t, content: c })] };
  if (style === "embed-blue")   return { embeds: [buildEmbed({ color: 0x2b6cff, title: t, content: c })] };
  if (style === "embed-min")    return { embeds: [buildEmbed({ color: 0x2b2d31, title: t, content: c })] };
  if (style === "code")         return { content: t ? `**${t}**\n\`\`\`\n${c}\n\`\`\`` : `\`\`\`\n${c}\n\`\`\`` };
  return { content: t ? `**${t}**\n${c}` : c }; // plain
}

// 모집 UI
const MAX_SHOW_HARD = 120;
const removeFrom = (arr, id) => { const k = arr.indexOf(id); if (k >= 0) { arr.splice(k,1); return true; } return false; };
const promoteFromWaitlist = (room) => { while (room.participants.length < room.max && room.waitlist.length) room.participants.push(room.waitlist.shift()); };

function buildUI(room) {
  const countLine = `현재 인원: **${room.participants.length}/${room.max}**`;
  const showCount = Math.min(room.max, MAX_SHOW_HARD);
  const joinedList = room.participants.slice(0, showCount);
  const overflow   = room.participants.slice(showCount);
  const waitAll    = [...overflow, ...room.waitlist];

  const joined = joinedList.length ? joinedList.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n") : "아직 없음";
  const waiting = waitAll.length ? `\n\n⏳ **예비자 (${waitAll.length})**\n` + waitAll.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n") : "";

  const statusLine = (room.closed && room.closedBy)
    ? `\n\n**🔒 마감됨 — 마감자: <@${room.closedBy}> • ${fmtTime(room.closedAt)}**` : "";

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

// ───────── Ready
client.once(Events.ClientReady, (c) => {
  console.log("✅ READY as", c.user.tag);
  try { c.user.setActivity("아리 모집 + 공지"); } catch {}
  loadRooms();
});

// ───────── 슬래시 명령 처리
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;

  // 항상 즉시 defer (타임아웃 방지)
  try { await i.deferReply({ ephemeral: true }); } catch {}

  try {
    // /notice (아리공지)
    if (i.commandName === "notice" || i.commandName === "아리공지") {
      const channel = i.channel;
      const content = i.options.getString("content", true);
      const title   = i.options.getString("title") || "";
      const style   = i.options.getString("style") || "embed-purple";
      const pin     = i.options.getBoolean("pin") || false;
      const sticky  = i.options.getBoolean("sticky") || false;
      const holdMin = i.options.getInteger("hold") || 0;

      const payload = buildNoticePayload({ style, title, content });
      const sent = await channel.send({ allowedMentions: { parse: [] }, ...payload });
      if (pin) { try { await sent.pin(); } catch {} }

      if (sticky) {
        stickyNotices.set(channel.id, {
          style, title, content, pin,
          lastMsgId: sent.id, lastPostAt: Date.now(),
          expiresAt: holdMin > 0 ? (Date.now() + holdMin * 60 * 1000) : null,
        });
      } else {
        stickyNotices.delete(channel.id);
      }
      return i.editReply("✅ 공지 전송 완료!");
    }

    // /notice-edit (아리공지수정)
    if (i.commandName === "notice-edit" || i.commandName === "아리공지수정") {
      const channel = i.channel;
      const msgId   = i.options.getString("message") || stickyNotices.get(channel.id)?.lastMsgId;
      if (!msgId) return i.editReply("수정할 메시지 ID가 없어요. (채널에 스티키가 있어야 해요)");

      const content = i.options.getString("content", true);
      const title   = i.options.getString("title") || "";
      const style   = i.options.getString("style") || "embed-purple";
      const pin     = i.options.getBoolean("pin");

      const msg = await channel.messages.fetch(msgId);
      const payload = buildNoticePayload({ style, title, content });
      await msg.edit(payload);
      if (typeof pin === "boolean") {
        try {
          if (pin && !msg.pinned) await msg.pin();
          if (!pin && msg.pinned) await msg.unpin();
        } catch {}
      }

      const st = stickyNotices.get(channel.id);
      if (st && st.lastMsgId === msgId) stickyNotices.set(channel.id, { ...st, style, title, content, lastPostAt: Date.now() });

      return i.editReply("✏️ 공지를 수정했어요!");
    }

    // /ari (아리)
    if (i.commandName === "ari" || i.commandName === "아리") {
      const sub = i.options.getSubcommand(true);

      if (sub === "make" || sub === "만들기") {
        const title = i.options.getString("content", true);
        const max   = i.options.getInteger("max", true);

        const room = {
          channelId: i.channel.id, hostId: i.user.id,
          title, max,
          participants: [], waitlist: [],
          closed: false, closedBy: null, closedAt: null,
          messageId: null,
        };
        const ui  = buildUI(room);
        const msg = await i.channel.send({ embeds: [ui.embed], components: [ui.row] });
        room.messageId = msg.id;
        saveRooms(); rooms.set(msg.id, room);
        return i.editReply(`✅ 모집글 생성 완료! (ID: ${msg.id})`);
      }

      if (sub === "edit" || sub === "수정") {
        let targetId = null, room = null;
        const msgArg = i.options.getString("message");
        if (msgArg) {
          const m = msgArg.match(/\d{17,20}$/); if (m) targetId = m[0];
          if (targetId && rooms.has(targetId)) room = rooms.get(targetId);
        } else {
          for (const [mid, r] of Array.from(rooms).reverse()) {
            if (r.channelId === i.channel.id && r.hostId === i.user.id && !r.closed) { targetId = mid; room = r; break; }
          }
        }
        if (!room || !targetId) return i.editReply("수정할 모집글을 찾지 못했어요.");

        const newText = i.options.getString("content") ?? null;
        const newMax  = i.options.getInteger("max") ?? null;

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
        const ui = buildUI(room);
        await msg.edit({ embeds: [ui.embed], components: [ui.row] });
        saveRooms();
        return i.editReply("✅ 수정 완료!");
      }

      if (sub === "status" || sub === "현황") {
        const myRooms = [...rooms.values()].filter(r => r.hostId === i.user.id);
        if (!myRooms.length) return i.editReply("🔍 생성한 모집글이 없습니다.");
        const info = myRooms.map(r => `- **${r.title}**: ${r.participants.length}/${r.max}명`).join("\n");
        return i.editReply(`📊 내 모집글 현황:\n${info}`);
      }

      if (sub === "delete" || sub === "삭제") {
        let deleted = 0;
        for (const [mid, room] of [...rooms]) {
          if (room.hostId === i.user.id) {
            try {
              const ch = await client.channels.fetch(room.channelId);
              const msg = await ch.messages.fetch(mid);
              await msg.delete();
              rooms.delete(mid);
              deleted++;
            } catch {}
          }
        }
        saveRooms();
        return i.editReply(`🗑️ ${deleted}개의 모집글을 삭제했습니다.`);
      }

      if (sub === "ping" || sub === "핑") {
        const msgId = i.options.getString("message", true);
        let room = rooms.get(msgId);
        if (!room) { loadRooms(); room = rooms.get(msgId); }
        if (!room) return i.editReply("❌ 해당 모집글을 찾을 수 없습니다.");
        const mentions = room.participants.map(id => `<@${id}>`).join(" ");
        await i.channel.send(`📣 **[${room.title}]** 참가자 호출: ${mentions}`);
        return i.editReply("✅ 멘션 전송 완료!");
      }

      if (sub === "copy" || sub === "복사") {
        const msgId = i.options.getString("message", true);
        let room = rooms.get(msgId);
        if (!room) { loadRooms(); room = rooms.get(msgId); }
        if (!room) return i.editReply("❌ 해당 모집글을 찾을 수 없습니다.");

        const newRoom = {
          channelId: room.channelId, hostId: i.user.id,
          title: room.title, max: room.max,
          participants: [], waitlist: [],
          closed: false, closedBy: null, closedAt: null,
          messageId: null,
        };
        const ui = buildUI(newRoom);
        const msg = await i.channel.send({ embeds: [ui.embed], components: [ui.row] });
        newRoom.messageId = msg.id;
        rooms.set(msg.id, newRoom);
        saveRooms();
        return i.editReply(`✅ 모집글 복사 완료! 새 ID: \`${msg.id}\``);
      }

      return i.editReply(`지원하지 않는 서브커맨드: ${sub}`);
    }

    return i.editReply("이 명령은 아직 구현되지 않았어요.");
  } catch (err) {
    console.error("interaction error:", err);
    try {
      if (i.deferred || i.replied) await i.editReply("오류가 났어요 ㅠㅠ");
      else await i.reply({ ephemeral: true, content: "오류가 났어요 ㅠㅠ" });
    } catch {}
  }
});

// ───────── 버튼 처리
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isButton()) return;
  try { await i.deferReply({ ephemeral: true }); } catch {}
  try {
    const [action, msgId] = i.customId.split(":");
    let room = rooms.get(msgId);
    if (!room) { loadRooms(); room = rooms.get(msgId); }
    if (!room) return i.editReply("모집글 정보를 찾을 수 없어요.");

    if (room.closed && action !== "list") return i.editReply("이미 마감된 모집이에요.");
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
      room.closed = true; room.closedBy = i.user.id; room.closedAt = Date.now();
      changed = true; await i.editReply("🔒 마감했습니다.");
    } else if (action === "list") {
      const joined  = room.participants.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n") || "없음";
      const waiting = room.waitlist.length ? `\n\n⏳ 예비자\n${room.waitlist.map((id,idx)=>`${idx+1}. <@${id}>`).join("\n")}` : "";
      await i.editReply(`**${room.title}**\n정원: ${room.participants.length}/${room.max}\n${joined}${waiting}`);
    } else {
      await i.editReply("알 수 없는 버튼이에요.");
    }

    if (changed) {
      try {
        const channel = await client.channels.fetch(room.channelId);
        const msg = await channel.messages.fetch(room.messageId);
        const ui = buildUI(room);
        await msg.edit({ embeds: [ui.embed], components: [ui.row] });
        saveRooms();
      } catch (e) { console.warn("update room view fail:", e?.message || e); }
    }
  } catch (err) {
    console.error("button error:", err);
    try { await i.editReply("버튼 처리 중 오류가 났어요 ㅠㅠ"); } catch {}
  }
});

// ───────── 스티키 끌올
const STICKY_DEBOUNCE_MS = 0; // 0 = 매 메시지마다
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
    const sent = await m.channel.send({ allowedMentions: { parse: [] }, ...buildNoticePayload(st) });
    stickyNotices.set(m.channelId, { ...st, lastMsgId: sent.id, lastPostAt: Date.now() });
  } catch (e) { console.warn("sticky bump fail:", e?.message || e); }
});

// ───────── 실행
if (!process.env.BOT_TOKEN) { console.error("❌ BOT_TOKEN 누락"); process.exit(1); }
keepAlive();
client.login(process.env.BOT_TOKEN).catch(e => console.error("login failed:", e));
