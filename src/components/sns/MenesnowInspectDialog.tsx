import { useState } from "react";
import { Copy, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

// メンエスなうの店舗管理画面を、日本のプロキシ経由で開いて構成（メニュー・フォームの項目）を読む。読むだけで、保存・投稿はしない。
// 同時投稿を組むための下調べ。「結果をコピー」した内容を開発の担当に渡す（ログイン情報は含まれない）。

type Field = { tag: string; type: string; name: string; id: string; label: string; required: boolean; accept: string; options: string[] };
type PageSnapshot = {
  url: string;
  title: string;
  headings: string[];
  links: Array<{ text: string; path: string }>;
  forms: Array<{ action: string; method: string; enctype: string; fields: Field[]; buttons: string[] }>;
  text: string;
  screenshot: string | null;
};
type InspectResult = { ok: boolean; error?: string; shopId?: string | null; pages?: PageSnapshot[] };

export function MenesnowInspectButton({ storeId }: { storeId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paths, setPaths] = useState("");
  const [result, setResult] = useState<InspectResult | null>(null);

  const inspect = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("ログインが期限切れです");
      const response = await fetch("/api/automations/estama", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: "menesnow-inspect",
          storeId,
          paths: paths.split(/\s+/).map((p) => p.replace(/^https?:\/\/(www\.)?men-esthe\.co\.jp/, "")).filter(Boolean),
        }),
      });
      const body = await response.json().catch(() => ({})) as InspectResult & { error?: string };
      if (!body.pages && !response.ok) throw new Error(body.error || "通信に失敗しました");
      setResult(body);
      if (body.ok) toast.success(`ログインできました（${body.pages?.length ?? 0}画面）`);
      else toast.error(body.error || "ログインできませんでした");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    const withoutImages = { ...result, pages: result.pages?.map(({ screenshot: _s, ...page }) => page) };
    await navigator.clipboard.writeText(JSON.stringify(withoutImages, null, 2));
    toast.success("コピーしました");
  };

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
        <Search size={13} className="mr-1" />管理画面を調べる（日本経由）
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>メンエスなうの管理画面を調べる</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              登録したログイン情報で、日本のプロキシ経由でログインし、メニューと入力フォームの項目を読みます（保存・投稿はしません。1〜2分かかります）。
              特に見たい画面があれば、URLを空白か改行で区切って入れてください（例：投稿・写メ日記・出勤の画面）。
            </p>
            <Textarea rows={2} value={paths} onChange={(e) => setPaths(e.target.value)} placeholder="/manage/store/6490/..." />
            <div className="flex gap-2">
              <Button onClick={() => void inspect()} disabled={busy}>
                {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Search size={14} className="mr-1" />}調べる
              </Button>
              {result && <Button variant="outline" onClick={() => void copy()}><Copy size={14} className="mr-1" />結果をコピー</Button>}
            </div>
            {result?.error && <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300">{result.error}</p>}
            {result?.pages?.map((page, index) => (
              <div key={`${page.url}-${index}`} className="rounded-lg border p-3 space-y-2">
                <p className="font-semibold">{page.title || "（タイトルなし）"}</p>
                <p className="text-xs text-muted-foreground break-all">{page.url}</p>
                {page.screenshot && <img src={page.screenshot} alt="" className="w-full rounded border" />}
                {page.links.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer">リンク（{page.links.length}）</summary>
                    <ul className="mt-1 space-y-0.5">
                      {page.links.map((link) => (
                        <li key={link.path}>
                          <button type="button" className="underline text-left" onClick={() => setPaths((prev) => `${prev} ${link.path}`.trim())}>
                            {link.text || "（文字なし）"}
                          </button>
                          <span className="ml-1 text-muted-foreground break-all">{link.path}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {page.forms.map((form, formIndex) => (
                  <details key={formIndex} className="text-xs" open={form.fields.some((f) => f.type === "file" || f.tag === "textarea")}>
                    <summary className="cursor-pointer">フォーム {form.method.toUpperCase()} {form.action || "（同じ画面）"}・{form.fields.length}項目</summary>
                    <ul className="mt-1 space-y-0.5">
                      {form.fields.filter((f) => f.type !== "hidden").map((field, fieldIndex) => (
                        <li key={fieldIndex}>
                          <span className="font-mono">{field.tag}{field.type ? `[${field.type}]` : ""} {field.name}</span>
                          {field.label && <span className="ml-1 text-muted-foreground">{field.label}</span>}
                          {field.required && <span className="ml-1 text-red-600">必須</span>}
                          {field.options.length > 0 && <span className="ml-1 text-muted-foreground">（{field.options.join(" / ")}）</span>}
                        </li>
                      ))}
                    </ul>
                    {form.buttons.length > 0 && <p className="mt-1">ボタン：{form.buttons.join(" / ")}</p>}
                  </details>
                ))}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
