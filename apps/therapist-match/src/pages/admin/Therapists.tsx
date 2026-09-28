import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { ChoiceChip } from "@/components/ui/chip";
import { Select } from "@/components/ui/input";
import { COACHES, LESSONS } from "@/data/seed";
import { useApp } from "@/hooks/useApp";
import { shortDate, yen } from "@/lib/format";
import { APPLICATION_STATUSES, STAGES, type ApplicationStatus, type Stage } from "@/lib/types";

export default function AdminTherapists() {
  const { therapists, stores, setStage, setCoach, setApplicationStatus } = useApp();
  const [filter, setFilter] = useState<Stage | "all">("all");
  const rows = therapists.filter((t) => filter === "all" || t.stage === filter);

  return (
    <AdminLayout
      title="登録者"
      description="段階・担当コーチ・応募先の状況をここで更新します。セラピストのマイページにもそのまま反映されます。"
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="段階で絞り込み">
        <ChoiceChip selected={filter === "all"} onClick={() => setFilter("all")} className="min-h-9 px-3 text-xs">
          すべて {therapists.length}
        </ChoiceChip>
        {STAGES.map((stage) => (
          <ChoiceChip key={stage} selected={filter === stage} onClick={() => setFilter(stage)} className="min-h-9 px-3 text-xs">
            {stage} {therapists.filter((t) => t.stage === stage).length}
          </ChoiceChip>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">登録者</th>
              <th className="px-3 py-2.5 font-medium">希望</th>
              <th className="px-3 py-2.5 font-medium">登録日</th>
              <th className="px-3 py-2.5 font-medium">段階</th>
              <th className="px-3 py-2.5 font-medium">担当コーチ</th>
              <th className="px-3 py-2.5 font-medium">応募先</th>
              <th className="px-3 py-2.5 text-right font-medium">レッスン</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((t) => (
              <tr key={t.id} className="align-top">
                <td className="px-3 py-3">
                  <p className="font-bold">{t.nickname}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.age}歳・{t.area}・{t.experience}
                  </p>
                  {t.avoidNote && <p className="mt-1 max-w-[14rem] text-[11px] text-warn">身バレ対策：{t.avoidNote}</p>}
                </td>
                <td className="px-3 py-3 text-xs">
                  <p>{t.pace}</p>
                  <p className="tabular text-muted-foreground">目標 {yen(t.goal)}</p>
                </td>
                <td className="tabular px-3 py-3 text-xs">{shortDate(t.createdAt)}</td>
                <td className="px-3 py-3">
                  <Select id={`stage-${t.id}`} aria-label={`${t.nickname}さんの段階`} className="h-9 w-28 md:h-9" value={t.stage} onChange={(e) => setStage(t.id, e.target.value as Stage)}>
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-3">
                  <Select
                    id={`coach-${t.id}`}
                    aria-label={`${t.nickname}さんの担当コーチ`}
                    className="h-9 w-28 md:h-9"
                    value={t.coachId ?? ""}
                    onChange={(e) => setCoach(t.id, e.target.value || null)}
                  >
                    <option value="">未定</option>
                    {COACHES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-3">
                  {t.applications.length === 0 ? (
                    <span className="text-xs text-muted-foreground">なし</span>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {t.applications.map((app) => (
                        <li key={app.storeId} className="flex items-center gap-2">
                          <span className="w-32 truncate text-xs" title={stores.find((s) => s.id === app.storeId)?.name}>
                            {stores.find((s) => s.id === app.storeId)?.name ?? "—"}
                          </span>
                          <Select
                            id={`app-${t.id}-${app.storeId}`}
                            aria-label="応募の状況"
                            className="h-8 w-28 text-xs md:h-8 md:text-xs"
                            value={app.status}
                            onChange={(e) => setApplicationStatus(t.id, app.storeId, e.target.value as ApplicationStatus)}
                          >
                            {APPLICATION_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="tabular px-3 py-3 text-right text-xs">
                  {t.lessonsDone.length} / {LESSONS.length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
