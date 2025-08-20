// commands/notice-edit.js — 스티키 공지 수정 (필수옵션: content 먼저)
const { SlashCommandBuilder, ChannelType } = require("discord.js");

module.exports = { data: new SlashCommandBuilder()
  .setName("notice-edit")
  .setNameLocalizations({ ko: "아리공지수정" }) // 공백 불가
  .setDescription("Edit the sticky notice or a specific message by ID.")
  .setDescriptionLocalizations({
    ko: "현재 채널의 스티키 공지(또는 지정 메시지)를 수정합니다.",
  })

  .addStringOption(o =>
    o.setName("content")
      .setDescription("Body text (use \\n or <br> for newlines)")
      .setDescriptionLocalizations({ ko: "본문 내용 (줄바꿈: \\n 또는 <br>)" })
      .setRequired(true)
  )
  .addStringOption(o =>
    o.setName("message")
      .setDescription("Target message ID (empty = current sticky)")
      .setDescriptionLocalizations({ ko: "수정할 메시지 ID (비우면 현재 스티키 공지)" })
      .setRequired(false)
  )
  .addStringOption(o =>
    o.setName("title")
      .setDescription("Title")
      .setDescriptionLocalizations({ ko: "공지 제목" })
      .setRequired(false)
  )
  .addStringOption(o =>
    o.setName("style")
      .setDescription("Style")
      .setDescriptionLocalizations({ ko: "공지 스타일 선택" })
      .addChoices(
        { name: "embed-purple", value: "embed-purple" },
        { name: "embed-blue",   value: "embed-blue"   },
        { name: "embed-min",    value: "embed-min"    },
        { name: "code",         value: "code"         },
        { name: "plain",        value: "plain"        },
      )
      .setRequired(false)
  )
  .addBooleanOption(o =>
    o.setName("pin")
      .setDescription("Pin/unpin")
      .setDescriptionLocalizations({ ko: "핀 고정/해제" })
      .setRequired(false)
  )
  .addChannelOption(o =>
    o.setName("channel")
      .setDescription("Channel to edit (default: current)")
      .setDescriptionLocalizations({ ko: "공지 수정할 채널 (기본: 현재 채널)" })
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false)
  )
};
