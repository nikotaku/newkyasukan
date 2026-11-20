// 受付専用メールの Email Worker（Cloudflare Email Routing → このWorker）。
// 届いたメールを、まず今まで通りスタッフのメールへ転送し、同時にキャスカンの取り込み口（Edge Function report-email-ingest）へ
// そのまま送る。エステ魂の仮予約のメールなら、受け取ったその場でエステ魂の「お店への予約」を読みに行く。
//
// 設定（Cloudflare の Worker の「設定 → 変数とシークレット」）:
//   INGEST_URL   = https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/report-email-ingest
//   INGEST_TOKEN = キャスカンの画面で発行したトークン（シークレット。リポジトリ・チャットに書かない）
//   FORWARD_TO   = 転送先のメールアドレス（Email Routing で確認済みのもの。空なら転送しない）
// 依存ライブラリは使わない（ダッシュボードにそのまま貼れるように）。メールの読み取りは取り込み口で行う。

export default {
  async email(message, env, ctx) {
    // 人が見る転送を先に（取り込みが失敗しても、スタッフにはメールが届くように）
    if (env.FORWARD_TO) {
      await message.forward(env.FORWARD_TO).catch((error) => console.error("forward failed", String(error)));
    }
    const raw = await new Response(message.raw).arrayBuffer();
    const send = () => fetch(env.INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "message/rfc822",
        "x-ingest-token": env.INGEST_TOKEN,
      },
      body: raw,
    });
    let response = await send().catch((error) => ({ ok: false, status: 0, text: async () => String(error) }));
    if (!response.ok) {
      // 一時的な失敗は1回だけやり直す
      await new Promise((resolve) => setTimeout(resolve, 2000));
      response = await send().catch((error) => ({ ok: false, status: 0, text: async () => String(error) }));
    }
    if (!response.ok) console.error("ingest failed", response.status, (await response.text()).slice(0, 300));
  },
};
