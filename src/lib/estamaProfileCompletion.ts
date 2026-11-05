import { castProfileCompletion, type CastProfileFields } from "./castProfileCompletion.ts";
import { castToEstama, type EstamaCastRecord } from "./estamaProfileData.ts";

export type EstamaConfirmation = {
  sync_status: string;
  last_profile_hash: string | null;
  last_photo_hash: string | null;
  last_profile_sync_at: string | null;
  last_error: string | null;
};

export type EstamaFingerprint = { signature: string; profileHash: string; photoHash: string };

export const estamaProfileSignature = (cast: EstamaCastRecord) => JSON.stringify(castToEstama(cast));

export async function estamaFingerprint(cast: EstamaCastRecord): Promise<EstamaFingerprint> {
  const data = castToEstama(cast);
  const hash = async (value: string) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  };
  const signature = JSON.stringify(data);
  const [profileHash, photoHash] = await Promise.all([hash(signature), hash(JSON.stringify(data.photos))]);
  return { signature, profileHash, photoHash };
}

// 「掲載済み」の手動チェックや古い成功履歴だけでは100%にしない。
// ワーカーが保存した内容のハッシュと、今の入力を同じ変換処理で比較する。
export function estamaProfileCompletion(
  cast: EstamaCastRecord & CastProfileFields,
  confirmation?: EstamaConfirmation | null,
  fingerprint?: EstamaFingerprint | null,
) {
  const confirmed = Boolean(
    confirmation?.sync_status === "synced"
    && confirmation.last_profile_sync_at
    && !confirmation.last_error
    && fingerprint?.signature === estamaProfileSignature(cast)
    && confirmation.last_profile_hash === fingerprint?.profileHash
    && confirmation.last_photo_hash === fingerprint?.photoHash,
  );
  const input = castProfileCompletion(cast);
  // 登録・反映確認を最後の1項目として数える。確認済みなら任意欄が空でも完了。
  const total = input.total + 1;
  return {
    percent: confirmed ? 100 : Math.round(input.done / total * 100),
    confirmed,
    message: confirmed ? "エスたまへの登録・最新内容の反映を確認済み" : "エスたまへの登録・最新内容の反映確認待ち",
  };
}
