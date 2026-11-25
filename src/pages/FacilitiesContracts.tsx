import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, FileText, Trash2, Paperclip } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteFacilityContract, normalizeContractDocuments, type ContractDocument } from "@/lib/facilityContracts";

const db = supabase as unknown as { from: (table: string) => any };

export const PREDEFINED_TAGS = [
  "掲載サイト",
  "賃貸",
  "光熱費",
  "Wi-Fi・通信",
  "取引先",
  "備品・消耗品",
  "その他",
];

interface Contract {
  id: string;
  parent_id: string | null;
  store_id: string | null;
  name: string;
  tags: string[];
  amount: number;
  contract_status: string;
  management_company: string;
  address: string;
  notes: string;
  documents: ContractDocument[];
}

// embedded = ナレッジダッシュボード（/knowledge/dashboard）のタブの中に出す（外枠なし）
export default function FacilitiesContracts({ embedded = false }: { embedded?: boolean } = {}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState("すべて");

  const [arranging, setArranging] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchContracts();
  }, [user]);

  const fetchContracts = async () => {
    setLoading(true);
    try {
      const { data, error } = await db
        .from("facility_contracts")
        .select("id,parent_id,store_id,name,tags,amount,contract_status,management_company,address,notes,documents")
        .order("name");
      if (error && error.code !== "PGRST116") throw error;
      setContracts((data || []).map((c: Contract & { documents: unknown }) => ({ ...c, tags: c.tags || [], documents: normalizeContractDocuments(c.documents) })));
    } catch (error) {
      toast.error("契約一覧を取得できませんでした");
    } finally {
      setLoading(false);
    }
  };

  const allTags = Array.from(
    new Set([...PREDEFINED_TAGS, ...contracts.flatMap((c) => c.tags)])
  );

  const tabs = ["すべて", ...allTags];

  const byId = new Map(contracts.map(c => [c.id,c]));
  function ancestors(contract: Contract) {
    const ids: string[] = [];
    let parent = contract.parent_id;
    while (parent && byId.has(parent) && !ids.includes(parent)) {
      ids.unshift(parent);
      parent = byId.get(parent)?.parent_id ?? null;
    }
    return ids;
  }
  const paths = new Map(contracts.map(c => [c.id, ancestors(c)]));
  const visible = new Set(contracts.filter(c => activeTag === "すべて" || c.tags.includes(activeTag)).flatMap(c => [...paths.get(c.id)!, c.id]));
  const filteredContracts: Contract[] = [];
  function visit(parent: string | null) {
    for (const c of contracts.filter(c => (byId.has(c.parent_id ?? "") ? c.parent_id : null) === parent)) {
      if (!visible.has(c.id)) continue;
      filteredContracts.push(c);
      if (!closed.includes(c.id) || activeTag !== "すべて") visit(c.id);
    }
  }
  visit(null);

  function allowed(source: Contract, target: Contract) {
    return source.store_id === target.store_id && source.id !== target.id && !paths.get(target.id)?.includes(source.id);
  }
  async function move(id: string, parent: string | null) {
    const source = byId.get(id);
    if (!source || moving || source.parent_id === parent) return;
    if (parent && (!byId.has(parent) || !allowed(source, byId.get(parent)!))) {
      toast.error("この契約の下には移動できません"); return;
    }
    setMoving(true);
    try {
      const {error} = await db.from("facility_contracts").update({parent_id:parent}).eq("id",id).select("id").single();
      if (error) throw error;
      setClosed([]);
      await fetchContracts();
      toast.success("移動しました");
    } catch { toast.error("移動できませんでした"); }
    finally { setMoving(false); }
  }
  function hit(x:number,y:number) {
    return document.elementFromPoint(x,y)?.closest<HTMLElement>("[data-contract-target]")?.dataset.contractTarget ?? null;
  }

  const handleCreate = async () => {
    const initialTags = activeTag !== "すべて" ? [activeTag] : [];
    const { data, error } = await db
      .from("facility_contracts")
      .insert([{ name: "新規", tags: initialTags, contract_type: initialTags[0] ?? "その他", amount: 0, notes: "" }])
      .select()
      .single();
    if (error) { console.error(error); toast.error(`追加できませんでした（${error.message}）`); return; }
    navigate(`/facilities/contracts/${data.id}`);
  };

  const handleDelete = async (contract: Contract) => {
    if (!confirm(`「${contract.name}」を削除しますか？付いている契約書のファイルも消えます。元に戻せません。`)) return;
    try {
      await deleteFacilityContract(contract.id, contract.documents);
      await fetchContracts();
      toast.success("削除しました");
    } catch (error) {
      console.error(error);
      toast.error("削除できませんでした");
    }
  };

  return (
    <div className={embedded ? "" : "min-h-screen bg-background"}>
      {!embedded && <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />}
      {!embedded && <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
      <main className={embedded ? "" : "pt-[60px] md:ml-[240px] p-6"}>
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">契約管理</h1>

            </div>
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setArranging(!arranging); setActiveTag("すべて"); setClosed([]); }}>{arranging ? "整理を終了" : "整理"}</Button><Button size="sm" onClick={handleCreate}>
              <Plus size={14} className="mr-1" />新規追加
            </Button>
          </div></div>

          {/* タブ（設定ダッシュボード・HPダッシュボードと同じ横並び。多いときは横にスクロール） */}
          {arranging ? <div data-contract-target="root" className={`sticky top-16 z-10 mb-3 rounded border border-dashed p-3 text-center text-sm ${over === "root" ? "bg-accent" : "bg-background"}`}>最上位に戻す</div> :
            <select aria-label="契約の種類" className="mb-4 rounded border bg-background p-2 text-sm" value={activeTag} onChange={e => setActiveTag(e.target.value)}>
              {tabs.map(tag => <option key={tag}>{tag}</option>)}
            </select>}
          {/* Contract list */}
          <div className="space-y-3">
            {loading ? (
              <div className="text-center text-muted-foreground py-8">読み込み中...</div>
            ) : filteredContracts.length === 0 ? (
              <Card>
                <CardContent className="pt-10 pb-10 text-center text-muted-foreground">
                  データがありません
                </CardContent>
              </Card>
            ) : (
              filteredContracts.map((contract) => (
                <Card key={contract.id} data-contract-target={contract.id}
                  className={over === contract.id ? "ring-2 ring-primary" : ""}
                  style={{ marginLeft: Math.min(4,paths.get(contract.id)!.length)*14 }}>
                  {arranging && <div className="flex items-center gap-2 border-b p-2">
                    <button aria-label={contract.name+"をドラッグ"} disabled={moving} className="touch-none cursor-grab rounded border px-3 py-2" onPointerDown={e => {e.currentTarget.setPointerCapture(e.pointerId); setDrag(contract.id);}}
                      onPointerMove={e => {if(drag !== contract.id) return; if(e.clientY > window.innerHeight-60) window.scrollBy(0,22); if(e.clientY < 110) window.scrollBy(0,-22); setOver(hit(e.clientX,e.clientY));}}
                      onPointerCancel={() => {setDrag(null);setOver(null);}} onPointerUp={e => {const target=hit(e.clientX,e.clientY); if(drag && target && target!==drag) void move(drag,target==="root"?null:target); setDrag(null);setOver(null);}}>⠿</button>
                    <select aria-label={contract.name+"の移動先"} disabled={moving} className="min-w-0 flex-1 rounded border bg-background p-2 text-sm" value={contract.parent_id ?? ""} onChange={e=>void move(contract.id,e.target.value || null)}>
                      <option value="">最上位</option>{contracts.filter(c=>allowed(contract,c)).map(c=><option key={c.id} value={c.id}>{[...paths.get(c.id)!.map(id=>byId.get(id)!.name), c.name].join(" / ")}</option>)}
                    </select>
                  </div>}
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-semibold">{contract.name}</div>
                          {activeTag === "すべて" && contracts.some(c=>c.parent_id===contract.id) && <button className="text-xs text-primary" onClick={()=>setClosed(ids=>ids.includes(contract.id)?ids.filter(id=>id!==contract.id):[...ids,contract.id])}>{closed.includes(contract.id)?"展開":"折りたたむ"}</button>}
                          {contract.contract_status && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                contract.contract_status === "契約中"
                                  ? "bg-green-100 text-green-700"
                                  : contract.contract_status === "無料掲載"
                                  ? "bg-blue-100 text-blue-700"
                                  : contract.contract_status === "解約済み"
                                  ? "bg-red-100 text-red-600"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {contract.contract_status}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {contract.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        {contract.documents.length > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Paperclip size={11} />契約書 {contract.documents.length}件</p>
                        )}
                        {contract.amount > 0 && (
                          <p className="text-sm font-medium mt-1">
                            ¥{contract.amount.toLocaleString()}
                            <span className="text-muted-foreground font-normal">/月</span>
                          </p>
                        )}
                        {contract.management_company && (
                          <p className="text-xs text-muted-foreground">{contract.management_company}</p>
                        )}
                        {contract.address && (
                          <p className="text-xs text-muted-foreground truncate">
                            {contract.address.replace(/\n/g, " ")}
                          </p>
                        )}
                        {!contract.management_company && !contract.address && contract.notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{contract.notes}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/facilities/contracts/${contract.id}`)}
                        >
                          <FileText size={13} className="mr-1" />詳細
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => void handleDelete(contract)} aria-label={`${contract.name}を削除`}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
