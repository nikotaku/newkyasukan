import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/hooks/useSortable";

interface Props {
  label: string;
  sortKey: string;
  activeKey: string | null;
  dir: SortDir;
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
}

// クリックで並べ替えできるテーブルヘッダーセル
export function SortableTh({ label, sortKey, activeKey, dir, onSort, align = "left", className }: Props) {
  const active = activeKey === sortKey;
  const alignCls = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={cn("px-4 py-3 font-medium select-none", align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", alignCls, active ? "text-primary" : "")}
      >
        {label}
        {active ? (
          dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
        ) : (
          <ChevronsUpDown size={12} className="opacity-40" />
        )}
      </button>
    </th>
  );
}
