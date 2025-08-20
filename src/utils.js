// utils.js — 공지/웹후크 유틸 (plain/임베드/코드블럭 + 핀 고정/해제 + 줄바꿈 정규화)
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

const WEBHOOK_NAME   = "ARI BOT";
const WEBHOOK_AVATAR = process.env.WEBHOOK_AVATAR || null;

// 채널별 웹후크 캐시
const hookCache = new Map();

// 줄바꿈/브레이크 정규화
function normalize(text) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
}

// 임베드 빌더
function buildEmbed({ color, title, content }) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title || null)
    .setDescription(content);
}

// 스타일별 페이로드 생성
function buildNoticePayload({ style = "embed-purple", title = "", content = "" }) {
  const normalized = normalize(content);

  if (style === "plain") {
    const body = title ? `**${title}**\n${normalized}` : normalized;
    return { content: body };
  }

  if (style === "code") {
    const body = title
      ? `**${title}**\n\`\`\`\n${normalized}\n\`\`\``
      : `\`\`\`\n${normalized}\n\`\`\``;
    return { content: body };
  }

  if (style === "embed-blue") {
    return { embeds: [buildEmbed({ color: 0x2b6cff, title, content: normalized })] };
  }
  if (style === "embed-min") {
    return { embeds: [buildEmbed({ color: 0x2b2d31, title, content: normalized })] };
  }
  // 기본 = 보라
  return { embeds: [buildEmbed({ color: 0xCDC1FF, title, content: normalized })] };
}

// 채널용 웹후크 가져오기/만들기
async function getOrCreateHook(channel) {
  try {
    const me = channel.guild?.members?.me;
    const ok = channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageWebhooks);
    if (!ok) return null;

    if (hookCache.has(channel.id)) return hookCache.get(channel.id);

    const hooks = await channel.fetchWebhooks();
    let hook = hooks.find(h => h.owner?.id === me.user.id && h.name === WEBHOOK_NAME);
    if (!hook) {
      hook = await channel.createWebhook({
        name: WEBHOOK_NAME,
        reason: "AriBot notice webhook",
      });
    }
    hookCache.set(channel.id, hook);
    return hook;
  } catch (e) {
    console.warn("[utils] getOrCreateHook failed:", e?.message || e);
    return null;
  }
}

// 공지 보내기 (웹후크 있으면 웹후크, 없으면 bot 계정)
async function sendStyledNotice(channel, { style, title, content, pin = false }) {
  const payload = buildNoticePayload({ style, title, content });
  const avatarURL = WEBHOOK_AVATAR || channel.client.user.displayAvatarURL({ extension: "png", size: 256 });
  const hook = await getOrCreateHook(channel);

  const sent = hook
    ? await hook.send({ username: WEBHOOK_NAME, avatarURL, allowedMentions: { parse: [] }, ...payload })
    : await channel.send({ allowedMentions: { parse: [] }, ...payload });

  if (pin) {
    try { await sent.pin(); } catch {}
  }
  return sent;
}

// 기존 메시지 수정 (핀 고정/해제 포함)
async function editStyledNoticeById(channel, messageId, { style, title, content, pin }) {
  const payload = buildNoticePayload({ style, title, content });
  const msg = await channel.messages.fetch(messageId);

  await msg.edit(payload);

  if (typeof pin === "boolean") {
    try {
      if (pin && !msg.pinned) await msg.pin();
      if (!pin && msg.pinned) await msg.unpin();
    } catch {}
  }
  return msg;
}

module.exports = {
  normalize,
  buildNoticePayload,
  sendStyledNotice,
  editStyledNoticeById,
};
