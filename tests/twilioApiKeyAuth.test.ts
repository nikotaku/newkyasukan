import test from "node:test";
import assert from "node:assert/strict";
import { twilioAuthHeader } from "../supabase/functions/_shared/twilio.ts";

test("Twilio APIキーSIDとsecretをBasic認証に使う", () => {
  const header = twilioAuthHeader({
    accountSid: "AC_account",
    apiKeySid: "SK_restricted",
    apiKeySecret: "key_secret",
    smsFrom: null,
  });

  assert.equal(header, `Basic ${Buffer.from("SK_restricted:key_secret").toString("base64")}`);
  assert.equal(Buffer.from(header.slice(6), "base64").toString(), "SK_restricted:key_secret");
});
