import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEvent } from '../src/events.js';

test('makeEvent builds a normalized chat event with a timestamp', () => {
  const e = makeEvent('chat', { user: { id: 1, name: 'Anna' }, text: '56' });
  assert.equal(e.type, 'chat');
  assert.deepEqual(e.user, { id: '1', name: 'Anna', avatar: null });
  assert.equal(e.text, '56');
  assert.equal(typeof e.receivedAt, 'number');
});

test('makeEvent fills gift defaults and rejects unknown types', () => {
  const e = makeEvent('gift', { user: { name: 'Bo' }, gift: { name: 'Rose' } });
  assert.deepEqual(e.gift, { name: 'Rose', diamonds: 0, count: 1 });
  assert.throws(() => makeEvent('dance', {}));
});
