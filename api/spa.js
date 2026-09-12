/**
 * 艶華（enka-salon.jp）向けに、公開URLごとの検索・共有用メタデータを
 * サーバー応答のHTMLへ埋め込む。クライアント側の更新を待たずに、検索
 * クローラーやSNSプレビューがURLの主題を判別できるようにする。
 */
const ENKA = {
  author: "艶華",
  image:
    "https://imrxzkivwrkqbhqfbbes.supabase.co/storage/v1/object/public/cast-photos/image-stock/1784811500002_enka-hero-open.jpg",
};

const PAGE_META = {
  "/": {
    title: "仙台・北四番丁のメンズエステ 艶華｜本日の出勤・Web予約",
    description:
      "仙台・北四番丁エリアの完全個室メンズエステ【艶華】公式サイト。本日の出勤・空き状況、セラピスト、料金、キャンペーン、Web予約をご案内します。",
  },
  "/schedule": {
    title: "仙台メンズエステの出勤情報｜本日・今週の空き枠｜艶華",
    description:
      "艶華の本日・今週のセラピスト出勤情報と空き状況をご確認いただけます。ご希望のセラピスト、日時を選んでWeb予約へお進みください。",
  },
  "/casts": {
    title: "仙台のメンズエステ セラピスト一覧｜艶華",
    description:
      "仙台・北四番丁エリアのメンズエステ艶華に在籍するセラピストをご紹介します。プロフィール、出勤・空き状況、写メ日記をご覧いただけます。",
  },
  "/campaigns": {
    title: "キャンペーン・クーポン｜仙台メンズエステ 艶華",
    description:
      "艶華でご利用いただけるクーポン、期間限定キャンペーン、お得なご案内をまとめています。ご予約時の適用条件もご確認いただけます。",
  },
  "/system": {
    title: "仙台メンズエステの料金・利用方法｜艶華",
    description:
      "艶華のコース料金、オプション、指名料、お支払い方法、ご利用の流れをご案内します。ご予約前に料金システムをご確認ください。",
  },
  "/voice": {
    title: "艶華の口コミ・お客様の声｜仙台メンズエステ",
    description:
      "仙台・北四番丁エリアのメンズエステ艶華をご利用いただいたお客様の口コミ・ご感想をご紹介します。担当セラピストの情報もご覧いただけます。",
  },
  "/access": {
    title: "アクセス・店舗情報｜仙台メンズエステ 艶華",
    description:
      "仙台市青葉区・北四番丁エリアの完全個室メンズエステ艶華の営業時間、最寄り駅、アクセス、ご予約方法をご案内します。",
  },
  "/recruit-talk": {
    title: "セラピスト求人｜仙台・宮城のメンズエステ 艶華",
    description:
      "仙台・宮城でメンズエステのセラピスト求人をお探しの方へ。艶華の仕事内容、研修、勤務条件、応募前の相談方法をご案内します。",
  },
};

const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

function getMeta(pathname) {
  if (PAGE_META[pathname]) return { ...PAGE_META[pathname], robots: "index,follow,max-image-preview:large" };

  if (/^\/casts\/[^/]+\/diary\/?$/.test(pathname)) {
    return {
      title: "セラピスト写メ日記｜仙台メンズエステ 艶華",
      description: "艶華に在籍するセラピストの最新写メ日記をご覧いただけます。出勤・空き状況の確認とWeb予約も可能です。",
      robots: "index,follow,max-image-preview:large",
    };
  }

  if (/^\/casts\/[^/]+\/?$/.test(pathname)) {
    return {
      title: "セラピストの出勤・プロフィール｜仙台メンズエステ 艶華",
      description: "艶華に在籍するセラピストのプロフィール、最新の出勤・空き状況、写メ日記、口コミをご覧いただけます。",
      robots: "index,follow,max-image-preview:large",
    };
  }

  if (pathname === "/booking") {
    return {
      title: "Web予約｜艶華",
      description: "艶華のWeb予約フォームです。ご希望のセラピスト、日時、コースを選択して予約リクエストをお送りください。",
      robots: "noindex,follow",
    };
  }

  return {
    title: "ページが見つかりません｜艶華",
    description: "お探しのページは見つかりませんでした。艶華の出勤情報、セラピスト一覧、Web予約をご利用ください。",
    robots: "noindex,follow",
  };
}

export default async function handler(req, res) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "enka-salon.jp");
  const pathname = new URL(req.url || "/", `https://${host}`).pathname.replace(/\/$/, "") || "/";
  const meta = getMeta(pathname);
  const canonical = `https://enka-salon.jp${pathname === "/" ? "/" : pathname}`;

  try {
    // /index.html は実ファイルなのでリライトを通らず静的配信される（ループしない）
    const origin = `https://${host}`;
    const resp = await fetch(`${origin}/index.html`);
    let html = await resp.text();

    html = html
      .replace(/<html lang="[^"]*"/, '<html lang="ja"')
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(meta.description)}$2`)
      .replace(/(<meta name="author" content=")[^"]*(")/, `$1${esc(ENKA.author)}$2`)
      .replace(/(<meta name="robots" content=")[^"]*(")/, `$1${meta.robots}$2`)
      .replace(/(<meta name="googlebot" content=")[^"]*(")/, `$1${meta.robots}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(meta.title)}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(meta.title)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(meta.description)}$2`)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(meta.description)}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonical}$2`)
      .replace(/(<meta property="og:site_name" content=")[^"]*(")/, `$1${esc(ENKA.author)}$2`)
      .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${canonical}$2`)
      .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${ENKA.image}$2`)
      .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${ENKA.image}$2`)
      .replace(/<meta name="twitter:site" content="[^"]*"\s*\/?>/, "")
      .replace(/(<link rel="icon"[^>]*href=")[^"]*(")/, "$1/favicon-tsuyaka.png$2");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.setHeader("X-Robots-Tag", meta.robots);
    res.status(200).send(html);
  } catch (error) {
    // 取得に失敗しても白画面にはせず、少なくともインデックス抑止を明示する。
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex,follow");
    res.redirect(307, "/index.html");
  }
}
