import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type Stock = "多い" | "普通" | "少ない" | "なし";
interface Item {
  id: string; room_id: string; name: string; quantity: number; unit: string;
  stock_level: Stock | null; quantity_confirmed: boolean;
  storage_location: string | null; storage_code: string | null; notes: string | null;
}
const levels: Stock[] = ["多い", "普通", "少ない", "なし"];

function ItemEditor({ item, save, busy }: { item: Item; save: (patch: Partial<Item>) => Promise<void>; busy: boolean }) {
  const [draft, setDraft] = useState(item);
  useEffect(() => setDraft(item), [item]);
  const field = (label: string, key: "storage_location" | "storage_code" | "unit" | "notes") => (
    <label className="text-sm space-y-1">{label}<Input value={draft[key] || ""} disabled={busy} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>
  );
  return <div className="border rounded-lg p-3 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.name}</strong><span className="text-sm text-muted-foreground">{item.quantity_confirmed ? `${item.quantity}${item.unit || "個"}` : "個数未確認"}</span></div>
    <div className="flex flex-wrap gap-2" aria-label={`${item.name}の残量`}>
      {levels.map(level => <Button key={level} size="sm" variant={item.stock_level === level ? "default" : "outline"} disabled={busy} aria-pressed={item.stock_level === level} onClick={() => save({ stock_level: level })}>{level}</Button>)}
      {!item.stock_level && <span className="text-sm">残量未確認</span>}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {field("保管場所", "storage_location")}{field("収納番号", "storage_code")}
      <label className="text-sm space-y-1">個数（空欄は未確認）<Input type="number" min="0" step="1" value={draft.quantity_confirmed ? draft.quantity : ""} disabled={busy} onChange={e => setDraft({ ...draft, quantity_confirmed: e.target.value !== "", quantity: e.target.value === "" ? 0 : Number(e.target.value) })} /></label>
      {field("単位", "unit")}{field("メモ", "notes")}
    </div>
    <Button variant="outline" disabled={busy} onClick={() => {
      if (!Number.isSafeInteger(draft.quantity) || draft.quantity < 0) { toast.error("個数は0以上の整数で入力してください"); return; }
      void save({ quantity: draft.quantity, quantity_confirmed: draft.quantity_confirmed, unit: draft.unit, storage_location: draft.storage_location, storage_code: draft.storage_code, notes: draft.notes });
    }}>個数・収納場所を保存</Button>
  </div>;
}

export function RoomSupplyInventory({ roomId }: { roomId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shoppingOnly, setShoppingOnly] = useState(false);
  useEffect(() => {
    let active = true;
    setItems([]); setLoading(true); setFailed(false);
    supabase.from("room_supplies").select("*").eq("room_id", roomId).order("created_at").then(({ data, error }) => {
      if (!active) return;
      if (error) { setFailed(true); toast.error("在庫を読み込めませんでした"); }
      else setItems((data || []) as unknown as Item[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [roomId]);
  const save = async (item: Item, patch: Partial<Item>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.from("room_supplies").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", item.id).eq("room_id", roomId).select("*").single();
      if (error) throw error;
      setItems(previous => previous.map(row => row.id === item.id ? data as unknown as Item : row));
      toast.success("在庫を保存しました");
    } catch { toast.error("保存できませんでした。変更は反映されていません"); }
    finally { setBusy(false); }
  };
  const shopping = items.filter(item => item.stock_level === "少ない" || item.stock_level === "なし");
  const visible = shoppingOnly ? shopping : items;
  return <Card id="supply-inventory"><CardHeader><CardTitle>備品の在庫・収納管理</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm">トイレ用品はトイレ、その他はキッチン周り。収納番号は全ルーム共通の分類です。箱の配置は現地の寸法に合わせて調整してください。</p>
    <p className="text-sm text-muted-foreground">K01：ゴミ袋 ／ K02：紙類 ／ K03：衛生用品 ／ K04：清掃用品 ／ K05：施術用品 ／ K06：水 ／ T01：トイレ用品。収納番号は配置案です。</p>
    <div className="flex flex-wrap gap-2"><Button variant={shoppingOnly ? "outline" : "default"} onClick={() => setShoppingOnly(false)}>すべて（{items.length}）</Button><Button variant={shoppingOnly ? "default" : "outline"} onClick={() => setShoppingOnly(true)}>買い足し（{shopping.length}）</Button></div>
    {loading ? <p>在庫を読み込み中</p> : failed ? <p role="alert">読み込みに失敗しました。ページを再読み込みしてください。</p> : visible.length === 0 ? <p>{shoppingOnly ? "買い足しが必要な備品はありません" : "備品は未登録です。下の備品DBから追加できます。"}</p> : visible.map(item => <ItemEditor key={item.id} item={item} busy={busy} save={patch => save(item, patch)} />)}
  </CardContent></Card>;
}
