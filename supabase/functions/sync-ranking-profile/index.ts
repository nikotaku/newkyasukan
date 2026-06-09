import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://www.esthe-ranking.jp";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cast_id } = await req.json();
    if (!cast_id) throw new Error("cast_id is required");

    const loginId = Deno.env.get("RANKING_LOGIN_ID");
    const password = Deno.env.get("RANKING_PASSWORD");
    if (!loginId || !password) throw new Error("RANKING_LOGIN_ID / RANKING_PASSWORD が未設定です");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cast, error } = await supabase
      .from("casts")
      .select("id,name,ranking_cast_id,age,height,bust,cup_size,waist,hip,blood_type,therapist_years,profile,message,favorite_techniques,favorite_food,celebrity_lookalike,ideal_type,hobbies,day_off_activities")
      .eq("id", cast_id)
      .single();

    if (error || !cast) throw new Error("キャストが見つかりません");
    if (!cast.ranking_cast_id) throw new Error("ランキングサイトのキャストIDが未設定です");

    const jar: Record<string, string> = {};
    const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    const setCookies = (res: Response) => {
      const raw = res.headers.get("set-cookie") ?? "";
      for (const part of raw.split(/,(?=[^ ])/)) {
        const [kv] = part.trim().split(";");
        const [k, v] = kv.split("=");
        if (k && v !== undefined) jar[k.trim()] = v.trim();
      }
    };

    // Login
    const loginPage = await fetch(`${BASE}/shop/login`, { redirect: "follow" });
    setCookies(loginPage);
    const loginHtml = await loginPage.text();
    const tokenMatch = loginHtml.match(/name="_token"\s+value="([^"]+)"/);
    const csrfToken = tokenMatch?.[1] ?? "";

    const loginRes = await fetch(`${BASE}/shop/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
      body: new URLSearchParams({ _token: csrfToken, login_id: loginId, password }).toString(),
      redirect: "manual",
    });
    setCookies(loginRes);
    if (loginRes.status >= 400) throw new Error("ランキングサイトへのログインに失敗しました");

    // Fetch cast edit page
    const editPage = await fetch(`${BASE}/shop/cast/${cast.ranking_cast_id}/edit`, {
      headers: { Cookie: cookieHeader() },
      redirect: "follow",
    });
    setCookies(editPage);
    if (editPage.status >= 400) throw new Error(`キャスト編集ページが見つかりません (ID: ${cast.ranking_cast_id})`);

    const editHtml = await editPage.text();
    const eTokenMatch = editHtml.match(/name="_token"\s+value="([^"]+)"/);
    const eToken = eTokenMatch?.[1] ?? "";

    // Build profile body
    const profileText = [
      cast.profile ?? "",
      cast.message ? `【コメント】${cast.message}` : "",
    ].filter(Boolean).join("\n\n");

    const body = new URLSearchParams({
      _method: "PUT",
      _token: eToken,
      ...(cast.age ? { age: String(cast.age) } : {}),
      ...(cast.height ? { height: String(cast.height) } : {}),
      ...(cast.bust ? { bust: String(cast.bust) } : {}),
      ...(cast.cup_size ? { cup: cast.cup_size } : {}),
      ...(cast.waist ? { waist: String(cast.waist) } : {}),
      ...(cast.hip ? { hip: String(cast.hip) } : {}),
      ...(cast.blood_type ? { blood_type: cast.blood_type } : {}),
      ...(cast.therapist_years ? { career: String(cast.therapist_years) } : {}),
      ...(profileText ? { profile: profileText } : {}),
      ...(cast.favorite_techniques ? { skill: cast.favorite_techniques } : {}),
      ...(cast.hobbies ? { hobby: cast.hobbies } : {}),
    });

    const updateRes = await fetch(`${BASE}/shop/cast/${cast.ranking_cast_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
      body: body.toString(),
      redirect: "manual",
    });
    setCookies(updateRes);

    if (updateRes.status >= 400) throw new Error("プロフィールの更新に失敗しました: " + updateRes.status);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
