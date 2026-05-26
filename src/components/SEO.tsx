import { Helmet } from "react-helmet-async";

const SITE_NAME = "全力エステ 仙台店";
const SITE_URL = "https://zenryokuesthe.com";
const DEFAULT_IMAGE = "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/8d654fba-5a44-4854-9681-3d821d727af1/id-preview-bb3a516a--6f2a54e4-de5f-4767-bbd0-b5321c0d753b.lovable.app-1776959908334.png";

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "profile";
  noindex?: boolean;
  jsonLd?: object;
}

export const SEO = ({
  title,
  description = "仙台のメンズエステサロン。経験豊富なセラピストによる本格リラクゼーション。出張・インルーム対応。",
  path = "",
  image = DEFAULT_IMAGE,
  type = "website",
  noindex = false,
  jsonLd,
}: SEOProps) => {
  const fullTitle = title ? `${title}｜${SITE_NAME}` : SITE_NAME;
  const url = `${SITE_URL}${path}`;

  return (
    <Helmet>
      <html lang="ja" />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}

      {/* OGP */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="ja_JP" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* JSON-LD */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};

export const LOCAL_BUSINESS_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "HealthAndBeautyBusiness",
  "name": "全力エステ 仙台店",
  "description": "仙台のメンズエステサロン。経験豊富なセラピストによる本格リラクゼーション。出張・インルーム対応。",
  "url": "https://zenryokuesthe.com",
  "telephone": "090-8126-4042",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "仙台市",
    "addressRegion": "宮城県",
    "addressCountry": "JP"
  },
  "openingHoursSpecification": {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": [
      "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"
    ],
    "opens": "11:00",
    "closes": "23:00"
  },
  "priceRange": "¥¥",
  "sameAs": [
    "https://zenryokuesthe.com"
  ]
};
