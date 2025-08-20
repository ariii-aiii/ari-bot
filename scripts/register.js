// register.js — 슬래시 커맨드 등록
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
  console.error("BOT_TOKEN/CLIENT_ID 누락"); process.exit(1);
}

// ───────────────────────── 공지
const notice = new SlashCommandBuilder()
  .setName("notice")
  .setNameLocalizations({ ko: "아리공지" })
  .setDescription("공지 보내기/스티키/핀 고정")
  .setDescriptionLocalizations({ ko: "공지 보내기 / 스티키 / 핀 고정" })
  .addStringOption(o => o.setName("content").setDescription("본문").setDescriptionLocalizations({ko:"공지 본문 (\\n, <br> 줄바꿈 인식)" }).setRequired(true))
  .addStringOption(o => o.setName("title").setDescription("제목").setDescriptionLocalizations({ko:"제목"}))
  .addStringOption(o => o.setName("style").setDescription("스타일").setDescriptionLocalizations({ko:"스타일"}).addChoices(
    { name:"embed-purple", value:"embed-purple" },
    { name:"embed-blue",   value:"embed-blue"   },
    { name:"embed-min",    value:"embed-min"    },
    { name:"code",         value:"code"         },
    { name:"plain",        value:"plain"        },
  ))
  .addBooleanOption(o => o.setName("pin").setDescription("핀 고정").setDescriptionLocalizations({ko:"핀 고정"}))
  .addBooleanOption(o => o.setName("sticky").setDescription("스티키 유지").setDescriptionLocalizations({ko:"스티키 유지"}))
  .addIntegerOption(o => o.setName("hold").setDescription("스티키 유지(분) 0=무한").setDescriptionLocalizations({ko:"스티키 유지 시간(분) 0=무한"}))
  .addBooleanOption(o => o.setName("edit").setDescription("현재 스티키 수정").setDescriptionLocalizations({ko:"현재 스티키를 수정"}));

// 공지 수정(별도)
const noticeEdit = new SlashCommandBuilder()
  .setName("notice-edit")
  .setNameLocalizations({ ko: "아리공지수정" })
  .setDescription("스티키 공지(또는 지정 메시지) 수정")
  .setDescriptionLocalizations({ ko: "스티키 공지(또는 지정 메시지)를 수정" })
  .addStringOption(o => o.setName("content").setDescription("본문").setDescriptionLocalizations({ko:"공지 본문 (\\n, <br> 줄바꿈 인식)"}).setRequired(true))
  .addStringOption(o => o.setName("message").setDescription("메시지 ID(비우면 현재 스티키)").setDescriptionLocalizations({ko:"메시지 ID (비우면 현재 스티키)"}))
  .addStringOption(o => o.setName("title").setDescription("제목").setDescriptionLocalizations({ko:"제목"}))
  .addStringOption(o => o.setName("style").setDescription("스타일").setDescriptionLocalizations({ko:"스타일"}).addChoices(
    { name:"embed-purple", value:"embed-purple" },
    { name:"embed-blue",   value:"embed-blue"   },
    { name:"embed-min",    value:"embed-min"    },
    { name:"code",         value:"code"         },
    { name:"plain",        value:"plain"        },
  ))
  .addBooleanOption(o => o.setName("pin").setDescription("핀 고정/해제").setDescriptionLocalizations({ko:"핀 고정/해제"}));

// ───────────────────────── 모집
const ari = new SlashCommandBuilder()
  .setName("ari")
  .setNameLocalizations({ ko: "아리" })
  .setDescription("모집 명령 모음")
  .setDescriptionLocalizations({ ko: "모집 명령 모음" })

  // 만들기
  .addSubcommand(s=>s.setName("create").setNameLocalizations({ko:"만들기"}).setDescription("모집글 생성").setDescriptionLocalizations({ko:"모집글 생성"})
    .addStringOption(o=>o.setName("content").setNameLocalizations({ko:"내용"}).setDescription("제목/내용").setDescriptionLocalizations({ko:"제목/내용"}).setRequired(true))
    .addIntegerOption(o=>o.setName("max").setNameLocalizations({ko:"정원"}).setDescription("정원").setDescriptionLocalizations({ko:"정원"}).setRequired(true)
      .addChoices(
        {name:"8", value:8},{name:"12", value:12},{name:"16", value:16},
        {name:"20", value:20},{name:"28", value:28},{name:"32", value:32},
        {name:"40", value:40},{name:"56", value:56},{name:"60", value:60},
      )
    )
  )

  // 수정
  .addSubcommand(s=>s.setName("edit").setNameLocalizations({ko:"수정"}).setDescription("모집글 수정").setDescriptionLocalizations({ko:"모집글 수정"})
    .addStringOption(o=>o.setName("message").setNameLocalizations({ko:"메시지"}).setDescription("메시지ID 또는 링크").setDescriptionLocalizations({ko:"메시지ID 또는 링크"}))
    .addStringOption(o=>o.setName("content").setNameLocalizations({ko:"내용"}).setDescription("새 제목/내용").setDescriptionLocalizations({ko:"새 제목/내용"}))
    .addIntegerOption(o=>o.setName("max").setNameLocalizations({ko:"정원"}).setDescription("새 정원").setDescriptionLocalizations({ko:"새 정원"})
      .addChoices(
        {name:"8", value:8},{name:"12", value:12},{name:"16", value:16},
        {name:"20", value:20},{name:"28", value:28},{name:"32", value:32},
        {name:"40", value:40},{name:"56", value:56},{name:"60", value:60},
      )
    )
  )

  // 현황
  .addSubcommand(s=>s.setName("status").setNameLocalizations({ko:"현황"}).setDescription("내 모집 현황").setDescriptionLocalizations({ko:"내 모집 현황"}))

  // 모두 삭제
  .addSubcommand(s=>s.setName("delete").setNameLocalizations({ko:"삭제"}).setDescription("내 모집 모두 삭제").setDescriptionLocalizations({ko:"내 모집 모두 삭제"}))

  // 핑
  .addSubcommand(s=>s.setName("ping").setNameLocalizations({ko:"핑"}).setDescription("참가자 멘션").setDescriptionLocalizations({ko:"참가자 멘션"})
    .addStringOption(o=>o.setName("message").setNameLocalizations({ko:"메시지"}).setDescription("메시지ID").setDescriptionLocalizations({ko:"메시지ID"}).setRequired(true))
  )

  // 복사
  .addSubcommand(s=>s.setName("copy").setNameLocalizations({ko:"복사"}).setDescription("모집글 복사").setDescriptionLocalizations({ko:"모집글 복사"})
    .addStringOption(o=>o.setName("message").setNameLocalizations({ko:"메시지"}).setDescription("메시지ID").setDescriptionLocalizations({ko:"메시지ID"}).setRequired(true))
  );

const commands = [notice.toJSON(), noticeEdit.toJSON(), ari.toJSON()];

(async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
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
    console.error("register fail:", e);
  }
})();
