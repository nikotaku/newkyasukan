import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

// 試作版であることと、セラピスト側／運営側の切り替え
export function PrototypeBar() {
  const isAdmin = useLocation().pathname.startsWith("/admin");
  const link = (active: boolean) => cn("rounded-full px-3 py-1 transition-colors", active ? "bg-foreground text-background" : "hover:bg-muted");
  return (
    <div className="border-b bg-card text-xs">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5">
        <p className="text-muted-foreground">試作版・表示中のお店と人物はすべてサンプルです</p>
        <nav className="flex items-center gap-1" aria-label="画面の切り替え">
          <Link to="/" className={link(!isAdmin)} aria-current={!isAdmin ? "page" : undefined}>
            セラピスト側
          </Link>
          <Link to="/admin" className={link(isAdmin)} aria-current={isAdmin ? "page" : undefined}>
            運営側
          </Link>
        </nav>
      </div>
    </div>
  );
}
