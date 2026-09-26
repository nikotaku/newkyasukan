// エラーを画面・ジョブ履歴に出せる文章にする。
// supabase-js の { data, error } の error は Error ではない素のオブジェクトなので、
// String(error) だと「[object Object]」になり原因が分からなくなる。
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const { message, details, code } = error as { message?: unknown; details?: unknown; code?: unknown };
    if (typeof message === "string" && message) {
      const extra = [typeof details === "string" ? details : "", typeof code === "string" ? code : ""]
        .filter(Boolean)
        .join(" / ");
      return extra ? `${message}（${extra}）` : message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      // 循環参照などで JSON にできないときは下へ
    }
  }
  return String(error);
}
