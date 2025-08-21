// commands/recruit.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// 간단한 메모리 상태(메시지ID -> {title, cap, members:Set})
const states = new Map();

const CAP_CHOICES = [8, 16, 20, 28, 32, 40, 56, 64].map(n => ({ name: String(n), value: n }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recruit')
    .setNameLocalizations({ ko: '아리모집' })
    .setDescription('Create/Edit/Delete recruit posts')
    .setDescriptionLocalizations({ ko: '모집 등록/수정/삭제' })

    // 등록
    .addSubcommand(sub =>
      sub.setName('create')
        .setNameLocalizations({ ko: '등록' })
        .setDescription('Create a recruit post')
        .setDescriptionLocalizations({ ko: '모집 등록' })
        .addStringOption(o =>
          o.setName('title').setNameLocalizations({ ko: '제목' })
            .setDescription('Recruit title').setRequired(true))
        .addIntegerOption(o =>
          o.setName('cap').setNameLocalizations({ ko: '정원' })
            .setDescription('Capacity').addChoices(...CAP_CHOICES).setRequired(true))
    )

    // 수정
    .addSubcommand(sub =>
      sub.setName('edit')
        .setNameLocalizations({ ko: '수정' })
        .setDescription('Edit a recruit post by message ID')
        .setDescriptionLocalizations({ ko: '메시지ID로 모집 수정' })
        .addStringOption(o =>
          o.setName('message_id').setNameLocalizations({ ko: '메시지id' })
            .setDescription('Target message ID').setRequired(true))
        .addStringOption(o =>
          o.setName('title').setNameLocalizations({ ko: '제목' })
            .setDescription('New title').setRequired(true))
        .addIntegerOption(o =>
          o.setName('cap').setNameLocalizations({ ko: '정원' })
            .setDescription('New capacity').addChoices(...CAP_CHOICES))
    )

    // 삭제
    .addSubcommand(sub =>
      sub.setName('delete')
        .setNameLocalizations({ ko: '삭제' })
        .setDescription('Delete a recruit post by message ID')
        .setDescriptionLocalizations({ ko: '메시지ID로 모집 삭제' })
        .addStringOption(o =>
          o.setName('message_id').setNameLocalizations({ ko: '메시지id' })
            .setDescription('Target message ID').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const title = interaction.options.getString('title', true);
      const cap = interaction.options.getInteger('cap', true);

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription('참가자는 댓글로 닉 남겨주세요!')
        .addFields({ name: '정원', value: String(cap), inline: true })
        .setFooter({ text: `Cap:${cap}` })
        .setTimestamp();

      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });

      states.set(msg.id, { title, cap, members: new Set() });
      return;
    }

    if (sub === 'edit') {
      const messageId = interaction.options.getString('message_id', true);
      const newTitle = interaction.options.getString('title', true);
      const newCap = interaction.options.getInteger('cap') ?? null;

      try {
        const msg = await interaction.channel.messages.fetch(messageId);
        const embed = EmbedBuilder.from(msg.embeds[0] ?? {});
        embed.setTitle(newTitle);

        // 정원 수정 시 필드/푸터 갱신
        if (newCap) {
          const fields = embed.data.fields || [];
          const idx = fields.findIndex(f => f.name === '정원');
          if (idx >= 0) fields[idx].value = String(newCap);
          else fields.push({ name: '정원', value: String(newCap), inline: true });
          embed.setFields(fields);
          const footer = embed.data.footer?.text || '';
          embed.setFooter({ text: `Cap:${newCap}` });
        }

        await msg.edit({ embeds: [embed] });

        const st = states.get(messageId);
        if (st) {
          st.title = newTitle;
          if (newCap) st.cap = newCap;
        }

        return interaction.reply({ content: '✏️ 모집 수정 완료', ephemeral: true });
      } catch {
        return interaction.reply({ content: '메시지ID를 못 찾았어요 ㅠㅠ', ephemeral: true });
      }
    }

    if (sub === 'delete') {
      const messageId = interaction.options.getString('message_id', true);
      try {
        const msg = await interaction.channel.messages.fetch(messageId);
        await msg.delete();
        states.delete(messageId);
        return interaction.reply({ content: '🗑️ 모집 삭제 완료', ephemeral: true });
      } catch {
        return interaction.reply({ content: '메시지ID를 못 찾았어요 ㅠㅠ', ephemeral: true });
      }
    }
  }
};
