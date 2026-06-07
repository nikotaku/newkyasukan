import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

type Accessor<T> = (item: T) => string | number | null | undefined;

// 列ヘッダーによる並べ替え。accessors はキーごとの値取得関数。
export function useSortable<T>(
  data: T[],
  accessors: Record<string, Accessor<T>>,
  initial?: { key: string; dir?: SortDir }
) {
  const [sortKey, setSortKey] = useState<string | null>(initial?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(initial?.dir ?? "asc");

  const sorted = useMemo(() => {
    if (!sortKey || !accessors[sortKey]) return data;
    const acc = accessors[sortKey];
    const arr = [...data];
    arr.sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      const aEmpty = va === null || va === undefined || va === "";
      const bEmpty = vb === null || vb === undefined || vb === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1; // 空は常に末尾
      if (bEmpty) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const cmp = String(va).localeCompare(String(vb), "ja", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [data, sortKey, sortDir, accessors]);

  const toggle = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const reset = () => {
    setSortKey(initial?.key ?? null);
    setSortDir(initial?.dir ?? "asc");
  };

  return { sorted, sortKey, sortDir, toggle, reset, setSortKey };
}
