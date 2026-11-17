import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ニュース生成用に実データ（割引・料金・出勤）を取得してプロンプト用テキストと画像候補を作る
async function buildNewsGrounding(storeId: string): Promise<{ facts: string; images: string[] }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY || !/^[0-9a-f-]{36}$/i.test(storeId)) return { facts: "", images: [] };

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const todayYmd = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [discountsRes, shiftsRes, castsRes, bannersRes] = await Promise.all([
      sb.from("discounts").select("name, discount_type, discount_value").eq("store_id", storeId).eq("is_active", true),
      sb.from("shifts").select("cast_id, shift_date, start_time, end_time").eq("store_id", storeId).eq("shift_date", todayYmd).order("start_time").limit(20),
      sb.from("casts").select("id, name, photo").eq("store_id", storeId).eq("is_active", true).eq("is_visible", true),
      sb.from("banners").select("image_url").eq("store_id", storeId).eq("is_active", true).order("display_order").limit(1),
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

    const castMap = new Map<string, { name: string; photo: string | null }>();
    for (const c of castsRes.data ?? []) castMap.set(c.id, { name: c.name, photo: c.photo });

    const shifts = (shiftsRes.data ?? []).filter((s) => castMap.has(s.cast_id));
    if (shifts.length) {
      lines.push("【本日の出勤】");
      for (const s of shifts.slice(0, 8)) {
        const c = castMap.get(s.cast_id)!;
        const time = s.start_time && s.end_time ? ` ${String(s.start_time).slice(0, 5)}〜${String(s.end_time).slice(0, 5)}` : "";
        lines.push(`・${c.name}${time}`);
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

// ログイン中のユーザーのJWTか（公開鍵だけの呼び出しは通さない）
async function isSignedIn(req: Request) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!SUPABASE_URL || !SERVICE_KEY || !jwt) return false;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${jwt}` } });
  if (!response.ok) return false;
  const user = await response.json().catch(() => null);
  return Boolean(user?.id);
}

async function canManageStore(req: Request, storeId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return false;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!SUPABASE_URL || !SERVICE_KEY || !jwt) return false;
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!userResponse.ok) return false;
  const user = await userResponse.json().catch(() => null);
  if (!user?.id) return false;

  // 管理権限は user_stores.role で見る（このプロジェクトに user_roles は無い）
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: membership } = await sb.from("user_stores").select("role").eq("user_id", user.id).eq("store_id", storeId).maybeSingle();
  return ["owner", "manager"].includes(membership?.role || "");
}

class AiHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Google AI（Gemini）の鍵：Edge Function の Secret か、Vault の gemini_api_key（RPC get_gemini_api_key、service_role のみ） */
async function loadGeminiKey(): Promise<string> {
  const fromEnv = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
  if (fromEnv) return fromEnv;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return "";
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await sb.rpc("get_gemini_api_key");
    if (error) throw error;
    return typeof data === "string" ? data.trim() : "";
  } catch (error) {
    console.error("get_gemini_api_key failed:", error instanceof Error ? error.message : String(error));
    return "";
  }
}

/** 使うモデルの順番。混んでいる（503）・上限（429）・無くなった（404）ときは次を試す */
const GEMINI_MODELS = () => [Deno.env.get("GEMINI_MODEL"), "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.8-flash"]
  .filter((model, index, list): model is string => Boolean(model) && list.indexOf(model) === index);

/**
 * 文章を作る。Google AI（Gemini）の鍵があれば Gemini、無ければ ANTHROPIC_API_KEY の Claude を使う。
 */
async function generateText(systemPrompt: string, userPrompt: string): Promise<string> {
  const geminiKey = await loadGeminiKey();
  if (geminiKey) {
    let lastStatus = 0;
    for (const model of GEMINI_MODELS()) {
      {
        // 1つのモデルは20秒まで（混んでいると返事が来ないことがある）。だめなら次のモデル
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          signal: AbortSignal.timeout(20_000),
          method: "POST",
          headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { maxOutputTokens: 4096, temperature: 0.8 },
          }),
        }).catch((error) => {
          console.error("Gemini API timeout/network:", model, error instanceof Error ? error.message : String(error));
          return null;
        });
        if (!response) continue;
        lastStatus = response.status;
        if (response.ok) {
          const data = await response.json();
          const parts = data?.candidates?.[0]?.content?.parts;
          const text = Array.isArray(parts)
            ? parts.filter((part: { thought?: boolean }) => !part?.thought).map((part: { text?: string }) => part?.text ?? "").join("").trim()
            : "";
          if (!text) throw new AiHttpError(502, "Google AIから文章が返ってきませんでした（内容の制限にかかった可能性があります）");
          return text;
        }
        const body = await response.text();
        console.error("Gemini API error:", model, response.status, body.slice(0, 300));
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          throw new AiHttpError(response.status, "Google AIのAPIキーが正しくないか、使えない状態です。");
        }
        // 404（このモデルは使えない）・429・5xx は次のモデルへ
      }
    }
    if (lastStatus === 429) throw new AiHttpError(429, "Google AIの利用上限に達しました。しばらく待ってから再度お試しください。");
    throw new AiHttpError(503, "Google AIが混み合っています。少し待ってからもう一度「本文を作る」を押してください。");
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) throw new AiHttpError(503, "AIのAPIキーが設定されていません");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1024, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error("Anthropic API error:", response.status, body.slice(0, 500));
    if (response.status === 429) throw new AiHttpError(429, "レート制限に達しました。しばらく待ってから再度お試しください。");
    if (response.status === 402 || response.status === 400) throw new AiHttpError(response.status, "クレジットが不足しているか、リクエストが不正です。");
    throw new AiHttpError(502, "AIで文章を作れませんでした");
  }
  const data = await response.json();
  return data.content?.[0]?.text ?? "";
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      type, castName, castType, existingProfile, newsTitle, newsMemo, newsCategory, features, storeId,
      // coupon
      couponName, couponDiscount, couponExpiry, couponConditions,
      // schedule
      scheduleDate, scheduleNote,
      // newstaff
      staffName, staffProfile, staffMessage,
      // parse_memo（面接メモから各項目を抽出）
      memo,
      // x_post（X運用表「今日の投稿」）
      xAccount, xSlot, xTheme, xRules, xFacts,
    } = await req.json();
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
        const newsStoreId = typeof storeId === "string" ? storeId : "";
        if (!(await canManageStore(req, newsStoreId))) {
          return new Response(JSON.stringify({ error: "この店舗のニュースを作成する権限がありません（店長・オーナーだけ使えます）" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { facts, images } = await buildNewsGrounding(newsStoreId);
        autoImages = images;
        systemPrompt = "あなたは仙台のメンズエステ店の公式サイトのニュースを書く編集者です。スマートフォンで読みやすい、そのまま公開できるニュース本文を日本語で書いてください。料金・割引・出勤・人数などの具体的な情報は、タイトル・メモ・参照データにある事実だけを使い、創作しないでください。季節の挨拶や一般論は不要です。最後はWeb予約またはLINE予約を促す一文にしてください。本文だけを出力し、タイトル・前置き・Markdown・ハッシュタグ・URLは書かないでください。絵文字は使ってもよいが3つまで。過度な肌露出や誤解を招く表現は書かないでください。";
        const factsBlock = facts
          ? `\n\n===== 参照データ（この事実のみ使用可。創作禁止）=====\n${facts}\n===============================================\n`
          : "";
        const title = typeof newsTitle === "string" ? newsTitle.trim().slice(0, 100) : "";
        const memoText = typeof newsMemo === "string" ? newsMemo.trim().slice(0, 1500) : "";
        const categoryText = typeof newsCategory === "string" ? newsCategory.trim().slice(0, 30) : "";
        userPrompt = [
          title ? `タイトル: ${title}` : "タイトル: （なし。本日の空き状況やお得な情報を伝える）",
          categoryText ? `種類: ${categoryText}` : "",
          memoText ? `伝えたいこと（メモ。ここにある事実は使ってよい）:\n${memoText}` : "",
          "\n上記をもとに、結論から始まる150〜300文字のニュース本文を2〜3段落で書いてください。",
          factsBlock,
        ].filter(Boolean).join("\n");
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

      case "parse_memo":
        systemPrompt =
          "あなたはメンズエステの面接メモから、セラピスト登録フォームの各項目を抽出するアシスタントです。" +
          "与えられたメモから読み取れる項目だけをJSONで返してください。読み取れない項目はキー自体を含めないこと。" +
          "数値項目は数値型で返すこと。JSON以外のテキスト（説明・コードブロック記号など）は一切出力しないこと。\n" +
          "対象キー: name(名前), name_kana(フリガナ カタカナ), age(年齢/数値), height(身長cm/数値), weight(体重kg/数値), " +
          "bust_size(カップ 例:D), body_size(3サイズ B/W/H 例:84/58/84), blood_type(A/B/O/AB), hometown(出身地), " +
          "favorite_techniques(得意な施術), favorite_food(好きな食べ物), ideal_type(好きな男性のタイプ), " +
          "celebrity_lookalike(似ている芸能人), day_off_activities(休日の過ごし方), hobbies(趣味), " +
          "therapist_experience(セラピスト経験・経歴), x_account(XのIDまたはURL), instagram_url(Instagram URL), " +
          "shop_comment(お店からの紹介コメント。メモを元に魅力的に80〜120字で作成), " +
          "profile(自己紹介/プロフィール文。メモを元に自然に150〜250字で作成)。" +
          "shop_comment と profile はメモに直接無くても、読み取れた情報を元に作成してよい。";
        userPrompt = `以下の面接メモから項目を抽出し、JSONオブジェクトだけを返してください。\n\n===== メモ =====\n${memo ?? ""}\n================`;
        break;

      case "x_post": {
        // X運用表「今日の投稿」。ログイン中のスタッフだけが使える
        if (!(await isSignedIn(req))) {
          return new Response(JSON.stringify({ error: "ログインしてください" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const text = (value: unknown, max = 600) => (typeof value === "string" ? value.slice(0, max) : "");
        const account = (xAccount ?? {}) as Record<string, unknown>;
        const slot = (xSlot ?? {}) as Record<string, unknown>;
        const theme = (xTheme ?? {}) as Record<string, unknown>;
        const rules = Array.isArray(xRules) ? xRules.map((rule) => text(rule, 200)).filter(Boolean).slice(0, 12) : [];
        systemPrompt =
          "あなたは仙台のメンズエステ店のX（旧Twitter）運用担当です。指定されたアカウント・投稿枠・今日のテーマに合わせて、今日そのまま投稿できる1ポストを日本語で書いてください。" +
          "全角140文字以内（改行込み）。本文だけを出力し、前置き・説明・カギ括弧で囲むこと・Markdownはしない。" +
          "金額・人数・実績などの数字や固有名は、参照データにあるもの以外は創作しない。数字が必要なのに参照データに無いときは【◯◯】のように空欄で残す。" +
          "ハッシュタグは付けても2つまで。過度な肌露出や誤解を招く表現、個人が特定できる情報は書かない。";
        userPrompt = [
          `アカウント: ${text(account.name, 60)}`,
          `目的: ${text(account.purpose)}`,
          `ターゲット: ${text(account.target)}`,
          `トーン・口調: ${text(account.tone)}`,
          "",
          `投稿枠: ${text(slot.time, 20)} ${text(slot.type, 60)}`,
          `内容: ${text(slot.content)}`,
          `例文（形の参考。そのまま使わず今日の内容にする）: ${text(slot.example)}`,
          `目的: ${text(slot.goal, 100)}`,
          theme.theme ? `今日（${text(theme.day, 4)}曜）のテーマ: ${text(theme.theme, 100)}（${text(theme.detail)}）` : "",
          rules.length ? `\n運用ルール:\n${rules.map((rule) => `・${rule}`).join("\n")}` : "",
          `\n===== 参照データ（数字や名前はここにあるものだけ使う）=====\n${text(xFacts, 2000)}\n=====`,
        ].filter(Boolean).join("\n");
        break;
      }

      default:
        throw new Error("Invalid content type");
    }

    console.log("Generating content with type:", type);
    const generatedContent = (await generateText(systemPrompt, userPrompt)).trim();

    return new Response(
      JSON.stringify({ content: generatedContent, images: autoImages }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    if (error instanceof AiHttpError) {
      // 画面に理由を出せるよう 200 で返す（functions.invoke は 2xx 以外だと本文を読まない）
      console.error("AI error:", error.status, error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("Error in generate-cast-content:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
