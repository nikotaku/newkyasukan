import { useState, useMemo } from "react";
import { Property, DatabaseRecord } from "./types";
import { PropertyValue } from "./PropertyValue";
import { PropertyEditor } from "./PropertyEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Plus, Settings2, Search, ChevronUp, ChevronDown, ChevronsUpDown, Trash2 } from "lucide-react";

interface Props {
  title: string;
  storageKey: string;
  defaultProperties: Property[];
  records: DatabaseRecord[];
  loading?: boolean;
  onAddRecord?: (data: Record<string, any>) => Promise<void>;
  onUpdateRecord?: (id: string, field: string, value: any) => Promise<void>;
  onDeleteRecord?: (id: string) => Promise<void>;
}

type SortDir = "asc" | "desc" | null;
interface Sort { field: string; dir: SortDir }

function useStoredProperties(storageKey: string, defaultProperties: Property[]) {
  const key = `db_props_${storageKey}`;
  const [properties, setProperties] = useState<Property[]>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultProperties;
    } catch {
      return defaultProperties;
    }
  });

  const update = (props: Property[]) => {
    setProperties(props);
    localStorage.setItem(key, JSON.stringify(props));
  };

  return [properties, update] as const;
}

export function NotionDatabaseView({
  title,
  storageKey,
  defaultProperties,
  records,
  loading,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
}: Props) {
  const [properties, setProperties] = useStoredProperties(storageKey, defaultProperties);
  const [showPropEditor, setShowPropEditor] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<DatabaseRecord | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>({ field: "", dir: null });
  const [newRecord, setNewRecord] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const visibleProps = properties.filter((p) => !p.hidden);

  const filtered = useMemo(() => {
    let result = [...records];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        visibleProps.some((p) => {
          const v = r[p.id];
          if (v == null) return false;
          return String(v).toLowerCase().includes(q);
        })
      );
    }
    if (sort.field && sort.dir) {
      result.sort((a, b) => {
        const av = a[sort.field] ?? "";
        const bv = b[sort.field] ?? "";
        const cmp = String(av).localeCompare(String(bv), "ja");
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [records, search, sort, visibleProps]);

  const toggleSort = (field: string) => {
    setSort((prev) => {
      if (prev.field !== field) return { field, dir: "asc" };
      if (prev.dir === "asc") return { field, dir: "desc" };
      return { field: "", dir: null };
    });
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sort.field !== field) return <ChevronsUpDown size={12} className="text-muted-foreground opacity-50" />;
    return sort.dir === "asc"
      ? <ChevronUp size={12} className="text-primary" />
      : <ChevronDown size={12} className="text-primary" />;
  };

  const handleAdd = async () => {
    if (!onAddRecord) return;
    setSaving(true);
    try {
      await onAddRecord(newRecord);
      setNewRecord({});
      setShowAddForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleFieldUpdate = async (field: string, value: any) => {
    if (!selectedRecord || !onUpdateRecord) return;
    setSelectedRecord((prev) => prev ? { ...prev, [field]: value } : null);
    await onUpdateRecord(selectedRecord.id, field, value);
  };

  const handleDelete = async (id: string) => {
    if (!onDeleteRecord || !confirm("削除しますか？")) return;
    await onDeleteRecord(id);
    if (selectedRecord?.id === id) setSelectedRecord(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">{filtered.length}件</span>
          <Button size="sm" variant="outline" onClick={() => setShowPropEditor(true)}>
            <Settings2 size={14} className="mr-1" />列設定
          </Button>
          {onAddRecord && (
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              <Plus size={14} className="mr-1" />新規追加
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden gap-4">
        {/* Table */}
        <div className={`flex-1 overflow-auto border border-border rounded-lg ${selectedRecord ? "hidden md:block" : ""}`}>
          {loading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">読み込み中...</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-muted/50 z-10">
                <tr>
                  {visibleProps.map((p) => (
                    <th
                      key={p.id}
                      className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap border-b border-border cursor-pointer hover:bg-muted/80 select-none"
                      style={{ minWidth: p.width || 120 }}
                      onClick={() => toggleSort(p.id)}
                    >
                      <div className="flex items-center gap-1">
                        {p.name}
                        <SortIcon field={p.id} />
                      </div>
                    </th>
                  ))}
                  <th className="w-8 border-b border-border" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={visibleProps.length + 1} className="px-3 py-12 text-center text-muted-foreground">
                      データがありません
                    </td>
                  </tr>
                ) : (
                  filtered.map((record) => (
                    <tr
                      key={record.id}
                      className={`border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors ${selectedRecord?.id === record.id ? "bg-primary/5" : ""}`}
                      onClick={() => setSelectedRecord(record)}
                    >
                      {visibleProps.map((p) => (
                        <td key={p.id} className="px-3 py-2 max-w-[250px]">
                          <PropertyValue property={p} value={record[p.id]} compact />
                        </td>
                      ))}
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        {onDeleteRecord && (
                          <button
                            className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                            onClick={() => handleDelete(record.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail Panel */}
        {selectedRecord && (
          <div className="w-full md:w-[360px] flex-shrink-0 border border-border rounded-lg overflow-hidden flex flex-col bg-background">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">詳細</span>
              <Button size="sm" variant="ghost" onClick={() => setSelectedRecord(null)}>
                <X size={16} />
              </Button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {properties.map((p) => (
                <div key={p.id}>
                  <Label className="text-xs text-muted-foreground mb-1 block">{p.name}</Label>
                  <PropertyInput
                    property={p}
                    value={selectedRecord[p.id]}
                    onChange={(v) => handleFieldUpdate(p.id, v)}
                    disabled={!onUpdateRecord}
                  />
                </div>
              ))}
            </div>
            {onDeleteRecord && (
              <div className="p-4 border-t border-border">
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => handleDelete(selectedRecord.id)}
                >
                  <Trash2 size={14} className="mr-2" />削除
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Record Dialog */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-lg border border-border w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold">新規追加</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}><X size={16} /></Button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {properties.map((p) => (
                <div key={p.id}>
                  <Label className="text-xs text-muted-foreground mb-1 block">{p.name}</Label>
                  <PropertyInput
                    property={p}
                    value={newRecord[p.id]}
                    onChange={(v) => setNewRecord((prev) => ({ ...prev, [p.id]: v }))}
                  />
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-border flex gap-2">
              <Button className="flex-1" onClick={handleAdd} disabled={saving}>
                {saving ? "保存中..." : "追加"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowAddForm(false)}>
                キャンセル
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Property Editor */}
      {showPropEditor && (
        <PropertyEditor
          properties={properties}
          onChange={setProperties}
          onClose={() => setShowPropEditor(false)}
        />
      )}
    </div>
  );
}

function PropertyInput({
  property,
  value,
  onChange,
  disabled,
}: {
  property: Property;
  value: any;
  onChange: (v: any) => void;
  disabled?: boolean;
}) {
  const base = "text-sm";
  switch (property.type) {
    case "checkbox":
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="w-4 h-4"
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          disabled={disabled}
          className={`h-8 ${base}`}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={value ? String(value).slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          className={`h-8 ${base}`}
        />
      );
    case "select":
      return (
        <Select value={value ?? ""} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className={`h-8 ${base}`}><SelectValue placeholder="選択..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">—</SelectItem>
            {(property.options || []).map((o) => (
              <SelectItem key={o.label} value={o.label}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multi_select": {
      const vals: string[] = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            {vals.map((v) => (
              <span key={v} className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-xs">
                {v}
                {!disabled && (
                  <button onClick={() => onChange(vals.filter((x) => x !== v))}><X size={10} /></button>
                )}
              </span>
            ))}
          </div>
          {!disabled && (
            <Select
              value=""
              onValueChange={(v) => { if (v && !vals.includes(v)) onChange([...vals, v]); }}
            >
              <SelectTrigger className={`h-7 text-xs`}><SelectValue placeholder="追加..." /></SelectTrigger>
              <SelectContent>
                {(property.options || []).filter((o) => !vals.includes(o.label)).map((o) => (
                  <SelectItem key={o.label} value={o.label}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      );
    }
    default:
      if (property.type === "text" && !disabled) {
        return (
          <Textarea
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className={`text-sm resize-none`}
          />
        );
      }
      return (
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`h-8 ${base}`}
        />
      );
  }
}
