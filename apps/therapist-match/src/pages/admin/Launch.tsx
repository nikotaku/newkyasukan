import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { cn } from "@/lib/utils";

// 公開前に決めること・やること。法律の説明は概要なので、最終判断は弁護士・社労士に確認する
const SECTIONS = [
  {
    title: "事業の形（いちばん大事）",
    items: [
      {
        id: "shape",
        title: "紹介・派遣ではなく「求人の掲載＋本人へのコーチング」にする",
        body: "運営が特定のセラピストを特定のお店にあっせんして報酬を受け取れば「職業紹介」、運営が雇ってお店に送れば「労働者派遣」で、どちらも国の許可が要ります。Webサービスにしても、運営が実際にやっていることが紹介・あっせんなら扱いは同じです。この試作では、セラピスト本人がお店に応募し、運営はお店から定額の掲載料だけを受け取る形にしています。",
      },
      {
        id: "no-sex-work",
        title: "性風俗店は扱わない（メンズエステの健全店だけ）",
        body: "性風俗の仕事への紹介・募集は職業安定法63条（有害業務の紹介など）の対象で、1年以上10年以下の拘禁刑または20万〜300万円の罰金です。2025年6月施行の改正風営法では、性風俗店がスカウトに紹介の報酬を払うこと自体も禁止されました。スカウト会社のしくみをWebやAIに置き換えても、この部分は避けられません。",
      },
      {
        id: "fee",
        title: "お金はお店からの定額の掲載料だけ",
        body: "入店人数やセラピストの売上に連動する報酬は受け取らない。セラピストからは登録料・講習料・紹介料を取らない。収支シミュレーターもこの前提で計算しています。",
      },
    ],
  },
  {
    title: "届出・許可",
    items: [
      {
        id: "notify",
        title: "特定募集情報等提供事業の届出（厚生労働省）",
        body: "求職者の情報を集めて求人情報を届けるサービスは、2022年10月から届出が必要です。セラピストが業務委託でも、働き方の実態で「労働者」と判断されることがあるので、対象になるかを専門家と確認します。",
      },
      {
        id: "license",
        title: "面接調整・条件交渉まで運営がやるなら、有料職業紹介事業の許可",
        body: "コーチが面接日程の調整やお店との条件交渉まで行うと「あっせん」に当たる可能性があります。やるなら許可を取ります（資産の要件や責任者の講習などの条件があります）。",
      },
    ],
  },
  {
    title: "安全と信頼",
    items: [
      {
        id: "age",
        title: "年齢確認：18歳未満・高校生は登録できない",
        body: "登録時の確認に加えて、コーチ面談で身分証を確認します。掲載店にも面接時の確認手順を求めます。",
      },
      {
        id: "review",
        title: "掲載審査：取材してから載せる",
        body: "性的なサービスを求めるお店は載せない。取り分・保証・罰金の有無を書面で確認。問題が分かったら掲載を止める。",
      },
      {
        id: "privacy",
        title: "個人情報：身バレがいちばんのリスク",
        body: "プライバシーポリシー、スタッフごとの閲覧権限、保存期間、退会したら消す手順。お店に渡す情報は本人が応募したときだけ、本人が選んだ範囲だけにします。",
      },
      {
        id: "lawyer",
        title: "公開前に弁護士・社労士のレビュー",
        body: "利用規約・掲載基準・料金体系・コーチの業務範囲を、この業界に詳しい専門家に見てもらいます。",
      },
    ],
  },
];

const STORAGE_KEY = "bloom-launch-checks";

function loadChecks(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export default function AdminLaunch() {
  const [done, setDone] = useState<string[]>(loadChecks);
  const total = SECTIONS.reduce((sum, s) => sum + s.items.length, 0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
    } catch {
      // 保存できなくてもチェックは画面上で使える
    }
  }, [done]);

  const toggle = (id: string) => setDone((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  return (
    <AdminLayout
      title="立ち上げチェック"
      description="公開前に決めること・やることです。法律の説明は概要なので、最終的な判断は弁護士・社労士に確認してください。"
    >
      <p className="tabular text-sm">
        <span className="font-bold">{done.length}</span> / {total} 完了
      </p>
      <div className="mt-4 flex max-w-3xl flex-col gap-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-sm font-bold text-muted-foreground">{section.title}</h2>
            <ul className="mt-2 flex flex-col divide-y rounded-xl border bg-card">
              {section.items.map((item) => {
                const checked = done.includes(item.id);
                return (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-start gap-3 p-4">
                      <input
                        id={`launch-${item.id}`}
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                        checked={checked}
                        onChange={() => toggle(item.id)}
                      />
                      <span>
                        <span className={cn("block font-bold", checked && "text-muted-foreground line-through decoration-1")}>{item.title}</span>
                        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{item.body}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </AdminLayout>
  );
}
