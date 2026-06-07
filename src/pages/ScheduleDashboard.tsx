import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CalendarDays, CalendarRange, ListChecks, CalendarClock } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface SummaryData {
  reservationsToday: number;
  castsToday: number;
  reservationsMonth: number;
}

export default function ScheduleDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summary, setSummary] = useState<SummaryData>({
    reservationsToday: 0,
    castsToday: 0,
    reservationsMonth: 0,
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

    const today = format(new Date(), "yyyy-MM-dd");
    const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

    const [resTodayRes, shiftsTodayRes, resMonthRes] = await Promise.all([
      supabase.from("reservations").select("id, status").eq("reservation_date", today),
      supabase.from("shifts").select("cast_id").eq("shift_date", today),
      supabase
        .from("reservations")
        .select("id, status")
        .gte("reservation_date", monthStart)
        .lte("reservation_date", monthEnd),
    ]);

    const resToday = (resTodayRes.data as any[]) ?? [];
    const reservationsToday = resToday.filter((r: any) => r.status !== "cancelled").length;

    const shiftsToday = (shiftsTodayRes.data as any[]) ?? [];
    const castsToday = new Set(shiftsToday.map((s: any) => s.cast_id)).size;

    const resMonth = (resMonthRes.data as any[]) ?? [];
    const reservationsMonth = resMonth.filter((r: any) => r.status !== "cancelled").length;

    setSummary({ reservationsToday, castsToday, reservationsMonth });
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
      title: "スケジュール管理",
      modules: [
        { href: "/admin-schedule", label: "日別予約情報", icon: CalendarDays, description: "日別の予約・出勤状況" },
        { href: "/schedule/monthly-shift", label: "月別シフト", icon: CalendarRange, description: "月単位のシフト管理" },
        { href: "/schedule/reservations-list", label: "予約一覧", icon: ListChecks, description: "予約の一覧・検索" },
        { href: "/schedule/available-slots", label: "空き枠", icon: CalendarClock, description: "予約可能な空き枠の確認" },
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
            <h1 className="text-2xl font-bold">スケジュールダッシュボード</h1>
            <p className="text-sm text-muted-foreground mt-1">予約・シフトの状況と管理</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">本日の予約件数</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{summary.reservationsToday}</p>
                <p className="text-xs text-muted-foreground mt-1">件</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">本日の出勤キャスト</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{summary.castsToday}</p>
                <p className="text-xs text-muted-foreground mt-1">名</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">今月の予約件数</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{summary.reservationsMonth}</p>
                <p className="text-xs text-muted-foreground mt-1">件</p>
              </CardContent>
            </Card>
          </div>

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
