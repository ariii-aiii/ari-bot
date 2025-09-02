// commands/team.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("team") // 👈 영문 소문자 필수
    .setNameLocalizations({ ko: "팀" })
    .setDescription("Create a voice-channel recruiting message.")
    .setDescriptionLocalizations({ ko: "현재 음성 채널에서 팀원 모집 메시지를 생성합니다." })
    .addStringOption(o =>
      o.setName("desc") // 👈 옵션 이름도 영문
       .setNameLocalizations({ ko: "설명" })
       .setDescription("What are you recruiting for?")
       .setDescriptionLocalizations({ ko: "모집 내용을 입력하세요." })
       .setRequired(true)
    ),

  async execute(interaction) {
    const desc = interaction.options.getString("desc", true);

    // ✅ 반드시 음성 채널에 들어가 있어야 함
    const voiceCh = interaction.member?.voice?.channel;
    if (!voiceCh) {
      return interaction.reply({
        content: "❌ 음성 채널에 먼저 들어가야 `/팀` 명령을 쓸 수 있어요.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const parentName = voiceCh.parent?.name ?? "미분류";

    const cur = voiceCh.members.size;
    const cap = voiceCh.userLimit || 0;
    const memberText = cap ? `${cur} / ${cap}` : `${cur} / 제한 없음`;

    // 음성채널 입장 링크
    let joinUrl;
    try {
      const me = interaction.guild.members.me;
      if (voiceCh.permissionsFor(me).has(PermissionFlagsBits.CreateInstantInvite)) {
        const invite = await voiceCh.createInvite({
          maxAge: 1800,
          maxUses: 0,
          unique: true,
          reason: "팀원 모집(음성채널 입장 버튼)",
        });
        joinUrl = `https://discord.gg/${invite.code}`;
      } else {
        joinUrl = `https://discord.com/channels/${interaction.guildId}/${voiceCh.id}`;
      }
    } catch {
      joinUrl = `https://discord.com/channels/${interaction.guildId}/${voiceCh.id}`;
    }

    const embed = new EmbedBuilder()
      .setTitle("팀원 모집")
      .setDescription(`${interaction.user} 님이 팀원 모집 중입니다.`)
      .setColor(0xCDC1FF)
      .addFields(
        { name: "카테고리", value: parentName, inline: false },
        { name: "채널명", value: `<#${voiceCh.id}>`, inline: true },
        { name: "멤버", value: memberText, inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "설명", value: desc, inline: false },
      );

    const btn = new ButtonBuilder()
      .setLabel("음성채널 입장")
      .setStyle(ButtonStyle.Link)
      .setURL(joinUrl);

    const row = new ActionRowBuilder().addComponents(btn);

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
