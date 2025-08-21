// commands/notice.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  resolveColor
} = require("discord.js");

// 이름별 컬러 프리셋 (세빈님 취향 이름으로 추가해둠)
const NAMED_COLORS = {
  pink: "#FF69B4",
  hotpink: "#FF1493",
  cherry: "#F01945",
  peach: "#FFB88C",
  sky: "#7EC8E3",
  aqua: "#00FFFF",
  lavender: "#C77DFF",
  lime: "#70FF70",
  navy: "#1B3B6F",
  black: "#111111",
  white: "#FFFFFF",
  yellow: "#FFE066",
  orange: "#FFA94D",
  blue: "#4DABF7",
  purple: "#9775FA",
  green: "#69DB7C"
};

// 기본 컬러: .env NOTICE_COLOR → 없으면 핑크
function getDefaultColor() {
  const raw = (process.env.NOTICE_COLOR || "").trim();
  if (!raw) return resolveColor(NAMED_COLORS.pink);
  try {
    return resolveColor(raw);
  } catch {
    return resolveColor(NAMED_COLORS.pink);
  }
}

// 컬러 문자열(이름/HEX) → 정수
function parseColor(input) {
  if (!input) return getDefaultColor();
  const key = input.toLowerCase().trim();
  const hex = NAMED_COLORS[key] || input; // 이름이면 프리셋, 아니면 그대로(HEX 기대)
  try {
    return resolveColor(hex);
  } catch {
    return getDefaultColor();
  }
}

// 채널별 마지막 공지 ID(수정/핀 편의)
const lastNoticeByChannel = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notice")
    .setNameLocalizations({ ko: "공지" })
    .setDescription("공지 등록/수정/삭제/스티키")
    .setDescriptionLocalizations({ ko: "공지 등록/수정/삭제/스티키" })

    // 공지 등록
    .addSubcommand(sub =>
      sub.setName("create").setNameLocalizations({ ko: "등록" })
        .setDescription("Create a notice").setDescriptionLocalizations({ ko: "공지 등록" })
        .addStringOption(o => o.setName("content").setNameLocalizations({ ko: "내용" })
          .setDescription("공지 내용").setRequired(true))
        .addStringOption(o => o.setName("title").setNameLocalizations({ ko: "제목" })
          .setDescription("제목(선택)"))
        .addStringOption(o => o.setName("color").setNameLocalizations({ ko: "컬러" })
          .setDescription("색상: 이름(pink, sky...) 또는 HEX(#FF69B4)"))
        .addBooleanOption(o => o.setName("pin").setNameLocalizations({ ko: "스티키" })
          .setDescription("등록 후 고정(핀)할까요?"))
    )

    // 공지 수정
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
          .setDescription("새 컬러: 이름 또는 HEX").setRequired(false))
        .addBooleanOption(o => o.setName("pin").setNameLocalizations({ ko: "스티키" })
          .setDescription("핀 상태를 이 값으로 갱신(true=핀, false=해제)").setRequired(false))
    )

    // 공지 삭제
    .addSubcommand(sub =>
      sub.setName("delete").setNameLocalizations({ ko: "삭제" })
        .setDescription("Delete a notice").setDescriptionLocalizations({ ko: "공지 삭제" })
        .addStringOption(o => o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
          .setDescription("삭제할 공지 메시지 ID (미입력 시 마지막 공지)").setRequired(false))
    )

    // 핀/해제만 따로
    .addSubcommand(sub =>
      sub.setName("pin").setNameLocalizations({ ko: "스티키" })
        .setDescription("Pin/Unpin a notice").setDescriptionLocalizations({ ko: "공지 핀/해제" })
        .addStringOption(o => o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
          .setDescription("대상 공지 메시지 ID (미입력 시 마지막 공지)").setRequired(false))
        .addBooleanOption(o => o.setName("on").setNameLocalizations({ ko: "켜기" })
          .setDescription("true=핀, false=해제").setRequired(true))
    )
    // 공지 관리는 보통 운영진만 → 메시지 관리 권한 필요
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.channel;

    // 헬퍼: 대상 메시지 찾기(입력 없으면 마지막 공지)
    const pickMessage = async () => {
      const id = interaction.options.getString("message_id") || lastNoticeByChannel.get(channel.id);
      if (!id) throw new Error("공지 메시지 ID를 찾지 못했어요.");
      return channel.messages.fetch(id);
    };

    if (sub === "create") {
      const content = interaction.options.getString("content", true);
      const title = interaction.options.getString("title") || "📢 공지";
      const colorStr = interaction.options.getString("color");
      const wantPin = interaction.options.getBoolean("pin") ?? false;

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(content)
        .setColor(parseColor(colorStr))
        .setFooter({ text: `by ${interaction.user.tag}` })
        .setTimestamp();

      const msg = await channel.send({ embeds: [embed] });

      // 마지막 공지 기억
      lastNoticeByChannel.set(channel.id, msg.id);

      // 핀 옵션
      if (wantPin) {
        try { await msg.pin(); } catch { /* 권한 없으면 무시 */ }
      }

      return interaction.reply({ content: `✅ 공지 등록 완료! (messageId: ${msg.id})`, ephemeral: true });
    }

    if (sub === "edit") {
      // 입력 검증: 최소 하나(제목/내용/컬러/핀) 바뀌어야 함
      const newContent = interaction.options.getString("content");
      const newTitle = interaction.options.getString("title");
      const newColor = interaction.options.getString("color");
      const pinState = interaction.options.getBoolean("pin");

      if (newContent == null && newTitle == null && newColor == null && pinState == null) {
        return interaction.reply({ content: "바꿀 항목이 없어요. (제목/내용/컬러/스티키 중 하나는 입력)", ephemeral: true });
      }

      try {
        const msg = await pickMessage();
        const embed = EmbedBuilder.from(msg.embeds?.[0] || new EmbedBuilder());

        if (newTitle != null) embed.setTitle(newTitle || null);
        if (newContent != null) embed.setDescription(newContent || null);
        if (newColor != null) embed.setColor(parseColor(newColor));

        await msg.edit({ embeds: [embed] });

        if (pinState != null) {
          try {
            if (pinState) await msg.pin();
            else await msg.unpin();
          } catch { /* 권한 없으면 무시 */ }
        }

        // 마지막 공지 갱신
        lastNoticeByChannel.set(channel.id, msg.id);

        return interaction.reply({ content: "✏️ 공지 수정 완료!", ephemeral: true });
      } catch {
        return interaction.reply({ content: "❌ 공지 메시지를 찾지 못했어요.", ephemeral: true });
      }
    }

    if (sub === "delete") {
      try {
        const msg = await pickMessage();
        await msg.delete();
        if (lastNoticeByChannel.get(channel.id) === msg.id) {
          lastNoticeByChannel.delete(channel.id);
        }
        return interaction.reply({ content: "🗑️ 공지 삭제 완료!", ephemeral: true });
      } catch {
        return interaction.reply({ content: "❌ 공지 메시지를 찾지 못했어요.", ephemeral: true });
      }
    }

    if (sub === "pin") {
      const on = interaction.options.getBoolean("on", true);
      try {
        const msg = await pickMessage();
        try {
          if (on) await msg.pin();
          else await msg.unpin();
        } catch {
          return interaction.reply({ content: "권한이 없어 핀/해제를 못 했어요. (Manage Messages 필요)", ephemeral: true });
        }
        // 마지막 공지 갱신
        lastNoticeByChannel.set(channel.id, msg.id);
        return interaction.reply({ content: on ? "📌 핀 완료!" : "📎 핀 해제!", ephemeral: true });
      } catch {
        return interaction.reply({ content: "❌ 공지 메시지를 찾지 못했어요.", ephemeral: true });
      }
    }
  }
};
