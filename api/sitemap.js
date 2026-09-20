const ROUTES = [
  ["/", "daily", "1.0"],
  ["/schedule", "daily", "0.9"],
  ["/casts", "daily", "0.9"],
  ["/campaigns", "daily", "0.9"],
  ["/blog", "daily", "0.8"],
  ["/system", "monthly", "0.8"],
  ["/access", "monthly", "0.7"],
  ["/voice", "weekly", "0.7"],
  ["/recruit-talk", "daily", "0.7"],
];

const SUPABASE_URL = "https://imrxzkivwrkqbhqfbbes.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

const escapeXml = (value) => String(value).replace(/[<>&'"]/g, (character) => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
}[character]));

const dateOnly = (value) => {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
};

async function publishedBlogArticles() {
  if (!SUPABASE_ANON_KEY) return [];
  try {
    const query = new URLSearchParams({
      select: "slug,published_at,updated_at,created_at",
      store_id: `eq.${DEFAULT_STORE_ID}`,
      is_published: "eq.true",
      slug: "not.is.null",
      order: "published_at.desc.nullslast,created_at.desc",
      limit: "1000",
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/hp_articles?${query.toString()}`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows)
      ? rows.filter((row) => typeof row.slug === "string" && row.slug.trim())
      : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  const baseUrl = "https://enka-salon.jp";
  const lastModified = new Date().toISOString().slice(0, 10);
  const articles = await publishedBlogArticles();
  const routeUrls = ROUTES.map(([path, changefreq, priority]) => `  <url>
    <loc>${escapeXml(`${baseUrl}${path}`)}</loc>
    <lastmod>${lastModified}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`);
  const articleUrls = articles.map((article) => `  <url>
    <loc>${escapeXml(`${baseUrl}/blog/${encodeURIComponent(article.slug)}`)}</loc>
    <lastmod>${dateOnly(article.updated_at || article.published_at || article.created_at)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...routeUrls, ...articleUrls].join("\n")}
</urlset>`);
}
