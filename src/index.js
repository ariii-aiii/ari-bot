require("dotenv").config();
const {
  Client, GatewayIntentBits, Collection, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOKEN = (process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || "").trim();
if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN(.env)이 없습니다.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ====== 상태: messageId -> { cap, hostId, members:Set, waitlist:Set, isClosed, title, closedBy, closedAt }
const recruitStates = new Map();

// ====== 마감 권한(역할) 체크
function canClose(i) {
  const ids = (process.env.CLOSE_ROLE_IDS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!i.inGuild()) return false;
  if (ids.length === 0) return true; // 지정 안 했으면 모두 가능
  return i.member?.roles?.cache?.some(r => ids.includes(r.id));
}

// ====== 버튼 행
function rowFor(messageId, isClosed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join:${messageId}`).setLabel("참가").setStyle(ButtonStyle.Success).setDisabled(isClosed),
    new ButtonBuilder().setCustomId(`leave:${messageId}`).setLabel("취소").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`list:${messageId}`).setLabel("목록").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${isClosed ? "open" : "close"}:${messageId}`)
      .setLabel(isClosed ? "재오픈" : "마감").setStyle(isClosed ? ButtonStyle.Secondary : ButtonStyle.Danger)
  );
}

// ====== 모집 카드(Embed) 생성
function buildRecruitEmbed(st) {
  const lock = st.isClosed ? "🔒 " : "";
  const title = `${lock}${st.title} - 정원 ${st.cap}명`;

  const memberArr = [...st.members];
  const lines = [];
  // 번호 목록: 화면 가독성 위해 최대 16줄만 표기(원하면 cap로 바꿔도 됨)
  const maxLines = Math.min(st.cap, 16);
  for (let i = 1; i <= maxLines; i++) {
    const uid = memberArr[i - 1];
    lines.push(`${i}. ${uid ? `<@${uid}>` : ""}`);
  }

  let desc = `현재 인원: **${memberArr.length}/${st.cap}**\n\n${lines.join("\n")}`;
  if (st.isClosed) {
    const when = new Date(st.closedAt || Date.now()).toLocaleString("ko-KR", { hour12: false });
    desc += `\n\n🔒 **마감됨 – 마감자:** <@${st.closedBy || st.hostId}> \u00A0 ${when}`;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc);

  return embed;
}

// ====== 커맨드 로딩
client.commands = new Collection();
const commandsPath = path.join(__dirname, "..", "commands");
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"))) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.data.name, cmd);
}

client.on(Events.InteractionCreate, async (i) => {
  try {
    // ----- 버튼 -----
    if (i.isButton()) {
      const [action, messageId] = i.customId.split(":");
      if (!messageId) return;

      // 상태 없으면 최소 복구 시도
      if (!recruitStates.has(messageId)) {
        try {
          const msg = await i.channel.messages.fetch(messageId);
          const footer = msg.embeds?.[0]?.footer?.text || "";
          const cap = parseInt((footer.match(/Cap:(\d+)/) || [])[1] || "16", 10);
          const hostId = (footer.match(/Host:(\d+)/) || [])[1] || i.user.id;
          recruitStates.set(messageId, {
            cap, hostId, members: new Set(), waitlist: new Set(),
            isClosed: false, title: msg.embeds?.[0]?.title || "모집"
          });
        } catch {}
      }

      const st = recruitStates.get(messageId);
      if (!st) return i.reply({ content: "상태를 찾지 못했어요. 새로 만들어주세요.", ephemeral: true });
      const uid = i.user.id;

      // 참가
      if (action === "join") {
        if (st.isClosed) return i.reply({ content: "이미 마감된 모집이에요.", ephemeral: true });
        if (st.members.has(uid)) return i.reply({ content: "이미 참가 중이에요!", ephemeral: true });

        if (st.members.size < st.cap) {
          st.members.add(uid);
        } else {
          if (st.waitlist.has(uid)) return i.reply({ content: "이미 대기열에 있어요!", ephemeral: true });
          st.waitlist.add(uid);
          await i.reply({ content: "⏳ 정원 초과! 대기열에 등록했어요.", ephemeral: true });
          // 카드도 최신화(인원 변화 없음이지만 일관성 위해)
          try {
            const msg = await i.channel.messages.fetch(messageId);
            await msg.edit({ embeds: [buildRecruitEmbed(st)] });
          } catch {}
          return;
        }

        await i.reply({ content: "✅ 참가 완료!", ephemeral: true });
        try {
          const msg = await i.channel.messages.fetch(messageId);
          await msg.edit({ embeds: [buildRecruitEmbed(st)] });
        } catch {}
        return;
      }

      // 취소 (대기열 승급)
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
              u.send("대기열에서 자동 참가되었어요! 채널 확인해주세요.").catch(()=>{});
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
            await msg.edit({ embeds: [buildRecruitEmbed(st)] });
          } catch {}
        }
        return;
      }

      // 목록(임베드 그대로 보여주면 되지만, 에페멀로 복사본 제공)
      if (action === "list") {
        return i.reply({ embeds: [buildRecruitEmbed(st)], ephemeral: true });
      }

      // 마감/재오픈
      if (action === "close" || action === "open") {
        if (!canClose(i) && uid !== st.hostId) {
          return i.reply({ content: "마감/재오픈 권한이 없어요.", ephemeral: true });
        }
        const closing = (action === "close");
        st.isClosed = closing;
        st.closedBy = uid;
        st.closedAt = Date.now();

        try {
          const msg = await i.channel.messages.fetch(messageId);
          await msg.edit({
            embeds: [buildRecruitEmbed(st)],
            components: [rowFor(messageId, st.isClosed)]
          });
        } catch {}
        return i.reply({ content: closing ? "🔒 마감했습니다." : "🔓 재오픈했습니다.", ephemeral: true });
      }
      return;
    }

    // ----- 슬래시 커맨드 -----
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;
      // 컨텍스트 주입
      i._ari = { recruitStates, rowFor, buildRecruitEmbed };
      await command.execute(i);
    }
  } catch (err) {
    console.error(err);
    if (i.deferred || i.replied) i.editReply("에러가 났어요 ㅠㅠ");
    else i.reply({ content: "에러가 났어요 ㅠㅠ", ephemeral: true });
  }
});

client.once(Events.ClientReady, (c) => {
  console.log(`[AriBot] Ready as ${c.user.tag}`);
});

console.log(`[Boot] tokenLen=${TOKEN.length}`);
client.login(TOKEN);
