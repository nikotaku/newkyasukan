import { useState } from "react";
import { Property, PropertyType, SelectOption } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical, X } from "lucide-react";

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  text: "テキスト",
  number: "数値",
  select: "セレクト",
  multi_select: "マルチセレクト",
  date: "日付",
  phone: "電話番号",
  url: "URL",
  email: "メール",
  checkbox: "チェックボックス",
};

const COLORS = ["gray", "red", "orange", "yellow", "green", "blue", "purple", "pink"];

const COLOR_PREVIEW: Record<string, string> = {
  gray: "bg-gray-400", red: "bg-red-400", orange: "bg-orange-400",
  yellow: "bg-yellow-400", green: "bg-green-400", blue: "bg-blue-400",
  purple: "bg-purple-400", pink: "bg-pink-400",
};

interface Props {
  properties: Property[];
  onChange: (properties: Property[]) => void;
  onClose: () => void;
}

export function PropertyEditor({ properties, onChange, onClose }: Props) {
  const [props, setProps] = useState<Property[]>(properties);
  const [editingProp, setEditingProp] = useState<Property | null>(null);
  const [newOptionLabel, setNewOptionLabel] = useState("");

  const updateProp = (id: string, updates: Partial<Property>) => {
    setProps((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    if (editingProp?.id === id) {
      setEditingProp((prev) => prev ? { ...prev, ...updates } : null);
    }
  };

  const addProperty = () => {
    const newProp: Property = {
      id: `prop_${Date.now()}`,
      name: "新しいプロパティ",
      type: "text",
    };
    setProps((prev) => [...prev, newProp]);
    setEditingProp(newProp);
  };

  const deleteProp = (id: string) => {
    setProps((prev) => prev.filter((p) => p.id !== id));
    if (editingProp?.id === id) setEditingProp(null);
  };

  const addOption = () => {
    if (!editingProp || !newOptionLabel.trim()) return;
    const option: SelectOption = {
      label: newOptionLabel.trim(),
      color: COLORS[editingProp.options?.length ?? 0 % COLORS.length] || "gray",
    };
    const updated = { ...editingProp, options: [...(editingProp.options || []), option] };
    updateProp(editingProp.id, updated);
    setNewOptionLabel("");
  };

  const removeOption = (optIndex: number) => {
    if (!editingProp) return;
    const options = (editingProp.options || []).filter((_, i) => i !== optIndex);
    updateProp(editingProp.id, { options });
  };

  const handleSave = () => {
    onChange(props);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-[420px] bg-background border-l border-border flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold">プロパティ設定</h2>
          <Button size="sm" variant="ghost" onClick={onClose}><X size={16} /></Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Property list */}
          <div className="w-[180px] border-r border-border overflow-y-auto p-2 space-y-1">
            {props.map((p) => (
              <div
                key={p.id}
                onClick={() => setEditingProp(p)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm group ${editingProp?.id === p.id ? "bg-primary/10 text-primary" : "hover:bg-muted/50"}`}
              >
                <GripVertical size={14} className="text-muted-foreground flex-shrink-0" />
                <span className="flex-1 truncate">{p.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteProp(p.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="w-full justify-start text-muted-foreground mt-2" onClick={addProperty}>
              <Plus size={14} className="mr-1" />プロパティを追加
            </Button>
          </div>

          {/* Property settings */}
          <div className="flex-1 overflow-y-auto p-4">
            {editingProp ? (
              <div className="space-y-4">
                <div>
                  <Label>名前</Label>
                  <Input
                    value={editingProp.name}
                    onChange={(e) => updateProp(editingProp.id, { name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>タイプ</Label>
                  <Select
                    value={editingProp.type}
                    onValueChange={(v) => updateProp(editingProp.id, { type: v as PropertyType, options: [] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((t) => (
                        <SelectItem key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(editingProp.type === "select" || editingProp.type === "multi_select") && (
                  <div>
                    <Label>オプション</Label>
                    <div className="space-y-2 mt-1">
                      {(editingProp.options || []).map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Select
                            value={opt.color}
                            onValueChange={(color) => {
                              const options = [...(editingProp.options || [])];
                              options[i] = { ...options[i], color };
                              updateProp(editingProp.id, { options });
                            }}
                          >
                            <SelectTrigger className="w-10 px-2">
                              <div className={`w-3 h-3 rounded-full ${COLOR_PREVIEW[opt.color]}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {COLORS.map((c) => (
                                <SelectItem key={c} value={c}>
                                  <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full ${COLOR_PREVIEW[c]}`} />
                                    {c}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="flex-1 text-sm">{opt.label}</span>
                          <button onClick={() => removeOption(i)} className="text-muted-foreground hover:text-destructive">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Input
                          placeholder="オプションを追加"
                          value={newOptionLabel}
                          onChange={(e) => setNewOptionLabel(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addOption()}
                          className="h-8 text-sm"
                        />
                        <Button size="sm" variant="outline" onClick={addOption}><Plus size={14} /></Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center mt-8">プロパティを選択してください</p>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border flex gap-2">
          <Button className="flex-1" onClick={handleSave}>保存</Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>キャンセル</Button>
        </div>
      </div>
    </div>
  );
}
