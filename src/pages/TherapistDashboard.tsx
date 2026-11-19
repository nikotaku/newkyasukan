import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, UserCircle } from "lucide-react";
import { AdminPageShell } from "@/components/AdminPageShell";
import { SidebarLinkVariants } from "@/components/SidebarLinkVariants";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const groups = [
  { id: "operations", label: "運営・連絡", links: [
    { href: "/staff", label: "セラピスト一覧" },
    { href: "/therapist-notices", label: "お知らせ（マイページ掲示板）" },
    { href: "/promotion-schedule", label: "投稿宣伝スケジュール" },
  ] },
  { id: "training", label: "教育・投稿", links: [
    { href: "/education", label: "教育・媒体登録・SNS連携" },
    { href: "/post-management", label: "一括投稿管理" },
    { href: "/panel-manual", label: "パネル撮影マニュアル" },
    { href: "/service-manual", label: "接客マニュアル" },
  ] },
  { id: "recruitment", label: "採用・面談", links: [
    { href: "/recruitment-criteria", label: "採用基準確認シート" },
    { href: "/recruit-talk", label: "求人LP" },
    { href: "/recruit-scout", label: "引き抜きDM" },
    { href: "/recruit/estama-scout", label: "エステ魂スカウト" },
    { href: "/marketing/recruit-lp", label: "求人LP A/B分析" },
  ] },
];

const interview = {
  label: "面談用ページ（画面共有）",
  href: "/interview",
  variants: [
    { href: "/interview?type=dekasegi", label: "出稼ぎ用" },
    { href: "/interview?type=zaiseki", label: "在籍用" },
  ],
};

export default function TherapistDashboard() {
  const [params, setParams] = useSearchParams();
  const active = groups.find(group => group.id === params.get("tab"))?.id ?? "all";
  const visible = groups.filter(group => active === "all" || group.id === active);
  return (
    <AdminPageShell mainClassName="px-3 pb-6 sm:px-6">
      <div className="mx-auto max-w-5xl pt-4">
        <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold"><UserCircle size={22} />セラピストダッシュボード</h1>
        <Tabs value={active} onValueChange={tab => setParams(tab === "all" ? {} : { tab }, { replace: true })}>
          <TabsList className="flex h-auto w-fit max-w-full flex-wrap justify-start">
            <TabsTrigger value="all">すべて</TabsTrigger>
            {groups.map(group => <TabsTrigger key={group.id} value={group.id}>{group.label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value={active} className="space-y-6 pt-3">
            {visible.map(group => (
              <section key={group.id}>
                <h2 className="mb-2 text-base font-semibold">{group.label}</h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.links.map(link => (
                    <Link key={link.href} to={link.href} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm font-medium hover:border-primary hover:text-primary">
                      {link.label}<ChevronRight size={16} aria-hidden="true" />
                    </Link>
                  ))}
                  {group.id === "recruitment" && (
                    <div className="rounded-lg border bg-card p-2">
                      <SidebarLinkVariants child={interview} active={false} />
                    </div>
                  )}
                </div>
              </section>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AdminPageShell>
  );
}
