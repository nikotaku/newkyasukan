import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://estama.jp";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

// エステ魂の特徴ラベル→ID マップ
const FEATURE_MAP: Record<string, string> = {
  "新人": "1", "経験豊富": "2", "業界未経験": "3", "施術上手": "28", "上品": "25",
  "甘えん坊": "4", "おとなしい": "5", "おっとり": "7", "明るい": "8", "優しい": "32",
  "努力家": "30", "礼儀正しい": "27", "清楚系": "9", "天然系": "10", "セクシー系": "11",
  "お姉様系": "12", "お嬢様系": "29", "ギャル系": "19", "美人系": "20", "熟女系": "21",
  "かわいい系": "22", "アイドル系": "24", "癒し系": "23", "妹系": "26",
  "モデル体型": "16", "小柄": "31", "色白肌": "18",
};

function cookieJar() {
  const c: Record<string, string> = {};
  return {
    header: () => Object.entries(c).map(([k, v]) => `${k}=${v}`).join("; "),
    set: (res: Response) => {
      const raw = res.headers.get("set-cookie") ?? "";
      for (const part of raw.split(/,(?=[^ ])/)) {
        const [kv] = part.trim().split(";");
        const idx = kv.indexOf("=");
        if (idx > 0) c[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
      }
    },
  };
}

function extractCsrf(html: string): string {
  return (html.match(/CSRF_TOKEN_VALUE['"]\s*,\s*['"]([a-f0-9]+)['"]/i) || [])[1] || "";
}

// jQuery serializeArray 形式でポスト用パラメータを構築
function buildStrParams(fields: { name: string; value: string }[], ctk: string): URLSearchParams {
  const p = new URLSearchParams();
  fields.forEach((f, i) => {
    p.set(`str[${i}][name]`, f.name);
    p.set(`str[${i}][value]`, f.value);
  });
  p.set("ctk", ctk);
  return p;
}

function str(v: string | number | null | undefined, max: number): string {
  return String(v ?? "").slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { cast_id } = await req.json();
    if (!cast_id) throw new Error("cast_id is required");

    // キャストデータ取得
    const { data: cast, error: castErr } = await supabase
      .from("casts")
      .select("*")
      .eq("id", cast_id)
      .single();
    if (castErr || !cast) throw new Error("Cast not found");

    // 認証情報をDBから取得
    const { data: configs } = await supabase
      .from("shop_config")
      .select("key, value")
      .in("key", ["estama_shop_email", "estama_shop_password"]);
    const cfgMap: Record<string, string> = {};
    (configs || []).forEach((c: any) => { cfgMap[c.key] = c.value; });
    const shopEmail = cfgMap["estama_shop_email"] || "";
    const shopPassword = cfgMap["estama_shop_password"] || "";
    if (!shopEmail || !shopPassword) throw new Error("Estamaの認証情報が設定されていません");

    const cj = cookieJar();

    // 1. ログインページ取得 → CSRF トークン抽出
    const lpRes = await fetch(`${BASE}/admin/`, {
      headers: { "User-Agent": UA },
      redirect: "follow",
    });
    cj.set(lpRes);
    const lpHtml = await lpRes.text();
    const ctk1 = extractCsrf(lpHtml);
    if (!ctk1) throw new Error("CSRFトークンの取得に失敗しました");

    // 2. ログイン POST
    const loginFields = [
      { name: "mail", value: shopEmail },
      { name: "password", value: shopPassword },
      { name: "r", value: "/admin/" },
    ];
    const loginParams = buildStrParams(loginFields, ctk1);

    const loginRes = await fetch(`${BASE}/post/login_shop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Cookie": cj.header(),
        "Referer": `${BASE}/admin/`,
        "User-Agent": UA,
        "Accept": "application/json, text/javascript, */*; q=0.01",
      },
      body: loginParams.toString(),
      redirect: "manual",
    });
    cj.set(loginRes);
    const loginText = await loginRes.text();
    let loginData: any = null;
    try { loginData = JSON.parse(loginText); } catch { /* ignore */ }
    if (loginData && loginData[0] === "OUT") {
      throw new Error("Estamaログイン失敗: 認証情報を確認してください");
    }

    // 3. cast_edit ページ取得 → 新しい CTK と post_base を取得
    const ceRes = await fetch(`${BASE}/admin/cast_edit/`, {
      headers: { "User-Agent": UA, "Cookie": cj.header(), "Referer": `${BASE}/admin/` },
      redirect: "follow",
    });
    cj.set(ceRes);
    const ceHtml = await ceRes.text();
    if (ceRes.url.includes("/admin/") === false || ceHtml.includes("ログイン")) {
      throw new Error("Estamaへのログインが確認できませんでした");
    }
    const ctk2 = extractCsrf(ceHtml);
    const postBase = (ceHtml.match(/id=["']post_base["'][^>]*value=["']([^"']+)["']/i) || [])[1] || "post";

    // 4. フィールドマッピング
    // バストサイズ解析: "85B" / "B85" → cm + cup
    let bustCm = "";
    let bustCup = "";
    if (cast.bust_size) {
      const bs = String(cast.bust_size).trim();
      const m1 = bs.match(/^(\d+)([A-La-l])$/);
      const m2 = bs.match(/^([A-La-l])(\d+)$/);
      if (m1) { bustCm = m1[1]; bustCup = m1[2].toUpperCase(); }
      else if (m2) { bustCup = m2[1].toUpperCase(); bustCm = m2[2]; }
      else bustCm = bs.replace(/[^0-9]/g, "").slice(0, 3);
    }
    // ボディサイズ解析: "58-85" → W, H
    let waist = "";
    let hip = "";
    if (cast.body_size) {
      const parts = String(cast.body_size).split(/[-\/]/);
      if (parts.length >= 2) { waist = parts[0].trim(); hip = parts[1].trim(); }
    }
    // 特徴 → type[] IDs (最大4つ)
    const typeIds: string[] = [];
    if (Array.isArray(cast.features)) {
      for (const f of cast.features) {
        const id = FEATURE_MAP[f];
        if (id && typeIds.length < 4) typeIds.push(id);
      }
    }
    // エステ歴: 数字のみ最大2文字
    const exp = String(cast.therapist_years ?? "").replace(/[^0-9]/g, "").slice(0, 2);

    // 5. str[] フィールド構築
    const fields: { name: string; value: string }[] = [
      { name: "cast_id", value: "0" },
      { name: "name", value: str(cast.name, 10) },
      { name: "description", value: str(cast.shop_comment, 500) },
      { name: "cast_pr", value: str(cast.therapist_comment, 500) },
      { name: "experience", value: exp },
      { name: "age", value: str(cast.age, 2) },
      { name: "tall", value: str(cast.height, 3) },
      { name: "size_b", value: bustCm.slice(0, 3) },
      { name: "size_cup", value: bustCup },
      { name: "size_w", value: waist.slice(0, 3) },
      { name: "size_h", value: hip.slice(0, 3) },
      { name: "blood", value: str(cast.blood_type, 2) },
      { name: "body_style", value: "0" },
      { name: "forte_procedure", value: str(cast.favorite_techniques, 20) },
      { name: "food", value: str(cast.favorite_food, 20) },
      { name: "man_like_type", value: str(cast.ideal_type, 20) },
      { name: "like_talent", value: str(cast.celebrity_lookalike ?? cast.celebrity_like, 20) },
      { name: "holiday", value: str(cast.day_off_activities, 20) },
      { name: "vogue", value: str(cast.hobby, 20) },
      { name: "blog", value: str(cast.blog_url, 255) },
      { name: "twitter", value: str(cast.x_account, 255) },
      { name: "instagram", value: str(cast.instagram_url, 255) },
    ];
    // type[] チェックボックス (name="type[]" を複数追加)
    for (const tid of typeIds) {
      fields.push({ name: "type[]", value: tid });
    }
    // 特徴が0のときはデフォルト値が必要（エステ魂は必須）
    if (typeIds.length === 0) fields.push({ name: "type[]", value: "1" });

    const saveParams = buildStrParams(fields, ctk2);
    const postUrl = `${BASE}/${postBase}/cast_edit`;

    const saveRes = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Cookie": cj.header(),
        "Referer": `${BASE}/admin/cast_edit/`,
        "User-Agent": UA,
        "Accept": "application/json, text/javascript, */*; q=0.01",
      },
      body: saveParams.toString(),
      redirect: "manual",
    });
    cj.set(saveRes);
    const saveText = await saveRes.text();
    let saveData: any = null;
    try { saveData = JSON.parse(saveText); } catch { /* ignore */ }

    const success = Array.isArray(saveData) &&
      (saveData[0] === "REDIRECT_OK" || saveData[0] === "OK" || saveData[0] === "COMPLETE");

    if (!success) {
      // エラー詳細をログに出して呼び出し元へ返す
      console.error("estama save failed:", JSON.stringify(saveData), "url:", postUrl);
      return new Response(JSON.stringify({
        success: false,
        error: "エステ魂への登録に失敗しました",
        detail: Array.isArray(saveData) ? saveData : String(saveText).slice(0, 300),
        post_url: postUrl,
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const redirectUrl = saveData[1]
      ? (saveData[1].startsWith("http") ? saveData[1] : `${BASE}${saveData[1]}`)
      : `${BASE}/admin/cast/`;

    return new Response(JSON.stringify({
      success: true,
      url: redirectUrl,
      cast_name: str(cast.name, 10),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("estama-cast-create error:", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
