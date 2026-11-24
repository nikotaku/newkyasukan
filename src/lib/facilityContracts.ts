import { supabase } from "@/integrations/supabase/client";

// 契約管理の契約書ファイル（非公開バケット contract-documents の <store_id>/<contract_id>/…）
export const CONTRACT_DOCUMENT_BUCKET = "contract-documents";

export type ContractDocument = {
  path: string;
  name: string;
  size: number;
  type: string;
  uploaded_at: string;
};

export function normalizeContractDocuments(value: unknown): ContractDocument[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ContractDocument =>
    !!item && typeof item === "object" && typeof (item as ContractDocument).path === "string" && typeof (item as ContractDocument).name === "string");
}

/** ストレージのキーに使えるファイル名（日本語などは外し、拡張子は残す） */
export function safeStorageName(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase() : "";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "file";
  return ext ? `${base}.${ext}` : base;
}

/** 契約を消す（付いている契約書のファイルも一緒に消す） */
export async function deleteFacilityContract(id: string, documents: ContractDocument[]) {
  if (documents.length) {
    await supabase.storage.from(CONTRACT_DOCUMENT_BUCKET).remove(documents.map((doc) => doc.path));
  }
  const { error } = await supabase.from("facility_contracts").delete().eq("id", id);
  if (error) throw error;
}
