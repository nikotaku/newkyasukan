import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../supabase/functions/submit-cleaning-report/index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/, '');
function setup({ cast = true, existing = null, latest = null, lineStatus = 200 } = {}) {
  let handler;
  const calls = [];
  const admin = {
    from(table) {
      calls.push(table);
      const result = table === 'casts' ? { data: cast ? { id: 'cast', store_id: 'store', name: 'Test' } : null } : table === 'shop_settings' ? { data: { business_day_start: '10:00' } } : table === 'stores' ? { data: { name: 'Test' } } : table === 'line_notification_destinations' ? { data: { line_group_id: 'group' } } : { data: existing || latest };
      const q = new Proxy({}, { get(_, key) { if (key === 'then') return Promise.resolve(result).then.bind(Promise.resolve(result)); return () => q; } });
      return q;
    },
    storage: { from() { return { createSignedUrls: async () => ({ data: [{ signedUrl: 'https://example.com/a.jpg' }, { signedUrl: 'https://example.com/b.jpg' }] }) }; } },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, {
    createClient: () => admin, Deno: { env: { get: () => 'test' }, serve: (fn) => { handler = fn; } },
    Request, Response, FormData, File, Uint8Array, Intl, Date, console: { error() {} },
    fetch: async () => new Response('', { status: lineStatus }),
  });
  return { calls, async request(fields) { const body = new FormData(); for (const [k,v] of Object.entries(fields)) body.append(k,v); return handler(new Request('https://example.com', { method: 'POST', body })); } };
}
const id = '12345678-1234-4234-8234-123456789012';
test('status requires a valid therapist token', async () => {
  const app = setup({ cast: false });
  assert.equal((await app.request({ token: 'invalid', action: 'status' })).status, 401);
  assert.deepEqual(app.calls, ['casts']);
});
test('status restores the saved report without uploading photos or sending notifications', async () => {
  const app = setup({ latest: { id, notification_status: 'failed' } });
  const result = await (await app.request({ token: 'valid', action: 'status' })).json();
  assert.equal(result.report.id, id);
  assert.equal(result.report.notification_status, 'failed');
  assert.ok(!app.calls.includes('daily_clearances'));
});
test('new report rejects missing drain confirmation', async () => {
  const app = setup();
  const response = await app.request({ token: 'valid', report_id: id, laundry_started: 'true', trash_taken_out: 'true' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /排水口/);
});
test('saved report retries notification without photographs or changing settlement', async () => {
  const app = setup({ existing: { id, cast_id: 'cast', store_id: 'store', date: '2026-10-27', notification_status: 'failed', room_photo_path: 'a', water_area_photo_path: 'b' } });
  const response = await app.request({ token: 'valid', report_id: id });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.ok(!app.calls.includes('daily_clearances'));
});
test('LINE rate limit preserves the report and explains settlement need not be resent', async () => {
  const app = setup({ lineStatus: 429, existing: { id, cast_id: 'cast', store_id: 'store', date: '2026-10-27', notification_status: 'failed', room_photo_path: 'a', water_area_photo_path: 'b' } });
  const response = await app.request({ token: 'valid', report_id: id });
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.equal(result.saved, true);
  assert.match(result.error, /精算の再送は不要/);
});
