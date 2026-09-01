import test from 'node:test';
import assert from 'node:assert/strict';

import { inboxStorageKey, isAlarmPage, isWeatherPage, normalizeInbox, normalizePageSource, pageContentKey } from '../src/inbox.js';

test('inbox storage is scoped to a normalized UCN', () => {
  assert.equal(inboxStorageKey(' ayo-001 '), 'pageme_inbox_AYO-001');
  assert.equal(inboxStorageKey(''), '');
});

test('legacy alarm pages are removed during inbox migration', () => {
  assert.equal(isAlarmPage({ source: 'Alarm', text: 'Incoming alarm' }), true);
  assert.equal(isAlarmPage({ source: 'SMS', from: 'Alarm company' }), false);
  assert.deepEqual(normalizeInbox([
    { id: 'alarm-1', source: 'Alarm', text: 'Incoming alarm' },
    { id: 'message-1', source: 'SMS', text: 'Keep me' },
  ]).map(item => item.id), ['message-1']);
});

test('weather forecasts are removed without discarding ordinary Google pages', () => {
  assert.equal(isWeatherPage({ source: 'Weather', text: 'UV will be extreme' }), true);
  assert.equal(isWeatherPage({ source: 'Google', text: 'Slight cooling over the next 3 days' }), true);
  assert.equal(isWeatherPage({ source: 'SMS', from: 'Slight cooling over the next 3 days' }), true);
  assert.equal(isWeatherPage({ source: 'Google', from: 'Forbes', text: 'Markets close higher' }), false);
  assert.equal(isWeatherPage({ source: 'SMS', text: 'Let us discuss the weather' }), false);

  const result = normalizeInbox([
    { id: 'weather-1', source: 'Weather', text: 'UV will be extreme' },
    { id: 'weather-2', source: 'Google', text: 'Slight cooling over the next 3 days' },
    { id: 'news-1', source: 'Google', from: 'Forbes', text: 'Markets close higher' },
  ]);
  assert.deepEqual(result.map(item => item.id), ['news-1']);
});

test('normalizeInbox removes invalid and duplicate records and bounds retained history', () => {
  const source = [
    { id: 'p2', from: ' Alice ', text: 'hello', read: true, canReply: true, replyKey: 'native-2' },
    { id: 'p2', from: 'duplicate', text: 'ignored' },
    null,
    { id: 'p1', text: 'older', type: 'code' },
  ];
  const result = normalizeInbox(source, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].from, 'Alice');
  assert.equal(result[0].replyKey, 'native-2');
  assert.equal(result[1].from, 'UNKNOWN');
  assert.equal(result[1].type, 'code');
});

test('rapid duplicate pages are collapsed even when Android notification keys changed', () => {
  const result = normalizeInbox([
    { id: 'p1760000120000', source: 'SMS', from: '3003', number: '3003', text: 'Your bundle is active', date: 'JUL 27', time: '12:02' },
    { id: 'p1760000060000', source: 'SMS', from: '3003', number: '3003', text: 'Your bundle is active', date: 'JUL 27', time: '12:01' },
    { id: 'p1759990000000', source: 'SMS', from: '3003', number: '3003', text: 'Your bundle is active', date: 'JUL 27', time: '09:13' },
  ]);

  assert.equal(result.length, 2);
  assert.equal(pageContentKey(result[0]), pageContentKey(result[1]));
});

test('legacy PageMe passthrough messages migrate into SMS', () => {
  assert.equal(normalizePageSource('PageMe'), 'sms');
  const result = normalizeInbox([
    { id: 'p1760000120000', source: 'PageMe', from: '3003', text: 'Bundle active' },
    { id: 'p1760000060000', source: 'SMS', from: '3003', text: 'Bundle active' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'sms');
});

test('normalizeInbox retains native conversation identity for grouping', () => {
  const [message] = normalizeInbox([
    { id: 'p1760000120000', source: 'WhatsApp', from: 'Siblings Abiwo', text: 'Hello', senderKey: 'com.whatsapp|shortcut|family-42' },
  ]);
  assert.equal(message.senderKey, 'com.whatsapp|shortcut|family-42');
});

test('normalizeInbox retains direct PageMe delivery metadata across restarts', () => {
  const [message] = normalizeInbox([{
    id: 'msg-123', source: 'pageme-network', from: 'AYO-001', text: 'Hello',
    serverMessageId: 'msg-123', clientMessageId: 'LAG-002:abc', direction: 'incoming',
    status: 'delivered', createdAt: '2026-08-27T09:30:00.000Z',
    deliveredAt: '2026-08-27T09:31:00.000Z', readAt: '', replyToId: 'msg-100',
    canReply: true, senderKey: 'pageme:AYO-001',
  }]);

  assert.equal(message.serverMessageId, 'msg-123');
  assert.equal(message.direction, 'incoming');
  assert.equal(message.status, 'delivered');
  assert.equal(message.replyToId, 'msg-100');
});

test('duplicate detection uses stable sender identity when notification titles change', () => {
  const first = { source: 'WhatsApp', from: 'Siblings Abiwo', senderKey: 'chat-42', text: 'Hello' };
  const second = { source: 'WhatsApp', from: 'Abiwo (2 messages)', senderKey: 'chat-42', text: 'Hello' };
  assert.equal(pageContentKey(first), pageContentKey(second));
});
