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
const recruitStates = new Map();
const stickyStore   = new Map();

// ===== 공통 유틸 (다른 명령어 호환용) =====
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

// ===== 스티키 핵심(한 채널 1개, 깜빡임 방지) =====
function sanitizeEmbed(baseEmbed) {
  const e = EmbedBuilder.from(baseEmbed);
  e.setFooter(null);
  e.setTimestamp(null);
  return e;
}

// ✅ 한 번 쓸어담기: 같은 채널의 봇 공지(제목에 공지/📢 포함) 중 keepId 제외하고 삭제
async function sweepOnce(channel, keepId) {
  try {
    const fetched = await channel.messages.fetch({ limit: 30 });
    const bots = fetched.filter(m => m.author?.bot && m.id !== keepId);
    const targets = bots.filter(m => {
      const t = m.embeds?.[0]?.title || "";
      return /공지|📢/.test(t);
    });
    for (const [, m] of targets) {
      await m.delete().catch(() => {});
    }
  } catch {}
}

async function refreshSticky(channel, entry) {
  if (!entry) return;
  if (entry._lock) return;

  const now = Date.now();
  const cooldown = entry.cooldownMs ?? 2000;
  if (entry._lastMove && (now - entry._lastMove) < cooldown) return;

  entry._lock = true;
  try {
    const newEmbed = sanitizeEmbed(entry.embed);

    if (entry.mode === "follow") {
      if (entry.messageId) {
        try {
          const old = await channel.messages.fetch(entry.messageId);
          await old.delete().catch(() => {});
        } catch {}
      }
      const sent = await channel.send({ embeds: [newEmbed] });
      entry.messageId = sent.id;
      entry._lastMove = Date.now();

      // 👇 전/옛 공지 싹 정리
      await sweepOnce(channel, sent.id);
      return;
    }

    if (entry.messageId) {
      try {
        const msg = await channel.messages.fetch(entry.messageId);
        await msg.edit({ embeds: [newEmbed] });
        entry._lastMove = Date.now();

        // 👇 전/옛 공지 싹 정리
        await sweepOnce(channel, msg.id);
        return;
      } catch {}
    }

    const sent = await channel.send({ embeds: [newEmbed] });
    entry.messageId = sent.id;
    entry._lastMove = Date.now();

    // 👇 전/옛 공지 싹 정리
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
      }, 1200); // 1.2s로 연속 입력 흡수
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
      // 👉 다른 명령어도 쓰라고 공통 유틸 모두 주입
      i._ari = { stickyStore, refreshSticky, recruitStates, rowFor, buildRecruitEmbed, canClose };
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
