// 「予約通知登録 [店舗]」コマンドの解釈。店舗名を省略した場合は艶華。

const TSUYAKA_STORE_ID = "404499ab-5350-490f-9608-5814faffda6f";
const MAIN_STORE_ID = "00000000-0000-0000-0000-000000000001";

const STORE_MAP: Record<string, { id: string; label: string }> = {
  "艶華": { id: TSUYAKA_STORE_ID, label: "艶華" },
  "えんか": { id: TSUYAKA_STORE_ID, label: "艶華" },
  "エンカ": { id: TSUYAKA_STORE_ID, label: "艶華" },
  "全力": { id: MAIN_STORE_ID, label: "全力" },
};

export type BookingDestinationCommand =
  | { kind: "register"; storeId: string; storeLabel: string }
  | { kind: "unknown_store"; storeName: string };

export function parseBookingDestinationCommand(text: string): BookingDestinationCommand | null {
  const match = text.trim().match(/^予約通知登録(?:[\s\u3000]+(\S+))?$/);
  if (!match) return null;
  const storeName = match[1] ?? "艶華";
  const store = STORE_MAP[storeName];
  if (!store) return { kind: "unknown_store", storeName };
  return { kind: "register", storeId: store.id, storeLabel: store.label };
}
