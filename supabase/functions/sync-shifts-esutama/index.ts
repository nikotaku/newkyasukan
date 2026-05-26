import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// All 30-min slots from 11:00 to 24:30 (28 slots total)
function buildSlots(): string[] {
  const slots: string[] = [];
  // 11:00 to 23:30 (normal hours)
  for (let h = 11; h <= 23; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  // 24:00 and 24:30 (past midnight in estama format)
  slots.push("24:00");
  slots.push("24:30");
  return slots;
}

// Convert DB time string to minutes since midnight for comparison
// Times < 11:00 in DB mean past midnight (next day), add 24*60
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  let minutes = h * 60 + m;
  // If hour is less than 11, it's a past-midnight time (e.g., 01:00 = 25:00 estama)
  if (h < 11) {
    minutes += 24 * 60;
  }
  return minutes;
}

// Convert estama slot string (e.g., "24:00") to minutes since midnight
function slotToMinutes(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
}

// Convert DB time to estama format (e.g., "01:00" -> "25:00")
function dbTimeToEstama(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  if (h < 11) {
    return `${String(h + 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return timeStr;
}

interface Shift {
  shift_date: string;
  start_time: string;
  end_time: string;
}

// Build URL-encoded payload for a single date
function buildPayload(
  date: string,
  shifts: Shift[],
  shopId: string,
  castId: string,
  ctk: string
): string {
  const slots = buildSlots();

  // Find shift for this date
  const dayShifts = shifts.filter((s) => s.shift_date === date);

  // Determine select_start and select_end from first shift on this date
  // (estama takes one shift per day via select)
  const primaryShift = dayShifts[0];

  const params = new URLSearchParams();

  if (primaryShift) {
    const startEstama = dbTimeToEstama(primaryShift.start_time);
    const endEstama = dbTimeToEstama(primaryShift.end_time);
    params.set(`column[${date}][select][select_start]`, startEstama);
    params.set(`column[${date}][select][select_end]`, endEstama);
  } else {
    // No shift: use empty select (estama treats as day off)
    params.set(`column[${date}][select][select_start]`, "");
    params.set(`column[${date}][select][select_end]`, "");
  }

  // Build period slots
  for (const slot of slots) {
    const slotMin = slotToMinutes(slot);
    let value = "0";

    if (primaryShift) {
      const startMin = timeToMinutes(primaryShift.start_time);
      const endMin = timeToMinutes(primaryShift.end_time);
      // Slot is active if slotMin >= startMin && slotMin < endMin
      if (slotMin >= startMin && slotMin < endMin) {
        value = "1";
      }
    }

    params.set(`column[${date}][period][${slot}]`, value);
  }

  params.set("brws_shop_id", shopId);
  params.set("cast_id", castId);
  params.set("week", "0");
  params.set("_check", "");
  params.set("ctk", ctk);

  return params.toString();
}

// Fetch fresh session cookies from estama schedule page
async function fetchEstamaCookies(
  castId: string,
  checklogin: string,
  estamaCid: string
): Promise<{ zCiSessions: string; ctkCookie: string }> {
  const url = `https://estama.jp/admin/schedule/${castId}`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Cookie: `checklogin=${checklogin}; _estama_cid=${estamaCid}`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch estama schedule page: ${resp.status} ${resp.statusText}`
    );
  }

  // Extract cookies from Set-Cookie headers
  // Deno fetch returns headers; we need to get all set-cookie values
  const setCookieHeaders: string[] = [];
  resp.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      setCookieHeaders.push(value);
    }
  });

  let zCiSessions = "";
  let ctkCookie = "";

  for (const cookieHeader of setCookieHeaders) {
    const cookiePart = cookieHeader.split(";")[0].trim();
    const eqIdx = cookiePart.indexOf("=");
    if (eqIdx === -1) continue;
    const name = cookiePart.substring(0, eqIdx).trim();
    const value = cookiePart.substring(eqIdx + 1).trim();

    if (name === "z_ci_sessions") {
      zCiSessions = value;
    } else if (name === "ctk_cookie") {
      ctkCookie = value;
    }
  }

  if (!zCiSessions || !ctkCookie) {
    throw new Error(
      `Could not extract required cookies. z_ci_sessions=${!!zCiSessions}, ctk_cookie=${!!ctkCookie}`
    );
  }

  return { zCiSessions, ctkCookie };
}

// Post shift data for a single date to estama
async function postShiftDate(
  date: string,
  shifts: Shift[],
  castId: string,
  shopId: string,
  checklogin: string,
  estamaCid: string,
  zCiSessions: string,
  ctkCookie: string
): Promise<void> {
  const payload = buildPayload(date, shifts, shopId, castId, ctkCookie);

  const resp = await fetch(
    "https://estama.jp/admin/schedule/post_work_schedule/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `z_ci_sessions=${zCiSessions}; checklogin=${checklogin}; _estama_cid=${estamaCid}; ctk_cookie=${ctkCookie}`,
        Referer: `https://estama.jp/admin/schedule/${castId}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Origin: "https://estama.jp",
      },
      body: payload,
    }
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(
      `POST failed for date ${date}: ${resp.status} ${resp.statusText} — ${body.substring(0, 200)}`
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const checklogin = Deno.env.get("ESTAMA_CHECKLOGIN")!;
    const estamaCid = Deno.env.get("ESTAMA_CID")!;
    const shopId = Deno.env.get("ESTAMA_SHOP_ID") || "43923";

    if (!checklogin || !estamaCid) {
      throw new Error("Missing required secrets: ESTAMA_CHECKLOGIN or ESTAMA_CID");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all casts with estama credentials
    const { data: credentials, error: credError } = await supabase
      .from("cast_site_credentials")
      .select("cast_id, password")
      .eq("site", "esutama")
      .not("password", "is", null);

    if (credError) throw credError;
    if (!credentials || credentials.length === 0) {
      return new Response(
        JSON.stringify({ message: "No esutama credentials found", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${credentials.length} casts with esutama credentials`);

    // Build 14-day date window starting from today (JST)
    const now = new Date();
    // JST = UTC+9
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    const dates: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(jstNow);
      d.setUTCDate(jstNow.getUTCDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }

    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    console.log(`Syncing dates ${startDate} to ${endDate}`);

    const results: Array<{
      cast_id: string;
      estama_cast_id: string;
      status: string;
      dates_synced?: number;
      error?: string;
    }> = [];

    for (const cred of credentials) {
      const castId = cred.cast_id;
      const estamaCastId = cred.password; // password field holds estama numeric cast ID

      if (!estamaCastId) {
        results.push({
          cast_id: castId,
          estama_cast_id: "",
          status: "skipped",
          error: "No estama cast ID (password is null)",
        });
        continue;
      }

      try {
        // Fetch shifts for this cast over the 14-day window
        const { data: shifts, error: shiftError } = await supabase
          .from("shifts")
          .select("shift_date, start_time, end_time")
          .eq("cast_id", castId)
          .gte("shift_date", startDate)
          .lte("shift_date", endDate)
          .neq("status", "cancelled");

        if (shiftError) throw shiftError;

        const castShifts: Shift[] = shifts || [];
        console.log(
          `Cast ${castId} (estama: ${estamaCastId}): ${castShifts.length} shifts in window`
        );

        // Fetch fresh cookies for this cast
        const { zCiSessions, ctkCookie } = await fetchEstamaCookies(
          estamaCastId,
          checklogin,
          estamaCid
        );

        // Post each date
        let datesSynced = 0;
        for (const date of dates) {
          try {
            await postShiftDate(
              date,
              castShifts,
              estamaCastId,
              shopId,
              checklogin,
              estamaCid,
              zCiSessions,
              ctkCookie
            );
            datesSynced++;
          } catch (dateErr: unknown) {
            const msg = dateErr instanceof Error ? dateErr.message : String(dateErr);
            console.error(`Cast ${castId} date ${date} error: ${msg}`);
          }
        }

        results.push({
          cast_id: castId,
          estama_cast_id: estamaCastId,
          status: "success",
          dates_synced: datesSynced,
        });
      } catch (castErr: unknown) {
        const msg = castErr instanceof Error ? castErr.message : String(castErr);
        console.error(`Cast ${castId} (estama: ${estamaCastId}) failed: ${msg}`);
        results.push({
          cast_id: castId,
          estama_cast_id: estamaCastId,
          status: "failed",
          error: msg,
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    console.log(
      `Sync complete: ${successCount} succeeded, ${failedCount} failed`
    );

    return new Response(
      JSON.stringify({
        message: `Sync complete: ${successCount} succeeded, ${failedCount} failed`,
        dates: { start: startDate, end: endDate },
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Fatal error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
