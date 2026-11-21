import { useState, useEffect, useMemo } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isValidEmail } from "@/lib/email";
import { copyText } from "@/lib/copyText";
import { toast } from "sonner";
import { Plus, Eye, EyeOff, ExternalLink, Pencil, Trash2, X, Check, Copy, KeyRound, Search } from "lucide-react";

// PW管理：使っているサービスのログイン情報（ID・パスワード・バックアップキー・管理画面URL・登録メール・登録電話番号）。
// 表 password_entries はログイン中のスタッフ（自分の店舗）だけが読める。ログインしていない人（公開サイトの鍵）からは読めない。

interface PasswordEntry {
  id: string;
  name: string;
  category: string;
  url: string | null;
  login_id: string | null;
  login_password: string | null;
  backup_code: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

type FormState = Omit<PasswordEntry, "id">;

const CATEGORIES = ["業務システム", "金融・決済", "メール", "SNS・媒体", "サーバー・ドメイン", "その他"];

const CATEGORY_COLOR: Record<string, string> = {
  "業務システム": "bg-blue-100 text-blue-700",
  "金融・決済": "bg-green-100 text-green-700",
  "メール": "bg-amber-100 text-amber-700",
  "SNS・媒体": "bg-purple-100 text-purple-700",
  "サーバー・ドメイン": "bg-rose-100 text-rose-700",
  "その他": "bg-muted text-muted-foreground",
};

const empty = (): FormState => ({
  name: "",
  category: "業務システム",
  url: "",
  login_id: "",
  login_password: "",
  backup_code: "",
  email: "",
  phone: "",
  notes: "",
});

// 一覧で出す項目（この順番で、空のものは出さない）。secret は ●● で隠して「表示」で見せる
const FIELDS: Array<{ key: keyof FormState; label: string; secret?: boolean; link?: boolean }> = [
  { key: "login_id", label: "ID" },
  { key: "login_password", label: "パスワード", secret: true },
  { key: "backup_code", label: "バックアップキー", secret: true },
  { key: "url", label: "管理画面URL", link: true },
  { key: "email", label: "登録メール" },
  { key: "phone", label: "登録電話番号" },
];

export default function PasswordDatabase() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(empty());
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchEntries();
  }, [user]);

  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("password_entries" as never)
      .select("*")
      .order("category")
      .order("name");
    if (error) toast.error("読み込めませんでした");
    setEntries((data || []) as unknown as PasswordEntry[]);
    setLoading(false);
  };

  const startEdit = (e: PasswordEntry) => {
    setEditingId(e.id);
    setForm({
      name: e.name,
      category: e.category,
      url: e.url || "",
      login_id: e.login_id || "",
      login_password: e.login_password || "",
      backup_code: e.backup_code || "",
      email: e.email || "",
      phone: e.phone || "",
      notes: e.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startNew = () => {
    setEditingId("new");
    setForm(empty());
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("サービス名を入力してください"); return; }
    if (form.email?.trim() && !isValidEmail(form.email)) {
      toast.error("メールアドレスの形式が正しくありません（例: example@email.jp）");
      return;
    }
    setSaving(true);
    const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
    const payload = {
      name: form.name.trim(),
      category: form.category || "その他",
      url: clean(form.url),
      login_id: clean(form.login_id),
      login_password: form.login_password || null,
      backup_code: clean(form.backup_code),
      email: clean(form.email),
      phone: clean(form.phone),
      notes: clean(form.notes),
    };
    const table = supabase.from("password_entries" as never);
    const { error } = editingId === "new"
      ? await table.insert([payload] as never)
      : await table.update(payload as never).eq("id", editingId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingId === "new" ? "追加しました" : "保存しました");
    setEditingId(null);
    fetchEntries();
  };

  const handleDelete = async (e: PasswordEntry) => {
    if (!confirm(`「${e.name}」を削除しますか？`)) return;
    const { error } = await supabase.from("password_entries" as never).delete().eq("id", e.id);
    if (error) { toast.error("削除できませんでした"); return; }
    setEntries((prev) => prev.filter((x) => x.id !== e.id));
    toast.success("削除しました");
  };

  const copy = async (text: string, label: string) => {
    if (await copyText(text)) toast.success(`${label}をコピーしました`);
    else toast.error("コピーできませんでした");
  };

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const categoryOptions = Array.from(new Set([...CATEGORIES, ...entries.map((e) => e.category)])).filter(Boolean);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.name, e.category, e.url, e.email, e.login_id, e.notes].some((v) => v?.toLowerCase().includes(q)));
  }, [entries, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, PasswordEntry[]>();
    for (const e of filtered) {
      const key = e.category || "その他";
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [filtered]);

  const secretInput = (key: "login_password" | "backup_code", label: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          type={shown[`form:${key}`] ? "text" : "password"}
          value={form[key] ?? ""}
          onChange={(e) => set(key, e.target.value)}
          className="pr-9 font-mono"
          autoComplete="off"
        />
        <button type="button" onClick={() => setShown((p) => ({ ...p, [`form:${key}`]: !p[`form:${key}`] }))}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="表示切替">
          {shown[`form:${key}`] ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-3 sm:p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">ナレッジ</p>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <KeyRound size={22} />PW管理
              </h1>
              <p className="text-xs text-muted-foreground mt-1">使っているサービスのID・パスワード・バックアップキー・管理画面URL</p>
            </div>
            <Button onClick={startNew} size="sm">
              <Plus size={14} className="mr-1" />追加
            </Button>
          </div>

          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="サービス名・メールで探す" className="pl-8" />
          </div>

          {editingId !== null && (
            <Card className="mb-6 border-primary/40">
              <CardContent className="pt-5">
                <p className="mb-3 text-sm font-bold">{editingId === "new" ? "サービスを追加" : "編集"}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">サービス名</Label>
                    <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="例: Twilio" />
                  </div>
                  <div>
                    <Label className="text-xs">カテゴリー</Label>
                    <Input list="pw-category-options" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="例: 業務システム" />
                    <datalist id="pw-category-options">
                      {categoryOptions.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div>
                    <Label className="text-xs">ID（ログインに使うID・メール）</Label>
                    <Input value={form.login_id ?? ""} onChange={(e) => set("login_id", e.target.value)} autoComplete="off" />
                  </div>
                  {secretInput("login_password", "パスワード")}
                  {secretInput("backup_code", "バックアップキー（二段階認証の予備コード）")}
                  <div>
                    <Label className="text-xs">管理画面URL</Label>
                    <Input value={form.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://..." inputMode="url" />
                  </div>
                  <div>
                    <Label className="text-xs">登録メールアドレス</Label>
                    <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">登録電話番号</Label>
                    <Input type="tel" inputMode="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">メモ</Label>
                    <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="何に使っているか・注意点など" />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button onClick={handleSave} disabled={saving} size="sm">
                    <Check size={13} className="mr-1" />{saving ? "保存中..." : "保存"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                    <X size={13} className="mr-1" />キャンセル
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">{query ? "見つかりません" : "まだ登録がありません"}</CardContent></Card>
          ) : (
            <div className="space-y-6">
              {grouped.map(([category, items]) => (
                <section key={category}>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLOR[category] || CATEGORY_COLOR["その他"]}`}>{category}</span>
                    <span className="text-xs font-normal text-muted-foreground">{items.length}件</span>
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {items.map((e) => (
                      <Card key={e.id} className={editingId === e.id ? "opacity-50 pointer-events-none" : ""}>
                        <CardContent className="p-4">
                          <div className="mb-3 flex items-start justify-between gap-2">
                            <p className="font-bold leading-snug">{e.name}</p>
                            <div className="flex shrink-0 items-center gap-1">
                              <button onClick={() => startEdit(e)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="編集">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => handleDelete(e)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="削除">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <dl className="divide-y rounded-md border text-sm">
                            {FIELDS.filter((f) => e[f.key]).map((f) => {
                              const value = String(e[f.key]);
                              const key = `${e.id}:${f.key}`;
                              const visible = !f.secret || shown[key];
                              return (
                                <div key={f.key} className="flex items-center gap-2 px-3 py-2">
                                  <dt className="w-24 shrink-0 text-xs text-muted-foreground">{f.label}</dt>
                                  <dd className={`min-w-0 flex-1 break-all ${f.secret ? "font-mono" : ""}`}>
                                    {f.link ? (
                                      <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                        <span className="break-all">{value.replace(/^https?:\/\//, "")}</span><ExternalLink size={12} className="shrink-0" />
                                      </a>
                                    ) : visible ? value : "••••••••"}
                                  </dd>
                                  {f.secret && (
                                    <button onClick={() => setShown((p) => ({ ...p, [key]: !p[key] }))}
                                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`${f.label}を表示`}>
                                      {visible ? <EyeOff size={13} /> : <Eye size={13} />}
                                    </button>
                                  )}
                                  <button onClick={() => copy(value, f.label)}
                                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`${f.label}をコピー`}>
                                    <Copy size={13} />
                                  </button>
                                </div>
                              );
                            })}
                          </dl>
                          {e.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{e.notes}</p>}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
