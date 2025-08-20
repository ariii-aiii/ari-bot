// commands/notice-edit.js
const { SlashCommandBuilder, ChannelType } = require("discord.js");

module.exports = function setupNoticeEdit({ stickyNotices, utils }) {
  const normalize = (text) =>
    (text || "").replace(/\r\n/g, "\n").replace(/\\n/g, "\n").replace(/<br\s*\/?>/gi, "\n").trim();

  const data = new SlashCommandBuilder()
    .setName("notice-edit")
    .setNameLocalizations({ ko: "아리공지수정" })
    .setDescription("Edit a sticky notice or a specific message by ID")
    .setDescriptionLocalizations({ ko: "현재 스티키 공지 또는 지정 메시지를 수정" })
    .addStringOption(o => o.setName("content")
      .setNameLocalizations({ ko: "내용" })
      .setDescription("New body (\\n/<br> newline)")
      .setDescriptionLocalizations({ ko: "새 본문 (줄바꿈: \\n/<br>)" })
      .setRequired(true))
    .addStringOption(o => o.setName("message")
      .setNameLocalizations({ ko: "메시지id" })
      .setDescription("Target message ID (empty = current sticky)")
      .setDescriptionLocalizations({ ko: "수정할 메시지 ID (미입력=현재 스티키)" }))
    .addStringOption(o => o.setName("title")
      .setNameLocalizations({ ko: "제목" })
      .setDescription("New title")
      .setDescriptionLocalizations({ ko: "새 제목" }))
    .addStringOption(o => o.setName("style")
      .setNameLocalizations({ ko: "스타일" })
      .setDescription("embed-purple | embed-blue | embed-min | code | plain")
      .setDescriptionLocalizations({ ko: "embed-purple | embed-blue | embed-min | code | plain" })
      .addChoices(
        { name: "embed-purple", value: "embed-purple" },
        { name: "embed-blue",   value: "embed-blue"   },
        { name: "embed-min",    value: "embed-min"    },
        { name: "code",         value: "code"         },
        { name: "plain",        value: "plain"        },
      ))
    .addBooleanOption(o => o.setName("pin")
      .setNameLocalizations({ ko: "핀" })
      .setDescription("Pin/Unpin after edit")
      .setDescriptionLocalizations({ ko: "수정 후 핀 고정/해제" }))
    .addChannelOption(o => o.setName("channel")
      .setNameLocalizations({ ko: "채널" })
      .setDescription("Target channel")
      .setDescriptionLocalizations({ ko: "수정할 채널" })
      .addChannelTypes(ChannelType.GuildText));

  async function execute(i) {
    const channel = i.options.getChannel("channel") || i.channel;
    const msgId   = i.options.getString("message") || stickyNotices.get(channel.id)?.lastMsgId;

    if (!msgId) {
      return i.reply({
        ephemeral: true,
        content: "수정할 메시지를 못 찾았어요. (메시지ID를 입력하거나, 현재 채널에 스티키가 있어야 해요)"
      });
    }

    const raw   = i.options.getString("content", true);
    const title = normalize(i.options.getString("title") || "");
    const style = i.options.getString("style") || "embed-purple";
    const pin   = i.options.getBoolean("pin");

    const content = normalize(raw);
    await i.deferReply({ ephemeral: true });

    try {
      await utils.editStyledNoticeById(channel, msgId, { style, title, content, pin });

      // 스티키로 관리 중이면 상태도 업데이트
      const st = stickyNotices.get(channel.id);
      if (st && st.lastMsgId === msgId) {
        stickyNotices.set(channel.id, { ...st, style, title, content, pin, lastPostAt: Date.now() });
      }

      return i.editReply("✏️ 공지를 수정했어요!");
    } catch (e) {
      console.error("[notice-edit] fail:", e);
      return i.editReply("수정 중 오류가 났어요 ㅠㅠ");
    }
  }

  return { data, execute };
};
