import { Link } from "react-router-dom";
import { useStoreContact } from "@/hooks/useStoreContact";
import { trackPublicEvent } from "@/lib/publicAnalytics";

export const FixedBottomBar = () => {
  const { telHref, lineUrl } = useStoreContact();
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--pub-card,#1a150f)] border-t border-[var(--pub-border,#3a2f1c)] shadow-[0_-2px_10px_rgba(0,0,0,0.1)] md:hidden">
      <div className="flex items-stretch">
        <a
          href={telHref}
          onClick={() => trackPublicEvent("booking_cta_click", { placement: "mobile_fixed_bar", method: "phone" })}
          className="flex-1 flex flex-col items-center justify-center py-2 text-[var(--pub-text,#f0e6d2)] hover:bg-[var(--pub-card2,#221b12)] transition-colors"
        >
          <span className="text-lg">📞</span>
          <span className="text-[10px] font-semibold">電話する</span>
        </a>
        <a
          href={lineUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackPublicEvent("booking_cta_click", { placement: "mobile_fixed_bar", method: "line" })}
          className="flex-1 flex flex-col items-center justify-center py-2 text-white"
          style={{ backgroundColor: "#06C755" }}
        >
          <img
            src="https://storage.googleapis.com/caskan/asset/line_icon.png"
            alt="LINE"
            className="w-6 h-6"
          />
          <span className="text-[10px] font-semibold">LINE予約</span>
        </a>
        <Link
          to="/booking"
          onClick={() => trackPublicEvent("booking_cta_click", { placement: "mobile_fixed_bar", method: "web" })}
          className="flex-1 flex flex-col items-center justify-center py-2 text-white"
          style={{ background: "linear-gradient(135deg, var(--pub-accent,#c6a15b), var(--pub-accent-deep,#a87c2a))" }}
        >
          <span className="text-lg">📅</span>
          <span className="text-[10px] font-semibold">Web予約</span>
        </Link>
      </div>
    </div>
  );
};
