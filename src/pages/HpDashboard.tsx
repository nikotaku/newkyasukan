import { useSearchParams } from "react-router-dom";
import { Image, Newspaper, PenLine, Share2, Store } from "lucide-react";
import { AdminPageShell } from "@/components/AdminPageShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StoreInfo from "./StoreInfo";
import HpSnsLinks from "./HpSnsLinks";
import HpTopBanners from "./HpTopBanners";
import ArticleCreation from "./ArticleCreation";
import HpBlogManagement from "./HpBlogManagement";

// ホームページダッシュボード：店舗情報・店舗SNSリンク・トップバナー・ニュース作成・店長ブログをタブでまとめる（?tab=store|sns|banners|news|blog）。
// 以前の個別のページ（/hp/store-info など）はここのタブへ転送する。
const TABS = [
  { value: "store", label: "店舗情報", icon: Store },
  { value: "sns", label: "店舗SNS", icon: Share2 },
  { value: "banners", label: "バナー", icon: Image },
  { value: "news", label: "ニュース", icon: Newspaper },
  { value: "blog", label: "店長ブログ", icon: PenLine },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export default function HpDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: TabValue = TABS.some((t) => t.value === requested) ? (requested as TabValue) : "store";

  return (
    <AdminPageShell mainClassName="p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 text-2xl font-bold">ホームページダッシュボード</h1>
        <Tabs value={tab} onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}>
          <TabsList className="mb-4 grid h-auto w-full grid-cols-5">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="flex items-center gap-1.5 py-2 text-xs sm:text-sm">
                <Icon size={15} className="shrink-0" />
                <span className="truncate">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="store"><StoreInfo embedded /></TabsContent>
          <TabsContent value="sns"><HpSnsLinks embedded /></TabsContent>
          <TabsContent value="banners"><HpTopBanners embedded /></TabsContent>
          <TabsContent value="news"><ArticleCreation embedded /></TabsContent>
          <TabsContent value="blog"><HpBlogManagement embedded /></TabsContent>
        </Tabs>
      </div>
    </AdminPageShell>
  );
}
