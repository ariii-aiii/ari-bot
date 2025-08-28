// src/index.js
// ─────────────────────────────────────────────
require('dotenv').config();
require('../server');           // server.js 즉시 실행
require('./boot-check');        // BOT_TOKEN 등 확인
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
    GatewayIntentBits.MessageContent   // ✅ 메시지 읽기용
  ]
});

// ────────────────────────── 상태 저장소 ──────────────────────────
const recruitStates = new Map();
const stickyStore   = new Map();  // channelId -> { enabled, mode, embed, messageId, debounceTimer }

// ────────────────────────── 공용 유틸 ──────────────────────────
async function safeReply(i, payload) {
  if (i.replied || i.deferred) return i.followUp(payload);
  return i.reply(payload);
}

// 버튼 세트
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

// 모집 embed
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

  const colorHex = (process.env.NOTICE_COLOR || "#CDC1FF").replace(/^#/, "");
  const colorInt = parseInt(colorHex, 16);
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(isNaN(colorInt) ? 0xCDC1FF : colorInt);
}

// ────────────────────────── 스티키 로직 ──────────────────────────
const stickyRefreshing = new Set();

function markStickyEmbed(channel, baseEmbed) {
  const marker = `[STICKY:${channel.id}]`;
  const e = EmbedBuilder.from(baseEmbed);
  const prevFooter = e.data.footer?.text || "";
  const text = prevFooter && !prevFooter.includes(marker)
    ? `${prevFooter} ${marker}` : (prevFooter || marker);
  e.setFooter({ text });
  return e;
}

async function sweepStickyDuplicates(channel, keepId) {
  try {
    const marker = `[STICKY:${channel.id}]`;
    const fetched = await channel.messages.fetch({ limit: 50 });
    const list = fetched.filter(m =>
      m.author?.bot &&
      m.embeds?.[0]?.footer?.text &&
      m.embeds[0].footer.text.includes(marker)
    );
    if (list.size <= 1) return;
    for (const m of list.values()) {
      if (m.id !== keepId) await m.delete().catch(()=>{});
    }
  } catch (e) { console.error("[sticky sweep error]", e?.message || e); }
}

async function refreshSticky(channel, entry) {
  if (!entry) return;
  if (stickyRefreshing.has(channel.id)) return;
  stickyRefreshing.add(channel.id);

  try {
    const newEmbed = markStickyEmbed(channel, entry.embed);
    if (entry.messageId) {
      try {
        const msg = await channel.messages.fetch(entry.messageId);
        await msg.edit({ embeds: [newEmbed] });
        await sweepStickyDuplicates(channel, msg.id);
        return;
      } catch {}
    }
    const sent = await channel.send({ embeds: [newEmbed] });
    entry.messageId = sent.id;
    await sweepStickyDuplicates(channel, sent.id);
  } finally {
    stickyRefreshing.delete(channel.id);
  }
}

// ────────────────────────── 메시지 이벤트 ──────────────────────────
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.inGuild()) return;
  const entry = stickyStore.get(msg.channelId);
  if (entry?.enabled && entry.mode === "follow") {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(() => {
      refreshSticky(msg.channel, entry);
    }, 300);
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

// ────────────────────────── READY ──────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`[READY] AriBot logged in as ${c.user.tag}`);
});

// ────────────────────────── 로그인 ──────────────────────────
client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});
