import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { House, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrototypeBar } from "@/components/PrototypeBar";
import { useApp } from "@/hooks/useApp";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "ホーム", icon: House, end: true },
  { to: "/stores", label: "お店を探す", icon: Search },
  { to: "/me", label: "マイページ", icon: UserRound },
];

export function Logo() {
  return (
    <Link to="/" className="flex items-baseline gap-2">
      <span className="font-display text-2xl font-extrabold tracking-wide">Bloom</span>
      <span className="hidden text-[11px] text-muted-foreground sm:inline">セラピストの専属コーチ付き登録サービス</span>
    </Link>
  );
}

export function PublicLayout({ children, hideBottomNav = false }: { children: ReactNode; hideBottomNav?: boolean }) {
  const { me } = useApp();
  return (
    <div className="min-h-dvh">
      <PrototypeBar />
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn("rounded-lg px-3 py-2 text-sm", isActive ? "font-bold text-foreground" : "text-muted-foreground hover:bg-muted")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {me ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/me">{me.nickname}さん</Link>
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/register">無料登録</Link>
            </Button>
          )}
        </div>
      </header>

      <main className={cn(!hideBottomNav && "pb-24 md:pb-0")}>{children}</main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground md:pb-8">
          <p className="font-display text-base font-extrabold text-foreground">Bloom（仮称）</p>
          <p>18歳未満の方・高校生の方はご登録いただけません。掲載しているのはメンズエステ（リラクゼーション）のお店だけです。</p>
          <p>登録・コーチング・レッスンは無料です。運営費はお店からの定額の掲載料でまかなっています。</p>
        </div>
      </footer>

      {!hideBottomNav && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card safe-bottom md:hidden" aria-label="メインメニュー">
          <div className="grid grid-cols-3">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive ? "font-bold text-primary" : "text-muted-foreground")
                }
              >
                <item.icon size={20} />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
