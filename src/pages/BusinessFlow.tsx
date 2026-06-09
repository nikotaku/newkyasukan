import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Loader2, ListChecks, Check } from "lucide-react";
import { toast } from "sonner";

interface Step {
  id: string;
  text: string;
  done: boolean;
}
interface Flow {
  id: string;
  title: string;
  description: string | null;
  steps: Step[];
  display_order: number;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export default function BusinessFlow() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newStepText, setNewStepText] = useState<Record<string, string>>({});

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchFlows();
  }, [user]);

  const fetchFlows = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("business_flows")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      setFlows(
        (data || []).map((f: any) => ({
          ...f,
          steps: Array.isArray(f.steps) ? f.steps : [],
        })) as Flow[]
      );
    } catch (e) {
      console.error(e);
      toast.error("業務フローの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const persist = async (flow: Flow, silent = false) => {
    setSavingId(flow.id);
    try {
      const { error } = await supabase
        .from("business_flows")
        .update({
          title: flow.title,
          description: flow.description,
          steps: flow.steps,
          display_order: flow.display_order,
          updated_at: new Date().toISOString(),
        })
        .eq("id", flow.id);
      if (error) throw error;
      if (!silent) toast.success("保存しました");
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました");
    } finally {
      setSavingId(null);
    }
  };

  const addFlow = async () => {
    try {
      const { data, error } = await supabase
        .from("business_flows")
        .insert({ title: "新しい業務フロー", description: "", steps: [], display_order: flows.length })
        .select()
        .single();
      if (error) throw error;
      setFlows((prev) => [...prev, { ...(data as any), steps: [] }]);
      toast.success("業務フローを追加しました");
    } catch (e) {
      console.error(e);
      toast.error("追加に失敗しました");
    }
  };

  const deleteFlow = async (id: string) => {
    if (!confirm("この業務フローを削除しますか？")) return;
    try {
      const { error } = await supabase.from("business_flows").delete().eq("id", id);
      if (error) throw error;
      setFlows((prev) => prev.filter((f) => f.id !== id));
      toast.success("削除しました");
    } catch (e) {
      console.error(e);
      toast.error("削除に失敗しました");
    }
  };

  const updateLocal = (id: string, patch: Partial<Flow>) => {
    setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const toggleStep = (flow: Flow, stepId: string) => {
    const steps = flow.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
    const updated = { ...flow, steps };
    updateLocal(flow.id, { steps });
    persist(updated, true);
  };

  const addStep = (flow: Flow) => {
    const text = (newStepText[flow.id] || "").trim();
    if (!text) return;
    const steps = [...flow.steps, { id: uid(), text, done: false }];
    const updated = { ...flow, steps };
    updateLocal(flow.id, { steps });
    setNewStepText((p) => ({ ...p, [flow.id]: "" }));
    persist(updated, true);
  };

  const updateStepText = (flow: Flow, stepId: string, text: string) => {
    const steps = flow.steps.map((s) => (s.id === stepId ? { ...s, text } : s));
    updateLocal(flow.id, { steps });
  };

  const removeStep = (flow: Flow, stepId: string) => {
    const steps = flow.steps.filter((s) => s.id !== stepId);
    const updated = { ...flow, steps };
    updateLocal(flow.id, { steps });
    persist(updated, true);
  };

  const moveStep = (flow: Flow, idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= flow.steps.length) return;
    const steps = [...flow.steps];
    [steps[idx], steps[target]] = [steps[target], steps[idx]];
    const updated = { ...flow, steps };
    updateLocal(flow.id, { steps });
    persist(updated, true);
  };

  const resetProgress = (flow: Flow) => {
    const steps = flow.steps.map((s) => ({ ...s, done: false }));
    const updated = { ...flow, steps };
    updateLocal(flow.id, { steps });
    persist(updated, true);
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ListChecks size={22} /> 業務フロー
              </h1>
              <p className="text-muted-foreground">業務の手順をステップで確認・自由にカスタマイズできます</p>
            </div>
            <Button onClick={addFlow}>
              <Plus size={16} className="mr-1.5" />
              フロー追加
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            </div>
          ) : flows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ListChecks size={40} className="mx-auto mb-3 opacity-40" />
              <p>業務フローがまだありません</p>
              <p className="text-sm mt-1">「フロー追加」から最初の業務フローを作成しましょう</p>
            </div>
          ) : (
            <div className="space-y-6">
              {flows.map((flow) => {
                const doneCount = flow.steps.filter((s) => s.done).length;
                const total = flow.steps.length;
                const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
                return (
                  <Card key={flow.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <Input
                            value={flow.title}
                            onChange={(e) => updateLocal(flow.id, { title: e.target.value })}
                            onBlur={() => persist(flow, true)}
                            className="text-lg font-semibold border-transparent hover:border-input focus:border-input px-2 -ml-2"
                            placeholder="業務フロー名"
                          />
                          <Textarea
                            value={flow.description || ""}
                            onChange={(e) => updateLocal(flow.id, { description: e.target.value })}
                            onBlur={() => persist(flow, true)}
                            placeholder="説明（任意）"
                            rows={1}
                            className="text-sm resize-none border-transparent hover:border-input focus:border-input px-2 -ml-2"
                          />
                        </div>
                        <button
                          onClick={() => deleteFlow(flow.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1 shrink-0"
                          title="フローを削除"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      {total > 0 && (
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {doneCount}/{total} 完了
                          </span>
                          {doneCount > 0 && (
                            <button onClick={() => resetProgress(flow)} className="text-xs text-muted-foreground hover:text-foreground underline">
                              リセット
                            </button>
                          )}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      {flow.steps.map((step, idx) => (
                        <div key={step.id} className="flex items-center gap-2 group rounded-md hover:bg-accent/40 px-1 py-0.5">
                          <button
                            onClick={() => toggleStep(flow, step.id)}
                            className={`shrink-0 h-6 w-6 rounded-full border flex items-center justify-center transition-colors ${
                              step.done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40 text-transparent hover:border-primary"
                            }`}
                          >
                            <Check size={14} />
                          </button>
                          <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{idx + 1}</span>
                          <Input
                            value={step.text}
                            onChange={(e) => updateStepText(flow, step.id, e.target.value)}
                            onBlur={() => persist(flow, true)}
                            className={`flex-1 border-transparent hover:border-input focus:border-input h-8 ${step.done ? "line-through text-muted-foreground" : ""}`}
                          />
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button onClick={() => moveStep(flow, idx, -1)} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === 0}>
                              <ChevronUp size={15} />
                            </button>
                            <button onClick={() => moveStep(flow, idx, 1)} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === flow.steps.length - 1}>
                              <ChevronDown size={15} />
                            </button>
                            <button onClick={() => removeStep(flow, step.id)} className="p-1 text-muted-foreground hover:text-destructive">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="flex gap-2 pt-2">
                        <Input
                          value={newStepText[flow.id] || ""}
                          onChange={(e) => setNewStepText((p) => ({ ...p, [flow.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStep(flow); } }}
                          placeholder="ステップを追加（例: 受付で名前を確認）"
                          className="flex-1 h-9"
                        />
                        <Button variant="outline" size="sm" onClick={() => addStep(flow)} disabled={!(newStepText[flow.id] || "").trim()}>
                          <Plus size={15} />
                        </Button>
                      </div>
                      {savingId === flow.id && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 pt-1">
                          <Loader2 size={11} className="animate-spin" /> 保存中...
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
