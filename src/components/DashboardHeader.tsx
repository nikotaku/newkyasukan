import { Menu, User, LogOut, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useAdminAppManifest } from "@/hooks/useAdminAppManifest";
import { CtiCallPopup } from "@/components/CtiCallPopup";
import { AppUpdateNotice } from "@/components/AppUpdateNotice";
import { O2ControlAlert } from "@/components/sns/O2ControlPanel";
import { EstamaPendingAlert } from "@/components/EstamaPendingAlert";
import { TherapistNotifyAlert } from "@/components/TherapistNotifyAlert";
import { TherapistPromotionReportAlert } from "@/components/promotion/TherapistPromotionReports";
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
  const navigate = useNavigate();
  useAdminAppManifest();

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

        {/* Account info（店舗アイコン＝店舗切替トグル） */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 whitespace-nowrap">
          <div className="hidden lg:block text-right">
            <div className="text-xs text-muted-foreground">{adminStore?.name ?? "艶華"}</div>
            {isAdmin && (
              <div className="text-xs text-primary font-medium">管理者</div>
            )}
          </div>

          <O2ControlAlert />
          {user && <TherapistPromotionReportAlert storeId={adminStore?.id} />}

          <img src="/favicon-tsuyaka.png" alt="艶華" className="w-8 h-8 rounded border border-border object-cover" />
          
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="店舗メニュー" className="flex items-center gap-1 flex-shrink-0 h-8 w-8 p-0 sm:w-auto sm:px-2">
                  <User size={14} />
                  <span className="text-xs hidden md:inline">店舗</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate("/system/dashboard?tab=notifications")}>
                  <Bell size={14} className="mr-2" />
                  スマホ通知の設定
                </DropdownMenuItem>
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
      {/* 新しい版が出たら「更新する」（ホーム画面のアプリは閉じきるまで古いままのため） */}
      <AppUpdateNotice />
      {/* 管理画面の左下のお知らせ（届いていないセラピスト通知・エスたまへの反映待ち） */}
      <div className="pointer-events-none fixed bottom-4 left-4 md:left-[256px] z-50 flex w-[340px] max-w-[calc(100vw-6.5rem)] flex-col gap-2 [&>*]:pointer-events-auto">
        <TherapistNotifyAlert />
        <EstamaPendingAlert />
      </div>
    </header>
  );
};
