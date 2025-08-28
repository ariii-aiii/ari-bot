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
    GatewayIntentBits.MessageContent   // ✅ 메시지 읽기
  ]
});

// ────────────────────────── 상태 저장소 ──────────────────────────
/** 모집 상태: messageId -> { cap, hostId, members:Set, waitlist:Set, isClosed, title, closedBy, closedAt } */
const recruitStates = new Map();
/** 스티키 상태: channelId -> { enabled, mode:'follow', embed, messageId, debounceTimer } */
const stickyStore   = new Map();

// ────────────────────────── 유틸 ──────────────────────────
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

// ────────────────────────── 스티키 로직 ──────────────────────────
const stickyRefreshing = new Set();

// footer에 채널 마커 심기 → 중복 식별
// footer 완전 제거 버전
function markStickyEmbed(channel, baseEmbed) {
  const e = EmbedBuilder.from(baseEmbed);

  // footer 싹 지우기
  e.setFooter(null);

  return e;
}


// 중복 스티키 정리(마커 없는 옛 공지까지 싹)
async function sweepStickyDuplicates(channel, keepId) {
  try {
    const marker = `[STICKY:${channel.id}]`;
    const fetched = await channel.messages.fetch({ limit: 50 });

    // 마커 달린 것
    const markerList = fetched.filter(m =>
      m.author?.bot &&
      m.embeds?.[0]?.footer?.text &&
      m.embeds[0].footer.text.includes(marker)
    );

    // 마커는 없지만 제목이 공지 계열(예전 것들)
    const legacyList = fetched.filter(m =>
      m.author?.bot &&
      m.id !== keepId &&
      m.embeds?.[0]?.title &&
      /공지|📢/.test(m.embeds[0].title)
    );

    const all = new Map();
    for (const m of markerList.values()) all.set(m.id, m);
    for (const m of legacyList.values()) all.set(m.id, m);

    if (all.size <= 1) return;

    // 최신 하나만 남김 (keepId 우선)
    const sorted = [...all.values()].sort((a,b)=>b.createdTimestamp - a.createdTimestamp);
    const winner = sorted.find(m => m.id === keepId) || sorted[0];

    for (const m of sorted) {
      if (m.id !== winner.id) await m.delete().catch(()=>{});
    }
  } catch (e) {
    console.error("[sticky sweep error]", e?.message || e);
  }
}

// 실제 갱신: follow는 delete+send(아래로 이동), 그 외는 edit
async function refreshSticky(channel, entry) {
  if (!entry) return;
  if (stickyRefreshing.has(channel.id)) return;
  stickyRefreshing.add(channel.id);

  try {
    const newEmbed = markStickyEmbed(channel, entry.embed);

    // 1) follow 모드: 무조건 삭제→재전송 (맨 아래로)
    if (entry.mode === "follow") {
      if (entry.messageId) {
        try {
          const old = await channel.messages.fetch(entry.messageId);
          await old.delete().catch(() => {});
        } catch {}
      }
      const sent = await channel.send({ embeds: [newEmbed] });
      entry.messageId = sent.id;
      await sweepStickyDuplicates(channel, sent.id);
      return;
    }

    // 2) 그 외 모드: edit 우선
    if (entry.messageId) {
      try {
        const msg = await channel.messages.fetch(entry.messageId);
        await msg.edit({ embeds: [newEmbed] });
        await sweepStickyDuplicates(channel, msg.id);
        return;
      } catch {}
    }

    // 3) 못 찾았으면 새로 생성
    const sent = await channel.send({ embeds: [newEmbed] });
    entry.messageId = sent.id;
    await sweepStickyDuplicates(channel, sent.id);

  } catch (e) {
    console.error("sticky refresh error:", e?.message || e);
  } finally {
    stickyRefreshing.delete(channel.id);
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
      }, 300); // 연속 입력 디바운스
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
    // 버튼(필요 시 이어서 확장)
    if (i.isButton()) {
      let action = i.customId, messageId = null;
      if (i.customId.includes(':')) {
        const parts = i.customId.split(':');
        action = parts[0];
        messageId = parts[1] || null;
      }
      if (!messageId && i.message) messageId = i.message.id;
      if (!messageId) return safeReply(i, { content: '버튼 ID를 확인할 수 없어요.', ephemeral: true });
      return;
    }

    // 슬래시 커맨드
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;
      // notice.js 등 커맨드에서 스티키 접근/갱신할 수 있게 주입
      i._ari = { recruitStates, rowFor, buildRecruitEmbed, stickyStore, refreshSticky, canClose };
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
