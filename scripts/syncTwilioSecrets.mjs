const required = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.log(`[twilio] Vault sync skipped (missing: ${missing.join(", ")})`);
  process.exit(0);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://imrxzkivwrkqbhqfbbes.supabase.co";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const response = await fetch(`${supabaseUrl}/rest/v1/rpc/set_twilio_api_credentials`, {
  method: "POST",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    p_account_sid: process.env.TWILIO_ACCOUNT_SID,
    p_api_key_sid: process.env.TWILIO_API_KEY_SID,
    p_api_key_secret: process.env.TWILIO_API_KEY_SECRET,
  }),
});

if (!response.ok) {
  throw new Error(`[twilio] Vault sync failed (${response.status}): ${await response.text()}`);
}

console.log("[twilio] API credentials synced to Supabase Vault");

if (process.env.TWILIO_SMS_FROM) {
  const senderResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/set_twilio_sms_from`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_sms_from: process.env.TWILIO_SMS_FROM }),
  });
  if (!senderResponse.ok) {
    throw new Error(`[twilio] sender sync failed (${senderResponse.status}): ${await senderResponse.text()}`);
  }
  console.log("[twilio] SMS sender synced to Supabase Vault");
}
