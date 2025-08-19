// commands/notice-edit.js — 스티키 공지 수정 전용
module.exports = function setupNoticeEdit(ctx) {
  const { stickyNotices, utils } = ctx;

  return {
    name: "notice-edit",
    description: "기존 스티키 공지를 수정합니다",
    options: [],
    async execute(i) {
      const st = stickyNotices.get(i.channel.id);
      if (!st?.lastMsgId) {
        return i.reply({ content: "❌ 이 채널에는 스티키 공지가 없어요!", ephemeral: true });
        }
      const content = i.options.getString("content", true);
      const title   = i.options.getString("title") ?? st.title ?? "";
      const style   = i.options.getString("style") ?? st.style ?? "embed-purple";
      const pinOpt  = i.options.getBoolean("pin"); // undefined면 기존 유지

      await i.deferReply({ ephemeral: true });

      const msg = await utils.editStyledNoticeById(i.channel, st.lastMsgId, {
        style, title, content, pin: (typeof pinOpt === "boolean" ? pinOpt : st.pin),
      });

      stickyNotices.set(i.channel.id, {
        ...st, style, title, content,
        lastMsgId: msg.id, lastPostAt: Date.now(),
        // st.expiresAt은 유지 (무기한/기간 그대로)
      });

      return i.editReply("✏️ 스티키 공지를 수정했어요!");
    },
  };
};
