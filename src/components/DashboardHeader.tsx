import { Menu, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { CtiCallPopup } from "@/components/CtiCallPopup";
import caskanLogo from "@/assets/caskan-logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardHeaderProps {
  onToggleSidebar: () => void;
}

export const DashboardHeader = ({ onToggleSidebar }: DashboardHeaderProps) => {
  const { user, signOut, isAdmin } = useAuth();
  const { store: adminStore } = useAdminStore();

  // デフォルト店舗（全力エステ）以外は店舗ごとのアイコンに切り替える
  const isDefaultStore = !adminStore?.slug || adminStore.slug === "main";
  const shopIcon = isDefaultStore
    ? "https://cdn2-caskan.com/caskan/img/shop_icon/1401_icon_1750161414.jpeg"
    : "/favicon-tsuyaka.png";
  const shopAlt = adminStore?.name ?? "全力エステ 仙台";

  return (
    <header className="fixed top-0 left-0 right-0 h-[52px] sm:h-[60px] bg-card border-b border-border z-40">
      <div className="flex items-center justify-between h-full px-1 sm:px-4 gap-0.5 sm:gap-2 flex-nowrap">
        {/* Mobile menu button and Logo */}
        <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            className="md:hidden flex-shrink-0 h-8 w-8 p-0"
          >
            <Menu size={18} />
          </Button>

          <a href="/dashboard" className="block flex-shrink-0">
            <img 
              src={caskanLogo} 
              alt="Caskan" 
              className="h-6 sm:h-8 w-auto"
            />
          </a>
        </div>

        {/* Account info */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 whitespace-nowrap">
          <div className="hidden lg:block text-right">
            <div className="text-xs text-muted-foreground">{adminStore?.name ?? "全力エステ.."}</div>
            {isAdmin && (
              <div className="text-xs text-primary font-medium">管理者</div>
            )}
          </div>
          
          <img
            src={shopIcon}
            alt={shopAlt}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded border border-border object-cover flex-shrink-0 max-[360px]:hidden"
          />
          
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="店舗メニュー" className="flex items-center gap-1 flex-shrink-0 h-8 w-8 p-0 sm:w-auto sm:px-2">
                  <User size={14} />
                  <span className="text-xs hidden md:inline">店舗</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  <LogOut size={14} className="mr-2" />
                  ログアウト
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
              <User size={14} />
              <span className="hidden md:inline">店舗</span>
            </div>
          )}
        </div>
      </div>
      {/* CTI着信ポップ（全管理画面共通） */}
      <CtiCallPopup />
    </header>
  );
};
