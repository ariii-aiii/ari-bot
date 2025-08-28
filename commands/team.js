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

    // 🔎 어떤 음성채널을 버튼에 연결할지 선택
    // 1순위: 사용자가 현재 들어가 있는 음성채널
    // 2순위: 명령을 친 채널이 음성채널이면 그 채널
    const voiceCh =
      interaction.member?.voice?.channel ??
      (interaction.channel?.isVoiceBased?.() ? interaction.channel : null);

    // 카테고리 / 채널명 / 멤버수 계산
    const parentName = interaction.channel.parent?.name ?? "미분류";
    const chName = voiceCh ? voiceCh.name : interaction.channel.name;

    let memberText = "—";
    if (voiceCh?.isVoiceBased()) {
      const cur = voiceCh.members.size;
      const cap = voiceCh.userLimit || 0;
      memberText = cap ? `${cur} / ${cap}` : `${cur} / 제한 없음`;
    }

    // 🎟️ 초대 링크 만들기 (권한 있으면 초대코드, 없으면 채널 링크로 대체)
    let joinUrl = null;
    if (voiceCh?.isVoiceBased()) {
      try {
        if (voiceCh
          .permissionsFor(interaction.guild.members.me)
          .has(PermissionFlagsBits.CreateInstantInvite)) {
          const invite = await voiceCh.createInvite({
            maxAge: 1800, // 30분
            maxUses: 0,   // 무제한
            unique: true,
            reason: "팀원 모집(음성채널 입장 버튼)"
          });
          joinUrl = `https://discord.gg/${invite.code}`;
        } else {
          // 초대권한 없으면 채널 열기 링크로
          joinUrl = `https://discord.com/channels/${interaction.guildId}/${voiceCh.id}`;
        }
      } catch {
        joinUrl = `https://discord.com/channels/${interaction.guildId}/${voiceCh.id}`;
      }
    }

    // 📌 임베드
    const embed = new EmbedBuilder()
      .setTitle("팀원 모집")
      .setDescription(`${interaction.user} 님이 팀원 모집 중입니다.`)
      .addFields(
        { name: "카테고리", value: parentName, inline: true },
        { name: "채널명", value: `#${chName}`, inline: true },
        { name: "멤버", value: memberText, inline: true },
        { name: "설명", value: desc }
      )
      .setColor(0x3b82f6);

    // 🔘 버튼 (음성채널 있으면 활성, 없으면 비활성)
    const rows = [];
    const btn = new ButtonBuilder()
      .setLabel("음성채널 입장")
      .setStyle(ButtonStyle.Link);

    if (joinUrl) {
      btn.setURL(joinUrl);
    } else {
      btn.setURL("https://discord.com"); // 더미 URL 필요해서 넣음
      btn.setDisabled(true);
    }
    rows.push(new ActionRowBuilder().addComponents(btn));

    await interaction.reply({ embeds: [embed], components: rows });
  }
};
