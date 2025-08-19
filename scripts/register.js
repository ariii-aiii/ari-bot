// scripts/register.js — 전역 슬래시 명령 등록
require("dotenv").config();
const { REST, Routes } = require("discord.js");

if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
  console.error("[register] BOT_TOKEN/CLIENT_ID 누락");
  process.exit(1);
}

const commands = [
  // /ari
  {
    name: "ari",
    description: "Ari 모집 명령",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "create",
        description: "모집글 만들기",
        options: [
          { type: 3, name: "content", description: "제목/내용", required: true },
          { type: 4, name: "max", description: "정원(숫자)", required: true },
        ],
      },
      {
        type: 1,
        name: "edit",
        description: "모집글 수정",
        options: [
          { type: 3, name: "message", description: "메시지 링크/ID", required: false },
          { type: 3, name: "content", description: "새 제목/내용", required: false },
          { type: 4, name: "max", description: "새 정원", required: false },
        ],
      },
      { type: 1, name: "status", description: "내 모집글 현황" },
      { type: 1, name: "delete", description: "내 모집글 모두 삭제" },
      {
        type: 1, name: "ping", description: "참가자 멘션",
        options: [{ type: 3, name: "message", description: "메시지 ID", required: true }],
      },
      {
        type: 1, name: "copy", description: "모집글 복사",
        options: [{ type: 3, name: "message", description: "메시지 ID", required: true }],
      },
    ],
  },

  // /notice
  {
    name: "notice",
    description: "공지 보내기/스티키 설정",
    options: [
      { type: 3, name: "content", description: "본문", required: true },
      { type: 3, name: "title", description: "제목", required: false },
      { type: 3, name: "style", description: "embed-purple|embed-blue|embed-min|code", required: false },
      { type: 5, name: "pin", description: "핀 여부", required: false },
      { type: 5, name: "sticky", description: "스티키 사용", required: false },
      { type: 4, name: "hold", description: "스티키 유지(분) — 0=무한", required: false },
      { type: 5, name: "edit", description: "기존 스티키를 수정", required: false },
      { type: 7, name: "channel", description: "보낼 채널", required: false },
    ],
  },

  // /notice-edit
  {
    name: "notice-edit",
    description: "기존 스티키 공지 수정",
    options: [
      { type: 3, name: "content", description: "수정할 본문", required: true },
      { type: 3, name: "title", description: "수정할 제목", required: false },
      { type: 3, name: "style", description: "embed-purple|embed-blue|embed-min|code", required: false },
      { type: 5, name: "pin", description: "핀 여부(true/false)", required: false },
    ],
  },
];

(async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log("✅ Slash commands registered.");
})();
