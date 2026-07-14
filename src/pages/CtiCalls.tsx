import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, PhoneCall, RefreshCw, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

/** CTI（050番号）の着信履歴。cti_calls を新しい順に表示する。 */

interface CtiCall {
  id: string;
  from_number: string;
  status: string;
  duration_seconds: number | null;
  customer_id: string | null;
  customer_name: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ringing: { label: "着信中", cls: "bg-green-100 text-green-700" },
  completed: { label: "応答", cls: "bg-blue-100 text-blue-700" },
  "no-answer": { label: "不在着信", cls: "bg-rose-100 text-rose-700" },
  busy: { label: "話中", cls: "bg-amber-100 text-amber-700" },
  failed: { label: "接続失敗", cls: "bg-gray-100 text-gray-600" },
};

export default function CtiCalls() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [calls, setCalls] = useState<CtiCall[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => { document.title = "着信履歴"; }, []);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cti_calls" as any)
      .select("id, from_number, status, duration_seconds, customer_id, customer_name, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) toast.error("着信履歴の取得に失敗しました");
    else setCalls((data || []) as unknown as CtiCall[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) fetchCalls();
  }, [user, fetchCalls]);

  // 表示中もリアルタイムで反映
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("cti-calls-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "cti_calls" }, () => fetchCalls())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchCalls]);

  const handleDelete = async (id: string) => {
    if (!confirm("この着信記録を削除しますか？")) return;
    const { error } = await supabase.from("cti_calls" as any).delete().eq("id", id);
    if (error) toast.error("削除に失敗しました");
    else setCalls((prev) => prev.filter((c) => c.id !== id));
  };

  const fmtDuration = (s: number | null) => {
    if (!s) return "";
    return s >= 60 ? `${Math.floor(s / 60)}分${s % 60}秒` : `${s}秒`;
  };

  // 日付でグループ化
  const groups = calls.reduce<Record<string, CtiCall[]>>((acc, c) => {
    const key = format(new Date(c.created_at), "yyyy-MM-dd");
    (acc[key] = acc[key] || []).push(c);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px]">
        <div className="container mx-auto px-4 py-6 max-w-3xl">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <PhoneCall size={20} className="text-primary" />
              着信履歴
            </h1>
            <Button variant="outline" size="sm" onClick={fetchCalls} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            050番号への着信が自動で記録されます。登録済みのお客様は名前が表示されます。
          </p>

          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
            </div>
          ) : calls.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground text-sm px-6">
              まだ着信記録がありません。<br />
              Twilio側の設定（050番号のWebhook設定）が完了すると、着信が自動でここに記録されます。
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(groups).map(([date, list]) => (
                <div key={date}>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    {format(new Date(`${date}T00:00:00`), "M月d日（E）", { locale: ja })}
                  </p>
                  <div className="rounded-xl border bg-card divide-y">
                    {list.map((c) => {
                      const badge = STATUS_BADGE[c.status] ?? { label: c.status, cls: "bg-gray-100 text-gray-600" };
                      return (
                        <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="text-xs text-muted-foreground w-11 shrink-0 tabular-nums">
                            {format(new Date(c.created_at), "HH:mm")}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {c.customer_name ? `${c.customer_name} 様` : "未登録"}
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">{c.from_number}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                              {badge.label}
                            </span>
                            {c.duration_seconds ? (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDuration(c.duration_seconds)}</p>
                            ) : null}
                          </div>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="p-1 rounded text-muted-foreground/60 hover:text-destructive shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
