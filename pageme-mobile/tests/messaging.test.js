import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createClientMessageId,
  isRetryableMessageError,
  mergeNetworkMessages,
  messageCursorStorageKey,
  newIncomingNetworkMessages,
  normalizeUcn,
  pruneExpiredNetworkMessages,
  serverMessageToInbox,
} from '../src/messaging.js';
import { getAppSourceCategory, getInboxContacts, getInboxMessages } from '../src/utils.js';

const serverMessage = {
  id: 'msg-001',
  clientMessageId: 'AYO-001:client-001',
  fromUcn: 'AYO-001',
  toUcn: 'LAG-002',
  message: 'Focus at 3?',
  type: 'text',
  createdAt: '2026-08-27T09:30:00.000Z',
  deliveredAt: '',
  readAt: '',
};

test('UCN helpers normalize identities and scope sync cursors', () => {
  assert.equal(normalizeUcn(' ayo-001 '), 'AYO-001');
  assert.equal(normalizeUcn('not-a-ucn'), '');
  assert.equal(messageCursorStorageKey('lag-002'), 'pageme_message_cursor_LAG-002');
  assert.match(
    createClientMessageId('AYO-001', { randomUUID: () => 'uuid-1' }),
    /^AYO-001:uuid-1$/,
  );
});

test('server retention removes only expired PageMe network messages', () => {
  const inbox = [
    { id: 'old', source: 'pageme-network', text: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'new', source: 'pageme-network', text: 'new', createdAt: '2026-08-20T00:00:00.000Z' },
    { id: 'sms', source: 'sms', text: 'keep local SMS', createdAt: '2025-01-01T00:00:00.000Z' },
  ];
  const result = pruneExpiredNetworkMessages(inbox, 30, '2026-08-27T00:00:00.000Z');
  assert.deepEqual(result.map(message => message.id), ['new', 'sms']);
});

test('outbox retries only transient server failures', () => {
  assert.equal(isRetryableMessageError('SERVER_ERROR'), true);
  assert.equal(isRetryableMessageError('RATE_LIMIT'), true);
  assert.equal(isRetryableMessageError('UCN_NOT_FOUND'), false);
  assert.equal(isRetryableMessageError('RECIPIENT_UNAVAILABLE'), false);
});

test('server messages become replyable PageMe inbox records for either participant', () => {
  const received = serverMessageToInbox(serverMessage, 'LAG-002');
  assert.equal(received.from, 'AYO-001');
  assert.equal(received.direction, 'incoming');
  assert.equal(received.source, 'pageme-network');
  assert.equal(received.canReply, true);
  assert.equal(received.read, false);

  const sent = serverMessageToInbox({ ...serverMessage, deliveredAt: '2026-08-27T09:31:00.000Z' }, 'AYO-001');
  assert.equal(sent.from, 'LAG-002');
  assert.equal(sent.direction, 'outgoing');
  assert.equal(sent.status, 'delivered');
  assert.equal(sent.read, true);
});

test('network sync is idempotent and applies later delivery and read statuses', () => {
  const first = mergeNetworkMessages([], [serverMessage], 'AYO-001');
  const second = mergeNetworkMessages(first, [{
    ...serverMessage,
    deliveredAt: '2026-08-27T09:31:00.000Z',
    readAt: '2026-08-27T09:32:00.000Z',
  }], 'AYO-001');

  assert.equal(second.length, 1);
  assert.equal(second[0].id, 'msg-001');
  assert.equal(second[0].status, 'read');
  assert.equal(second[0].readAt, '2026-08-27T09:32:00.000Z');
});

test('only unseen received messages are surfaced as new pages', () => {
  const incoming = newIncomingNetworkMessages([], [serverMessage], 'LAG-002');
  assert.deepEqual(incoming.map(message => message.id), ['msg-001']);
  assert.deepEqual(newIncomingNetworkMessages(incoming, [serverMessage], 'LAG-002'), []);
  assert.deepEqual(newIncomingNetworkMessages([], [serverMessage], 'AYO-001'), []);
});

test('direct UCN conversations are grouped in PageMe rather than legacy SMS', () => {
  const messages = mergeNetworkMessages([], [
    serverMessage,
    { ...serverMessage, id: 'msg-002', clientMessageId: 'LAG-002:client-2', fromUcn: 'LAG-002', toUcn: 'AYO-001', message: 'Yes.' },
  ], 'AYO-001');

  assert.equal(getAppSourceCategory('pageme-network'), 'PAGEME');
  assert.deepEqual(getInboxContacts(messages, 'PAGEME').map(contact => contact.name), ['LAG-002']);
  assert.equal(getInboxMessages(messages, 'PAGEME', 'LAG-002').length, 2);
  assert.equal(getAppSourceCategory('pageme'), 'SMS');
});
