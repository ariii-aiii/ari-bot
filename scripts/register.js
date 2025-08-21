require("dotenv").config();
const { REST, Routes } = require("discord.js");

const commands = [
  {
    name: "recruit",
    description: "모집글 만들기"
  },
  {
    name: "notice",
    description: "공지 등록/수정/삭제",
    options: [
      {
        type: 3,
        name: "action",
        description: "공지 작업 (create/update/delete)",
        required: true,
        choices: [
          { name: "등록", value: "create" },
          { name: "수정", value: "update" },
          { name: "삭제", value: "delete" }
        ]
      },
      {
        type: 3,
        name: "content",
        description: "공지 내용",
        required: false
      }
    ]
  }
];

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log("⌛ 명령어 등록 중...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ 명령어 등록 완료!");
  } catch (error) {
    console.error(error);
  }
})();
