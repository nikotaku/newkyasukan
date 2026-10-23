// Shared, side-effect-free parsing. Do not guess external endpoints or form fields.
export const BASE = "https://m-sns.net";
export const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ");
export const text = (s: string) =>
  decode(
    s
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
export function attrs(s: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of s.matchAll(
    /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  ))
    result[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4]);
  return result;
}
export function safeUrl(value: string, base = BASE): string {
  const u = new URL(decode(value), base);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "m-sns.net" ||
    u.port ||
    u.username ||
    u.password
  )
    throw new Error("02以外の送信先にはアクセスしません");
  return u.href;
}
export type Form = {
  url: string;
  method: string;
  html: string;
  fields: Record<string, string>;
  inputs: Array<Record<string, string>>;
  label: string;
};
export function forms(html: string, base: string): Form[] {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].flatMap(
    (m) => {
      const a = attrs(m[1]);
      let url: string;
      try {
        url = safeUrl(a.action || base, base);
      } catch {
        return [];
      }
      const inputs = [
        ...m[2].matchAll(/<(?:input|button|select|textarea)\b([^>]*)>/gi),
      ].map((x) => attrs(x[1]));
      const fields: Record<string, string> = {};
      for (const i of inputs)
        if (
          i.name &&
          ![
            "file",
            "password",
            "submit",
            "button",
            "checkbox",
            "radio",
          ].includes(i.type || "text")
        )
          fields[i.name] = i.value || "";
      for (const tag of m[2].matchAll(/<input\b([^>]*)>/gi)) {
        const a = attrs(tag[1]);
        if (
          a.name &&
          ["checkbox", "radio"].includes(a.type) &&
          /\bchecked(?:\s|=|$)/i.test(tag[1])
        )
          fields[a.name] = a.value || "on";
      }
      for (const select of m[2].matchAll(
        /<select\b([^>]*)>([\s\S]*?)<\/select>/gi,
      )) {
        const name = attrs(select[1]).name;
        if (!name) continue;
        const options = [
          ...select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi),
        ];
        const chosen =
          options.find((o) => /\bselected(?:\s|=|$)/i.test(o[1])) || options[0];
        if (chosen) fields[name] = attrs(chosen[1]).value ?? text(chosen[2]);
      }
      for (const area of m[2].matchAll(
        /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi,
      )) {
        const name = attrs(area[1]).name;
        if (name) fields[name] = decode(area[2]);
      }
      return [
        {
          url,
          method: (a.method || "GET").toUpperCase(),
          html: m[2],
          fields,
          inputs,
          label: text(m[2]),
        },
      ];
    },
  );
}
export function links(html: string, base: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].flatMap((m) => {
    try {
      const a = attrs(m[1]);
      return a.href ? [{ url: safeUrl(a.href, base), label: text(m[2]) }] : [];
    } catch {
      return [];
    }
  });
}
export function usernameFromUrl(value: string): string | null {
  try {
    const u = new URL(safeUrl(value));
    return (
      /^\/profile\/@([A-Za-z0-9_]{3,20})\/?$/.exec(u.pathname)?.[1] || null
    );
  } catch {
    return null;
  }
}
export function assertPage(html: string) {
  if (
    /captcha|cf-chl-|g-recaptcha|verify you are human|checking your browser|自動アクセスを検知/i.test(
      html,
    )
  )
    throw new Error("02側の確認が必要です。自動操作を停止しました");
  if (
    /Site Unavailable|Unable to access this site|Access Denied/i.test(
      text(html),
    ) ||
    html.length < 300
  )
    throw new Error("02の画面を取得できませんでした。状態は未確認です");
}
export function approvalForms(html: string, base: string) {
  return forms(html, base).flatMap((form) => {
    const buttons = [
      ...form.html.matchAll(
        /<(?:button|input)\b([^>]*)(?:>([\s\S]*?)<\/button>|\/?>)/gi,
      ),
    ].map((m) => ({
      a: attrs(m[1]),
      label: text(m[2] || attrs(m[1]).value || ""),
    }));
    const approve = buttons.filter((b) =>
      /^(承認|許可|連携を承認|承認する)$/.test(b.label),
    );
    const profiles = links(form.html, base).filter((l) =>
      usernameFromUrl(l.url),
    );
    if (form.method !== "POST" || approve.length !== 1 || profiles.length !== 1)
      return [];
    const username = usernameFromUrl(profiles[0].url)!;
    return [
      {
        username,
        name: profiles[0].label || username,
        profileUrl: profiles[0].url,
        form,
        submit: approve[0].a,
      },
    ];
  });
}
export type VerificationMail = {
  id: string;
  from: string;
  to?: string;
  originalTo?: string;
  subject: string;
  body: string;
  date: string;
  authentication?: string;
};
export function parseVerificationMail(
  mail: VerificationMail,
  now = Date.now(),
) {
  const sender = mail.from.match(
    /(?:<|\b)([A-Za-z0-9._+-]+@m-sns\.net)(?=>|\s|$)/i,
  )?.[1];
  const received = new Date(mail.date).getTime();
  if (
    !sender ||
    !Number.isFinite(received) ||
    received > now + 60000 ||
    now - received > 10 * 60000 ||
    !/認証|確認コード|verification/i.test(mail.subject)
  )
    return null;
  // Authentication-Results must be supplied by the trusted Gmail relay, not the message body.
  if (
    !/dkim=pass\b[^;\r\n]*header\.(?:d|i)=(?:@)?m-sns\.net(?=;|\s|$)/i.test(
      mail.authentication || "",
    )
  )
    return null;
  const recipients = new Set(
    (
      `${mail.originalTo || ""} ${mail.to || ""}`.match(
        /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
      ) || []
    ).map((v) => v.toLowerCase()),
  );
  const matches = [
    ...mail.body.matchAll(
      /(?:認証コード|確認コード|verification code)[\s:：]*([0-9]{4,8})(?![0-9])/gi,
    ),
  ].map((m) => m[1]);
  const codes = [...new Set(matches)];
  if (codes.length !== 1) return null;
  return {
    recipients: [...recipients],
    code: codes[0],
    receivedAt: new Date(received).toISOString(),
  };
}

// Observed on /shop/relations/: request-{cast_id}, respond.php with shop_id/cast_id/action.
export function relationRequests(html: string, base: string) {
  const rows = [
    ...html.matchAll(
      /<(?:div|article|li|tr)\b[^>]*\bid=["']request-(\d+)["'][^>]*>/gi,
    ),
  ];
  return rows.map((m, i) => {
    const scriptAt = html.indexOf("<script", m.index!);
    const end =
      rows[i + 1]?.index ?? (scriptAt > m.index! ? scriptAt : html.length);
    const block = html.slice(m.index!, end);
    const unique = new Map<string, { url: string; label: string }>();
    for (const link of links(block, base)) {
      const name = usernameFromUrl(link.url);
      if (name && (!unique.has(name) || link.label)) unique.set(name, link);
    }
    const profile = [...unique.values()];
    if (profile.length !== 1)
      throw new Error("02の申請者を一意に判別できません");
    const p = profile[0],
      username = usernameFromUrl(p.url)!;
    return {
      remoteId: m[1],
      username,
      name: p.label || username,
      profileUrl: p.url,
    };
  });
}
export function relationShopId(html: string): string {
  const id = /\bconst\s+SHOP_ID\s*=\s*(\d+)\s*;/.exec(html)?.[1];
  if (!id || !html.includes("/api/cast-shop/respond.php"))
    throw new Error("02の連携承認画面の仕様を確認できません");
  return id;
}
export function memberIds(html: string): Set<string> {
  return new Set(
    [...html.matchAll(/\bid=["']member-(\d+)["']/gi)].map((m) => m[1]),
  );
}
