// src/utils.js — webhook 없이 메시지 편집/핀 제어 + payload 빌더
const { EmbedBuilder } = require("discord.js");

function buildEmbedPurple({ title, content }) {
  return new EmbedBuilder().setColor(0xCDC1FF).setTitle(title || null).setDescription(content);
}
function buildEmbedBlue({ title, content }) {
  return new EmbedBuilder().setColor(0x2b6cff).setTitle(title || null).setDescription(content);
}
function buildEmbedMin({ title, content }) {
  return new EmbedBuilder().setColor(0x2b2d31).setTitle(title || null).setDescription(content);
}

function buildNoticePayload({ style, title, content }) {
  if (style === "embed-purple") return { embeds: [buildEmbedPurple({ title, content })] };
  if (style === "embed-blue")   return { embeds: [buildEmbedBlue({ title, content })] };
  if (style === "embed-min")    return { embeds: [buildEmbedMin({ title, content })] };
  if (style === "code") {
    const body = title ? `**${title}**\n\`\`\`\n${content}\n\`\`\`` : `\`\`\`\n${content}\n\`\`\``;
    return { content: body, embeds: [] };
  }
  return { content: title ? `**${title}**\n${content}` : content, embeds: [] };
}

async function editStyledNoticeById(channel, messageId, { style, title, content, pin }) {
  const msg = await channel.messages.fetch(messageId);
  const payload = buildNoticePayload({ style, title, content });
  await msg.edit(payload);

  if (typeof pin === "boolean") {
    try {
      if (pin && !msg.pinned) await msg.pin();
      if (!pin && msg.pinned) await msg.unpin();
    } catch {}
  }
  return msg;
}

module.exports = { buildNoticePayload, editStyledNoticeById };
