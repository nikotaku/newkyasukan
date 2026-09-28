const yenFormatter = new Intl.NumberFormat("ja-JP");

export function yen(value: number) {
  return `${yenFormatter.format(Math.round(value))}円`;
}

// 1,250,000 → 125万円 / -830,000 → -83万円
export function manYen(value: number) {
  const man = Math.round(value / 10000);
  return `${yenFormatter.format(man)}万円`;
}

export function percent(ratio: number, digits = 0) {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysAgo(days: number, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return toDateKey(date);
}

export function shortDate(dateKey: string) {
  const [, m, d] = dateKey.split("-");
  return `${Number(m)}/${Number(d)}`;
}
