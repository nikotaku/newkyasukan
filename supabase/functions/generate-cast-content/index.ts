import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ニュース生成用に実データ（割引・料金・出勤）を取得してプロンプト用テキストと画像候補を作る
async function buildNewsGrounding(): Promise<{ facts: string; images: string[] }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return { facts: "", images: [] };

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const today = new Date();
    const weekLater = new Date(today.getTime() + 7 * 86400000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const [discountsRes, nomRes, optRes, shiftsRes, castsRes, bannersRes] = await Promise.all([
      sb.from("discounts").select("name, discount_type, discount_value").eq("is_active", true),
      sb.from("nomination_rates").select("nomination_type, customer_price"),
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

    const noms = nomRes.data ?? [];
    if (noms.length) {
      lines.push("【指名料金】");
      for (const n of noms) lines.push(`・${n.nomination_type}：${Number(n.customer_price).toLocaleString()}円`);
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

    const shifts = (shiftsRes.data ?? []).filter((s) => castMap.has(s.cast_id));
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

    // 画像候補: 出勤予定キャストの写真（重複排除・最大3）＋バナー1
    const images: string[] = [];
    const seen = new Set<string>();
    for (const s of shifts) {
      const photo = castMap.get(s.cast_id)?.photo;
      if (photo && !seen.has(photo)) { seen.add(photo); images.push(photo); }
      if (images.length >= 3) break;
    }
    const banner = bannersRes.data?.[0]?.image_url;
    if (banner) images.push(banner);

    return { facts: lines.join("\n"), images };
  } catch (e) {
    console.error("buildNewsGrounding failed:", e);
    return { facts: "", images: [] };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      type, castName, castType, existingProfile, newsTitle, features,
      // coupon
      couponName, couponDiscount, couponExpiry, couponConditions,
      // schedule
      scheduleDate, scheduleNote,
      // newstaff
      staffName, staffProfile, staffMessage,
    } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    let systemPrompt = "";
    let userPrompt = "";
    let autoImages: string[] = [];

    switch (type) {
      case "profile":
        systemPrompt = "あなたはメンズエステのキャストプロフィールを作成する専門のライターです。魅力的で親しみやすく、お客様が興味を持つようなプロフィールを日本語で作成してください。";
        userPrompt = `キャスト名: ${castName}\nタイプ: ${castType}\n\n上記の情報を元に、200-300文字程度の魅力的なプロフィールを作成してください。${existingProfile ? `既存のプロフィール: ${existingProfile}\n\n既存の内容を参考にしつつ、より魅力的に改善してください。` : ''}`;
        break;
      
      case "announcement":
        systemPrompt = "あなたはメンズエステのお知らせ文章を作成する専門のライターです。お客様に分かりやすく、魅力的なお知らせ文を日本語で作成してください。";
        userPrompt = `キャスト名: ${castName}\nタイプ: ${castType}\n\n上記のキャストに関する新着情報やお知らせの文章を100-150文字程度で作成してください。`;
        break;
      
      case "catchphrase":
        systemPrompt = "あなたはメンズエステのキャッチコピーを作成する専門のコピーライターです。短く印象的で、お客様の興味を引くキャッチコピーを日本語で作成してください。";
        userPrompt = `キャスト名: ${castName}\nタイプ: ${castType}\n\n上記のキャストの魅力を表現する、20-40文字程度の印象的なキャッチコピーを作成してください。`;
        break;
      
      case "news": {
        const { facts, images } = await buildNewsGrounding();
        autoImages = images;
        systemPrompt = "あなたはメンズエステのニュース記事を作成する専門のライターです。読みやすく、魅力的で、お客様の興味を引く記事を日本語で作成してください。重要: 料金・割引・出勤など具体的な情報は、必ず提供された『参照データ』に記載のある事実のみを使用し、記載のない金額・割引名・キャスト名・日時を創作してはいけません。参照データが空の場合は、具体的な数値や固有名を避けた一般的な内容にしてください。";
        const factsBlock = facts
          ? `\n\n===== 参照データ（この事実のみ使用可。創作禁止）=====\n${facts}\n===============================================\n`
          : "";
        userPrompt = (newsTitle
          ? `タイトル: ${newsTitle}\n\n上記のタイトルに基づいて、メンズエステのニュース記事を300-500文字程度で作成してください。`
          : `メンズエステの新着ニュース記事を300-500文字程度で作成してください。`)
          + `下記の参照データに含まれる実際の割引・料金・出勤情報を活用し、お得感のある内容にしてください。参照データに無い具体的な数値や固有名は使わないでください。${factsBlock}`;
        break;
      }
      
      case "coupon":
        systemPrompt = "あなたはメンズエステのクーポン案内記事を作成する専門のライターです。お客様の来店意欲を高める魅力的なクーポン案内を日本語で作成してください。";
        userPrompt = `クーポン名: ${couponName}\n割引・特典内容: ${couponDiscount}\n有効期限: ${couponExpiry || "記載なし"}\n利用条件: ${couponConditions || "特になし"}\n\n上記の情報を元に、お客様向けのクーポン案内記事を200〜400文字で作成してください。お得感と限定感を演出し、来店を促す内容にしてください。`;
        break;

      case "schedule":
        systemPrompt = "あなたはメンズエステの出勤情報記事を作成する専門のライターです。キャストの魅力を引き出し、お客様の来店を促す出勤案内を日本語で作成してください。";
        userPrompt = `キャスト名: ${castName}\n出勤日時: ${scheduleDate}\n${scheduleNote ? `コメント・備考: ${scheduleNote}\n` : ""}上記の情報を元に、出勤案内記事を150〜250文字で作成してください。キャストの魅力が伝わるような文体にしてください。`;
        break;

      case "shop_comment":
        systemPrompt = "あなたはメンズエステのショップコメント（スタッフがお客様に向けてキャストを紹介する文章）を作成する専門のライターです。三人称で、お客様の来店意欲を高める魅力的な紹介文を日本語で作成してください。";
        userPrompt = `キャスト名: ${castName}\nタイプ: ${castType}${features ? `\n特徴: ${features}` : ""}${existingProfile ? `\nプロフィール参考: ${existingProfile}` : ""}\n\n上記の情報を元に、店舗スタッフ視点のショップコメントを100〜200文字で作成してください。三人称（「${castName}ちゃん」「彼女は」等）で書き、キャストの個性と魅力を引き出してください。`;
        break;

      case "newstaff":
        systemPrompt = "あなたはメンズエステの新人入店情報記事を作成する専門のライターです。新人スタッフの魅力を伝え、お客様の期待感を高める入店案内を日本語で作成してください。";
        userPrompt = `スタッフ名: ${staffName}\n${staffProfile ? `プロフィール: ${staffProfile}\n` : ""}${staffMessage ? `本人からのメッセージ: ${staffMessage}\n` : ""}上記の情報を元に、新人入店のお知らせ記事を250〜400文字で作成してください。スタッフの個性と魅力を引き出した内容にしてください。`;
        break;

      default:
        throw new Error("Invalid content type");
    }

    console.log("Calling Anthropic API with type:", type);

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
        messages: [
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "レート制限に達しました。しばらく待ってから再度お試しください。" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402 || response.status === 400) {
        const errBody = await response.text();
        console.error("Anthropic API error:", response.status, errBody);
        return new Response(
          JSON.stringify({ error: "クレジットが不足しているか、リクエストが不正です。" }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      throw new Error("Anthropic API error");
    }

    const data = await response.json();
    const generatedContent = data.content?.[0]?.text ?? "";

    console.log("Generated content:", generatedContent);

    return new Response(
      JSON.stringify({ content: generatedContent, images: autoImages }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-cast-content:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
