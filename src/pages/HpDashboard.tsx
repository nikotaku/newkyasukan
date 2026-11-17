import { useSearchParams } from "react-router-dom";
import { Image, Link2, Newspaper, PenLine, Share2, Store } from "lucide-react";
import { AdminPageShell } from "@/components/AdminPageShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StoreInfo from "./StoreInfo";
import HpSnsLinks from "./HpSnsLinks";
import HpTopBanners from "./HpTopBanners";
import ArticleCreation from "./ArticleCreation";
import HpBlogManagement from "./HpBlogManagement";
import HpLinkBanners from "./HpLinkBanners";
import { BannerManagement } from "@/components/BannerManagement";

// ホームページダッシュボード：店舗情報・店舗SNSリンク・トップバナー・ニュース作成・店長ブログ・リンク一覧（他社バナー）をタブでまとめる（?tab=store|sns|banners|news|blog|links）。
// 以前の個別のページ（/hp/store-info など）はここのタブへ転送する。
// 「バナー」タブはトップページのバナー（stores.settings）と、キャンペーン・おすすめメニューのバナー（banners 表。以前の「ホームページ管理」/design・「おすすめメニュー」）の両方。
const TABS = [
  { value: "store", label: "店舗情報", icon: Store },
  { value: "sns", label: "SNS", icon: Share2 },
  { value: "banners", label: "バナー", icon: Image },
  { value: "news", label: "ニュース", icon: Newspaper },
  { value: "blog", label: "店長ブログ", icon: PenLine },
  { value: "links", label: "リンク", icon: Link2 },
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
          <TabsList className="mb-4 grid h-auto w-full grid-cols-3 sm:grid-cols-6">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[11px] sm:flex-row sm:gap-1.5 sm:py-2 sm:text-sm">
                <Icon size={15} className="shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="store"><StoreInfo embedded /></TabsContent>
          <TabsContent value="sns"><HpSnsLinks embedded /></TabsContent>
          <TabsContent value="banners">
            <HpTopBanners embedded />
            <div className="mt-6">
              <BannerManagement />
            </div>
          </TabsContent>
          <TabsContent value="news"><ArticleCreation embedded /></TabsContent>
          <TabsContent value="blog"><HpBlogManagement embedded /></TabsContent>
          <TabsContent value="links"><HpLinkBanners embedded /></TabsContent>
        </Tabs>
      </div>
    </AdminPageShell>
  );
}
