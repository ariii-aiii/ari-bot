// scripts/register.js — 슬래시 커맨드 등록
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const { BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!BOT_TOKEN || !CLIENT_ID) {
  console.error("❌ BOT_TOKEN 또는 CLIENT_ID가 .env에 없습니다.");
  process.exit(1);
}

/**
 * /notice — 공지 보내기 (임베드/노멀/코드, 핀/스티키 옵션 포함)
 * 실제 동작은 index.js에서 처리하고, 여기서는 스키마만 등록합니다.
 */
const notice = new SlashCommandBuilder()
  .setName("notice")
  .setNameLocalizations({ ko: "공지" })
  .setDescription("Send a notice (embed/plain/code), pin, and optional sticky.")
  .setDescriptionLocalizations({ ko: "공지 보내기/스티키/수정" })
  .addStringOption(o =>
    o.setName("content")
      .setDescription("Body text (use \\n or <br> for new lines)")
      .setDescriptionLocalizations({ ko: "본문 (줄바꿈: \\n 또는 <br>)" })
      .setRequired(true)
  )
  .addStringOption(o =>
    o.setName("title")
      .setDescription("Title (optional)")
      .setDescriptionLocalizations({ ko: "제목 (선택)" })
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
        { name: "plain",        value: "plain"        }, // 일반 텍스트
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
      .setDescription("Keep sticky in this channel")
      .setDescriptionLocalizations({ ko: "이 채널에서 스티키 유지" })
      .setRequired(false)
  )
  .addIntegerOption(o =>
    o.setName("hold")
      .setDescription("Sticky hold minutes (0 = infinite)")
      .setDescriptionLocalizations({ ko: "스티키 유지(분) (0=무한)" })
      .setRequired(false)
  )
  .addBooleanOption(o =>
    o.setName("edit")
      .setDescription("Edit current sticky instead of sending new")
      .setDescriptionLocalizations({ ko: "새로 보내는 대신 현재 스티키 수정" })
      .setRequired(false)
  );

/**
 * /notice-edit — 스티키 공지(또는 특정 메시지) 수정
 * commands/notice-edit.js의 스키마(data)만 가져옵니다.
 */
const noticeEdit = require("../commands/notice-edit")({
  // 스키마만 필요하므로 더미 객체 전달
  stickyNotices: new Map(),
  utils: {}
}).data;

/**
 * /ari — 모집 관련 커맨드(생성/수정/현황/삭제/핑/복사)
 * 실제 동작은 index.js에서 처리하고, 여기서는 스키마만 등록합니다.
 */
const ari = new SlashCommandBuilder()
  .setName("ari")
  .setNameLocalizations({ ko: "아리" })
  .setDescription("Recruitment helpers")
  .setDescriptionLocalizations({ ko: "모집 관련" })

  .addSubcommand(s =>
    s.setName("create")
      .setNameLocalizations({ ko: "생성" })
      .setDescription("Create a recruitment message")
      .setDescriptionLocalizations({ ko: "모집글 생성" })
      .addStringOption(o =>
        o.setName("content")
          .setDescription("Title / content")
          .setDescriptionLocalizations({ ko: "제목/내용" })
          .setRequired(true)
      )
      .addIntegerOption(o =>
        o.setName("max")
          .setDescription("Max participants")
          .setDescriptionLocalizations({ ko: "정원" })
          .setRequired(true)
      )
  )

  .addSubcommand(s =>
    s.setName("edit")
      .setNameLocalizations({ ko: "수정" })
      .setDescription("Edit a recruitment message")
      .setDescriptionLocalizations({ ko: "모집글 수정" })
      .addStringOption(o =>
        o.setName("message")
          .setDescription("Message ID or link (optional)")
          .setDescriptionLocalizations({ ko: "메시지ID/링크 (선택)" })
          .setRequired(false)
      )
      .addStringOption(o =>
        o.setName("content")
          .setDescription("New title")
          .setDescriptionLocalizations({ ko: "새 제목" })
          .setRequired(false)
      )
      .addIntegerOption(o =>
        o.setName("max")
          .setDescription("New max")
          .setDescriptionLocalizations({ ko: "새 정원" })
          .setRequired(false)
      )
  )

  .addSubcommand(s =>
    s.setName("status")
      .setNameLocalizations({ ko: "현황" })
      .setDescription("Show your recruitment status")
      .setDescriptionLocalizations({ ko: "내 모집 현황" })
  )

  .addSubcommand(s =>
    s.setName("delete")
      .setNameLocalizations({ ko: "삭제" })
      .setDescription("Delete all recruitment messages created by you")
      .setDescriptionLocalizations({ ko: "내 모집 모두 삭제" })
  )

  .addSubcommand(s =>
    s.setName("ping")
      .setNameLocalizations({ ko: "핑" })
      .setDescription("Mention participants of a recruitment")
      .setDescriptionLocalizations({ ko: "참가자 멘션" })
      .addStringOption(o =>
        o.setName("message")
          .setDescription("Message ID")
          .setDescriptionLocalizations({ ko: "메시지 ID" })
          .setRequired(true)
      )
  )

  .addSubcommand(s =>
    s.setName("copy")
      .setNameLocalizations({ ko: "복사" })
      .setDescription("Copy a recruitment")
      .setDescriptionLocalizations({ ko: "모집글 복사" })
      .addStringOption(o =>
        o.setName("message")
          .setDescription("Message ID")
          .setDescriptionLocalizations({ ko: "메시지 ID" })
          .setRequired(true)
      )
  );

// 등록할 커맨드 묶기
const commands = [notice.toJSON(), noticeEdit.toJSON(), ari.toJSON()];

// 등록 실행
(async () => {
  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

  try {
    if (GUILD_ID) {
      // 길드 전용 등록 — 즉시 반영 (테스트/개발에 추천)
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
      );
      console.log("✅ Guild commands registered");
    } else {
      // 글로벌 등록 — 반영까지 최대 1시간가량 (디스코드 특성)
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
      console.log("✅ Global commands registered");
    }
  } catch (e) {
    console.error("❌ Register failed:", e);
  }
})();
