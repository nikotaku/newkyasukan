import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Shirt, Sparkles, Wand2, ListChecks, Pencil, Loader2, ImagePlus, X, Check } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Section {
  id: string;
  title: string;
  icon: any;
  description: string;
}

interface SectionContent {
  text: string;
  images: string[];
}

const SECTIONS: Section[] = [
  {
    id: "posing",
    title: "ポージング集",
    icon: Camera,
    description: "パネル映えする基本ポーズ・NGポーズ・角度のサンプル",
  },
  {
    id: "costume",
    title: "衣装",
    icon: Shirt,
    description: "おすすめ衣装・色味・小物・シーズン別コーディネート",
  },
  {
    id: "retouch",
    title: "加工のポイント",
    icon: Wand2,
    description: "明るさ・肌補正・トリミング・統一感を出すための加工手順",
  },
];

const contentKey = (sectionId: string) => `panel_manual_${sectionId}`;

function parseContent(value: string | undefined): SectionContent {
  if (!value) return { text: "", images: [] };
  try {
    const parsed = JSON.parse(value);
    return { text: parsed.text ?? "", images: Array.isArray(parsed.images) ? parsed.images : [] };
  } catch {
    return { text: value, images: [] };
  }
}

export default function PanelPhotoManual() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contents, setContents] = useState<Record<string, SectionContent>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SectionContent>({ text: "", images: [] });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchContents();
  }, [user]);

  const fetchContents = async () => {
    setLoading(true);
    const keys = SECTIONS.map((s) => contentKey(s.id));
    const { data } = await supabase.from("site_content").select("key, value").in("key", keys);
    const map: Record<string, SectionContent> = {};
    for (const s of SECTIONS) {
      const row = (data || []).find((r) => r.key === contentKey(s.id));
      map[s.id] = parseContent(row?.value);
    }
    setContents(map);
    setLoading(false);
  };

  const startEdit = (sectionId: string) => {
    setEditingId(sectionId);
    setDraft(contents[sectionId] ?? { text: "", images: [] });
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    const { error } = await supabase.from("site_content").upsert(
      {
        key: contentKey(editingId),
        value: JSON.stringify(draft),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id,key" },
    );
    setSaving(false);
    if (error) {
      toast.error(`保存に失敗しました: ${error.message}`);
      return;
    }
    setContents((prev) => ({ ...prev, [editingId]: draft }));
    setEditingId(null);
    toast.success("保存しました");
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `panel-manual/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from("knowledge-images").upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from("knowledge-images").getPublicUrl(path);
        urls.push(data.publicUrl);
      }
      setDraft((d) => ({ ...d, images: [...d.images, ...urls] }));
    } catch (e: any) {
      console.error(e);
      toast.error(`画像のアップロードに失敗しました: ${e.message ?? ""}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10 mt-0.5">
              <Camera size={22} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">パネル撮影マニュアル</h1>
              <p className="text-sm text-muted-foreground mt-1">
                セラピストパネル写真の撮影・加工テンプレート。各セクションは「編集」から内容を更新できます。
              </p>
            </div>
          </div>

          {/* 目次 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks size={16} />
                目次
              </CardTitle>
            </CardHeader>
            <CardContent>
              <nav className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SECTIONS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-accent/40 transition-colors text-sm"
                    >
                      <Icon size={15} className="text-primary" />
                      {s.title}
                    </a>
                  );
                })}
              </nav>
            </CardContent>
          </Card>

          {/* 各セクション */}
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const content = contents[s.id] ?? { text: "", images: [] };
            const isEditing = editingId === s.id;
            const isEmpty = !content.text.trim() && content.images.length === 0;
            return (
              <section key={s.id} id={s.id} className="scroll-mt-[72px]">
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Icon size={18} className="text-primary" />
                          {s.title}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1.5">{s.description}</p>
                      </div>
                      {!isEditing && (
                        <Button variant="outline" size="sm" className="shrink-0" onClick={() => startEdit(s.id)}>
                          <Pencil size={13} className="mr-1.5" />編集
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isEditing ? (
                      <div className="space-y-3">
                        <Textarea
                          value={draft.text}
                          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                          placeholder={`${s.title}の内容を入力してください`}
                          rows={8}
                          className="text-sm"
                        />
                        {draft.images.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {draft.images.map((url, i) => (
                              <div key={i} className="relative group">
                                <img src={url} alt="" className="w-full rounded-lg object-cover aspect-square" />
                                <button
                                  onClick={() => setDraft({ ...draft, images: draft.images.filter((_, j) => j !== i) })}
                                  className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => handleUpload(e.target.files)}
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {uploading ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <ImagePlus size={13} className="mr-1.5" />}
                            画像を追加
                          </Button>
                          <div className="flex-1" />
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>キャンセル</Button>
                          <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Check size={13} className="mr-1.5" />}
                            保存
                          </Button>
                        </div>
                      </div>
                    ) : isEmpty ? (
                      <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                        <Sparkles size={20} className="mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">まだ内容がありません。「編集」から追加できます。</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {content.text.trim() && (
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{content.text}</p>
                        )}
                        {content.images.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {content.images.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt="" className="w-full rounded-lg object-cover aspect-square hover:opacity-90 transition-opacity" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            );
          })}
        </div>

        <footer className="mt-8 py-4 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs text-muted-foreground">© 2025 caskan.jp All rights reserved</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
