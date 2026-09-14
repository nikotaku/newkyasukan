import {
  assertStoreManager,
  authenticateUser,
} from "../../server/estama-automation.js";
import { processO2StoreAvailabilityPost } from "../../server/o2-store-availability.js";

export const config = { maxDuration: 300 };

type RequestLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown> | string;
};
type ResponseLike = {
  status(code: number): ResponseLike;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
};

const parseBody = (body: RequestLike["body"]): Record<string, unknown> => {
  if (typeof body === "string") return JSON.parse(body) as Record<string, unknown>;
  return body && typeof body === "object" ? body : {};
};

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const storeId = String(parseBody(req.body).storeId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(storeId)) {
      res.status(400).json({ error: "店舗を確認してください" });
      return;
    }
    const { admin, user } = await authenticateUser(req);
    await assertStoreManager(admin, user.id, storeId);

    const result = await processO2StoreAvailabilityPost(admin, storeId, { triggerSource: "manual" });
    const statusCode = result.status === "failed" ? 500 : result.status === "review_required" ? 409 : 200;
    res.status(statusCode).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /認証|ログイン|権限/.test(message) ? 401 : 400;
    console.error(JSON.stringify({ level: "warn", msg: "o2_store_availability_manual_post_failed", error: message }));
    res.status(status).json({ error: message });
  }
}
