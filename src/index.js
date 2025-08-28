// src/index.js
// ─────────────────────────────────────────────
require('dotenv').config();
require('../server');           // server.js 즉시 실행(헬스 서버)
require('./boot-check');        // BOT_TOKEN 등 필수 ENV 확인
// ─────────────────────────────────────────────

const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Collection
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ────────────────────────── 클라이언트 ──────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ────────────────────────── 상태 저장소 ──────────────────────────
const recruitStates = new Map();
const stickyStore   = new Map();

// ────────────────────────── 유틸 ──────────────────────────
async function safeReply(i, payload) {
  if (i.replied || i.deferred) return i.followUp(payload);
  return i.reply(payload);
}

// ────────────────────────── 스티키 로직 ──────────────────────────
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
    const newEmbed = sanitizeEmbed(entry.embed);

    // follow 모드: 무조건 새로 1개만
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
      return;
    }

    // 그 외: edit 우선
    if (entry.messageId) {
      try {
        const msg = await channel.messages.fetch(entry.messageId);
        await msg.edit({ embeds: [newEmbed] });
        entry._lastMove = Date.now();
        return;
      } catch {}
    }
    const sent = await channel.send({ embeds: [newEmbed] });
    entry.messageId = sent.id;
    entry._lastMove = Date.now();
  } catch (e) {
    console.error("sticky refresh error:", e?.message || e);
  } finally {
    entry._lock = false;
  }
}

// ────────────────────────── 메시지 이벤트 ──────────────────────────
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.inGuild()) return;
  const entry = stickyStore.get(msg.channelId);
  if (entry?.enabled && entry.mode === "follow") {
    try {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      entry.debounceTimer = setTimeout(() => {
        refreshSticky(msg.channel, entry);
      }, 1200); // 1.2초 디바운스
    } catch (e) {
      console.error("[sticky debounce error]", e?.message || e);
    }
  }
});

// ────────────────────────── 커맨드 로딩 ──────────────────────────
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
} catch (e) { console.error("[commands load error]", e?.message || e); }

// ────────────────────────── 인터랙션 ──────────────────────────
client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;
      i._ari = { stickyStore, refreshSticky };
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

// ────────────────────────── READY / 로그인 ──────────────────────────
client.once(Events.ClientReady, (c) => {
  console.log(`[READY] AriBot logged in as ${c.user.tag}`);
});

client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});
