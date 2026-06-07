import { useEffect } from "react";
import { toHalfWidthDigits, toHalfWidthNumeric } from "@/lib/halfWidth";

// アプリ全体で、入力された全角数字を自動で半角へ変換する。
// キャプチャフェーズで DOM の value を書き換えるため、React の onChange は
// 変換後の値を受け取る（制御コンポーネントでもそのまま反映される）。
export function useGlobalHalfWidth() {
  useEffect(() => {
    const handler = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;

      // パスワード欄は変換しない（意図した全角を保持）
      if (el instanceof HTMLInputElement && el.type === "password") return;

      const isNumericField =
        el instanceof HTMLInputElement &&
        (el.type === "number" ||
          el.type === "tel" ||
          el.inputMode === "numeric" ||
          el.inputMode === "decimal" ||
          el.inputMode === "tel");

      const original = el.value;
      const converted = isNumericField
        ? toHalfWidthNumeric(original)
        : toHalfWidthDigits(original);

      if (converted === original) return;

      // type=number はキャレット位置を取得できないため try で保護
      let start: number | null = null;
      let end: number | null = null;
      try {
        start = el.selectionStart;
        end = el.selectionEnd;
      } catch {
        /* type=number 等では参照不可 */
      }

      el.value = converted; // 1:1置換のため長さは不変

      if (start !== null && end !== null) {
        try {
          el.setSelectionRange(start, end);
        } catch {
          /* noop */
        }
      }
    };

    document.addEventListener("input", handler, true);
    return () => document.removeEventListener("input", handler, true);
  }, []);
}
