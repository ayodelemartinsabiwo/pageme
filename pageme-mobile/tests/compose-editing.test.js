import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampTextCursor, deleteBeforeTextCursor, insertTextAtCursor, moveTextCursor,
} from '../src/compose-editing.js';

test('compose cursor moves left and right without leaving the message', () => {
  assert.equal(moveTextCursor('PAGE', 2, 'left'), 1);
  assert.equal(moveTextCursor('PAGE', 2, 'right'), 3);
  assert.equal(moveTextCursor('PAGE', 0, 'left'), 0);
  assert.equal(moveTextCursor('PAGE', 4, 'right'), 4);
  assert.equal(clampTextCursor('PAGE', 99), 4);
});

test('compose inserts and deletes at the cursor instead of only at the end', () => {
  assert.deepEqual(insertTextAtCursor('Helo', 3, 'l', 32), {
    value: 'Hello', cursor: 4,
  });
  assert.deepEqual(deleteBeforeTextCursor('Hello', 4), {
    value: 'Helo', cursor: 3,
  });
});

test('compose insertion keeps the existing recipient and message limits', () => {
  assert.deepEqual(insertTextAtCursor('1234', 2, 'XYZ', 5), {
    value: '12X34', cursor: 3,
  });
});
