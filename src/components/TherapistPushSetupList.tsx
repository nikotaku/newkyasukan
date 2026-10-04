import { useCallback, useEffect, useState } from "react";
import { Copy, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { therapistPortalUrl } from "@/lib/therapistNotifications";

// セラピストごとの「マイページの予約通知」の設定状況。
// 予約の確定・変更・キャンセルはマイページ（ホーム画面に追加したアプリ）へのプッシュ通知で届けるので、
// 未設定の人にはURLを送って設定してもらう。

interface CastRow {
  id: string;
  name: string;
  devices: number;
  // ホーム画面に追加したアプリでテスト通知を受け取った（設定完了）
  tested: boolean;
  lastSuccessAt: string | null;
  token: string | null;
}

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

export function TherapistPushSetupList({ storeId, customDomain }: { storeId: string; customDomain: string | null | undefined }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<CastRow[] | null>(null);

  const load = useCallback(async () => {
    const [{ data: casts }, { data: devices }, { data: tokens }] = await Promise.all([
      supabase.from("casts").select("id,name").eq("store_id", storeId).eq("is_active", true).order("name"),
      supabase.from("therapist_push_subscriptions" as never).select("cast_id,last_success_at,standalone,test_confirmed_at").eq("store_id", storeId),
      supabase.rpc("get_cast_access_tokens"),
    ]);
    const deviceRows = (devices ?? []) as unknown as Array<{ cast_id: string; last_success_at: string | null; standalone: boolean; test_confirmed_at: string | null }>;
    const tokenMap = new Map((tokens ?? []).map((row: { cast_id: string; access_token: string }) => [row.cast_id, row.access_token]));
    const list = (casts ?? []).map((cast) => {
      const own = deviceRows.filter((device) => device.cast_id === cast.id);
      const lastSuccessAt = own.map((device) => device.last_success_at).filter((value): value is string => Boolean(value)).sort().pop() ?? null;
      const tested = own.some((device) => device.standalone && Boolean(device.test_confirmed_at));
      return { id: cast.id, name: cast.name, devices: own.length, tested, lastSuccessAt, token: tokenMap.get(cast.id) ?? null };
    });
    // 未設定の人を上に
    list.sort((a, b) => Number(a.devices > 0) - Number(b.devices > 0));
    setRows(list);
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (row: CastRow) => {
    if (!row.token) {
      toast({ title: "マイページが未発行です", description: "セラピストDBからアクセスリンクを発行してください", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(therapistPortalUrl(customDomain, row.token));
      toast({ title: `${row.name}さんのマイページのURLをコピーしました`, description: "送って、ホーム画面に追加→「通知をオンにする」をお願いしてください" });
    } catch {
      toast({ title: "コピーできませんでした", variant: "destructive" });
    }
  };

  if (!rows) return null;
  const ready = rows.filter((row) => row.devices > 0).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users size={18} />セラピストの予約通知（マイページ）
          <Badge variant={ready === rows.length ? "default" : "secondary"}>{ready}/{rows.length}人 設定済み</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          予約の確定・変更・キャンセルは、セラピストのマイページ（ホーム画面に追加したアプリ）に通知します。
          未設定の人はURLを送って「ホーム画面に追加 →『通知をオンにする』」をお願いしてください。
          未設定の間は、本人のLINEグループがある人だけLINEに届きます。無い人には届かないので、管理画面の左下とスマホ通知でお知らせします。
        </p>
      </CardHeader>
      <CardContent className="divide-y">
        {rows.map((row) => (
          <div key={row.id} className="py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium flex items-center gap-2">
                {row.name}
                {row.tested && <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">テスト済み</Badge>}
                {row.devices > 0
                  ? <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">通知オン（{row.devices}台）</Badge>
                  : <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">未設定</Badge>}
              </div>
              {row.lastSuccessAt && (
                <div className="text-xs text-muted-foreground">最後に届いた通知 {formatDateTime(row.lastSuccessAt)}</div>
              )}
            </div>
            <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => copy(row)}>
              <Copy size={14} className="mr-1" />URL
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
