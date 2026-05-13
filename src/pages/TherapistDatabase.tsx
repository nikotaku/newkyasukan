import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search, Save, X, Plus, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { driveImgUrl } from "@/lib/drive";

interface Cast {
  id: string;
  name: string;
  photo: string | null;
  age: number | null;
  height: number | null;
  bust: number | null;
  cup_size: string | null;
  waist: number | null;
  hip: number | null;
  blood_type: string | null;
  therapist_years: number | null;
  favorite_techniques: string | null;
  favorite_food: string | null;
  celebrity_lookalike: string | null;
  day_off_activities: string | null;
  hobbies: string | null;
  ideal_type: string | null;
  message: string | null;
  profile: string | null;
}

interface InternalProfile {
  id?: string;
  cast_id: string;
  tags: string[];
  weight: number | null;
  mbti: string;
  career_history: string;
  massage_skills: string;
  training_count: number | null;
}

const emptyInternal = (cast_id: string): InternalProfile => ({
  cast_id,
  tags: [],
  weight: null,
  mbti: "",
  career_history: "",
  massage_skills: "",
  training_count: null,
});

export default function TherapistDatabase() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [internalMap, setInternalMap] = useState<Record<string, InternalProfile>>({});
  const [loading, setLoading] = useState(true);
  const [savingEstama, setSavingEstama] = useState(false);
  const [savingInternal, setSavingInternal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCast, setSelectedCast] = useState<Cast | null>(null);
  const [castEdit, setCastEdit] = useState<Cast | null>(null);
  const [internal, setInternal] = useState<InternalProfile | null>(null);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [tokenMap, setTokenMap] = useState<Record<string, string>>({});

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [castsRes, profilesRes, tokensRes] = await Promise.all([
        supabase.from("casts").select(
          "id,name,photo,age,height,bust,cup_size,waist,hip,blood_type,therapist_years,favorite_techniques,favorite_food,celebrity_lookalike,day_off_activities,hobbies,ideal_type,message,profile"
        ).order("name"),
        supabase.from("therapist_profiles" as any).select("*"),
        supabase.rpc("get_cast_access_tokens").catch(() => ({ data: null })),
      ]);
      setCasts(castsRes.data || []);
      const map: Record<string, InternalProfile> = {};
      (profilesRes.data || []).forEach((p: any) => { map[p.cast_id] = p; });
      setInternalMap(map);
      const tmap: Record<string, string> = {};
      ((tokensRes as any).data || []).forEach((t: any) => { tmap[t.cast_id] = t.access_token; });
      setTokenMap(tmap);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const selectCast = (cast: Cast) => {
    setSelectedCast(cast);
    setCastEdit({ ...cast });
    const existing = internalMap[cast.id];
    setInternal(existing ? { ...emptyInternal(cast.id), ...existing } : emptyInternal(cast.id));
  };

  const handleSaveEstama = async () => {
    if (!castEdit) return;
    setSavingEstama(true);
    const { error } = await supabase.from("casts").update({
      age: castEdit.age,
      height: castEdit.height,
      bust: castEdit.bust,
      cup_size: castEdit.cup_size,
      waist: castEdit.waist,
      hip: castEdit.hip,
      blood_type: castEdit.blood_type,
      therapist_years: castEdit.therapist_years,
      favorite_techniques: castEdit.favorite_techniques,
      favorite_food: castEdit.favorite_food,
      celebrity_lookalike: castEdit.celebrity_lookalike,
      day_off_activities: castEdit.day_off_activities,
      hobbies: castEdit.hobbies,
      ideal_type: castEdit.ideal_type,
      message: castEdit.message,
      profile: castEdit.profile,
    }).eq("id", castEdit.id);
    setSavingEstama(false);
    if (error) { toast.error("保存に失敗しました"); return; }
    toast.success("エスタ魂情報を保存しました");
    await fetchAll();
  };

  const handleSaveInternal = async () => {
    if (!internal || !selectedCast) return;
    setSavingInternal(true);
    const payload = { ...internal, cast_id: selectedCast.id };
    const { error } = internal.id
      ? await supabase.from("therapist_profiles" as any).update(payload).eq("id", internal.id)
      : await supabase.from("therapist_profiles" as any).insert([payload]);
    setSavingInternal(false);
    if (error) { toast.error("保存に失敗しました"); return; }
    toast.success("内部情報を保存しました");
    await fetchAll();
    if (selectedCast) selectCast(casts.find(c => c.id === selectedCast.id) || selectedCast);
  };

  const setCast = (field: keyof Cast, value: any) =>
    setCastEdit(p => p ? { ...p, [field]: value } : p);

  const setInt = (field: keyof InternalProfile, value: any) =>
    setInternal(p => p ? { ...p, [field]: value } : p);

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag || !internal) return;
    if (!internal.tags.includes(tag)) setInternal({ ...internal, tags: [...internal.tags, tag] });
    setNewTag("");
  };

  const allTags = Array.from(new Set(
    Object.values(internalMap).flatMap((p: any) => p.tags || [])
  )).sort();

  const filtered = casts.filter((c) => {
    if (!c.name.includes(searchQuery)) return false;
    if (filterTags.length === 0) return true;
    const tags: string[] = (internalMap[c.id] as any)?.tags || [];
    return filterTags.every((t) => tags.includes(t));
  });

  const numField = (field: keyof Cast, label: string, unit = "cm") => (
    <div>
      <Label>{label}{unit ? ` (${unit})` : ""}</Label>
      <Input type="number" value={(castEdit as any)?.[field] ?? ""} onChange={(e) => setCast(field, e.target.value ? Number(e.target.value) : null)} />
    </div>
  );

  const textField = (field: keyof Cast, label: string, placeholder = "") => (
    <div>
      <Label>{label}</Label>
      <Input value={(castEdit as any)?.[field] ?? ""} onChange={(e) => setCast(field, e.target.value)} placeholder={placeholder} />
    </div>
  );

  const areaField = (field: keyof Cast, label: string, rows = 3) => (
    <div>
      <Label>{label}</Label>
      <Textarea value={(castEdit as any)?.[field] ?? ""} onChange={(e) => setCast(field, e.target.value)} rows={rows} />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">セラピストデータベース</h1>
            <p className="text-muted-foreground text-sm">エスタ魂掲載情報・内部管理情報</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: cast list */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Search size={16} className="text-muted-foreground" />
                <Input placeholder="名前で検索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>

              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {allTags.map((tag) => (
                    <button key={tag} onClick={() => setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterTags.includes(tag) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary"}`}>
                      {tag}
                    </button>
                  ))}
                  {filterTags.length > 0 && (
                    <button onClick={() => setFilterTags([])} className="text-xs px-2 py-0.5 text-muted-foreground hover:text-foreground">クリア</button>
                  )}
                </div>
              )}

              {loading ? (
                <div className="text-center text-muted-foreground py-4 text-sm">読み込み中...</div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((c) => {
                    const tags: string[] = (internalMap[c.id] as any)?.tags || [];
                    return (
                      <button key={c.id} onClick={() => selectCast(c)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${selectedCast?.id === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
                        {c.photo && (
                          <img src={driveImgUrl(c.photo, 100)} className="w-8 h-8 rounded object-cover object-top shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate">{c.name}</div>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {tags.map(t => (
                                <span key={t} className={`text-[10px] px-1.5 rounded-full ${selectedCast?.id === c.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: edit panel */}
            <div className="lg:col-span-2">
              {selectedCast && castEdit && internal ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-3 flex-wrap">
                      {selectedCast.photo && (
                        <img src={driveImgUrl(selectedCast.photo, 200)} className="w-12 h-12 rounded object-cover object-top" />
                      )}
                      <span className="flex-1">{selectedCast.name}</span>
                      {tokenMap[selectedCast.id] ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/therapist/${tokenMap[selectedCast.id]}`);
                              toast.success("マイページリンクをコピーしました");
                            }}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
                            title="マイページリンクをコピー"
                          >
                            <Copy size={11} />マイページ
                          </button>
                          <a
                            href={`/therapist/${tokenMap[selectedCast.id]}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
                          >
                            <ExternalLink size={11} />
                          </a>
                        </div>
                      ) : (
                        <a
                          href="/database/therapist/mypage"
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          マイページ未発行
                        </a>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="estama">
                      <TabsList className="mb-4">
                        <TabsTrigger value="estama">エスタ魂掲載</TabsTrigger>
                        <TabsTrigger value="internal">内部管理</TabsTrigger>
                      </TabsList>

                      {/* ── エスタ魂掲載タブ ── */}
                      <TabsContent value="estama" className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          {numField("age", "年齢", "歳")}
                          <div>
                            <Label>血液型</Label>
                            <Select value={castEdit.blood_type || ""} onValueChange={(v) => setCast("blood_type", v)}>
                              <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                              <SelectContent>
                                {["A","B","O","AB"].map(t => <SelectItem key={t} value={t}>{t}型</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {numField("height", "身長")}
                          <div>
                            <Label>バスト (cm)</Label>
                            <Input type="number" value={castEdit.bust ?? ""} onChange={(e) => setCast("bust", e.target.value ? Number(e.target.value) : null)} />
                          </div>
                          <div>
                            <Label>カップ</Label>
                            <Input value={castEdit.cup_size ?? ""} onChange={(e) => setCast("cup_size", e.target.value)} placeholder="D" />
                          </div>
                          {numField("waist", "ウエスト")}
                          {numField("hip", "ヒップ")}
                          {numField("therapist_years", "セラピスト歴", "年")}
                        </div>

                        {areaField("message", "お店コメント", 3)}
                        {areaField("profile", "自己PR / プロフィール", 4)}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {textField("favorite_techniques", "得意な施術")}
                          {textField("favorite_food", "好きな食べ物")}
                          {textField("celebrity_lookalike", "似ている芸能人")}
                          {textField("ideal_type", "好みのタイプ")}
                          {textField("hobbies", "趣味・特技")}
                          {textField("day_off_activities", "休日の過ごし方")}
                        </div>

                        <Button onClick={handleSaveEstama} disabled={savingEstama}>
                          <Save size={14} className="mr-1.5" />
                          {savingEstama ? "保存中..." : "エスタ魂情報を保存"}
                        </Button>
                      </TabsContent>

                      {/* ── 内部管理タブ ── */}
                      <TabsContent value="internal" className="space-y-4">
                        <div>
                          <Label>タグ</Label>
                          <div className="flex flex-wrap gap-1 mb-2 mt-1">
                            {internal.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="gap-1">
                                {tag}
                                <button onClick={() => setInternal({ ...internal, tags: internal.tags.filter(t => t !== tag) })} className="hover:text-destructive"><X size={10} /></button>
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="タグを入力してEnter" className="text-sm" />
                            <Button size="sm" variant="outline" onClick={addTag}><Plus size={14} /></Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>体重 (kg)</Label>
                            <Input type="number" value={internal.weight ?? ""} onChange={(e) => setInt("weight", e.target.value ? Number(e.target.value) : null)} />
                          </div>
                          <div>
                            <Label>MBTI</Label>
                            <Input value={internal.mbti ?? ""} onChange={(e) => setInt("mbti", e.target.value)} placeholder="例: INFP" />
                          </div>
                        </div>
                        <div>
                          <Label>過去の経歴</Label>
                          <Textarea value={internal.career_history ?? ""} onChange={(e) => setInt("career_history", e.target.value)} rows={3} />
                        </div>
                        <div>
                          <Label>マッサージ技術メモ</Label>
                          <Textarea value={internal.massage_skills ?? ""} onChange={(e) => setInt("massage_skills", e.target.value)} rows={3} />
                        </div>
                        <div>
                          <Label>講習回数</Label>
                          <Input type="number" value={internal.training_count ?? ""} onChange={(e) => setInt("training_count", e.target.value ? Number(e.target.value) : null)} />
                        </div>

                        <Button onClick={handleSaveInternal} disabled={savingInternal}>
                          <Save size={14} className="mr-1.5" />
                          {savingInternal ? "保存中..." : "内部情報を保存"}
                        </Button>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                    左からセラピストを選択してください
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
