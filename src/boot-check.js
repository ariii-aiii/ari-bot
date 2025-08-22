// src/boot-check.js
const required = ['BOT_TOKEN', 'CLIENT_ID']; // 필요하면 GUILD_ID 등 추가
for (const k of required) {
  if (!process.env[k] || !String(process.env[k]).trim()) {
    throw new Error(`[ENV] Missing ${k}`);
  }
}
