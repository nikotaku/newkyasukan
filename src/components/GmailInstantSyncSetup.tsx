import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Copy, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { copyText } from "@/lib/copyText";
import gmailScriptTemplate from "../../scripts/gmail-report-sync.gs?raw";

// エステ魂の仮予約のメールが Gmail に届いたらすぐ取り込む設定（Google Apps Script）。
// スクリプトにはこの画面で発行したトークンを埋め込んでコピーする（トークンはチャット・リポジトリを通さない）。

interface IngestStatus {
  last_used_at: string | null;
  last_message_at: string | null;
  last_reservation_mail_at: string | null;
  messages: number;
}

const ago = (iso: string | null) => {
  if (!iso) return null;
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}時間前`;
  return `${Math.round(minutes / 60 / 24)}日前`;
};

export function GmailInstantSyncSetup({ storeId }: { storeId: string | null }) {
  const [status, setStatus] = useState<IngestStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  // コピーできなかったとき（iPhoneのアプリなど）は、ここに出して長押しでコピーしてもらう
  const [manualScript, setManualScript] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    const { data } = await supabase.rpc("get_report_ingest_status" as never, { p_store_id: storeId } as never);
    setStatus((data as IngestStatus | null) ?? null);
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  // スクリプトが直近10分以内に送ってきていれば「動いている」
  const running = !!status?.last_used_at && Date.now() - new Date(status.last_used_at).getTime() < 10 * 60_000;

  const copyScript = async () => {
    if (!storeId) return;
    setCopying(true);
    const { data, error } = await supabase.rpc("create_report_ingest_token" as never, { p_store_id: storeId } as never);
    setCopying(false);
    if (error || typeof data !== "string") {
      toast.error(`発行できませんでした: ${error?.message ?? "不明なエラー"}`);
      return;
    }
    const script = gmailScriptTemplate.replace("PASTE_TOKEN_HERE", data);
    if (await copyText(script)) {
      setManualScript(null);
      toast.success("スクリプトをコピーしました。script.google.com に貼り付けてください");
    } else {
      setManualScript(script);
      toast.message("下の枠のコードを全部選んでコピーしてください");
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 text-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Mail size={14} className={running ? "text-emerald-600" : "text-amber-600"} />
        {running ? (
          <span className="font-semibold text-emerald-700">メールですぐ取り込み中（最終確認 {ago(status!.last_used_at)}）</span>
        ) : (
          <span className="font-semibold text-amber-700">
            {status?.last_used_at ? `メールの見張りが止まっています（最終 ${ago(status.last_used_at)}）` : "メールですぐ取り込む設定がまだです（今は5分ごと）"}
          </span>
        )}
        {status?.last_reservation_mail_at && (
          <span className="text-muted-foreground">・最後の仮予約メール {ago(status.last_reservation_mail_at)}</span>
        )}
        <ChevronDown size={14} className={`ml-auto shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 py-3">
          <p>
            エステ魂の仮予約のメール（enka@ への転送先の Gmail）を1分ごとに見張り、届いたらすぐエステ魂の「お店への予約」を読みに行きます（届いてから1〜2分で下に出ます）。メールが無いときも5分ごとに読んでいます。
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>下の「スクリプトをコピー」を押す（このお店専用の鍵が入ったコードがコピーされます）</li>
            <li>転送先の Gmail（chelsy… のアカウント）でログインしたまま <a className="text-primary underline" href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com</a> で新しいプロジェクトを開く</li>
            <li>最初からあるコードを全部消して貼り付け、保存（💾）</li>
            <li>上の関数の選択で <b>setup</b> を選んで「実行」→「権限を確認」→ アカウントを選ぶ →「詳細」→「（安全ではないページ）に移動」→「許可」</li>
            <li>ここに「メールですぐ取り込み中」と出れば完了（数分かかることがあります）</li>
          </ol>
          <p className="text-muted-foreground">
            以前のスクリプトがある場合は、そのプロジェクトのコードを貼り替えて setup をもう一度実行してください。コードの鍵は人に見せないでください（コピーし直すと新しい鍵になります）。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copyScript()} disabled={copying || !storeId}>
              {copying ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Copy size={14} className="mr-1" />}スクリプトをコピー
            </Button>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <CheckCircle2 size={14} className="mr-1" />動いているか確かめる
            </Button>
          </div>
          {manualScript && (
            <textarea readOnly value={manualScript} rows={6} className="w-full rounded border bg-background p-2 font-mono text-[10px]"
              onFocus={(e) => e.currentTarget.select()} />
          )}
          {status && <p className="text-muted-foreground">これまでに取り込んだメール {status.messages}通</p>}
        </div>
      )}
    </div>
  );
}
