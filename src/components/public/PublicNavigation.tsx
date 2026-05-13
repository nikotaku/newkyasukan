import { Link, useLocation } from "react-router-dom";
import { Clock, Phone } from "lucide-react";
import { usePageTracking } from "@/hooks/usePageTracking";

const SHOP_LOGO = "https://cdn2-caskan.com/caskan/img/shop_logo/1401_logo_1750237137.png";

const RECRUIT_URL = "https://esjob.jp/shop/43923/";

const navItems = [
  { to: "/", label: "TOP", sub: "トップ", external: false },
  { to: "/schedule", label: "SCHEDULE", sub: "出勤情報", external: false },
  { to: "/casts", label: "THERAPIST", sub: "セラピスト", external: false },
  { to: "/system", label: "SYSTEM", sub: "料金システム", external: false },
  { to: "/access", label: "ACCESS", sub: "アクセス", external: false },
  { to: "/news", label: "NEWS", sub: "お知らせ", external: false },
  { to: RECRUIT_URL, label: "RECRUIT", sub: "求人情報", external: true },
  { to: "/booking", label: "RESERVE", sub: "Web予約", external: false },
];

export const PublicNavigation = () => {
  const location = useLocation();
  usePageTracking();

  return (
    <>
      {/* Logo Header with right-aligned business info (公式準拠) */}
      <div
        className="relative py-8 md:py-12 border-b border-[#3a3634]"
        style={{
          background:
            "linear-gradient(135deg, #2e2b29 0%, #242220 50%, #2e2b29 100%)",
        }}
      >
        <div className="container mx-auto px-4">
          {/* PC: business info top-right */}
          <div className="hidden md:flex absolute top-3 right-6 items-center gap-5 text-sm" style={{ color: "#c49480" }}>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={14} />
              12:00〜26:00(24:40最終受付)
            </span>
            <a
              href="tel:09081264042"
              className="inline-flex items-center gap-1.5 font-semibold hover:text-[#e8d5cb]"
              style={{ color: "#c49480" }}
            >
              <Phone size={14} />
              090-8126-4042
            </a>
          </div>

          {/* Logo - centered */}
          <Link to="/" className="block text-center">
            <img
              src={SHOP_LOGO}
              alt="全力エステ 仙台"
              className="h-20 md:h-36 mx-auto object-contain"
              loading="eager"
            />
          </Link>

          {/* SP: business info under logo */}
          <div className="md:hidden flex justify-center items-center gap-3 mt-3 text-[11px]" style={{ color: "#c49480" }}>
            <span className="inline-flex items-center gap-1">
              <Clock size={11} /> 12:00〜26:00
            </span>
            <a
              href="tel:09081264042"
              className="inline-flex items-center gap-1 font-semibold"
              style={{ color: "#c49480" }}
            >
              <Phone size={11} /> 090-8126-4042
            </a>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="bg-[#242220] border-b border-[#3a3634] sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto">
          {/* PC */}
          <div className="hidden md:flex justify-center items-center">
            {navItems.map((item) => {
              const isActive = !item.external && location.pathname === item.to;
              const cls = `px-5 py-3 text-center transition-colors border-b-2 ${
                isActive ? "bg-[#3a3634] border-[#c49480]" : "border-transparent hover:bg-[#3a3634] hover:border-[#c49480]"
              }`;
              const inner = (
                <>
                  <div className="text-[#d8ceca] font-semibold text-xs tracking-wider">{item.label}</div>
                  <div className="text-[10px] text-[#9a8c88]">{item.sub}</div>
                </>
              );
              return item.external
                ? <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
                : <Link key={item.to} to={item.to} className={cls}>{inner}</Link>;
            })}
          </div>

          {/* SP - 2行 */}
          <div className="md:hidden">
            {[navItems.slice(0, 4), navItems.slice(4)].map((group, gi) => (
              <div key={gi} className={`flex justify-center items-center flex-wrap ${gi > 0 ? "border-t border-[#3a3634]" : ""}`}>
                {group.map((item) => {
                  const isActive = !item.external && location.pathname === item.to;
                  const cls = `flex-1 py-2 text-center transition-colors border-b-2 ${
                    isActive ? "bg-[#3a3634] border-[#c49480]" : "border-transparent hover:bg-[#3a3634]"
                  }`;
                  const inner = (
                    <>
                      <div className="text-[#d8ceca] font-semibold text-[10px] tracking-wider">{item.label}</div>
                      <div className="text-[8px] text-[#9a8c88]">{item.sub}</div>
                    </>
                  );
                  return item.external
                    ? <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
                    : <Link key={item.to} to={item.to} className={cls}>{inner}</Link>;
                })}
              </div>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
};
