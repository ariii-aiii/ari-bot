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
    console.log("[/팀] handler v0.4 적용"); // ← 콘솔에 이게 보이면 최신 코드 맞음

    const desc = interaction.options.getString("설명");

    // 우선순위: 유저가 들어간 음성채널 > 현재 채널이 음성
    const voiceCh =
      interaction.member?.voice?.channel ??
      (interaction.channel?.isVoiceBased?.() ? interaction.channel : null);

    const baseCh = voiceCh ?? interaction.channel;
    const parentName = baseCh.parent?.name ?? "미분류";
    const chName = baseCh.name;

    let memberText = "—";
    if (voiceCh?.isVoiceBased()) {
      const cur = voiceCh.members.size;
      const cap = voiceCh.userLimit || 0;
      memberText = cap ? `${cur} / ${cap}` : `${cur} / 제한 없음`;
    }

    // 초대/이동 링크
    let joinUrl = null;
    if (voiceCh?.isVoiceBased()) {
      try {
        if (voiceCh.permissionsFor(interaction.guild.members.me)
                     .has(PermissionFlagsBits.CreateInstantInvite)) {
          const invite = await voiceCh.createInvite({
            maxAge: 1800, maxUses: 0, unique: true,
            reason: "팀원 모집(음성채널 입장 버튼)"
          });
          joinUrl = `https://discord.gg/${invite.code}`;
        } else {
          joinUrl = `https://discord.com/channels/${interaction.guildId}/${voiceCh.id}`;
        }
      } catch {
        joinUrl = `https://discord.com/channels/${interaction.guildId}/${voiceCh.id}`;
      }
    }

    // 💜 연보라(#CDC1FF) — 임베드 왼쪽 세로줄 컬러
    const embed = new EmbedBuilder()
      .setTitle("팀원 모집")
      .setDescription(`${interaction.user} 님이 팀원 모집 중입니다.`)
      .setColor(0xCDC1FF)
      .setFooter({ text: "layout v0.4" }) // 메시지 하단에 표시 → 최신 코드 확인용
      .addFields(
        // 1행: 카테고리 (풀폭)
        { name: "카테고리", value: parentName, inline: false },

        // 2행: 채널명(왼쪽) · 멤버(오른쪽)  ← 둘 다 카테고리 '밑'에 위치
        { name: "채널명", value: `<#${baseCh.id}>`, inline: true },
        { name: "멤버",   value: memberText,   inline: true },
        { name: "\u200b", value: "\u200b",     inline: true }, // 2열 정렬 보정

        // 3행: 설명 (풀폭)
        { name: "설명", value: desc, inline: false }
      );

    const btn = new ButtonBuilder()
      .setLabel("음성채널 입장")
      .setStyle(ButtonStyle.Link)
      .setURL(joinUrl ?? "https://discord.com");
    if (!joinUrl) btn.setDisabled(true);

    await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(btn)]
    });
  }
};
