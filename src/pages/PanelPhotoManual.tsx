import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Shirt, Sparkles, Wand2, ListChecks } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

interface Section {
  id: string;
  title: string;
  icon: any;
  description: string;
}

// 骨組みのみ。各セクションの中身は後から追加していく。
const SECTIONS: Section[] = [
  {
    id: "posing",
    title: "ポージング集",
    icon: Camera,
    description: "パネル映えする基本ポーズ・NGポーズ・角度のサンプルを掲載予定",
  },
  {
    id: "costume",
    title: "衣装",
    icon: Shirt,
    description: "おすすめ衣装・色味・小物・シーズン別コーディネートを掲載予定",
  },
  {
    id: "retouch",
    title: "加工のポイント",
    icon: Wand2,
    description: "明るさ・肌補正・トリミング・統一感を出すための加工手順を掲載予定",
  },
];

export default function PanelPhotoManual() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div>読み込み中...</div></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10 mt-0.5">
              <Camera size={22} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">パネル撮影マニュアル</h1>
              <p className="text-sm text-muted-foreground mt-1">
                セラピストパネル写真の撮影・加工テンプレート。統一感のあるパネル作成のためのガイドです。
              </p>
            </div>
          </div>

          {/* 目次 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks size={16} />
                目次
              </CardTitle>
            </CardHeader>
            <CardContent>
              <nav className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SECTIONS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-accent/40 transition-colors text-sm"
                    >
                      <Icon size={15} className="text-primary" />
                      {s.title}
                    </a>
                  );
                })}
              </nav>
            </CardContent>
          </Card>

          {/* 各セクション（骨組み） */}
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <section key={s.id} id={s.id} className="scroll-mt-[72px]">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon size={18} className="text-primary" />
                      {s.title}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: ここに各セクションの内容（画像・手順・サンプル）を追加 */}
                    <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                      <Sparkles size={20} className="mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">準備中 — このセクションの内容は今後追加されます</p>
                    </div>
                  </CardContent>
                </Card>
              </section>
            );
          })}
        </div>

        <footer className="mt-8 py-4 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs text-muted-foreground">© 2025 caskan.jp All rights reserved</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
