import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle } from "lucide-react";

const STARS = [1, 2, 3, 4, 5];

export default function Survey() {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [therapistName, setTherapistName] = useState("");
  const [goodPoints, setGoodPoints] = useState("");
  const [improvement, setImprovement] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) { setError("評価を選択してください"); return; }
    setSubmitting(true);
    setError("");
    try {
      const { error: err } = await supabase.from("customer_surveys").insert([{
        rating,
        therapist_name: therapistName || null,
        good_points: goodPoints || null,
        improvement_points: improvement || null,
      }]);
      if (err) throw err;
      setDone(true);
    } catch {
      setError("送信に失敗しました。しばらくしてから再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center space-y-6 bg-white rounded-2xl shadow-md p-8">
          <CheckCircle className="mx-auto text-green-500" size={56} />
          <h1 className="text-xl font-bold">ご回答ありがとうございました</h1>
          <div className="bg-rose-50 rounded-xl p-5 text-sm text-left space-y-2">
            <p className="font-bold text-rose-700">【次回割引クーポン】</p>
            <p>次回ご来店の際、このページをスタッフにご提示ください。</p>
            <p className="font-bold mt-2">▶ 次回 <span className="text-rose-600 text-lg">1,000円割引</span></p>
            <p className="text-xs text-muted-foreground mt-1">アンケート＋口コミの両方でさらに<strong>3,000円割引</strong>になります</p>
          </div>
          <a
            href="/review"
            className="block w-full bg-rose-600 text-white text-center py-3 rounded-xl font-semibold hover:bg-rose-700 transition-colors"
          >
            口コミも投稿する（さらに2,000円追加割引）
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white">
      <header className="bg-white border-b py-4 px-4 text-center">
        <p className="text-xs text-muted-foreground">全力エステ</p>
        <h1 className="text-lg font-bold mt-0.5">ご利用アンケート</h1>
      </header>

      <main className="max-w-md mx-auto p-4 pt-6">
        <p className="text-sm text-muted-foreground mb-6 text-center">
          より良いサービスのため、ぜひご感想をお聞かせください。
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 評価 */}
          <div>
            <Label className="text-base font-semibold">本日の施術はいかがでしたか？ <span className="text-rose-500">*</span></Label>
            <div className="flex gap-3 mt-3 justify-center">
              {STARS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(s)}
                  className="text-4xl transition-transform hover:scale-110 focus:outline-none"
                >
                  <span className={(hovered || rating) >= s ? "text-yellow-400" : "text-gray-300"}>★</span>
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-center text-sm mt-1 text-muted-foreground">
                {["", "とても残念だった", "残念だった", "普通", "良かった", "とても良かった"][rating]}
              </p>
            )}
          </div>

          {/* 担当者 */}
          <div>
            <Label>担当セラピスト名（任意）</Label>
            <Input
              className="mt-1"
              placeholder="例：はる"
              value={therapistName}
              onChange={(e) => setTherapistName(e.target.value)}
            />
          </div>

          {/* 良かった点 */}
          <div>
            <Label>良かった点・ご感想（任意）</Label>
            <Textarea
              className="mt-1"
              placeholder="技術や接客で良かったところなど、何でもお聞かせください"
              rows={3}
              value={goodPoints}
              onChange={(e) => setGoodPoints(e.target.value)}
            />
          </div>

          {/* 改善点 */}
          <div>
            <Label>改善してほしい点（任意）</Label>
            <Textarea
              className="mt-1"
              placeholder="気になった点があればお聞かせください"
              rows={3}
              value={improvement}
              onChange={(e) => setImprovement(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-rose-500">{error}</p>}

          <div className="bg-rose-50 rounded-xl p-4 text-sm space-y-1">
            <p className="font-bold text-rose-700">【ご回答特典】</p>
            <p>回答完了後に表示されるクーポン画面をスタッフにご提示で</p>
            <p className="font-bold">▶ 次回 <span className="text-rose-600">1,000円割引</span></p>
          </div>

          <Button type="submit" className="w-full h-12 text-base" disabled={submitting || rating === 0}>
            {submitting ? "送信中..." : "アンケートを送信する"}
          </Button>
        </form>
      </main>
    </div>
  );
}
