import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { ChoiceChip } from "@/components/ui/chip";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { AREAS, EXPERIENCES, PACES, type Area, type Experience, type Pace } from "@/lib/types";

const GOALS = [
  { value: 150000, label: "15万円くらい" },
  { value: 300000, label: "30万円くらい" },
  { value: 500000, label: "50万円くらい" },
  { value: 800000, label: "80万円以上" },
];

const AGES = Array.from({ length: 33 }, (_, i) => 18 + i);
const STEP_TITLES = ["あなたのこと", "働き方の希望", "連絡先と確認"];

export default function Register() {
  const { register } = useApp();
  const navigate = useNavigate();
  const returnTo = (useLocation().state as { returnTo?: string } | null)?.returnTo ?? "/me";

  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [area, setArea] = useState<Area | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [pace, setPace] = useState<Pace | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [contactType, setContactType] = useState<"LINE" | "電話">("LINE");
  const [contact, setContact] = useState("");
  const [avoidNote, setAvoidNote] = useState("");
  const [isAdult, setIsAdult] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const canNext = [nickname.trim() !== "" && age !== "" && area !== null, experience !== null && pace !== null && goal !== null, contact.trim() !== "" && isAdult && agreed];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step < 2) {
      if (canNext[step]) setStep(step + 1);
      return;
    }
    if (!canNext[2] || age === "" || !area || !experience || !pace || goal === null) return;
    register({ nickname: nickname.trim(), age, area, experience, pace, goal, contactType, contact: contact.trim(), avoidNote: avoidNote.trim() });
    toast.success("登録しました。担当コーチから24時間以内に連絡します");
    navigate(returnTo);
  };

  return (
    <PublicLayout hideBottomNav>
      <div className="mx-auto max-w-lg px-4 py-8">
        <p className="eyebrow">無料登録・約1分</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold">{STEP_TITLES[step]}</h1>

        <div className="mt-4 grid grid-cols-3 gap-1.5" aria-label={`${step + 1} / 3`}>
          {STEP_TITLES.map((title, i) => (
            <div key={title} className="flex flex-col gap-1">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <span className={`text-[11px] ${i === step ? "font-bold text-foreground" : "text-muted-foreground"}`}>{title}</span>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-6">
          {step === 0 && (
            <>
              <div>
                <Label htmlFor="nickname">ニックネーム（本名でなくて大丈夫です）</Label>
                <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="例：ゆい" autoComplete="nickname" maxLength={20} />
              </div>
              <div>
                <Label htmlFor="age">年齢</Label>
                <Select id="age" value={age} onChange={(e) => setAge(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">選んでください</option>
                  {AGES.map((a) => (
                    <option key={a} value={a}>
                      {a}歳
                    </option>
                  ))}
                </Select>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-muted-foreground">働きたいエリア</legend>
                <div className="flex flex-wrap gap-2">
                  {AREAS.map((a) => (
                    <ChoiceChip key={a} selected={area === a} onClick={() => setArea(a)}>
                      {a}
                    </ChoiceChip>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === 1 && (
            <>
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-muted-foreground">メンズエステの経験</legend>
                <div className="flex flex-wrap gap-2">
                  {EXPERIENCES.map((x) => (
                    <ChoiceChip key={x} selected={experience === x} onClick={() => setExperience(x)}>
                      {x}
                    </ChoiceChip>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-muted-foreground">出られるペース</legend>
                <div className="flex flex-wrap gap-2">
                  {PACES.map((p) => (
                    <ChoiceChip key={p} selected={pace === p} onClick={() => setPace(p)}>
                      {p}
                    </ChoiceChip>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-muted-foreground">目標の月収</legend>
                <div className="flex flex-wrap gap-2">
                  {GOALS.map((g) => (
                    <ChoiceChip key={g.value} selected={goal === g.value} onClick={() => setGoal(g.value)}>
                      {g.label}
                    </ChoiceChip>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === 2 && (
            <>
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-muted-foreground">コーチからの連絡方法</legend>
                <div className="flex gap-2">
                  {(["LINE", "電話"] as const).map((t) => (
                    <ChoiceChip key={t} selected={contactType === t} onClick={() => setContactType(t)}>
                      {t}
                    </ChoiceChip>
                  ))}
                </div>
                <Input
                  id="contact"
                  className="mt-2"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={contactType === "LINE" ? "LINE ID" : "電話番号"}
                  inputMode={contactType === "電話" ? "tel" : "text"}
                  aria-label={contactType === "LINE" ? "LINE ID" : "電話番号"}
                />
              </fieldset>
              <div>
                <Label htmlFor="avoid">身バレ対策で気をつけたいこと（任意）</Label>
                <Textarea id="avoid" value={avoidNote} onChange={(e) => setAvoidNote(e.target.value)} placeholder="例：地元が〇〇なので近くは避けたい／顔は出したくない" />
              </div>
              <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm">
                <label className="flex items-start gap-3">
                  <input id="is-adult" type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={isAdult} onChange={(e) => setIsAdult(e.target.checked)} />
                  <span>18歳以上で、高校生ではありません（面談のときに身分証で確認します）</span>
                </label>
                <label className="flex items-start gap-3">
                  <input id="agreed" type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>利用規約とプライバシーポリシーに同意します（試作版のため本文は準備中）</span>
                </label>
              </div>
            </>
          )}

          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" size="lg" onClick={() => setStep(step - 1)} aria-label="前の質問に戻る">
                <ArrowLeft />
              </Button>
            )}
            <Button type="submit" size="lg" className="flex-1" disabled={!canNext[step]}>
              {step < 2 ? "次へ" : "登録する"}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            登録・コーチング・レッスンは無料です。
            <Link to="/stores" className="ml-1 underline">
              先にお店を見る
            </Link>
          </p>
        </form>
      </div>
    </PublicLayout>
  );
}
