// commands/team.js
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("팀")
    .setDescription("팀원 모집 메시지를 생성합니다.")
    .addStringOption(o =>
      o.setName("설명")
       .setDescription("모집 내용을 입력하세요.")
       .setRequired(true)
    ),

  async execute(interaction) {
    const desc = interaction.options.getString("설명");

    // 우선순위: 유저가 들어가있는 음성채널 > 현재 채널이 음성채널
    const voiceCh =
      interaction.member?.voice?.channel ??
      (interaction.channel?.isVoiceBased?.() ? interaction.channel : null);

    const parentName = (voiceCh ?? interaction.channel).parent?.name ?? "미분류";
    const chName = (voiceCh ?? interaction.channel).name;

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
        if (voiceCh
          .permissionsFor(interaction.guild.members.me)
          .has(PermissionFlagsBits.CreateInstantInvite)) {
          const invite = await voiceCh.createInvite({
            maxAge: 1800, // 30분
            maxUses: 0,
            unique: true,
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

    // 💜 연보라 컬러 (예: #C4B5FD)
    const embed = new EmbedBuilder()
      .setTitle("팀원 모집")
      .setDescription(`${interaction.user} 님이 팀원 모집 중입니다.`)
      .setColor(0xC4B5FD)
      // ── 1행: 왼쪽(카테고리) / 오른쪽(멤버) ──
      .addFields(
        { name: "카테고리", value: parentName, inline: true },
        { name: "멤버", value: memberText, inline: true },
        { name: "\u200b", value: "\u200b", inline: true }, // 자리맞춤용 스페이서
        // ── 2행: 왼쪽(채널명)만 ──
        { name: "채널명", value: `#${chName}`, inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        // ── 3행: 설명(풀폭) ──
        { name: "설명", value: desc, inline: false }
      );

    const btn = new ButtonBuilder()
      .setLabel("음성채널 입장")
      .setStyle(ButtonStyle.Link);

    if (joinUrl) {
      btn.setURL(joinUrl);
    } else {
      btn.setURL("https://discord.com"); // 링크 없으면 비활성 대용
      btn.setDisabled(true);
    }

    const rows = [new ActionRowBuilder().addComponents(btn)];
    await interaction.reply({ embeds: [embed], components: rows });
  }
};
