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
    .setName("팀")
    .setDescription("현재 음성 채널에서 팀원 모집 메시지를 생성합니다.")
    .addStringOption((o) =>
      o.setName("설명").setDescription("모집 내용을 입력하세요.").setRequired(true)
    ),

  async execute(interaction) {
    const desc = interaction.options.getString("설명");

    // ✅ 반드시 음성 채널에 들어가 있어야 함
    const voiceCh = interaction.member?.voice?.channel;
    if (!voiceCh) {
      return interaction.reply({
        content: "❌ 음성 채널에 먼저 들어가야 `/팀` 명령을 쓸 수 있어요.",
        flags: MessageFlags.Ephemeral, // (deprecated 경고 제거)
      });
    }

    const parentName = voiceCh.parent?.name ?? "미분류";

    // 멤버 수 / 정원
    const cur = voiceCh.members.size;
    const cap = voiceCh.userLimit || 0;
    const memberText = cap ? `${cur} / ${cap}` : `${cur} / 제한 없음`;

    // 음성채널 입장 링크
    let joinUrl;
    try {
      if (
        voiceCh
          .permissionsFor(interaction.guild.members.me)
          .has(PermissionFlagsBits.CreateInstantInvite)
      ) {
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

    // 💜 연보라색 (#CDC1FF)
    const embed = new EmbedBuilder()
      .setTitle("팀원 모집")
      .setDescription(`${interaction.user} 님이 팀원 모집 중입니다.`)
      .setColor(0xCDC1FF)
      .addFields(
        { name: "카테고리", value: parentName, inline: false },           // 1행
        { name: "채널명", value: `<#${voiceCh.id}>`, inline: true },       // 2행-왼쪽
        { name: "멤버", value: memberText, inline: true },                 // 2행-오른쪽
        { name: "\u200b", value: "\u200b", inline: true },                 // 그리드 맞춤
        { name: "설명", value: desc, inline: false }                       // 3행
      );

    const btn = new ButtonBuilder()
      .setLabel("음성채널 입장")
      .setStyle(ButtonStyle.Link)
      .setURL(joinUrl);

    const row = new ActionRowBuilder().addComponents(btn);

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};
