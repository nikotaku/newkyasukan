import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateShiftBreak } from "@/lib/shiftBreak";

// シフト入力の「中休み」欄。開始・終了の時刻と、よく使う長さ（30分・1時間）のボタン。
// 休憩の時間はHPの空き枠・予約画面に出なくなる。

interface Props {
  value: { break_start: string; break_end: string };
  shift: { start_time: string; end_time: string };
  onChange: (next: { break_start: string; break_end: string }) => void;
}

const toMinutes = (time: string) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const toTime = (minutes: number) => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
};

export function ShiftBreakFields({ value, shift, onChange }: Props) {
  const error = validateShiftBreak({ ...shift, ...value });

  // 長さのボタン：開始が入っていればそこから、無ければ出勤の真ん中あたり（30分単位）から
  const setLength = (minutes: number) => {
    let start = toMinutes(value.break_start);
    if (start === null) {
      const shiftStart = toMinutes(shift.start_time);
      let shiftEnd = toMinutes(shift.end_time);
      if (shiftStart === null || shiftEnd === null) return;
      if (shiftEnd <= shiftStart) shiftEnd += 1440;
      start = Math.round((shiftStart + (shiftEnd - shiftStart - minutes) / 2) / 30) * 30;
    }
    onChange({ break_start: toTime(start), break_end: toTime(start + minutes) });
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5"><Coffee className="h-4 w-4" />中休み（休憩）</Label>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setLength(30)}>30分</Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setLength(60)}>1時間</Button>
          {(value.break_start || value.break_end) && (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange({ break_start: "", break_end: "" })}>なし</Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">休憩の開始</Label>
          <Input type="time" value={value.break_start} onChange={(e) => onChange({ ...value, break_start: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">休憩の終了</Label>
          <Input type="time" value={value.break_end} onChange={(e) => onChange({ ...value, break_end: e.target.value })} />
        </div>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">休憩の時間はHPの空き枠・予約画面に出ません。無ければ空のままで大丈夫です。</p>
      )}
    </div>
  );
}
