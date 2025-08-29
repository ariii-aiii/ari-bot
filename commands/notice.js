// commands/notice.js — 공지 1장만 보이게(스티키/공지 모드 분리) + 줄바꿈 정상화
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
    .replace(/\r\n/g, "\n")      // CRLF → LF
    .replace(/\\n/g, "\n")       // 글자 그대로 "\n" → 실제 개행
    .replace(/\s*\|\s*/g, "\n"); // 파이프(|) → 개행
}

/* ──────────────── 태그 주입 (푸터) ──────────────── */
function tagNotice(embed) {
  const base = embed.data.footer?.text || "";
  if (!base.includes("TAG:NOTICE")) {
    embed.setFooter({ text: `${base ? base + " · " : ""}TAG:NOTICE` });
  }
  return embed;
}
function tagStickyFrom(embed) {
  const e = EmbedBuilder.from(embed);
  const base = e.data.footer?.text || "";
  if (!base.includes("TAG:STICKY")) {
    e.setFooter({ text: `${base ? base + " · " : ""}TAG:STICKY` });
  }
  return e;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notice").setNameLocalizations({ ko: "공지" })
    .setDescription("Create/Edit/Delete notices with sticky sync")
    .setDescriptionLocalizations({ ko: "공지 등록/수정/삭제 + 스티키 동기화" })

    // 등록
    .addSubcommand(s =>
      s.setName("create").setNameLocalizations({ ko: "등록" })
       .setDescription("Create a notice (keeps one per channel)")
       .setDescriptionLocalizations({ ko: "공지 등록 (채널당 1개 유지)" })
       .addStringOption(o => o.setName("content").setNameLocalizations({ ko:"내용" })
         .setDescription("공지 내용").setRequired(true))
       .addStringOption(o => o.setName("title").setNameLocalizations({ ko:"제목" })
         .setDescription("제목(선택)"))
       .addStringOption(o => o.setName("color").setNameLocalizations({ ko:"컬러" })
         .setDescription("색상 (예: #CDC1FF, pink 등)"))
       .addBooleanOption(o => o.setName("sticky").setNameLocalizations({ ko:"스티키" })
         .setDescription("맨 아래 고정 (기본: 꺼짐)"))) // ✅ 기본 off

    // 수정
    .addSubcommand(s =>
      s.setName("edit").setNameLocalizations({ ko: "수정" })
       .setDescription("Edit current notice")
       .setDescriptionLocalizations({ ko: "현재 공지 수정" })
       .addStringOption(o => o.setName("content").setNameLocalizations({ ko:"내용" })
         .setDescription("새 내용").setRequired(false))
       .addStringOption(o => o.setName("title").setNameLocalizations({ ko:"제목" })
         .setDescription("새 제목").setRequired(false))
       .addStringOption(o => o.setName("color").setNameLocalizations({ ko:"컬러" })
         .setDescription("새 컬러").setRequired(false))
       .addBooleanOption(o => o.setName("sticky").setNameLocalizations({ ko:"스티키" })
         .setDescription("스티키 전용으로 전환/갱신 (기본: 꺼짐)"))) // ✅ 기본 off

    // 삭제
    .addSubcommand(s =>
      s.setName("delete").setNameLocalizations({ ko: "삭제" })
       .setDescription("Delete current notice")
       .setDescriptionLocalizations({ ko: "현재 공지 삭제" }))

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(i) {
    await i.deferReply({ ephemeral: true });

    const sub = i.options.getSubcommand();
    const ch  = i.channel;
    const { notice, stickyStore /*, refreshSticky*/ } = i._ari; // refreshSticky 즉시호출은 비활성(중복 방지)

    // ───────────────────────── 등록 ─────────────────────────
    if (sub === "create") {
      const rawContent = i.options.getString("content", true);
      const titleOpt   = i.options.getString("title");
      const colorOpt   = i.options.getString("color");
      const wantSticky = i.options.getBoolean("sticky");   // true일 때만 스티키
      const colorInt   = toColorInt(colorOpt);

      const base = new EmbedBuilder()
        .setTitle((titleOpt?.trim()) || "📢 공지")
        .setDescription(normalizeNewlines(rawContent))
        .setColor(colorInt);
      tagNotice(base);

      const stickyOn = !!wantSticky;

      if (stickyOn) {
        // ✅ 스티키 전용: 공지 메시지 생성 안 함
        const sEmbed = tagStickyFrom(base);
        stickyStore.set(ch.id, {
          enabled   : true,
          mode      : "follow",
          payload   : { embeds: [sEmbed] },
          cooldownMs: 1500
        });
        // 즉시 refreshSticky 호출하지 않음 → 중복 방지
      } else {
        // ✅ 공지만 유지 (기존 스티키는 정리)
        const sEntry = stickyStore.get(ch.id);
        stickyStore.delete(ch.id);
        if (sEntry?.messageId) {
          try { const m = await ch.messages.fetch(sEntry.messageId); await m.delete().catch(()=>{}); } catch {}
        }
        await notice.upsert(ch, { embeds: [base] });
      }

      return i.editReply(`📌 공지 등록 완료!${stickyOn ? " (스티키 전용—다음 메시지부터 따라붙음)" : ""}`);
    }

    // ───────────────────────── 수정 ─────────────────────────
    if (sub === "edit") {
      const rawContent = i.options.getString("content");
      const titleNew   = i.options.getString("title");
      const colorNew   = i.options.getString("color");
      const wantSticky = i.options.getBoolean("sticky");
      if (rawContent==null && titleNew==null && colorNew==null && wantSticky==null) {
        return i.editReply("수정할 항목이 없어요.");
      }

      const stickyOn = !!wantSticky;

      // 공지 메시지 기반은 공지 모드일 때만 필요
      let base = new EmbedBuilder();
      if (!stickyOn) {
        const saved = notice.store.get(ch.id);
        if (saved?.messageId) {
          try {
            const msg = await ch.messages.fetch(saved.messageId);
            base = EmbedBuilder.from(msg.embeds?.[0] || new EmbedBuilder());
          } catch {}
        }
      }

      if (titleNew   != null) base.setTitle(titleNew || "📢 공지");
      if (rawContent != null) base.setDescription(normalizeNewlines(rawContent));
      if (colorNew   != null) base.setColor(toColorInt(colorNew));
      base.setTimestamp(null);
      tagNotice(base);

      if (stickyOn) {
        // ✅ 스티키만 갱신, 공지 메시지는 제거
        const sEmbed = tagStickyFrom(base);
        stickyStore.set(ch.id, {
          enabled   : true,
          mode      : "follow",
          payload   : { embeds: [sEmbed] },
          cooldownMs: 1500
        });
        const entry = notice.store.get(ch.id);
        if (entry?.messageId) {
          try { const m = await ch.messages.fetch(entry.messageId); await m.delete().catch(()=>{}); } catch {}
        }
      } else {
        // ✅ 공지만 수정, 스티키 제거
        await notice.edit(ch, { embeds: [base] });
        const sEntry = stickyStore.get(ch.id);
        stickyStore.delete(ch.id);
        if (sEntry?.messageId) {
          try { const m = await ch.messages.fetch(sEntry.messageId); await m.delete().catch(()=>{}); } catch {}
        }
      }

      return i.editReply(`✏️ 공지 수정 완료!${stickyOn ? " (스티키 전용)" : ""}`);
    }

    // ───────────────────────── 삭제 ─────────────────────────
    if (sub === "delete") {
      await notice.del(ch);
      const entry = stickyStore.get(ch.id);
      stickyStore.delete(ch.id);
      if (entry?.messageId) {
        try { const m = await ch.messages.fetch(entry.messageId); await m.delete().catch(()=>{}); } catch {}
      }
      return i.editReply("🗑️ 공지 삭제 완료!");
    }
  }
};
