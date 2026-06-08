import { useState } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, CheckCircle2, XCircle, RotateCcw, UserCheck } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

interface Criterion {
  id: string;
  label: string;
  hint?: string;
}

// クリア（合格）に必要な項目
const CRITERIA: Criterion[] = [
  { id: "bust", label: "胸がE以上", hint: "カップサイズ E 以上" },
  { id: "hip", label: "ヒップが90以上", hint: "ヒップ 90cm 以上" },
  { id: "age", label: "年齢が23歳以下 もしくは 30歳以上", hint: "24〜29歳は対象外" },
  { id: "look", label: "容姿・清潔感が基準を満たす", hint: "写真・面談で確認" },
  { id: "attitude", label: "接客姿勢・コミュニケーションが良好", hint: "面談での印象" },
  { id: "schedule", label: "希望出勤日数・時間帯が条件を満たす", hint: "シフトの希望を確認" },
];

export default function RecruitmentCriteria() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [applicantName, setApplicantName] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  const toggle = (id: string) => setChecks((p) => ({ ...p, [id]: !p[id] }));
  const reset = () => {
    setChecks({});
    setApplicantName("");
  };

  const clearedCount = CRITERIA.filter((c) => checks[c.id]).length;
  const allCleared = clearedCount === CRITERIA.length;

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div>読み込み中...</div></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10 mt-0.5">
              <UserCheck size={22} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">採用基準確認シート</h1>
              <p className="text-sm text-muted-foreground mt-1">
                クリア項目をチェックして合否を確認します。全項目クリアで採用基準を満たします。
              </p>
            </div>
          </div>

          {/* 応募者名 */}
          <Card>
            <CardContent className="p-4">
              <Label htmlFor="applicant" className="text-sm">応募者名</Label>
              <Input
                id="applicant"
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                placeholder="例：山田 〇〇"
                className="mt-1"
              />
            </CardContent>
          </Card>

          {/* 判定 */}
          <Card className={allCleared ? "border-emerald-400" : "border-rose-300"}>
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {allCleared ? (
                  <CheckCircle2 size={28} className="text-emerald-500" />
                ) : (
                  <XCircle size={28} className="text-rose-400" />
                )}
                <div>
                  <p className={`text-lg font-bold ${allCleared ? "text-emerald-600" : "text-rose-500"}`}>
                    {allCleared ? "採用基準クリア" : "基準未達"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {clearedCount} / {CRITERIA.length} 項目クリア
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} className="h-8 text-xs">
                <RotateCcw size={13} className="mr-1" />
                リセット
              </Button>
            </CardContent>
          </Card>

          {/* クリア項目 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck size={18} className="text-primary" />
                クリア項目
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {CRITERIA.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 py-3">
                    <Checkbox
                      id={c.id}
                      checked={!!checks[c.id]}
                      onCheckedChange={() => toggle(c.id)}
                      className="mt-0.5"
                    />
                    <label htmlFor={c.id} className="flex-1 cursor-pointer">
                      <span className={`text-sm font-medium ${checks[c.id] ? "text-emerald-600" : ""}`}>
                        {c.label}
                      </span>
                      {c.hint && <p className="text-xs text-muted-foreground mt-0.5">{c.hint}</p>}
                    </label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            ※ 項目は仮設定です。実際の採用基準に合わせて編集できます。
          </p>
        </div>

        <footer className="mt-8 py-4 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xs text-muted-foreground">© 2025 caskan.jp All rights reserved</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
