import type { ComponentType } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, BookOpen, Flag, Coins, CreditCard, FileText, Gift, Layers, Megaphone, MinusCircle, Phone, PlusCircle, Sparkles, UserCheck } from "lucide-react";
import { AdminPageShell } from "@/components/AdminPageShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SystemRateMaster, { type RateSection } from "./SystemRateMaster";
import SystemDeductions from "./SystemDeductions";
import SystemCampaigns from "./SystemCampaigns";
import SystemAllowances from "./SystemAllowances";
import SystemReferralRewards from "./SystemReferralRewards";
import SystemPageContent from "./SystemPageContent";
import NotificationSettings from "./NotificationSettings";
import PhoneSettings from "./PhoneSettings";

// 設定ダッシュボード：システムの設定を1画面のタブにまとめる（?tab=...）。
// ALL は料金・割引・決済の正本（画像・PDFで保存できる）。コース・オプション・指名・割引・決済は正本の一部だけを出す。
type TabDef = {
  value: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  render: () => JSX.Element;
};

const rate = (section: RateSection) => () => <SystemRateMaster embedded section={section} />;

const TABS: TabDef[] = [
  { value: "all", label: "ALL", icon: BookOpen, render: rate("all") },
  { value: "course", label: "コースバック", icon: Coins, render: rate("course") },
  { value: "option", label: "オプション", icon: Sparkles, render: rate("option") },
  { value: "nomination", label: "指名", icon: UserCheck, render: rate("nomination") },
  { value: "discount", label: "割引", icon: Gift, render: rate("discount") },
  { value: "payment", label: "決済", icon: CreditCard, render: rate("payment") },
  { value: "campaign", label: "キャンペーン", icon: Flag, render: () => <SystemCampaigns embedded /> },
  { value: "deduction", label: "控除", icon: MinusCircle, render: () => <SystemDeductions embedded /> },
  { value: "allowance", label: "手当", icon: PlusCircle, render: () => <SystemAllowances embedded /> },
  { value: "referral", label: "広告費", icon: Megaphone, render: () => <SystemReferralRewards embedded /> },
  { value: "page", label: "料金ページ文言", icon: FileText, render: () => <SystemPageContent embedded /> },
  { value: "notifications", label: "スマホ通知", icon: Bell, render: () => <NotificationSettings embedded /> },
  { value: "phone", label: "電話", icon: Phone, render: () => <PhoneSettings embedded /> },
];

export const SETTINGS_TAB_VALUES = TABS.map((tab) => tab.value);

export default function SettingsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab = TABS.some((item) => item.value === requested) ? (requested as string) : "all";
  const current = TABS.find((item) => item.value === tab) ?? TABS[0];

  return (
    <AdminPageShell mainClassName="p-3 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-3 flex items-center gap-2 text-2xl font-bold"><Layers size={22} />設定ダッシュボード</h1>
        {/* タブを変えたら編集中の印（edit）は外す */}
        <Tabs value={tab} onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}>
          <div className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex h-auto w-max gap-1 p-1">
              {TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 text-[11px] sm:flex-row sm:gap-1.5 sm:py-2 sm:text-sm">
                  <Icon size={15} className="shrink-0" />
                  <span className="whitespace-nowrap">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {/* 開いているタブだけ描く（それぞれが自分のデータを読むため） */}
          <TabsContent value={current.value} className="mt-0">{current.render()}</TabsContent>
        </Tabs>
      </div>
    </AdminPageShell>
  );
}
