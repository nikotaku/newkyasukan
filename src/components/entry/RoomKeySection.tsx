import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { codeDigits, type RoomKeyType } from "@/lib/roomEntry";
import { DialLockAnimation } from "./DialLockAnimation";
import { KeypadUnlockAnimation } from "./KeypadUnlockAnimation";

// 入室方法の「鍵」：番号を大きく出し、鍵の種類に合わせて開け方のアニメーションを付ける。

const TITLES: Record<RoomKeyType | "none", string> = {
  keypad: "ドアの暗証番号（テンキー）",
  dial_lock: "鍵の番号（ダイヤル式）",
  none: "暗証番号",
};

export function RoomKeySection({ keyType, code, closeCode, onCopy }: {
  keyType: RoomKeyType | null;
  code: string;
  closeCode?: string | null;
  onCopy?: (value: string) => void;
}) {
  const animated = keyType && codeDigits(code).length > 0;
  return (
    <div className="space-y-2.5 rounded-lg border-2 border-primary/25 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <KeyRound size={14} />{TITLES[keyType ?? "none"]}
        </p>
        {onCopy && (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-primary" onClick={() => onCopy(code)}>
            <Copy size={13} />コピー
          </Button>
        )}
      </div>
      <p className="font-mono text-3xl font-bold tracking-[0.2em] text-primary">{code}</p>
      {animated && keyType === "keypad" && <KeypadUnlockAnimation code={code} />}
      {animated && keyType === "dial_lock" && <DialLockAnimation code={code} closeCode={closeCode} />}
    </div>
  );
}
