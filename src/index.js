// src/index.js — AriBot (모집 + 공지/스티키 + 공지수정) — 단일 파일 버전 (웹후크/유틸 분리 없음)
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

// ─────────────────────────────────────────────
// 설정/상수
// ─────────────────────────────────────────────
const DEBUG = process.env.DEBUG === "true";
const ROOMS_PATH = path.join(__dirname, "rooms.json");
const CLOSE_ROLE_IDS = ["1276555695390457929", "1403607361360236575"]; // 마감 버튼 누를 수 있는 역할
const MAX_SHOW_HARD = 120;         // 참석자 embed 표시에 제한
const STICKY_DEBOUNCE_MS = 0;      // 0이면 새 메시지 올 때마다 즉시 끌올

// ─────────────────────────────────────────────
// 공통 유틸
// ─────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

// 줄바꿈 처리: "\n", "\\n", "<br>"
const normalize = (text) =>
  (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n");

// 공지 payload (웹후크 X, 봇 계정으로 전송/수정)
function buildNoticePayload({ style, title, content }) {
  title = title || "";
  content = content || "";

  if (style === "embed-purple") {
    return {
      content: null,
      embeds: [new EmbedBuilder().setColor(0xCDC1FF).setTitle(title || null).setDescription(content)],
    };
  }
  if (style === "embed-blue") {
    return {
      content: null,
      embeds: [new EmbedBuilder().setColor(0x2b6cff).setTitle(title || null).setDescription(content)],
    };
  }
  if (style === "embed-min") {
    return {
      content: null,
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle(title || null).setDescription(content)],
    };
  }
  if (style === "code") {
    const body = title ? `**${title}**\n\`\`\`\n${content}\n\`\`\`` : `\`\`\`\n${content}\n\`\`\``;
    return { content: body, embeds: [] };
  }
  // plain(노멀)
  return { content: title ? `**${title}**\n${content}` : content, embeds: [] };
}

// 권한 체크(마감 버튼)
function canClose(i) {
  if (!i.inGuild()) return false;
  if (i.guild?.ownerId && i.user?.id === i.guild.ownerId) return true;
  if (i.member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roles = i.member?.roles?.cache;
  return roles?.some((r) => CLOSE_ROLE_IDS.includes(r.id)) ?? false;
}

// ─────────────────────────────────────────────
// 상태(메모리) + rooms 저장/로드
// ─────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const rooms = new Map();         // messageId -> room
const stickyNotices = new Map(); // channelId -> { style,title,content,pin,expiresAt,lastMsgId,lastPostAt }

function saveRooms() {
  try {
    const plain = Object.fromEntries(rooms);
    fs.writeFileSync(ROOMS_PATH, JSON.stringify(plain, null, 2), "utf8");
    if (DEBUG) console.log("[rooms] saved:", rooms.size);
  } catch (e) {
    console.warn("[rooms] save failed:", e?.message || e);
  }
}
function loadRooms() {
  try {
    if (!fs.existsSync(ROOMS_PATH)) return;
    const data = JSON.parse(fs.readFileSync(ROOMS_PATH, "utf8"));
    rooms.clear();
    for (const [mid, r] of Object.entries(data)) rooms.set(mid, r);
    console.log("📦 rooms loaded:", rooms.size);
  } catch (e) {
    console.warn("[rooms] load failed:", e?.message || e);
  }
}

// 모집 UI
const removeFrom = (arr, id) => {
  const k = arr.indexOf(id);
  if (k >= 0) {
    arr.splice(k, 1);
    return true;
  }
  return false;
};
const promoteFromWaitlist = (room) => {
  while (room.participants.length < room.max && room.waitlist.length) {
    room.participants.push(room.waitlist.shift());
  }
};

function buildUI(room) {
  const countLine = `현재 인원: **${room.participants.length}/${room.max}**`;
  const showCount = Math.min(room.max, MAX_SHOW_HARD);
  const joinedList = room.participants.slice(0, showCount);
  const overflow = room.participants.slice(showCount);
  const waitAll = [...overflow, ...room.waitlist];

  const joined = joinedList.length
    ? joinedList.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n")
    : "아직 없음";

  const waiting = waitAll.length
    ? `\n\n⏳ **예비자 (${waitAll.length})**\n${waitAll
        .map((id, idx) => `${idx + 1}. <@${id}>`)
        .join("\n")}`
    : "";

  const statusLine =
    room.closed && room.closedBy
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
    new ButtonBuilder().setCustomId(makeId("close")).setLabel("마감").setStyle(ButtonStyle.Danger).setDisabled(room.closed)
  );
  return { embed, row };
}

// ─────────────────────────────────────────────
// ready
// ─────────────────────────────────────────────
client.once(Events.ClientReady, (c) => {
  console.log("✅ READY as", c.user.tag);
  try {
    c.user.setActivity("아리 모집 + 공지봇");
  } catch {}
  loadRooms();
});

// ─────────────────────────────────────────────
// 슬래시 명령 처리(모두 이 파일에 구현)
// (/notice, /notice-edit, /ari [...])
// ─────────────────────────────────────────────
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;

  // ── 공지 보내기 (/notice)
  if (i.commandName === "notice") {
    try {
      const channel = i.options.getChannel("channel") || i.channel;
      if (channel?.type !== ChannelType.GuildText)
        return i.reply({ ephemeral: true, content: "텍스트 채널에서만 보낼 수 있어요." });

      const style = i.options.getString("style") || "embed-purple";
      const title = normalize(i.options.getString("title") || "");
      const content = normalize(i.options.getString("content", true));
      const pin = i.options.getBoolean("pin") || false;

      const sticky = i.options.getBoolean("sticky") || false;
      const holdMin = i.options.getInteger("hold") || 0; // 0=무한
      const editSticky = i.options.getBoolean("edit") || false;

      await i.deferReply({ ephemeral: true });

      const prev = stickyNotices.get(channel.id);

      // 수정 모드: 기존 스티키 메시지 편집
      if (sticky && editSticky && prev?.lastMsgId) {
        const payload = buildNoticePayload({ style, title, content });
        const msg = await channel.messages.fetch(prev.lastMsgId);
        await msg.edit(payload);
        if (typeof pin === "boolean") {
          try {
            if (pin && !msg.pinned) await msg.pin();
            if (!pin && msg.pinned) await msg.unpin();
          } catch {}
        }
        stickyNotices.set(channel.id, {
          style,
          title,
          content,
          pin,
          lastMsgId: msg.id,
          lastPostAt: Date.now(),
          expiresAt: holdMin > 0 ? Date.now() + holdMin * 60 * 1000 : null,
        });
        return i.editReply(`✏️ 스티키 공지를 수정했어요${holdMin > 0 ? ` • 유지 ${holdMin}분` : " • 무기한"}.`);
      }

      // 스티키 재설정: 예전 스티키 삭제 후 새로 보냄
      if (sticky && prev?.lastMsgId) {
        const old = await channel.messages.fetch(prev.lastMsgId).catch(() => null);
        if (old) await old.delete().catch(() => {});
      }

      const payload = buildNoticePayload({ style, title, content });
      const sent = await channel.send({ allowedMentions: { parse: [] }, ...payload });
      if (pin) {
        try {
          await sent.pin();
        } catch {}
      }

      if (sticky) {
        stickyNotices.set(channel.id, {
          style,
          title,
          content,
          pin,
          lastMsgId: sent.id,
          lastPostAt: Date.now(),
          expiresAt: holdMin > 0 ? Date.now() + holdMin * 60 * 1000 : null,
        });
      } else {
        stickyNotices.delete(channel.id);
      }

      return i.editReply(
        `✅ 공지를 ${channel}에 보냈어요${pin ? " (핀 유지)" : ""}${
          sticky ? (holdMin > 0 ? ` • 스티키 ${holdMin}분` : " • 스티키(무기한)") : ""
        }.`
      );
    } catch (err) {
      console.error("Interaction(notice) error:", err);
      if (i.deferred || i.replied)
        return i.followUp({ content: "공지 중 오류가 났어요 ㅠㅠ", ephemeral: true }).catch(() => {});
      return i.reply({ content: "공지 중 오류가 났어요 ㅠㅠ", ephemeral: true }).catch(() => {});
    }
  }

  // ── 공지 수정 (/notice-edit)
  if (i.commandName === "notice-edit") {
    try {
      const channel = i.options.getChannel("channel") || i.channel;

      const msgId =
        i.options.getString("message") ||
        stickyNotices.get(channel.id)?.lastMsgId;

      if (!msgId)
        return i.reply({
          ephemeral: true,
          content: "수정할 메시지를 못 찾았어요. (메시지 ID를 주거나, 채널에 스티키가 있어야 해요)",
        });

      const style = i.options.getString("style") || "embed-purple";
      const title = normalize(i.options.getString("title") || "");
      const content = normalize(i.options.getString("content", true));
      const pin = i.options.getBoolean("pin");

      await i.deferReply({ ephemeral: true });

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
      if (st && st.lastMsgId === msgId) {
        stickyNotices.set(channel.id, {
          ...st,
          style,
          title,
          content,
          pin,
          lastPostAt: Date.now(),
        });
      }

      return i.editReply("✏️ 공지를 수정했어요!");
    } catch (e) {
      console.error("[notice-edit] fail:", e);
      if (i.deferred || i.replied)
        return i.followUp({ content: "수정 중 오류가 났어요 ㅠㅠ", ephemeral: true }).catch(() => {});
      return i.reply({ content: "수정 중 오류가 났어요 ㅠㅠ", ephemeral: true }).catch(() => {});
    }
  }

  // ── 모집 (/ari ...)
  if (i.commandName === "ari") {
    const sub = i.options.getSubcommand(false);
    try {
      // 만들기
      if (sub === "create" || sub == null) {
        await i.deferReply({ ephemeral: true });
        const title = i.options.getString("content", true);
        const max = i.options.getInteger("max", true);

        const room = {
          channelId: i.channel.id,
          hostId: i.user.id,
          title,
          max,
          participants: [],
          waitlist: [],
          closed: false,
          closedBy: null,
          closedAt: null,
          messageId: null,
        };

        const ui1 = buildUI(room);
        const msg = await i.channel.send({ embeds: [ui1.embed], components: [ui1.row] });
        room.messageId = msg.id;

        const ui2 = buildUI(room);
        await msg.edit({ embeds: [ui2.embed], components: [ui2.row] });

        rooms.set(msg.id, room);
        saveRooms();

        const link = `https://discord.com/channels/${i.guildId}/${i.channelId}/${msg.id}`;
        return i.editReply(`✅ 모집글 생성 완료!\n🆔 \`${msg.id}\`\n🔗 ${link}`);
      }

      // 수정
      if (sub === "edit") {
        await i.deferReply({ ephemeral: true });
        const msgArg = i.options.getString("message");
        const newText = i.options.getString("content") ?? null;
        const newMax = i.options.getInteger("max") ?? null;
        if (newText === null && newMax === null)
          return i.editReply("수정할 값이 없어요! 내용/정원 중 하나는 넣어줘요.");

        let targetId = null,
          room = null;
        if (msgArg) {
          const m = msgArg.match(/\d{17,20}$/);
          if (m) targetId = m[0];
          if (targetId && rooms.has(targetId)) room = rooms.get(targetId);
        } else {
          // 내 최신 열린 모집글
          for (const [mid, r] of Array.from(rooms).reverse()) {
            if (r.channelId === i.channel.id && r.hostId === i.user.id && !r.closed) {
              targetId = mid;
              room = r;
              break;
            }
          }
        }
        if (!room || !targetId) return i.editReply("수정할 모집글을 못 찾았어요 😢 (게시물 링크/ID 입력 가능)");
        if (room.closed) return i.editReply("이미 마감된 모집은 수정할 수 없어요.");

        if (newText !== null) room.title = newText;
        if (newMax !== null) {
          if (newMax > room.max) {
            room.max = newMax;
            promoteFromWaitlist(room);
          } else if (newMax < room.max) {
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

      // 현황
      if (sub === "status") {
        await i.deferReply({ ephemeral: true });
        const myRooms = [...rooms.values()].filter((r) => r.hostId === i.user.id);
        if (!myRooms.length) return i.editReply("🔍 생성한 모집글이 없습니다.");
        const info = myRooms.map((r) => `- **${r.title}**: ${r.participants.length}/${r.max}명`).join("\n");
        return i.editReply(`📊 내 모집글 현황:\n${info}`);
      }

      // 삭제
      if (sub === "delete") {
        await i.deferReply({ ephemeral: true });
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
        await i.deferReply({ ephemeral: true });
        const msgId = i.options.getString("message");
        let room = rooms.get(msgId);
        if (!room) {
          loadRooms();
          room = rooms.get(msgId);
        }
        if (!room) return i.editReply("❌ 해당 모집글을 찾을 수 없습니다.");
        const mentions = room.participants.map((id) => `<@${id}>`).join(" ");
        await i.channel.send(`📣 **[${room.title}]** 참가자 호출: ${mentions}`);
        return i.editReply("✅ 멘션 전송 완료!");
      }

      // 복사
      if (sub === "copy") {
        await i.deferReply({ ephemeral: true });
        const msgId = i.options.getString("message");
        let room = rooms.get(msgId);
        if (!room) {
          loadRooms();
          room = rooms.get(msgId);
        }
        if (!room) return i.editReply("❌ 해당 모집글을 찾을 수 없습니다.");

        const newRoom = {
          channelId: room.channelId,
          hostId: i.user.id,
          title: room.title,
          max: room.max,
          participants: [],
          waitlist: [],
          closed: false,
          closedBy: null,
          closedAt: null,
          messageId: null,
        };
        const ui = buildUI(newRoom);
        const msg = await i.channel.send({ embeds: [ui.embed], components: [ui.row] });
        newRoom.messageId = msg.id;
        const ui2 = buildUI(newRoom);
        await msg.edit({ embeds: [ui2.embed], components: [ui2.row] });
        rooms.set(msg.id, newRoom);
        saveRooms();
        return i.editReply(`✅ 모집글 복사 완료! 새 ID: \`${msg.id}\``);
      }

      return i.reply({ content: `지원하지 않는 서브커맨드: ${sub}`, ephemeral: true });
    } catch (err) {
      console.error("Interaction(ari) error:", err);
      if (i.deferred || i.replied) return i.followUp({ content: "오류가 났어요 ㅠㅠ", ephemeral: true }).catch(() => {});
      return i.reply({ content: "오류가 났어요 ㅠㅠ", ephemeral: true }).catch(() => {});
    }
  }
});

// ─────────────────────────────────────────────
// 버튼 처리(참가/취소/목록/마감)
// ─────────────────────────────────────────────
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isButton()) return;
  try {
    if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });
  } catch {}

  try {
    const [action, msgId] = i.customId.split(":");
    if (!msgId) {
      if (!i.replied) await i.editReply("잘못된 버튼이에요.");
      return;
    }

    let room = rooms.get(msgId);
    if (!room) {
      if (DEBUG) console.log("[button] room miss → reload");
      loadRooms();
      room = rooms.get(msgId);
    }
    if (!room) {
      await i.editReply("이 모집글 정보를 찾을 수 없어요. (봇 재시작 등으로 초기화됨)");
      return;
    }

    if (room.closed && action !== "list") {
      await i.editReply("이미 마감된 모집이에요.");
      return;
    }

    const uid = i.user.id;
    let changed = false;

    if (action === "join") {
      if (room.participants.includes(uid) || room.waitlist.includes(uid)) {
        await i.editReply("이미 참가/예비자 목록에 있어요.");
      } else {
        if (room.participants.length < room.max) room.participants.push(uid);
        else room.waitlist.push(uid);
        changed = true;
        await i.editReply("✅ 접수 완료!");
      }
    } else if (action === "cancel") {
      if (removeFrom(room.participants, uid) || removeFrom(room.waitlist, uid)) {
        promoteFromWaitlist(room);
        changed = true;
        await i.editReply("✅ 취소 완료!");
      } else {
        await i.editReply("목록에 없어 취소할 수 없어요.");
      }
    } else if (action === "close") {
      if (!canClose(i)) {
        await i.editReply("마감 권한이 없어요.");
      } else {
        room.closed = true;
        room.closedBy = i.user.id;
        room.closedAt = Date.now();
        changed = true;
        await i.editReply("🔒 마감했습니다.");
      }
    } else if (action === "list") {
      const joined = room.participants.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n") || "없음";
      const waiting = room.waitlist.length
        ? `\n\n⏳ 예비자\n${room.waitlist.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n")}`
        : "";
      await i.editReply(`**${room.title}**\n정원: ${room.participants.length}/${room.max}\n${joined}${waiting}`);
    } else {
      await i.editReply("알 수 없는 버튼이에요.");
    }

    if (changed) {
      try {
        const channel = await client.channels.fetch(room.channelId);
        let msg = null;
        try {
          msg = await channel.messages.fetch(room.messageId);
        } catch {}
        const ui = buildUI(room);
        if (msg) await msg.edit({ embeds: [ui.embed], components: [ui.row] });
        else {
          const newMsg = await channel.send({ embeds: [ui.embed], components: [ui.row] });
          room.messageId = newMsg.id;
        }
        saveRooms();
      } catch (e) {
        console.warn("update room view fail:", e?.message || e);
      }
    }
  } catch (err) {
    console.error("Interaction(button) error:", err);
    try {
      await i.editReply("버튼 처리 중 오류가 났어요 ㅠㅠ");
    } catch {}
  }
});

// ─────────────────────────────────────────────
// 스티키 끌올
// ─────────────────────────────────────────────
client.on(Events.MessageCreate, async (m) => {
  try {
    if (m.author.bot || !m.inGuild()) return;
    const st = stickyNotices.get(m.channelId);
    if (!st) return;

    if (st.expiresAt && Date.now() > st.expiresAt) {
      if (st.lastMsgId) {
        const prev = await m.channel.messages.fetch(st.lastMsgId).catch(() => null);
        if (prev) await prev.delete().catch(() => {});
      }
      stickyNotices.delete(m.channelId);
      return;
    }

    if (STICKY_DEBOUNCE_MS && Date.now() - (st.lastPostAt || 0) < STICKY_DEBOUNCE_MS) return;

    if (st.lastMsgId) {
      const prev = await m.channel.messages.fetch(st.lastMsgId).catch(() => null);
      if (prev) await prev.delete().catch(() => {});
    }

    const payload = buildNoticePayload(st);
    const sent = await m.channel.send({ allowedMentions: { parse: [] }, ...payload });
    stickyNotices.set(m.channelId, { ...st, lastMsgId: sent.id, lastPostAt: Date.now() });
  } catch (e) {
    console.warn("[sticky bump] fail:", e?.message || e);
  }
});

// ─────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────
if (!process.env.BOT_TOKEN) {
  console.error("[AriBot] BOT_TOKEN missing! .env 확인");
  process.exit(1);
}
client.login(process.env.BOT_TOKEN).catch((e) => console.error("[AriBot] login failed:", e));
