// scripts/register.js — 슬래시 명령어 등록(한글 전용)
// 실행:  node scripts/register.js
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, ChannelType } = require("discord.js");

const { BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!BOT_TOKEN || !CLIENT_ID) {
  console.error("❌ BOT_TOKEN 또는 CLIENT_ID가 .env에 없습니다.");
  process.exit(1);
}

// 공지 보내기(스티키/핀 포함)
const 아리공지 = new SlashCommandBuilder()
  .setName("아리공지")
  .setDescription("공지 보내기 / 스티키 / 핀 고정")
  .addStringOption(o =>
    o.setName("content")
      .setDescription("공지 본문 (줄바꿈은 \\n 또는 <br>)")
      .setRequired(true)
  )
  .addStringOption(o =>
    o.setName("title").setDescription("제목").setRequired(false)
  )
  .addStringOption(o =>
    o.setName("style")
      .setDescription("스타일 선택")
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
    o.setName("pin").setDescription("핀 고정 여부").setRequired(false)
  )
  .addBooleanOption(o =>
    o.setName("sticky").setDescription("스티키 공지로 유지").setRequired(false)
  )
  .addIntegerOption(o =>
    o.setName("hold")
      .setDescription("스티키 유지 시간(분), 0=무한")
      .setMinValue(0)
      .setMaxValue(24 * 60)
      .setRequired(false)
  )
  .addBooleanOption(o =>
    o.setName("edit").setDescription("현재 스티키 공지를 수정 모드로 보냄").setRequired(false)
  );

// 공지 수정(특정 메시지ID 또는 현재 스티키)
const 아리공지수정 = new SlashCommandBuilder()
  .setName("아리공지수정")
  .setDescription("스티키 공지(또는 지정 메시지)를 수정")
  .addStringOption(o =>
    o.setName("content")
      .setDescription("수정할 본문 (줄바꿈은 \\n 또는 <br>)")
      .setRequired(true)
  )
  .addStringOption(o =>
    o.setName("message")
      .setDescription("수정할 메시지 ID (비우면 현재 채널의 스티키)")
      .setRequired(false)
  )
  .addStringOption(o =>
    o.setName("title").setDescription("제목").setRequired(false)
  )
  .addStringOption(o =>
    o.setName("style")
      .setDescription("스타일 선택")
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
    o.setName("pin").setDescription("핀 고정/해제").setRequired(false)
  )
  .addChannelOption(o =>
    o.setName("channel")
      .setDescription("수정할 채널 (기본: 현재 채널)")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false)
  );

// 아리 (모집) — 한글 서브커맨드
const 아리 = new SlashCommandBuilder()
  .setName("아리")
  .setDescription("모집 관련 명령어들")

  // 만들기
  .addSubcommand(s =>
    s.setName("만들기")
      .setDescription("모집글 생성")
      .addStringOption(o =>
        o.setName("content").setDescription("제목/내용").setRequired(true)
      )
      .addIntegerOption(o => {
        const opt = o.setName("max").setDescription("정원").setRequired(true)
          .setMinValue(2).setMaxValue(120);
        // 자주 쓰는 정원 프리셋(선택지)
        [
          8, 12, 16,
          20, 28, 32, 40, 56, 60
        ].forEach(n => opt.addChoices({ name: String(n), value: n }));
        return opt;
      })
  )

  // 수정
  .addSubcommand(s =>
    s.setName("수정")
      .setDescription("모집글 수정")
      .addStringOption(o =>
        o.setName("message").setDescription("메시지 ID/링크(생략 시 최근 본인 글)").setRequired(false)
      )
      .addStringOption(o =>
        o.setName("content").setDescription("새 제목/내용").setRequired(false)
      )
      .addIntegerOption(o => {
        const opt = o.setName("max").setDescription("새 정원").setRequired(false)
          .setMinValue(2).setMaxValue(120);
        [4, 5, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100, 120]
          .forEach(n => opt.addChoices({ name: String(n), value: n }));
        return opt;
      })
  )

  // 현황
  .addSubcommand(s =>
    s.setName("현황").setDescription("내 모집 현황")
  )

  // 삭제
  .addSubcommand(s =>
    s.setName("삭제").setDescription("내 모집글 모두 삭제")
  )

  // 핑
  .addSubcommand(s =>
    s.setName("핑")
      .setDescription("참가자 멘션")
      .addStringOption(o =>
        o.setName("message").setDescription("메시지 ID").setRequired(true)
      )
  )

  // 복사
  .addSubcommand(s =>
    s.setName("복사")
      .setDescription("모집글 복사")
      .addStringOption(o =>
        o.setName("message").setDescription("메시지 ID").setRequired(true)
      )
  );

const commands = [
  아리공지.toJSON(),
  아리공지수정.toJSON(),
  아리.toJSON(),
];

(async () => {
  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
      );
      console.log("✅ 길드 명령 등록 완료 (빠르게 반영)");
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
      console.log("✅ 전역 명령 등록 완료(전파까지 최대 1시간)");
    }
  } catch (e) {
    console.error("❌ 명령 등록 실패:", e);
    process.exit(1);
  }
})();
