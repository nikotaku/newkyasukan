import { getAdminClient } from "../../server/estama-automation.js";
import { processEnabledO2StoreAvailabilityPosts } from "../../server/o2-store-availability.js";

export const config = { maxDuration: 300 };

type RequestLike = { method?: string; body?: unknown };
type ResponseLike = {
  status(code: number): ResponseLike;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
};

const parseBody = (body: unknown): Record<string, unknown> => {
  if (typeof body === "string") return JSON.parse(body) as Record<string, unknown>;
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
};

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const token = String(parseBody(req.body).token || "").trim();
    if (!/^[0-9a-f]{64}$/.test(token)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const admin = getAdminClient();
    const { data: claimed, error: claimError } = await admin.rpc("claim_o2_store_availability_run_token", {
      p_token: token,
    });
    if (claimError) throw claimError;
    if (claimed !== true) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const results = await processEnabledO2StoreAvailabilityPosts(admin);
    const failed = results.filter((result) => result.status === "failed" || result.status === "review_required");
    console.log(JSON.stringify({
      level: failed.length ? "warn" : "info",
      msg: "o2_store_availability_cron_complete",
      processed: results.length,
      failed: failed.length,
    }));
    res.status(failed.length ? 207 : 200).json({
      ok: failed.length === 0,
      processed: results.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", msg: "o2_store_availability_cron_failed", error: message }));
    res.status(500).json({ error: message });
  }
}
