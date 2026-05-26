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
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search, Save, X, ExternalLink, Copy } from "lucide-react";
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
  x_account: string | null;
  line_url: string | null;
  litlink_url: string | null;
  o2_url: string | null;
  format_type: string | null;
}

interface InternalProfile {
  id?: string;
  cast_id: string;
  tags: string[];
  weight: number | null;
  self_introduction: string;
  comment: string;
  special_skills: string;
  preferred_type: string;
  mbti: string;
  love_type: string;
  career_history: string;
  massage_skills: string;
  training_count: number | null;
  sns_operation_notes: string;
  customer_age_range: string;
}

const emptyInternal = (cast_id: string): InternalProfile => ({
  cast_id,
  tags: [],
  weight: null,
  self_introduction: "",
  comment: "",
  special_skills: "",
  preferred_type: "",
  mbti: "",
  love_type: "",
  career_history: "",
  massage_skills: "",
  training_count: null,
  sns_operation_notes: "",
  customer_age_range: "",
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
          "id,name,photo,age,height,bust,cup_size,waist,hip,blood_type,therapist_years,favorite_techniques,favorite_food,celebrity_lookalike,day_off_activities,hobbies,ideal_type,message,profile,x_account,line_url,litlink_url,o2_url,format_type"
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
      x_account: castEdit.x_account || null,
      line_url: castEdit.line_url || null,
      litlink_url: castEdit.litlink_url || null,
      o2_url: castEdit.o2_url || null,
      format_type: castEdit.format_type || null,
    }).eq("id", castEdit.id);
    setSavingEstama(false);
    if (error) { toast.error("保存に失敗しました"); return; }
    toast.success("エスタ魂情報を保存しました");
    await fetchAll();
  };

  const handleSaveInternal = async () => {
    if (!internal || !selectedCast || !castEdit) return;
    setSavingInternal(true);
    const payload = { ...internal, cast_id: selectedCast.id };
    const [profileResult] = await Promise.all([
      internal.id
        ? supabase.from("therapist_profiles" as any).update(payload).eq("id", internal.id)
        : supabase.from("therapist_profiles" as any).insert([payload]),
      supabase.from("casts").update({ format_type: castEdit.format_type || null }).eq("id", castEdit.id),
    ]);
    setSavingInternal(false);
    if ((profileResult as any).error) { toast.error("保存に失敗しました"); return; }
    toast.success("内部情報を保存しました");
    await fetchAll();
    if (selectedCast) selectCast(casts.find(c => c.id === selectedCast.id) || selectedCast);
  };

  const setCast = (field: keyof Cast, value: any) =>
    setCastEdit(p => p ? { ...p, [field]: value } : p);

  const setInt = (field: keyof InternalProfile, value: any) =>
    setInternal(p => p ? { ...p, [field]: value } : p);

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
                    <Tabs defaultValue="public">
                      <TabsList className="mb-4">
                        <TabsTrigger value="public">公開プロフィール</TabsTrigger>
                        <TabsTrigger value="estama">エスタ魂掲載</TabsTrigger>
                        <TabsTrigger value="internal">内部管理</TabsTrigger>
                      </TabsList>

                      {/* ── 公開プロフィールタブ ── */}
                      <TabsContent value="public" className="space-y-5">

                        {/* プロフィールフォーマット */}
                        <div className="space-y-1">
                          <Label className="text-sm font-semibold">プロフィールフォーマット</Label>
                          <p className="text-xs text-muted-foreground">HP掲載用のプロフィール文（自由記述）</p>
                          <Textarea
                            value={castEdit.profile ?? ""}
                            onChange={(e) => setCast("profile", e.target.value)}
                            rows={4}
                            placeholder="プロフィールテキストを入力..."
                          />
                        </div>

                        {/* お店コメント */}
                        <div className="space-y-1">
                          <Label className="text-sm font-semibold">お店コメント</Label>
                          <p className="text-xs text-muted-foreground">お店からのおすすめコメント（HP公開）</p>
                          <Textarea
                            value={internal.comment ?? ""}
                            onChange={(e) => setInt("comment", e.target.value)}
                            rows={4}
                            placeholder="お店からのおすすめポイントを入力..."
                          />
                        </div>

                        {/* セラピストコメント */}
                        <div className="space-y-1">
                          <Label className="text-sm font-semibold">セラピストコメント</Label>
                          <p className="text-xs text-muted-foreground">セラピスト本人からのメッセージ（HP公開）</p>
                          <Textarea
                            value={castEdit.message ?? ""}
                            onChange={(e) => setCast("message", e.target.value)}
                            rows={4}
                            placeholder="セラピスト本人からのコメントを入力..."
                          />
                        </div>

                        {/* セラピストインタビュー */}
                        <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
                          <Label className="text-sm font-semibold">セラピストインタビュー</Label>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">身長</Label>
                              <Input type="number" value={castEdit.height ?? ""} onChange={(e) => setCast("height", e.target.value ? Number(e.target.value) : null)} placeholder="cm" />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">カップ数</Label>
                              <Input value={castEdit.cup_size ?? ""} onChange={(e) => setCast("cup_size", e.target.value)} placeholder="例：D" />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">年齢</Label>
                              <Input type="number" value={castEdit.age ?? ""} onChange={(e) => setCast("age", e.target.value ? Number(e.target.value) : null)} placeholder="歳" />
                            </div>
                          </div>
                          <div className="space-y-3 pt-1">
                            {[
                              { label: "【セラピスト歴】", field: "therapist_years" as keyof Cast, type: "number", placeholder: "年" },
                            ].map(({ label, field, type, placeholder }) => (
                              <div key={field} className="flex items-center gap-3">
                                <Label className="text-xs text-muted-foreground shrink-0 w-36">{label}</Label>
                                <Input
                                  type={type}
                                  value={(castEdit as any)[field] ?? ""}
                                  onChange={(e) => setCast(field, type === "number" ? (e.target.value ? Number(e.target.value) : null) : e.target.value)}
                                  placeholder={placeholder}
                                  className="text-sm"
                                />
                              </div>
                            ))}
                            {[
                              { label: "【得意な施術】", field: "favorite_techniques" as keyof Cast, placeholder: "例：アロマ、リンパ" },
                              { label: "【好きな食べ物】", field: "favorite_food" as keyof Cast, placeholder: "例：パスタ、スイーツ" },
                              { label: "【好きな男性のタイプ】", field: "ideal_type" as keyof Cast, placeholder: "例：優しい人" },
                              { label: "【似ている芸能人】", field: "celebrity_lookalike" as keyof Cast, placeholder: "例：〇〇さん" },
                              { label: "【休みの日は何してる？】", field: "day_off_activities" as keyof Cast, placeholder: "例：カフェ巡り" },
                              { label: "【趣味・特技】", field: "hobbies" as keyof Cast, placeholder: "例：料理、ヨガ" },
                            ].map(({ label, field, placeholder }) => (
                              <div key={field} className="flex items-center gap-3">
                                <Label className="text-xs text-muted-foreground shrink-0 w-36">{label}</Label>
                                <Input
                                  value={(castEdit as any)[field] ?? ""}
                                  onChange={(e) => setCast(field, e.target.value)}
                                  placeholder={placeholder}
                                  className="text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button onClick={handleSaveEstama} disabled={savingEstama} variant="outline">
                            <Save size={14} className="mr-1.5" />
                            {savingEstama ? "保存中..." : "基本情報を保存"}
                          </Button>
                          <Button onClick={handleSaveInternal} disabled={savingInternal}>
                            <Save size={14} className="mr-1.5" />
                            {savingInternal ? "保存中..." : "コメントを保存"}
                          </Button>
                        </div>
                      </TabsContent>

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

                        {areaField("message", "セラピストコメント（本人メッセージ）", 3)}
                        {areaField("profile", "自己PR / プロフィール", 4)}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {textField("favorite_techniques", "得意な施術")}
                          {textField("favorite_food", "好きな食べ物")}
                          {textField("celebrity_lookalike", "似ている芸能人")}
                          {textField("ideal_type", "好みのタイプ")}
                          {textField("hobbies", "趣味・特技")}
                          {textField("day_off_activities", "休日の過ごし方")}
                        </div>

                        <div className="space-y-3 pt-2 border-t">
                          <Label className="text-muted-foreground text-xs font-semibold tracking-wider">SNS / リンク</Label>
                          {textField("x_account", "X（Twitter）ID またはURL")}
                          {textField("line_url", "LINE URL")}
                          {textField("litlink_url", "リットリンク URL")}
                          {textField("o2_url", "O2 プロフィールURL")}
                        </div>

                        <Button onClick={handleSaveEstama} disabled={savingEstama}>
                          <Save size={14} className="mr-1.5" />
                          {savingEstama ? "保存中..." : "エスタ魂情報を保存"}
                        </Button>
                      </TabsContent>

                      {/* ── 内部管理タブ ── */}
                      <TabsContent value="internal" className="space-y-4">
                        <div>
                          <Label className="text-sm font-semibold">SNS運用シート</Label>
                          <Textarea
                            value={internal.sns_operation_notes ?? ""}
                            onChange={(e) => setInt("sns_operation_notes", e.target.value)}
                            rows={5}
                            placeholder="投稿ジャンル、頻度、NG内容など運用メモ..."
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-sm font-semibold">MBTI</Label>
                            <Input
                              value={internal.mbti ?? ""}
                              onChange={(e) => setInt("mbti", e.target.value)}
                              placeholder="例: INFP"
                            />
                          </div>
                          <div>
                            <Label className="text-sm font-semibold">ラブタイプ</Label>
                            <Input
                              value={internal.love_type ?? ""}
                              onChange={(e) => setInt("love_type", e.target.value)}
                              placeholder="例: 献身的な愛情タイプ"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-semibold">よく利用する客層の年齢</Label>
                          <Input
                            value={internal.customer_age_range ?? ""}
                            onChange={(e) => setInt("customer_age_range", e.target.value)}
                            placeholder="例: 30〜50代"
                          />
                        </div>
                        <div>
                          <Label className="text-sm font-semibold">フォーマット</Label>
                          <Input
                            value={castEdit?.format_type ?? ""}
                            onChange={(e) => setCast("format_type", e.target.value)}
                            placeholder="フォーマット種類"
                          />
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
