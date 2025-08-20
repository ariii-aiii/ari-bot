// commands/notice-edit.js — 아리공지수정 (웹후크X, 줄바꿈 치환)
const { SlashCommandBuilder, ChannelType } = require("discord.js");

module.exports = function setupNoticeEdit({ stickyNotices, utils }) {
  const normalize = (s) =>
    (s || "")
      .replace(/\r\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n");

  const data = new SlashCommandBuilder()
    .setName("notice-edit")
    .setNameLocalizations({ ko: "아리공지수정" })
    .setDescription("Edit sticky/plain notice message")
    .setDescriptionLocalizations({ ko: "스티키 공지(또는 지정 메시지)를 수정합니다." })
    .addStringOption(o =>
      o.setName("content").setDescription("content").setDescriptionLocalizations({ ko: "본문 (\\n / <br> 줄바꿈)" }).setRequired(true)
    )
    .addStringOption(o =>
      o.setName("message").setDescription("message id").setDescriptionLocalizations({ ko: "수정할 메시지 ID (비우면 현재 스티키)" })
    )
    .addStringOption(o =>
      o.setName("title").setDescription("title").setDescriptionLocalizations({ ko: "제목" })
    )
    .addStringOption(o =>
      o.setName("style").setDescription("style").setDescriptionLocalizations({ ko: "스타일" })
        .addChoices(
          { name: "embed-purple", value: "embed-purple" },
          { name: "embed-blue",   value: "embed-blue"   },
          { name: "embed-min",    value: "embed-min"    },
          { name: "code",         value: "code"         },
          { name: "plain",        value: "plain"        },
        )
    )
    .addBooleanOption(o =>
      o.setName("pin").setDescription("pin toggle").setDescriptionLocalizations({ ko: "핀 고정/해제" })
    )
    .addChannelOption(o =>
      o.setName("channel").setDescription("target channel").setDescriptionLocalizations({ ko: "수정할 채널 (기본: 현재)" })
       .addChannelTypes(ChannelType.GuildText)
    );

  async function execute(i) {
    const channel = i.options.getChannel("channel") || i.channel;
    const msgId   = i.options.getString("message") || stickyNotices.get(channel.id)?.lastMsgId;
    if (!msgId) return i.reply({ ephemeral: true, content: "수정할 메시지를 못 찾았어요. (메시지 ID를 주거나, 채널에 스티키 공지가 있어야 해요)" });

    const content = normalize(i.options.getString("content", true));
    const title   = normalize(i.options.getString("title") || "");
    const style   = i.options.getString("style") || "embed-purple";
    const pin     = i.options.getBoolean("pin");

    await i.deferReply({ ephemeral: true });
    try {
      await utils.editStyledNoticeById(channel, msgId, { style, title, content, pin });

      const st = stickyNotices.get(channel.id);
      if (st && st.lastMsgId === msgId) {
        stickyNotices.set(channel.id, { ...st, style, title, content, pin, lastPostAt: Date.now() });
      }
      return i.editReply("✏️ 공지를 수정했어요!");
    } catch (e) {
      console.error("[아리공지수정] fail:", e);
      return i.editReply("수정 중 오류가 났어요 ㅠㅠ");
    }
  }

  return { data, execute };
};
