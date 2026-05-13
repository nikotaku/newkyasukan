import { Link } from "react-router-dom";

export const FixedBottomBar = () => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#e5d5cc] shadow-[0_-2px_10px_rgba(0,0,0,0.1)] md:hidden">
      <div className="flex items-stretch">
        <a
          href="tel:09081264042"
          className="flex-1 flex flex-col items-center justify-center py-2 text-[#7a706c] hover:bg-[#f2e4de] transition-colors"
        >
          <span className="text-lg">📞</span>
          <span className="text-[10px] font-semibold">電話する</span>
        </a>
        <a
          href="https://lin.ee/RdRhmXw"
          target="_blank"
          rel="noopener noreferrer"
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
          className="flex-1 flex flex-col items-center justify-center py-2 text-white"
          style={{ background: "linear-gradient(135deg, #c49480, #a87b65)" }}
        >
          <span className="text-lg">📅</span>
          <span className="text-[10px] font-semibold">Web予約</span>
        </Link>
      </div>
    </div>
  );
};
