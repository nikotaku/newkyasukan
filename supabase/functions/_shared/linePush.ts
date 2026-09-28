// LINEのグループへのテキスト送信と、月の送信数（無料枠）の確認。
// グループへの送信は参加人数分カウントされるので、残数の判断には人数も使う。

export interface QuotaSnapshot {
  // null = 上限なし（有料プランの従量課金など）
  limit: number | null;
  used: number;
  // グループへの送信は参加人数分カウントされる
  members: number;
}

async function lineGet(token: string, path: string) {
  const r = await fetch(`https://api.line.me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!r.ok) throw new Error(`line ${r.status}`);
  return await r.json();
}

// 残数を確認できないときは null（呼び出し側で「送る」扱いにする）
export async function readLineQuota(token: string, groupId: string): Promise<QuotaSnapshot | null> {
  try {
    const [quota, consumption, members] = await Promise.all([
      lineGet(token, "/v2/bot/message/quota"),
      lineGet(token, "/v2/bot/message/quota/consumption"),
      lineGet(token, `/v2/bot/group/${encodeURIComponent(groupId)}/members/count`),
    ]);
    return {
      limit: quota?.type === "limited" ? Number(quota.value) : null,
      used: Number(consumption?.totalUsage ?? 0),
      members: Number(members?.count ?? 1),
    };
  } catch {
    return null;
  }
}

// retryKey はUUID。同じキーの再送はLINE側で1回に畳まれる（409 + accepted-request-id は送信済み扱い）
export async function pushLineText(token: string, groupId: string, text: string, retryKey: string) {
  try {
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Line-Retry-Key": retryKey },
      body: JSON.stringify({ to: groupId, messages: [{ type: "text", text }] }),
      signal: AbortSignal.timeout(10_000),
    });
    const accepted = r.status === 409 && Boolean(r.headers.get("x-line-accepted-request-id"));
    return { ok: r.ok || accepted, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
