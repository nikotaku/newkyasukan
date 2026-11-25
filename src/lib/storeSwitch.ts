export const ZENRYOKU_STORE_ID = "00000000-0000-0000-0000-000000000001";
export const ENKA_STORE_ID = "404499ab-5350-490f-9608-5814faffda6f";

export interface StoreDef {
  id: string;
  name: string;
  short: string; // ロゴ代わりの短縮表記（艶華="艶"）
  email: string;
}

export const STORE_DEFS: StoreDef[] = [
  { id: ZENRYOKU_STORE_ID, name: "過去データ", short: "旧", email: "saito.crow@gmail.com" },
  { id: ENKA_STORE_ID, name: "艶華", short: "艶", email: "saito.crow+enka@gmail.com" },
];

