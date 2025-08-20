// scripts/register.js — 슬래시 커맨드 등록 (한 번 실행해 등록하면 됨)
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
  console.error("BOT_TOKEN/CLIENT_ID 누락");
  process.exit(1);
}

// /notice (ko: 아리공지)
const notice = new SlashCommandBuilder()
  .setName("notice")
  .setNameLocalizations({ ko: "아리공지" })
  .setDescription("Send a notice / sticky / pin")
  .setDescriptionLocalizations({ ko: "공지 보내기 / 스티키 / 핀 고정" })
  .addStringOption((o) =>
    o.setName("content").setDescription("Body").setDescriptionLocalizations({ ko: "본문 내용 (\\n / <br> 줄바꿈)" }).setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("title").setDescription("Title").setDescriptionLocalizations({ ko: "제목" }).setRequired(false)
  )
  .addStringOption((o) =>
    o
      .setName("style")
      .setDescription("Style")
      .setDescriptionLocalizations({ ko: "스타일" })
      .addChoices(
        { name: "embed-purple", value: "embed-purple" },
        { name: "embed-blue", value: "embed-blue" },
        { name: "embed-min", value: "embed-min" },
        { name: "code", value: "code" },
        { name: "plain", value: "plain" }
      )
      .setRequired(false)
  )
  .addBooleanOption((o) => o.setName("pin").setDescription("Pin message").setDescriptionLocalizations({ ko: "핀 고정" }).setRequired(false))
  .addBooleanOption((o) => o.setName("sticky").setDescription("Sticky on").setDescriptionLocalizations({ ko: "스티키 유지" }).setRequired(false))
  .addIntegerOption((o) =>
    o
      .setName("hold")
      .setDescription("Sticky hold minutes (0=infinite)")
      .setDescriptionLocalizations({ ko: "스티키 유지(분) 0=무한" })
      .setRequired(false)
  )
  .addBooleanOption((o) => o.setName("edit").setDescription("Edit sticky").setDescriptionLocalizations({ ko: "현재 스티키 수정" }).setRequired(false))
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("Target channel (default: here)")
      .setDescriptionLocalizations({ ko: "대상 채널 (기본: 현재)" })
      .setRequired(false)
  );

// /notice-edit (ko: 아리공지수정)
const noticeEdit = new SlashCommandBuilder()
  .setName("notice-edit")
  .setNameLocalizations({ ko: "아리공지수정" })
  .setDescription("Edit current sticky (or a specific message)")
  .setDescriptionLocalizations({ ko: "현재 스티키(또는 지정 메시지)를 수정" })
  .addStringOption((o) =>
    o
      .setName("content")
      .setDescription("Body")
      .setDescriptionLocalizations({ ko: "본문 내용 (\\n / <br> 줄바꿈)" })
      .setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("message").setDescription("Message ID (default: sticky)").setDescriptionLocalizations({ ko: "메시지 ID(기본: 현재 스티키)" }).setRequired(false)
  )
  .addStringOption((o) =>
    o.setName("title").setDescription("Title").setDescriptionLocalizations({ ko: "제목" }).setRequired(false)
  )
  .addStringOption((o) =>
    o
      .setName("style")
      .setDescription("Style")
      .setDescriptionLocalizations({ ko: "스타일" })
      .addChoices(
        { name: "embed-purple", value: "embed-purple" },
        { name: "embed-blue", value: "embed-blue" },
        { name: "embed-min", value: "embed-min" },
        { name: "code", value: "code" },
        { name: "plain", value: "plain" }
      )
      .setRequired(false)
  )
  .addBooleanOption((o) => o.setName("pin").setDescription("Pin/unpin").setDescriptionLocalizations({ ko: "핀 고정/해제" }).setRequired(false))
  .addChannelOption((o) =>
    o.setName("channel").setDescription("Target channel").setDescriptionLocalizations({ ko: "수정할 채널" }).setRequired(false)
  );

// /ari (ko 로컬라이즈된 서브커맨드 이름만 보이게)
const ari = new SlashCommandBuilder()
  .setName("ari")
  .setNameLocalizations({ ko: "아리" })
  .setDescription("Recruitment")
  .setDescriptionLocalizations({ ko: "모집" })
  .addSubcommand((s) =>
    s
      .setName("create")
      .setNameLocalizations({ ko: "만들기" })
      .setDescription("Create")
      .setDescriptionLocalizations({ ko: "모집글 생성" })
      .addStringOption((o) => o.setName("content").setDescription("Title").setDescriptionLocalizations({ ko: "제목/내용" }).setRequired(true))
      .addIntegerOption((o) =>
        o
          .setName("max")
          .setDescription("Max")
          .setDescriptionLocalizations({ ko: "정원(선택지)" })
          .addChoices(
            { name: "8", value: 8 },
            { name: "12", value: 12 },
            { name: "16", value: 16 },
            { name: "20", value: 20 },
            { name: "28", value: 28 },
            { name: "32", value: 32 },
            { name: "40", value: 40 },
            { name: "56", value: 56 },
            { name: "60", value: 60 }
          )
          .setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("edit")
      .setNameLocalizations({ ko: "수정" })
      .setDescription("Edit")
      .setDescriptionLocalizations({ ko: "모집글 수정" })
      .addStringOption((o) => o.setName("message").setDescription("Message ID/Link").setDescriptionLocalizations({ ko: "메시지ID/링크" }).setRequired(false))
      .addStringOption((o) => o.setName("content").setDescription("New title").setDescriptionLocalizations({ ko: "새 제목" }).setRequired(false))
      .addIntegerOption((o) =>
        o
          .setName("max")
          .setDescription("New max")
          .setDescriptionLocalizations({ ko: "새 정원(선택지)" })
          .addChoices(
            { name: "8", value: 8 },
            { name: "12", value: 12 },
            { name: "16", value: 16 },
            { name: "20", value: 20 },
            { name: "28", value: 28 },
            { name: "32", value: 32 },
            { name: "40", value: 40 },
            { name: "56", value: 56 },
            { name: "60", value: 60 }
          )
          .setRequired(false)
      )
  )
  .addSubcommand((s) => s.setName("status").setNameLocalizations({ ko: "현황" }).setDescription("My rooms").setDescriptionLocalizations({ ko: "내 모집 현황" }))
  .addSubcommand((s) => s.setName("delete").setNameLocalizations({ ko: "삭제" }).setDescription("Delete mine").setDescriptionLocalizations({ ko: "내 모집글 모두 삭제" }))
  .addSubcommand((s) =>
    s
      .setName("ping")
      .setNameLocalizations({ ko: "핑" })
      .setDescription("Ping participants")
      .setDescriptionLocalizations({ ko: "참가자 멘션" })
      .addStringOption((o) => o.setName("message").setDescription("Message ID").setDescriptionLocalizations({ ko: "메시지 ID" }).setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("copy")
      .setNameLocalizations({ ko: "복사" })
      .setDescription("Copy room")
      .setDescriptionLocalizations({ ko: "모집글 복사" })
      .addStringOption((o) => o.setName("message").setDescription("Message ID").setDescriptionLocalizations({ ko: "메시지 ID" }).setRequired(true))
  );

const commands = [notice.toJSON(), noticeEdit.toJSON(), ari.toJSON()];

(async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
      console.log("✅ Guild commands registered");
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log("✅ Global commands registered");
    }
  } catch (e) {
    console.error("register fail:", e);
  }
})();
