// セラピストのバック表（コース・時間ごとのお給料）。マイページの「バック表」と面談用ページで同じものを出す。

export interface BackRateRow {
  course_type: string;
  duration: number;
  therapist_back: number;
}

export interface BackListRow {
  key: string;
  label: string;
  /** バックが無いものは null（「なし」と出す） */
  back: number | null;
}

/** バック表の見た目（コース・オプション・指名で共通） */
export function BackList({ rows }: { rows: BackListRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[1fr_auto] gap-4 border-b px-4 py-3 last:border-b-0">
          <span className="text-sm">{row.label}</span>
          {row.back === null
            ? <span className="text-sm text-muted-foreground">なし</span>
            : <span className="font-bold text-primary">¥{row.back.toLocaleString()}</span>}
        </div>
      ))}
    </div>
  );
}

export function BackRateTable({ rates }: { rates: BackRateRow[] }) {
  return (
    <BackList
      rows={rates.map((rate) => ({
        key: `${rate.course_type}-${rate.duration}`,
        label: `${rate.course_type} ${rate.duration}分`,
        back: rate.therapist_back,
      }))}
    />
  );
}
