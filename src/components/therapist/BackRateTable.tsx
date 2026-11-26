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
  /** セットの中身（えすたま限定プランなど）。あれば名前の下に箇条書きで出す */
  contents?: string[];
  /** 名前の下に出す補足（施術は合計◯分 など） */
  note?: string;
}

/** バック表の見た目（コース・オプション・指名で共通） */
export function BackList({ rows }: { rows: BackListRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[1fr_auto] items-start gap-4 border-b px-4 py-3 last:border-b-0">
          <div className="min-w-0">
            <span className="text-sm">{row.label}</span>
            {row.contents && row.contents.length > 0 && (
              <div className="mt-1.5 rounded-md bg-muted/60 px-2.5 py-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground">セットの中身</p>
                <ul className="mt-0.5 space-y-0.5">
                  {row.contents.map((item) => (
                    <li key={item} className="text-xs before:mr-1 before:content-['・']">{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {row.note && <p className="mt-1 text-[11px] text-muted-foreground">{row.note}</p>}
          </div>
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
