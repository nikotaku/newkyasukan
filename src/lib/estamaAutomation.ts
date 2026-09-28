import { supabase } from "@/integrations/supabase/client";

export type EstamaRunResult = {
  skipped?: boolean;
  reason?: string;
  results: Array<{
    id: string;
    status: string;
    error?: string;
    result?: Record<string, unknown>;
  }>;
};

async function requestEstamaAutomation(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("ログインが期限切れです");
  let response: Response;
  try {
    response = await fetch("/api/automations/estama", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // iPhoneのSafariは処理が長いと「Load failed」で通信を切る。サーバー側の処理は続き、失敗してもキューで再試行される
    throw new Error("通信が途中で切れました。エステ魂への反映はサーバー側で続いているので、数分後に画面を再読み込みして連携状態を確認してください");
  }
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "エスたま自動化の実行に失敗しました");
  return result;
}

export async function runEstamaCastAutomation(input: {
  storeId: string;
  castId: string;
  soulCredentials?: { loginId: string; password: string; email?: string };
}): Promise<EstamaRunResult> {
  return requestEstamaAutomation({
    action: "run-cast",
    storeId: input.storeId,
    castId: input.castId,
    soulCredentials: input.soulCredentials,
  }) as Promise<EstamaRunResult>;
}

export type EstamaJobStatus = {
  id: string;
  status: string;
  error_message: string | null;
  finished_at: string | null;
};

/** 登録・連携をサーバー側のバックグラウンドで開始する（画面を閉じても続く） */
export async function startEstamaCastAutomation(input: { storeId: string; castId: string }) {
  const result = await requestEstamaAutomation({
    action: "run-cast",
    storeId: input.storeId,
    castId: input.castId,
    background: true,
  });
  if (typeof result.jobId !== "string") throw new Error("エスたま登録ジョブを開始できませんでした");
  return result.jobId;
}

export async function getEstamaJobStatus(storeId: string, jobId: string): Promise<EstamaJobStatus | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("ログインが期限切れです");
  const response = await fetch(`/api/automations/estama?storeId=${encodeURIComponent(storeId)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => ({})) as { jobs?: EstamaJobStatus[] };
  return (body.jobs || []).find((job) => job.id === jobId) || null;
}

export async function runEstamaProfileSync(input: {
  storeId: string;
  castId: string;
}): Promise<EstamaRunResult> {
  return requestEstamaAutomation({
    action: "run-profile-sync",
    storeId: input.storeId,
    castId: input.castId,
  }) as Promise<EstamaRunResult>;
}

export async function runQueuedEstamaAutomation(storeId: string): Promise<EstamaRunResult> {
  return requestEstamaAutomation({ action: "run-queued", storeId }) as Promise<EstamaRunResult>;
}
