import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Building2, KeyRound, Receipt, Landmark, FileText, AlertTriangle, DoorOpen, Package, BookOpen, Lock, FileSignature } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, isAfter, isBefore } from "date-fns";
import { ja } from "date-fns/locale";

interface UrgentContract {
  id: string;
  contract_name: string;
  counterparty: string | null;
  renewal_date: string | null;
}

interface SummaryData {
  vendorCount: number;
  loginCount: number;
  fixedCostCount: number;
  monthlyTotal: number;
  yearlyTotal: number;
  urgentContracts: UrgentContract[];
}

export default function BusinessContinuity() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summary, setSummary] = useState<SummaryData>({
    vendorCount: 0,
    loginCount: 0,
    fixedCostCount: 0,
    monthlyTotal: 0,
    yearlyTotal: 0,
    urgentContracts: [],
  });
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading]);

  useEffect(() => {
    if (user) fetchSummary();
  }, [user]);

  const fetchSummary = async () => {
    setLoading(true);

    const [vendorsRes, loginsRes, fixedCostsRes, contractsRes] = await Promise.all([
      supabase.from("business_vendors" as any).select("id", { count: "exact" }),
      supabase.from("business_logins" as any).select("id", { count: "exact" }),
      supabase.from("business_fixed_costs" as any).select("amount"),
      supabase.from("business_contracts" as any).select("id, contract_name, counterparty, renewal_date"),
    ]);

    const vendorCount = vendorsRes.count ?? 0;
    const loginCount = loginsRes.count ?? 0;

    const fixedCosts = (fixedCostsRes.data as any[]) ?? [];
    const monthlyTotal = fixedCosts.reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
    const yearlyTotal = monthlyTotal * 12;
    const fixedCostCount = fixedCosts.length;

    const now = new Date();
    const threshold = addDays(now, 30);
    const contracts = (contractsRes.data as any[]) ?? [];
    const urgentContracts = contracts.filter((c: any) => {
      if (!c.renewal_date) return false;
      const d = new Date(c.renewal_date);
      return isAfter(d, now) && isBefore(d, threshold);
    });

    setSummary({ vendorCount, loginCount, fixedCostCount, monthlyTotal, yearlyTotal, urgentContracts });
    setLoading(false);
  };

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center"><div>読み込み中...</div></div>;
  }

  const moduleGroups: {
    title: string;
    modules: { href: string; label: string; icon: any; description: string }[];
  }[] = [
    {
      title: "事業引き継ぎ",
      modules: [
        { href: "/business-continuity/vendors", label: "業者管理", icon: Building2, description: "取引業者・連絡先の管理" },
        { href: "/business-continuity/logins", label: "ログイン管理", icon: KeyRound, description: "各サービスのID/パスワード" },
        { href: "/business-continuity/fixed-costs", label: "固定費管理", icon: Receipt, description: "月次固定費の一覧" },
        { href: "/business-continuity/bank-accounts", label: "銀行口座管理", icon: Landmark, description: "口座情報の管理" },
        { href: "/business-continuity/contracts", label: "契約書管理", icon: FileText, description: "契約書・更新日の管理" },
      ],
    },
    {
      title: "ルーム・設備",
      modules: [
        { href: "/facilities/rooms", label: "ルーム管理", icon: DoorOpen, description: "ルーム・備品の管理" },
        { href: "/facilities/equipment", label: "設備・消耗品", icon: Package, description: "消耗品・衣装・家具家電" },
      ],
    },
    {
      title: "契約・取引先",
      modules: [
        { href: "/facilities/contracts", label: "施設契約一覧", icon: FileSignature, description: "賃貸・光熱費・通信・取引先" },
      ],
    },
    {
      title: "ナレッジ",
      modules: [
        { href: "/knowledge", label: "ナレッジDB", icon: BookOpen, description: "業務ナレッジの蓄積" },
        { href: "/knowledge/passwords", label: "PW管理", icon: Lock, description: "パスワードの一元管理" },
        { href: "/templates", label: "文章テンプレート", icon: FileText, description: "定型文・テンプレート" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">事業引き継ぎセンター</h1>
            <p className="text-sm text-muted-foreground mt-1">業者・ログイン・固定費・銀行口座・契約書・設備・ナレッジの一元管理</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">登録業者数</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{summary.vendorCount}</p>
                <p className="text-xs text-muted-foreground mt-1">業者</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">ログイン情報数</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{summary.loginCount}</p>
                <p className="text-xs text-muted-foreground mt-1">サービス</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">固定費件数</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{summary.fixedCostCount}</p>
                <p className="text-xs text-muted-foreground mt-1">項目</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">月額固定費合計</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">¥{summary.monthlyTotal.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">/ 月</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">年額固定費合計</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">¥{summary.yearlyTotal.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">/ 年</p>
              </CardContent>
            </Card>

            <Card className={summary.urgentContracts.length > 0 ? "border-red-400" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                  {summary.urgentContracts.length > 0 && <AlertTriangle size={14} className="text-red-500" />}
                  更新期限30日以内
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-3xl font-bold ${summary.urgentContracts.length > 0 ? "text-red-500" : ""}`}>
                  {summary.urgentContracts.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">件</p>
              </CardContent>
            </Card>
          </div>

          {/* Urgent Contracts */}
          {summary.urgentContracts.length > 0 && (
            <Card className="border-red-300">
              <CardHeader>
                <CardTitle className="text-base text-red-600 flex items-center gap-2">
                  <AlertTriangle size={16} />
                  更新期限が近い契約
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {summary.urgentContracts.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{c.contract_name}</p>
                        <p className="text-xs text-muted-foreground">{c.counterparty ?? "—"}</p>
                      </div>
                      {c.renewal_date && (
                        <Badge variant="destructive">
                          {format(new Date(c.renewal_date), "M/d", { locale: ja })} 更新
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <Link to="/business-continuity/contracts">
                    <Button variant="outline" size="sm">契約書管理を開く</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Module Links */}
          <div className="space-y-6">
            {moduleGroups.map((group) => (
              <div key={group.title}>
                <h2 className="text-base font-semibold mb-3">{group.title}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {group.modules.map((m) => {
                    const Icon = m.icon;
                    return (
                      <Link key={m.href} to={m.href}>
                        <Card className="hover:bg-accent/30 transition-colors cursor-pointer h-full">
                          <CardContent className="p-4 flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
                              <Icon size={18} className="text-primary" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm">{m.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="mt-8 py-4 px-4">
          <div className="max-w-5xl mx-auto text-center">
            <p className="text-xs text-muted-foreground">© 2025 caskan.jp All rights reserved</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
