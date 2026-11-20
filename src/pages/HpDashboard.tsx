import { Navigate, useSearchParams } from "react-router-dom";
import { AdminPageShell } from "@/components/AdminPageShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HpTopBanners from "./HpTopBanners";
import HpLinkBanners from "./HpLinkBanners";
import ArticleCreation from "./ArticleCreation";
import HpBlogManagement from "./HpBlogManagement";
import PrDesk from "./PrDesk";
import { BannerManagement } from "@/components/BannerManagement";

const TABS = [
  { value: "news", label: "ニュース" },
  { value: "realtime", label: "AI広報部" },
  { value: "banners", label: "バナー" },
  { value: "blog", label: "店長ブログ" },
  { value: "links", label: "リンク" },
];

export default function HpDashboard() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.some(item => item.value === requested) ? requested! : "news";
  if (requested === "sns" || requested === "store") return <Navigate to={`/system/dashboard?tab=${requested}`} replace />;
  return (
    <AdminPageShell mainClassName="p-3 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 text-2xl font-bold">HPダッシュボード</h1>
        <Tabs value={tab} onValueChange={value => setParams({ tab: value }, { replace: true })}>
          <TabsList className="mb-4 flex h-auto w-full justify-start overflow-x-auto">
            {TABS.map(item => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="news"><ArticleCreation embedded /></TabsContent>
          <TabsContent value="realtime"><PrDesk /></TabsContent>
          <TabsContent value="banners"><HpTopBanners embedded /><BannerManagement /></TabsContent>
          <TabsContent value="blog"><HpBlogManagement embedded /></TabsContent>
          <TabsContent value="links"><HpLinkBanners embedded /></TabsContent>
        </Tabs>
      </div>
    </AdminPageShell>
  );
}
