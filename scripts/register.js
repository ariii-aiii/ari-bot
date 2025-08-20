// scripts/register.js — 슬래시 명령 등록
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID || "";

if (!BOT_TOKEN || !CLIENT_ID) {
  console.error("❌ BOT_TOKEN 또는 CLIENT_ID 누락");
  process.exit(1);
}

// ───────── /notice (아리공지)
const notice = new SlashCommandBuilder()
  .setName("notice")
  .setNameLocalizations({ ko: "아리공지" })
  .setDescription("공지 보내기 / 스티키 / 핀 고정")
  .setDescriptionLocalizations({ ko: "공지 보내기 / 스티키 / 핀 고정" })
  .addStringOption(o => o.setName("content").setDescription("본문 (\\n, <br> 줄바꿈)").setRequired(true))
  .addStringOption(o => o.setName("title").setDescription("제목").setRequired(false))
  .addStringOption(o => o.setName("style").setDescription("스타일").addChoices(
    { name: "embed-purple", value: "embed-purple" },
    { name: "embed-blue",   value: "embed-blue"   },
    { name: "embed-min",    value: "embed-min"    },
    { name: "code",         value: "code"         },
    { name: "plain",        value: "plain"        }
  ).setRequired(false))
  .addBooleanOption(o => o.setName("pin").setDescription("핀 고정").setRequired(false))
  .addBooleanOption(o => o.setName("sticky").setDescription("스티키로 유지").setRequired(false))
  .addIntegerOption(o => o.setName("hold").setDescription("스티키 유지(분) 0=무한").setRequired(false));

// ───────── /notice-edit (아리공지수정)
const noticeEdit = new SlashCommandBuilder()
  .setName("notice-edit")
  .setNameLocalizations({ ko: "아리공지수정" })
  .setDescription("스티키 공지(또는 지정 메시지) 수정")
  .setDescriptionLocalizations({ ko: "스티키 공지(또는 지정 메시지) 수정" })
  .addStringOption(o => o.setName("content").setDescription("본문 (\\n, <br> 줄바꿈)").setRequired(true))
  .addStringOption(o => o.setName("message").setDescription("메시지 ID (비우면 현재 스티키)").setRequired(false))
  .addStringOption(o => o.setName("title").setDescription("제목").setRequired(false))
  .addStringOption(o => o.setName("style").setDescription("스타일").addChoices(
    { name: "embed-purple", value: "embed-purple" },
    { name: "embed-blue",   value: "embed-blue"   },
    { name: "embed-min",    value: "embed-min"    },
    { name: "code",         value: "code"         },
    { name: "plain",        value: "plain"        }
  ).setRequired(false))
  .addBooleanOption(o => o.setName("pin").setDescription("핀 고정/해제").setRequired(false));

// ───────── /ari (아리 만들기/수정/현황/삭제/핑/복사)
const maxChoices = [8, 12, 16, 20, 28, 32, 40, 56, 60];
const ari = new SlashCommandBuilder()
  .setName("ari").setNameLocalizations({ ko: "아리" }).setDescription("모집 관련")
  .addSubcommand(s => s.setName("make").setNameLocalizations({ ko: "만들기" }).setDescription("모집글 생성")
    .addStringOption(o => o.setName("content").setNameLocalizations({ ko: "내용" }).setDescription("모집 제목/내용").setRequired(true))
    .addIntegerOption(o => {
      const io = o.setName("max").setNameLocalizations({ ko: "정원" }).setDescription("정원").setRequired(true);
      maxChoices.forEach(n => io.addChoices({ name: String(n), value: n }));
      return io;
    })
  )
  .addSubcommand(s => s.setName("edit").setNameLocalizations({ ko: "수정" }).setDescription("모집글 수정")
    .addStringOption(o => o.setName("message").setNameLocalizations({ ko: "메시지" }).setDescription("메시지 ID/링크").setRequired(false))
    .addStringOption(o => o.setName("content").setNameLocalizations({ ko: "내용" }).setDescription("새 제목").setRequired(false))
    .addIntegerOption(o => {
      const io = o.setName("max").setNameLocalizations({ ko: "정원" }).setDescription("새 정원").setRequired(false);
      maxChoices.forEach(n => io.addChoices({ name: String(n), value: n }));
      return io;
    })
  )
  .addSubcommand(s => s.setName("status").setNameLocalizations({ ko: "현황" }).setDescription("내 모집 현황"))
  .addSubcommand(s => s.setName("delete").setNameLocalizations({ ko: "삭제" }).setDescription("내 모집글 모두 삭제"))
  .addSubcommand(s => s.setName("ping").setNameLocalizations({ ko: "핑" }).setDescription("참가자 멘션")
    .addStringOption(o => o.setName("message").setNameLocalizations({ ko: "메시지" }).setDescription("메시지 ID").setRequired(true)))
  .addSubcommand(s => s.setName("copy").setNameLocalizations({ ko: "복사" }).setDescription("모집글 복사")
    .addStringOption(o => o.setName("message").setNameLocalizations({ ko: "메시지" }).setDescription("메시지 ID").setRequired(true)));

const commands = [notice, noticeEdit, ari].map(c => c.toJSON());

(async () => {
  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log("✅ Guild commands registered");
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log("✅ Global commands registered");
    }
  } catch (e) {
    console.error("❌ register fail:", e);
  }
})();
