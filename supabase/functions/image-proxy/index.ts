// 画像プロキシ: CORS を付与して画像を返す（エステ魂転記スクリプトが file input へ割当てるため）
// SSRF 対策として許可ホストのみ取得可能
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.endsWith("caskan.com") ||
    h === "drive.google.com" ||
    h.endsWith(".googleusercontent.com") ||
    h.endsWith(".supabase.co")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const reqUrl = new URL(req.url);
    const target = reqUrl.searchParams.get("url");
    if (!target) {
      return new Response("missing url", { status: 400, headers: corsHeaders });
    }
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return new Response("invalid url", { status: 400, headers: corsHeaders });
    }
    if (parsed.protocol !== "https:" || !isAllowedHost(parsed.hostname)) {
      return new Response("host not allowed", { status: 403, headers: corsHeaders });
    }

    const upstream = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    if (!upstream.ok) {
      return new Response(`upstream ${upstream.status}`, { status: 502, headers: corsHeaders });
    }
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buf = await upstream.arrayBuffer();

    return new Response(buf, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : String(e)}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
