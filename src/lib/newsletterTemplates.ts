export const SOCIAL_NETWORKS = [
  { key: "x", label: "X（旧Twitter）" },
  { key: "line", label: "LINE" },
  { key: "o2", label: "O2（ゼロツー）" },
  { key: "instagram", label: "Instagram" },
  { key: "bluesky", label: "Bluesky" },
] as const;

export type SocialNetworkKey = (typeof SOCIAL_NETWORKS)[number]["key"];

export interface NewsletterLinkSettings {
  homepageUrl: string;
  couponUrl: string;
  socialUrls: Record<SocialNetworkKey, string>;
}

export interface NewsletterDraft {
  title: string;
  subject: string;
  bodyText: string;
}

export interface NewsletterTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  primaryCta: string;
  designNote: string;
  buildDraft: (links: NewsletterLinkSettings, storeName?: string) => NewsletterDraft;
}

export const EMPTY_NEWSLETTER_LINK_SETTINGS: NewsletterLinkSettings = {
  homepageUrl: "",
  couponUrl: "",
  socialUrls: {
    x: "",
    line: "",
    o2: "",
    instagram: "",
    bluesky: "",
  },
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function configuredUrl(value: string, label: string) {
  return isHttpUrl(value) ? value.trim() : `［${label} URLを設定してください］`;
}

function socialLinkList(socialUrls: NewsletterLinkSettings["socialUrls"]) {
  const links = SOCIAL_NETWORKS
    .map(({ key, label }) => ({ label, url: socialUrls[key] }))
    .filter((link) => isHttpUrl(link.url));

  if (links.length === 0) return "［SNS URLを設定してください］";
  return links.map((link) => `${link.label}：${link.url.trim()}`).join("\n");
}

function commonLinks(links: NewsletterLinkSettings) {
  return `────────────
公式サイト
${configuredUrl(links.homepageUrl, "HP")}

公式SNS
${socialLinkList(links.socialUrls)}

クーポン受取
${configuredUrl(links.couponUrl, "クーポン受取")}`;
}

function footer(links: NewsletterLinkSettings) {
  return `${commonLinks(links)}

────────────
※配信停止をご希望の場合は、メール末尾の「配信を停止する」からお手続きください。`;
}

function withStoreName(storeName?: string) {
  return storeName?.trim() || "［店舗名］";
}

export const NEWSLETTER_TEMPLATES: NewsletterTemplate[] = [
  {
    id: "welcome",
    name: "新規登録・初回案内",
    category: "信頼づくり",
    description: "登録直後に感謝、受け取れる情報、最初の一歩を伝える型です。",
    primaryCta: "公式サイトで利用方法を見る",
    designNote: "売り込みを急がず、期待値と最初の行動を1つに絞ります。",
    buildDraft: (links, storeName) => {
      const shop = withStoreName(storeName);
      return {
        title: "新規登録・初回案内",
        subject: `【${shop}】ご登録ありがとうございます｜はじめてのご案内`,
        bodyText: `［お名前］様

このたびは${shop}にご登録いただき、ありがとうございます。

これから、予約やご利用に役立つお知らせをお届けします。

■ ご登録いただくと
・最新のお知らせを受け取れます
・ご都合に合わせて予約・ご利用方法を確認できます
・クーポンや会員向けのご案内を受け取れます

まずは、店舗・サービスのご案内をご確認ください。

▼ 利用方法・最新情報を見る
${configuredUrl(links.homepageUrl, "HP")}

ご不明な点があれば、公式SNSからもお気軽にご確認いただけます。

${footer(links)}`,
      };
    },
  },
  {
    id: "campaign",
    name: "期間限定キャンペーン",
    category: "期限付き訴求",
    description: "実在する期限と条件を明示し、クーポン受取へ迷わず進める型です。",
    primaryCta: "クーポンを受け取る",
    designNote: "便益・期限・利用条件を冒頭で明確にし、虚偽の限定表現は使いません。",
    buildDraft: (links, storeName) => {
      const shop = withStoreName(storeName);
      return {
        title: "期間限定キャンペーン",
        subject: `【${shop}】［○月○日まで］［キャンペーン名］のお知らせ`,
        bodyText: `［お名前］様

${shop}から、期間限定キャンペーンのお知らせです。

【［キャンペーン名］】
期間：［○月○日（○）○:○○まで］
特典：［割引・プレゼント等の具体的な内容］
対象：［対象メニュー・対象者］

ご利用方法
1. 下記からクーポンを受け取る
2. ［予約・来店・購入の方法］
3. ［提示方法・コード・注意事項］

▼ クーポンを受け取る
${configuredUrl(links.couponUrl, "クーポン受取")}

※［併用可否・最低利用額・対象外・予約要否などの条件］

${footer(links)}`,
      };
    },
  },
  {
    id: "content",
    name: "役立つ情報・季節の提案",
    category: "関係継続",
    description: "読者の悩みに答える情報を先に届け、自然に次の行動へつなげる型です。",
    primaryCta: "詳細・予約情報を見る",
    designNote: "1通1テーマ、要点3つ、主CTAは1つという読みやすい構成です。",
    buildDraft: (links, storeName) => {
      const shop = withStoreName(storeName);
      return {
        title: "役立つ情報・季節の提案",
        subject: `【${shop}】［季節・悩み］で確認したい3つのこと`,
        bodyText: `［お名前］様

${shop}です。
今回は［季節・悩み・目的］に役立つポイントを3つご紹介します。

■ 1. ［最初のポイント］
［すぐに試せる短い説明］

■ 2. ［次のポイント］
［判断の目安や注意点］

■ 3. ［最後のポイント］
［サービス・メニューと自然につながる具体策］

ご自身に合う方法を確認したい方は、最新のご案内をご覧ください。

▼ 詳細・予約情報を見る
${configuredUrl(links.homepageUrl, "HP")}

${footer(links)}`,
      };
    },
  },
  {
    id: "member-benefit",
    name: "会員限定・誕生日特典",
    category: "ロイヤルティ",
    description: "感謝を主役に、対象・期限・使い方が一目で分かる会員向けの型です。",
    primaryCta: "特典を受け取る",
    designNote: "年齢や推測情報には触れず、提供できる特典と条件を正確に伝えます。",
    buildDraft: (links, storeName) => {
      const shop = withStoreName(storeName);
      return {
        title: "会員限定・誕生日特典",
        subject: `【${shop}】会員さまへ｜［特典名］をご用意しました`,
        bodyText: `［お名前］様

いつも${shop}をご利用いただき、ありがとうございます。
日頃の感謝を込めて、会員さまへ特典をご用意しました。

【会員限定特典】
特典内容：［割引・プレゼント・優待内容］
利用期限：［○月○日まで］
対象：［対象メニュー・対象者］

ご利用方法
・［予約または来店時の利用方法］
・［提示する画面・コードなど］
・［併用可否・予約要否など］

▼ 特典を受け取る
${configuredUrl(links.couponUrl, "クーポン受取")}

${footer(links)}`,
      };
    },
  },
  {
    id: "winback",
    name: "お久しぶり・再来店案内",
    category: "再来店促進",
    description: "責めずに近況を伝え、再訪する理由と選びやすい行動を示す型です。",
    primaryCta: "空き状況・最新情報を見る",
    designNote: "来店周期に合わせて送り、反応者への重複配信を避ける前提です。",
    buildDraft: (links, storeName) => {
      const shop = withStoreName(storeName);
      return {
        title: "お久しぶり・再来店案内",
        subject: `【${shop}】［新メニュー・季節のご案内］をお届けします`,
        bodyText: `［お名前］様

${shop}です。
お忙しい毎日かと思いますが、その後いかがお過ごしでしょうか。

今回は、［新メニュー・季節のおすすめ・改善点］をご案内します。

■ 今回のご案内
・［再来店につながる具体的な価値 1］
・［再来店につながる具体的な価値 2］
・［必要に応じて、実在する特典・期限・条件］

ご都合のよいタイミングで、最新の情報や空き状況をご確認ください。

▼ 空き状況・最新情報を見る
${configuredUrl(links.homepageUrl, "HP")}

${footer(links)}`,
      };
    },
  },
];

export function getMissingNewsletterLinkWarnings(links: NewsletterLinkSettings) {
  const warnings: string[] = [];
  if (!isHttpUrl(links.homepageUrl)) warnings.push("HPリンク");
  if (!isHttpUrl(links.couponUrl)) warnings.push("クーポン受取リンク");
  if (!SOCIAL_NETWORKS.some(({ key }) => isHttpUrl(links.socialUrls[key]))) warnings.push("SNSリンク");
  return warnings;
}

export function getUnresolvedNewsletterLinkWarnings(bodyText: string) {
  const warnings: string[] = [];
  if (bodyText.includes("［HP URLを設定してください］")) warnings.push("HPリンク");
  if (bodyText.includes("［クーポン受取 URLを設定してください］")) warnings.push("クーポン受取リンク");
  if (bodyText.includes("［SNS URLを設定してください］")) warnings.push("SNSリンク");
  return warnings;
}
