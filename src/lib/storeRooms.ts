// 艶華のルームは2つ。昔の呼び名（インルーム・ラスルーム・ラズルーム など）は同じ部屋の別名として扱う。
//  - 艶月 … 仙台市青葉区二日町11-15 In-Towner（旧：インルーム・インroom・二日町インroom）
//  - 華月 … 仙台市青葉区春日町11-12 ラジュール仙台（旧：ラスルーム・ラズルーム・ラスroom）
// DB側も同じ決まり（public.canonical_room_name）で、シフト・予約・セラピストのルームを保存時にそろえる。
// テスト: npm run test:reservation-room

export const ENKA_ROOMS = ["艶月", "華月"] as const;

export const ROOM_ADDRESS_HINT: Record<string, string> = {
  艶月: "二日町11-15",
  華月: "春日町11-12",
};

/** 昔の呼び名・住所入りの名前を 艶月 / 華月 にそろえる。どちらでもなければそのまま（前後の空白・■は除く） */
export function canonicalRoomName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim().replace(/^■+|■+$/g, "").trim();
  if (!trimmed) return null;
  const key = trimmed.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  if (key.includes("艶月") || /^イン(ルーム|room)$/.test(key) || key.includes("二日町") || key.includes("in-towner") || key.includes("intowner")) return "艶月";
  if (key.includes("華月") || /^(ラス|ラズ)(ルーム|room)$/.test(key) || key.includes("春日町") || key.includes("ラジュール")) return "華月";
  return trimmed;
}

/** 同じ部屋か（呼び名の違いは無視） */
export function sameRoom(a: string | null | undefined, b: string | null | undefined) {
  return canonicalRoomName(a) === canonicalRoomName(b);
}
