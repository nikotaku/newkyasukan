import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let systemPrompt = "";
    let userPrompt = "";

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
      
      case "news":
        systemPrompt = "あなたはメンズエステのニュース記事を作成する専門のライターです。読みやすく、魅力的で、お客様の興味を引く記事を日本語で作成してください。";
        userPrompt = newsTitle 
          ? `タイトル: ${newsTitle}\n\n上記のタイトルに基づいて、メンズエステのニュース記事を300-500文字程度で作成してください。店舗の魅力やサービスの特徴、お得な情報などを含めてください。`
          : `メンズエステの新着ニュース記事を300-500文字程度で作成してください。店舗の魅力やサービスの特徴、お得な情報などを含めてください。`;
        break;
      
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

    console.log("Calling Lovable AI with type:", type);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
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
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "クレジットが不足しています。ワークスペースに資金を追加してください。" }), 
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI API error");
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;

    console.log("Generated content:", generatedContent);

    return new Response(
      JSON.stringify({ content: generatedContent }),
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
