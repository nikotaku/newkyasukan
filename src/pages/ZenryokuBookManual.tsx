import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import book1 from "@/assets/manual-book1.png";
import book3 from "@/assets/manual-book3.png";
import book4 from "@/assets/manual-book4.png";
import book5 from "@/assets/manual-book5.png";
import book14 from "@/assets/manual-book14.png";

const PAGES = [
  { id: 1, src: book1, label: "目次" },
  { id: 3, src: book3, label: "X作成時の注意点" },
  { id: 4, src: book4, label: "プロフィール作成時の注意点" },
  { id: 5, src: book5, label: "メニューについて" },
  { id: 14, src: book14, label: "バック表・料金表" },
];

export default function ZenryokuBookManual() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">全力BOOK</h1>
          <p className="text-muted-foreground text-sm mb-8">セラピスト向けマニュアル。画像をタップすると拡大表示できます。</p>

          <div className="space-y-8">
            {PAGES.map((page) => (
              <div key={page.id}>
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
                  {page.id}. {page.label}
                </p>
                <img
                  src={page.src}
                  alt={page.label}
                  className="w-full rounded-xl border shadow-sm cursor-zoom-in hover:opacity-95 transition-opacity"
                  onClick={() => setLightbox(page.src)}
                />
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="拡大表示"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white text-3xl leading-none hover:opacity-70"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
