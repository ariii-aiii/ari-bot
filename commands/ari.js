// commands/ari.js — 모집 커맨드 스펙
const { SlashCommandBuilder } = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("ari")
  .setNameLocalizations({ ko: "아리" })
  .setDescription("Recruitment helper")
  .setDescriptionLocalizations({ ko: "모집 관련" })

  .addSubcommand(s =>
    s.setName("create")
     .setNameLocalizations({ ko: "만들기" })
     .setDescription("Create a new recruit post")
     .setDescriptionLocalizations({ ko: "모집글 생성" })
     .addStringOption(o =>
       o.setName("content")
        .setDescription("Title/Body")
        .setDescriptionLocalizations({ ko: "제목/내용" })
        .setRequired(true))
     .addIntegerOption(o =>
       o.setName("max")
        .setDescription("Max participants")
        .setDescriptionLocalizations({ ko: "정원" })
        .setRequired(true))
  )

  .addSubcommand(s =>
    s.setName("edit")
     .setNameLocalizations({ ko: "수정" })
     .setDescription("Edit your recruit post")
     .setDescriptionLocalizations({ ko: "모집글 수정" })
     .addStringOption(o =>
       o.setName("message")
        .setDescription("Message ID or link")
        .setDescriptionLocalizations({ ko: "메시지ID/링크" })
        .setRequired(false))
     .addStringOption(o =>
       o.setName("content")
        .setDescription("New title")
        .setDescriptionLocalizations({ ko: "새 제목" })
        .setRequired(false))
     .addIntegerOption(o =>
       o.setName("max")
        .setDescription("New max")
        .setDescriptionLocalizations({ ko: "새 정원" })
        .setRequired(false))
  )

  .addSubcommand(s =>
    s.setName("status")
     .setNameLocalizations({ ko: "현황" })
     .setDescription("My recruitment status")
     .setDescriptionLocalizations({ ko: "내 모집 현황" })
  )

  .addSubcommand(s =>
    s.setName("delete")
     .setNameLocalizations({ ko: "삭제" })
     .setDescription("Delete all my recruit posts")
     .setDescriptionLocalizations({ ko: "내 모집글 모두 삭제" })
  )

  .addSubcommand(s =>
    s.setName("ping")
     .setNameLocalizations({ ko: "핑" })
     .setDescription("Mention participants")
     .setDescriptionLocalizations({ ko: "참가자 멘션" })
     .addStringOption(o =>
       o.setName("message")
        .setDescription("Message ID")
        .setDescriptionLocalizations({ ko: "메시지ID" })
        .setRequired(true))
  )

  .addSubcommand(s =>
    s.setName("copy")
     .setNameLocalizations({ ko: "복사" })
     .setDescription("Copy a recruit post")
     .setDescriptionLocalizations({ ko: "모집글 복사" })
     .addStringOption(o =>
       o.setName("message")
        .setDescription("Message ID")
        .setDescriptionLocalizations({ ko: "메시지ID" })
        .setRequired(true))
  );

module.exports = { data };
