import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Armchair, Boxes, DoorOpen, Package, Shirt, ShoppingCart } from "lucide-react";
import { AdminPageShell } from "@/components/AdminPageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgeOverview } from "@/components/knowledge/KnowledgeOverview";
import Knowledge from "./Knowledge";
import TextTemplates from "./TextTemplates";
import PasswordDatabase from "./PasswordDatabase";
import FacilitiesContracts from "./FacilitiesContracts";
import BusinessFixedCosts from "./BusinessFixedCosts";
import BusinessBankAccounts from "./BusinessBankAccounts";
import PurchaseOrders from "./PurchaseOrders";

// ナレッジダッシュボード（/knowledge/dashboard）：以前の「引き継ぎセンター」を1ページのタブにまとめた（設定・HPダッシュボードと同じ作り）。
// 中身は今までの各ページを embedded で入れている。以前のURLは App.tsx で該当のタブへ転送する。
const TABS = [
  { value: "overview", label: "概要" },
  { value: "knowledge", label: "ナレッジ" },
  { value: "templates", label: "テンプレート" },
  { value: "passwords", label: "ID・パスワード" },
  { value: "contracts", label: "契約" },
  { value: "money", label: "お金" },
  { value: "rooms", label: "ルーム・備品" },
  { value: "orders", label: "発注" },
];

const ROOM_LINKS = [
  { href: "/facilities/rooms", label: "ルーム管理", sub: "住所・入室案内・道順・Wi-Fi", icon: DoorOpen },
  { href: "/facilities/rooms?tab=inroom", label: "艶月（二日町）", sub: "ルームの詳細", icon: DoorOpen },
  { href: "/facilities/rooms?tab=lazy", label: "華月（春日町）", sub: "ルームの詳細", icon: DoorOpen },
  { href: "/facilities/rooms?tab=supplies", label: "備品登録", sub: "ルームごとの備品", icon: Boxes },
  { href: "/facilities/equipment", label: "消耗品", sub: "在庫・発注の目安", icon: Package },
  { href: "/facilities/equipment?type=costumes", label: "衣装", sub: "サイズ・枚数", icon: Shirt },
  { href: "/facilities/equipment?type=furniture", label: "什器・家具家電", sub: "置いているもの", icon: Armchair },
  { href: "/knowledge/dashboard?tab=orders", label: "発注リスト", sub: "買うもの・買ったもの", icon: ShoppingCart },
];

export default function KnowledgeDashboard() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.some((item) => item.value === requested) ? requested! : "overview";

  const openTab = useCallback((next: string, extra?: Record<string, string>) => {
    setParams({ tab: next, ...(extra ?? {}) });
    window.scrollTo({ top: 0 });
  }, [setParams]);

  return (
    <AdminPageShell mainClassName="p-3 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 text-2xl font-bold">ナレッジダッシュボード</h1>
        <Tabs value={tab} onValueChange={(value) => setParams({ tab: value }, { replace: true })}>
          <TabsList className="mb-4 flex h-auto w-full justify-start overflow-x-auto">
            {TABS.map((item) => <TabsTrigger key={item.value} value={item.value} className="shrink-0">{item.label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="overview"><KnowledgeOverview onOpen={openTab} /></TabsContent>
          <TabsContent value="knowledge">{tab === "knowledge" && <Knowledge embedded initialArticleId={params.get("article")} />}</TabsContent>
          <TabsContent value="templates"><TextTemplates embedded /></TabsContent>
          <TabsContent value="passwords">{tab === "passwords" && <PasswordDatabase embedded initialQuery={params.get("q") ?? ""} />}</TabsContent>
          <TabsContent value="contracts"><FacilitiesContracts embedded /></TabsContent>
          <TabsContent value="money" className="space-y-8">
            <BusinessFixedCosts embedded />
            <BusinessBankAccounts embedded />
          </TabsContent>
          <TabsContent value="rooms">
            <div className="grid gap-3 sm:grid-cols-2">
              {ROOM_LINKS.map(({ href, label, sub, icon: Icon }) => (
                <Link key={href} to={href}>
                  <Card className="h-full transition-colors hover:border-primary/40">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon size={18} /></div>
                      <div className="min-w-0">
                        <p className="font-semibold">{label}</p>
                        <p className="text-xs text-muted-foreground">{sub}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="orders"><PurchaseOrders embedded /></TabsContent>
        </Tabs>
      </div>
    </AdminPageShell>
  );
}
