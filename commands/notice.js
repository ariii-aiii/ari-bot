const {
  SlashCommandBuilder, EmbedBuilder, resolveColor, PermissionFlagsBits
} = require("discord.js");

// 컬러 프리셋 + 기본색
const NAMED_COLORS = {
  pink: "#FF69B4", hotpink: "#FF1493", cherry: "#F01945", peach: "#FFB88C",
  sky: "#7EC8E3", aqua: "#00FFFF", lavender: "#C77DFF", lime: "#70FF70",
  navy: "#1B3B6F", black: "#111111", white: "#FFFFFF", yellow: "#FFE066",
  orange: "#FFA94D", blue: "#4DABF7", purple: "#9775FA", green: "#69DB7C"
};
const DEFAULT_HEX = "#CDC1FF"; // 💜 세빈님 기본 컬러

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

// 채널별 마지막 공지 메시지 기억
const lastNoticeByChannel = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notice").setNameLocalizations({ ko: "공지" })
    .setDescription("Create/Edit/Delete/Sticky notices")
    .setDescriptionLocalizations({ ko: "공지 등록/수정/삭제/스티키" })

    .addSubcommand(sub =>
      sub.setName("create").setNameLocalizations({ ko: "등록" })
        .setDescription("Create a notice").setDescriptionLocalizations({ ko: "공지 등록" })
        .addStringOption(o => o.setName("content").setNameLocalizations({ ko: "내용" })
          .setDescription("공지 내용").setRequired(true))
        .addStringOption(o => o.setName("title").setNameLocalizations({ ko: "제목" })
          .setDescription("제목(선택)"))
        .addStringOption(o => o.setName("color").setNameLocalizations({ ko: "컬러" })
          .setDescription("색상: 이름(pink, sky...) 또는 HEX(#CDC1FF 기본)"))
    )
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
    .addSubcommand(sub =>
      sub.setName("delete").setNameLocalizations({ ko: "삭제" })
        .setDescription("Delete a notice").setDescriptionLocalizations({ ko: "공지 삭제" })
        .addStringOption(o => o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
          .setDescription("삭제할 공지 메시지 ID (미입력 시 마지막 공지)").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("sticky").setNameLocalizations({ ko: "스티키" })
        .setDescription("Enable/Disable infinite sticky").setDescriptionLocalizations({ ko: "무한 스티키 켜기/끄기" })
        .addBooleanOption(o => o.setName("on").setNameLocalizations({ ko: "켜기" })
          .setDescription("true=켜기 / false=끄기").setRequired(true))
        .addStringOption(o => o.setName("mode").setNameLocalizations({ ko: "모드" })
          .setDescription("follow: 따라붙기 / interval: 주기")
          .addChoices({ name: "follow", value: "follow" }, { name: "interval", value: "interval" }))
        .addIntegerOption(o => o.setName("seconds").setNameLocalizations({ ko: "초" })
          .setDescription("interval 모드일 때 주기(초, 5~3600)").setMinValue(5).setMaxValue(3600))
        .addStringOption(o => o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
          .setDescription("기존 공지 사용 (ID)"))
        .addStringOption(o => o.setName("content").setNameLocalizations({ ko: "내용" })
          .setDescription("새 공지 내용(기존 메시지 없을 때)"))
        .addStringOption(o => o.setName("title").setNameLocalizations({ ko: "제목" })
          .setDescription("새 공지 제목"))
        .addStringOption(o => o.setName("color").setNameLocalizations({ ko: "컬러" })
          .setDescription("새 공지 컬러"))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.channel;
    const { stickyStore, refreshSticky } = interaction._ari;

    // 대상 메시지 헬퍼
    const getTargetMessage = async () => {
      const id = interaction.options.getString("message_id") || lastNoticeByChannel.get(channel.id);
      if (!id) throw new Error("공지 메시지 ID가 없습니다.");
      return channel.messages.fetch(id);
    };

    // ── 등록
    if (sub === "create") {
      const content = interaction.options.getString("content", true);
      const title = interaction.options.getString("title") || "📢 공지";
      const colorStr = interaction.options.getString("color");

      const embed = new EmbedBuilder()
        .setTitle(title).setDescription(content)
        .setColor(parseColor(colorStr))   // 기본은 #CDC1FF
        .setFooter({ text: `by ${interaction.user.tag}` })
        .setTimestamp();

      const sticky = stickyStore.get(channel.id);
      if (sticky?.enabled) {
        // ✅ 스티키가 켜져 있으면 중복 발송 없이 스티키만 갱신
        sticky.embed = embed.toJSON();
        await refreshSticky(channel, sticky);
        lastNoticeByChannel.set(channel.id, sticky.messageId);
        return interaction.reply({ content: "✅ 공지 등록 + 스티키 갱신 완료!", ephemeral: true });
      }

      // 스티키 꺼져있으면 일반 공지 1개만 발송
      const msg = await channel.send({ embeds: [embed] });
      lastNoticeByChannel.set(channel.id, msg.id);
      return interaction.reply({ content: `✅ 공지 등록! (messageId: ${msg.id})`, ephemeral: true });
    }

    // ── 수정
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

        // 스티키가 켜져 있으면 스티키도 갱신
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

    // ── 삭제
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

    // ── 스티키 ON/OFF
    if (sub === "sticky") {
      const turnOn = interaction.options.getBoolean("on", true);
      const mode = interaction.options.getString("mode") || "follow";
      const seconds = interaction.options.getInteger("seconds") || 30;

      let entry = stickyStore.get(channel.id);

      if (!turnOn) {
        if (entry?.timer) clearInterval(entry.timer);
        stickyStore.delete(channel.id);
        return interaction.reply({ content: "📎 스티키 껐어요!", ephemeral: true });
      }

      // 사용할 임베드 결정: 지정 메시지 or 새로 만듦
      let baseEmbed;
      const msgId = interaction.options.getString("message_id");
      if (msgId) {
        try {
          const msg = await channel.messages.fetch(msgId);
          baseEmbed = EmbedBuilder.from(msg.embeds?.[0] || new EmbedBuilder().setDescription(msg.content || " "));
          lastNoticeByChannel.set(channel.id, msg.id);
        } catch {
          return interaction.reply({ content: "❌ 해당 메시지를 못 찾았어요.", ephemeral: true });
        }
      } else {
        const content = interaction.options.getString("content");
        const title = interaction.options.getString("title") || "📢 공지";
        const colorStr = interaction.options.getString("color");
        if (!content) return interaction.reply({ content: "내용이 없어요. content를 입력하거나 message_id를 주세요.", ephemeral: true });
        baseEmbed = new EmbedBuilder()
          .setTitle(title).setDescription(content)
          .setColor(parseColor(colorStr))
          .setFooter({ text: `by ${interaction.user.tag}` })
          .setTimestamp();
        const msg = await channel.send({ embeds: [baseEmbed] });
        lastNoticeByChannel.set(channel.id, msg.id);
      }

      if (entry?.timer) clearInterval(entry.timer);
      entry = {
        enabled: true,
        mode,
        intervalMs: Math.max(5, seconds) * 1000,
        timer: null,
        embed: baseEmbed.toJSON(),
        messageId: lastNoticeByChannel.get(channel.id) || null
      };
      stickyStore.set(channel.id, entry);

      await refreshSticky(channel, entry);
      if (mode === "interval") {
        entry.timer = setInterval(async () => { try { await refreshSticky(channel, entry); } catch {} }, entry.intervalMs);
      }

      return interaction.reply({ content: `📌 스티키 켰어요! 모드: ${mode}${mode==="interval" ? `, ${seconds}s` : ""}`, ephemeral: true });
    }
  }
};
