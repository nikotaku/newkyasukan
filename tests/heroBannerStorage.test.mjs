import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

test("hero banner upload and public URL use the provisioned storage bucket", () => {
  const source = readFileSync(new URL("../src/pages/HpTopBanners.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260528220000_create_banners_and_bucket.sql", import.meta.url), "utf8");
  assert.match(migration, /values \('banner-images', 'banner-images', true\)/);
  assert.match(source, /supabase\.storage\s*\.from\("banner-images"\)\s*\.upload\(/);
  assert.match(source, /supabase\.storage\.from\("banner-images"\)\.getPublicUrl\(path\)/);
  assert.doesNotMatch(source, /\.from\("banners"\)/);
});
