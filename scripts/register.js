// scripts/register.js — 슬래시 커맨드 등록(복붙)
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const { BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!BOT_TOKEN || !CLIENT_ID) {
  console.error("❌ BOT_TOKEN 또는 CLIENT_ID가 없습니다 (.env 확인)");
  process.exit(1);
}

// ───────────────────────────── 공통 선택지 ─────────────────────────────
const MAX_CHOICES = [
  { name: "8명",  value: 8 },
  { name: "12명", value: 12 },
  { name: "16명", value: 16 },
  { name: "20명", value: 20 },
  { name: "28명", value: 28 },
  { name: "32명", value: 32 },
  { name: "40명", value: 40 },
  { name: "56명", value: 56 },
  { name: "64명", value: 64 },
];

// ───────────────────────────── 공지(아리공지) ─────────────────────────────
const notice = new SlashCommandBuilder()
  .setName("notice") // 영문 고정
  .setNameLocalizations({ ko: "아리공지" }) // 한국어 표시는 /아리공지
  .setDescription("Send a notice / sticky / pin")
  .setDescriptionLocalizations({ ko: "공지 보내기 / 스티키 / 핀 고정" })
  .addStringOption(o =>
    o.setName("content")
      .setDescription("Notice body")
      .setDescriptionLocalizations({ ko: "공지 본문 (줄바꿈: \\n 또는 <br>)" })
      .setRequired(true)
  )
  .addStringOption(o =>
    o.setName("title")
      .setDescription("Notice title")
      .setDescriptionLocalizations({ ko: "공지 제목" })
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
      .setDescription("Pin on/off")
      .setDescriptionLocalizations({ ko: "핀 고정/해제" })
      .setRequired(false)
  )
  .addBooleanOption(o =>
    o.setName("sticky")
      .setDescription("Keep as sticky")
      .setDescriptionLocalizations({ ko: "스티키로 유지" })
      .setRequired(false)
  )
  .addIntegerOption(o =>
    o.setName("hold")
      .setDescription("Sticky hold minutes (0=forever)")
      .setDescriptionLocalizations({ ko: "스티키 유지 시간(분, 0=무기한)" })
      .setMinValue(0)
      .setRequired(false)
  )
  .addBooleanOption(o =>
    o.setName("edit")
      .setDescription("Edit current sticky if present")
      .setDescriptionLocalizations({ ko: "현재 스티키가 있으면 수정" })
      .setRequired(false)
  );

// (선택) /notice-edit → 한국어 표시는 /아리공지수정
const noticeEdit = new SlashCommandBuilder()
  .setName("notice-edit")
  .setNameLocalizations({ ko: "아리공지수정" })
  .setDescription("Edit sticky notice or a specified message")
  .setDescriptionLocalizations({ ko: "스티키 공지(또는 지정 메시지)를 수정" })
  .addStringOption(o =>
    o.setName("content")
      .setDescription("Body")
      .setDescriptionLocalizations({ ko: "본문 (줄바꿈: \\n 또는 <br>)" })
      .setRequired(true)
  )
  .addStringOption(o =>
    o.setName("message")
      .setDescription("Target message ID (blank: current sticky)")
      .setDescriptionLocalizations({ ko: "대상 메시지 ID (비우면 현재 스티키)" })
      .setRequired(false)
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
      .setDescription("Pin on/off")
      .setDescriptionLocalizations({ ko: "핀 고정/해제" })
      .setRequired(false)
  );

// ───────────────────────────── 모집(아리) ─────────────────────────────
const ari = new SlashCommandBuilder()
  .setName("ari")
  .setDescription("Recruit commands")
  .setDescriptionLocalizations({ ko: "모집 관련" })

  .addSubcommand(s => s
    .setName("create")
    .setNameLocalizations({ ko: "만들기" })
    .setDescription("Create a recruit")
    .setDescriptionLocalizations({ ko: "모집글 생성" })
    .addStringOption(o =>
      o.setName("content")
        .setDescription("Title/Content")
        .setDescriptionLocalizations({ ko: "제목/내용" })
        .setRequired(true)
    )
    .addIntegerOption(o => {
      const opt = o.setName("max")
        .setDescription("Max members")
        .setDescriptionLocalizations({ ko: "정원 선택" })
        .setRequired(true);
      MAX_CHOICES.forEach(c => opt.addChoices(c));
      return opt;
    })
  )

  .addSubcommand(s => s
    .setName("edit")
    .setNameLocalizations({ ko: "수정" })
    .setDescription("Edit a recruit")
    .setDescriptionLocalizations({ ko: "모집글 수정" })
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Message ID/Link (optional)")
        .setDescriptionLocalizations({ ko: "메시지 ID/링크(선택)" })
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName("content")
        .setDescription("New title (optional)")
        .setDescriptionLocalizations({ ko: "새 제목(선택)" })
        .setRequired(false)
    )
    .addIntegerOption(o => {
      const opt = o.setName("max")
        .setDescription("New max (optional)")
        .setDescriptionLocalizations({ ko: "새 정원(선택)" })
        .setRequired(false);
      MAX_CHOICES.forEach(c => opt.addChoices(c));
      return opt;
    })
  )

  .addSubcommand(s => s
    .setName("status")
    .setNameLocalizations({ ko: "현황" })
    .setDescription("My recruit status")
    .setDescriptionLocalizations({ ko: "내 모집 현황" })
  )

  .addSubcommand(s => s
    .setName("delete")
    .setNameLocalizations({ ko: "삭제" })
    .setDescription("Delete my recruits")
    .setDescriptionLocalizations({ ko: "내 모집글 모두 삭제" })
  )

  .addSubcommand(s => s
    .setName("ping")
    .setNameLocalizations({ ko: "핑" })
    .setDescription("Ping participants")
    .setDescriptionLocalizations({ ko: "참가자 멘션" })
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Target message ID")
        .setDescriptionLocalizations({ ko: "대상 메시지 ID" })
        .setRequired(true)
    )
  )

  .addSubcommand(s => s
    .setName("copy")
    .setNameLocalizations({ ko: "복사" })
    .setDescription("Copy a recruit")
    .setDescriptionLocalizations({ ko: "모집글 복사" })
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Target message ID")
        .setDescriptionLocalizations({ ko: "대상 메시지 ID" })
        .setRequired(true)
    )
  );

const commands = [notice, noticeEdit, ari].map(c => c.toJSON());

// ───────────────────────────── 등록 ─────────────────────────────
(async () => {
  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
      );
      console.log("✅ Guild commands registered");
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
      console.log("✅ Global commands registered");
    }
  } catch (e) {
    console.error("❌ Register failed:", e?.rawError || e);
  }
})();
