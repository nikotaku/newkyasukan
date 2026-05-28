export const PublicFooter = () => {
  return (
    <footer className="text-white" style={{ backgroundColor: "#242220" }}>
      {/* SNS Icons */}
      <div className="container mx-auto px-4 py-5 max-w-4xl">
        <div className="flex justify-center gap-4">
          <a
            href="https://lin.ee/RdRhmXw"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80"
          >
            <img
              src="https://storage.googleapis.com/caskan/asset/line_icon.png"
              alt="LINE"
              className="w-9 h-9"
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
              className="w-9 h-9"
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
