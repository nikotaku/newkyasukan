import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Home,
  Calendar,
  Clock,
  BookOpen,
  Users,
  UserCheck,
  User,
  DollarSign,
  MapPin,
  Wallet,
  Receipt,
  Globe,
  BarChart3,
  Settings,
  LogOut,
  ExternalLink,
  Menu,
  X,
  Sparkles,
  FileText,
  RefreshCw,
  Home as RoomIcon,
  MessageSquare,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface MenuItemChild {
  href: string;
  label: string;
}

interface MenuItem {
  href?: string;
  label: string;
  icon: any;
  children?: MenuItemChild[];
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems: MenuItem[] = [
  {
    label: "スケジュール",
    icon: Calendar,
    children: [
      { href: "/admin-schedule", label: "日別予約情報" },
      { href: "/schedule/monthly-shift", label: "月別シフト" },
      { href: "/schedule/reservations-list", label: "予約一覧" },
      { href: "/schedule/available-slots", label: "空き枠" },
    ],
  },
  { href: "/staff", label: "キャスト管理", icon: User },
  { href: "/shift", label: "シフト", icon: Clock },
  { href: "/reservations", label: "予約管理", icon: BookOpen },
  { href: "/customers", label: "顧客管理", icon: UserCheck },
  { href: "/agreement", label: "誓約書", icon: FileText },
  { href: "/rooms", label: "ルーム設定", icon: RoomIcon },
  { href: "/pricing-management", label: "料金設定", icon: DollarSign },
  { href: "/salary", label: "給与", icon: Wallet },
  { href: "/expenses", label: "経費", icon: Receipt },
  {
    label: "売上管理",
    icon: BarChart3,
    children: [
      { href: "/report", label: "レポート" },
      { href: "/sales/customer-info", label: "顧客情報" },
      { href: "/sales/therapist-breakdown", label: "セラピスト別" },
      { href: "/sales/price-analysis", label: "単価" },
      { href: "/sales/monthly-sales", label: "月別売上" },
      { href: "/sales/card-sales", label: "カード売上" },
      { href: "/sales/paypay-sales", label: "PayPay売上" },
      { href: "/sales/advertising-cost", label: "広告費管理" },
      { href: "/sales/referral-fees", label: "紹介費管理" },
      { href: "/sales/monthly-target", label: "月別売上目標" },
      { href: "/sales/daily-target", label: "日別売上目標" },
      { href: "/sales/expense-input", label: "経費入力" },
    ],
  },
  { href: "/board", label: "掲示板", icon: MessageSquare },
  { href: "/knowledge", label: "ナレッジ", icon: BookOpen },
  { href: "/text-generation", label: "文章生成", icon: Sparkles },
  {
    label: "HP",
    icon: Globe,
    children: [
      { href: "/design", label: "ホームページ管理" },
      { href: "/hp/bulletin-board", label: "掲示板" },
      { href: "/hp/article-creation", label: "記事作成" },
      { href: "/hp/store-info", label: "店舗情報" },
      { href: "/hp/analytics/daily-access", label: "日別アクセス" },
      { href: "/hp/analytics/hourly-access", label: "時間別アクセス" },
      { href: "/hp/analytics/average-stay", label: "平均滞在時間" },
      { href: "/hp/analytics/tracking", label: "トラッキング(流入)" },
    ],
  },
  { href: "/shop", label: "設定", icon: Settings },
];

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { signOut } = useAuth();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const isChildActive = (children?: MenuItemChild[]) => {
    if (!children) return false;
    return children.some((child) => window.location.pathname === child.href);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-[60px] left-0 h-[calc(100vh-60px)] w-[240px] bg-muted/30 border-r border-border z-50 transition-transform duration-300",
          "md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <nav className="h-full overflow-y-auto">
          <div className="space-y-1 p-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isExpanded = expandedItems.includes(item.label);
              const hasChildren = item.children && item.children.length > 0;
              const childActive = isChildActive(item.children);
              const isCurrentPath = item.href && window.location.pathname === item.href;

              return (
                <div key={item.label}>
                  {hasChildren ? (
                    <button
                      onClick={() => toggleExpand(item.label)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-md transition-colors w-full text-left",
                        childActive || isExpanded
                          ? "text-primary bg-primary/10"
                          : "text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon size={16} />
                      {item.label}
                      <ChevronDown
                        size={14}
                        className={cn(
                          "ml-auto transition-transform",
                          isExpanded ? "rotate-180" : ""
                        )}
                      />
                    </button>
                  ) : (
                    <Link
                      to={item.href || "#"}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-md transition-colors",
                        isCurrentPath
                          ? "text-primary bg-primary/10"
                          : "text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  )}

                  {hasChildren && isExpanded && (
                    <div className="space-y-1 pl-6 mt-1">
                      {item.children.map((child) => {
                        const isChildCurrentPath = window.location.pathname === child.href;
                        return (
                          <Link
                            key={child.href}
                            to={child.href}
                            className={cn(
                              "block px-3 py-2 text-xs rounded-md transition-colors",
                              isChildCurrentPath
                                ? "text-primary bg-primary/10 font-semibold"
                                : "text-foreground/70 hover:bg-muted/50"
                            )}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <hr className="my-2 border-border" />

            <Link
              to="/"
              className="flex items-center gap-3 px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/50 rounded-md transition-colors"
            >
              <ExternalLink size={16} />
              サイトを見る
            </Link>

            <button
              onClick={signOut}
              className="flex items-center gap-3 px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/50 rounded-md transition-colors w-full text-left"
            >
              <LogOut size={16} />
              ログアウト
            </button>
          </div>
        </nav>
      </aside>
    </>
  );
};