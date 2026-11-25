import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, PlusCircle, Eye, EyeOff, X, Trash2 } from "lucide-react";
import { ContractDocuments } from "@/components/contracts/ContractDocuments";
import { deleteFacilityContract, normalizeContractDocuments, type ContractDocument } from "@/lib/facilityContracts";
import { PREDEFINED_TAGS } from "./FacilitiesContracts";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type SectionKey = "basic" | "property" | "holder" | "payment" | "login" | "notes";

const TAG_SECTIONS: Record<string, SectionKey[]> = {
  "掲載サイト":    ["basic", "login", "notes"],
  "賃貸":          ["basic", "property", "holder", "payment", "notes"],
  "光熱費":        ["basic", "payment", "notes"],
  "Wi-Fi・通信":   ["basic", "payment", "login", "notes"],
  "取引先":        ["basic", "holder", "payment", "login", "notes"],
  "備品・消耗品":  ["basic", "payment", "notes"],
  "その他":        ["basic", "payment", "login", "notes"],
};

function getActiveSections(tags: string[]): Set<SectionKey> {
  const sections = new Set<SectionKey>(["basic", "notes"]);
  tags.forEach((tag) => {
    (TAG_SECTIONS[tag] || ["basic", "payment", "login", "notes"]).forEach((s) => sections.add(s));
  });
  return sections;
}

interface Contract {
  id: string;
  tags: string[];
  name: string;
  amount: number;
  start_date: string;
  end_date: string;
  payment_method: string;
  notes: string;
  address: string;
  mailbox_code: string;
  internet_connection: string;
  contract_holder: string;
  monthly_rent: number | null;
  common_fee: number | null;
  guarantor_name: string | null;
  guarantee_period: string | null;
  guarantee_renewal_fee: number | null;
  resident_phone: string | null;
  management_phone: string | null;
  management_company: string;
  renewal_fee: number;
  auto_lock: boolean;
  resident_manager: boolean;
  key_count: number;
  floor_plan: string;
  nominal_holder: string;
  contract_terms: string;
  contract_status: string;
  management_url: string;
  login_id: string;
  login_password: string;
  store_id: string | null;
  documents: ContractDocument[];
  contract_type: string | null;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
    {children}
  </div>
);

const BoolToggle = ({
  label,
  value,
  onChange,
}: {
  label: string;
  field: string;
  value: boolean;
  onChange: (val: boolean) => void;
}) => (
  <div className="flex items-center gap-3">
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-10 h-5 rounded-full transition-colors ${value ? "bg-primary" : "bg-muted"}`}
    >
      <div className={`w-4 h-4 rounded-full bg-white mx-0.5 transition-transform ${value ? "translate-x-5" : "translate-x-0"}`} />
    </button>
    <span className="text-sm">{label}: {value ? "有" : "無"}</span>
  </div>
);

export default function FacilitiesContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contract, setContract] = useState<Contract | null>(null);
  const [form, setForm] = useState<Partial<Contract>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && id) fetchContract();
  }, [user, id]);

  const fetchContract = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("facility_contracts")
      .select("*")
      .eq("id", id)
      .single();
    if (error) { toast.error("読み込み失敗"); navigate("/knowledge/dashboard?tab=contracts"); return; }
    const normalized = { ...data, tags: data.tags?.length ? data.tags : data.contract_type ? [data.contract_type] : [], documents: normalizeContractDocuments((data as { documents?: unknown }).documents) } as Contract;
    setContract(normalized);
    setForm(normalized);
    setLoading(false);
  };

  const set = (key: keyof Contract, val: any) => setForm((f) => ({ ...f, [key]: val }));

  const hasRentBreakdown = form.tags?.includes("賃貸") && (form.monthly_rent != null || form.common_fee != null);
  const monthlyAmount = hasRentBreakdown ? (form.monthly_rent ?? 0) + (form.common_fee ?? 0) : form.amount || 0;

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error("名称を入力してください"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("facility_contracts")
      .update({
        tags: (form.tags || []).slice(0, 1),
        contract_type: form.tags?.[0] || form.contract_type || "その他",
        name: form.name,
        amount: monthlyAmount,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        payment_method: form.payment_method || null,
        notes: form.notes || null,
        address: form.address || null,
        mailbox_code: form.mailbox_code || null,
        internet_connection: form.internet_connection || null,
        contract_holder: form.contract_holder || null,
        monthly_rent: form.monthly_rent ?? null,
        common_fee: form.common_fee ?? null,
        guarantor_name: form.guarantor_name ?? null,
        guarantee_period: form.guarantee_period ?? null,
        guarantee_renewal_fee: form.guarantee_renewal_fee ?? null,
        resident_phone: form.resident_phone ?? null,
        management_phone: form.management_phone ?? null,
        management_company: form.management_company || null,
        renewal_fee: form.renewal_fee || null,
        auto_lock: form.auto_lock ?? false,
        resident_manager: form.resident_manager ?? false,
        key_count: form.key_count || null,
        floor_plan: form.floor_plan || null,
        nominal_holder: form.nominal_holder || null,
        contract_terms: form.contract_terms || null,
        contract_status: form.contract_status || null,
        management_url: form.management_url || null,
        login_id: form.login_id || null,
        login_password: form.login_password || null,
      })
      .eq("id", id);
    setSaving(false);
    if (error) { toast.error(`保存失敗: ${error.message}`); return; }
    toast.success("保存しました");
    setContract({ ...contract!, ...form } as Contract);
  };

  const handleDelete = async () => {
    if (!id || !confirm(`「${form.name || "この契約"}」を削除しますか？付いている契約書のファイルも消えます。元に戻せません。`)) return;
    setDeleting(true);
    try {
      await deleteFacilityContract(id, form.documents || []);
      toast.success("削除しました");
      navigate("/knowledge/dashboard?tab=contracts");
    } catch (error) {
      console.error(error);
      toast.error("削除できませんでした");
      setDeleting(false);
    }
  };

  const handleAddToExpenses = async () => {
    if (!contract || monthlyAmount <= 0) {
      toast.error("金額を入力して保存してから追加してください");
      return;
    }
    setAdding(true);
    const today = new Date();
    const firstOfMonth = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
    const tags = form.tags || [];
    const category = tags.includes("賃貸") ? "rent"
      : tags.includes("光熱費") ? "utilities"
      : tags.includes("Wi-Fi・通信") ? "wifi_tel"
      : "maintenance";
    const { error } = await supabase.from("expenses").insert([{
      expense_date: firstOfMonth,
      expense_type: category,
      amount: monthlyAmount,
      description: form.name || contract.name,
      payment_method: form.payment_method || "bank_transfer",
    }]);
    setAdding(false);
    if (error) { toast.error(`追加失敗: ${error.message}`); return; }
    toast.success(`今月分の固定費（¥${monthlyAmount.toLocaleString()}）を経費に追加しました`);
  };

  const activeSections = getActiveSections(form.tags || []);
  const currentTags = form.tags || [];

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <button
              onClick={() => navigate("/knowledge/dashboard?tab=contracts")}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
            >
              <ArrowLeft size={14} />
              契約一覧に戻る
            </button>
            <h1 className="text-2xl font-bold">{loading ? "..." : (form.name || "契約詳細")}</h1>
            <div className="flex flex-wrap gap-1 mt-1">
              {currentTags.map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{tag}</span>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : (
            <div className="space-y-6">

              {/* 種類（1つだけ選ぶ。一覧のタブとタグに使う） */}
              <Card>
                <CardHeader><CardTitle className="text-base">種類</CardTitle></CardHeader>
                <CardContent>
                  <RadioGroup
                    value={currentTags[0] ?? ""}
                    onValueChange={(value) => setForm((f) => ({ ...f, tags: [value], contract_type: value }))}
                    className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                  >
                    {PREDEFINED_TAGS.map((tag) => (
                      <Label
                        key={tag}
                        htmlFor={`contract-tag-${tag}`}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-normal transition-colors ${
                          currentTags[0] === tag ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        }`}
                      >
                        <RadioGroupItem id={`contract-tag-${tag}`} value={tag} />
                        {tag}
                      </Label>
                    ))}
                  </RadioGroup>
                </CardContent>
              </Card>

              {/* 基本情報（常時表示） */}
              <Card>
                <CardHeader><CardTitle className="text-base">基本情報</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <Field label="名称">
                    <Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} />
                  </Field>
                  <Field label="契約状況">
                    <Select value={form.contract_status || ""} onValueChange={(v) => set("contract_status", v)}>
                      <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="契約中">契約中</SelectItem>
                        <SelectItem value="解約済み">解約済み</SelectItem>
                        <SelectItem value="交渉中">交渉中</SelectItem>
                        <SelectItem value="無料掲載">無料掲載</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="契約開始日">
                      <Input type="date" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} />
                    </Field>
                    <Field label="契約終了日">
                      <Input type="date" value={form.end_date || ""} onChange={(e) => set("end_date", e.target.value)} />
                    </Field>
                  </div>
                </CardContent>
              </Card>

              {/* 物件情報（賃貸タグ） */}
              {activeSections.has("property") && (
                <Card>
                  <CardHeader><CardTitle className="text-base">物件情報</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <Field label="住所">
                      <Textarea value={form.address || ""} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="〒xxx-xxxx 都道府県市区町村..." />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="間取り">
                        <Input value={form.floor_plan || ""} onChange={(e) => set("floor_plan", e.target.value)} placeholder="1K, 2LDK..." />
                      </Field>
                      <Field label="鍵の本数">
                        <Input type="number" min="0" value={form.key_count || ""} onChange={(e) => set("key_count", Number(e.target.value))} />
                      </Field>
                    </div>
                    <Field label="郵便ポスト暗証番号">
                      <Input value={form.mailbox_code || ""} onChange={(e) => set("mailbox_code", e.target.value)} placeholder="例: 右へ2回2、左は1回8" />
                    </Field>
                    <div className="flex gap-6">
                      <BoolToggle label="オートロック" field="auto_lock" value={!!form.auto_lock} onChange={(v) => set("auto_lock", v)} />
                      <BoolToggle label="管理人常駐" field="resident_manager" value={!!form.resident_manager} onChange={(v) => set("resident_manager", v)} />
                    </div>
                    <Field label="ネット回線">
                      <Select value={form.internet_connection || ""} onValueChange={(v) => set("internet_connection", v)}>
                        <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="契約あり">契約あり</SelectItem>
                          <SelectItem value="備え付け">備え付け</SelectItem>
                          <SelectItem value="なし">なし</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </CardContent>
                </Card>
              )}

              {activeSections.has("property") && (
                <Card>
                  <CardHeader><CardTitle className="text-base">支払い項目</CardTitle></CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="monthly_rent">月額賃料（円）</Label>
                      <Input id="monthly_rent" type="number" min="0" step="1" value={form.monthly_rent ?? ""} onChange={(e) => set("monthly_rent", e.target.value === "" ? null : Number(e.target.value))} />
                    </div>
                    <div>
                      <Label htmlFor="common_fee">管理費/共益費（円）</Label>
                      <Input id="common_fee" type="number" min="0" step="1" value={form.common_fee ?? ""} onChange={(e) => set("common_fee", e.target.value === "" ? null : Number(e.target.value))} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeSections.has("property") && (
                <Card>
                  <CardHeader><CardTitle className="text-base">保証会社</CardTitle></CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="guarantor_name">保証会社名</Label>
                      <Input id="guarantor_name" type="text" value={form.guarantor_name ?? ""} onChange={(e) => set("guarantor_name", e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="guarantee_period">保証期間</Label>
                      <Input id="guarantee_period" type="text" value={form.guarantee_period ?? ""} onChange={(e) => set("guarantee_period", e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="guarantee_renewal_fee">更新保証料（円）</Label>
                      <Input id="guarantee_renewal_fee" type="number" min="0" step="1" value={form.guarantee_renewal_fee ?? ""} onChange={(e) => set("guarantee_renewal_fee", e.target.value === "" ? null : Number(e.target.value))} />
                    </div>
                    <div>
                      <Label htmlFor="resident_phone">入居者専用ダイヤル</Label>
                      <Input id="resident_phone" type="tel" value={form.resident_phone ?? ""} onChange={(e) => set("resident_phone", e.target.value)} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeSections.has("property") && (
                <Card>
                  <CardHeader><CardTitle className="text-base">管理会社</CardTitle></CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="management_company">管理会社名</Label>
                      <Input id="management_company" type="text" value={form.management_company ?? ""} onChange={(e) => set("management_company", e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="management_phone">管理会社電話番号</Label>
                      <Input id="management_phone" type="tel" value={form.management_phone ?? ""} onChange={(e) => set("management_phone", e.target.value)} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 契約者・管理会社（賃貸・取引先） */}
              {activeSections.has("holder") && (
                <Card>
                  <CardHeader><CardTitle className="text-base">{activeSections.has("property") ? "契約者" : "契約者・管理会社"}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="契約名義人">
                        <Input value={form.contract_holder || ""} onChange={(e) => set("contract_holder", e.target.value)} />
                      </Field>
                      <Field label="名義人">
                        <Input value={form.nominal_holder || ""} onChange={(e) => set("nominal_holder", e.target.value)} />
                      </Field>
                    </div>
                    {!activeSections.has("property") && <Field label="管理会社 / 取引先">
                      <Input value={form.management_company || ""} onChange={(e) => set("management_company", e.target.value)} />
                    </Field>}
                    {currentTags.includes("賃貸") && (
                      <Field label="更新事務手数料">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
                          <Input type="number" min="0" className="pl-7" value={form.renewal_fee || ""} onChange={(e) => set("renewal_fee", Number(e.target.value))} />
                        </div>
                      </Field>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* 支払情報 */}
              {activeSections.has("payment") && (
                <Card>
                  <CardHeader><CardTitle className="text-base">支払情報</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <Field label={hasRentBreakdown ? "月額合計（賃料＋管理費/共益費）" : "月額金額"}>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
                        <Input type="number" min="0" step="1000" className="pl-7" readOnly={!!hasRentBreakdown} value={hasRentBreakdown ? monthlyAmount : form.amount || ""} onChange={(e) => set("amount", Number(e.target.value))} placeholder="0" />
                      </div>
                    </Field>
                    <Field label="支払方法">
                      <Select value={form.payment_method || ""} onValueChange={(v) => set("payment_method", v)}>
                        <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank_transfer">銀行振込</SelectItem>
                          <SelectItem value="auto_debit">口座振替</SelectItem>
                          <SelectItem value="cash">現金</SelectItem>
                          <SelectItem value="card">クレジットカード</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </CardContent>
                </Card>
              )}

              {/* ログイン情報 */}
              {activeSections.has("login") && (
                <Card>
                  <CardHeader><CardTitle className="text-base">管理画面ログイン</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <Field label="管理画面URL">
                      <div className="flex gap-2">
                        <Input value={form.management_url || ""} onChange={(e) => set("management_url", e.target.value)} placeholder="https://..." />
                        {form.management_url && (
                          <Button variant="outline" size="sm" onClick={() => window.open(form.management_url, "_blank")}>開く</Button>
                        )}
                      </div>
                    </Field>
                    <Field label="ログインID / メールアドレス">
                      <Input value={form.login_id || ""} onChange={(e) => set("login_id", e.target.value)} />
                    </Field>
                    <Field label="パスワード">
                      <div className="relative">
                        <Input
                          type={showPw ? "text" : "password"}
                          value={form.login_password || ""}
                          onChange={(e) => set("login_password", e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw(!showPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </Field>
                  </CardContent>
                </Card>
              )}

              {/* 契約条件（常時表示） */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">契約条件</CardTitle>
                  <p className="text-xs text-muted-foreground">更新・解約予告・違約金・支払日・初期費用・禁止事項など</p>
                </CardHeader>
                <CardContent>
                  <Textarea value={form.contract_terms || ""} onChange={(e) => set("contract_terms", e.target.value)} rows={6}
                    placeholder={"例：\n2年契約・自動更新（更新料は家賃1か月分）\n解約は2か月前までに書面で通知\n毎月27日に翌月分を振込"} />
                </CardContent>
              </Card>

              {/* メモ（常時表示） */}
              <Card>
                <CardHeader><CardTitle className="text-base">メモ</CardTitle></CardHeader>
                <CardContent>
                  <Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="備考、担当者、連絡先など" />
                </CardContent>
              </Card>

              <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
                {saving ? "保存中..." : "保存"}
              </Button>

              {/* 契約書（上げた・消したらすぐ保存） */}
              {id && (
                <ContractDocuments
                  contractId={id}
                  storeId={contract?.store_id ?? null}
                  documents={form.documents || []}
                  onChange={(next) => { set("documents", next); setContract((c) => (c ? { ...c, documents: next } : c)); }}
                />
              )}

              {/* 固定費に追加 */}
              {activeSections.has("payment") && (
                <Card className="border-primary/30">
                  <CardHeader>
                    <CardTitle className="text-base">固定費に追加</CardTitle>
                    <p className="text-xs text-muted-foreground">今月分の固定費として経費入力に追加します</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg mb-4">
                      <div>
                        <div className="text-sm font-medium">{form.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(), "yyyy年M月")}分 ·{" "}
                          {form.payment_method === "bank_transfer" ? "銀行振込"
                            : form.payment_method === "auto_debit" ? "口座振替"
                            : form.payment_method === "cash" ? "現金"
                            : form.payment_method === "card" ? "カード" : "—"}
                        </div>
                      </div>
                      <div className="text-lg font-bold">
                        ¥{monthlyAmount.toLocaleString()}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full border-primary text-primary hover:bg-primary/10"
                      onClick={handleAddToExpenses}
                      disabled={adding || monthlyAmount <= 0}
                    >
                      <PlusCircle size={14} className="mr-2" />
                      {adding ? "追加中..." : "今月分の固定費に追加"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Button variant="ghost" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete} disabled={deleting}>
                <Trash2 size={14} className="mr-2" />{deleting ? "削除中..." : "この契約を削除"}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
