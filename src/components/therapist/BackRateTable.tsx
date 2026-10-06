// セラピストのバック表（コース・時間ごとのお給料）。マイページの「バック表」と面談用ページで同じものを出す。

export interface BackRateRow {
  course_type: string;
  duration: number;
  therapist_back: number;
}

export function BackRateTable({ rates }: { rates: BackRateRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      {rates.map((rate) => (
        <div key={`${rate.course_type}-${rate.duration}`} className="grid grid-cols-[1fr_auto] gap-4 border-b px-4 py-3 last:border-b-0">
          <span className="text-sm">{rate.course_type} {rate.duration}分</span>
          <span className="font-bold text-primary">¥{rate.therapist_back.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
