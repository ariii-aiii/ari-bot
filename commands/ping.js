// commands/ping.js
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")                                   // 내부 고정 이름
    .setNameLocalizations({ ko: "아리핑" })             // 🇰🇷 UI에 /아리핑 으로 표시
    .setDescription("Mention participants of a recruit message")
    .setDescriptionLocalizations({ ko: "지정한 모집의 참가자(선택: 예비자 포함) 멘션" })
    .addStringOption(o =>
      o.setName("message_id").setNameLocalizations({ ko: "메시지id" })
        .setDescription("대상 모집 메시지 ID").setRequired(true)
    )
    .addBooleanOption(o =>
      o.setName("include_waitlist").setNameLocalizations({ ko: "예비자포함" })
        .setDescription("예비자(대기열)까지 함께 멘션할지? (기본: 꺼짐)")
    ),

  async execute(interaction) {
    const id = interaction.options.getString("message_id", true);
    const includeWait = interaction.options.getBoolean("include_waitlist") ?? false;

    const { recruitStates } = interaction._ari;

    // 상태가 있으면 그대로 사용, 없으면 임베드에서 최소 복구
    let st = recruitStates.get(id);
    if (!st) {
      try {
        const msg = await interaction.channel.messages.fetch(id);
        const emb = msg.embeds?.[0];
        const members = new Set();
        const waitlist = new Set();

        if (emb?.description) {
          // 본문에서 "1. <@id>" 같은 참가자 추출
          for (const m of emb.description.matchAll(/^\s*\d+\.\s*<@(\d+)>/gm)) members.add(m[1]);
          // 예비자 섹션이 있다면 그 아래도 추출
          const wait = emb.description.split("**예비자").pop();
          if (wait && wait !== emb.description) {
            for (const w of wait.matchAll(/^\s*\d+\.\s*<@(\d+)>/gm)) waitlist.add(w[1]);
          }
        }
        st = { members, waitlist };
      } catch { /* 무시 */ }
    }

    let ids = st ? [...st.members] : [];
    if (includeWait && st?.waitlist) ids = ids.concat([...st.waitlist]);

    if (!ids.length) {
      return interaction.reply({ content: "멘션할 참가자를 찾지 못했어요 ㅠㅠ", ephemeral: true });
    }

    // 디스코드 메시지 길이/멘션 스팸 방지: 25명씩 쪼개서 전송
    const chunks = [];
    while (ids.length) chunks.push(ids.splice(0, 25));

    for (const chunk of chunks) {
      await interaction.channel.send(`🔔 ${chunk.map(u => `<@${u}>`).join(" ")}`);
    }
    return interaction.reply({ content: "참가자 멘션 보냈어요! 🔔", ephemeral: true });
  }
};
