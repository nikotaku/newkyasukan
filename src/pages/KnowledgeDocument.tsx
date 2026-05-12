import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Save } from "lucide-react";

const KNOWLEDGE_TITLES: Record<string, string> = {
  sns: "各種SNSデータ",
  cleaning: "清掃チェックシート",
  "expenses-rules": "雑費・宿泊費ルール",
  trouble: "トラブル対応",
  backlog: "バックログ",
  "customer-service": "顧客対応",
  suppliers: "取引先登録",
  templates: "文章テンプレート",
  agreement: "誓約書",
  interview: "面談",
};

export default function KnowledgeDocument() {
  const { slug } = useParams<{ slug: string }>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && slug) fetchContent();
  }, [user, slug]);

  const fetchContent = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("content")
        .eq("slug", slug)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      setContent(data?.content || "");
    } catch (error) {
      console.error("Error fetching document:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("knowledge_documents")
        .upsert({ slug, content, updated_at: new Date().toISOString() }, { onConflict: "slug" });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Error saving document:", error);
    } finally {
      setSaving(false);
    }
  };

  const title = slug ? (KNOWLEDGE_TITLES[slug] || slug) : "";

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">ナレッジ</p>
              <h1 className="text-2xl font-bold">{title}</h1>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              <Save size={14} className="mr-2" />
              {saved ? "保存しました" : saving ? "保存中..." : "保存"}
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="text-center text-muted-foreground py-8">読み込み中...</div>
              ) : (
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="ここにメモを入力..."
                  className="min-h-[60vh] font-mono text-sm resize-none border-0 shadow-none focus-visible:ring-0"
                />
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
