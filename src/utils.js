// utils.js — 공지(보내기/수정) 유틸 (복붙)
const {
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const WEBHOOK_NAME   = "ARI BOT";
const WEBHOOK_AVATAR = process.env.WEBHOOK_AVATAR || null; // 사용안하면 그냥 null
const hookCache = new Map();

const buildEmbedPurple = ({ title, content }) =>
  new EmbedBuilder().setColor(0xCDC1FF).setTitle(title || null).setDescription(content);

const buildEmbedBlue = ({ title, content }) =>
  new EmbedBuilder().setColor(0x2b6cff).setTitle(title || null).setDescription(content);

const buildEmbedMin = ({ title, content }) =>
  new EmbedBuilder().setColor(0x2b2d31).setTitle(title || null).setDescription(content);

function buildNoticePayload({ style, title, content }) {
  if (style === "embed-purple") return { embeds: [buildEmbedPurple({ title, content })] };
  if (style === "embed-blue")   return { embeds: [buildEmbedBlue({ title, content })] };
  if (style === "embed-min")    return { embeds: [buildEmbedMin({ title, content })] };
  if (style === "code") {
    const body = title ? `**${title}**\n\`\`\`\n${content}\n\`\`\`` : `\`\`\`\n${content}\n\`\`\``;
    return { content: body };
  }
  const body = title ? `**${title}**\n${content}` : content;
  return { content: body };
}

// 줄바꿈 정리
const normalize = (text) =>
  (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n");

// (선택) 웹후크를 쓰고 싶을 때 사용. 편집은 어려우니 기본은 봇으로 보냄.
async function getOrCreateHook(channel) {
  try {
    const canHook = channel.permissionsFor(channel.guild.members.me)?.has(PermissionFlagsBits.ManageWebhooks);
    if (!canHook) return null;
    if (hookCache.has(channel.id)) return hookCache.get(channel.id);
    const hooks = await channel.fetchWebhooks();
    let hook = hooks.find(h => h.owner?.id === channel.client.user.id && h.name === WEBHOOK_NAME);
    if (!hook) hook = await channel.createWebhook({ name: WEBHOOK_NAME, reason: "AriBot notice webhook" });
    hookCache.set(channel.id, hook);
    return hook;
  } catch {
    return null;
  }
}

/** 공지 보내기(기본: 봇 계정으로 전송 → 나중에 수정 가능) */
async function sendStyledNotice(channel, { style, title, content, pin }) {
  const payload = buildNoticePayload({
    style,
    title: normalize(title),
    content: normalize(content),
  });

  // 기본은 봇 계정으로 보낸다(수정 가능)
  const sent = await channel.send({ allowedMentions: { parse: [] }, ...payload });

  if (pin) {
    try { await sent.pin(); } catch {}
  }
  return sent;
}

/**
 * 공지 수정: 우리 봇이 쓴 글이면 수정. 아니면 삭제 후 재발송(403/50005 우회)
 * - 반환: 최종 메시지(Message)
 */
async function editStyledNoticeById(channel, messageId, { style, title, content, pin }) {
  const payload = buildNoticePayload({
    style,
    title: normalize(title),
    content: normalize(content),
  });

  const msg = await channel.messages.fetch(messageId);

  // 1) 우리 봇이 작성한 메시지인지 확인
  const isOurMessage = !!msg.author && msg.author.id === channel.client.user.id;

  // 2) 우리 메시지면 수정 시도
  if (isOurMessage) {
    try {
      const edited = await msg.edit(payload);
      // 핀 처리
      if (typeof pin === "boolean") {
        try {
          if (pin && !edited.pinned) await edited.pin();
          if (!pin && edited.pinned) await edited.unpin();
        } catch {}
      }
      return edited;
    } catch (e) {
      // 계속 진행해서 재발송 플랜 B 수행
    }
  }

  // 3) 여기까지 왔다는 건 수정이 불가(웹후크/다른 작성자 등). 삭제 후 새로 발송
  try { await msg.delete(); } catch {}

  const replacement = await channel.send({ allowedMentions: { parse: [] }, ...payload });
  if (typeof pin === "boolean") {
    try {
      if (pin && !replacement.pinned) await replacement.pin();
      if (!pin && replacement.pinned) await replacement.unpin();
    } catch {}
  }
  return replacement;
}

module.exports = {
  normalize,
  buildNoticePayload,
  sendStyledNotice,
  editStyledNoticeById,
};
