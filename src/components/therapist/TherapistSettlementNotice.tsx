import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarClock, CheckCircle2, ChevronRight, Landmark, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clearanceReceiptDataUrl, fromReceiptSnapshot } from "@/lib/clearanceReceipt";
import {
  BANK_ACCOUNT_TYPES,
  maskedAccountNumber,
  normalizeBankAccount,
  settlementAnnouncement,
  settlementCashToDeposit,
  SHORTAGE_METHOD_LABELS,
  type BankAccountInput,
  type ShortageMethod,
} from "@/lib/settlementApproval";
import {
  chooseShortageMethod,
  markSettlementSeen,
  saveBankAccount,
  settlementNeedsAttention,
  useTherapistSettlements,
  type TherapistBankAccount,
  type TherapistSettlement,
} from "@/lib/therapistSettlement";

// マイページの「精算が承認されました」。以前は清算明細の画像をLINEで送っていた代わりに、
// 承認された明細をここで見られる。現金預かりが給与に足りない（不足分がある）ときは、
// 「振込」か「次回出勤日に相殺」を選んでもらい、振込なら振込先を入れてもらう。

const yen = (value: number) => `¥${Math.round(value).toLocaleString()}`;
const dayLabel = (date: string) => format(parseISO(date), "M月d日(E)", { locale: ja });
const errorText = (error: unknown) => (error instanceof Error ? error.message : "不明なエラー");

function cardMessage(settlement: TherapistSettlement, hasBankAccount: boolean) {
  if (settlement.shortage_amount > 0 && !settlement.shortage_settled_at) {
    if (!settlement.shortage_method) return settlementAnnouncement(settlement.shortage_amount).shortageText + "。受け取り方を選んでください";
    if (settlement.shortage_method === "transfer" && !hasBankAccount) return "振込先を入力してください";
  }
  return "明細を見る";
}

export function TherapistSettlementNotice({ token, mode = "card" }: { token: string; mode?: "card" | "list" }) {
  const { data, reload } = useTherapistSettlements(token);
  const [openId, setOpenId] = useState<string | null>(null);

  // スマホ通知（精算が承認されました）から ?settlement=<id> で開いたとき
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedId = useRef(searchParams.get("settlement"));
  useEffect(() => {
    if (!data || !linkedId.current) return;
    const id = linkedId.current;
    linkedId.current = null;
    const next = new URLSearchParams(searchParams);
    next.delete("settlement");
    setSearchParams(next, { replace: true });
    if (data.settlements.some((settlement) => settlement.id === id)) setOpenId(id);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;
  const hasBankAccount = Boolean(data.bank_account);
  const opened = data.settlements.find((settlement) => settlement.id === openId) ?? null;
  const attention = data.settlements.find((settlement) => settlementNeedsAttention(settlement, hasBankAccount));

  return (
    <>
      {mode === "card" && attention && (
        <button
          type="button"
          onClick={() => setOpenId(attention.id)}
          className="w-full rounded-xl border-2 border-emerald-400/60 bg-emerald-50 px-4 py-3 text-left dark:bg-emerald-950/30"
        >
          <p className="flex items-center gap-2 text-sm font-bold">
            <CheckCircle2 size={16} className="text-emerald-600" />
            {dayLabel(attention.date)}の精算が承認されました
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {cardMessage(attention, hasBankAccount)} <ChevronRight size={12} className="inline" />
          </p>
        </button>
      )}

      {mode === "list" && data.settlements.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <p className="flex items-center gap-2 bg-muted/40 px-4 py-2.5 text-sm font-bold">
            <ReceiptText size={15} className="text-primary" />承認された精算
          </p>
          <div className="divide-y">
            {data.settlements.map((settlement) => (
              <button
                key={settlement.id}
                type="button"
                onClick={() => setOpenId(settlement.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/30"
              >
                <span>
                  <span className="block text-sm font-semibold">{dayLabel(settlement.date)}</span>
                  <span className="block text-xs text-muted-foreground">
                    お給料 {yen(settlement.salary_amount)}
                    {settlement.shortage_amount > 0 && ` · 不足分 ${yen(settlement.shortage_amount)}（${shortageStateLabel(settlement)}）`}
                  </span>
                </span>
                <ChevronRight size={15} className="shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!opened} onOpenChange={(open) => !open && setOpenId(null)}>
        {/* 開いたときに最初のボタンへフォーカスが当たると「選択済み」に見えるので当てない */}
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6" onOpenAutoFocus={(event) => event.preventDefault()}>
          {opened && (
            <SettlementDetail
              key={opened.id}
              token={token}
              settlement={opened}
              bankAccount={data.bank_account}
              onChanged={reload}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function shortageStateLabel(settlement: TherapistSettlement) {
  if (settlement.shortage_settled_at) return settlement.shortage_settled_note || "支払い済み";
  if (!settlement.shortage_method) return "受け取り方を選んでください";
  return SHORTAGE_METHOD_LABELS[settlement.shortage_method];
}

function SettlementDetail({ token, settlement, bankAccount, onChanged }: {
  token: string;
  settlement: TherapistSettlement;
  bankAccount: TherapistBankAccount | null;
  onChanged: () => Promise<void>;
}) {
  const [choosing, setChoosing] = useState<ShortageMethod | null>(null);
  const [editingAccount, setEditingAccount] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const receipt = useMemo(() => fromReceiptSnapshot(settlement.receipt), [settlement.receipt]);
  const receiptUrl = useMemo(() => (showReceipt && receipt ? clearanceReceiptDataUrl(receipt) : null), [showReceipt, receipt]);

  // 開いたら「見た」にする
  useEffect(() => {
    if (settlement.therapist_seen_at) return;
    markSettlementSeen(token, settlement.id).then(onChanged).catch(() => null);
  }, [settlement.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const shortage = settlement.shortage_amount;
  const deposit = settlementCashToDeposit(settlement.cash_sales, settlement.salary_amount);
  const unsettled = shortage > 0 && !settlement.shortage_settled_at;

  const choose = async (method: ShortageMethod) => {
    setChoosing(method);
    try {
      await chooseShortageMethod(token, settlement.id, method);
      await onChanged();
      toast.success(method === "transfer" ? "振込にしました" : "次回出勤日に相殺にしました");
      if (method === "transfer" && !bankAccount) setEditingAccount(true);
    } catch (error) {
      toast.error(`保存できませんでした：${errorText(error)}`);
    } finally {
      setChoosing(null);
    }
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{dayLabel(settlement.date)}の精算</DialogTitle>
      </DialogHeader>

      <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
        <CheckCircle2 size={16} />
        {settlementAnnouncement(shortage).title}（{format(new Date(settlement.approved_at), "M/d HH:mm")}）
      </p>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border px-2 py-2">
          <p className="text-[10px] text-muted-foreground">お給料</p>
          <p className="text-sm font-bold tabular-nums text-primary">{yen(settlement.salary_amount)}</p>
        </div>
        <div className="rounded-lg border px-2 py-2">
          <p className="text-[10px] text-muted-foreground">現金預かり</p>
          <p className="text-sm font-bold tabular-nums">{yen(settlement.cash_sales)}</p>
        </div>
        {shortage > 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-2 dark:bg-amber-950/30">
            <p className="text-[10px] text-amber-800 dark:text-amber-300">不足分</p>
            <p className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">{yen(shortage)}</p>
          </div>
        ) : (
          <div className="rounded-lg border px-2 py-2">
            <p className="text-[10px] text-muted-foreground">投函する現金</p>
            <p className="text-sm font-bold tabular-nums">{yen(deposit)}</p>
          </div>
        )}
      </div>

      {settlement.payout_method?.trim() && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">お店から</p>
          <p className="whitespace-pre-wrap text-sm">{settlement.payout_method.trim()}</p>
        </div>
      )}

      {shortage > 0 && (
        <div className="space-y-3 rounded-lg border-2 border-amber-300/70 p-3">
          {settlement.shortage_settled_at ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={16} />
              不足分 {yen(shortage)}：{settlement.shortage_settled_note || "お支払い済み"}（{format(new Date(settlement.shortage_settled_at), "M/d")}）
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold leading-6">{settlementAnnouncement(shortage).shortageText}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["transfer", "offset"] as const).map((method) => (
                  <Button
                    key={method}
                    type="button"
                    variant={settlement.shortage_method === method ? "default" : "outline"}
                    className="h-auto flex-col gap-1 py-2.5"
                    disabled={!!choosing}
                    onClick={() => choose(method)}
                  >
                    {choosing === method
                      ? <Loader2 size={16} className="animate-spin" />
                      : method === "transfer" ? <Landmark size={16} /> : <CalendarClock size={16} />}
                    <span className="text-xs font-bold">{method === "transfer" ? "振込で受け取る" : "次回出勤日に相殺"}</span>
                  </Button>
                ))}
              </div>
              {settlement.shortage_method === "offset" && (
                <p className="text-xs text-muted-foreground">次の出勤日の精算で、お給料に {yen(shortage)} を上乗せします</p>
              )}
            </>
          )}

          {unsettled && settlement.shortage_method === "transfer" && (
            bankAccount && !editingAccount ? (
              <div className="flex items-start justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                <span>
                  <span className="block text-muted-foreground">振込先</span>
                  <span className="block font-semibold">
                    {bankAccount.bank_name} {bankAccount.branch_name} {bankAccount.account_type} {maskedAccountNumber(bankAccount.account_last4)}
                  </span>
                  <span className="block">{bankAccount.account_holder}</span>
                </span>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingAccount(true)}>変更</Button>
              </div>
            ) : editingAccount ? (
              <BankAccountForm
                token={token}
                onSaved={async () => {
                  setEditingAccount(false);
                  await onChanged();
                }}
                onCancel={bankAccount ? () => setEditingAccount(false) : undefined}
              />
            ) : (
              <Button className="w-full" onClick={() => setEditingAccount(true)}>
                <Landmark size={15} className="mr-2" />振込先入力はこちら
              </Button>
            )
          )}
        </div>
      )}

      {receipt && (
        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={() => setShowReceipt((current) => !current)}>
            <ReceiptText size={15} className="mr-2" />{showReceipt ? "明細の画像を閉じる" : "明細の画像を見る"}
          </Button>
          {receiptUrl && (
            <img src={receiptUrl} alt="清算明細" className="w-full rounded-md border" />
          )}
        </div>
      )}
    </div>
  );
}

const EMPTY_ACCOUNT: BankAccountInput = {
  bank_name: "",
  branch_name: "",
  account_type: "普通",
  account_number: "",
  account_holder: "",
};

function BankAccountForm({ token, onSaved, onCancel }: {
  token: string;
  onSaved: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState<BankAccountInput>(EMPTY_ACCOUNT);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<BankAccountInput>) => setValue((current) => ({ ...current, ...patch }));

  const submit = async () => {
    const checked = normalizeBankAccount(value);
    if ("error" in checked) {
      toast.error(checked.error);
      return;
    }
    setSaving(true);
    try {
      await saveBankAccount(token, checked.value);
      toast.success("振込先を保存しました");
      await onSaved();
    } catch (error) {
      toast.error(`保存できませんでした：${errorText(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <p className="text-sm font-bold">振込先の入力</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">銀行名</Label>
          <Input className="mt-1" value={value.bank_name} onChange={(e) => set({ bank_name: e.target.value })} placeholder="七十七銀行" />
        </div>
        <div>
          <Label className="text-xs">支店名</Label>
          <Input className="mt-1" value={value.branch_name} onChange={(e) => set({ branch_name: e.target.value })} placeholder="本店" />
        </div>
        <div>
          <Label className="text-xs">種類</Label>
          <Select value={value.account_type} onValueChange={(account_type) => set({ account_type })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BANK_ACCOUNT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">口座番号</Label>
          <Input
            className="mt-1"
            inputMode="numeric"
            autoComplete="off"
            value={value.account_number}
            onChange={(e) => set({ account_number: e.target.value })}
            placeholder="1234567"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">口座名義（カタカナ）</Label>
        <Input className="mt-1" value={value.account_holder} onChange={(e) => set({ account_holder: e.target.value })} placeholder="ヤマダ ハナコ" />
      </div>
      <p className="text-[11px] text-muted-foreground">
        ゆうちょ銀行は「振込用の店名・口座番号」を入れてください。入力した振込先はお店の管理者だけが見られます
      </p>
      <div className="flex gap-2">
        {onCancel && <Button variant="outline" onClick={onCancel} disabled={saving}>やめる</Button>}
        <Button className="flex-1" onClick={submit} disabled={saving}>
          {saving && <Loader2 size={14} className="mr-2 animate-spin" />}振込先を保存する
        </Button>
      </div>
    </div>
  );
}
