// src/index.js
require('dotenv').config();
require('../server');
require('./boot-check');

const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Collection
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== 상태 저장소 =====
const recruitStates = new Map();   // 모집 상태
const stickyStore   = new Map();   // 스티키(팔로우) 상태: channelId -> entry({enabled, mode, payload/embed, ...})
const noticeStore   = new Map();   // 공지 단일 유지: channelId -> { messageId, payload }

// ===== 공통 유틸 =====
async function safeReply(i, payload) {
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
    new ButtonBuilder().setCustomId(`leave:${messageId}`).setLabel("취소").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`list:${messageId}`).setLabel("목록").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${isClosed ? "open" : "close"}:${messageId}`)
      .setLabel(isClosed ? "재오픈" : "마감")
      .setStyle(isClosed ? ButtonStyle.Secondary : ButtonStyle.Danger)
  );
}
function buildRecruitEmbed(st) {
  const lock  = st.isClosed ? "🔒 " : "";
  const title = `${lock}${st.title} - 정원 ${st.cap}명`;
  const memberArr = [...st.members];
  const lines = memberArr.map((uid, i) => `${i + 1}. <@${uid}>`);
  let desc = `현재 인원: **${memberArr.length}/${st.cap}**`;
  if (lines.length) desc += `\n\n${lines.join("\n")}`;
  const waitArr = [...st.waitlist];
  if (waitArr.length) {
    const wlines = waitArr.map((uid, i) => `${i + 1}. <@${uid}>`);
    desc += `\n\n**예비자 (${waitArr.length})**\n\n${wlines.join("\n")}`;
  }
  if (st.isClosed) {
    const when = new Date(st.closedAt || Date.now()).toLocaleString("ko-KR", { hour12: false });
    desc += `\n\n🔒 **마감됨 – 마감자:** <@${st.closedBy || st.hostId}>  ${when}`;
  }
  const colorHex = (process.env.NOTICE_COLOR || "#CDC1FF").replace(/^#/, "");
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
      // 항상 맨 아래로 재전송
      if (entry.messageId) {
        try { const old = await channel.messages.fetch(entry.messageId); await old.delete().catch(()=>{}); } catch {}
      }
      const sent = await channel.send(payload);
      entry.messageId = sent.id;
      entry._lastMove = Date.now();
      await sweepOnce(channel, sent.id, "STICKY"); // 스티키만 정리
      return;
    }

    // 편집형(고정)
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
  const entry = stickyStore.get(msg.channelId);
  if (entry?.enabled && entry.mode === "follow") {
    try {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      entry.debounceTimer = setTimeout(() => {
        refreshSticky(msg.channel, entry);
      }, 1200);
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

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;

      // 명령어에서 바로 사용 가능한 유틸 주입
      i._ari = {
        notice: {
          upsert: upsertNotice,
          edit:   editNotice,
          del:    deleteNotice,
          store:  noticeStore
        },
        stickyStore,
        refreshSticky,
        recruitStates,
        rowFor,
        buildRecruitEmbed,
        canClose,
        sweepOnce
      };

      await command.execute(i);
    }
  } catch (err) {
    console.error(err);
    try {
      if (i.deferred && !i.replied) await i.editReply("에러가 났어요 ㅠㅠ");
      else await safeReply(i, { content: "에러가 났어요 ㅠㅠ", ephemeral: true });
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
