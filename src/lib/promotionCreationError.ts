const DEFAULT_MESSAGE = "宣伝スケジュールを作成できませんでした。もう一度お試しください";
const messageFrom = (value: unknown): string | null => {
  if (!value || typeof value !== "object") return null;
  const object = value as { error?: unknown; message?: unknown };
  const message = typeof object.error === "string" ? object.error : object.message;
  return typeof message === "string" && message.trim() ? message.trim() : null;
};

/** FunctionsHttpError hides the backend's JSON body in context, not message. */
export async function promotionCreationErrorMessage(error: unknown): Promise<string> {
  const context = error && typeof error === "object" && "context" in error ? error.context : null;
  if (context instanceof Response) {
    if (context.status === 401) return "ログインの有効期限が切れているか、認証を確認できません。再ログインしてお試しください";
    try {
      const message = messageFrom(await context.clone().json());
      if (message) return message;
    } catch {
      // Do not expose raw HTML from a proxy/gateway in the form.
    }
    if (context.status === 403) return "この店舗の宣伝スケジュールを作成する権限を確認できません";
    if (context.status === 429) return "AIが混み合っています。少し待ってから再度お試しください";
    return `作成処理でエラーが発生しました（HTTP ${context.status}）。もう一度お試しください`;
  }
  const message = messageFrom(error);
  return message || DEFAULT_MESSAGE;
}
