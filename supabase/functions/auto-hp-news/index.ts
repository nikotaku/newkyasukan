// HPニュース(hp_articles)を1日1回自動生成して公開する。
// pg_cron から毎日1回呼び出される。実データ(割引・料金・出勤)を根拠に
// Anthropic でニュース記事を生成し、hp_articles に is_published=true で投稿する。
// 同日重複防止: slug = auto-news-YYYYMMDD で冪等化。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

function jstYmd(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
}

// ニュース生成の根拠となる実データを収集
async function buildNewsGrounding(sb: any): Promise<{ facts: string; images: string[] }> {
  try {
    const today = new Date();
    const weekLater = new Date(today.getTime() + 7 * 86400000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const [discountsRes, optRes, shiftsRes, castsRes, bannersRes] = await Promise.all([
      sb.from("discounts").select("name, discount_type, discount_value").eq("is_active", true),
      sb.from("option_rates").select("option_name, customer_price, extension_minutes").eq("is_visible", true).order("display_order"),
      sb.from("shifts").select("cast_id, shift_date, start_time, end_time").gte("shift_date", iso(today)).lte("shift_date", iso(weekLater)).order("shift_date").limit(40),
      sb.from("casts").select("id, name, photo").eq("is_visible", true),
      sb.from("banners").select("image_url").eq("is_active", true).order("display_order").limit(1),
    ]);

    const lines: string[] = [];
    const discounts = discountsRes.data ?? [];
    if (discounts.length) {
      lines.push("【現在有効な割引】");
      for (const d of discounts) {
        const v = d.discount_type === "percent" ? `${d.discount_value}%OFF` : `${Number(d.discount_value).toLocaleString()}円引き`;
        lines.push(`・${d.name}：${v}`);
      }
    }
    const opts = optRes.data ?? [];
    if (opts.length) {
      lines.push("【オプション料金】");
      for (const o of opts) {
        const ext = o.extension_minutes ? `（${o.extension_minutes}分）` : "";
        lines.push(`・${o.option_name}${ext}：${Number(o.customer_price).toLocaleString()}円`);
      }
    }
    const castMap = new Map<string, { name: string; photo: string | null }>();
    for (const c of castsRes.data ?? []) castMap.set(c.id, { name: c.name, photo: c.photo });
    const shifts = (shiftsRes.data ?? []).filter((s: any) => castMap.has(s.cast_id));
    if (shifts.length) {
      lines.push("【今後7日間の出勤予定】");
      const wd = ["日", "月", "火", "水", "木", "金", "土"];
      for (const s of shifts.slice(0, 20)) {
        const c = castMap.get(s.cast_id)!;
        const dt = new Date(s.shift_date + "T00:00:00");
        const dstr = `${dt.getMonth() + 1}/${dt.getDate()}(${wd[dt.getDay()]})`;
        const time = s.start_time && s.end_time ? ` ${String(s.start_time).slice(0, 5)}〜${String(s.end_time).slice(0, 5)}` : "";
        lines.push(`・${dstr}${time} ${c.name}`);
      }
    }
    const images: string[] = [];
    const seen = new Set<string>();
    for (const s of shifts) {
      const photo = castMap.get(s.cast_id)?.photo;
      if (photo && !seen.has(photo)) { seen.add(photo); images.push(photo); }
      if (images.length >= 2) break;
    }
    const banner = bannersRes.data?.[0]?.image_url;
    if (banner && images.length < 2) images.push(banner);
    return { facts: lines.join("\n"), images };
  } catch (e) {
    console.error("buildNewsGrounding failed:", e);
    return { facts: "", images: [] };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // 同日重複防止（手動 force=true で上書き生成も可）
    let force = false;
    try { const b = await req.json(); force = b?.force === true; } catch (_) { /* body なし */ }

    const ymd = jstYmd();
    const slug = `auto-news-${ymd.replace(/-/g, "")}`;

    if (!force) {
      const { data: existing } = await sb.from("hp_articles").select("id").eq("slug", slug).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ skipped: "already generated today", slug }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { facts, images } = await buildNewsGrounding(sb);

    const systemPrompt =
      "あなたはメンズエステ『全力エステ 仙台』のニュース記事を作成する専門ライターです。読みやすく、魅力的で、お客様の来店意欲を高める記事を日本語で作成してください。" +
      "重要: 料金・割引・出勤など具体的な情報は、必ず提供された『参照データ』に記載のある事実のみを使用し、記載のない金額・割引名・キャスト名・日時を創作してはいけません。参照データが空の場合は、具体的な数値や固有名を避けた一般的な内容にしてください。" +
      "出力形式: 1行目に記事タイトル（15〜25文字程度・記号や絵文字なし）、2行目は空行、3行目以降に本文（300〜450文字）。" +
      "Markdown記法（#, **, ---, |, 箇条書き記号)やハッシュタグは使わず、通常の日本語の文章と改行のみ。絵文字は本文に多くても2〜3個まで。";

    const factsBlock = facts
      ? `\n\n===== 参照データ（この事実のみ使用可。創作禁止）=====\n${facts}\n===============================================\n`
      : "";
    const userPrompt =
      `本日(${ymd})のメンズエステ新着ニュース記事を作成してください。参照データにある割引・料金・出勤情報を活用し、お得感・季節感のある自然な内容にしてください。参照データに無い具体的な数値や固有名は使わないでください。${factsBlock}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return new Response(JSON.stringify({ error: "Anthropic API error", status: response.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const generated = (data.content?.[0]?.text ?? "").trim();
    if (!generated) throw new Error("empty generation");

    // 1行目=タイトル、残り=本文
    const parts = generated.split("\n");
    let title = (parts.shift() ?? "").trim().replace(/^タイトル[:：]\s*/, "");
    const body = parts.join("\n").trim();
    if (!title) title = `${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8, 10))}日のお知らせ`;
    if (title.length > 40) title = title.slice(0, 40);

    const { error: insErr } = await sb.from("hp_articles").insert({
      title,
      slug,
      content: body || generated,
      category: "news",
      is_published: true,
      image_urls: images,
      store_id: DEFAULT_STORE_ID,
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ success: true, slug, title }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("auto-hp-news error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
