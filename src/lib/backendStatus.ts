// Supabase（DB・API）につながるかの確認。止まっている間（未払いによる一時停止・障害）は
// プロジェクトのドメイン自体が引けなくなり、公開HPの出勤・空き枠が「出勤なし」に見えてしまうので、
// 画面にメンテナンス中の案内を出すために使う（src/components/BackendDownNotice.tsx）。

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** 1回だけ確かめる。応答が返れば（500未満）つながっている */
export async function probeBackend(timeoutMs = 8000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_KEY },
      cache: "no-store",
      signal: controller.signal,
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 少し間をあけて2回ともつながらなければ停止中とみなす（お客様側の通信が一瞬切れただけでは出さない） */
export async function isBackendDown(retryDelayMs = 2000): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (await probeBackend()) return false;
  await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return !(await probeBackend());
}
