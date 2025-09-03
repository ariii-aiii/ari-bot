// src/index.js
require('dotenv').config();
require('../server');

// ─────────────────────────────
// 부팅 로그
// ─────────────────────────────
console.log('[BOOT] index.js started');

// ─────────────────────────────
// 모듈
// ─────────────────────────────
const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, Collection, MessageFlags,
  REST, Routes
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────
// 환경변수
// ─────────────────────────────
const TOKEN     = (process.env.BOT_TOKEN || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();
const GUILD_ID  = (process.env.GUILD_ID  || '').trim();

console.log('[CHECK] token length =', TOKEN.length);
console.log('[CHECK] client id    =', CLIENT_ID || '(missing)');
console.log('[CHECK] guild id     =', GUILD_ID  || '(missing)');

// ─────────────────────────────
// 클라이언트
// ─────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ─────────────────────────────
// 상태 저장소
// ─────────────────────────────
const recruitStates = new Map();
const stickyStore   = new Map();
const noticeStore   = new Map();

// ─────────────────────────────
// 공통 유틸
// ─────────────────────────────
async function safeReply(i, payload) {
  if (payload?.ephemeral) {
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
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(0xCDC1FF);
}

// ─────────────────────────────
// 공지(1개 유지) / 스티키 헬퍼
// ─────────────────────────────
async function upsertNotice(channel, payload) {
  const prev = noticeStore.get(channel.id);
  if (prev?.messageId) {
    try { const m = await channel.messages.fetch(prev.messageId); await m.delete().catch(()=>{}); } catch {}
  }
  const sent = await channel.send(payload);
  noticeStore.set(channel.id, { messageId: sent.id, payload });
  return sent;
}
async function editNotice(channel, newPayload) {
  const saved = noticeStore.get(channel.id);
  if (saved?.messageId) {
    try {
      const m = await channel.messages.fetch(saved.messageId);
      await m.edit(newPayload);
      noticeStore.set(channel.id, { messageId: m.id, payload: newPayload });
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
async function ensureStickyIfMissing(channel) {
  if (stickyStore.has(channel.id)) return;
  const entry = {
    enabled   : true,
    mode      : "follow",
    payload   : { content: "📌 기본 스티키 메시지" },
    cooldownMs: 1500,
    messageId : null,
  };
  stickyStore.set(channel.id, entry);
}

// ─────────────────────────────
// 메시지 이벤트(스티키 훅만)
// ─────────────────────────────
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.inGuild()) return;
  await ensureStickyIfMissing(msg.channel);
});

// ─────────────────────────────
// 커맨드 로딩
// ─────────────────────────────
client.commands = new Collection();
try {
  const commandsPath = path.join(__dirname, "..", "commands");
  if (fs.existsSync(commandsPath)) {
    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));
    for (const file of files) {
      const cmd = require(path.join(commandsPath, file));
      if (cmd?.data?.name && typeof cmd?.execute === "function") {
        client.commands.set(cmd.data.name, cmd);
      }
    }
    console.log(`[CMDS] loaded ${client.commands.size} commands from /commands`);
  }
} catch (e) {
  console.error("[commands load error]", e?.message || e);
}

// ─────────────────────────────
// 인터랙션 라우팅
// ─────────────────────────────
client.on(Events.InteractionCreate, async (i) => {
  try {
    // 버튼(모집)
    if (i.isButton()) {
      const m = i.customId.match(/^(join|leave|list|close|open):(.+)$/);
      if (!m) return;

      const action = m[1];
      let msgId = m[2];
      if (msgId === 'temp') msgId = i.message.id;

      await i.deferUpdate();

      if (!recruitStates.has(msgId)) {
        recruitStates.set(msgId, { cap: 16, title: "모집", members: new Set(), waitlist: new Set(), isClosed: false, hostId: i.user.id });
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
        st.members.delete(i.user.id);
        st.waitlist.delete(i.user.id);
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
          if (st.isClosed) { st.closedBy = i.user.id; st.closedAt = Date.now(); }
          else { delete st.closedBy; delete st.closedAt; }
        }
      }

      const embed = buildRecruitEmbed(st);
      await i.message.edit({ embeds: [embed], components: [rowFor(msgId, st.isClosed)] });
      return;
    }

    // 슬래시 커맨드
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;
      await command.execute(i);
    }
  } catch (err) {
    console.error("[interaction error]", err);
  }
});

// ─────────────────────────────
// READY
// ─────────────────────────────
let watchdog = setTimeout(() => {
  console.error('[WARN] READY not fired within 60s. Check BOT_TOKEN / Intents / Invite / Code Grant.');
}, 60_000);

client.once(Events.ClientReady, (c) => {
  clearTimeout(watchdog);
  console.log(`[READY] ${c.user.tag} (${c.user.id}) online`);

  try {
    c.user.setPresence({
      status: 'online',
      activities: [{ name: '/공지 /아리모집 /팀', type: 0 }]
    });
  } catch {}
});

// ─────────────────────────────
// 로그인 (단 한 번만)
// ─────────────────────────────
if (!TOKEN) {
  console.error('[FATAL] BOT_TOKEN empty');
  process.exit(1);
}
client.login(TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});

// ─────────────────────────────
// 전역 에러
// ─────────────────────────────
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));
