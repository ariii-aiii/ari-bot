// commands/notice.js — 공지 보내기/스티키
const { SlashCommandBuilder } = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("notice")
  .setNameLocalizations({ ko: "공지" })
  .setDescription("Send a notice with optional sticky/pin styles.")
  .setDescriptionLocalizations({ ko: "공지 보내기 / 스티키 / 핀 고정" })

  .addStringOption(o =>
    o.setName("content")
      .setDescription("Body text (use \\n or <br> for newlines)")
      .setDescriptionLocalizations({ ko: "본문 (줄바꿈은 \\n 또는 <br>)" })
      .setRequired(true)
  )
  .addStringOption(o =>
    o.setName("title")
      .setDescription("Title")
      .setDescriptionLocalizations({ ko: "제목" })
      .setRequired(false)
  )
  .addStringOption(o =>
    o.setName("style")
      .setDescription("Style")
      .setDescriptionLocalizations({ ko: "스타일" })
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
      .setDescription("Pin the message")
      .setDescriptionLocalizations({ ko: "핀 고정" })
      .setRequired(false)
  )
  .addBooleanOption(o =>
    o.setName("sticky")
      .setDescription("Keep sticky in channel")
      .setDescriptionLocalizations({ ko: "스티키 유지" })
      .setRequired(false)
  )
  .addIntegerOption(o =>
    o.setName("hold")
      .setDescription("Sticky hold minutes (0 = infinite)")
      .setDescriptionLocalizations({ ko: "스티키 유지 시간(분) 0=무한" })
      .setRequired(false)
  )
  .addBooleanOption(o =>
    o.setName("edit")
      .setDescription("Edit current sticky instead of sending new one")
      .setDescriptionLocalizations({ ko: "현재 스티키를 수정" })
      .setRequired(false)
  );

module.exports = { data };
