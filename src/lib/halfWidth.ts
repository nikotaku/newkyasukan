// 全角数字・記号を半角に変換するユーティリティ

// 全角数字（０-９）→ 半角（0-9）
export function toHalfWidthDigits(str: string): string {
  return str.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

// 数値入力向け：全角数字に加えて小数点・マイナス・カンマも半角化
export function toHalfWidthNumeric(str: string): string {
  return toHalfWidthDigits(str)
    .replace(/[．]/g, ".")
    .replace(/[，]/g, ",")
    .replace(/[－ー―‐−]/g, "-");
}
