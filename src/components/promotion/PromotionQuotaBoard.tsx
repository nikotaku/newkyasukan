import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Target,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { currentBusinessDate, usePromotionQuota } from "@/hooks/usePromotionQuota";
import { cn } from "@/lib/utils";
import {
  addMonths,
  monthLabel,
  monthOf,
  QUOTA_CHANNELS,
  summarizeQuota,
  tierLabel,
  type QuotaCell,
  type QuotaChannelKey,
  type QuotaRow,
} from "@/lib/promotionQuota";
import { PromotionExposureDialog, type ExposureDialogTarget } from "./PromotionExposureDialog";
import { PromotionQuotaSettingsDialog } from "./PromotionQuotaSettingsDialog";

const shortDate = (date: string) => {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
};

const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

function cellTone(cell: QuotaCell) {
  if (cell.required === 0) return cell.done > 0 ? "text-emerald-700" : "text-muted-foreground/50";
  if (cell.done >= cell.required) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (cell.done < cell.expected) return "bg-amber-50 text-amber-800 border-amber-300";
  return "bg-background";
}

/**
 * 宣伝ノルマ：セラピストごとに、その月の出勤日数に応じた露出の必要回数と実績を媒体ごとに並べる。
 * マスをタップすると実績の中身を見て、その場で記録できる。決まり（段階・新人の上乗せ）は店長・オーナーが変えられる。
 */
export function PromotionQuotaBoard({ storeId }: { storeId: string | null }) {
  const today = currentBusinessDate();
  const [month, setMonth] = useState(() => monthOf(today));
  const [showIdle, setShowIdle] = useState(false);
  const [dialog, setDialog] = useState<ExposureDialogTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { rows, config, configSaved, plans, loading, error, reload } = usePromotionQuota(storeId, month);

  const summary = useMemo(() => summarizeQuota(rows), [rows]);
  // ノルマのない人（出勤なし）でも、記録・予定があれば出す
  const active = rows.filter((row) => row.required > 0 || Object.values(row.cells).some((cell) => cell.items.length > 0));
  const visible = showIdle ? rows : active;
  const idleCount = rows.length - active.length;

  // 遅れているもの（今日までに終わっているべき回数に足りない）を、足りない数の多い順に
  const behindList = useMemo(() => rows
    .flatMap((row) => row.behind.map((channel) => ({ row, channel, cell: row.cells[channel] })))
    .map((item) => ({ ...item, gap: item.cell.expected - item.cell.done }))
    .sort((a, b) => b.gap - a.gap || b.row.shiftDays - a.row.shiftDays)
    .slice(0, 10), [rows]);

  const openCell = (row: QuotaRow, channel: QuotaChannelKey) => setDialog({ castId: row.castId, channel });
  const isCurrentMonth = month === monthOf(today);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth((value) => addMonths(value, -1))} aria-label="前の月">
            <ChevronLeft size={16} />
          </Button>
          <span className="min-w-[96px] text-center text-sm font-bold">{monthLabel(month)}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth((value) => addMonths(value, 1))} aria-label="次の月">
            <ChevronRight size={16} />
          </Button>
        </div>
        {!isCurrentMonth && (
          <Button variant="ghost" size="sm" onClick={() => setMonth(monthOf(today))}>今月へ</Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setDialog({ castId: null, channel: null })} disabled={loading || rows.length === 0}>
            <Plus size={15} className="mr-1" />露出を記録
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={15} className="mr-1" />決まり
          </Button>
          <Button size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
            <RefreshCw size={14} className={cn("mr-1", loading && "animate-spin")} />更新
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Target size={15} />達成率</div>
          <p className="mt-1 text-2xl font-bold">{percent(summary.rate)}</p>
          <p className="text-[11px] text-muted-foreground">{summary.achieved} / {summary.required} 回</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 size={15} />達成した人</div>
          <p className="mt-1 text-2xl font-bold">{summary.completed}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {summary.therapists}人</span></p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle size={15} />遅れている人</div>
          <p className={cn("mt-1 text-2xl font-bold", summary.behind > 0 && "text-amber-600")}>{summary.behind}<span className="ml-1 text-sm font-normal text-muted-foreground">人</span></p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><UsersRound size={15} />残り</div>
          <p className="mt-1 text-2xl font-bold">{Math.max(summary.required - summary.achieved, 0)}<span className="ml-1 text-sm font-normal text-muted-foreground">回</span></p>
        </div>
      </div>

      <details className="rounded-xl border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-bold">
          ノルマの決まり{configSaved ? "" : "（既定）"}：その月の出勤日数で、媒体ごとの最低回数が決まります
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-2 text-left font-medium">出勤日数</th>
                {QUOTA_CHANNELS.map((channel) => (
                  <th key={channel.key} className="px-1.5 py-1.5 text-center font-medium whitespace-nowrap">{channel.short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.tiers.map((tier, index) => (
                <tr key={tier.minDays} className="border-t">
                  <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{tierLabel(config, index)}</td>
                  {QUOTA_CHANNELS.map((channel) => (
                    <td key={channel.key} className="px-1.5 py-1.5 text-center tabular-nums">
                      {channel.newcomerOnly ? <span className="text-muted-foreground/50">—</span> : tier.targets[channel.key]}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t bg-primary/5">
                <td className="py-1.5 pr-2 font-medium whitespace-nowrap">新人月に＋</td>
                {QUOTA_CHANNELS.map((channel) => (
                  <td key={channel.key} className="px-1.5 py-1.5 text-center tabular-nums">
                    {config.newcomerBonus[channel.key] ? `+${config.newcomerBonus[channel.key]}` : "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>出勤日数は、その月に登録されているシフト（取り消し・却下を除く）の日数です。シフトが増えると段階も上がります。</li>
          <li>新人は入店から{config.newcomerDays}日。上乗せ（HPトップバナーなど）は、新人の期間がいちばん長く入っている月に1回だけ付きます。</li>
          <li>実績は「露出を記録」した分に加えて、企画の完了した投稿・HPニュースに名前が出た記事・X運用表で投稿した紹介や口コミ（出勤・空き枠のまとめは除く）を自動で数えます。</li>
          <li>オレンジのマスは、今日までに終わっているべき回数（月の日割り）に足りていないものです。</li>
        </ul>
      </details>

      {!loading && !error && behindList.length > 0 && isCurrentMonth && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
            <AlertTriangle size={16} />今日までに足りていない露出
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {behindList.map(({ row, channel, cell, gap }) => (
              <button
                key={`${row.castId}-${channel}`}
                type="button"
                onClick={() => openCell(row, channel)}
                className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs hover:bg-amber-100"
              >
                <span className="font-semibold">{row.name}</span>
                <span className="mx-1 text-muted-foreground">{QUOTA_CHANNELS.find((item) => item.key === channel)?.short}</span>
                <span className="tabular-nums">{cell.done}/{cell.required}</span>
                <span className="ml-1 text-amber-700">あと{gap}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="font-semibold text-destructive">読み込みに失敗しました</p>
          <p className="mt-1 break-all text-xs text-muted-foreground">{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => void reload()}>再試行</Button>
        </div>
      ) : (
        <>
          {/* スマホ：セラピストごとのカード */}
          <div className="space-y-3 md:hidden">
            {loading ? (
              <div className="rounded-xl border bg-card py-12 text-center"><Loader2 className="inline-block animate-spin text-primary" /></div>
            ) : visible.length === 0 ? (
              <div className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">この月に出勤のあるセラピストはいません</div>
            ) : visible.map((row) => (
              <div key={row.castId} className="rounded-xl border bg-card p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1"><TherapistLabel row={row} /></div>
                  <RateMeter row={row} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {QUOTA_CHANNELS.map((channel) => (
                    <div key={channel.key} className="text-center">
                      <p className="mb-0.5 text-[10px] text-muted-foreground">{channel.short}</p>
                      <CellButton row={row} channel={channel.key} onOpen={openCell} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* パソコン：表 */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left">セラピスト</th>
                  {QUOTA_CHANNELS.map((channel) => (
                    <th key={channel.key} className="px-1.5 py-2 text-center font-medium whitespace-nowrap">
                      {channel.short}
                      {channel.newcomerOnly && <div className="text-[10px] font-normal">新人のみ</div>}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center font-medium">達成</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={QUOTA_CHANNELS.length + 2} className="py-12 text-center"><Loader2 className="inline-block animate-spin text-primary" /></td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={QUOTA_CHANNELS.length + 2} className="py-10 text-center text-muted-foreground">この月に出勤のあるセラピストはいません</td></tr>
                ) : visible.map((row) => (
                  <tr key={row.castId} className="border-t">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2">
                      <div className="min-w-[150px]"><TherapistLabel row={row} /></div>
                    </td>
                    {QUOTA_CHANNELS.map((channel) => (
                      <td key={channel.key} className="px-1 py-1.5 text-center">
                        <CellButton row={row} channel={channel.key} onOpen={openCell} />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center"><RateMeter row={row} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {idleCount > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showIdle} onCheckedChange={setShowIdle} />
          この月に出勤のないセラピスト（{idleCount}人）も表示
        </label>
      )}

      <PromotionExposureDialog
        storeId={storeId}
        month={month}
        target={dialog}
        rows={rows}
        plans={plans}
        onClose={() => setDialog(null)}
        onChanged={() => void reload()}
      />
      <PromotionQuotaSettingsDialog
        storeId={storeId}
        open={settingsOpen}
        config={config}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => void reload()}
      />
    </div>
  );
}

function TherapistLabel({ row }: { row: QuotaRow }) {
  return (
    <>
      <p className="font-semibold">{row.name}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        <span>出勤{row.shiftDays}日</span>
        {row.tierIndex !== null && <span>・{row.tierLabel}</span>}
        {row.newcomer && (
          <Badge className={cn(
            "h-5 px-1.5 text-[10px]",
            row.newcomer.bonusThisMonth ? "bg-rose-100 text-rose-700 hover:bg-rose-100" : "bg-muted text-muted-foreground hover:bg-muted",
          )}>
            新人〜{shortDate(row.newcomer.until)}{row.newcomer.bonusThisMonth ? "（上乗せ月）" : ""}
          </Badge>
        )}
      </div>
    </>
  );
}

function CellButton({
  row,
  channel,
  onOpen,
}: {
  row: QuotaRow;
  channel: QuotaChannelKey;
  onOpen: (row: QuotaRow, channel: QuotaChannelKey) => void;
}) {
  const cell = row.cells[channel];
  const label = QUOTA_CHANNELS.find((item) => item.key === channel)?.label ?? channel;
  return (
    <button
      type="button"
      onClick={() => onOpen(row, channel)}
      className={cn(
        "inline-flex min-h-[44px] w-full min-w-[64px] flex-col items-center justify-center rounded-lg border border-transparent px-1 py-1 transition-colors hover:border-primary",
        cellTone(cell),
      )}
      aria-label={`${row.name} ${label}：${cell.done}/${cell.required}`}
    >
      {cell.required === 0 && cell.done === 0 ? (
        <span className="text-xs">—</span>
      ) : (
        <span className="text-sm font-bold tabular-nums">
          {cell.done}
          {cell.required > 0 && <span className="text-xs font-normal">/{cell.required}</span>}
        </span>
      )}
      {cell.planned > 0 && <span className="text-[10px] text-sky-700">予定+{cell.planned}</span>}
    </button>
  );
}

function RateMeter({ row }: { row: QuotaRow }) {
  if (row.rate === null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="mx-auto w-16 text-center">
      <p className={cn(
        "text-sm font-bold tabular-nums",
        row.status === "done" ? "text-emerald-700" : row.status === "behind" ? "text-amber-700" : "",
      )}>
        {percent(row.rate)}
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", row.status === "done" ? "bg-emerald-500" : row.status === "behind" ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${Math.round(row.rate * 100)}%` }}
        />
      </div>
    </div>
  );
}
