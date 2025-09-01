// src/index.js
require('dotenv').config();
require('../server');
require('./boot-check');

const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Collection,
  MessageFlags, // ✅ 에페메럴 경고 제거용
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,   // ✅ 음성채널 감지
  ]
});

// ===== 상태 저장소 =====
const recruitStates = new Map();   // 모집 상태 (messageId -> state)
const stickyStore   = new Map();   // 스티키(팔로우) 상태: channelId -> entry
const noticeStore   = new Map();   // 공지 단일 유지: channelId -> { messageId, payload }

// ===== 공통 유틸 =====
async function safeReply(i, payload) {
  // deprecated인 ephemeral:true 대신 flags로 안내
  if (payload && payload.ephemeral) {
    payload.flags = MessageFlags.Ephemeral;
    delete payload.ephemeral;
  }
  if (i.replied || i.deferred) return i.followUp(payload);
  return i.reply(payload);
}
function canClose(i) {
  const ids = (process.env.CLOSE_ROLE_IDS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!i.inGuild()) return false;
  if (ids.length === 0) return true;
  return i.member?.roles?.cache?.some(r => ids.includes(r.id));
}
function rowFor(messageId, isClosed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join:${messageId}`).setLabel("참가").setStyle(ButtonStyle.Success).setDisabled(isClosed),
    new ButtonBuilder()
      .setCustomId(`leave:${messageId}`)
      .setLabel("취소")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isClosed), // 🔒 마감 시 취소 버튼도 비활성화
    new ButtonBuilder().setCustomId(`list:${messageId}`).setLabel("목록").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${isClosed ? "open" : "close"}:${messageId}`)
      .setLabel(isClosed ? "재오픈" : "마감")
      .setStyle(isClosed ? ButtonStyle.Secondary : ButtonStyle.Danger)
  );
}
function buildRecruitEmbed(st) {
  const lock  = st.isClosed ? "🔒 " : "";
  const title = `${lock}${st.title} - 정원 ${st.cap}명`;
  const memberArr = [...(st.members || new Set())];
  const lines = memberArr.map((uid, i) => `${i + 1}. <@${uid}>`);
  let desc = `현재 인원: **${memberArr.length}/${st.cap}**`;
  if (lines.length) desc += `\n\n${lines.join("\n")}`;
  const waitArr = [...(st.waitlist || new Set())];
  if (waitArr.length) {
    const wlines = waitArr.map((uid, i) => `${i + 1}. <@${uid}>`);
    desc += `\n\n**예비자 (${waitArr.length})**\n\n${wlines.join("\n")}`;
  }
  if (st.isClosed) {
    const when = new Date(st.closedAt || Date.now()).toLocaleString("ko-KR", { hour12: false });
    desc += `\n\n🔒 **마감됨 – 마감자:** <@${st.closedBy || st.hostId}>  ${when}`;
  }
  const colorHex = (process.env.NOTICE_COLOR || "#CDC1FF").replace('#','');
  const colorInt = parseInt(colorHex, 16);
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(isNaN(colorInt) ? 0xCDC1FF : colorInt);
}

/* ------------------------------------------------------------------ */
/*                           공지(단일 유지)                           */
/* ------------------------------------------------------------------ */

// TAG 구분형 청소: 같은 TAG만 지움
async function sweepOnce(channel, keepId, tag) {
  try {
    const fetched = await channel.messages.fetch({ limit: 30 });
    for (const [, m] of fetched) {
      if (!m.author?.bot) continue;
      if (m.id === keepId) continue;
      const ft = m.embeds?.[0]?.footer?.text || "";
      if (ft.includes(`TAG:${tag}`)) {
        await m.delete().catch(() => {});
      }
    }
  } catch {}
}

// payload(embeds[0])에 TAG:NOTICE 푸터 주입
function ensureNoticeTag(payload) {
  if (payload?.embeds?.length) {
    const e = EmbedBuilder.from(payload.embeds[0]);
    const base = e.data.footer?.text || "";
    if (!base.includes("TAG:NOTICE")) {
      e.setFooter({ text: `${base ? base + " · " : ""}TAG:NOTICE` });
    }
    return { ...payload, embeds: [e] };
  }
  return payload; // 텍스트만 보낼 경우는 태그 미적용(임베드 권장)
}

async function upsertNotice(channel, payload) {
  payload = ensureNoticeTag(payload);
  const prev = noticeStore.get(channel.id);
  if (prev?.messageId) {
    try { const m = await channel.messages.fetch(prev.messageId); await m.delete().catch(()=>{}); } catch {}
  }
  const sent = await channel.send(payload);
  noticeStore.set(channel.id, { messageId: sent.id, payload });
  await sweepOnce(channel, sent.id, "NOTICE");
  return sent;
}

async function editNotice(channel, newPayload) {
  newPayload = ensureNoticeTag(newPayload);
  const saved = noticeStore.get(channel.id);
  if (saved?.messageId) {
    try {
      const m = await channel.messages.fetch(saved.messageId);
      await m.edit(newPayload);
      noticeStore.set(channel.id, { messageId: m.id, payload: newPayload });
      await sweepOnce(channel, m.id, "NOTICE");
      return m;
    } catch {
      return upsertNotice(channel, newPayload);
    }
  } else {
    return upsertNotice(channel, newPayload);
  }
}

async function deleteNotice(channel) {
  const saved = noticeStore.get(channel.id);
  if (saved?.messageId) {
    try { const m = await channel.messages.fetch(saved.messageId); await m.delete().catch(()=>{}); } catch {}
  }
  noticeStore.delete(channel.id);
}

/* ------------------------------------------------------------------ */
/*                             스티키(팔로우)                           */
/* ------------------------------------------------------------------ */

function sanitizeEmbed(baseEmbed) {
  const e = EmbedBuilder.from(baseEmbed);
  e.setFooter(null);
  e.setTimestamp(null);
  return e;
}

// entry.payload/embed 에 TAG:STICKY 푸터 주입
function tagStickyPayload(entry) {
  if (entry?.payload?.embeds?.length) {
    const e = EmbedBuilder.from(entry.payload.embeds[0]);
    const base = e.data.footer?.text || "";
    if (!base.includes("TAG:STICKY")) {
      e.setFooter({ text: `${base ? base + " · " : ""}TAG:STICKY` });
    }
    return { ...entry.payload, embeds: [e] };
  }
  if (entry?.embed) {
    const e = sanitizeEmbed(entry.embed);
    const base = e.data.footer?.text || "";
    if (!base.includes("TAG:STICKY")) {
      e.setFooter({ text: `${base ? base + " · " : ""}TAG:STICKY` });
    }
    return { embeds: [e] };
  }
  return entry?.payload || {};
}

/* ✅ 최근 공지 찾아서 스티키 payload 자동 생성 */
async function findLatestNoticePayload(channel) {
  try {
    const fetched = await channel.messages.fetch({ limit: 30 });
    for (const [, m] of fetched) {
      if (!m.author?.bot) continue;
      const emb = m.embeds?.[0];
      const title = emb?.title || "";
      const footer = emb?.footer?.text || "";
      const isNotice = footer.includes("TAG:NOTICE") || /공지|역할신청|📢/i.test(title);
      if (isNotice) {
        const e = EmbedBuilder.from(emb || new EmbedBuilder());
        const base = e.data.footer?.text || "";
        if (!base.includes("TAG:STICKY")) {
          e.setFooter({ text: `${base ? base + " · " : ""}TAG:STICKY` });
        }
        return { embeds: [e] };
      }
    }
  } catch {}
  return null;
}

/* ✅ 스티키 엔트리 없으면 최근 공지로 자동 켜기 */
async function ensureStickyIfMissing(channel) {
  if (stickyStore.has(channel.id)) return;
  const payload = await findLatestNoticePayload(channel);
  if (!payload) return;

  const entry = {
    enabled   : true,
    mode      : "follow",
    payload,
    cooldownMs: 1500,
    messageId : null,
    _lock     : false,
    _lastMove : 0
  };
  stickyStore.set(channel.id, entry);
  await refreshSticky(channel, entry);
}

async function refreshSticky(channel, entry) {
  if (!entry) return;
  if (entry._lock) return;

  const now = Date.now();
  const cooldown = entry.cooldownMs ?? 2000;
  if (entry._lastMove && (now - entry._lastMove) < cooldown) return;

  entry._lock = true;
  try {
    const payload = tagStickyPayload(entry);

    if (entry.mode === "follow") {
      if (entry.messageId) {
        try { const old = await channel.messages.fetch(entry.messageId); await old.delete().catch(()=>{}); } catch {}
      }
      const sent = await channel.send(payload);
      entry.messageId = sent.id;
      entry._lastMove = Date.now();
      await sweepOnce(channel, sent.id, "STICKY");
      return;
    }

    if (entry.messageId) {
      try {
        const msg = await channel.messages.fetch(entry.messageId);
        await msg.edit(payload);
        entry._lastMove = Date.now();
        await sweepOnce(channel, msg.id, "STICKY");
        return;
      } catch {}
    }

    const sent = await channel.send(payload);
    entry.messageId = sent.id;
    entry._lastMove = Date.now();
    await sweepOnce(channel, sent.id, "STICKY");

  } catch (e) {
    console.error("sticky refresh error:", e?.message || e);
  } finally {
    entry._lock = false;
  }
}

// ===== 메시지 이벤트(팔로우 스티키) =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.inGuild()) return;
  await ensureStickyIfMissing(msg.channel);
  const entry = stickyStore.get(msg.channelId);
  if (entry?.enabled && entry.mode === "follow") {
    try {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      entry.debounceTimer = setTimeout(() => refreshSticky(msg.channel, entry), 1200);
    } catch (e) {
      console.error("[sticky debounce error]", e?.message || e);
    }
  }
});

/* ------------------------------------------------------------------ */
/*                           커맨드 로딩/주입                           */
/* ------------------------------------------------------------------ */

client.commands = new Collection();
try {
  const commandsPath = path.join(__dirname, "..", "commands");
  if (fs.existsSync(commandsPath)) {
    for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"))) {
      const cmd = require(path.join(commandsPath, file));
      if (cmd?.data?.name && typeof cmd?.execute === "function") {
        client.commands.set(cmd.data.name, cmd);
      }
    }
  }
} catch (e) {
  console.error("[commands load error]", e?.message || e);
}

/* ------------------------------------------------------------------ */
/*                     상호작용(버튼 + 슬래시) 라우팅                   */
/* ------------------------------------------------------------------ */

client.on(Events.InteractionCreate, async (i) => {
  try {
    /* --------- 🔘 버튼 먼저 처리 --------- */
    if (i.isButton()) {
      // customId: "join:<msgId>" | "leave:<msgId>" | "list:<msgId>" | "close:<msgId>" | "open:<msgId>"
      const m = i.customId.match(/^(join|leave|list|close|open):(.+)$/);
      if (!m) return;

      const action = m[1];
      let msgId = m[2];

      // 등록 직후 'temp'일 수 있으니 실제 메시지 ID로 교체
      if (msgId === 'temp') msgId = i.message.id;

      // 디버그
      console.log('[BTN]', i.customId, '→ using msgId:', msgId);

      // 3초 타임아웃 방지
      await i.deferUpdate();

      // 상태 확보: 없으면 임베드로부터 복구
      if (!recruitStates.has(msgId)) {
        const emb = i.message.embeds?.[0];
        let cap = 16, isClosed = false, title = "모집";
        if (emb?.title) {
          const t = emb.title;
          isClosed = t.trim().startsWith("🔒");
          const mCap = t.match(/정원\s+(\d+)/);
          if (mCap) cap = parseInt(mCap[1], 10);
          title = t.replace(/^🔒\s*/, "").replace(/\s*-\s*정원.*$/, "").trim() || "모집";
        }
        const members = new Set();
        const desc = emb?.description || "";
        for (const mm of desc.matchAll(/^\s*\d+\.\s*<@(\d+)>/gm)) members.add(mm[1]);
        recruitStates.set(msgId, { cap, title, members, waitlist: new Set(), isClosed, hostId: i.user.id });
      }

      const st = recruitStates.get(msgId);

      // 액션 처리
      if (action === "join") {
        if (st.isClosed) {
          await i.followUp({ content: "🔒 이미 마감된 모집이에요.", flags: MessageFlags.Ephemeral });
        } else if (st.members.has(i.user.id) || st.waitlist.has(i.user.id)) {
          await i.followUp({ content: "이미 참가/대기열에 있어요.", flags: MessageFlags.Ephemeral });
        } else if (st.members.size < st.cap) {
          st.members.add(i.user.id);
        } else {
          st.waitlist.add(i.user.id);
          await i.followUp({ content: "정원이 가득이라 **대기열**에 올렸어요.", flags: MessageFlags.Ephemeral });
        }
      }

      if (action === "leave") {
        // 🔒 마감 상태면 취소 불가
        if (st.isClosed) {
          await i.followUp({ content: "❌ 마감된 모집은 취소할 수 없어요!", flags: MessageFlags.Ephemeral });
        } else if (!st.members.has(i.user.id)) {
          await i.followUp({ content: "❌ 참가자가 아니라서 취소할 수 없어요!", flags: MessageFlags.Ephemeral });
        } else {
          st.members.delete(i.user.id);
          // 대기열 승급
          const next = [...st.waitlist][0];
          if (next) { st.waitlist.delete(next); st.members.add(next); }
        }
      }

      if (action === "list") {
        const list = [...st.members].map((u, n) => `${n + 1}. <@${u}>`).join("\n") || "아무도 없음";
        const wait = [...st.waitlist].map((u, n) => `${n + 1}. <@${u}>`).join("\n");
        await i.followUp({
          content: `현재 인원 (${st.members.size}/${st.cap})\n${list}` + (wait ? `\n\n예비자\n${wait}` : ""),
          flags: MessageFlags.Ephemeral
        });
      }

      if (action === "close" || action === "open") {
        if (!canClose(i)) {
          await i.followUp({ content: "⛔ 마감/재오픈 권한이 없어요.", flags: MessageFlags.Ephemeral });
        } else {
          st.isClosed = (action === "close");
          if (st.isClosed) {
            st.closedBy = i.user.id;
            st.closedAt = Date.now();
          } else {
            delete st.closedBy;
            delete st.closedAt;
          }
        }
      }

      // 원본 메시지 업데이트
      const embed = buildRecruitEmbed(st);
      await i.message.edit({ embeds: [embed], components: [rowFor(msgId, st.isClosed)] });
      return; // 버튼 처리 끝
    }

    /* --------- 💬 슬래시 커맨드 --------- */
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;

      // ✅ 선(先) deferReply로 타임아웃 방지 (에페메럴)
      if (!i.deferred && !i.replied) {
        try { await i.deferReply({ ephemeral: true }); } catch {}
      }

      // ✅ 에페메럴 호환 래퍼 (reply → followUp 변환 시 flags로 교체)
const _origReply = i.reply?.bind(i);
i.reply = (payload = {}) => {
  if (payload && payload.ephemeral) {
    payload = { ...payload, flags: MessageFlags.Ephemeral };
    delete payload.ephemeral;
  }
  return i.followUp(payload);
};

      i.safeReply = (payload) => safeReply(i, payload);

      // 유틸 주입
      i._ari = {
        notice: { upsert: upsertNotice, edit: editNotice, del: deleteNotice, store: noticeStore },
        stickyStore,
        refreshSticky,
        recruitStates,
        rowFor,
        buildRecruitEmbed,
        canClose,
        sweepOnce
      };

      try {
        await command.execute(i);
        // ✅ 커맨드가 아무 메시지도 안 보냈다면 기본 완료 메시지
        if (i.deferred && !i.replied) {
          await i.editReply("✅ 처리 완료");
        }
      } catch (err) {
        console.error("[command error]", err);
        try {
          if (i.deferred && !i.replied) {
            await i.editReply("⚠️ 처리 중 오류가 발생했어요.");
          } else if (!i.replied) {
            await i.followUp({ content: "⚠️ 처리 중 오류가 발생했어요.", flags: MessageFlags.Ephemeral });
          }
        } catch {}
      }
      return;
    }
  } catch (err) {
    console.error("[interaction error]", err);
    try {
      if (i.deferred && !i.replied) {
        await i.followUp({ content: "⚠️ 처리 중 오류가 났어요.", flags: MessageFlags.Ephemeral });
      } else if (!i.replied) {
        await i.reply({ content: "⚠️ 처리 중 오류가 났어요.", flags: MessageFlags.Ephemeral });
      }
    } catch {}
  }
});

/* ------------------------------------------------------------------ */
/*                              READY / 로그인                         */
/* ------------------------------------------------------------------ */

client.once(Events.ClientReady, (c) => {
  console.log(`[READY] AriBot logged in as ${c.user.tag}`);
});
client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});
