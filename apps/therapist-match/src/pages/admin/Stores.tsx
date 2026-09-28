import { AdminLayout } from "@/components/AdminLayout";
import { Select } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { yen } from "@/lib/format";
import { PLANS, type PlanKey, type StoreStatus } from "@/lib/types";

const STATUSES: StoreStatus[] = ["掲載中", "審査中", "停止"];

// 掲載前にお店を取材して確かめること。1つでも満たさないお店は載せない
const REVIEW_RULES = [
  "性的なサービスを求めていない（メンズエステの健全店だけを載せる）",
  "18歳未満・高校生を採用せず、面接で身分証を確認している",
  "60分の取り分・保証・罰金の有無を書面で出せる",
  "待機場所・寮・送迎がある場合は実物をコーチが確認",
  "掲載料以外のお金（入店人数ごと・売上連動の紹介料）を払う約束をしない",
];

export default function AdminStores() {
  const { stores, therapists, setStoreStatus } = useApp();
  const listed = stores.filter((s) => s.status === "掲載中");
  const revenue = listed.reduce((sum, s) => sum + PLANS[s.plan].fee, 0);

  const statsFor = (storeId: string) => {
    const apps = therapists.flatMap((t) => t.applications.filter((a) => a.storeId === storeId));
    return { applied: apps.length, working: apps.filter((a) => a.status === "在籍").length };
  };

  return (
    <AdminLayout
      title="掲載店舗"
      description="お店からいただくのは毎月定額の掲載料だけです。何人入店しても、セラピストがいくら稼いでも金額は変わりません。"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(PLANS) as PlanKey[]).map((key) => (
          <div key={key} className="rounded-xl border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-bold">{PLANS[key].label}</p>
              <p className="tabular font-bold text-gold">{yen(PLANS[key].fee)}/月</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{PLANS[key].note}</p>
            <p className="tabular mt-2 text-xs">掲載中 {listed.filter((s) => s.plan === key).length}店舗</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="text-muted-foreground">今月の掲載料の合計</span>
        <span className="tabular text-xl font-bold">{yen(revenue)}</span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">店舗</th>
              <th className="px-3 py-2.5 font-medium">プラン</th>
              <th className="px-3 py-2.5 text-right font-medium">60分の取り分</th>
              <th className="px-3 py-2.5 text-right font-medium">受け入れ枠</th>
              <th className="px-3 py-2.5 text-right font-medium">応募</th>
              <th className="px-3 py-2.5 text-right font-medium">在籍</th>
              <th className="px-3 py-2.5 font-medium">状態</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stores.map((store) => {
              const stats = statsFor(store.id);
              return (
                <tr key={store.id}>
                  <td className="px-3 py-3">
                    <p className="font-bold">{store.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {store.area}・{store.station}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {PLANS[store.plan].label}
                    <span className="tabular block text-muted-foreground">{yen(PLANS[store.plan].fee)}</span>
                  </td>
                  <td className="tabular px-3 py-3 text-right">{yen(store.back60)}</td>
                  <td className="tabular px-3 py-3 text-right">{store.slots}名</td>
                  <td className="tabular px-3 py-3 text-right">{stats.applied}</td>
                  <td className="tabular px-3 py-3 text-right">{stats.working}</td>
                  <td className="px-3 py-3">
                    <Select
                      id={`store-status-${store.id}`}
                      aria-label={`${store.name}の掲載状態`}
                      className="h-9 w-24 md:h-9"
                      value={store.status}
                      onChange={(e) => setStoreStatus(store.id, e.target.value as StoreStatus)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-6 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-bold">掲載審査の基準</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
          {REVIEW_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
    </AdminLayout>
  );
}
