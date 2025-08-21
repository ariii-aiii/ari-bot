require("dotenv").config();
const {
  Client, GatewayIntentBits, Collection, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ==== 상태 저장: messageId -> { cap, hostId, members:Set, waitlist:Set, isClosed, title }
const recruitStates = new Map();

// ==== 마감 권한 체크 ====
function canClose(i) {
  const ids = (process.env.CLOSE_ROLE_IDS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!i.inGuild()) return false;
  if (ids.length === 0) return true; // 제한 없으면 모두 가능
  return i.member?.roles?.cache?.some(r => ids.includes(r.id));
}

// ==== 커맨드 로더 ====
client.commands = new Collection();
const commandsPath = path.join(__dirname, "..", "commands");
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"))) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.data.name, cmd);
}

// 버튼 행 생성
function rowFor(messageId, isClosed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join:${messageId}`).setLabel("참가").setStyle(ButtonStyle.Success).setDisabled(isClosed),
    new ButtonBuilder().setCustomId(`leave:${messageId}`).setLabel("취소").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`list:${messageId}`).setLabel("목록").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${isClosed ? "open" : "close"}:${messageId}`)
      .setLabel(isClosed ? "재오픈" : "마감").setStyle(isClosed ? ButtonStyle.Secondary : ButtonStyle.Danger)
  );
}

client.on(Events.InteractionCreate, async (i) => {
  try {
    // ===== 버튼 =====
    if (i.isButton()) {
      const [action, messageId] = i.customId.split(":");
      if (!messageId) return;

      // 상태 없으면 embed에서 Cap/Host 복구 시도(최소한)
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

      if (action === "join") {
        if (st.isClosed) return i.reply({ content: "이미 마감된 모집이에요.", ephemeral: true });
        if (st.members.has(uid)) return i.reply({ content: "이미 참가 중이에요!", ephemeral: true });

        if (st.members.size < st.cap) {
          st.members.add(uid);
          return i.reply({ content: "✅ 참가 완료!", ephemeral: true });
        } else {
          if (st.waitlist.has(uid)) return i.reply({ content: "이미 대기열에 있어요!", ephemeral: true });
          st.waitlist.add(uid);
          return i.reply({ content: "⏳ 정원 초과! 대기열 등록했어요.", ephemeral: true });
        }
      }

      if (action === "leave") {
        if (st.members.delete(uid)) {
          // 빈자리 -> 대기열 자동 승급
          if (st.waitlist.size > 0) {
            const nextId = st.waitlist.values().next().value;
            st.waitlist.delete(nextId);
            st.members.add(nextId);
            try {
              const u = await i.client.users.fetch(nextId);
              u.send("대기열에서 자동 참가됐어요! 채널 확인해주세요.").catch(()=>{});
            } catch {}
          }
          return i.reply({ content: "❎ 참가 취소!", ephemeral: true });
        }
        if (st.waitlist.delete(uid)) {
          return i.reply({ content: "📝 대기열에서 제거했어요.", ephemeral: true });
        }
        return i.reply({ content: "참가/대기열에 없어요.", ephemeral: true });
      }

      if (action === "list") {
        const members = [...st.members].map((id, idx) => `${idx + 1}. <@${id}>`).join("\n") || "없음";
        const waiters = [...st.waitlist].map((id, idx) => `${idx + 1}. <@${id}>`).join("\n") || "없음";
        const embed = new EmbedBuilder()
          .setTitle(`참가 목록 (${st.members.size}/${st.cap})`)
          .addFields(
            { name: "참가자", value: members, inline: true },
            { name: "대기열", value: waiters, inline: true }
          );
        return i.reply({ embeds: [embed], ephemeral: true });
      }

      if (action === "close" || action === "open") {
        if (!canClose(i) && uid !== st.hostId) {
          return i.reply({ content: "마감/재오픈 권한이 없어요.", ephemeral: true });
        }
        st.isClosed = (action === "close");
        try {
          const msg = await i.channel.messages.fetch(messageId);
          await msg.edit({ components: [rowFor(messageId, st.isClosed)] });
        } catch {}
        return i.reply({ content: st.isClosed ? "🔒 마감했습니다." : "🔓 재오픈했습니다.", ephemeral: true });
      }
      return;
    }

    // ===== Slash Commands =====
    if (i.isChatInputCommand()) {
      const command = client.commands.get(i.commandName);
      if (!command) return;
      i._ari = { recruitStates, rowFor }; // 컨텍스트 전달
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

client.login(process.env.DISCORD_TOKEN);
