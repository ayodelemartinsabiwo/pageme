import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cycle, getAppSourceCategory, getInboxCategories, getInboxCategoryItems,
  getInboxContacts, getInboxMessages, getInboxSenderKey, getInboxSenderName,
} from '../src/utils.js';

const messages = [
  { id: 'p2', source: 'WhatsApp', from: 'Ada', read: false },
  { id: 'p1', source: 'WhatsApp', from: 'Ada', read: true },
  { id: 'p0', source: 'Gmail', from: 'Team', read: false },
];

test('inbox helpers group messages consistently by app and sender', () => {
  assert.equal(getAppSourceCategory('Gmail'), 'EMAIL');
  assert.deepEqual(getInboxCategories(messages).map(item => item.name), ['WHATSAPP', 'EMAIL']);
  assert.equal(getInboxContacts(messages, 'WHATSAPP')[0].unread, 1);
  assert.equal(getInboxMessages(messages, 'WHATSAPP', 'Ada').length, 2);
});

test('cycle advances through a fixed option list', () => {
  assert.equal(cycle(['a', 'b', 'c'], 'b'), 'c');
});

test('WhatsApp notification-count suffixes stay grouped under one sender', () => {
  const variants = [
    { id: 'p4', source: 'WhatsApp', from: 'Ada', read: false },
    { id: 'p3', source: 'WhatsApp', from: 'ADA (2 messages)', read: false },
    { id: 'p2', source: 'WhatsApp', from: 'Ada - WhatsApp', read: true },
  ];
  assert.equal(getInboxSenderName(variants[1]), 'ADA');
  assert.equal(getInboxContacts(variants, 'WHATSAPP').length, 1);
  assert.equal(getInboxMessages(variants, 'WHATSAPP', 'Ada').length, 3);
});

test('stable conversation keys group every sender even when displayed titles vary', () => {
  const variants = [
    { id: 'p4', source: 'WhatsApp', from: 'SIBLINGS ABIWO', senderKey: 'com.whatsapp|shortcut|family-42', read: false },
    { id: 'p3', source: 'WhatsApp', from: '3 messages from Siblings  Abiwo', senderKey: 'com.whatsapp|shortcut|family-42', read: false },
    { id: 'p2', source: 'WhatsApp', from: 'Abiwo - WhatsApp', senderKey: 'com.whatsapp|shortcut|family-42', read: true },
  ];
  assert.equal(getInboxContacts(variants, 'WHATSAPP').length, 1);
  assert.equal(getInboxMessages(variants, 'WHATSAPP', 'SIBLINGS ABIWO').length, 3);
  assert.equal(getInboxSenderKey(variants[0]), getInboxSenderKey(variants[2]));
});

test('legacy and native conversation records merge for every sender', () => {
  const variants = [
    { id: 'p4', source: 'WhatsApp', from: 'Siblings Abiwo', senderKey: 'com.whatsapp|shortcut|family-42', read: false },
    { id: 'p3', source: 'WhatsApp', from: 'SIBLINGS ABIWO', read: false },
    { id: 'p2', source: 'WhatsApp', from: 'Abiwo - WhatsApp', senderKey: 'com.whatsapp|shortcut|family-42', read: true },
  ];
  assert.equal(getInboxContacts(variants, 'WHATSAPP').length, 1);
  assert.equal(getInboxContacts(variants, 'WHATSAPP')[0].total, 3);
  assert.equal(getInboxMessages(variants, 'WHATSAPP', 'Siblings Abiwo').length, 3);
});

test('sender cleanup applies to every notification source and normalizes invisible spacing', () => {
  const variants = [
    { id: 'p2', source: 'Slack', from: 'Project\u200b  Team (2 messages)', read: false },
    { id: 'p1', source: 'Slack', from: 'Project Team', read: true },
  ];
  assert.equal(getInboxSenderName(variants[0]), 'Project Team');
  assert.equal(getInboxContacts(variants, 'SLACK').length, 1);
});

test('inbox exposes a real clear action and maps legacy PageMe sources to SMS', () => {
  assert.equal(getAppSourceCategory('PageMe'), 'SMS');
  const items = getInboxCategoryItems(messages);
  assert.equal(items[0].clearAction, true);
  assert.equal(items[0].total, messages.length);
});
