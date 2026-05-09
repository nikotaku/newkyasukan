import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Globe,
  BarChart3,
  Settings,
  LogOut,
  ExternalLink,
  Sparkles,
  MessageSquare,
  ChevronDown,
  Cpu,
  Database,
  Building2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface MenuItemChild {
  href: string;
  label: string;
  groupHeader?: string;
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
  {
    label: "HP",
    icon: Globe,
    children: [
      { href: "/design", label: "ホームページ管理" },
      { href: "/hp/bulletin-board", label: "掲示板" },
      { href: "/hp/article-creation", label: "記事作成" },
      { href: "/hp/store-info", label: "店舗情報" },
      { href: "/hp/analytics/daily-access", label: "日別アクセス", groupHeader: "アナリティクス" },
      { href: "/hp/analytics/hourly-access", label: "時間別アクセス" },
      { href: "/hp/analytics/average-stay", label: "平均滞在時間" },
      { href: "/hp/analytics/tracking", label: "トラッキング(流入)" },
    ],
  },
  {
    label: "レポート",
    icon: BarChart3,
    children: [
      { href: "/report", label: "レポート" },
      { href: "/sales/customer-info", label: "顧客情報" },
      { href: "/sales/therapist-breakdown", label: "セラピスト別" },
      { href: "/sales/price-analysis", label: "単価" },
    ],
  },
  {
    label: "売上管理",
    icon: TrendingUp,
    children: [
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
  {
    label: "システム",
    icon: Cpu,
    children: [
      { href: "/system/courses", label: "コース" },
      { href: "/system/options", label: "オプション" },
      { href: "/system/discounts", label: "各種割引" },
      { href: "/system/deductions", label: "控除", groupHeader: "給与" },
      { href: "/system/allowances", label: "手当" },
      { href: "/system/sms", label: "SMS", groupHeader: "通知" },
      { href: "/system/sms-auto", label: "SMS自動送信" },
    ],
  },
  {
    label: "データベース",
    icon: Database,
    children: [
      { href: "/database/knowledge/sns", label: "各種SNSデータ", groupHeader: "ナレッジ" },
      { href: "/database/knowledge/cleaning", label: "清掃チェックシート" },
      { href: "/database/knowledge/expenses-rules", label: "雑費・宿泊費ルール" },
      { href: "/database/knowledge/trouble", label: "トラブル対応" },
      { href: "/database/knowledge/backlog", label: "バックログ" },
      { href: "/database/knowledge/customer-service", label: "顧客対応" },
      { href: "/database/knowledge/suppliers", label: "取引先登録" },
      { href: "/database/knowledge/templates", label: "文章テンプレート" },
      { href: "/database/knowledge/agreement", label: "誓約書" },
      { href: "/database/knowledge/interview", label: "面談" },
      { href: "/staff", label: "新規登録", groupHeader: "セラピスト" },
      { href: "/database/therapist/profiles", label: "プロフィール" },
      { href: "/database/therapist/mypage", label: "マイページ" },
      { href: "/database/customers", label: "顧客一覧", groupHeader: "顧客" },
      { href: "/database/customers?tab=preferences", label: "好み" },
      { href: "/database/customers?tab=sales", label: "営業" },
    ],
  },
  {
    label: "設備と契約",
    icon: Building2,
    children: [
      { href: "/facilities/rooms", label: "ルーム管理", groupHeader: "ルーム" },
      { href: "/facilities/rooms?tab=inroom", label: "インルーム" },
      { href: "/facilities/rooms?tab=lazy", label: "ラズルーム" },
      { href: "/facilities/rooms?tab=equipment", label: "設備管理" },
      { href: "/facilities/rooms?tab=supplies", label: "備品登録" },
      { href: "/facilities/contracts", label: "契約一覧", groupHeader: "契約管理" },
      { href: "/facilities/contracts?tab=rental", label: "賃貸借契約" },
      { href: "/facilities/contracts?tab=utilities", label: "水道光熱費" },
      { href: "/facilities/contracts?tab=wifi", label: "Wi-Fi" },
      { href: "/facilities/contracts?tab=phone", label: "電話" },
      { href: "/facilities/contracts?tab=suppliers", label: "取引先" },
      { href: "/facilities/equipment", label: "消耗品", groupHeader: "設備管理" },
      { href: "/facilities/equipment?type=costumes", label: "衣装" },
      { href: "/facilities/equipment?type=furniture", label: "家具家電" },
    ],
  },
  { href: "/text-generation", label: "文章生成", icon: Sparkles },
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
    return children.some((child) => window.location.pathname === child.href.split("?")[0]);
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />
      )}
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
                        className={cn("ml-auto transition-transform", isExpanded ? "rotate-180" : "")}
                      />
                    </button>
                  ) : (
                    <Link
                      to={item.href || "#"}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-md transition-colors",
                        isCurrentPath ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  )}

                  {hasChildren && isExpanded && (
                    <div className="space-y-0.5 pl-6 mt-1">
                      {item.children!.map((child) => {
                        const isChildCurrentPath = window.location.pathname === child.href.split("?")[0];
                        return (
                          <div key={child.href}>
                            {child.groupHeader && (
                              <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                {child.groupHeader}
                              </div>
                            )}
                            <Link
                              to={child.href}
                              className={cn(
                                "block px-3 py-1.5 text-xs rounded-md transition-colors",
                                isChildCurrentPath
                                  ? "text-primary bg-primary/10 font-semibold"
                                  : "text-foreground/70 hover:bg-muted/50"
                              )}
                            >
                              {child.label}
                            </Link>
                          </div>
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
