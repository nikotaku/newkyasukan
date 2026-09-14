function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function linkifyBodyText(value: string) {
  const escaped = escapeHtml(value.trim());
  const urlPattern = /https?:\/\/[^\s<]+/g;
  return escaped
    .replace(urlPattern, (matchedUrl) => {
      const url = matchedUrl.replace(/[),.;!?]+$/, "");
      const trailing = matchedUrl.slice(url.length);
      return `<a href="${url}" style="color:#4f46e5;word-break:break-all;">${url}</a>${trailing}`;
    })
    .replace(/\r?\n/g, "<br />");
}

export function makeNewsletterHtml(bodyText: string, unsubscribeUrl: string) {
  const safeBody = linkifyBodyText(bodyText);
  return `<!doctype html>
<html lang="ja">
  <body style="margin:0;padding:0;background:#f8fafc;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;line-height:1.75;">
    <main style="max-width:640px;margin:0 auto;padding:32px 24px;background:#ffffff;">
      <div style="white-space:normal;font-size:15px;">${safeBody}</div>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:32px 0 16px;" />
      <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
        今後のご案内メールが不要な場合は、<a href="${escapeHtml(unsubscribeUrl)}" style="color:#4f46e5;">配信を停止する</a>からお手続きください。
      </p>
    </main>
  </body>
</html>`;
}
