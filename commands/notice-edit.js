// commands/notice-edit.js — 스티키 공지 수정 슬래시 커맨드
const { SlashCommandBuilder, ChannelType } = require("discord.js");

module.exports = function setupNoticeEdit({ stickyNotices, utils }) {
  const data = new SlashCommandBuilder()
    .setName("notice-edit")
    .setDescription("현재 채널의 스티키 공지(또는 지정 메시지)를 수정")
    .addStringOption(o=>o.setName("message").setDescription("메시지 ID(비우면 현재 스티키)").setRequired(false))
    .addStringOption(o=>o.setName("content").setDescription("본문 내용").setRequired(true))
    .addStringOption(o=>o.setName("title").setDescription("제목").setRequired(false))
    .addStringOption(o=>o.setName("style").setDescription("스타일").addChoices(
      { name:"embed-purple", value:"embed-purple" },
      { name:"embed-blue",   value:"embed-blue"   },
      { name:"embed-min",    value:"embed-min"    },
      { name:"code",         value:"code"         },
      { name:"plain",        value:"plain"        },
    ).setRequired(false))
    .addBooleanOption(o=>o.setName("pin").setDescription("핀 고정/해제").setRequired(false))
    .addChannelOption(o=>o.setName("channel").setDescription("수정할 채널(기본: 현재)").addChannelTypes(ChannelType.GuildText).setRequired(false));

  async function execute(i) {
    const channel = i.options.getChannel("channel") || i.channel;
    const msgId   = i.options.getString("message") || stickyNotices.get(channel.id)?.lastMsgId;
    const content = i.options.getString("content", true);
    const title   = i.options.getString("title") || "";
    const style   = i.options.getString("style") || "embed-purple";
    const pin     = i.options.getBoolean("pin");

    if (!msgId) return i.reply({ ephemeral:true, content:"수정할 메시지를 못 찾았어요. (메시지ID를 주거나, 채널에 스티키가 있어야 해요)" });

    await i.deferReply({ ephemeral:true });
    try {
      await utils.editStyledNoticeById(channel, msgId, { style, title, content, pin });
      // 스티키 상태 갱신(있다면)
      const st = stickyNotices.get(channel.id);
      if (st && st.lastMsgId === msgId) stickyNotices.set(channel.id, { ...st, style, title, content, pin, lastPostAt: Date.now() });
      return i.editReply("✏️ 공지를 수정했어요!");
    } catch (e) {
      console.error("[notice-edit] fail:", e);
      return i.editReply("수정 중 오류가 났어요 ㅠㅠ");
    }
  }

  return { data, execute };
};
