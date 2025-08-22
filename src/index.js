// src/index.js 최상단
require('dotenv').config();   // .env 로드
require('../server');         // ← 루트/server.js로 포트 오픈 (Web Service 헬스체크용)
require('./boot-check');      // ENV 필수값 검사

const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');

// 필요하면 나머지 require들 계속...

const fs = require("fs");
const path = require("path");

const TOKEN = (process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || "").trim();
if (!TOKEN) { console.error("❌ DISCORD_TOKEN 없음"); process.exit(1); }

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// 모집 상태: messageId -> { cap, hostId, members:Set, waitlist:Set, isClosed, title, closedBy, closedAt }
const recruitStates = new Map();

// 스티키 상태: channelId -> { enabled, mode:'follow', intervalMs, timer, embed, messageId }
const stickyStore = new Map();

// ── 권한: 마감
function canClose(i) {
  const ids = (process.env.CLOSE_ROLE_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!i.inGuild()) return false;
  if (ids.length === 0) return true;
  return i.member?.roles?.cache?.some(r => ids.includes(r.id));
}

// ── 버튼 행
function rowFor(messageId, isClosed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join:${messageId}`).setLabel("참가").setStyle(ButtonStyle.Success).setDisabled(isClosed),
    new ButtonBuilder().setCustomId(`leave:${messageId}`).setLabel("취소").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`list:${messageId}`).setLabel("목록").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${isClosed ? "open" : "close"}:${messageId}`)
      .setLabel(isClosed ? "재오픈" : "마감").setStyle(isClosed ? ButtonStyle.Secondary : ButtonStyle.Danger)
  );
}

// ── 카드 생성: 참가자 번호 + 예비자 번호
function buildRecruitEmbed(st) {
  const lock = st.isClosed ? "🔒 " : "";
  const title = `${lock}${st.title} - 정원 ${st.cap}명`;

  // 참가자 (삽입 순서 = 참가 순서)
  const memberArr = [...st.members];
  const lines = memberArr.map((uid, i) => `${i + 1}. <@${uid}>`);

  let desc = `현재 인원: **${memberArr.length}/${st.cap}**`;
  if (lines.length) desc += `\n\n${lines.join("\n")}`;

  // 예비자(대기열) 표시
  const waitArr = [...st.waitlist];
  if (waitArr.length) {
    const wlines = waitArr.map((uid, i) => `${i + 1}. <@${uid}>`);
    desc += `\n\n**예비자 (${waitArr.length})**\n\n${wlines.join("\n")}`;
  }

  if (st.isClosed) {
    const when = new Date(st.closedAt || Date.now()).toLocaleString("ko-KR", { hour12: false });
    desc += `\n\n🔒 **마감됨 – 마감자:** <@${st.closedBy || st.hostId}>  ${when}`;
  }
  return new EmbedBuilder().setTitle(title).setDescription(desc);
}


// ── 스티키 실재게시
async function refreshSticky(channel, entry) {
  try {
    if (entry.messageId) {
      try { const old = await channel.messages.fetch(entry.messageId); await old.delete(); } catch {}
    }
    const msg = await channel.send({ embeds: [EmbedBuilder.from(entry.embed)] });
    entry.messageId = msg.id;
  } catch (e) { console.error("sticky refresh error:", e?.message); }
}

// ── 명령 로딩
client.commands = new Collection();
const commandsPath = path.join(__dirname, "..", "commands");
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"))) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.data.name, cmd);
}

// ── 스티키 follow 모드: 대화 생기면 최신으로
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.inGuild()) return;
  const entry = stickyStore.get(msg.channelId);
  if (entry?.enabled && entry.mode === "follow") await refreshSticky(msg.channel, entry);
});

client.on(Events.InteractionCreate, async (i) => {
  try {
    // ── 모집 버튼
    if (i.isButton()) {
      const [action, messageId] = i.customId.split(":");
      if (!messageId) return;

      // 상태 복구: 제목과 본문만으로 복구(푸터 의존 X)
      if (!recruitStates.has(messageId)) {
        try {
          const msg = await i.channel.messages.fetch(messageId);
          const emb = msg.embeds?.[0];

          let cap = 16, isClosed = false, baseTitle = "모집";
          if (emb?.title) {
            const t = emb.title;
            isClosed = t.trim().startsWith("🔒");
            const mCap = t.match(/정원\s+(\d+)/);
            if (mCap) cap = parseInt(mCap[1], 10);
            baseTitle = t.replace(/^🔒\s*/, "").replace(/\s*-\s*정원.*$/, "").trim() || "모집";
          }
          const members = new Set();
          const desc = emb?.description || "";
          for (const m of desc.matchAll(/^\s*\d+\.\s*<@(\d+)>/gm)) members.add(m[1]);

          recruitStates.set(messageId, {
            cap, hostId: i.user.id, members, waitlist: new Set(),
            isClosed, title: baseTitle
          });
        } catch {}
      }

      const st = recruitStates.get(messageId);
      if (!st) return i.reply({ content: "상태를 찾지 못했어요. 새로 만들어주세요.", ephemeral: true });
      const uid = i.user.id;

      if (action === "join") {
        if (st.isClosed) return i.reply({ content: "이미 마감됐어요.", ephemeral: true });
        if (st.members.has(uid)) return i.reply({ content: "이미 참가 중!", ephemeral: true });

        if (st.members.size < st.cap) {
          st.members.add(uid);
          await i.reply({ content: "✅ 참가 완료!", ephemeral: true });
        } else {
          if (st.waitlist.has(uid)) return i.reply({ content: "이미 대기열에 있어요.", ephemeral: true });
          st.waitlist.add(uid);
          await i.reply({ content: "⏳ 정원 초과! 대기열에 등록했어요.", ephemeral: true });
        }
        try { const msg = await i.channel.messages.fetch(messageId); await msg.edit({ embeds: [buildRecruitEmbed(st)] }); } catch {}
        return;
      }

      if (action === "leave") {
        let changed = false;
        if (st.members.delete(uid)) {
          changed = true;
          if (st.waitlist.size > 0) {
            const nextId = st.waitlist.values().next().value;
            st.waitlist.delete(nextId);
            st.members.add(nextId);
            try { const u = await i.client.users.fetch(nextId); u.send("대기열에서 자동 참가되었어요!").catch(()=>{}); } catch {}
          }
          await i.reply({ content: "❎ 참가 취소!", ephemeral: true });
        } else if (st.waitlist.delete(uid)) {
          changed = true;
          await i.reply({ content: "📝 대기열에서 제거했어요.", ephemeral: true });
        } else {
          return i.reply({ content: "참가/대기열에 없어요.", ephemeral: true });
        }
        if (changed) { try { const msg = await i.channel.messages.fetch(messageId); await msg.edit({ embeds: [buildRecruitEmbed(st)] }); } catch {} }
        return;
      }

      if (action === "list") {
        return i.reply({ embeds: [buildRecruitEmbed(st)], ephemeral: true });
      }

      if (action === "close" || action === "open") {
        if (!canClose(i) && uid !== st.hostId) return i.reply({ content: "마감/재오픈 권한이 없어요.", ephemeral: true });
        st.isClosed = (action === "close");
        st.closedBy = uid;
        st.closedAt = Date.now();
        try {
          const msg = await i.channel.messages.fetch(messageId);
          await msg.edit({ embeds: [buildRecruitEmbed(st)], components: [rowFor(messageId, st.isClosed)] });
        } catch {}
        return i.reply({ content: st.isClosed ? "🔒 마감!" : "🔓 재오픈!", ephemeral: true });
      }
      return;
    }

    // ── 슬래시
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;
      i._ari = { recruitStates, rowFor, buildRecruitEmbed, stickyStore, refreshSticky };
      await command.execute(i);
    }
  } catch (err) {
    console.error(err);
    if (i.deferred || i.replied) i.editReply("에러가 났어요 ㅠㅠ");
    else i.reply({ content: "에러가 났어요 ㅠㅠ", ephemeral: true });
  }
});

// ✅ 봇 준비 완료 로그 + 알림 채널 핑
client.once(Events.ClientReady, async (c) => {
  console.log(`[READY] AriBot logged in as ${c.user.tag}`);

  if (process.env.NOTIFY_CHANNEL_ID) {
    try {
      const ch = await client.channels.fetch(process.env.NOTIFY_CHANNEL_ID);
      await ch?.send('✅ 아리봇 부팅 완료! (재배포/토큰 교체 감지)');
    } catch (err) {
      console.error('[NOTIFY FAIL]', err);
    }
  }
});
// keep-alive (자기 자신 깨우기)
function keepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL || process.env.HEALTH_URL;
  if (!url) return; // URL 없으면 스킵
  const https = require('https');
  setInterval(() => {
    https.get(url, (res) => {
      const ok = res.statusCode >= 200 && res.statusCode < 400;
      console.log(`[keepalive] ${url} -> ${res.statusCode} ${ok ? 'OK' : 'NG'}`);
      res.resume();
    }).on('error', (e) => console.error('[keepalive error]', e.message));
  }, 1000 * 60 * 4); // 4분마다
}
keepAlive();


// ✅ 로그인 + 실패 캐치
client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1); // 로그인 실패만 재시작 유도
});

process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));
process.on('uncaughtException', e => console.error('[uncaughtException]', e));

