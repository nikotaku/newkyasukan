import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

interface Review {
  id: string;
  rating: number;
  therapist_name: string | null;
  review_text: string;
  created_at: string;
}

export default function Voice() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("customer_reviews")
      .select("id, rating, therapist_name, review_text, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setReviews((data as Review[]) || []);
        setLoading(false);
      });
  }, []);

  const avg = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
      <header className="bg-white border-b py-4 px-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">← トップへ</Link>
          <p className="text-sm font-semibold">全力エステ</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-1">お客様の声</h1>
        <p className="text-muted-foreground text-sm mb-6">実際にご利用いただいたお客様からのご感想です</p>

        {/* サマリー */}
        {reviews.length > 0 && (
          <div className="bg-white rounded-2xl border p-5 mb-8 flex items-center gap-6">
            <div className="text-center">
              <p className="text-4xl font-bold text-yellow-500">{avg.toFixed(1)}</p>
              <div className="text-yellow-400 text-lg mt-0.5">
                {"★".repeat(Math.round(avg))}
                <span className="text-gray-200">{"★".repeat(5 - Math.round(avg))}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">平均評価</p>
            </div>
            <div className="flex-1">
              {[5, 4, 3, 2, 1].map((s) => {
                const count = reviews.filter((r) => r.rating === s).length;
                const pct = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
                return (
                  <div key={s} className="flex items-center gap-2 text-xs mb-0.5">
                    <span className="text-yellow-400 w-3">★</span>
                    <span className="text-muted-foreground w-2">{s}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-yellow-400 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground w-6 text-right">{count}</span>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground mt-2">{reviews.length}件のご感想</p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-center text-muted-foreground py-12">読み込み中...</p>
        ) : reviews.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">まだ口コミがありません</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-yellow-400 font-bold text-lg">{"★".repeat(r.rating)}</span>
                    <span className="text-gray-200 font-bold text-lg">{"★".repeat(5 - r.rating)}</span>
                  </div>
                  {r.therapist_name && (
                    <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                      担当：{r.therapist_name}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.review_text}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <p className="text-sm text-muted-foreground mb-3">ご来店後のご感想をお聞かせください</p>
          <Link
            to="/review"
            className="inline-block bg-amber-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-amber-600 transition-colors"
          >
            口コミを投稿する
          </Link>
        </div>
      </main>
    </div>
  );
}
