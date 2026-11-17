import { useState, type ReactNode } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";

// 管理画面の1ページの外枠（ヘッダー・サイドバー・本文の余白）。
// embedded のときは中身だけを出す（ホームページダッシュボードのタブの中に同じ画面を入れるため）。
export function AdminPageShell({ embedded = false, mainClassName = "p-6", children }: {
  embedded?: boolean;
  mainClassName?: string;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  if (embedded) return <>{children}</>;
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className={`pt-[60px] md:ml-[240px] ${mainClassName}`}>{children}</main>
    </div>
  );
}
