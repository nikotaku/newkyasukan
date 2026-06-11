import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save } from "lucide-react";

const FIELDS: { key: string; label: string }[] = [
  { key: "store_sns_x", label: "X (旧Twitter) URL" },
  { key: "store_sns_line", label: "LINE URL" },
  { key: "store_sns_o2", label: "O2 (ゼロツー) URL" },
  { key: "store_sns_instagram", label: "Instagram URL" },
  { key: "store_sns_bluesky", label: "Bluesky URL" },
];

export default function HpSnsLinks() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchContent();
  }, [user]);

  const fetchContent = async () => {
    setLoading(true);
    const { data } = await supabase.from("site_content").select("key, value").like("key", "store_sns_%");
    const map: Record<string, string> = {};
    (data || []).forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });
    setValues(map);
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const rows = FIELDS.map((f) => ({ key: f.key, value: values[f.key] ?? "", updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("site_content").upsert(rows, { onConflict: "store_id,key" });
    setSaving(false);
    if (error) { toast.error(`保存に失敗しました: ${error.message}`); return; }
    toast.success("保存しました");
  };

  const set = (key: string, v: string) => setValues((p) => ({ ...p, [key]: v }));

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">HP</p>
              <h1 className="text-2xl font-bold">店舗公式SNSリンク</h1>
              <p className="text-muted-foreground text-sm">トップページ「店舗公式SNS」ブロックに表示されるリンクを編集します（空欄は非表示）</p>
            </div>
            <Button onClick={handleSave} disabled={saving || loading}>
              <Save size={16} className="mr-1.5" />{saving ? "保存中..." : "保存"}
            </Button>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">読み込み中...</div>
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-base">SNSリンク</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {FIELDS.map((f) => (
                  <div key={f.key}>
                    <Label className="text-sm">{f.label}</Label>
                    <Input className="mt-1" placeholder="https://..." value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                  </div>
                ))}
                <div className="pt-2">
                  <Button onClick={handleSave} disabled={saving}>
                    <Save size={16} className="mr-1.5" />{saving ? "保存中..." : "保存"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
