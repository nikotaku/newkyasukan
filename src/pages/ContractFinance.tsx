import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { allocationSchedule, shiftMonth } from "@/lib/contractProfit";

type Mode = "investments" | "loans" | "distributions";
type Item = {
  name: string;
  amount: number | string;
  eligible: number | string | null;
  book_amount: number | string | null;
  expense_id: string | null;
  receipt: string;
};
type Investment = {
  id: string;
  name: string;
  room_id: string;
  months: number;
  start_month: string | null;
  funding: string;
  notes: string;
  archived: boolean;
  items: Item[];
};
type Terms = {
  amount: number;
  received: string | null;
  rate: number;
  capital: number;
  installments: number;
};
type Payment = {
  expense_id: string;
  amount: number;
  interest: number;
  is_paid: boolean;
  paid_on: string | null;
  due: string;
};
type Loan = {
  id: string;
  name: string;
  lender: string;
  borrowed: string;
  principal: number;
  starts: string;
  monthly: number;
  payments: Payment[];
};
type Expense = {
  id: string;
  name: string;
  date: string;
  amount: number;
  paid: boolean;
};
const labels = {
  sales: "月間総売上",
  accountingExpenses: "会計上の事業経費",
  accountingProfit: "会計上の利益",
  ordinary: "通常事業経費",
  allocation: "初期投資の費用配分",
  principal: "事業借入の元本返済",
  profit: "契約上の分配対象利益",
  operator: "事業運営者の取り分",
  investor: "出資者の取り分",
  capital: "出資元本返還額",
  total: "出資者への振込合計",
};
type Figures = Record<keyof typeof labels, number> & {
  due: string | null;
  rate: number;
  payroll: number;
  ledger: number;
};
type Report = {
  revision: number;
  figures: Figures;
  reason: string;
  recorded_at: string;
};
type Data = {
  rooms: { id: string; name: string }[];
  investments: Investment[];
  loans: Loan[];
  terms: Terms;
  figures: Figures;
  expenses: Expense[];
  history: Report[];
  months: string[];
  paid: string | null;
};
type Payload = Record<string, unknown>;
type Save = (action: string, data: Payload) => Promise<boolean>;
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
const yen = (n: number) => n.toLocaleString("ja-JP") + "円";
const emptyItem = (): Item => ({
  name: "",
  amount: "",
  eligible: "",
  book_amount: "",
  expense_id: null,
  receipt: "",
});
const values = (ev: FormEvent<HTMLFormElement>) => {
  ev.preventDefault();
  return Object.fromEntries(new FormData(ev.currentTarget)) as Record<
    string,
    string
  >;
};
async function request(action: string, p: Payload) {
  const { data, error } = await supabase.rpc(
    "enka_contract_finance" as never,
    { action, p } as never,
  );
  if (error) throw new Error(error.message);
  return data as unknown as Data;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      {label}
      {children}
    </label>
  );
}
function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}
function Box({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">{children}</CardContent>
    </Card>
  );
}
function NumberField({
  label,
  name,
  value,
  min = 0,
}: {
  label: string;
  name: string;
  value?: number;
  min?: number;
}) {
  return (
    <Field label={label}>
      <Input
        name={name}
        type="number"
        required
        min={min}
        defaultValue={value}
      />
    </Field>
  );
}
const selectStyle = "w-full rounded-md border bg-background p-2 text-sm";
function ExpenseOptions({
  expenses,
  id,
}: {
  expenses: Expense[];
  id?: string | null;
}) {
  return (
    <>
      <option value="">選択してください</option>
      {id && !expenses.some((e) => e.id === id) && (
        <option value={id}>関連付け済みの経費</option>
      )}
      {expenses.map((e) => (
        <option key={e.id} value={e.id}>
          {e.date} {e.name} {yen(e.amount)}（{e.paid ? "支払済" : "予定"}）
        </option>
      ))}
    </>
  );
}
function InvestmentForm({
  row,
  data,
  save,
  done,
}: {
  row?: Investment;
  data: Data;
  save: Save;
  done: () => void;
}) {
  const [items, setItems] = useState<Item[]>(row?.items ?? [emptyItem()]);
  const edit = (i: number, v: Partial<Item>) =>
    setItems(items.map((x, j) => (j === i ? { ...x, ...v } : x)));
  async function submit(ev: FormEvent<HTMLFormElement>) {
    const v = values(ev);
    if (
      await save("investment", {
        ...v,
        id: row?.id,
        items,
        start_month: v.start_month ? v.start_month + "-01" : null,
      })
    )
      done();
  }
  return (
    <Box>
      <form className="space-y-4" onSubmit={submit}>
        <FormGrid>
          <Field label="投資名称">
            <Input name="name" defaultValue={row?.name} required />
          </Field>
          <Field label="対象ルーム">
            <select
              name="room_id"
              className={selectStyle}
              defaultValue={row?.room_id}
            >
              {data.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <NumberField
            name="months"
            label="費用配分期間（月）"
            min={1}
            value={row?.months ?? 24}
          />
          <Field label="計上開始月">
            <Input
              type="month"
              name="start_month"
              defaultValue={row?.start_month?.slice(0, 7)}
            />
          </Field>
          <Field label="資金調達元">
            <Input name="funding" defaultValue={row?.funding} />
          </Field>
          <Field label="備考">
            <Input name="notes" defaultValue={row?.notes} />
          </Field>
        </FormGrid>
        {items.map((item, i) => (
          <fieldset key={i} className="rounded-md border p-3">
            <legend>内訳 {i + 1}</legend>
            <FormGrid>
              <Field label="費目">
                <Input
                  required
                  value={item.name}
                  onChange={(e) => edit(i, { name: e.target.value })}
                />
              </Field>
              <Field label="既存の経費（選択月）">
                <select
                  className={selectStyle}
                  value={item.expense_id ?? ""}
                  onChange={(e) => {
                    const ex = data.expenses.find(
                      (x) => x.id === e.target.value,
                    );
                    edit(i, {
                      expense_id: ex?.id ?? null,
                      ...(ex ? { amount: ex.amount } : {}),
                    });
                  }}
                >
                  <ExpenseOptions
                    expenses={data.expenses}
                    id={item.expense_id}
                  />
                </select>
              </Field>
              <Field label="購入額（円）">
                <Input
                  type="number"
                  required
                  min={0}
                  readOnly={!!item.expense_id}
                  value={item.amount}
                  onChange={(e) => edit(i, { amount: e.target.value })}
                />
              </Field>
              <Field label="契約配分対象額（敷金等を除く・未確認は空欄）">
                <Input
                  type="number"
                  min={0}
                  max={item.amount}
                  value={item.eligible ?? ""}
                  onChange={(e) => edit(i, { eligible: e.target.value })}
                />
              </Field>
              <Field label="購入月に会計費用とする額（経費に連携した場合）">
                <Input
                  type="number"
                  min={0}
                  max={item.amount}
                  value={item.book_amount ?? ""}
                  onChange={(e) => edit(i, { book_amount: e.target.value })}
                />
              </Field>
              <Field label="証憑・領収書の保存先URL">
                <Input
                  type="url"
                  value={item.receipt}
                  onChange={(e) => edit(i, { receipt: e.target.value })}
                />
              </Field>
            </FormGrid>
            {items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setItems(items.filter((_, j) => j !== i))}
              >
                内訳を削除
              </Button>
            )}
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setItems([...items, emptyItem()])}
          >
            内訳を追加
          </Button>
          <Button>保存</Button>
          <Button type="button" variant="ghost" onClick={done}>
            閉じる
          </Button>
        </div>
      </form>
    </Box>
  );
}
function Investments({
  data,
  month,
  save,
}: {
  data: Data;
  month: string;
  save: Save;
}) {
  const [edit, setEdit] = useState<string | null>(null),
    [archive, setArchive] = useState(false);
  return (
    <>
      <div className="flex gap-2">
        <Button onClick={() => setEdit("new")}>投資を登録</Button>
        <Button variant="outline" onClick={() => setArchive(!archive)}>
          {archive ? "管理中を表示" : "アーカイブを表示"}
        </Button>
      </div>
      {edit && (
        <InvestmentForm
          key={edit}
          data={data}
          row={data.investments.find((x) => x.id === edit)}
          save={save}
          done={() => setEdit(null)}
        />
      )}
      {data.investments
        .filter((x) => x.archived === archive)
        .map((x) => {
          const total = x.items.reduce((s, i) => s + Number(i.amount), 0),
            known = x.items.every((i) => i.eligible !== null);
          const base = x.items.reduce((s, i) => s + Number(i.eligible), 0),
            plan = allocationSchedule(
              base,
              x.months,
              known ? (x.start_month?.slice(0, 7) ?? null) : null,
            );
          const elapsed = plan.filter((v) => v.month <= month),
            allocated = elapsed.reduce((s, i) => s + i.amount, 0);
          return (
            <Box key={x.id}>
              <h2 className="text-lg font-semibold">{x.name}</h2>
              <p>
                {data.rooms.find((r) => r.id === x.room_id)?.name} ·{" "}
                {elapsed.length === x.months
                  ? "完了"
                  : elapsed.length
                    ? "計上中"
                    : "未開始"}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries({
                  投資総額: yen(total),
                  月間控除額: yen(
                    plan.find((v) => v.month === month)?.amount ?? 0,
                  ),
                  未控除残高: known ? yen(base - allocated) : "対象額未確定",
                  残り月数: x.months - elapsed.length + "か月",
                }).map(([k, v]) => (
                  <div key={k} className="rounded-md bg-muted p-3">
                    <small>{k}</small>
                    <p className="font-semibold">{v}</p>
                  </div>
                ))}
              </div>
              <progress
                className="w-full"
                value={elapsed.length}
                max={x.months}
              />
              <p className="text-sm">
                累計控除 {yen(allocated)} ／{" "}
                {plan.length
                  ? plan[0].month + " 〜 " + plan[plan.length - 1]?.month
                  : "計上期間未確定"}
              </p>
              <details>
                <summary>内訳・資金調達元・証憑</summary>
                <p>
                  {x.funding} {x.notes}
                </p>
                {x.items.map((i, j) => (
                  <p key={j}>
                    {i.name}　{yen(Number(i.amount))}（対象{" "}
                    {i.eligible == null ? "未確認" : yen(Number(i.eligible))}）{" "}
                    {i.receipt && /^https?:\/\//i.test(i.receipt) && (
                      <a
                        className="underline"
                        href={i.receipt}
                        rel="noreferrer"
                        target="_blank"
                      >
                        証憑
                      </a>
                    )}
                  </p>
                ))}
              </details>
              <Button variant="outline" onClick={() => setEdit(x.id)}>
                編集
              </Button>{" "}
              <Button
                variant="ghost"
                onClick={() =>
                  save("archive", { id: x.id, archived: !x.archived })
                }
              >
                {x.archived ? "復元" : "アーカイブ"}
              </Button>
            </Box>
          );
        })}
    </>
  );
}
function Loans({ data, save }: { data: Data; save: Save }) {
  const [form, setForm] = useState(false),
    [target, setTarget] = useState(""),
    [existing, setExisting] = useState("");
  return (
    <>
      <Button onClick={() => setForm(!form)}>借入を登録</Button>
      {form && (
        <Box>
          <form
            className="space-y-3"
            onSubmit={async (ev) => {
              if (await save("loan", values(ev))) setForm(false);
            }}
          >
            <FormGrid>
              {(
                [
                  ["name", "借入名称", "text"],
                  ["lender", "借入先", "text"],
                  ["borrowed", "借入日", "date"],
                  ["starts", "返済開始日", "date"],
                ] as const
              ).map(([name, label, type]) => (
                <Field key={name} label={label}>
                  <Input name={name} type={type} required />
                </Field>
              ))}
              <NumberField label="借入総額（円）" name="principal" min={1} />
              <NumberField
                label="毎月の予定元本（円）"
                name="monthly"
                min={1}
              />
            </FormGrid>
            <Button>保存</Button>
          </form>
        </Box>
      )}
      {data.loans.length === 0 && <p>登録された事業借入はありません。</p>}
      {data.loans.map((l) => {
        const paid = l.payments.filter((p) => p.is_paid && p.paid_on),
          repaid = paid.reduce((s, p) => s + p.amount - p.interest, 0),
          balance = l.principal - repaid;
        const pending = l.payments.filter((p) => !p.is_paid || !p.paid_on);
        const next =
          pending[0]?.due ??
          format(
            addMonths(
              new Date(l.starts + "T12:00:00"),
              Math.floor(repaid / l.monthly),
            ),
            "yyyy-MM-dd",
          );
        return (
          <Box key={l.id}>
            <h2 className="text-lg font-semibold">
              {l.name} · {balance ? "返済中" : "完済"}
            </h2>
            <p>
              {l.lender} ／ 借入日 {l.borrowed} ／ {yen(l.principal)}
            </p>
            <p>
              返済済元本 {yen(repaid)}　残高 {yen(balance)}
            </p>
            <p>
              毎月予定 {yen(l.monthly)}　次回 {balance ? next : "—"}
            </p>
            {l.payments.map((p) => (
              <p className="border-t pt-2 text-sm" key={p.expense_id}>
                {p.is_paid && p.paid_on ? p.paid_on + " 実績" : p.due + " 予定"}
                　元本 {yen(p.amount - p.interest)} ／ 利息 {yen(p.interest)}{" "}
                {(!p.is_paid || !p.paid_on) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTarget(l.id);
                      setExisting(p.expense_id);
                    }}
                  >
                    実績を登録
                  </Button>
                )}
              </p>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                setTarget(target === l.id ? "" : l.id);
                setExisting("");
              }}
            >
              返済予定・実績を登録
            </Button>
            {target === l.id && (
              <form
                className="space-y-3"
                onSubmit={async (ev) => {
                  const v = values(ev);
                  if (
                    await save("repayment", {
                      ...v,
                      id: l.id,
                      expense_id: existing,
                    })
                  ) {
                    setTarget("");
                    setExisting("");
                  }
                }}
              >
                <FormGrid>
                  <Field label="既存支払いとの連携（選択月）">
                    <select
                      className={selectStyle}
                      value={existing}
                      onChange={(e) => setExisting(e.target.value)}
                    >
                      <ExpenseOptions expenses={data.expenses} id={existing} />
                    </select>
                  </Field>
                  {!existing && (
                    <>
                      <Field label="返済予定日">
                        <Input
                          name="due"
                          type="date"
                          defaultValue={next}
                          required
                        />
                      </Field>
                      <NumberField
                        label="総支払額（元本＋利息）"
                        name="amount"
                        value={Math.min(balance, l.monthly)}
                      />
                    </>
                  )}
                  <NumberField
                    key={existing}
                    label="うち利息（円）"
                    name="interest"
                    value={
                      l.payments.find((p) => p.expense_id === existing)
                        ?.interest ?? 0
                    }
                  />
                  <Field label="実際の返済日（予定は空欄）">
                    <Input name="paid_on" type="date" max={today()} />
                  </Field>
                </FormGrid>
                <Button>返済を保存</Button>
              </form>
            )}
          </Box>
        );
      })}
    </>
  );
}
function reportLines(
  month: string,
  f: Figures,
  version: string,
  status: string,
) {
  const pairs = Object.entries(labels).map(([key, label]) => [
    label,
    yen(f[key as keyof typeof labels]),
  ]);
  return [
    ["対象月", month],
    ["版", version],
    ...pairs,
    ["出資者分配率", f.rate / 100 + "%"],
    ["支払予定日", f.due ?? "銀行休日未確定"],
    ["支払状況", status],
  ];
}
function exportReport(month: string, rows: string[][], pdf: boolean) {
  const heading = "艶華 月次収支報告書";
  if (pdf) {
    const win = window.open("", "_blank");
    if (!win)
      throw new Error("印刷画面を開くため、ポップアップを許可してください");
    const doc = win.document;
    doc.documentElement.lang = "ja";
    doc.title = heading + " " + month;
    const style = doc.createElement("style");
    style.textContent =
      "@page{size:A4;margin:20mm}body{font:15px sans-serif;color:#242424;margin:35px auto;max-width:700px}h1{font-size:24px}table{border-collapse:collapse;width:100%}td{padding:8px;border-bottom:1px solid #ddd}td+td{text-align:right}";
    doc.head.append(style);
    const h = doc.createElement("h1");
    h.textContent = heading;
    doc.body.append(h);
    const table = doc.createElement("table");
    doc.body.append(table);
    for (const row of rows) {
      const tr = table.insertRow();
      for (const value of row) tr.insertCell().textContent = value;
    }
    win.focus();
    win.print();
    return;
  }
  const body =
    "# " +
    heading +
    "\n\n| 項目 | 内容 |\n| --- | ---: |\n" +
    rows.map((r) => "| " + r.join(" | ") + " |").join("\n") +
    "\n";
  const url = URL.createObjectURL(
    new Blob([body], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "艶華-月次報告-" + month + ".md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Distributions({
  data,
  save,
  month,
}: {
  data: Data;
  save: Save;
  month: string;
}) {
  const t = data.terms,
    latest = data.history[0];
  const [revision, setRevision] = useState(""),
    [editing, setEditing] = useState(false),
    [error, setError] = useState("");
  const report =
    revision === "draft"
      ? undefined
      : (data.history.find((r) => String(r.revision) === revision) ?? latest);
  const f = report?.figures ?? data.figures,
    version = report ? "確定 第" + report.revision + "版" : "試算";
  const status =
    report && report.revision !== latest?.revision
      ? "過去版"
      : data.paid
        ? "支払済 " + data.paid
        : !report
          ? "未確定"
          : f.total === 0
            ? "支払なし"
            : "未払い";
  const rows = reportLines(month, f, version, status);
  return (
    <>
      <Box>
        <h2 className="text-lg font-semibold">月次収支・利益分配</h2>
        {data.history.length > 0 && (
          <Field label="月別履歴">
            <select
              className={selectStyle}
              value={revision || String(latest.revision)}
              onChange={(e) => setRevision(e.target.value)}
            >
              {data.history.map((r) => (
                <option key={r.revision} value={r.revision}>
                  第{r.revision}版　{r.recorded_at.slice(0, 10)} {r.reason}
                </option>
              ))}
              <option value="draft">現在の元データで再計算</option>
            </select>
          </Field>
        )}
        <p>
          {version} ／ {status}
        </p>
        <dl>
          {rows.slice(2, -3).map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between gap-3 border-b py-2"
            >
              <dt>{k}</dt>
              <dd className="font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p>振込予定日　{f.due ?? "銀行休日未確定"}</p>
        {!f.due && (
          <Field label="内閣府の国民の祝日CSVで振込年の休日を登録">
            <a
              href="https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv"
              className="underline"
            >
              内閣府のCSV
            </a>
            <Input
              type="file"
              accept=".csv"
              onChange={async (ev) => {
                const file = ev.target.files?.[0];
                if (!file) return;
                const year = Number(shiftMonth(month, 1).slice(0, 4));
                const csv = new TextDecoder("shift_jis").decode(
                  await file.arrayBuffer(),
                );
                const dates = csv.split(/\r?\n/).flatMap((line) => {
                  const d = line.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}),/);
                  return d && Number(d[1]) === year
                    ? [
                        d[1] +
                          "-" +
                          d[2].padStart(2, "0") +
                          "-" +
                          d[3].padStart(2, "0"),
                      ]
                    : [];
                });
                await save("calendar", { year, dates });
              }}
            />
          </Field>
        )}
        <div className="flex flex-wrap gap-2">
          {[true, false].map((pdf) => (
            <Button
              key={String(pdf)}
              variant="outline"
              onClick={() => {
                try {
                  exportReport(month, rows, pdf);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {pdf ? "PDF保存・印刷" : "Markdown出力"}
            </Button>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
      </Box>
      <Box>
        <h2 className="font-semibold">月次確定・振込記録</h2>
        {!data.paid && (!latest || revision === "draft") && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              const v = values(e);
              if (
                await save("close", {
                  reason: v.reason,
                  reconciled: true,
                  expected: data.figures,
                })
              )
                setRevision("");
            }}
          >
            <p className="text-sm">
              日別精算の給与 {yen(data.figures.payroll)} ／ 経費台帳{" "}
              {yen(data.figures.ledger)}
              。旧店舗に登録した艶華の経費は、旧店舗の支払い管理で対象に含めてください。
            </p>
            <label className="flex gap-2">
              <input type="checkbox" required />
              売上・給与・固定費・投資・返済を照合済み
            </label>
            {latest && (
              <Field label="修正理由">
                <Input name="reason" required />
              </Field>
            )}
            <Button disabled={!t.received || month >= today().slice(0, 7)}>
              {latest ? "修正版を確定" : "月次を確定"}
            </Button>
          </form>
        )}
        {latest && !data.paid && latest.figures.total > 0 && (
          <form
            className="mt-4 flex items-end gap-2"
            onSubmit={(e) => {
              const v = values(e);
              void save("pay", { ...v, revision: latest.revision });
            }}
          >
            <Field label="実際の振込日">
              <Input
                type="date"
                required
                name="paid_on"
                max={today()}
                defaultValue={today()}
              />
            </Field>
            <Button>支払完了を記録</Button>
          </form>
        )}
        {data.paid && <p>振込日 {data.paid}</p>}
      </Box>
      <Box>
        <h2 className="font-semibold">出資条件</h2>
        <p>
          出資額 {yen(t.amount)} ／ 分配率 {t.rate / 100}%
        </p>
        <p>
          元本返還 {yen(t.capital)} ／ {t.installments}回（通常{" "}
          {yen(Math.floor(t.capital / t.installments))}）
        </p>
        <p>
          受領日 {t.received ?? "未設定"} ／ 分配開始{" "}
          {t.received ? shiftMonth(t.received.slice(0, 7), 1) : "未設定"}
        </p>
        <p>
          初回元本返還{" "}
          {t.received
            ? shiftMonth(t.received.slice(0, 7), 2) +
              "-15（休業日は翌銀行営業日）"
            : "未設定"}
        </p>
        <Button variant="outline" onClick={() => setEditing(!editing)}>
          出資条件を編集
        </Button>
        {editing && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              const v = values(e);
              if (
                await save("terms", {
                  ...v,
                  rate: Math.round(Number(v.percent) * 100),
                })
              )
                setEditing(false);
            }}
          >
            <FormGrid>
              <NumberField
                label="出資金額"
                name="amount"
                value={t.amount}
                min={1}
              />
              <Field label="出資金受領日">
                <Input
                  type="date"
                  name="received"
                  defaultValue={t.received ?? ""}
                  max={today()}
                />
              </Field>
              <Field label="分配率（%）">
                <Input
                  type="number"
                  name="percent"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={t.rate / 100}
                  required
                />
              </Field>
              <NumberField
                label="元本返還予定総額"
                name="capital"
                value={t.capital}
              />
              <NumberField
                label="返還回数"
                name="installments"
                min={1}
                value={t.installments}
              />
            </FormGrid>
            <Button>条件を保存</Button>
          </form>
        )}
      </Box>
    </>
  );
}
export default function ContractFinance({
  mode,
  userId,
}: {
  mode: Mode;
  userId: string;
}) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [message, setMessage] = useState("");
  const client = useQueryClient(),
    key = ["contract-finance", userId, month];
  const query = useQuery({
    queryKey: key,
    queryFn: () => request("read", { month: month + "-01" }),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({ action, p }: { action: string; p: Payload }) =>
      request(action, { ...p, month: month + "-01" }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["contract-finance", userId] }),
  });
  useEffect(() => setMessage(""), [month, mode]);
  const save: Save = async (action, p) => {
    try {
      await mutation.mutateAsync({ action, p });
      setMessage("保存しました");
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    }
  };
  return (
    <section className="space-y-4">
      <Field label="対象月">
        <Input
          className="w-auto max-w-xs"
          type="month"
          value={month}
          onChange={(e) => {
            if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value);
          }}
        />
      </Field>
      {query.data?.months?.length > 0 && (
        <select
          aria-label="確定済みの月"
          value=""
          className={selectStyle}
          onChange={(e) => setMonth(e.target.value.slice(0, 7))}
        >
          <option value="">確定済みの月を開く</option>
          {query.data.months.map((m) => (
            <option key={m} value={m}>
              {m.slice(0, 7)}
            </option>
          ))}
        </select>
      )}
      {message && (
        <p role="status" className="rounded-md border p-3">
          {message}
        </p>
      )}
      {query.isLoading && <p>読み込み中…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.data && (
        <fieldset
          key={month}
          disabled={mutation.isPending}
          className="min-w-0 space-y-4"
        >
          {mode === "investments" ? (
            <Investments data={query.data} month={month} save={save} />
          ) : mode === "loans" ? (
            <Loans data={query.data} save={save} />
          ) : (
            <Distributions data={query.data} month={month} save={save} />
          )}
        </fieldset>
      )}
    </section>
  );
}
