import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Phone, Calendar } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";

interface BackRate {
  id: string;
  course_type: string;
  duration: number;
  customer_price: number;
}

interface OptionRate {
  id: string;
  option_name: string;
  customer_price: number;
}

interface NominationRate {
  id: string;
  nomination_type: string;
  customer_price: number;
}

const System = () => {
  const [backRates, setBackRates] = useState<BackRate[]>([]);
  const [optionRates, setOptionRates] = useState<OptionRate[]>([]);
  const [nominationRates, setNominationRates] = useState<NominationRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = "全力エステ - システム"; }, []);

  useEffect(() => { fetchPricing(); }, []);

  const fetchPricing = async () => {
    try {
      const [backRes, optionRes, nominationRes] = await Promise.all([
        supabase.rpc('get_public_back_rates'),
        supabase.from('option_rates').select('*').order('created_at', { ascending: true }),
        supabase.from('nomination_rates').select('*').order('created_at', { ascending: true }),
      ]);
      if (backRes.error) throw backRes.error;
      if (optionRes.error) throw optionRes.error;
      if (nominationRes.error) throw nominationRes.error;
      setBackRates((backRes.data || []) as any);
      setOptionRates(optionRes.data || []);
      setNominationRates(nominationRes.data || []);
    } catch (error) {
      console.error('Error fetching pricing:', error);
    } finally {
      setLoading(false);
    }
  };

  const courseTypes = [...new Set(backRates.filter(r => r.course_type !== 'DR').map(r => r.course_type))];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "#f8f6f3" }}>
      <PublicNavigation />

      <main className="container mx-auto px-3 md:px-4 py-5 md:py-12 max-w-3xl">
        <div className="bg-white rounded-lg shadow-lg p-4 md:p-8 mb-5 md:mb-8">
          <div className="text-center mb-5 md:mb-8">
            <h1 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2" style={{ color: "#7a706c", fontFamily: "'Noto Serif JP', serif", letterSpacing: "0.2em" }}>SYSTEM</h1>
            <p className="text-sm" style={{ color: "#a89586", letterSpacing: "0.1em" }}>料金システム</p>
          </div>

          <div className="text-center mb-12">
            <h2 className="text-5xl font-bold mb-2" style={{ color: "#c49480", fontFamily: "'Noto Serif JP', serif", letterSpacing: "0.1em" }}>全力エステ</h2>
          </div>

          {/* コース別料金（back_ratesマスター） */}
          {courseTypes.map((type) => {
            const rates = backRates.filter(r => r.course_type === type).sort((a, b) => a.duration - b.duration);
            return (
              <div key={type} className="mb-10">
                <div className="bg-[#c49480] text-white text-center py-2.5 mb-4 rounded">
                  <h3 className="font-bold text-base" style={{ letterSpacing: "0.1em" }}>{type}コース</h3>
                </div>
                <div className="space-y-2">
                  {rates.map((rate) => (
                    <div key={rate.id} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                      <span className="text-gray-700 text-sm">{rate.duration}min</span>
                      <span className="text-gray-700 font-bold text-sm">¥{rate.customer_price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* DRコース */}
          {backRates.filter(r => r.course_type === 'DR').length > 0 && (
            <div className="mb-10">
              <div className="bg-[#c49480] text-white text-center py-2.5 mb-4 rounded">
                <h3 className="font-bold text-base" style={{ letterSpacing: "0.1em" }}>DRコース</h3>
              </div>
              <div className="space-y-2">
                {backRates.filter(r => r.course_type === 'DR').sort((a, b) => a.duration - b.duration).map((rate) => (
                  <div key={rate.id} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                    <span className="text-gray-700 text-sm">{rate.duration}min</span>
                    <span className="text-gray-700 font-bold text-sm">¥{rate.customer_price.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* オプション（option_ratesマスター） */}
          <div className="mb-10">
            <div className="bg-[#c49480] text-white text-center py-2.5 mb-4 rounded">
              <h3 className="font-bold text-base" style={{ letterSpacing: "0.1em" }}>オプションメニュー</h3>
            </div>
            <div className="space-y-2">
              {optionRates.map((opt) => (
                <div key={opt.id} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                  <span className="text-gray-700 text-sm">{opt.option_name}</span>
                  <span className="text-gray-700 font-bold text-sm">¥{opt.customer_price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 指名料（nomination_ratesマスター） */}
          {nominationRates.length > 0 && (
            <div className="mb-10">
              <div className="bg-[#c49480] text-white text-center py-2.5 mb-4 rounded">
                <h3 className="font-bold text-base" style={{ letterSpacing: "0.1em" }}>指名料</h3>
              </div>
              <div className="space-y-2">
                {nominationRates.map((nom) => (
                  <div key={nom.id} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                    <span className="text-gray-700 text-sm">{nom.nomination_type}</span>
                    <span className="text-gray-700 font-bold text-sm">¥{nom.customer_price.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment */}
          <div className="mb-10">
            <div className="bg-[#c49480] text-white text-center py-2.5 mb-4 rounded">
              <h3 className="font-bold text-base" style={{ letterSpacing: "0.1em" }}>お支払い</h3>
            </div>
            <div className="space-y-2">
              {['現金', 'クレジット', '電子マネー'].map((m) => (
                <div key={m} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                  <span className="text-gray-700 text-sm">{m}</span>
                  <span className="text-gray-700 text-sm">◯</span>
                </div>
              ))}
            </div>
          </div>

          {/* Flow */}
          <div className="mb-10">
            <div className="text-center mb-4">
              <h3 className="text-xl md:text-2xl font-bold" style={{ color: "#7a706c", fontFamily: "'Noto Serif JP', serif", letterSpacing: "0.2em" }}>FLOW</h3>
              <p className="text-xs mt-1" style={{ color: "#a89586" }}>ご利用方法</p>
            </div>
            <div className="space-y-4 text-sm text-gray-700">
              <div className="border-l-4 border-[#c49480] pl-4">
                <p className="font-bold mb-1">「当店ご利用方法」</p>
                <p>「ご予約方法」</p>
                <p>お電話/WEBにてご予約をお取りになります。</p>
              </div>
              <div className="border-l-4 border-[#c49480] pl-4">
                <p className="font-bold mb-1">「お部屋」</p>
                <p>近郊ホテル/出張専門</p>
                <p>お部屋のご用意/ご移動がない場合はご自宅にも出張が可能です。</p>
              </div>
            </div>
          </div>

          {/* Notice */}
          <div className="mb-10">
            <div className="text-center mb-4">
              <h3 className="text-xl md:text-2xl font-bold" style={{ color: "#7a706c", fontFamily: "'Noto Serif JP', serif", letterSpacing: "0.2em" }}>NOTICE</h3>
              <p className="text-xs mt-1" style={{ color: "#a89586" }}>注意事項</p>
            </div>
            <div className="text-xs text-gray-600 leading-relaxed space-y-2">
              <p className="font-bold">【ご利用規則】</p>
              <p>仙台リラクゼーションサロン【全力エステ】（以下「当店」といいます。）を、ご利用いただく際には、本利用規約に同意されたものとみなします。</p>
              <p>※コース内にシャワーのお時間は含まれますのでご了承ください。</p>
              <p>※18歳未満の方、スカウト目的の方、同業者、暴力団関係者、泥酔者、薬物使用者、その他当店が相応しくないと判断した方の、お問い合わせ及びご利用は固くお断り致します。</p>
              <p>※当店は、番号非通知及び公衆電話からの受付は致しかねます。</p>
              <p>※当店は、リラクゼーションを目的とした施術を提供するプライベートサロンであり、医療行為、治療行為、風俗的なサービス等は一切行なっておりません。</p>
              <p>※セラピストの引き抜き行為やスカウト行為が発覚した場合は、例外なく損害賠償請求、法的措置等も視野にいれた然るべき対応をとらせていただきます。</p>
              <p>※セラピストとの個人的な連絡先交換や店外へのお誘いは堅くお断り致します。</p>
              <p>※盗撮や盗聴等の行為があった際は、所轄警察署に被害届を提出し、法的手続きをとらせていただきます。</p>
              <p className="font-bold mt-3">【対応言語について】</p>
              <p>日本語のみ対応しております。</p>
            </div>
          </div>

          {/* Shop Info */}
          <div className="mb-8">
            <div className="text-center mb-4">
              <h3 className="text-xl md:text-2xl font-bold" style={{ color: "#7a706c", fontFamily: "'Noto Serif JP', serif", letterSpacing: "0.2em" }}>SHOP</h3>
              <p className="text-xs mt-1" style={{ color: "#a89586" }}>店舗情報</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ['店舗名', '全力エステ 仙台'],
                    ['URL', null],
                    ['営業時間', '12:00〜26:00(24:40最終受付)'],
                    ['TEL', null],
                    ['最寄り駅', '北四番丁駅｜勾当台公園駅｜仙台駅'],
                    ['定休日', '年中無休'],
                    ['エリア', '出張専門'],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b border-gray-100">
                      <td className="py-3 px-4 font-bold text-[#7a706c] w-1/3 bg-[#faf5f2] align-top">{k}</td>
                      <td className="py-3 px-4 text-gray-700">
                        {k === 'URL' ? (
                          <a href="https://zenryoku-esthe.com" className="text-blue-600 hover:underline">https://zenryoku-esthe.com</a>
                        ) : k === 'TEL' ? (
                          <a href="tel:09081264042" className="hover:underline">090-8126-4042</a>
                        ) : v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="tel:09081264042">
              <Button size="lg" className="gap-2 min-w-[200px] bg-[#c49480] hover:bg-[#a87b65]">
                <Phone size={20} />電話で予約
              </Button>
            </a>
            <Link to="/casts">
              <Button size="lg" variant="outline" className="gap-2 min-w-[200px] border-[#c49480] text-[#7a706c] hover:bg-[#f8f6f3]">
                <Calendar size={20} />キャスト一覧
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <PublicFooter />
      <FixedBottomBar />
    </div>
  );
};

export default System;