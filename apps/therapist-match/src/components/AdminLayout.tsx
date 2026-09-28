import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Calculator, ClipboardCheck, LayoutDashboard, Store, Users } from "lucide-react";
import { PrototypeBar } from "@/components/PrototypeBar";
import { useApp } from "@/hooks/useApp";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/admin", label: "ダッシュボード", icon: LayoutDashboard, end: true },
  { to: "/admin/therapists", label: "登録者", icon: Users },
  { to: "/admin/stores", label: "掲載店舗", icon: Store },
  { to: "/admin/simulator", label: "収支シミュレーター", icon: Calculator },
  { to: "/admin/launch", label: "立ち上げチェック", icon: ClipboardCheck },
];

export function AdminLayout({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const { resetDemo } = useApp();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm",
      isActive ? "bg-accent font-bold text-accent-foreground" : "text-muted-foreground hover:bg-muted",
    );

  return (
    <div className="min-h-dvh">
      <PrototypeBar />
      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-56 shrink-0 border-r md:block">
          <div className="sticky top-0 flex flex-col px-3 py-5">
            <p className="px-3 font-display text-xl font-extrabold">Bloom</p>
            <p className="px-3 text-[11px] text-muted-foreground">運営の管理画面</p>
            <nav className="mt-5 flex flex-col gap-0.5">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                  <item.icon size={17} /> {item.label}
                </NavLink>
              ))}
            </nav>
            <button type="button" onClick={resetDemo} className="mt-8 px-3 text-left text-[11px] text-muted-foreground underline">
              サンプルデータを最初の状態に戻す
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <nav className="flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden" aria-label="管理メニュー">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                <item.icon size={16} /> {item.label}
              </NavLink>
            ))}
          </nav>
          <header className="px-4 pb-2 pt-6 md:px-8">
            <h1 className="font-display text-2xl font-extrabold">{title}</h1>
            {description && <p className="mt-1 max-w-[46rem] text-sm leading-relaxed text-muted-foreground">{description}</p>}
          </header>
          <main className="px-4 pb-16 pt-4 md:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
