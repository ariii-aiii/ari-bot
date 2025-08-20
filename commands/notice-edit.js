// commands/notice-edit.js — 스티키 공지 수정 슬래시 커맨드 (필수옵션 먼저!)
const { SlashCommandBuilder, ChannelType } = require("discord.js");

module.exports = function setupNoticeEdit({ stickyNotices, utils }) {
  // \n / \\n / <br> → 실제 줄바꿈으로 변환
  const normalize = (text) =>
    (text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n");

  const data = new SlashCommandBuilder()
    .setName("notice-edit")
    .setNameLocalizations({ ko: "아리공지수정" }) // 명령어 한글 로컬 이름
    .setDescription("Edit the sticky notice (or a specific message) in this channel")
    .setDescriptionLocalizations({
      ko: "현재 채널의 스티키 공지(또는 지정 메시지)를 수정합니다.",
    })

    // 🔥 필수 옵션(content)을 제일 먼저!
    .addStringOption((o) =>
      o
        .setName("content")
        .setDescription("Body text (use \\n or <br> for new lines)")
        .setDescriptionLocalizations({ ko: "본문 내용 (줄바꿈: \\n 또는 <br>)" })
        .setRequired(true)
    )

    .addStringOption((o) =>
      o
        .setName("message")
        .setDescription("Target message ID (leave empty to edit current sticky)")
        .setDescriptionLocalizations({ ko: "수정할 메시지 ID (비우면 현재 스티키 공지)" })
        .setRequired(false)
    )

    .addStringOption((o) =>
      o
        .setName("title")
        .setDescription("Title (optional)")
        .setDescriptionLocalizations({ ko: "제목 (선택)" })
        .setRequired(false)
    )

    .addStringOption((o) =>
      o
        .setName("style")
        .setDescription("Style for the notice")
        .setDescriptionLocalizations({ ko: "공지 스타일 선택" })
        .addChoices(
          { name: "embed-purple", value: "embed-purple" },
          { name: "embed-blue", value: "embed-blue" },
          { name: "embed-min", value: "embed-min" },
          { name: "code", value: "code" },
          { name: "plain", value: "plain" } // ← 일반 텍스트(노멀)도 지원
        )
        .setRequired(false)
    )

    .addBooleanOption((o) =>
      o
        .setName("pin")
        .setDescription("Pin/Unpin the message")
        .setDescriptionLocalizations({ ko: "핀 고정/해제" })
        .setRequired(false)
    )

    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel to edit (default: current)")
        .setDescriptionLocalizations({ ko: "공지 수정할 채널 (기본: 현재 채널)" })
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    );

  async function execute(i) {
    const channel = i.options.getChannel("channel") || i.channel;

    const msgId =
      i.options.getString("message") ||
      stickyNotices.get(channel.id)?.lastMsgId;

    if (!msgId) {
      return i.reply({
        ephemeral: true,
        content:
          "수정할 메시지를 못 찾았어요. (메시지 ID를 주거나, 채널에 스티키가 있어야 해요)",
      });
    }

    const rawContent = i.options.getString("content", true);
    const rawTitle = i.options.getString("title") || "";
    const style = i.options.getString("style") || "embed-purple";
    const pin = i.options.getBoolean("pin");

    // 줄바꿈 치환 적용
    const content = normalize(rawContent);
    const title = normalize(rawTitle);

    await i.deferReply({ ephemeral: true });

    try {
      await utils.editStyledNoticeById(channel, msgId, {
        style,
        title,
        content,
        pin,
      });

      // 채널의 스티키 상태에도 반영
      const st = stickyNotices.get(channel.id);
      if (st && st.lastMsgId === msgId) {
        stickyNotices.set(channel.id, {
          ...st,
          style,
          title,
          content,
          pin,
          lastPostAt: Date.now(),
        });
      }

      return i.editReply("✏️ 공지를 수정했어요!");
    } catch (e) {
      console.error("[notice-edit] fail:", e);
      return i.editReply("수정 중 오류가 났어요 ㅠㅠ");
    }
  }

  return { data, execute };
};
