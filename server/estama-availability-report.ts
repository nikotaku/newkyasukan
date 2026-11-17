// エステ魂の「ご案内状況」更新の結果を、エスたま自動化履歴（estama_sync_reports）に残す形にする。
// Browserbase の毎時更新（api/cron/estama-availability.ts）と GitHub Actions の直接実行で共通。
import type { EstamaAvailabilityRefreshResult } from "./estama-automation.js";

const formatJst = (value: string) => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date(value));

const resultItems = (result: EstamaAvailabilityRefreshResult) => result.castNames.map((castName) => ({
  kind: "availability_refresh",
  castName,
  ok: true,
  active: true,
  validUntil: result.validUntil,
}));

export function buildSuccessSummary(result: EstamaAvailabilityRefreshResult, finishedAt: string) {
  if (result.deferred) {
    return [
      "⚠️ エスたま ご案内状況の更新を延期",
      `実行: ${formatJst(finishedAt)}`,
      "別のエスたま同期が実行中だったため、同時操作を避けました。",
      "次回の毎時実行で自動再試行します。",
    ].join("\n");
  }
  if (!result.updated) {
    return [
      "✅ エスたま ご案内状況を確認",
      `実行: ${formatJst(finishedAt)}`,
      result.confirmation,
      "次回は1時間後に自動確認します。",
    ].join("\n");
  }

  return [
    "✅ エスたま ご案内状況を自動更新",
    `実行: ${formatJst(finishedAt)}`,
    "表示: ◎今すぐご案内可",
    `今すぐ案内: ${result.availableNowCount}名${result.castNames.length ? `（${result.castNames.join("、")}）` : ""}`,
    ...(result.manualPreservedCount > 0
      ? [`手動設定を維持: ${result.manualPreservedCount}名`]
      : []),
    result.validUntil ? `表示期限: ${result.validUntil}` : result.confirmation,
    "次回は1時間後に自動更新します。",
  ].join("\n");
}

export const buildFailureSummary = (error: string, finishedAt: string, loginRequired: boolean) => [
  "⚠️ エスたま ご案内状況の自動更新に失敗",
  `実行: ${formatJst(finishedAt)}`,
  `原因: ${error.replace(/\s+/g, " ").slice(0, 500)}`,
  loginRequired
    ? "エスたま連携画面から再ログインしてください。再ログイン後に自動更新を再開します。"
    : "次回は1時間後に自動再試行します。",
].join("\n");

export function availabilitySuccessPayload(
  result: EstamaAvailabilityRefreshResult,
  startedAt: string,
  finishedAt: string,
) {
  const items = resultItems(result);
  return {
    reportStatus: result.deferred ? "warning" : "success",
    startedAt,
    finishedAt,
    totalCount: items.length,
    successCount: items.length,
    castNames: result.castNames,
    summary: buildSuccessSummary(result, finishedAt),
    results: items,
    fatalError: null,
    configuration: {
      status: result.deferred ? "deferred" : result.updated ? "success" : "skipped",
      last_run_at: finishedAt,
      active_count: result.activeCount,
      available_now_count: result.availableNowCount,
      cast_names: result.castNames,
      valid_until: result.validUntil,
      updated: result.updated,
      ...(result.updated ? { last_success_at: finishedAt } : {}),
    },
  };
}

export function availabilityFailurePayload(
  errorMessage: string,
  loginRequired: boolean,
  startedAt: string,
  finishedAt: string,
) {
  return {
    reportStatus: "error",
    startedAt,
    finishedAt,
    totalCount: 0,
    successCount: 0,
    castNames: [],
    summary: buildFailureSummary(errorMessage, finishedAt, loginRequired),
    results: [],
    fatalError: errorMessage.slice(0, 1_000),
    configuration: {
      status: "error",
      last_run_at: finishedAt,
      error: errorMessage.slice(0, 1_000),
    },
    ...(loginRequired
      ? { connectionStatus: "login_in_progress", connectionError: errorMessage.slice(0, 1_000) }
      : {}),
  };
}

