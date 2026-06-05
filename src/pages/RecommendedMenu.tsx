import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { BannerManagement } from "@/components/BannerManagement";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

export default function RecommendedMenu() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">おすすめメニュー管理</h1>
          <p className="text-sm text-muted-foreground mb-6">
            公開予約ページの「おすすめメニュー」タブに表示される画像を管理します。
          </p>
          <BannerManagement />
        </div>
      </main>
    </div>
  );
}
