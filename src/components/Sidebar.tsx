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
  Images,
  Megaphone,
  Calculator,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useSmsUnread } from "@/hooks/useSmsUnread";
import { SidebarLinkVariants } from "@/components/SidebarLinkVariants";

interface MenuItemLeaf {
  href: string;
  label: string;
}

interface MenuItemChild extends MenuItemLeaf {
  groupHeader?: string;
  /** タップで開く・URLをコピーを選ぶ版（面談用ページの出稼ぎ用／在籍用など） */
  variants?: MenuItemLeaf[];
}

interface MenuSubGroup {
  groupLabel: string;
  items: MenuItemLeaf[];
}

interface MenuItem {
  href?: string;
  label: string;
  icon: LucideIcon;
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
      // 予約一覧（以前のWEB予約受付）・空き枠・エスたま自動化履歴はスケジュールダッシュボードのタブ
      { href: "/schedule-dashboard", label: "スケジュールダッシュボード" },
      { href: "/admin-schedule", label: "日別予約情報" },
      { href: "/schedule/monthly-shift", label: "月別シフト" },
    ],
  },
  {
    label: "HP",
    icon: Globe,
    children: [
      { href: "/hp/business-flow", label: "業務フロー" },
      { href: "/hp/dashboard", label: "HPダッシュボード" },
      { href: "/hp/x-operations", label: "X運用表" },
    ],
  },
  {
    // SMSの機能はここにまとめる（受信箱・自動送信テンプレート（予約確定・サンクス・クーポン）・送信履歴）
    label: "SMS・LINE",
    icon: MessageSquare,
    children: [
      { href: "/sms", label: "受信箱・送信" },
      { href: "/line-inbox", label: "LINE対応（公式LINE）" },
      { href: "/system/sms-auto", label: "自動送信・サンクス・クーポン" },
      { href: "/system/sms", label: "送信履歴" },
    ],
  },
  {
    href: "/sales",
    label: "売上ダッシュボード",
    icon: TrendingUp,
  },
  {
    href: "/image-stock",
    label: "画像ストック",
    icon: Images,
  },
  {
    href: "/marketing/media",
    label: "媒体攻略",
    icon: Megaphone,
  },
  {
    href: "/inquiry-stats",
    label: "問い合わせ集計",
    icon: BarChart3,
  },
  {
    href: "/system/dashboard",
    label: "設定ダッシュボード",
    icon: Cpu,
  },
  {
    href: "/knowledge/dashboard",
    label: "ナレッジダッシュボード",
    icon: ClipboardList,
  },
  {
    href: "/therapists/dashboard",
    label: "セラピストダッシュボード",
    icon: UserCircle,
  },
  {
    label: "顧客",
    icon: Users,
    children: [
      { href: "/database/customers", label: "顧客一覧" },
      { href: "/database/customers?tab=preferences", label: "好み" },
      { href: "/database/customers?tab=sales", label: "営業" },
      { href: "/database/surveys", label: "アンケート" },
      { href: "/database/reviews", label: "口コミ" },
    ],
  },
];

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { signOut } = useAuth();
  const { store: adminStore } = useAdminStore();
  const smsUnread = useSmsUnread();
  // 「サイトを見る」は所属店舗の公開サイトへ（艶華なら enka-salon.jp）
  const siteUrl = adminStore?.custom_domain ? `https://${adminStore.custom_domain}` : "/";
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
                      {item.label === "SMS・LINE" && smsUnread > 0 && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {smsUnread > 99 ? "99+" : smsUnread}
                        </span>
                      )}
                      <ChevronDown
                        size={14}
                        className={cn("ml-auto transition-transform", isExpanded ? "rotate-180" : "")}
                      />
                    </button>
                  ) : (
                    <Link
                      to={item.href || "#"}
                      onClick={onClose}
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
                            {child.variants ? (
                              <SidebarLinkVariants child={child} active={isChildCurrentPath} onClose={onClose} />
                            ) : (
                            <Link
                              to={child.href}
                              onClick={onClose}
                              className={cn(
                                "block px-3 py-1.5 text-xs rounded-md transition-colors",
                                isChildCurrentPath
                                  ? "text-primary bg-primary/10 font-semibold"
                                  : "text-foreground/70 hover:bg-muted/50"
                              )}
                            >
                              {child.label}
                              {child.href === "/sms" && smsUnread > 0 && (
                                <span className="ml-1.5 inline-flex min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold items-center justify-center">
                                  {smsUnread > 99 ? "99+" : smsUnread}
                                </span>
                              )}
                            </Link>
                            )}
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
                                      onClick={onClose}
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

            <a
              href={siteUrl}
              target={siteUrl.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/50 rounded-md transition-colors"
            >
              <ExternalLink size={16} />
              サイトを見る
            </a>

            {/* エステ魂の店舗管理画面（新しいタブ。ログインが切れていればエステ魂のログイン画面になる） */}
            <a
              href="https://estama.jp/admin/"
              target="_blank"
              rel="noopener"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/50 rounded-md transition-colors"
            >
              <ExternalLink size={16} />
              エステ魂 管理画面
            </a>

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
