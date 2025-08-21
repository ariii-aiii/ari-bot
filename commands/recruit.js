const { SlashCommandBuilder } = require("discord.js");
const CAP_CHOICES = [16, 20, 28, 32, 40, 56, 64].map(n => ({ name: `${n}`, value: n }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recruit")
    .setNameLocalizations({ ko: "모집" })
    .setDescription("Create/manage recruit posts with buttons")
    .setDescriptionLocalizations({ ko: "버튼 모집 등록/관리" })
    .addSubcommand(sub =>
      sub.setName("create").setNameLocalizations({ ko: "시작" })
        .setDescription("Create a recruitment card with buttons")
        .setDescriptionLocalizations({ ko: "모집 카드 만들기(버튼 포함)" })
        .addStringOption(o =>
          o.setName("title").setNameLocalizations({ ko: "제목" })
            .setDescription("모집 제목").setRequired(true))
        .addIntegerOption(o =>
          o.setName("cap").setNameLocalizations({ ko: "인원" })
            .setDescription("정원 선택").addChoices(...CAP_CHOICES).setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { recruitStates, rowFor, buildRecruitEmbed } = interaction._ari;

    if (sub === "create") {
      const title = interaction.options.getString("title", true);
      const cap = interaction.options.getInteger("cap", true);

      const st = { cap, hostId: interaction.user.id, members: new Set(), waitlist: new Set(), isClosed: false, title };
      const msg = await interaction.reply({
        embeds: [buildRecruitEmbed(st)],
        components: [rowFor("temp", false)],
        fetchReply: true
      });
      await msg.edit({ components: [rowFor(msg.id, false)] });
      recruitStates.set(msg.id, st);
      return;
    }
  }
};
