export function clampTextCursor(value, cursor) {
  const text = String(value ?? '');
  const position = Number.isFinite(cursor) ? Math.trunc(cursor) : text.length;
  return Math.max(0, Math.min(text.length, position));
}

export function moveTextCursor(value, cursor, direction) {
  const position = clampTextCursor(value, cursor);
  return clampTextCursor(value, position + (direction === 'left' ? -1 : 1));
}

export function insertTextAtCursor(value, cursor, insertion, limit) {
  const text = String(value ?? '');
  const position = clampTextCursor(text, cursor);
  const available = Math.max(0, limit - text.length);
  const added = String(insertion ?? '').slice(0, available);
  return {
    value: text.slice(0, position) + added + text.slice(position),
    cursor: position + added.length,
  };
}

export function deleteBeforeTextCursor(value, cursor) {
  const text = String(value ?? '');
  const position = clampTextCursor(text, cursor);
  if (position === 0) return { value: text, cursor: 0 };
  return {
    value: text.slice(0, position - 1) + text.slice(position),
    cursor: position - 1,
  };
}
