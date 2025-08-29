// commands/notice.js — 이전 공지/스티키 자동 삭제 → 새 공지 1장만 유지(기본: 스티키) + 줄바꿈 정규화
const { SlashCommandBuilder, EmbedBuilder, resolveColor, PermissionFlagsBits } = require("discord.js");

/* ───────────────── 색상 파싱 ───────────────── */
const DEFAULT_HEX = "#CDC1FF";
const NAMED = {
  pink:"#FF69B4", hotpink:"#FF1493", cherry:"#F01945", peach:"#FFB88C",
  sky:"#7EC8E3", aqua:"#00FFFF", lavender:"#C77DFF", lime:"#70FF70",
  navy:"#1B3B6F", black:"#111111", white:"#FFFFFF", yellow:"#FFE066",
  orange:"#FFA94D", blue:"#4DABF7", purple:"#9775FA", green:"#69DB7C"
};
function getDefaultColor() {
  const raw = (process.env.NOTICE_COLOR || "").trim();
  if (!raw) return resolveColor(DEFAULT_HEX);
  try { return resolveColor(raw); } catch { return resolveColor(DEFAULT_HEX); }
}
function toColorInt(input) {
  if (!input) return getDefaultColor();
  const key = String(input).toLowerCase().trim();
  const hex = NAMED[key] || input;
  try { return resolveColor(hex); } catch { return getDefaultColor(); }
}

/* ──────────────── 줄바꿈 정규화 ──────────────── */
function normalizeNewlines(s = "") {
  return String(s)
    .replace(/\r\n/g, "\n")   // CRLF → LF
    .replace(/\\n/g, "\n")    // 글자 그대로 '\n' → 개행
    .replace(/\s*\|\s*/g, "\n"); // 파이프(|) → 개행
}

/* ───────────────── Slash Command ───────────────── */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("notice").setNameLocalizations({ ko: "공지" })
    .setDescription("Create/Edit/Delete notices (sticky or normal)")
    .setDescriptionLocalizations({ ko: "공지 등록/수정/삭제 (스티키/일반)" })

    // 등록
    .addSubcommand(s =>
      s.setName("create").setNameLocalizations({ ko: "등록" })
       .setDescription("Create a notice (1 per channel)")
       .setDescriptionLocalizations({ ko: "공지 등록 (채널당 1개 유지)" })
       .addStringOption(o => o.setName("content").setNameLocalizations({ ko:"내용" })
         .setDescription("공지 내용").setRequired(true))
       .addStringOption(o => o.setName("title").setNameLocalizations({ ko:"제목" })
         .setDescription("제목(선택)"))
       .addStringOption(o => o.setName("color").setNameLocalizations({ ko:"컬러" })
         .setDescription("색상 (예: #CDC1FF, pink 등)"))
       .addBooleanOption(o => o.setName("sticky").setNameLocalizations({ ko:"스티키" })
         .setDescription("이번 공지를 스티키로 (기본: 켬)"))
    )

    // 수정
    .addSubcommand(s =>
      s.setName("edit").setNameLocalizations({ ko: "수정" })
       .setDescription("Edit current notice")
       .setDescriptionLocalizations({ ko: "현재 공지 수정" })
       .addStringOption(o => o.setName("content").setNameLocalizations({ ko:"내용" })
         .setDescription("새 내용"))
       .addStringOption(o => o.setName("title").setNameLocalizations({ ko:"제목" })
         .setDescription("새 제목"))
       .addStringOption(o => o.setName("color").setNameLocalizations({ ko:"컬러" })
         .setDescription("새 컬러"))
       .addBooleanOption(o => o.setName("sticky").setNameLocalizations({ ko:"스티키" })
         .setDescription("이 공지를 스티키로 전환/유지 (미지정 시 현재 모드 유지)"))
    )

    // 삭제
    .addSubcommand(s =>
      s.setName("delete").setNameLocalizations({ ko: "삭제" })
       .setDescription("Delete current notice")
       .setDescriptionLocalizations({ ko: "현재 공지 삭제" })
    )

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(i) {
    await i.deferReply({ ephemeral: true });

    const sub = i.options.getSubcommand();
    const ch  = i.channel;
    const { notice, stickyStore } = i._ari; // refreshSticky는 여기서 호출 안 함(중복 방지)

    // 공통: 이전 공지/스티키 안전 삭제
    async function purgePrev() {
      // 공지 메시지 삭제
      try {
        const saved = notice.store.get(ch.id);
        if (saved?.messageId) {
          const m = await ch.messages.fetch(saved.messageId).catch(()=>null);
          if (m) await m.delete().catch(()=>{});
        }
      } catch {}
      // 스티키 메시지 삭제
      try {
        const entry = stickyStore.get(ch.id);
        if (entry?.messageId) {
          const m = await ch.messages.fetch(entry.messageId).catch(()=>null);
          if (m) await m.delete().catch(()=>{});
        }
        stickyStore.delete(ch.id);
      } catch {}
    }

    // 현재 모드 파악
    function hasSticky() {
      const e = stickyStore.get(ch.id);
      return !!(e?.enabled && e?.messageId);
    }

    if (sub === "create") {
      const rawContent = i.options.getString("content", true);
      const titleOpt   = i.options.getString("title");
      const colorOpt   = i.options.getString("color");
      const stickyWant = i.options.getBoolean("sticky");
      const colorInt   = toColorInt(colorOpt);

      const embed = new EmbedBuilder()
        .setTitle(titleOpt?.trim() || "📢 공지")
        .setDescription(normalizeNewlines(rawContent))
        .setColor(colorInt);

      // ✅ 항상: 이전 것들 싹 삭제
      await purgePrev();

      const makeSticky = (stickyWant === undefined) ? true : !!stickyWant;

      if (makeSticky) {
        // ✅ 새 공지를 "스티키 1장"으로 바로 전송
        const sent = await ch.send({ embeds: [embed] });
        stickyStore.set(ch.id, {
          enabled   : true,
          mode      : "follow",
          payload   : { embeds: [embed] },
          messageId : sent.id,
          cooldownMs: 1500
        });
        return i.editReply("📌 공지 등록 완료! (스티키 적용 · 이전 공지 자동삭제)");
      } else {
        // ✅ 일반 공지 1장만 유지
        await notice.upsert(ch, { embeds: [embed] });
        return i.editReply("📌 공지 등록 완료! (일반 공지 · 이전 공지/스티키 정리)");
      }
    }

    if (sub === "edit") {
      const rawContent = i.options.getString("content");
      const titleNew   = i.options.getString("title");
      const colorNew   = i.options.getString("color");
      let   stickyWant = i.options.getBoolean("sticky"); // undefined면 현 모드 유지

      // 현재 모드 유지 로직
      if (stickyWant === undefined) stickyWant = hasSticky();

      // 베이스 임베드 로딩 (공지/스티키 중 존재하는 쪽)
      let base = new EmbedBuilder();
      try {
        const saved = notice.store.get(ch.id);
        if (saved?.messageId) {
          const msg = await ch.messages.fetch(saved.messageId);
          base = EmbedBuilder.from(msg.embeds?.[0] || new EmbedBuilder());
        } else {
          const ent = stickyStore.get(ch.id);
          if (ent?.messageId) {
            const msg = await ch.messages.fetch(ent.messageId);
            base = EmbedBuilder.from(msg.embeds?.[0] || new EmbedBuilder());
          }
        }
      } catch {}

      if (titleNew   != null) base.setTitle(titleNew || "📢 공지");
      if (rawContent != null) base.setDescription(normalizeNewlines(rawContent));
      if (colorNew   != null) base.setColor(toColorInt(colorNew));

      if (stickyWant) {
        // ✅ 스티키로 유지/전환: 이전 것 싹 지우고 스티키 1장 생성
        await purgePrev();
        const sent = await ch.send({ embeds: [base] });
        stickyStore.set(ch.id, {
          enabled   : true,
          mode      : "follow",
          payload   : { embeds: [base] },
          messageId : sent.id,
          cooldownMs: 1500
        });
        return i.editReply("✏️ 공지 수정 완료! (스티키 모드)");
      } else {
        // ✅ 일반 공지 유지/전환: 스티키 제거
        try { await notice.edit(ch, { embeds: [base] }); }
        catch { await notice.upsert(ch, { embeds: [base] }); }

        const entry = stickyStore.get(ch.id);
        if (entry?.messageId) {
          try { const m = await ch.messages.fetch(entry.messageId); await m.delete().catch(()=>{}); } catch {}
        }
        stickyStore.delete(ch.id);

        return i.editReply("✏️ 공지 수정 완료! (일반 모드)");
      }
    }

    if (sub === "delete") {
      await purgePrev();
      await notice.del(ch).catch(()=>{});
      return i.editReply("🗑️ 공지/스티키 모두 삭제 완료!");
    }
  }
};
