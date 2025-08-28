// src/index.js
// ─────────────────────────────────────────────────────────────────────────────
// 부팅 준비: ENV 로드 → 헬스 서버 실행(Render 헬스체크) → 필수 ENV 점검
require('dotenv').config();
const startHealthServer = require('../server'); // server.js가 함수 export
startHealthServer();                             // 헬스 서버 실제 실행
require('./boot-check');                        // BOT_TOKEN 등 필수 ENV 확인
// ─────────────────────────────────────────────────────────────────────────────

const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Collection
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ────────────────────────── 디스코드 클라이언트 ──────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,       // 슬래시 커맨드/길드 이벤트
    GatewayIntentBits.GuildMessages // 메시지 생성(스티키 follow용)
  ]
});

// ───────────────────────────── 상태 저장소 ─────────────────────────────
/** 모집 상태: messageId -> { cap, hostId, members:Set, waitlist:Set, isClosed, title, closedBy, closedAt } */
const recruitStates = new Map();
/** 스티키 상태: channelId -> { enabled, mode:'follow', embed, messageId, debounceTimer } */
const stickyStore   = new Map();

// ───────────────────────────── 공용 유틸 ─────────────────────────────
async function safeReply(i, payload) {           // 이미 응답했으면 followUp
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

// ─────────────────────── 스티키(하나만 유지) 로직 ───────────────────────
const stickyRefreshing = new Set();

// 채널 고유 마커(footer)에 [STICKY:<channelId>] 심기
function markStickyEmbed(channel, baseEmbed) {
  const marker = `[STICKY:${channel.id}]`;
  const e = EmbedBuilder.from(baseEmbed);
  const prevFooter = e.data.footer?.text || "";
  const text = prevFooter && !prevFooter.includes(marker)
    ? `${prevFooter} ${marker}` : (prevFooter || marker);
  e.setFooter({ text });
  return e;
}

// 채널 내 같은 마커 가진 봇 임베드 중 최신 1개만 남기고 삭제
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
    const sorted = [...list.values()].sort((a,b)=>b.createdTimestamp - a.createdTimestamp);
    for (const m of sorted) {
      if (m.id === keepId || m === sorted[0]) continue;
      await m.delete().catch(()=>{});
    }
  } catch (e) { console.error("[sticky sweep error]", e?.message || e); }
}

// 채널에서 최신 스티키(마커 포함) 하나 찾아 채택
async function findExistingSticky(channel) {
  const marker = `[STICKY:${channel.id}]`;
  try {
    const fetched = await channel.messages.fetch({ limit: 50 });
    const list = fetched.filter(m =>
      m.author?.bot &&
      m.embeds?.[0]?.footer?.text &&
      m.embeds[0].footer.text.includes(marker)
    );
    if (!list.size) return null;
    return [...list.values()].sort((a,b)=>b.createdTimestamp - a.createdTimestamp)[0];
  } catch { return null; }
}

// 실제 갱신: edit 우선, 없거나 못 찾으면 send, 이후 스윕
async function refreshSticky(channel, entry) {
  if (!entry) return;
  if (stickyRefreshing.has(channel.id)) return;
  stickyRefreshing.add(channel.id);

  try {
    const newEmbed = markStickyEmbed(channel, entry.embed);

    // 1) id 있으면 edit
    if (entry.messageId) {
      try {
        const msg = await channel.messages.fetch(entry.messageId);
        await msg.edit({ embeds: [newEmbed] });
        await sweepStickyDuplicates(channel, msg.id);
        return;
      } catch (e) {
        if (!(e && e.code === 10008)) console.error("sticky fetch/edit error:", e?.message || e);
      }
    }

    // 2) id 없거나 실패 → 기존 스티키 채택
    const existing = await findExistingSticky(channel);
    if (existing) {
      entry.messageId = existing.id;
      try { await existing.edit({ embeds: [newEmbed] }); } catch {}
      await sweepStickyDuplicates(channel, existing.id);
      return;
    }

    // 3) 진짜 없을 때만 새로 생성
    const sent = await channel.send({ embeds: [newEmbed] });
    entry.messageId = sent.id;
    await sweepStickyDuplicates(channel, sent.id);

  } catch (e2) {
    console.error("sticky refresh error:", e2?.message || e2);
  } finally {
    stickyRefreshing.delete(channel.id);
  }
}

// ─────────────────────────── 커맨드 로딩 ───────────────────────────
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

// ───────────────────── 메시지 이벤트(스티키 follow) ─────────────────────
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.inGuild()) return;
  const entry = stickyStore.get(msg.channelId);
  if (entry?.enabled && entry.mode === "follow") {
    try {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      entry.debounceTimer = setTimeout(() => {
        refreshSticky(msg.channel, entry);
      }, 300); // 연속 트리거 합치기
    } catch (e) {
      console.error("[sticky debounce error]", e?.message || e);
    }
  }
});

// ───────────────────── 인터랙션(버튼/슬래시) ─────────────────────
client.on(Events.InteractionCreate, async (i) => {
  try {
    // ─ 버튼
    if (i.isButton()) {
      let action = i.customId, messageId = null;
      if (i.customId.includes(':')) {
        const parts = i.customId.split(':');
        action = parts[0];
        messageId = parts[1] || null;
      }
      if (!messageId && i.message) messageId = i.message.id;
      if (!messageId) return safeReply(i, { content: '버튼 ID를 확인할 수 없어요. 새로 만들어주세요.', ephemeral: true });

      // 상태 복구
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
            cap, hostId: i.user.id, members, waitlist: new Set(), isClosed, title: baseTitle
          });
        } catch {}
      }

      const st = recruitStates.get(messageId);
      if (!st) return safeReply(i, { content: "상태를 찾지 못했어요. 새로 만들어주세요.", ephemeral: true });
      const uid = i.user.id;

      if (action === "join") {
        if (st.isClosed) return safeReply(i, { content: "이미 마감됐어요.", ephemeral: true });
        if (st.members.has(uid)) return safeReply(i, { content: "이미 참가 중!", ephemeral: true });

        if (st.members.size < st.cap) {
          st.members.add(uid);
          await safeReply(i, { content: "✅ 참가 완료!", ephemeral: true });
        } else {
          if (st.waitlist.has(uid)) return safeReply(i, { content: "이미 대기열에 있어요.", ephemeral: true });
          st.waitlist.add(uid);
          await safeReply(i, { content: "⏳ 정원 초과! 대기열에 등록했어요.", ephemeral: true });
        }
        try {
          const msg = await i.channel.messages.fetch(messageId);
          await msg.edit({ embeds: [buildRecruitEmbed(st)], components: [rowFor(messageId, st.isClosed)] });
        } catch {}
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
          await safeReply(i, { content: "❎ 참가 취소!", ephemeral: true });
        } else if (st.waitlist.delete(uid)) {
          changed = true;
          await safeReply(i, { content: "📝 대기열에서 제거했어요.", ephemeral: true });
        } else {
          return safeReply(i, { content: "참가/대기열에 없어요.", ephemeral: true });
        }
        if (changed) {
          try {
            const msg = await i.channel.messages.fetch(messageId);
            await msg.edit({ embeds: [buildRecruitEmbed(st)], components: [rowFor(messageId, st.isClosed)] });
          } catch {}
        }
        return;
      }

      if (action === "list") {
        return safeReply(i, { embeds: [buildRecruitEmbed(st)], ephemeral: true });
      }

      if (action === "close" || action === "open") {
        if (!canClose(i) && uid !== st.hostId) {
          return safeReply(i, { content: "마감/재오픈 권한이 없어요.", ephemeral: true });
        }
        st.isClosed = (action === "close");
        st.closedBy = uid;
        st.closedAt = Date.now();
        try {
          const msg = await i.channel.messages.fetch(messageId);
          await msg.edit({ embeds: [buildRecruitEmbed(st)], components: [rowFor(messageId, st.isClosed)] });
        } catch {}
        return safeReply(i, { content: st.isClosed ? "🔒 마감!" : "🔓 재오픈!", ephemeral: true });
      }

      return safeReply(i, { content: "알 수 없는 버튼이에요.", ephemeral: true });
    }

    // ─ 슬래시 커맨드
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;
      i._ari = { recruitStates, rowFor, buildRecruitEmbed, stickyStore, refreshSticky };
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

// ─────────────────────────── READY 로그/알림 ───────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`[READY] AriBot logged in as ${c.user.tag} pid=${process.pid} inst=${process.env.RENDER_INSTANCE_ID || 'local'}`);

  if (process.env.NOTIFY_CHANNEL_ID) {
    try {
      const ch = await client.channels.fetch(process.env.NOTIFY_CHANNEL_ID);
      await ch?.send('✅ 아리봇 부팅 완료! (재배포/토큰 교체 감지)');
    } catch (err) { console.error('[NOTIFY FAIL]', err); }
  }
});

// ────────────────────── self ping (자기 자신 핑) ──────────────────────
function startSelfPing() {
  const url = process.env.RENDER_EXTERNAL_URL || process.env.HEALTH_URL;
  if (!url) return;
  const https = require('https');
  setInterval(() => {
    https.get(url, (res) => {
      const ok = res.statusCode >= 200 && res.statusCode < 400;
      console.log(`[keepalive] ${url} -> ${res.statusCode} ${ok ? 'OK' : 'NG'}`);
      res.resume();
    }).on('error', (e) => console.error('[keepalive error]', e.message));
  }, 1000 * 60 * 4);
}
startSelfPing();

// ───────────────────── 로그인 + 에러 캐치 ─────────────────────
client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1);
});
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));
process.on('uncaughtException',  e => console.error('[uncaughtException]',  e));
