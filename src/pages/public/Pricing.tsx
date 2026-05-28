import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Phone, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import caskanLogo from "@/assets/caskan-logo.png";
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

export default function Pricing() {
  const [backRates, setBackRates] = useState<BackRate[]>([]);
  const [optionRates, setOptionRates] = useState<OptionRate[]>([]);
  const [nominationRates, setNominationRates] = useState<NominationRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      const [backRes, optionRes, nomRes] = await Promise.all([
        supabase.rpc('get_public_back_rates'),
        supabase.from('option_rates').select('*').order('display_order', { ascending: true }),
        supabase.from('nomination_rates').select('*').order('created_at', { ascending: true }),
      ]);
      if (backRes.error) throw backRes.error;
      if (optionRes.error) throw optionRes.error;
      if (nomRes.error) throw nomRes.error;
      setBackRates((backRes.data || []) as any);
      setOptionRates(optionRes.data || []);
      setNominationRates(nomRes.data || []);
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "#f8f6f3" }}>
      <PublicNavigation />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2" style={{ color: "#7a706c", fontFamily: "'Noto Serif JP', serif", letterSpacing: "0.2em" }}>SYSTEM</h1>
            <p className="text-sm" style={{ color: "#a89586", letterSpacing: "0.1em" }}>料金システム</p>
          </div>

          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-2" style={{ color: "#c49480", fontFamily: "'Noto Serif JP', serif", letterSpacing: "0.1em" }}>全力エステ</h2>
          </div>

          {/* コース別料金（back_ratesマスター） */}
          {courseTypes.map((type) => {
            const rates = backRates.filter(r => r.course_type === type).sort((a, b) => a.duration - b.duration);
            return (
              <div key={type} className="mb-12">
                <div className="bg-[#c49480] text-white text-center py-3 mb-6">
                  <h3 className="font-bold text-lg" style={{ letterSpacing: "0.1em" }}>{type}コース</h3>
                </div>
                <div className="space-y-3">
                  {rates.map((rate) => (
                    <div key={rate.id} className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-700 font-medium">{rate.duration}min</span>
                      <span className="text-gray-700 font-bold">¥{rate.customer_price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* DRコース */}
          {backRates.filter(r => r.course_type === 'DR').length > 0 && (
            <div className="mb-12">
              <div className="bg-[#c49480] text-white text-center py-3 mb-6">
                <h3 className="font-bold text-lg" style={{ letterSpacing: "0.1em" }}>DRコース</h3>
              </div>
              <div className="space-y-3">
                {backRates.filter(r => r.course_type === 'DR').sort((a, b) => a.duration - b.duration).map((rate) => (
                  <div key={rate.id} className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-gray-700 font-medium">{rate.duration}min</span>
                    <span className="text-gray-700 font-bold">¥{rate.customer_price.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Options（option_ratesマスター） */}
          <div className="mb-12">
            <div className="bg-[#c49480] text-white text-center py-3 mb-6">
              <h3 className="font-bold text-lg" style={{ letterSpacing: "0.1em" }}>オプションメニュー</h3>
            </div>
            <div className="space-y-3">
              {optionRates.map((opt) => (
                <div key={opt.id} className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-gray-700 font-medium">{opt.option_name}</span>
                  <span className="text-gray-700 font-bold">¥{opt.customer_price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 指名料（nomination_ratesマスター） */}
          {nominationRates.length > 0 && (
            <div className="mb-12">
              <div className="bg-[#c49480] text-white text-center py-3 mb-6">
                <h3 className="font-bold text-lg" style={{ letterSpacing: "0.1em" }}>指名料</h3>
              </div>
              <div className="space-y-3">
                {nominationRates.map((nom) => (
                  <div key={nom.id} className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-gray-700 font-medium">{nom.nomination_type}</span>
                    <span className="text-gray-700 font-bold">¥{nom.customer_price.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Methods */}
          <div className="mb-12">
            <div className="bg-[#c49480] text-white text-center py-3 mb-6">
              <h3 className="font-bold text-lg" style={{ letterSpacing: "0.1em" }}>お支払い</h3>
            </div>
            <div className="space-y-3">
              {['現金', 'クレジット', '電子マネー'].map((m) => (
                <div key={m} className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-gray-700">{m}</span>
                  <span className="text-gray-700">◯</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA Buttons */}
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
}