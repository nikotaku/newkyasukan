// Supabase Storage の写真を、表示に合った大きさ（/api/img 経由）で読む <img>。
//
//  - 原本はそのまま。中継（/api/img）が縮めて CDN に1年キャッシュする
//  - 中継が失敗したら原本の URL へ自動で切り替える（404 で写真が欠ける・表示が崩れることはない）
//  - Google Drive などの写真は今まで通り driveImgUrl の URL をそのまま使う

import { useEffect, useMemo, useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { driveImgUrl } from "@/lib/drive";
import { imageUrlPair, type ImageVariant } from "@/lib/storageImage";

interface StorageImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string | null | undefined;
  /** 用途（thumb: 一覧・サムネ / detail: 詳細のメイン / hero: トップバナー） */
  variant?: ImageVariant;
  /** Google Drive の写真を取るときの大きさ（今まで driveImgUrl に渡していた値） */
  size?: number;
}

export function StorageImage({ src, variant = "thumb", size = 800, onError, ...imgProps }: StorageImageProps) {
  const { proxied, original } = useMemo(() => imageUrlPair(src, variant, size), [src, variant, size]);
  const [current, setCurrent] = useState(proxied || original);

  useEffect(() => {
    setCurrent(proxied || original);
  }, [proxied, original]);

  if (!src) return null;

  return (
    <img
      {...imgProps}
      src={current}
      onError={(event) => {
        // 中継が失敗した → 原本へ。原本も読めないときだけ、呼び出し側の onError を呼ぶ
        if (proxied && current !== original) {
          setCurrent(original);
          return;
        }
        onError?.(event);
      }}
    />
  );
}

export default StorageImage;

/** 画像1枚の URL（<img> を使わない場所・CSS の背景などで使う） */
export function storageImageSrc(url: string | null | undefined, variant: ImageVariant = "thumb", size = 800): string {
  const { proxied, original } = imageUrlPair(url, variant, size);
  return proxied || original || driveImgUrl(url, size);
}
