export const REVIEW_REQUIRED_PREFIX = "【要確認・再送停止】";

export function isRetryableCrossPost(
  status: string | null | undefined,
  error: string | null | undefined,
  attempts: number | null | undefined,
  maxAttempts = 3,
  retrySkipped = false,
) {
  return (status === "pending" || status === "failed" || (retrySkipped && status === "skipped"))
    && Number(attempts || 0) < maxAttempts
    && !String(error || "").startsWith(REVIEW_REQUIRED_PREFIX);
}

