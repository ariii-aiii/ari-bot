const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

let stickyMessageId = null;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("공지")
    .setDescription("공지 등록/수정/삭제/스티키")
    .addSubcommand(sub =>
      sub.setName("등록").setDescription("새 공지 작성").addStringOption(opt =>
        opt.setName("내용").setDescription("공지 내용").setRequired(true)
      )
    )
    .addSubcommand(sub =>
      sub.setName("수정").setDescription("공지 수정").addStringOption(opt =>
        opt.setName("내용").setDescription("수정할 내용").setRequired(true)
      )
    )
    .addSubcommand(sub =>
      sub.setName("삭제").setDescription("공지 삭제")
    )
    .addSubcommand(sub =>
      sub.setName("스티키").setDescription("공지 스티키 (항상 위로)")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "등록") {
      const content = interaction.options.getString("내용");
      const msg = await interaction.channel.send(`📢 **공지사항**\n${content}`);
      stickyMessageId = msg.id;
      await interaction.reply({ content: "✅ 공지 등록 완료!", ephemeral: true });
    }

    if (sub === "수정") {
      if (!stickyMessageId) return interaction.reply({ content: "❌ 수정할 공지가 없음", ephemeral: true });
      const content = interaction.options.getString("내용");
      const msg = await interaction.channel.messages.fetch(stickyMessageId);
      await msg.edit(`📢 **공지사항 (수정됨)**\n${content}`);
      await interaction.reply({ content: "✏️ 공지 수정 완료!", ephemeral: true });
    }

    if (sub === "삭제") {
      if (!stickyMessageId) return interaction.reply({ content: "❌ 삭제할 공지가 없음", ephemeral: true });
      const msg = await interaction.channel.messages.fetch(stickyMessageId);
      await msg.delete();
      stickyMessageId = null;
      await interaction.reply({ content: "🗑️ 공지 삭제 완료!", ephemeral: true });
    }

    if (sub === "스티키") {
      if (!stickyMessageId) return interaction.reply({ content: "❌ 스티키할 공지가 없음", ephemeral: true });
      const msg = await interaction.channel.messages.fetch(stickyMessageId);
      await msg.pin();
      await interaction.reply({ content: "📌 공지가 스티키됨!", ephemeral: true });
    }
  }
};
