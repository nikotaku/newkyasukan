import { Link } from "react-router-dom";
import { ArrowRight, EyeOff, HeartHandshake, ListChecks, ShieldCheck } from "lucide-react";
import { EarningsCalculator } from "@/components/EarningsCalculator";
import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/chip";
import { LESSONS } from "@/data/seed";
import { useApp } from "@/hooks/useApp";

const FEATURES = [
  {
    icon: HeartHandshake,
    title: "専属コーチが1対1で伴走",
    body: "元セラピスト・元店長のコーチが担当につきます。お店選びから、指名が安定する1か月後まで同じコーチです。",
  },
  {
    icon: ListChecks,
    title: "今月受け入れているお店だけ",
    body: "受け入れ枠のあるお店だけを一覧にしています。60分の取り分・保証・待機の条件を同じ形で比べられます。",
  },
  {
    icon: EyeOff,
    title: "身バレと条件トラブルを先回り",
    body: "顔出しなし・地元を避ける条件で絞り込めます。説明と違う条件だったときは、コーチがお店との間に入ります。",
  },
];

const STEPS = [
  { title: "1分で登録", body: "ニックネーム・年齢・エリア・連絡先だけ。本名はまだ要りません。" },
  { title: "コーチと面談", body: "オンラインで30分。目標の月収と出られる日から、合うお店を一緒に絞ります。" },
  { title: "お店を選んで応募", body: "気になるお店にはあなたが応募します。聞きにくい条件はコーチが先に確認します。" },
  { title: "体験入店と振り返り", body: "体験入店の翌日にコーチと15分。取り分が説明どおりだったかも確認します。" },
  { title: "1か月後まで伴走", body: "写メ日記の添削、リピートづくり、お金の管理まで。合わなければお店を変える相談もできます。" },
];

const FAQ = [
  {
    q: "本当に無料ですか？",
    a: "登録・コーチング・レッスンはすべて無料です。運営費はお店からの定額の掲載料でまかなっていて、あなたの収入から紹介料などを引くことはありません。",
  },
  {
    q: "どんなお仕事ですか？",
    a: "メンズエステ（リラクゼーション）のセラピストです。性的なサービスを求めるお店は掲載していません。取材で分かった場合は掲載を止めます。",
  },
  {
    q: "身バレが心配です",
    a: "登録はニックネームで大丈夫です。顔を出さない写真のお店、地元から離れたお店を選べます。確定申告など本名が出る場面もコーチが事前に説明します。",
  },
  {
    q: "合わなかったらやめられますか？",
    a: "いつでもやめられますし、退会もすぐできます。お店に伝えにくいときは伝え方を一緒に考えます。引き止めはしません。",
  },
  {
    q: "年齢の条件は？",
    a: "18歳以上で、高校生ではない方が対象です。面談のときに身分証で年齢を確認します。",
  },
];

// 右側：コーチとのやりとりのイメージ（サービスの中身そのものを見せる）
function CoachPreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="rounded-2xl border bg-card p-4 shadow-[0_24px_60px_-30px_hsl(var(--primary)/0.45)]">
        <div className="flex items-center gap-3 border-b pb-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-display text-lg font-extrabold text-primary-foreground">
            美
          </span>
          <div>
            <p className="text-sm font-bold">担当コーチ 美咲</p>
            <p className="text-[11px] text-muted-foreground">元セラピスト・在籍6年</p>
          </div>
          <Pill tone="good" className="ml-auto">
            レッスン 4/8
          </Pill>
        </div>
        <div className="flex flex-col gap-2 pt-3 text-sm leading-relaxed">
          <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
            体験入店おつかれさまでした！60分の取り分は説明どおり8,000円でしたか？
          </p>
          <p className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-primary-foreground">
            はい、4本入れて32,000円でした。待機も個室で安心でした
          </p>
          <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
            よかったです。次は写メ日記の書き方をやりましょう。最初の5本は私が添削します
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { me } = useApp();
  return (
    <PublicLayout>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-10 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div>
          <p className="eyebrow">メンズエステのセラピスト登録</p>
          <h1 className="mt-3 font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-5xl sm:leading-[1.3]">
            はじめてでも、
            <br />
            ちゃんと稼げるまで。
            <br />
            <span className="text-primary">コーチがマンツーマンで。</span>
          </h1>
          <p className="mt-5 max-w-[34rem] text-base leading-relaxed text-muted-foreground">
            登録は1分。今月受け入れているお店を一覧で比べて、専属のコーチと一緒に選べます。登録・相談・レッスンはすべて無料です。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={me ? "/me" : "/register"}>
                {me ? "マイページへ" : "1分で無料登録"} <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/stores">お店を見てみる</Link>
            </Button>
          </div>
          <ul className="mt-6 flex flex-wrap gap-2">
            <li>
              <Pill>
                <ShieldCheck size={13} /> 18歳以上（高校生不可）
              </Pill>
            </li>
            <li>
              <Pill>顔出しなしのお店あり</Pill>
            </li>
            <li>
              <Pill>いつでも退会できます</Pill>
            </li>
          </ul>
        </div>
        <CoachPreview />
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col gap-2">
              <f.icon className="text-primary" size={26} strokeWidth={1.6} />
              <h2 className="text-lg font-bold">{f.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <p className="eyebrow">登録から在籍まで</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">ひとりで決めなくていい5つのステップ</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-5 md:gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 md:flex-col md:gap-3">
              <span className="tabular font-display text-3xl font-extrabold leading-none text-primary/70">{i + 1}</span>
              <div>
                <h3 className="font-bold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <p className="eyebrow">収入の目安</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">週3日でいくらになる？</h2>
        <p className="mt-2 max-w-[40rem] text-sm leading-relaxed text-muted-foreground">
          メンズエステの収入は「本数 × 1本あたりの取り分」で決まります。出勤日数を増やさずに収入を上げるには、指名とリピートを増やすことです。
        </p>
        <div className="mt-6">
          <EarningsCalculator />
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <p className="eyebrow">コーチングの中身</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">最初の1か月でやること</h2>
          <ol className="mt-8 grid gap-x-8 gap-y-5 md:grid-cols-2">
            {LESSONS.map((lesson) => (
              <li key={lesson.id} className="grid grid-cols-[5.5rem_1fr] gap-3">
                <span className="pt-0.5 text-xs font-bold text-primary">{lesson.week}</span>
                <div>
                  <h3 className="font-bold">{lesson.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{lesson.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="font-display text-2xl font-extrabold sm:text-3xl">よくある質問</h2>
        <div className="mt-6 divide-y border-y">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
                {item.q}
                <span className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="font-display text-xl font-extrabold">まずは条件だけでも見てみませんか</p>
          <Button asChild size="lg">
            <Link to={me ? "/stores" : "/register"}>
              {me ? "お店を探す" : "1分で無料登録"} <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </PublicLayout>
  );
}
