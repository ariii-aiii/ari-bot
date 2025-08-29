// commands/team.js  (discord.js v14)
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("팀")
    .setDescription("팀원 모집 메시지를 생성합니다.")
    .addStringOption(o =>
      o.setName("설명").setDescription("모집 내용을 입력하세요.").setRequired(true)
    ),

  async execute(interaction) {
    console.log("[/팀] handler v0.5 적용");

    // ✅ 40060 방지: 인터랙션은 deferReply → editReply로 딱 한 번만 응답
    await interaction.deferReply({ ephemeral: true });

    const desc = interaction.options.getString("설명");

    // 유저가 현재 들어간 음성채널을 우선 표시 (없으면 명령어 친 채널 표시)
    const voiceCh =
      interaction.member?.voice?.channel ??
      (interaction.channel?.isVoiceBased?.() ? interaction.channel : null);

    const displayCh = voiceCh ?? interaction.channel;   // 임베드에 표시할 채널
    const parentName = displayCh.parent?.name ?? "미분류";

    // 멤버/정원 표시
    let memberText = "—";
    if (voiceCh?.isVoiceBased?.()) {
      const cur = voiceCh.members.size;
      const cap = voiceCh.userLimit || 0;
      memberText = cap ? `${cur} / ${cap}` : `${cur} / 제한 없음`;
    }

    // 음성채널 입장 버튼 URL
    let joinUrl = null;
    if (voiceCh?.isVoiceBased?.()) {
      try {
        const me = interaction.guild.members.me;
        if (voiceCh.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite)) {
          const invite = await voiceCh.createInvite({
            maxAge: 1800, maxUses: 0, unique: true,
            reason: "팀원 모집(음성채널 입장 버튼)"
          });
          joinUrl = `https://discord.gg/${invite.code}`;
        } else {
          // 초대권한 없으면 채널 점프 링크로 대체
          joinUrl = `https://discord.com/channels/${interaction.guildId}/${voiceCh.id}`;
        }
      } catch {
        joinUrl = `https://discord.com/channels/${interaction.guildId}/${voiceCh.id}`;
      }
    }

    // 임베드 구성
    const embed = new EmbedBuilder()
      .setTitle("팀원 모집")
      .setDescription(`${interaction.user} 님이 팀원 모집 중입니다.`)
      .setColor(0xCDC1FF)
      .setFooter({ text: "아리봇 팀 모집", iconURL: interaction.client.user.displayAvatarURL() })

      .addFields(
        { name: "카테고리", value: parentName, inline: false },
        { name: "채널명",  value: `<#${displayCh.id}>${voiceCh ? " 🔊" : ""}`, inline: true },
        { name: "멤버",    value: memberText, inline: true },
        { name: "\u200b",  value: "\u200b",   inline: true },
        { name: "설명",    value: desc,       inline: false }
      );

    const btn = new ButtonBuilder()
      .setLabel("음성채널 입장")
      .setStyle(ButtonStyle.Link)
      .setURL(joinUrl ?? "https://discord.com")
      .setDisabled(!joinUrl);

    // ✅ 공개 메시지는 명령어 친 채널에 게시 (인터랙션 응답과 별개)
    const sent = await interaction.channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(btn)]
    });

    // ✅ 인터랙션은 editReply 한 번으로 마무리
    await interaction.editReply(`팀 모집 올렸어! [바로가기](${sent.url})`);
  }
};
