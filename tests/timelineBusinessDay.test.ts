import assert from 'node:assert/strict';
import test from 'node:test';
import { RESERVATION_DAY_START, toStoredTime, toExtTime } from '../src/lib/timeFormat.ts';

test('24〜28時は翌暦日で保存し、前営業日の取得範囲だけに入る', () => {
  for (const hour of [24, 25, 26, 27, 28]) {
    const input = `${hour}:00`;
    const stored = toStoredTime(input);
    assert.equal(stored.dayOffset, 1);
    assert.ok(`${stored.time}:00` < RESERVATION_DAY_START);
    assert.equal(toExtTime(stored.time), input);
  }
  assert.ok('06:00:00' >= RESERVATION_DAY_START);
  assert.ok('11:00:00' >= RESERVATION_DAY_START);
});
