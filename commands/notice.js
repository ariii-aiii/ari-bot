// commands/notice.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

module.exports = {
  autoDefer: false,  // ← 이 줄 추가 (이 명령어는 자동 defer 끔)
  data: new SlashCommandBuilder()
    .setName("notice")
    .setNameLocalizations({ ko: "공지" })
    .setDescription("Manage a single pinned-like notice in this channel")
    .setDescriptionLocalizations({ ko: "이 채널의 공지(1개 유지) 관리" })

    .addSubcommand(sub =>
      sub.setName("register").setNameLocalizations({ ko: "등록" })
        .setDescription("Post/replace the channel notice")
        .setDescriptionLocalizations({ ko: "이 채널 공지를 올리거나 교체합니다" })
        .addStringOption(o =>
          o.setName("title").setNameLocalizations({ ko: "제목" })
            .setDescription("공지 제목").setRequired(true))
        .addStringOption(o =>
          o.setName("content").setNameLocalizations({ ko: "내용" })
            .setDescription("본문 내용").setRequired(true))
    )

    .addSubcommand(sub =>
      sub.setName("edit").setNameLocalizations({ ko: "수정" })
        .setDescription("Edit current channel notice")
        .setDescriptionLocalizations({ ko: "현재 채널 공지 수정" })
        .addStringOption(o =>
          o.setName("title").setNameLocalizations({ ko: "제목" })
            .setDescription("새 제목(선택)"))
        .addStringOption(o =>
          o.setName("content").setNameLocalizations({ ko: "내용" })
            .setDescription("새 본문(선택)"))
    )

    .addSubcommand(sub =>
      sub.setName("delete").setNameLocalizations({ ko: "삭제" })
        .setDescription("Delete current channel notice")
        .setDescriptionLocalizations({ ko: "현재 채널 공지를 삭제합니다" })
    ),

  // 자동 defer 켬(기본값) – index.js가 3초 내 defer 처리
  // autoDefer: true,  // 명시 안 해도 됨

  // 봇/사용자 권한 요구(메시지 관리가 안전)
  requiredClientPermissions: [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.channel;

    // 실행자 권한 간단 체크(없어도 동작은 가능하지만 안전하게)
    const me = interaction.guild.members.me;
    const need = [
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ReadMessageHistory,
    ];
    if (!me.permissionsIn(channel).has(need)) {
      return interaction.reply({
        content: "❌ 제가 이 채널에서 **메시지 보내기/임베드/메시지 관리/기록 보기** 권한이 부족해요.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // index.js에서 주입한 유틸
    const { notice: NoticeKit } = interaction._ari || {};
    if (!NoticeKit) {
      return interaction.reply({
        content: "❌ 내부 유틸 초기화에 실패했어요. (index.js 주입 확인 필요)",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      if (sub === "register") {
        const title = interaction.options.getString("title", true);
        const content = interaction.options.getString("content", true);

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(content)
          .setColor(0xCDC1FF)
          .setFooter({ text: "TAG:NOTICE" });

        await NoticeKit.upsert(channel, { embeds: [embed] });
        return interaction.reply({
          content: "📌 공지를 등록/교체했어요!",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === "edit") {
        const newTitle = interaction.options.getString("title");
        const newBody  = interaction.options.getString("content");

        if (newTitle == null && newBody == null) {
          return interaction.reply({
            content: "수정할 항목이 없어요. (제목/내용 중 1개 이상)",
            flags: MessageFlags.Ephemeral,
          });
        }

        // 저장된 공지 가져오거나 최근 공지 스캔
        const saved = NoticeKit.store.get(channel.id);
        let payload = saved?.payload;
        if (!payload) {
          // 최근 봇 메시지에서 TAG:NOTICE 찾기
          const fetched = await channel.messages.fetch({ limit: 30 });
          const hit = [...fetched.values()].find(m => {
            if (!m.author?.bot) return false;
            const ft = m.embeds?.[0]?.footer?.text || "";
            return ft.includes("TAG:NOTICE");
          });
          if (hit) payload = { embeds: [hit.embeds[0]] };
        }

        if (!payload?.embeds?.length) {
          return interaction.reply({
            content: "이 채널에 수정할 공지가 없어요. 먼저 `/공지 등록`을 사용하세요.",
            flags: MessageFlags.Ephemeral,
          });
        }

        const e = EmbedBuilder.from(payload.embeds[0]);
        if (newTitle != null) e.setTitle(newTitle);
        if (newBody  != null) e.setDescription(newBody);
        e.setFooter({ text: `${e.data.footer?.text || ""}`.includes("TAG:NOTICE")
          ? e.data.footer.text
          : `${e.data.footer?.text ? e.data.footer.text + " · " : ""}TAG:NOTICE` });

        await NoticeKit.edit(channel, { embeds: [e] });
        return interaction.reply({
          content: "✏️ 공지를 수정했어요!",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === "delete") {
        await NoticeKit.del(channel);
        return interaction.reply({
          content: "🗑️ 공지를 삭제했어요.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (err) {
      console.error("[/notice] error:", err);
      // 이미 defer 됐을 수도 있으니 안전하게
      if (interaction.deferred || interaction.replied) {
        return interaction.followUp({ content: "⚠️ 처리 중 오류가 발생했어요.", flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ content: "⚠️ 처리 중 오류가 발생했어요.", flags: MessageFlags.Ephemeral });
    }
  },
};
