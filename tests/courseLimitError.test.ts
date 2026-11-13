import test from 'node:test';
import assert from 'node:assert/strict';
import { courseLimitErrorMessage } from '../src/lib/courseLimitError.ts';

test('show the course selection remedy only for the known validation error', () => {
  const message = '初めて当店をご利用のお客様は、このセラピストのコースは80分までです。コースを選び直してください。';
  assert.equal(courseLimitErrorMessage({code:'23514',details:'NEW_CUSTOMER_COURSE_LIMIT',message}),message);
  for (const error of [null, 'error', {message:'internal database detail'}, {code:'23514',details:'other',message}]) {
    assert.equal(courseLimitErrorMessage(error), null);
  }
});
