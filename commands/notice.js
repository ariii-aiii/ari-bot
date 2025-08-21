// commands/notice.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('notice')
    .setNameLocalizations({ ko: '아리공지' })
    .setDescription('Create/Edit/Delete notices')
    .setDescriptionLocalizations({ ko: '공지 등록/수정/삭제' })

    // 등록
    .addSubcommand(sub =>
      sub.setName('create')
        .setNameLocalizations({ ko: '등록' })
        .setDescription('Create a notice')
        .setDescriptionLocalizations({ ko: '공지 등록' })
        .addStringOption(o =>
          o.setName('content').setNameLocalizations({ ko: '내용' })
            .setDescription('Notice content').setRequired(true))
        .addBooleanOption(o =>
          o.setName('pin').setNameLocalizations({ ko: '고정' })
            .setDescription('Pin this notice'))
    )

    // 수정
    .addSubcommand(sub =>
      sub.setName('edit')
        .setNameLocalizations({ ko: '수정' })
        .setDescription('Edit a notice by message ID')
        .setDescriptionLocalizations({ ko: '메시지ID로 공지 수정' })
        .addStringOption(o =>
          o.setName('message_id').setNameLocalizations({ ko: '메시지id' })
            .setDescription('Target message ID').setRequired(true))
        .addStringOption(o =>
          o.setName('content').setNameLocalizations({ ko: '내용' })
            .setDescription('New content').setRequired(true))
    )

    // 삭제
    .addSubcommand(sub =>
      sub.setName('delete')
        .setNameLocalizations({ ko: '삭제' })
        .setDescription('Delete a notice by message ID')
        .setDescriptionLocalizations({ ko: '메시지ID로 공지 삭제' })
        .addStringOption(o =>
          o.setName('message_id').setNameLocalizations({ ko: '메시지id' })
            .setDescription('Target message ID').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const content = interaction.options.getString('content', true);
      const pin = interaction.options.getBoolean('pin') || false;

      const msg = await interaction.channel.send({ content });
      if (pin) { try { await msg.pin(); } catch {} }

      return interaction.reply({ content: `✅ 공지 등록 완료 (messageId: ${msg.id})`, ephemeral: true });
    }

    if (sub === 'edit') {
      const messageId = interaction.options.getString('message_id', true);
      const content = interaction.options.getString('content', true);
      try {
        const msg = await interaction.channel.messages.fetch(messageId);
        await msg.edit(content);
        return interaction.reply({ content: '✏️ 공지 수정 완료', ephemeral: true });
      } catch {
        return interaction.reply({ content: '메시지ID를 못 찾았어요 ㅠㅠ', ephemeral: true });
      }
    }

    if (sub === 'delete') {
      const messageId = interaction.options.getString('message_id', true);
      try {
        const msg = await interaction.channel.messages.fetch(messageId);
        await msg.delete();
        return interaction.reply({ content: '🗑️ 공지 삭제 완료', ephemeral: true });
      } catch {
        return interaction.reply({ content: '메시지ID를 못 찾았어요 ㅠㅠ', ephemeral: true });
      }
    }
  }
};
