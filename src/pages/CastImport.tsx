import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

const IMPORT_LIST = [
  "えな", "おとは", "かえで", "かりな", "かりん", "きらら", "さな", "しおり",
  "なの", "のぞみ", "はる", "ばんび", "ひより", "まりの", "まりん", "みおり",
  "みおん", "みさき", "みなみ", "らむ", "りおん", "りさ", "りな", "りの",
  "りん", "るい", "れい", "わかな", "佐倉はな",
];

export default function CastImport() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [existing, setExisting] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchExisting();
  }, [user]);

  const fetchExisting = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("casts").select("name");
      if (error) throw error;
      setExisting((data || []).map((c: any) => c.name));
    } catch (e) {
      console.error(e);
      toast.error("既存データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const toAdd = IMPORT_LIST.filter((name) => !existing.includes(name));
  const alreadyExists = IMPORT_LIST.filter((name) => existing.includes(name));

  const handleImport = async () => {
    if (toAdd.length === 0) return;
    setImporting(true);
    try {
      const rows = toAdd.map((name) => ({ name, is_active: true }));
      const { error } = await supabase.from("casts").insert(rows);
      if (error) throw error;
      toast.success(`${toAdd.length}名を追加しました`);
      setDone(true);
      fetchExisting();
    } catch (e) {
      console.error(e);
      toast.error("インポートに失敗しました");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">キャストインポート</h1>
          <p className="text-muted-foreground text-sm mb-6">
            既存データと照合し、未登録のキャストのみ追加します
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />既存データを確認中...
            </div>
          ) : (
            <div className="space-y-4">
              {done || toAdd.length === 0 ? (
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="pt-4 flex items-center gap-3">
                    <CheckCircle className="text-green-600" size={20} />
                    <p className="text-green-800 font-medium">全員登録済みです</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-orange-200 bg-orange-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="text-orange-600" size={18} />
                      未登録キャスト：{toAdd.length}名
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {toAdd.map((name) => (
                        <span key={name} className="bg-orange-100 text-orange-800 text-sm px-2 py-1 rounded">
                          {name}
                        </span>
                      ))}
                    </div>
                    <Button onClick={handleImport} disabled={importing}>
                      {importing ? (
                        <><Loader2 size={14} className="mr-2 animate-spin" />インポート中...</>
                      ) : (
                        `${toAdd.length}名を追加する`
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {alreadyExists.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                      <CheckCircle size={16} className="text-green-500" />
                      登録済み：{alreadyExists.length}名
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {alreadyExists.map((name) => (
                        <span key={name} className="bg-muted text-muted-foreground text-sm px-2 py-1 rounded">
                          {name}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
