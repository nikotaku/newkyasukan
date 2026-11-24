import { useState } from "react";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  CONTRACT_DOCUMENT_BUCKET,
  normalizeContractDocuments,
  safeStorageName,
  type ContractDocument,
} from "@/lib/facilityContracts";

// 契約の詳細画面「契約書」：契約書のPDF・写真を何枚でも上げる・開く・消す。上げた・消したらすぐ保存する。
const MAX_BYTES = 20 * 1024 * 1024;
const db = supabase as unknown as { from: (table: string) => any };

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

export function ContractDocuments({ contractId, storeId, documents, onChange }: {
  contractId: string;
  storeId: string | null;
  documents: ContractDocument[];
  onChange: (next: ContractDocument[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  // ほかの端末での変更を消さないよう、保存の直前に読み直してから入れ替える
  const save = async (update: (current: ContractDocument[]) => ContractDocument[]) => {
    const { data, error } = await db.from("facility_contracts").select("documents").eq("id", contractId).single();
    if (error) throw error;
    const next = update(normalizeContractDocuments(data?.documents));
    const { error: updateError } = await db.from("facility_contracts").update({ documents: next }).eq("id", contractId);
    if (updateError) throw updateError;
    onChange(next);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!storeId) { toast.error("店舗が分からないため上げられません"); return; }
    setUploading(true);
    const added: ContractDocument[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) { toast.error(`${file.name} は20MBを超えています`); continue; }
        const path = `${storeId}/${contractId}/${Date.now()}_${safeStorageName(file.name)}`;
        const { error } = await supabase.storage.from(CONTRACT_DOCUMENT_BUCKET).upload(path, file, {
          upsert: false, contentType: file.type || undefined,
        });
        if (error) { toast.error(`${file.name} を上げられませんでした`); continue; }
        added.push({ path, name: file.name, size: file.size, type: file.type, uploaded_at: new Date().toISOString() });
      }
      if (added.length) {
        await save((current) => [...current, ...added]);
        toast.success(`契約書を${added.length}件追加しました`);
      }
    } catch (error) {
      console.error(error);
      toast.error("契約書を保存できませんでした");
      if (added.length) await supabase.storage.from(CONTRACT_DOCUMENT_BUCKET).remove(added.map((doc) => doc.path));
    } finally {
      setUploading(false);
    }
  };

  const open = async (doc: ContractDocument) => {
    setBusyPath(doc.path);
    const { data, error } = await supabase.storage.from(CONTRACT_DOCUMENT_BUCKET).createSignedUrl(doc.path, 600);
    setBusyPath(null);
    if (error || !data?.signedUrl) { toast.error("開けませんでした"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const remove = async (doc: ContractDocument) => {
    if (!confirm(`「${doc.name}」を消しますか？`)) return;
    setBusyPath(doc.path);
    try {
      await save((current) => current.filter((item) => item.path !== doc.path));
      await supabase.storage.from(CONTRACT_DOCUMENT_BUCKET).remove([doc.path]);
      toast.success("消しました");
    } catch (error) {
      console.error(error);
      toast.error("消せませんでした");
    } finally {
      setBusyPath(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">契約書</CardTitle>
        <Button asChild size="sm" variant="outline" disabled={uploading}>
          <label className="cursor-pointer">
            {uploading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Upload size={14} className="mr-1" />}
            アップロード
            <input type="file" multiple accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" className="hidden"
              onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
          </label>
        </Button>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだありません。PDF・写真（20MBまで）を何枚でも付けられます。</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {documents.map((doc) => (
              <li key={doc.path} className="flex items-center gap-2 px-3 py-2">
                <FileText size={16} className="shrink-0 text-muted-foreground" />
                <button type="button" onClick={() => void open(doc)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-primary hover:underline">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(doc.size)}・{new Date(doc.uploaded_at).toLocaleDateString("ja-JP")}</p>
                </button>
                {busyPath === doc.path ? <Loader2 size={14} className="animate-spin" /> : (
                  <>
                    <Button size="icon" variant="ghost" onClick={() => void open(doc)} aria-label="開く"><Download size={14} /></Button>
                    <Button size="icon" variant="ghost" onClick={() => void remove(doc)} aria-label="消す"><Trash2 size={14} /></Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
