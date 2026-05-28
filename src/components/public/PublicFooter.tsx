export const PublicFooter = () => {
  return (
    <footer className="text-white" style={{ backgroundColor: "#242220" }}>
      {/* Shop Info */}
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <div className="text-center mb-8">
          <h3
            className="text-2xl font-bold mb-1"
            style={{ letterSpacing: "0.1em" }}
          >
            全力エステ 仙台
          </h3>
          <p className="text-sm text-white/80">
            12:00〜26:00(24:40最終受付)
          </p>
          <a
            href="tel:09081264042"
            className="text-lg font-bold mt-2 inline-block hover:opacity-80"
            style={{ color: "#c49480" }}
          >
            090-8126-4042
          </a>
        </div>

        {/* SNS Icons */}
        <div className="flex justify-center gap-4 mb-8">
          <a
            href="https://lin.ee/RdRhmXw"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80"
          >
            <img
              src="https://storage.googleapis.com/caskan/asset/line_icon.png"
              alt="LINE"
              className="w-10 h-10"
            />
          </a>
          <a
            href="https://twitter.com/zr_sendai"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80"
          >
            <img
              src="https://cdn2-caskan.com/caskan/asset/sns/x.png"
              alt="X"
              className="w-10 h-10"
            />
          </a>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
        © 2025 全力エステ 仙台. All rights reserved.
      </div>
    </footer>
  );
};
