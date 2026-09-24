// WEB予約のLINE通知をどの公式アカウント・どのグループから送るかを決める。
// 予約通知専用アカウントを優先し、送れなければメインアカウントに切り替える。
// メインアカウントは日報・シフト等の通知で月間上限(429)に達しやすく、
// 予約通知だけは別枠で確実に届けたいため。

export type LineAccount = "booking" | "main";

export interface LineRoute {
  account: LineAccount;
  token: string;
  groupId: string;
}

export interface LineRouteInput {
  bookingToken?: string | null;
  bookingGroupId?: string | null;
  mainToken?: string | null;
  mainGroupId?: string | null;
}

export interface LineRouteResolution {
  routes: LineRoute[];
  // routes が空のときに記録するエラーコード
  missingCode: "line_token_missing" | "line_destination_missing" | null;
}

export function resolveLineBookingRoutes(input: LineRouteInput): LineRouteResolution {
  const routes: LineRoute[] = [];
  if (input.bookingToken && input.bookingGroupId) {
    routes.push({ account: "booking", token: input.bookingToken, groupId: input.bookingGroupId });
  }
  if (input.mainToken && input.mainGroupId) {
    routes.push({ account: "main", token: input.mainToken, groupId: input.mainGroupId });
  }
  if (routes.length > 0) return { routes, missingCode: null };
  const hasToken = Boolean(input.bookingToken || input.mainToken);
  return { routes, missingCode: hasToken ? "line_destination_missing" : "line_token_missing" };
}

// 既存の記録（line_http_429 など）はメインアカウントのものなので、その形式を保つ。
export function lineErrorCode(account: LineAccount, detail: string) {
  return account === "booking" ? `line_booking_${detail}` : `line_${detail}`;
}
