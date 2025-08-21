// commands/recruit.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const CAP_CHOICES = [16, 20, 28, 32, 40, 56, 64].map(n => ({ name: String(n), value: n }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('아리모집')
    .setDescription('버튼 모집 등록/수정/삭제')

    .addSubcommand(sub =>
      sub.setName('등록')
        .setDescription('버튼 포함 모집글 등록')
        .addStringOption(o =>
          o.setName('제목')
            .setDescription('모집글 제목').setRequired(true))
        .addIntegerOption(o =>
          o.setName('정원')
            .setDescription('정원 설정').addChoices(...CAP_CHOICES).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('수정')
        .setDescription('메시지ID로 제목 수정')
        .addStringOption(o =>
          o.setName('메시지id')
            .setDescription('수정할 메시지 ID').setRequired(true))
        .addStringOption(o =>
          o.setName('제목')
            .setDescription('새 제목').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('정원')
        .setDescription('메시지ID로 정원 변경')
        .addStringOption(o =>
          o.setName('메시지id')
            .setDescription('수정할 메시지 ID').setRequired(true))
        .addIntegerOption(o =>
          o.setName('정원')
            .setDescription('새 정원').addChoices(...CAP_CHOICES).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('상태')
        .setDescription('현재 모집 상태 보기')
        .addStringOption(o =>
          o.setName('메시지id')
            .setDescription('확인할 메시지 ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('삭제')
        .setDescription('메시지ID로 모집 삭제')
        .addStringOption(o =>
          o.setName('메시지id')
            .setDescription('삭제할 메시지 ID').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { recruitStates, rowFor } = interaction._ari;

    if (sub === '등록') {
      const title = interaction.options.getString('제목', true);
      const cap = interaction.options.getInteger('정원', true);

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription('버튼으로 참가/취소/목록/마감을 관리하세요.')
        .addFields({ name: '정원', value: String(cap), inline: true })
        .setFooter({ text: `Cap:${cap} • Host:${interaction.user.id}` })
        .setTimestamp();

      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      await msg.edit({ components: [rowFor(msg.id, false)] });

      recruitStates.set(msg.id, {
        cap,
        hostId: interaction.user.id,
        members: new Set(),
        waitlist: new Set(),
        isClosed: false,
        title
      });
      return;
    }

    if (sub === '수정') {
      const messageId = interaction.options.getString('메시지id', true);
      const newTitle = interaction.options.getString('제목', true);

      try {
        const msg = await interaction.channel.messages.fetch(messageId);
        const embed = EmbedBuilder.from(msg.embeds[0] ?? {});
        embed.setTitle(newTitle);
        await msg.edit({ embeds: [embed] });

        const st = recruitStates.get(messageId);
        if (st) st.title = newTitle;

        return interaction.reply({ content: '✏️ 제목 수정 완료', ephemeral: true });
      } catch {
        return interaction.reply({ content: '메시지ID를 못 찾았어요 ㅠㅠ', ephemeral: true });
      }
    }

    if (sub === '정원') {
      const messageId = interaction.options.getString('메시지id', true);
      const newCap = interaction.options.getInteger('정원', true);

      try {
        const msg = await interaction.channel.messages.fetch(messageId);
        const embed = EmbedBuilder.from(msg.embeds[0] ?? {});

        const fields = embed.data.fields || [];
        const idx = fields.findIndex(f => f.name === '정원');
        if (idx >= 0) fields[idx].value = String(newCap);
        else fields.push({ name: '정원', value: String(newCap), inline: true });
        embed.setFields(fields);

        const footer = embed.data.footer?.text || '';
        const host = (footer.match(/Host:(\d+)/) || [null, ''])[1];
        embed.setFooter({ text: `Cap:${newCap}${host ? ` • Host:${host}` : ''}` });

        await msg.edit({ embeds: [embed] });

        const st = recruitStates.get(messageId);
        if (st) st.cap = newCap;

        return interaction.reply({ content: '📦 정원 변경 완료', ephemeral: true });
      } catch {
        return interaction.reply({ content: '메시지ID를 못 찾았어요 ㅠㅠ', ephemeral: true });
      }
    }

    if (sub === '상태') {
      const messageId = interaction.options.getString('메시지id', true);
      const st = recruitStates.get(messageId);
      if (!st) {
        return interaction.reply({ content: '상태를 못 찾았어요. 해당 메시지 버튼을 한번 눌러주면 복구될 수 있어요.', ephemeral: true });
      }
      const members = [...st.members].map((id, i) => `${i + 1}. <@${id}>`).join('\n') || '없음';
      const waiters = [...st.waitlist].map((id, i) => `${i + 1}. <@${id}>`).join('\n') || '없음';
      const embed = new EmbedBuilder()
        .setTitle(`${st.title} — 상태`)
        .addFields(
          { name: `참가자 (${st.members.size}/${st.cap})`, value: members },
          { name: '대기열', value: waiters }
        )
        .setFooter({ text: st.isClosed ? '🔒 마감됨' : '🔓 모집중' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === '삭제') {
      const messageId = interaction.options.getString('메시지id', true);
      try {
        const msg = await interaction.channel.messages.fetch(messageId);
        await msg.delete();
        recruitStates.delete(messageId);
        return interaction.reply({ content: '🗑️ 모집 삭제 완료', ephemeral: true });
      } catch {
        return interaction.reply({ content: '메시지ID를 못 찾았어요 ㅠㅠ', ephemeral: true });
      }
    }
  }
};
