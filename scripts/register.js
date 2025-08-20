// scripts/register.js — 전체 슬래시 명령 등록 (아리 + 공지 + 공지수정)
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
  console.error("BOT_TOKEN/CLIENT_ID 누락"); process.exit(1);
}

/* /arinotice -> UI: /아리공지 */
const ariNotice = new SlashCommandBuilder()
  .setName("arinotice")
  .setNameLocalizations({ ko: "아리공지" })
  .setDescription("Send notice / sticky / pin")
  .setDescriptionLocalizations({ ko: "공지 보내기 / 스티키 / 핀 고정" })
  .addStringOption(o=>o.setName("content").setDescription("content").setDescriptionLocalizations({ ko:"본문 (\\n / <br> 줄바꿈)" }).setRequired(true))
  .addStringOption(o=>o.setName("title").setDescription("title").setDescriptionLocalizations({ ko:"제목" }))
  .addStringOption(o=>o.setName("style").setDescription("style").setDescriptionLocalizations({ ko:"스타일" }).addChoices(
    { name:"embed-purple", value:"embed-purple" },
    { name:"embed-blue",   value:"embed-blue"   },
    { name:"embed-min",    value:"embed-min"    },
    { name:"code",         value:"code"         },
    { name:"plain",        value:"plain"        },
  ))
  .addBooleanOption(o=>o.setName("pin").setDescription("pin").setDescriptionLocalizations({ ko:"핀 고정" }))
  .addBooleanOption(o=>o.setName("sticky").setDescription("sticky").setDescriptionLocalizations({ ko:"스티키 유지" }))
  .addIntegerOption(o=>o.setName("hold").setDescription("hold minutes").setDescriptionLocalizations({ ko:"스티키 유지(분) 0=무한" }));

/* /notice-edit -> UI: /아리공지수정 */
const noticeEdit = require("../commands/notice-edit")({ stickyNotices: new Map(), utils: {} }).data;

/* /ari -> UI: /아리 (만들기/수정/복사/삭제/핑/현황) */
const MAX_CHOICES = [8, 12, 16, 20, 28, 32, 40, 56, 60];
const ari = new SlashCommandBuilder()
  .setName("ari")
  .setNameLocalizations({ ko: "아리" })
  .setDescription("Recruit commands")
  .setDescriptionLocalizations({ ko: "모집 관련" })

  .addSubcommand(s => s.setName("create").setNameLocalizations({ ko:"만들기" }).setDescription("create")
    .setDescriptionLocalizations({ ko:"모집글 생성" })
    .addStringOption(o=>o.setName("content").setDescription("title").setDescriptionLocalizations({ ko:"제목/내용" }).setRequired(true))
    .addIntegerOption(o=>{
      o.setName("max").setDescription("max").setDescriptionLocalizations({ ko:"정원" }).setRequired(true);
      MAX_CHOICES.forEach(n=>o.addChoices({ name:String(n), value:n }));
      return o;
    })
  )

  .addSubcommand(s => s.setName("edit").setNameLocalizations({ ko:"수정" }).setDescription("edit")
    .setDescriptionLocalizations({ ko:"모집글 수정" })
    .addStringOption(o=>o.setName("message").setDescription("message id or link").setDescriptionLocalizations({ ko:"메시지ID/링크" }))
    .addStringOption(o=>o.setName("content").setDescription("new title").setDescriptionLocalizations({ ko:"새 제목" }))
    .addIntegerOption(o=>{
      o.setName("max").setDescription("new max").setDescriptionLocalizations({ ko:"새 정원" });
      MAX_CHOICES.forEach(n=>o.addChoices({ name:String(n), value:n }));
      return o;
    })
  )

  .addSubcommand(s => s.setName("status").setNameLocalizations({ ko:"현황" }).setDescription("status")
    .setDescriptionLocalizations({ ko:"내 모집 현황" })
  )

  .addSubcommand(s => s.setName("delete").setNameLocalizations({ ko:"삭제" }).setDescription("delete mine")
    .setDescriptionLocalizations({ ko:"내 모집글 모두 삭제" })
  )

  .addSubcommand(s => s.setName("ping").setNameLocalizations({ ko:"핑" }).setDescription("mention")
    .setDescriptionLocalizations({ ko:"참가자 멘션" })
    .addStringOption(o=>o.setName("message").setDescription("message id").setDescriptionLocalizations({ ko:"메시지ID" }).setRequired(true))
  )

  .addSubcommand(s => s.setName("copy").setNameLocalizations({ ko:"복사" }).setDescription("copy")
    .setDescriptionLocalizations({ ko:"모집글 복사" })
    .addStringOption(o=>o.setName("message").setDescription("message id").setDescriptionLocalizations({ ko:"메시지ID" }).setRequired(true))
  );

const commands = [ari.toJSON(), ariNotice.toJSON(), noticeEdit.toJSON()];

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
