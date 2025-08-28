// src/index.js
// ─────────────────────────────────────────────────────────────────────────────
// 부팅 준비: ENV 로드 → 헬스 서버 오픈(Render Web Service 헬스체크) → 필수 ENV 점검
require('dotenv').config();
require('../server');          // 루트/server.js (포트 오픈)
require('./boot-check');       // BOT_TOKEN, CLIENT_ID 등 필수 ENV 확인
// ─────────────────────────────────────────────────────────────────────────────

const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Collection
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// 디스코드 클라이언트
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,          // 슬래시 커맨드/길드 이벤트
    GatewayIntentBits.GuildMessages    // 메시지 생성(스티키 follow용)
  ]
});

// ========================= 모집/스티키 상태 =========================
/** 모집 상태: messageId -> { cap, hostId, members:Set, waitlist:Set, isClosed, title, closedBy, closedAt } */
const recruitStates = new Map();
/** 스티키 상태: channelId -> { enabled, mode:'follow', intervalMs, timer, embed, messageId, debounceTimer } */
const stickyStore   = new Map();

// ========================= 권한 체크(마감) =========================
function canClose(i) {
  const ids = (process.env.CLOSE_ROLE_IDS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!i.inGuild()) return false;
  if (ids.length === 0) return true; // 제한 없으면 모두 가능
  return i.member?.roles?.cache?.some(r => ids.includes(r.id));
}

// ========================= 버튼 행 =========================
function rowFor(messageId, isClosed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join:${messageId}`).setLabel("참가").setStyle(ButtonStyle.Success).setDisabled(isClosed),
    new ButtonBuilder().setCustomId(`leave:${messageId}`).setLabel("취소").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`list:${messageId}`).setLabel("목록").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${isClosed ? "open" : "close"}:${messageId}`)
      .setLabel(isClosed ? "재오픈" : "마감")
      .setStyle(isClosed ? ButtonStyle.Secondary : ButtonStyle.Danger)
  );
}

// ========================= 모집 카드 =========================
function buildRecruitEmbed(st) {
  const lock  = st.isClosed ? "🔒 " : "";
  const title = `${lock}${st.title} - 정원 ${st.cap}명`;

  // 참가자
  const memberArr = [...st.members];
  const lines = memberArr.map((uid, i) => `${i + 1}. <@${uid}>`);

  let desc = `현재 인원: **${memberArr.length}/${st.cap}**`;
  if (lines.length) desc += `\n\n${lines.join("\n")}`;

  // 예비자
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

// ========================= 스티키 실재 게시 =========================
// 동시 호출 방지용 채널 잠금
const stickyRefreshing = new Set();

/**
 * 스티키를 "하나만 유지"하도록 업데이트
 * - 기존 메시지가 있으면 edit
 * - 없으면 send 후 messageId 저장
 * - 채널 단위 잠금으로 레이스 컨디션 방지
 */
async function refreshSticky(channel, entry) {
  if (!entry) return;

  // 채널 잠금
  if (stickyRefreshing.has(channel.id)) return;
  stickyRefreshing.add(channel.id);

  try {
    const newEmbed = EmbedBuilder.from(entry.embed);

    if (entry.messageId) {
      try {
        const msg = await channel.messages.fetch(entry.messageId);
        await msg.edit({ embeds: [newEmbed] });
        return; // edit 성공하면 끝
      } catch (e) {
        // 10008: Unknown Message (지워졌거나 못 찾음) → 새로 생성
        if (!(e && e.code === 10008)) {
          console.error("sticky fetch/edit error:", e?.message || e);
        }
      }
    }

    // 없거나 못 찾았을 때만 새로 생성
    const sent = await channel.send({ embeds: [newEmbed] });
    entry.messageId = sent.id;

  } catch (e2) {
    console.error("sticky refresh error:", e2?.message || e2);
  } finally {
    stickyRefreshing.delete(channel.id);
  }
}

// ========================= 커맨드 로딩 =========================
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

// ========================= 메시지 이벤트(스티키 follow) =========================
// 같은 채널에서 메시지가 연달아 올 때 스티키 갱신을 300ms로 디바운스
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.inGuild()) return;
  const entry = stickyStore.get(msg.channelId);
  if (entry?.enabled && entry.mode === "follow") {
    try {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      entry.debounceTimer = setTimeout(() => {
        refreshSticky(msg.channel, entry);
      }, 300);
    } catch (e) {
      console.error("[sticky debounce error]", e?.message || e);
    }
  }
});

// ========================= 인터랙션(버튼/슬래시) =========================
client.on(Events.InteractionCreate, async (i) => {
  try {
    // ── 버튼 처리 (레거시 customId 호환)
    if (i.isButton()) {
      let action = i.customId;
      let messageId = null;

      if (i.customId.includes(':')) {
        const parts = i.customId.split(':');
        action = parts[0];
        messageId = parts[1] || null;
      }
      // 구버전 버튼이면 현재 메시지 ID로 보정
      if (!messageId && i.message) messageId = i.message.id;

      if (!messageId) {
        return i.reply({ content: '버튼 ID를 확인할 수 없어요. 새로 만들어주세요.', ephemeral: true });
      }

      // 상태 복구: embed 제목/본문만으로 복원
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
        try {
          const msg = await i.channel.messages.fetch(messageId);
          await msg.edit({
            embeds: [buildRecruitEmbed(st)],
            components: [rowFor(messageId, st.isClosed)] // 항상 최신 버튼 세트로 교체
          });
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
            try {
              const u = await i.client.users.fetch(nextId);
              u.send("대기열에서 자동 참가되었어요!").catch(()=>{});
            } catch {}
          }
          await i.reply({ content: "❎ 참가 취소!", ephemeral: true });
        } else if (st.waitlist.delete(uid)) {
          changed = true;
          await i.reply({ content: "📝 대기열에서 제거했어요.", ephemeral: true });
        } else {
          return i.reply({ content: "참가/대기열에 없어요.", ephemeral: true });
        }
        if (changed) {
          try {
            const msg = await i.channel.messages.fetch(messageId);
            await msg.edit({
              embeds: [buildRecruitEmbed(st)],
              components: [rowFor(messageId, st.isClosed)]
            });
          } catch {}
        }
        return;
      }

      if (action === "list") {
        return i.reply({ embeds: [buildRecruitEmbed(st)], ephemeral: true });
      }

      if (action === "close" || action === "open") {
        if (!canClose(i) && uid !== st.hostId) {
          return i.reply({ content: "마감/재오픈 권한이 없어요.", ephemeral: true });
        }
        st.isClosed = (action === "close");
        st.closedBy = uid;
        st.closedAt = Date.now();
        try {
          const msg = await i.channel.messages.fetch(messageId);
          await msg.edit({
            embeds: [buildRecruitEmbed(st)],
            components: [rowFor(messageId, st.isClosed)] // 새 customId로 동기화
          });
        } catch {}
        return i.reply({ content: st.isClosed ? "🔒 마감!" : "🔓 재오픈!", ephemeral: true });
      }

      // 알 수 없는 action
      return i.reply({ content: "알 수 없는 버튼이에요.", ephemeral: true });
    }

    // ── 슬래시 커맨드
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;
      // 유틸 공유 (필요한 커맨드에서 사용)
      i._ari = { recruitStates, rowFor, buildRecruitEmbed, stickyStore, refreshSticky };
      // 각 커맨드 파일에서 필요 시 deferReply() → editReply() 사용
      await command.execute(i);
    }
  } catch (err) {
    console.error(err);
    try {
      if (i.deferred || i.replied) await i.editReply("에러가 났어요 ㅠㅠ");
      else await i.reply({ content: "에러가 났어요 ㅠㅠ", ephemeral: true });
    } catch {}
  }
});

// ========================= READY 로그/알림 =========================
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

// ========================= keepalive(자기 자신 핑) =========================
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

// ========================= 로그인 + 에러 캐치 =========================
client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error('[LOGIN FAIL]', err?.code || err?.message || err);
  process.exit(1); // 로그인 실패만 재시작 유도(Render가 재시작)
});

// 전역 에러 로그
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));
process.on('uncaughtException', e => console.error('[uncaughtException]', e));
