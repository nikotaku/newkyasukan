import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { post_id } = await req.json();
    if (!post_id) throw new Error("post_id is required");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch post
    const { data: post, error: postError } = await supabase
      .from("cast_posts")
      .select("*, casts(id, name)")
      .eq("id", post_id)
      .single();

    if (postError || !post) throw new Error("Post not found");

    // Fetch credentials
    const { data: creds } = await supabase
      .from("cast_site_credentials")
      .select("site, login_id, password")
      .eq("cast_id", post.cast_id);

    const credMap: Record<string, { login_id: string; password: string }> = {};
    (creds || []).forEach((c: any) => { credMap[c.site] = c; });

    const results: Record<string, { status: string; error?: string }> = {};

    // Post to O2
    if (credMap.o2) {
      try {
        const r = await postToO2(credMap.o2.login_id, credMap.o2.password, post);
        results.o2 = r;
      } catch (e: any) {
        results.o2 = { status: "failed", error: e.message };
      }
    } else {
      results.o2 = { status: "skipped" };
    }

    // Post to Esutama
    if (credMap.esutama) {
      try {
        const r = await postToEsutama(credMap.esutama.login_id, credMap.esutama.password, post);
        results.esutama = r;
      } catch (e: any) {
        results.esutama = { status: "failed", error: e.message };
      }
    } else {
      results.esutama = { status: "skipped" };
    }

    const allPosted = Object.values(results).every(r => r.status === "posted" || r.status === "skipped");
    const anyFailed = Object.values(results).some(r => r.status === "failed");

    await supabase.from("cast_posts").update({
      o2_status: results.o2?.status ?? "skipped",
      o2_error: results.o2?.error ?? null,
      esutama_status: results.esutama?.status ?? "skipped",
      esutama_error: results.esutama?.error ?? null,
      status: allPosted ? "posted" : anyFailed ? "failed" : "pending",
      posted_at: allPosted ? new Date().toISOString() : null,
    }).eq("id", post_id);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function postToO2(loginId: string, password: string, post: any) {
  // O2 Health diary posting via HTTP form submission
  const BASE = "https://o2-health.net";
  const jar: Record<string, string> = {};

  const cookieHeader = () =>
    Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

  const setCookies = (res: Response) => {
    const raw = res.headers.get("set-cookie") ?? "";
    for (const part of raw.split(/,(?=[^ ])/)) {
      const [kv] = part.trim().split(";");
      const [k, v] = kv.split("=");
      if (k && v !== undefined) jar[k.trim()] = v.trim();
    }
  };

  // Login page
  const loginPage = await fetch(`${BASE}/cast/login`, { redirect: "follow" });
  setCookies(loginPage);
  const loginHtml = await loginPage.text();
  const tokenMatch = loginHtml.match(/name="_token"\s+value="([^"]+)"/);
  const csrfToken = tokenMatch?.[1] ?? "";

  const loginRes = await fetch(`${BASE}/cast/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body: new URLSearchParams({ _token: csrfToken, login_id: loginId, password }).toString(),
    redirect: "manual",
  });
  setCookies(loginRes);

  if (loginRes.status >= 400) throw new Error("O2ログイン失敗");

  // Diary post form
  const diaryPage = await fetch(`${BASE}/cast/diary/create`, {
    headers: { Cookie: cookieHeader() },
    redirect: "follow",
  });
  setCookies(diaryPage);
  const diaryHtml = await diaryPage.text();
  const dTokenMatch = diaryHtml.match(/name="_token"\s+value="([^"]+)"/);
  const dToken = dTokenMatch?.[1] ?? "";

  const body = new URLSearchParams({
    _token: dToken,
    title: post.title ?? "",
    body: post.body,
  });
  if (post.image_urls?.length) {
    body.append("image_url", post.image_urls[0]);
  }

  const postRes = await fetch(`${BASE}/cast/diary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body: body.toString(),
    redirect: "manual",
  });
  setCookies(postRes);

  if (postRes.status >= 400) throw new Error("O2投稿失敗: " + postRes.status);
  return { status: "posted" };
}

async function postToEsutama(loginId: string, password: string, post: any) {
  // エスたまの魂 diary posting via HTTP form submission
  const BASE = "https://s-tama.jp";
  const jar: Record<string, string> = {};

  const cookieHeader = () =>
    Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

  const setCookies = (res: Response) => {
    const raw = res.headers.get("set-cookie") ?? "";
    for (const part of raw.split(/,(?=[^ ])/)) {
      const [kv] = part.trim().split(";");
      const [k, v] = kv.split("=");
      if (k && v !== undefined) jar[k.trim()] = v.trim();
    }
  };

  const loginPage = await fetch(`${BASE}/cast/login`, { redirect: "follow" });
  setCookies(loginPage);
  const loginHtml = await loginPage.text();
  const tokenMatch = loginHtml.match(/name="_token"\s+value="([^"]+)"/);
  const csrfToken = tokenMatch?.[1] ?? "";

  const loginRes = await fetch(`${BASE}/cast/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body: new URLSearchParams({ _token: csrfToken, login_id: loginId, password }).toString(),
    redirect: "manual",
  });
  setCookies(loginRes);

  if (loginRes.status >= 400) throw new Error("エスたまログイン失敗");

  const diaryPage = await fetch(`${BASE}/cast/diary/create`, {
    headers: { Cookie: cookieHeader() },
    redirect: "follow",
  });
  setCookies(diaryPage);
  const diaryHtml = await diaryPage.text();
  const dTokenMatch = diaryHtml.match(/name="_token"\s+value="([^"]+)"/);
  const dToken = dTokenMatch?.[1] ?? "";

  const body = new URLSearchParams({
    _token: dToken,
    title: post.title ?? "",
    body: post.body,
  });
  if (post.image_urls?.length) {
    body.append("image_url", post.image_urls[0]);
  }

  const postRes = await fetch(`${BASE}/cast/diary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body: body.toString(),
    redirect: "manual",
  });
  setCookies(postRes);

  if (postRes.status >= 400) throw new Error("エスたま投稿失敗: " + postRes.status);
  return { status: "posted" };
}
