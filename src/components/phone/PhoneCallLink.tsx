// 管理画面の電話番号のリンク。SUBLINE を登録している店舗では店の050番号で発信する。
// スマホ … SUBLINEアプリを開いて発信 / パソコン … スマホのSUBLINEへ「発信してください」の通知を送る
// 登録していない店舗は今まで通りの tel: リンク。
import { useState, type ReactNode, type MouseEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSublinePhone } from "@/hooks/useSublinePhone";
import { dialDigits, dialHref } from "@/lib/sublinePhone";

interface PhoneCallLinkProps {
  phone: string;
  /** スマホの通知に出すお客様の名前 */
  name?: string;
  className?: string;
  children?: ReactNode;
  stopPropagation?: boolean;
}

export function PhoneCallLink({ phone, name, className, children, stopPropagation }: PhoneCallLinkProps) {
  const { enabled, phoneDevice, call } = useSublinePhone();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const digits = dialDigits(phone);
  const href = dialHref(phone, { subline: enabled, phoneDevice });

  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (stopPropagation) event.stopPropagation();
    if (!enabled || phoneDevice || !digits) return; // スマホ・未登録はリンクのまま
    event.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const result = await call(digits, name);
      toast({
        title: "スマホのSUBLINEに発信の通知を送りました",
        description: `${result.member} さんのスマホで通知をタップすると、${phone} に店の番号でかかります`,
      });
    } catch (error) {
      toast({
        title: "SUBLINEで発信できませんでした",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <a
      href={href}
      onClick={onClick}
      className={className}
      title={enabled ? (phoneDevice ? "SUBLINEアプリで発信" : "スマホのSUBLINEに発信の通知を送る") : undefined}
      aria-busy={sending || undefined}
    >
      {children ?? phone}
    </a>
  );
}
