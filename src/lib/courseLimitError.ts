// Only surface the known validation message, not arbitrary database errors.
export function courseLimitErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { code?: unknown; details?: unknown; message?: unknown };
  return value.code === "23514" && value.details === "NEW_CUSTOMER_COURSE_LIMIT"
    && typeof value.message === "string" ? value.message : null;
}
