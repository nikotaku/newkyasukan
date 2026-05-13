import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { MapPin, Train, Clock, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FaXTwitter, FaLine } from "react-icons/fa6";
import { ChatBot } from "@/components/ChatBot";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { supabase } from "@/integrations/supabase/client";

interface StoreInfo {
  name: string;
  address: string;
  phone: string;
  hours: string;
  holiday: string;
  twitter_url?: string;
  line_url?: string;
}

const DEFAULTS: StoreInfo = {
  name: "全力エステ 仙台",
  address: "宮城県仙台市青葉区（出張専門）",
  phone: "090-8126-4042",
  hours: "12:00〜26:00（24:40最終受付）",
  holiday: "年中無休",
  twitter_url: "https://twitter.com/zr_news1",
  line_url: "https://lin.ee/RdRhmXw",
};

const Access = () => {
  const [store, setStore] = useState<StoreInfo>(DEFAULTS);

  useEffect(() => {
    document.title = "全力エステ - アクセス";
  }, []);

  useEffect(() => {
    supabase
      .from("store_info")
      .select("name, address, phone, hours, holiday, twitter_url, line_url")
      .single()
      .then(({ data }) => {
        if (data) {
          setStore({
            name: data.name || DEFAULTS.name,
            address: data.address || DEFAULTS.address,
            phone: data.phone || DEFAULTS.phone,
            hours: data.hours || DEFAULTS.hours,
            holiday: data.holiday || DEFAULTS.holiday,
            twitter_url: (data as any).twitter_url || DEFAULTS.twitter_url,
            line_url: (data as any).line_url || DEFAULTS.line_url,
          });
        }
      })
      .catch(() => {});
  }, []);

  const phoneRaw = store.phone.replace(/[-\s]/g, "");
  const twitterUrl = store.twitter_url || DEFAULTS.twitter_url!;
  const lineUrl = store.line_url || DEFAULTS.line_url!;

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "#f8f6f3" }}>
      <PublicNavigation />

      <div className="container mx-auto px-3 md:px-4 py-5 md:py-10">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl md:text-4xl font-bold text-center mb-2 md:mb-4" style={{ color: "#7a706c" }}>ACCESS</h1>
          <p className="text-center text-[#a89586] mb-5 md:mb-10 text-sm md:text-base">アクセス</p>

          <Card className="mb-8 border-[#e5d5cc] bg-white">
            <CardHeader>
              <CardTitle className="text-2xl" style={{ color: "#7a706c" }}>店舗情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start gap-4">
                <MapPin className="w-6 h-6 mt-1 flex-shrink-0" style={{ color: "#c49480" }} />
                <div>
                  <h3 className="font-semibold mb-2" style={{ color: "#7a706c" }}>所在地</h3>
                  <p className="text-[#6b5b4a]">{store.address}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Train className="w-6 h-6 mt-1 flex-shrink-0" style={{ color: "#c49480" }} />
                <div>
                  <h3 className="font-semibold mb-2" style={{ color: "#7a706c" }}>最寄り駅</h3>
                  <p className="text-[#6b5b4a]">北四番丁駅｜勾当台公園駅｜仙台駅</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Clock className="w-6 h-6 mt-1 flex-shrink-0" style={{ color: "#c49480" }} />
                <div>
                  <h3 className="font-semibold mb-2" style={{ color: "#7a706c" }}>営業時間</h3>
                  <p className="text-[#6b5b4a]">{store.hours}</p>
                  <p className="text-sm text-[#a89586]">定休日：{store.holiday}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Phone className="w-6 h-6 mt-1 flex-shrink-0" style={{ color: "#c49480" }} />
                <div>
                  <h3 className="font-semibold mb-2" style={{ color: "#7a706c" }}>電話番号</h3>
                  <a href={`tel:${phoneRaw}`} className="text-[#6b5b4a] hover:underline">
                    {store.phone}
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-8 border-[#e5d5cc] bg-white">
            <CardHeader>
              <CardTitle className="text-2xl" style={{ color: "#7a706c" }}>エリア</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full h-[400px] bg-[#f8f6f3] rounded-lg">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3131.8!2d140.8697!3d38.2721!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2z5LuZ5Y-w5biC6Z2S6JGJ5Yy65LqM5pel55S6!5e0!3m2!1sja!2sjp!4v1"
                  width="100%"
                  height="100%"
                  style={{ border: 0, borderRadius: "0.5rem" }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="エリア地図"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#e5d5cc]" style={{ backgroundColor: "#fff9f5" }}>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-4 text-lg" style={{ color: "#7a706c" }}>アクセスに関して</h3>
              <ul className="space-y-2 text-[#6b5b4a]">
                <li className="flex items-start"><span className="mr-2">•</span><span>詳細な場所は予約確定後にご案内いたします</span></li>
                <li className="flex items-start"><span className="mr-2">•</span><span>迷われた際はお気軽にお電話ください</span></li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="py-8 md:py-14 text-center" style={{ backgroundColor: "#edddd6" }}>
        <div className="container mx-auto px-3 md:px-4">
          <h2 className="text-xl md:text-3xl font-bold mb-5 md:mb-8" style={{ color: "#7a706c" }}>ご予約・お問い合わせ</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a href={lineUrl} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="gap-2 px-8 py-6 text-lg" style={{ backgroundColor: "#06C755", color: "white" }}>
                <FaLine className="w-6 h-6" />LINEで予約
              </Button>
            </a>
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="gap-2 px-8 py-6 text-lg bg-black text-white hover:bg-gray-800">
                <FaXTwitter className="w-6 h-6" />Xをフォロー
              </Button>
            </a>
          </div>
          <div className="mt-8">
            <Link to="/booking">
              <Button size="lg" className="px-8 py-6 text-lg" style={{ backgroundColor: "#c49480", color: "white" }}>WEB予約はこちら</Button>
            </Link>
          </div>
        </div>
      </div>

      <PublicFooter />
      <FixedBottomBar />
      <ChatBot />
    </div>
  );
};

export default Access;
