import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2 } from "lucide-react";

interface SMSTemplate {
  id: string;
  name: string;
  trigger: string;
  timing_minutes: number;
  message: string;
  is_active: boolean;
}

export default function SystemSMSAuto() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    trigger: "reservation_confirmed",
    timing_minutes: 0,
    message: "",
    is_active: true,
  });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchTemplates();
  }, [user]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("sms_auto_templates").select("*").order("name");
      if (error && error.code !== "PGRST116") throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching SMS templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from("sms_auto_templates").insert([formData]);
      if (error) throw error;
      setFormData({ name: "", trigger: "reservation_confirmed", timing_minutes: 0, message: "", is_active: true });
      setShowForm(false);
      fetchTemplates();
    } catch (error) {
      console.error("Error adding template:", error);
    }
  };

  const handleToggle = async (id: string, is_active: boolean) => {
    try {
      const { error } = await supabase.from("sms_auto_templates").update({ is_active }).eq("id", id);
      if (error) throw error;
      fetchTemplates();
    } catch (error) {
      console.error("Error toggling template:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      const { error } = await supabase.from("sms_auto_templates").delete().eq("id", id);
      if (error) throw error;
      fetchTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
    }
  };

  const triggerLabels: Record<string, string> = {
    reservation_confirmed: "予約確定時",
    reservation_reminder: "予約前リマインド",
    reservation_cancelled: "予約キャンセル時",
    first_visit: "初回来店後",
    revisit_reminder: "再来店促進",
    thanks: "サンクスSMS",
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">SMS自動送信</h1>
              <p className="text-muted-foreground">トリガー別の自動SMS設定</p>
            </div>
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus size={16} className="mr-2" />追加
            </Button>
          </div>

          {showForm && (
            <Card className="mb-6">
              <CardHeader><CardTitle>テンプレートを追加</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>テンプレート名</Label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                    </div>
                    <div>
                      <Label>トリガー</Label>
                      <Select value={formData.trigger} onValueChange={(v) => setFormData({ ...formData, trigger: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reservation_confirmed">予約確定時</SelectItem>
                          <SelectItem value="reservation_reminder">予約前リマインド</SelectItem>
                          <SelectItem value="reservation_cancelled">予約キャンセル時</SelectItem>
                          <SelectItem value="first_visit">初回来店後</SelectItem>
                          <SelectItem value="revisit_reminder">再来店促進</SelectItem>
                          <SelectItem value="thanks">サンクスSMS（タイムテーブルから手動送信）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>送信タイミング（分）</Label>
                      <Input
                        type="number"
                        placeholder="0=即時, 負=前, 正=後"
                        value={formData.timing_minutes}
                        onChange={(e) => setFormData({ ...formData, timing_minutes: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>メッセージ（{"{customer_name}"}, {"{date}"} などの変数が使えます）</Label>
                    <Textarea
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      rows={4}
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit">保存</Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>キャンセル</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="text-center text-muted-foreground">読み込み中...</div>
          ) : templates.length === 0 ? (
            <Card><CardContent className="pt-12 pb-12 text-center text-muted-foreground">テンプレートがありません</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <Card key={template.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{template.name}</span>
                          <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                            {triggerLabels[template.trigger] || template.trigger}
                          </span>
                          {template.timing_minutes !== 0 && (
                            <span className="text-xs text-muted-foreground">
                              {template.timing_minutes > 0 ? `+${template.timing_minutes}分後` : `${Math.abs(template.timing_minutes)}分前`}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{template.message}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Switch
                          checked={template.is_active}
                          onCheckedChange={(checked) => handleToggle(template.id, checked)}
                        />
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(template.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
