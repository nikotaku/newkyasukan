import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, ExternalLink, ImagePlus, Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  DEFAULT_SCOUT_INVITE,
  SCOUT_IMAGE_BUCKET,
  SCOUT_IMAGE_DIR,
  SCOUT_INVITE_KEY,
  buildScoutLink,
  fillScoutDm,
  normalizeScoutInvite,
  type ScoutInvite,
} from "@/lib/scoutInvite";

/** 引き抜きDM：DM文面の作成と、DMに貼る限定案内ページ（/invite）の編集 */

const publicOrigin = (customDomain?: string | null) =>
  customDomain ? `https://${customDomain}` : (import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin);

function ImageField({
  label,
  hint,
  images,
  folder,
  onChange,
}: {
  label: string;
  hint: string;
  images: string[];
  folder: string;
  onChange: (images: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const added: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${SCOUT_IMAGE_DIR}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(SCOUT_IMAGE_BUCKET).upload(path, file);
      if (error) { toast.error(`アップロード失敗: ${error.message}`); continue; }
      added.push(supabase.storage.from(SCOUT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (added.length) onChange([...images, ...added]);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <ImagePlus size={14} className="mr-1" />}画像を追加
        </Button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((src, i) => (
            <div key={src} className="group relative overflow-hidden rounded-md border">
              <img src={src} alt="" className="h-28 w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white">{i + 1}</span>
              <button
                type="button"
                onClick={() => onChange(images.filter((_, idx) => idx !== i))}
                className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white"
                aria-label="削除"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Rows<T extends Record<string, string>>({
  rows,
  fields,
  onChange,
  empty,
}: {
  rows: T[];
  fields: { key: keyof T & string; placeholder: string; className: string }[];
  onChange: (rows: T[]) => void;
  empty: T;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          {fields.map((f) => (
            <Input
              key={f.key}
              className={f.className}
              placeholder={f.placeholder}
              value={row[f.key] ?? ""}
              onChange={(e) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [f.key]: e.target.value } : r)))}
            />
          ))}
          <button type="button" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} className="px-1 text-muted-foreground hover:text-destructive" aria-label="削除">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...rows, { ...empty }])}>
        <Plus size={14} className="mr-1" />行を追加
      </Button>
    </div>
  );
}

export default function RecruitScout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [invite, setInvite] = useState<ScoutInvite>(DEFAULT_SCOUT_INVITE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [targetName, setTargetName] = useState("");
  const [templateIndex, setTemplateIndex] = useState(0);

  const { user, loading: authLoading } = useAuth();
  const { store, loading: storeLoading } = useAdminStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user || storeLoading || !store) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("site_content").select("value").eq("store_id", store.id).eq("key", SCOUT_INVITE_KEY).maybeSingle();
      if (data?.value) {
        try { setInvite(normalizeScoutInvite(JSON.parse(data.value))); } catch { /* 初期値のまま */ }
      }
      setLoading(false);
    })();
  }, [user, store, storeLoading]);

  const set = <K extends keyof ScoutInvite>(key: K, value: ScoutInvite[K]) => {
    setInvite((p) => ({ ...p, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!store) return;
    setSaving(true);
    const { error } = await supabase.from("site_content").upsert(
      [{ store_id: store.id, key: SCOUT_INVITE_KEY, value: JSON.stringify(invite), updated_at: new Date().toISOString() }],
      { onConflict: "store_id,key" },
    );
    setSaving(false);
    if (error) { toast.error(`保存に失敗しました: ${error.message}`); return; }
    setDirty(false);
    toast.success("保存しました");
  };

  const link = useMemo(() => buildScoutLink(publicOrigin(store?.custom_domain), targetName), [store?.custom_domain, targetName]);
  const template = invite.dmTemplates[templateIndex] ?? invite.dmTemplates[0];
  const dm = template
    ? fillScoutDm(template.body, { name: targetName.trim(), store: store?.name ?? "", link, line: invite.lineUrl })
    : "";

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label}をコピーしました`); }
    catch { toast.error("コピーできませんでした"); }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">セラピスト</p>
              <h1 className="text-2xl font-bold">引き抜きDM</h1>
              <p className="text-sm text-muted-foreground">XのDM文面と、DMに貼る限定案内ページ（稼ぎ明細・ルーム・勤務条件・連絡先）を作ります。</p>
            </div>
            <Button onClick={handleSave} disabled={saving || loading || !dirty}>
              <Save size={16} className="mr-1.5" />{saving ? "保存中..." : dirty ? "保存" : "保存済み"}
            </Button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">読み込み中...</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
              {/* DM作成 */}
              <section className="h-fit space-y-4 rounded-lg border p-4 lg:sticky lg:top-[76px]">
                <h2 className="font-semibold">① DMを作る</h2>
                <label className="block text-xs">
                  <span className="text-muted-foreground">相手の名前（源氏名）</span>
                  <Input className="mt-1" placeholder="例：みずき" value={targetName} onChange={(e) => setTargetName(e.target.value)} />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {invite.dmTemplates.map((t, i) => (
                    <Button key={i} type="button" size="sm" variant={i === templateIndex ? "default" : "outline"} onClick={() => setTemplateIndex(i)}>
                      {t.label || `文面${i + 1}`}
                    </Button>
                  ))}
                </div>
                <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm leading-relaxed">{dm}</pre>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => copy(dm, "DM文面")}><Copy size={14} className="mr-1" />DMをコピー</Button>
                  <Button type="button" variant="outline" onClick={() => copy(link, "リンク")}><Copy size={14} className="mr-1" />リンクだけ</Button>
                  <Button type="button" variant="outline" asChild>
                    <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} className="mr-1" />ページを確認</a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  ※ DMは1人ずつ手動で送ってください（一括・自動送信はXの規約違反で凍結されます）。<br />
                  ※ ページは保存後に反映されます。検索エンジンには表示されません。
                </p>

                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">DM文面テンプレートを編集</summary>
                  <p className="mt-2 text-xs text-muted-foreground">{"{name}"}=相手の名前 / {"{store}"}=店名 / {"{link}"}=案内ページ / {"{line}"}=LINE</p>
                  <div className="mt-3 space-y-3">
                    {invite.dmTemplates.map((t, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="flex gap-2">
                          <Input value={t.label} placeholder="名前" onChange={(e) => set("dmTemplates", invite.dmTemplates.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))} />
                          <button type="button" onClick={() => { set("dmTemplates", invite.dmTemplates.filter((_, idx) => idx !== i)); setTemplateIndex(0); }} className="px-1 text-muted-foreground hover:text-destructive" aria-label="削除"><Trash2 size={14} /></button>
                        </div>
                        <Textarea rows={7} value={t.body} onChange={(e) => set("dmTemplates", invite.dmTemplates.map((x, idx) => (idx === i ? { ...x, body: e.target.value } : x)))} />
                      </div>
                    ))}
                    <Button type="button" size="sm" variant="ghost" onClick={() => set("dmTemplates", [...invite.dmTemplates, { label: "新しい文面", body: "{name}さん、\n{link}" }])}>
                      <Plus size={14} className="mr-1" />文面を追加
                    </Button>
                  </div>
                </details>
              </section>

              {/* ページ編集 */}
              <section className="space-y-6 rounded-lg border p-4">
                <h2 className="font-semibold">② 限定案内ページを編集</h2>

                <div className="space-y-2">
                  <label className="block text-xs"><span className="text-muted-foreground">見出し</span>
                    <Textarea className="mt-1" rows={2} value={invite.headline} onChange={(e) => set("headline", e.target.value)} />
                  </label>
                  <label className="block text-xs"><span className="text-muted-foreground">店長からのメッセージ</span>
                    <Textarea className="mt-1" rows={4} value={invite.message} onChange={(e) => set("message", e.target.value)} />
                  </label>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium">実際の稼ぎ（数字）</p>
                  <Rows
                    rows={invite.earnings}
                    fields={[
                      { key: "label", placeholder: "誰の・いつの", className: "flex-1" },
                      { key: "amount", placeholder: "金額", className: "w-32" },
                      { key: "note", placeholder: "補足", className: "flex-1" },
                    ]}
                    onChange={(rows) => set("earnings", rows)}
                    empty={{ label: "", amount: "", note: "" }}
                  />
                  <ImageField
                    label="稼ぎ明細の画像"
                    hint="名前・顔など個人がわかる部分は必ず隠してから載せてください"
                    images={invite.earningsImages}
                    folder="earnings"
                    onChange={(imgs) => set("earningsImages", imgs)}
                  />
                </div>

                <div className="space-y-2">
                  <ImageField label="ルームの画像" hint="施術ルーム・待機部屋・アメニティなど" images={invite.roomImages} folder="room" onChange={(imgs) => set("roomImages", imgs)} />
                  <label className="block text-xs"><span className="text-muted-foreground">ルームの説明</span>
                    <Textarea className="mt-1" rows={2} value={invite.roomNote} onChange={(e) => set("roomNote", e.target.value)} />
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">勤務条件</p>
                  <p className="text-xs text-muted-foreground">「◯◯」の部分は実際の数字に書き換えてください</p>
                  <Rows
                    rows={invite.conditions}
                    fields={[
                      { key: "label", placeholder: "項目", className: "w-28" },
                      { key: "value", placeholder: "内容", className: "flex-1" },
                    ]}
                    onChange={(rows) => set("conditions", rows)}
                    empty={{ label: "", value: "" }}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">連絡先</p>
                  <Input placeholder="LINE URL（https://lin.ee/...）" value={invite.lineUrl} onChange={(e) => set("lineUrl", e.target.value)} />
                  <Input placeholder="電話番号（空欄なら非表示）" value={invite.phone} onChange={(e) => set("phone", e.target.value)} />
                  <Input placeholder="XのID（@なしでもOK・空欄なら非表示）" value={invite.xAccount} onChange={(e) => set("xAccount", e.target.value)} />
                  <Textarea rows={2} placeholder="連絡先の下に出す一言" value={invite.contactNote} onChange={(e) => set("contactNote", e.target.value)} />
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
