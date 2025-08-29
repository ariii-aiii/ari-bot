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
const stickyStore   = new Map();   // 스티키(팔로우) 상태: channelId -> entry
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

// ===== 공지(단일 유지) 유틸 =====

// 봇이 올린 예전 공지들을 한 번에 정리(keepId 제외)
async function sweepOnce(channel, keepId) {
  try {
    const fetched = await channel.messages.fetch({ limit: 30 });
    const bots = fetched.filter(m => m.author?.bot && m.id !== keepId);
    const targets = bots.filter(m => {
      const t = m.embeds?.[0]?.title || m.content || "";
      return /공지|📢|역할신청/i.test(t);
    });
    for (const [, m] of targets) {
      await m.delete().catch(() => {});
    }
  } catch {}
}

// content 또는 embeds/components 등 Discord 메시지 옵션을 그대로 받는 형태
async function upsertNotice(channel, payload) {
  // 이전 공지 지우고 하나만 유지
  const prev = noticeStore.get(channel.id);
  if (prev?.messageId) {
    try {
      const m = await channel.messages.fetch(prev.messageId);
      await m.delete().catch(()=>{});
    } catch {}
  }
  const sent = await channel.send(payload);
  noticeStore.set(channel.id, { messageId: sent.id, payload });
  // 과거 공지 싹 정리
  await sweepOnce(channel, sent.id);
  return sent;
}

async function editNotice(channel, newPayload) {
  const saved = noticeStore.get(channel.id);
  if (saved?.messageId) {
    try {
      const m = await channel.messages.fetch(saved.messageId);
      await m.edit(newPayload);
      noticeStore.set(channel.id, { messageId: m.id, payload: newPayload });
      await sweepOnce(channel, m.id);
      return m;
    } catch {
      // 기존 메시지가 없으면 새로 생성
      return upsertNotice(channel, newPayload);
    }
  } else {
    return upsertNotice(channel, newPayload);
  }
}

async function deleteNotice(channel) {
  const saved = noticeStore.get(channel.id);
  if (saved?.messageId) {
    try {
      const m = await channel.messages.fetch(saved.messageId);
      await m.delete().catch(()=>{});
    } catch {}
  }
  noticeStore.delete(channel.id);
}

// ===== 스티키(팔로우 모드) =====
function sanitizeEmbed(baseEmbed) {
  const e = EmbedBuilder.from(baseEmbed);
  e.setFooter(null);
  e.setTimestamp(null);
  return e;
}

async function refreshSticky(channel, entry) {
  if (!entry) return;
  if (entry._lock) return;

  const now = Date.now();
  const cooldown = entry.cooldownMs ?? 2000;
  if (entry._lastMove && (now - entry._lastMove) < cooldown) return;

  entry._lock = true;
  try {
    if (entry.mode === "follow") {
      // follow는 항상 맨 아래로 재전송
      if (entry.messageId) {
        try {
          const old = await channel.messages.fetch(entry.messageId);
          await old.delete().catch(() => {});
        } catch {}
      }
      const payload = entry.payload || { embeds: [sanitizeEmbed(entry.embed)] };
      const sent = await channel.send(payload);
      entry.messageId = sent.id;
      entry._lastMove = Date.now();
      await sweepOnce(channel, sent.id);
      return;
    }

    // 고정형(편집) 모드
    if (entry.messageId) {
      try {
        const msg = await channel.messages.fetch(entry.messageId);
        const payload = entry.payload || { embeds: [sanitizeEmbed(entry.embed)] };
        await msg.edit(payload);
        entry._lastMove = Date.now();
        await sweepOnce(channel, msg.id);
        return;
      } catch {}
    }

    const payload = entry.payload || { embeds: [sanitizeEmbed(entry.embed)] };
    const sent = await channel.send(payload);
    entry.messageId = sent.id;
    entry._lastMove = Date.now();
    await sweepOnce(channel, sent.id);

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

// ===== 커맨드 로딩 =====
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

// ===== 인터랙션 =====
client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;

      // 명령어에서 바로 쓸 수 있게 유틸 주입
      i._ari = {
        // 공지: 단일 유지 보장(여기만 쓰면 중복 안 생김)
        notice: {
          upsert: upsertNotice,   // await i._ari.notice.upsert(i.channel, payload)
          edit:   editNotice,     // await i._ari.notice.edit(i.channel, payload)
          del:    deleteNotice,   // await i._ari.notice.del(i.channel)
          store:  noticeStore
        },
        // 스티키
        stickyStore,
        refreshSticky,
        // 모집
        recruitStates, rowFor, buildRecruitEmbed, canClose,
        // 기타
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

// ===== READY / 로그인 =====
client.once(Events.ClientReady, (c) => {
  console.log(`[READY] AriBot logged in as ${c.user.tag}`);
});
client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});
