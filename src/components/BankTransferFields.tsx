import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// 振込先の共通フォームテンプレート
// 単一テキスト列（例: transfer_destination）に JSON 文字列として保存し、
// 旧データ（自由入力テキスト）も銀行名フィールドに読み込んで互換を保つ。

export interface BankTransfer {
  bank_name: string;
  branch_name: string;
  account_type: string;
  account_number: string;
  account_holder: string;
}

export const EMPTY_BANK_TRANSFER: BankTransfer = {
  bank_name: "",
  branch_name: "",
  account_type: "普通",
  account_number: "",
  account_holder: "",
};

const ACCOUNT_TYPES = ["普通", "当座", "貯蓄", "その他"];

function isEmpty(v: BankTransfer): boolean {
  return !v.bank_name && !v.branch_name && !v.account_number && !v.account_holder;
}

// フォーム値 → 保存用文字列
export function encodeBankTransfer(v: BankTransfer): string {
  if (isEmpty(v)) return "";
  return JSON.stringify(v);
}

// 保存文字列 → フォーム値（旧形式の自由入力テキストにも対応）
export function decodeBankTransfer(s: string | null | undefined): BankTransfer {
  if (!s) return { ...EMPTY_BANK_TRANSFER };
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === "object" && "bank_name" in parsed) {
      return { ...EMPTY_BANK_TRANSFER, ...parsed };
    }
  } catch {
    // JSON でない＝旧自由入力。銀行名欄に取り込む
  }
  return { ...EMPTY_BANK_TRANSFER, bank_name: s };
}

// 表示用の1行テキスト
export function formatBankTransfer(s: string | null | undefined): string {
  const v = decodeBankTransfer(s);
  if (isEmpty(v)) return "";
  const head = [v.bank_name, v.branch_name].filter(Boolean).join(" ");
  const acct = [v.account_type, v.account_number].filter(Boolean).join(" ");
  return [head, acct, v.account_holder].filter(Boolean).join(" / ");
}

interface Props {
  value: BankTransfer;
  onChange: (v: BankTransfer) => void;
}

export function BankTransferFields({ value, onChange }: Props) {
  const set = (patch: Partial<BankTransfer>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">銀行名</Label>
          <Input
            value={value.bank_name}
            onChange={(e) => set({ bank_name: e.target.value })}
            placeholder="七十七銀行"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">支店名</Label>
          <Input
            value={value.branch_name}
            onChange={(e) => set({ branch_name: e.target.value })}
            placeholder="小松島支店"
            className="mt-1"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">口座種別</Label>
          <Select value={value.account_type || "普通"} onValueChange={(v) => set({ account_type: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="text-xs">口座番号</Label>
          <Input
            value={value.account_number}
            onChange={(e) => set({ account_number: e.target.value })}
            placeholder="9072730"
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">口座名義</Label>
        <Input
          value={value.account_holder}
          onChange={(e) => set({ account_holder: e.target.value })}
          placeholder="ニッポンホーム(カ"
          className="mt-1"
        />
      </div>
    </div>
  );
}
