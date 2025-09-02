// src/index.js
require('dotenv').config();
require('../server');
require('./boot-check');

// === 전역 에러 핸들러(꼭 넣자) ===
process.on('unhandledRejection', (e) => console.error('[UNHANDLED REJECTION]', e));
process.on('uncaughtException',  (e) => console.error('[UNCAUGHT EXCEPTION]', e));

// === 부팅 환경 체크 로그 ===
const _tk = (process.env.BOT_TOKEN || '');
console.log('[BOOT] BOT_TOKEN length =', _tk.length, _tk ? '(ok)' : '(missing)');
console.log('[BOOT] CLIENT_ID =', process.env.CLIENT_ID || '(missing)');

const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Collection,
  MessageFlags,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ]
});

// ===== 상태 저장소 =====
const recruitStates = new Map();
const stickyStore   = new Map();
const noticeStore   = new Map();

// ===== 공통 유틸 =====
async function safeReply(i, payload) {
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
    new ButtonBuilder().setCustomId(`leave:${messageId}`).setLabel("취소").setStyle(ButtonStyle.Secondary).setDisabled(isClosed),
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
function ensureNoticeTag(payload) {
  if (payload?.embeds?.length) {
    const e = EmbedBuilder.from(payload.embeds[0]);
    const base = e.data.footer?.text || "";
    if (!base.includes("TAG:NOTICE")) {
      e.setFooter({ text: `${base ? base + " · " : ""}TAG:NOTICE` });
    }
    return { ...payload, embeds: [e] };
  }
  return payload;
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
      const m = i.customId.match(/^(join|leave|list|close|open):(.+)$/);
      if (!m) return;

      const action = m[1];
      let msgId = m[2];
      if (msgId === 'temp') msgId = i.message.id;

      console.log('[BTN]', i.customId, '→ using msgId:', msgId);
      await i.deferUpdate();

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
        if (st.isClosed) {
          await i.followUp({ content: "❌ 마감된 모집은 취소할 수 없어요!", flags: MessageFlags.Ephemeral });
        } else if (!st.members.has(i.user.id)) {
          await i.followUp({ content: "❌ 참가자가 아니라서 취소할 수 없어요!", flags: MessageFlags.Ephemeral });
        } else {
          st.members.delete(i.user.id);
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

      const embed = buildRecruitEmbed(st);
      await i.message.edit({ embeds: [embed], components: [rowFor(msgId, st.isClosed)] });
      return;
    }

    /* --------- 💬 슬래시 커맨드 --------- */
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;

      // ✅ 자동 defer: 명령어가 autoDefer === false면 스킵
      if (command.autoDefer !== false && !i.deferred && !i.replied) {
        try { await i.deferReply(); } catch {}
      }

      // ✅ reply 우회(에페메럴 지원 + 상황별 처리)
const _origReply = i.reply?.bind(i);
i.reply = async (payload = {}) => {
  // ephemeral -> flags 변환
  if (payload && payload.ephemeral) {
    payload = { ...payload, flags: MessageFlags.Ephemeral };
    delete payload.ephemeral;
  }

  if (i.deferred && !i.replied) {
    // 이미 deferReply 한 상태면 editReply가 정석
    return i.editReply(payload);
  }
  if (!i.deferred && !i.replied) {
    // 처음 응답
    return _origReply ? _origReply(payload) : i.reply(payload);
  }
  // 그 외엔 followUp
  return i.followUp(payload);
};

i.safeReply = (payload) => safeReply(i, payload);


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

// 로그인 완료 감시
let readySeen = false;
client.once(Events.ClientReady, () => { readySeen = true; });
setTimeout(() => {
  if (!readySeen) {
    console.error('[WARN] Discord READY not fired within 60s. Check BOT_TOKEN/Intents/Network.');
  }
}, 60000);

// === BOT TOKEN 즉석 검증 (게이트웨이 붙기 전에 REST로 확인) ===
const { REST, Routes } = require('discord.js');

async function verifyToken() {
  const raw = process.env.BOT_TOKEN || "";
  const token = raw.trim(); // 앞뒤 공백 제거 (복붙 때 공백 들어가면 망함)
  if (!token) {
    console.error("[TOKEN] BOT_TOKEN is empty");
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);
  try {
    const me = await rest.get(Routes.user('@me'));
    console.log(`[TOKEN OK] Bot = ${me.username}#${me.discriminator} (${me.id})`);
  } catch (e) {
    console.error("[TOKEN INVALID]", e?.status, e?.code, e?.message || e);
    console.error("👉 디스코드 포털에서 새 토큰 복사해서 Render 환경변수 BOT_TOKEN에 붙여넣고 재배포하세요. 따옴표/공백 금지!");
    process.exit(1);
  }
}
verifyToken();

client.on('shardReady', (id, unavailable) => {
  console.log(`[SHARD ${id}] ready. unavailable=${!!unavailable}`);
});
client.on('shardDisconnect', (event, id) => {
  console.warn(`[SHARD ${id}] disconnect code=${event.code} wasClean=${event.wasClean}`);
});
client.on('shardError', (err, id) => {
  console.error(`[SHARD ${id}] error:`, err?.message || err);
});
client.on('error', (err) => console.error('[CLIENT ERROR]', err?.message || err));
client.on('warn', (msg) => console.warn('[CLIENT WARN]', msg));




client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});
