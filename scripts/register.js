// scripts/register.js — 슬래시 커맨드 등록
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
  console.error("❌ BOT_TOKEN/CLIENT_ID 누락");
  process.exit(1);
}

/* ───────────────── notice (공지) ───────────────── */
const notice = new SlashCommandBuilder()
  .setName("notice")
  .setNameLocalizations({ ko: "아리공지" }) // 공백 금지!
  .setDescription("Send a notice (sticky / edit support)")
  .setDescriptionLocalizations({ ko: "공지 보내기 (스티키/수정 지원)" })

  // ✅ 필수 옵션(content) 먼저
  .addStringOption((o) =>
    o
      .setName("content")
      .setDescription("Body text (use \\n or <br> for line breaks)")
      .setDescriptionLocalizations({
        ko: "본문 (줄바꿈은 \\n 또는 <br> 사용)",
      })
      .setRequired(true)
  )

  .addStringOption((o) =>
    o
      .setName("title")
      .setDescription("Title")
      .setDescriptionLocalizations({ ko: "제목" })
      .setRequired(false)
  )

  .addStringOption((o) =>
    o
      .setName("style")
      .setDescription("Embed style")
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

  .addBooleanOption((o) =>
    o
      .setName("pin")
      .setDescription("Pin/unpin")
      .setDescriptionLocalizations({ ko: "핀 고정/해제" })
      .setRequired(false)
  )

  .addBooleanOption((o) =>
    o
      .setName("sticky")
      .setDescription("Keep as sticky")
      .setDescriptionLocalizations({ ko: "스티키로 유지" })
      .setRequired(false)
  )

  .addIntegerOption((o) =>
    o
      .setName("hold")
      .setDescription("Sticky duration (minutes). 0 = infinite")
      .setDescriptionLocalizations({ ko: "스티키 유지(분) 0=무한" })
      .setMinValue(0)
      .setRequired(false)
  )

  .addBooleanOption((o) =>
    o
      .setName("edit")
      .setDescription("Edit current sticky instead of posting new")
      .setDescriptionLocalizations({ ko: "새로 보내지 않고 현재 스티키 수정" })
      .setRequired(false)
  );

/* ───────────── notice-edit (아리공지수정) ─────────────
   commands/notice-edit.js 에서 data만 끌어다 씀 (execute 불필요) */
const noticeEditData =
  require("../commands/notice-edit")({ stickyNotices: new Map(), utils: {} }).data;

/* ────────────────── ari (모집) ────────────────── */
const ari = new SlashCommandBuilder()
  .setName("ari")
  .setNameLocalizations({ ko: "아리" })
  .setDescription("Recruitment tools")
  .setDescriptionLocalizations({ ko: "모집 관련 도구" })

  .addSubcommand((s) =>
    s
      .setName("create")
      .setDescription("Create a room")
      .setDescriptionLocalizations({ ko: "모집글 생성" })
      .addStringOption((o) =>
        o
          .setName("content")
          .setDescription("Title/content")
          .setDescriptionLocalizations({ ko: "제목/내용" })
          .setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("max")
          .setDescription("Max participants")
          .setDescriptionLocalizations({ ko: "정원" })
          .setRequired(true)
      )
  )

  .addSubcommand((s) =>
    s
      .setName("edit")
      .setDescription("Edit a room")
      .setDescriptionLocalizations({ ko: "모집글 수정" })
      .addStringOption((o) =>
        o
          .setName("message")
          .setDescription("Message ID/Link")
          .setDescriptionLocalizations({ ko: "메시지ID/링크" })
          .setRequired(false)
      )
      .addStringOption((o) =>
        o
          .setName("content")
          .setDescription("New title")
          .setDescriptionLocalizations({ ko: "새 제목" })
          .setRequired(false)
      )
      .addIntegerOption((o) =>
        o
          .setName("max")
          .setDescription("New max")
          .setDescriptionLocalizations({ ko: "새 정원" })
          .setRequired(false)
      )
  )

  .addSubcommand((s) =>
    s
      .setName("status")
      .setDescription("My rooms status")
      .setDescriptionLocalizations({ ko: "내 모집 현황" })
  )

  .addSubcommand((s) =>
    s
      .setName("delete")
      .setDescription("Delete all my rooms")
      .setDescriptionLocalizations({ ko: "내 모집 모두 삭제" })
  )

  .addSubcommand((s) =>
    s
      .setName("ping")
      .setDescription("Ping participants")
      .setDescriptionLocalizations({ ko: "참가자 멘션" })
      .addStringOption((o) =>
        o
          .setName("message")
          .setDescription("Message ID")
          .setDescriptionLocalizations({ ko: "메시지ID" })
          .setRequired(true)
      )
  )

  .addSubcommand((s) =>
    s
      .setName("copy")
      .setDescription("Copy a room")
      .setDescriptionLocalizations({ ko: "모집글 복사" })
      .addStringOption((o) =>
        o
          .setName("message")
          .setDescription("Message ID")
          .setDescriptionLocalizations({ ko: "메시지ID" })
          .setRequired(true)
      )
  );

/* ───────────────── 등록 처리 ───────────────── */
const commands = [notice.toJSON(), noticeEditData.toJSON(), ari.toJSON()];

(async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID
        ),
        { body: commands }
      );
      console.log("✅ Guild commands registered");
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log("✅ Global commands registered");
    }
  } catch (e) {
    console.error("❌ register fail:", e);
  }
})();
