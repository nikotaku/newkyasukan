import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Globe,
  BarChart3,
  LogOut,
  ExternalLink,
  MessageSquare,
  ChevronDown,
  Cpu,
  TrendingUp,
  Users,
  UserCircle,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface MenuItemLeaf {
  href: string;
  label: string;
}

interface MenuItemChild extends MenuItemLeaf {
  groupHeader?: string;
}

interface MenuSubGroup {
  groupLabel: string;
  items: MenuItemLeaf[];
}

interface MenuItem {
  href?: string;
  label: string;
  icon: any;
  children?: MenuItemChild[];
  subGroups?: MenuSubGroup[];
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
      { href: "/schedule-dashboard", label: "ダッシュボード" },
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
      { href: "/board", label: "タイムライン" },
      { href: "/hp/article-creation", label: "記事作成" },
      { href: "/hp/store-info", label: "店舗情報" },
      { href: "/hp/sns-links", label: "店舗SNSリンク" },
      { href: "/hp/recommended-menu", label: "おすすめメニュー" },
    ],
  },
  {
    label: "売上管理",
    icon: TrendingUp,
    subGroups: [
      {
        groupLabel: "ダッシュボード",
        items: [
          { href: "/sales", label: "売上ダッシュボード" },
        ],
      },
      {
        groupLabel: "レポート",
        items: [
          { href: "/report", label: "レポート" },
          { href: "/sales/therapist-breakdown", label: "セラピスト別" },
          { href: "/sales/price-analysis", label: "単価" },
        ],
      },
      {
        groupLabel: "売り上げ",
        items: [
          { href: "/sales/pending-reports", label: "確認待ちボックス" },
          { href: "/sales/monthly-sales", label: "月別売上" },
          { href: "/sales/daily-sales", label: "日別清算" },
          { href: "/sales/card-sales", label: "カード売上" },
          { href: "/sales/paypay-sales", label: "PayPay売上" },
          { href: "/sales/monthly-target", label: "月別売上目標" },
          { href: "/sales/daily-target", label: "日別売上目標" },
          { href: "/sales/expense-input", label: "経費入力" },
        ],
      },
      {
        groupLabel: "経費",
        items: [
          { href: "/expenses", label: "経費管理" },
          { href: "/sales/advertising-cost", label: "広告費管理" },
          { href: "/sales/deduction-summary", label: "控除集計" },
          { href: "/sales/referral-fees", label: "紹介報酬管理" },
        ],
      },
    ],
  },
  {
    label: "システム",
    icon: Cpu,
    subGroups: [
      {
        groupLabel: "料金",
        items: [
          { href: "/system/courses", label: "コース" },
          { href: "/system/options", label: "オプション" },
          { href: "/system/discounts", label: "各種割引" },
          { href: "/system/payment-methods", label: "決済方法" },
        ],
      },
      {
        groupLabel: "給与",
        items: [
          { href: "/system/deductions", label: "控除" },
          { href: "/system/allowances", label: "手当" },
          { href: "/system/referral-rewards", label: "広告費" },
        ],
      },
      {
        groupLabel: "SMS",
        items: [
          { href: "/system/sms", label: "SMS" },
          { href: "/system/sms-auto", label: "SMS自動送信" },
        ],
      },
      {
        groupLabel: "設定",
        items: [
          { href: "/system/page-content", label: "料金ページ文言" },
          { href: "/shop", label: "設定" },
        ],
      },
    ],
  },
  {
    label: "引き継ぎセンター",
    icon: ClipboardList,
    subGroups: [
      {
        groupLabel: "事業引き継ぎ",
        items: [
          { href: "/business-continuity", label: "ダッシュボード" },
          { href: "/business-continuity/vendors", label: "業者一覧" },
          { href: "/business-continuity/logins", label: "ログイン情報" },
          { href: "/business-continuity/fixed-costs", label: "固定費管理" },
          { href: "/business-continuity/bank-accounts", label: "銀行口座" },
          { href: "/business-continuity/contracts", label: "契約書管理" },
        ],
      },
      {
        groupLabel: "ルーム・設備",
        items: [
          { href: "/facilities/rooms", label: "ルーム管理" },
          { href: "/facilities/rooms?tab=inroom", label: "インルーム" },
          { href: "/facilities/rooms?tab=lazy", label: "ラズルーム" },
          { href: "/facilities/rooms?tab=supplies", label: "備品登録" },
          { href: "/facilities/equipment", label: "消耗品" },
          { href: "/facilities/equipment?type=costumes", label: "衣装" },
          { href: "/facilities/equipment?type=furniture", label: "家具家電" },
        ],
      },
      {
        groupLabel: "契約・取引先",
        items: [
          { href: "/facilities/contracts", label: "契約一覧" },
          { href: "/facilities/contracts?tab=rental", label: "賃貸借契約" },
          { href: "/facilities/contracts?tab=utilities", label: "水道光熱費" },
          { href: "/facilities/contracts?tab=wifi", label: "Wi-Fi" },
          { href: "/facilities/contracts?tab=phone", label: "電話" },
          { href: "/facilities/contracts?tab=suppliers", label: "取引先" },
        ],
      },
      {
        groupLabel: "ナレッジ",
        items: [
          { href: "/knowledge", label: "ナレッジDB" },
          { href: "/knowledge/passwords", label: "PW管理" },
          { href: "/templates", label: "文章テンプレート" },
        ],
      },
    ],
  },
  {
    label: "セラピスト",
    icon: UserCircle,
    children: [
      { href: "/staff", label: "新規登録" },
      { href: "/post-management", label: "投稿管理" },
      { href: "/panel-manual", label: "パネル撮影マニュアル" },
      { href: "/service-manual", label: "接客マニュアル" },
      { href: "/recruitment-criteria", label: "採用基準確認シート" },
    ],
  },
  {
    label: "顧客",
    icon: Users,
    children: [
      { href: "/database/customers", label: "顧客一覧" },
      { href: "/database/customers?tab=preferences", label: "好み" },
      { href: "/database/customers?tab=sales", label: "営業" },
    ],
  },
];

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { signOut } = useAuth();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [expandedSubGroups, setExpandedSubGroups] = useState<string[]>([]);

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const toggleSubGroup = (key: string) => {
    setExpandedSubGroups((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const isChildActive = (children?: MenuItemChild[]) => {
    if (!children) return false;
    return children.some((child) => window.location.pathname === child.href.split("?")[0]);
  };

  const isSubGroupActive = (subGroups?: MenuSubGroup[]) => {
    if (!subGroups) return false;
    return subGroups.some((g) => g.items.some((i) => window.location.pathname === i.href.split("?")[0]));
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          "fixed top-[60px] left-0 h-[calc(100vh-60px)] w-[240px] bg-background border-r border-border z-50 transition-transform duration-300",
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

              const hasSubGroups = !!(item.subGroups && item.subGroups.length > 0);
              const subGroupActive = isSubGroupActive(item.subGroups);
              const isTopActive = childActive || subGroupActive;

              return (
                <div key={item.label}>
                  {(hasChildren || hasSubGroups) ? (
                    <button
                      onClick={() => toggleExpand(item.label)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-md transition-colors w-full text-left",
                        isTopActive || isExpanded
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

                  {hasSubGroups && isExpanded && (
                    <div className="space-y-0.5 pl-4 mt-1">
                      {item.subGroups!.map((group) => {
                        const subKey = `${item.label}:${group.groupLabel}`;
                        const isSubExpanded = expandedSubGroups.includes(subKey);
                        const isSubActive = group.items.some((i) => window.location.pathname === i.href.split("?")[0]);
                        return (
                          <div key={subKey}>
                            <button
                              onClick={() => toggleSubGroup(subKey)}
                              className={cn(
                                "flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                                isSubActive || isSubExpanded
                                  ? "text-primary bg-primary/5"
                                  : "text-muted-foreground hover:bg-muted/50"
                              )}
                            >
                              {group.groupLabel}
                              <ChevronDown
                                size={12}
                                className={cn("ml-auto transition-transform", isSubExpanded ? "rotate-180" : "")}
                              />
                            </button>
                            {isSubExpanded && (
                              <div className="space-y-0.5 pl-4 mt-0.5">
                                {group.items.map((leaf) => {
                                  const isLeafActive = window.location.pathname === leaf.href.split("?")[0];
                                  return (
                                    <Link
                                      key={leaf.href}
                                      to={leaf.href}
                                      className={cn(
                                        "block px-3 py-1.5 text-xs rounded-md transition-colors",
                                        isLeafActive
                                          ? "text-primary bg-primary/10 font-semibold"
                                          : "text-foreground/70 hover:bg-muted/50"
                                      )}
                                    >
                                      {leaf.label}
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
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
