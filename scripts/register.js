// scripts/register.js — 슬래시 커맨드 등록
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
  console.error("BOT_TOKEN/CLIENT_ID 누락"); process.exit(1);
}

const notice = new SlashCommandBuilder()
  .setName("notice").setDescription("공지 보내기/스티키/수정")
  .addStringOption(o=>o.setName("content").setDescription("본문").setRequired(true))
  .addStringOption(o=>o.setName("title").setDescription("제목").setRequired(false))
  .addStringOption(o=>o.setName("style").setDescription("스타일").addChoices(
    { name:"embed-purple", value:"embed-purple" },
    { name:"embed-blue",   value:"embed-blue"   },
    { name:"embed-min",    value:"embed-min"    },
    { name:"code",         value:"code"         },
    { name:"plain",        value:"plain"        },
  ).setRequired(false))
  .addBooleanOption(o=>o.setName("pin").setDescription("핀 고정").setRequired(false))
  .addBooleanOption(o=>o.setName("sticky").setDescription("스티키로 유지").setRequired(false))
  .addIntegerOption(o=>o.setName("hold").setDescription("스티키 유지(분) 0=무한").setRequired(false))
  .addBooleanOption(o=>o.setName("edit").setDescription("현재 스티키를 수정").setRequired(false));

const noticeEdit = require("../commands/notice-edit")({ stickyNotices:new Map(), utils:{} }).data; // spec만 꺼내기

const ari = new SlashCommandBuilder().setName("ari").setDescription("모집 관련")
  .addSubcommand(s=>s.setName("create").setDescription("모집글 생성")
    .addStringOption(o=>o.setName("content").setDescription("제목/내용").setRequired(true))
    .addIntegerOption(o=>o.setName("max").setDescription("정원").setRequired(true)))
  .addSubcommand(s=>s.setName("edit").setDescription("모집글 수정")
    .addStringOption(o=>o.setName("message").setDescription("메시지ID/링크").setRequired(false))
    .addStringOption(o=>o.setName("content").setDescription("새 제목").setRequired(false))
    .addIntegerOption(o=>o.setName("max").setDescription("새 정원").setRequired(false)))
  .addSubcommand(s=>s.setName("status").setDescription("내 모집 현황"))
  .addSubcommand(s=>s.setName("delete").setDescription("내 모집 모두 삭제"))
  .addSubcommand(s=>s.setName("ping").setDescription("참가자 멘션")
    .addStringOption(o=>o.setName("message").setDescription("메시지ID").setRequired(true)))
  .addSubcommand(s=>s.setName("copy").setDescription("모집글 복사")
    .addStringOption(o=>o.setName("message").setDescription("메시지ID").setRequired(true)));

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
