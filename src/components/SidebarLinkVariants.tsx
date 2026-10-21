import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/copyText";

type Leaf = { href: string; label: string };

/**
 * サイドバーの項目をタップすると、版ごと（面談用ページの出稼ぎ用／在籍用など）に「開く」「URLをコピー」を出す。
 * ホーム画面に追加した管理アプリにはアドレスバーが無く、URLをコピーできないため。
 */
export function SidebarLinkVariants({
  child,
  active,
  onClose,
}: {
  child: Leaf & { variants?: Leaf[] };
  active: boolean;
  onClose?: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const copy = async (leaf: Leaf) => {
    const url = `${window.location.origin}${leaf.href}`;
    if (await copyText(url)) {
      toast.success(`${leaf.label}のURLをコピーしました`, { description: url });
    } else {
      window.prompt("このURLを長押ししてコピーしてください", url);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center px-3 py-1.5 text-left text-xs rounded-md transition-colors",
          active ? "text-primary bg-primary/10 font-semibold" : "text-foreground/70 hover:bg-muted/50",
        )}
      >
        {child.label}
        <ChevronDown size={12} className={cn("ml-auto transition-transform", open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div className="mt-0.5 space-y-1 pl-3">
          {(child.variants ?? []).map((leaf) => (
            <div key={leaf.href} className="rounded-md border bg-muted/30 px-2 py-1.5">
              <p className="mb-1 text-[11px] font-semibold text-foreground/80">{leaf.label}</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    navigate(leaf.href);
                    onClose?.();
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-background px-2 py-1 text-[11px] hover:bg-muted"
                >
                  <ExternalLink size={11} />開く
                </button>
                <button
                  type="button"
                  onClick={() => void copy(leaf)}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-background px-2 py-1 text-[11px] hover:bg-muted"
                >
                  <Copy size={11} />URLをコピー
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
