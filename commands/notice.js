// commands/notice.js
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
function normalizeNewlines(s="") {
  return String(s)
    .replace(/\r\n/g, "\n")   // CRLF → LF
    .replace(/\\n/g, "\n")    // 글자 그대로 '\n' → 개행
    .replace(/\s*\|\s*/g, "\n"); // 파이프(|) → 개행
}

/* ──────────────── 태그 주입 유틸 (푸터) ──────────────── */
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
         .setDescription("맨 아래 고정 (기본: 꺼짐)"))) // ✅ 기본 끔
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
         .setDescription("스티키 동기화 (기본: 꺼짐)"))) // ✅ 기본 끔
    .addSubcommand(s =>
      s.setName("delete").setNameLocalizations({ ko: "삭제" })
       .setDescription("Delete current notice")
       .setDescriptionLocalizations({ ko: "현재 공지 삭제" }))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(i) {
    await i.deferReply({ ephemeral: true });

    const sub = i.options.getSubcommand();
    const ch  = i.channel;

    // index.js에서 주입된 유틸들
    const { notice, stickyStore, refreshSticky } = i._ari;

    if (sub === "create") {
      const rawContent  = i.options.getString("content", true);
      const content     = normalizeNewlines(rawContent); // ✅ 개행 정규화
      const titleOpt    = i.options.getString("title");
      const colorOpt    = i.options.getString("color");
      const wantSticky  = i.options.getBoolean("sticky");
      const colorInt    = toColorInt(colorOpt);

      const embed = new EmbedBuilder()
        .setTitle(titleOpt?.trim() || "📢 공지")
        .setDescription(content)
        .setColor(colorInt);
      tagNotice(embed);

      // 채널당 공지 1개 유지
      await notice.upsert(ch, { embeds: [embed] });

      // ✅ 기본 꺼짐. 켰더라도 '즉시 refresh'는 하지 않음(중복 방지)
      const stickyOn = !!wantSticky;
      if (stickyOn) {
        const sEmbed = tagStickyFrom(embed);
        stickyStore.set(ch.id, {
          enabled   : true,
          mode      : "follow",
          payload   : { embeds: [sEmbed] },
          cooldownMs: 1500
        });
        // ❌ await refreshSticky(ch, stickyStore.get(ch.id));  // 즉시 발사 금지
      } else {
        // 스티키 끄기/정리
        const entry = stickyStore.get(ch.id);
        stickyStore.delete(ch.id);
        if (entry?.messageId) {
          try { const m = await ch.messages.fetch(entry.messageId); await m.delete().catch(()=>{}); } catch {}
        }
      }

      return i.editReply(`📌 공지 등록 완료!${stickyOn ? " (스티키 활성화—다음 메시지부터 따라붙음)" : ""}`);
    }

    if (sub === "edit") {
      const rawContent = i.options.getString("content");
      const titleNew   = i.options.getString("title");
      const colorNew   = i.options.getString("color");
      const wantSticky = i.options.getBoolean("sticky");
      if (rawContent==null && titleNew==null && colorNew==null) {
        return i.editReply("수정할 항목이 없어요.");
      }

      // 현재 공지 불러오기
      const saved = notice.store.get(ch.id);
      let baseEmbed;
      if (saved?.messageId) {
        try {
          const msg = await ch.messages.fetch(saved.messageId);
          baseEmbed = EmbedBuilder.from(msg.embeds?.[0] || new EmbedBuilder());
        } catch { baseEmbed = new EmbedBuilder(); }
      } else {
        baseEmbed = new EmbedBuilder();
      }

      if (titleNew    != null) baseEmbed.setTitle(titleNew || "📢 공지");
      if (rawContent  != null) baseEmbed.setDescription(normalizeNewlines(rawContent)); // ✅ 개행 정규화
      if (colorNew    != null) baseEmbed.setColor(toColorInt(colorNew));
      baseEmbed.setTimestamp(null);
      tagNotice(baseEmbed);

      await notice.edit(ch, { embeds: [baseEmbed] });

      // ✅ 스티키 기본 꺼짐 + 즉시 refresh 금지
      const stickyOn = !!wantSticky;
      if (stickyOn) {
        const sEmbed = tagStickyFrom(baseEmbed);
        stickyStore.set(ch.id, {
          enabled   : true,
          mode      : "follow",
          payload   : { embeds: [sEmbed] },
          cooldownMs: 1500
        });
        // ❌ await refreshSticky(ch, stickyStore.get(ch.id));
      } else if (wantSticky === false) {
        const entry = stickyStore.get(ch.id);
        stickyStore.delete(ch.id);
        if (entry?.messageId) {
          try { const m = await ch.messages.fetch(entry.messageId); await m.delete().catch(()=>{}); } catch {}
        }
      }

      return i.editReply(`✏️ 공지 수정 완료!${stickyOn ? " (스티키 활성화—다음 메시지부터 따라붙음)" : ""}`);
    }

    if (sub === "delete") {
      await notice.del(ch);
      // 스티키도 같이 끔
      const entry = stickyStore.get(ch.id);
      stickyStore.delete(ch.id);
      if (entry?.messageId) {
        try { const m = await ch.messages.fetch(entry.messageId); await m.delete().catch(()=>{}); } catch {}
      }
      return i.editReply("🗑️ 공지 삭제 완료!");
    }
  }
};
