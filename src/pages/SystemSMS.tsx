import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { MessageSquare, Plus } from "lucide-react";

interface SMSLog {
  id: string;
  phone: string;
  message: string;
  status: string;
  sent_at: string;
}

export default function SystemSMS() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logs, setLogs] = useState<SMSLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ phone: "", message: "" });
  const [sending, setSending] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchLogs();
  }, [user]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_logs")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(50);
      if (error && error.code !== "PGRST116") throw error;
      setLogs(data || []);
    } catch (error) {
      console.error("Error fetching SMS logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const { error } = await supabase.from("sms_logs").insert([{
        phone: formData.phone,
        message: formData.message,
        status: "sent",
        sent_at: new Date().toISOString(),
      }]);
      if (error) throw error;
      setFormData({ phone: "", message: "" });
      setShowForm(false);
      fetchLogs();
    } catch (error) {
      console.error("Error sending SMS:", error);
    } finally {
      setSending(false);
    }
  };

  const totalSent = logs.length;
  const successCount = logs.filter((l) => l.status === "sent").length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">SMS送信</h1>
              <p className="text-muted-foreground">SMS送信履歴と手動送信</p>
            </div>
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus size={16} className="mr-2" />送信
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">送信数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalSent}件</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">成功率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {totalSent > 0 ? ((successCount / totalSent) * 100).toFixed(1) : 0}%
                </div>
              </CardContent>
            </Card>
          </div>

          {showForm && (
            <Card className="mb-6">
              <CardHeader><CardTitle>SMSを送信</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleSend} className="space-y-4">
                  <div>
                    <Label>電話番号</Label>
                    <Input
                      type="tel"
                      placeholder="09012345678"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>メッセージ</Label>
                    <Textarea
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      rows={4}
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">{formData.message.length}文字</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={sending}>
                      <MessageSquare size={14} className="mr-2" />
                      {sending ? "送信中..." : "送信"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>キャンセル</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="text-center text-muted-foreground">読み込み中...</div>
          ) : logs.length === 0 ? (
            <Card><CardContent className="pt-12 pb-12 text-center text-muted-foreground">SMS履歴がありません</CardContent></Card>
          ) : (
            <Card>
              <CardHeader><CardTitle>送信履歴</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">{log.phone}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            log.status === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}>
                            {log.status === "sent" ? "送信済" : "失敗"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(log.sent_at), "MM/dd HH:mm", { locale: ja })}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{log.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
