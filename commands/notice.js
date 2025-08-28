const { SlashCommandBuilder, EmbedBuilder, resolveColor, PermissionFlagsBits } = require("discord.js");

const DEFAULT_HEX = "#CDC1FF";
const NAMED_COLORS = {
  pink: "#FF69B4", hotpink: "#FF1493", cherry: "#F01945", peach: "#FFB88C",
  sky: "#7EC8E3", aqua: "#00FFFF", lavender: "#C77DFF", lime: "#70FF70",
  navy: "#1B3B6F", black: "#111111", white: "#FFFFFF", yellow: "#FFE066",
  orange: "#FFA94D", blue: "#4DABF7", purple: "#9775FA", green: "#69DB7C"
};

function getDefaultColor() {
  const raw = (process.env.NOTICE_COLOR || "").trim();
  if (!raw) return resolveColor(DEFAULT_HEX);
  try { return resolveColor(raw); } catch { return resolveColor(DEFAULT_HEX); }
}
function parseColor(input) {
  if (!input) return getDefaultColor();
  const key = input.toLowerCase().trim();
  const hex = NAMED_COLORS[key] || input;
  try { return resolveColor(hex); } catch { return getDefaultColor(); }
}

const lastNoticeByChannel = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notice").setNameLocalizations({ ko: "공지" })
    .setDescription("Create/Edit/Delete notices (with sticky option)")
    .setDescriptionLocalizations({ ko: "공지 등록/수정/삭제 (스티키 옵션 포함)" })

    // 등록(+스티키 옵션)
    .addSubcommand(sub =>
      sub.setName("create").setNameLocalizations({ ko: "등록" })
        .setDescription("Create a notice").setDescriptionLocalizations({ ko: "공지 등록" })
        .addStringOption(o => o.setName("content").setNameLocalizations({ ko: "내용" })
          .setDescription("공지 내용").setRequired(true))
        .addStringOption(o => o.setName("title").setNameLocalizations({ ko: "제목" })
          .setDescription("제목(선택)"))
        .addStringOption(o => o.setName("color").setNameLocalizations({ ko: "컬러" })
          .setDescription("색상: 이름(pink, sky...) 또는 HEX(#CDC1FF 기본)"))
        .addBooleanOption(o => o.setName("sticky").setNameLocalizations({ ko: "스티키" })
          .setDescription("맨 아래에 계속 붙이기 (기본: 켜짐)"))
    )

    // 수정
    .addSubcommand(sub =>
      sub.setName("edit").setNameLocalizations({ ko: "수정" })
        .setDescription("Edit a notice").setDescriptionLocalizations({ ko: "공지 수정" })
        .addStringOption(o => o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
          .setDescription("수정할 공지 메시지 ID (미입력 시 마지막 공지)").setRequired(false))
        .addStringOption(o => o.setName("content").setNameLocalizations({ ko: "내용" })
          .setDescription("새 내용").setRequired(false))
        .addStringOption(o => o.setName("title").setNameLocalizations({ ko: "제목" })
          .setDescription("새 제목").setRequired(false))
        .addStringOption(o => o.setName("color").setNameLocalizations({ ko: "컬러" })
          .setDescription("새 컬러").setRequired(false))
    )

    // 삭제
    .addSubcommand(sub =>
      sub.setName("delete").setNameLocalizations({ ko: "삭제" })
        .setDescription("Delete a notice").setDescriptionLocalizations({ ko: "공지 삭제" })
        .addStringOption(o => o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
          .setDescription("삭제할 공지 메시지 ID (미입력 시 마지막 공지)").setRequired(false))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.channel;
    const { stickyStore, refreshSticky } = interaction._ari;

    const getTargetMessage = async () => {
      const id = interaction.options.getString("message_id") || lastNoticeByChannel.get(channel.id);
      if (!id) throw new Error("공지 메시지 ID가 없습니다.");
      return channel.messages.fetch(id);
    };

    // 등록
    if (sub === "create") {
      const content = interaction.options.getString("content", true);
      const title = interaction.options.getString("title") || "📢 공지";
      const colorStr = interaction.options.getString("color");
      const stickyOn = interaction.options.getBoolean("sticky") ?? true; // 기본 켜짐

      const embed = new EmbedBuilder()
        .setTitle(title).setDescription(content)
        .setColor(parseColor(colorStr))
       // .setFooter({ text: `by ${interaction.user.tag}` }) // ← 이 부분 삭제!
        .setTimestamp();

      if (stickyOn) {
        let entry = stickyStore.get(channel.id);
        if (entry?.timer) clearInterval(entry.timer);
        entry = {
          enabled: true,
          mode: "follow",
          intervalMs: 0,
          timer: null,
          embed: embed.toJSON(),
          messageId: lastNoticeByChannel.get(channel.id) || null
        };
        stickyStore.set(channel.id, entry);
        await refreshSticky(channel, entry);
        lastNoticeByChannel.set(channel.id, entry.messageId);
        return interaction.reply({ content: "✅ 공지 등록 + 스티키 켬!", ephemeral: true });
      } else {
        const msg = await channel.send({ embeds: [embed] });
        lastNoticeByChannel.set(channel.id, msg.id);
        return interaction.reply({ content: `✅ 공지 등록! (messageId: ${msg.id})`, ephemeral: true });
      }
    }

    // 수정
    if (sub === "edit") {
      const newContent = interaction.options.getString("content");
      const newTitle = interaction.options.getString("title");
      const newColor = interaction.options.getString("color");

      if (newContent == null && newTitle == null && newColor == null) {
        return interaction.reply({ content: "바꿀 항목이 없어요. (내용/제목/컬러 중 1개 이상)", ephemeral: true });
      }

      try {
        const msg = await getTargetMessage();
        const embed = EmbedBuilder.from(msg.embeds?.[0] || new EmbedBuilder());
        if (newTitle != null) embed.setTitle(newTitle || null);
        if (newContent != null) embed.setDescription(newContent || null);
        if (newColor != null) embed.setColor(parseColor(newColor));
        await msg.edit({ embeds: [embed] });

        const sticky = stickyStore.get(channel.id);
        if (sticky?.enabled) {
          sticky.embed = embed.toJSON();
          sticky.messageId = msg.id;
          await refreshSticky(channel, sticky);
        }

        lastNoticeByChannel.set(channel.id, msg.id);
        return interaction.reply({ content: "✏️ 공지 수정 완료!", ephemeral: true });
      } catch {
        return interaction.reply({ content: "❌ 공지 메시지를 찾지 못했어요.", ephemeral: true });
      }
    }

    // 삭제
    if (sub === "delete") {
      try {
        const msg = await getTargetMessage();
        await msg.delete();
        if (lastNoticeByChannel.get(channel.id) === msg.id) lastNoticeByChannel.delete(channel.id);
        return interaction.reply({ content: "🗑️ 공지 삭제 완료!", ephemeral: true });
      } catch {
        return interaction.reply({ content: "❌ 공지 메시지를 찾지 못했어요.", ephemeral: true });
      }
    }
  }
};
