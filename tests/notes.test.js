import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { validateNote, normalizeNotes } from '../docs/note-model.js';

const note = { name: 'Bruno', recipient: 'Todos', message: 'Um Natal de paz!', color: 'gold' };

test('valida limites, cor e campos vazios sem interpretar HTML', () => {
  assert.deepEqual(validateNote({ ...note, name: ' Bruno ' }), note);
  for (const invalid of [{ name: ' ' }, { name: 'x'.repeat(51) }, { recipient: 'x'.repeat(51) }, { message: '' }, { message: 'x'.repeat(301) }, { color: 'unknown' }]) {
    assert.throws(() => validateNote({ ...note, ...invalid }));
  }
  assert.equal(validateNote({ ...note, message: '<script>alert(1)</script>' }).message, '<script>alert(1)</script>');
});

test('normaliza timestamps Firestore e ignora registros inválidos', () => {
  const result = normalizeNotes([
    { ...note, uid: 'a', id: 'first', createdAt: 10 },
    { ...note, uid: 'a', id: 'second', createdAt: { toMillis: () => 20 } },
    { ...note, uid: 'a', id: 'bad', createdAt: null },
    { ...note, id: 'missing-owner', createdAt: 30 }
  ]);
  assert.deepEqual(result.map(item => item.id), ['second', 'first']);
});

test('persistência local, exclusão de autor e falha de quota sem falso sucesso', async () => {
  const values = new Map();
  let blocked = false;
  globalThis.crypto ??= webcrypto;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new Error('QuotaExceededError'); values.set(key, value); }
  };
  globalThis.window = { addEventListener() {} };
  const service = await import('../docs/firebase-service.js');
  let current = [];
  let state;
  const unsubscribe = service.subscribeNotes(data => { current = data; }, status => { state = status; });
  const id = await service.addNote(note);
  assert.equal(state.mode, 'local');
  assert.equal(current.length, 1);
  assert.equal(current[0].uid, service.getCurrentUid());
  const persisted = [...values.values()].find(value => value.startsWith('['));
  assert.equal(JSON.parse(persisted)[0].id, id);
  blocked = true;
  await assert.rejects(service.addNote(note));
  assert.equal(current.length, 1);
  await assert.rejects(service.deleteNote(id));
  assert.equal(current.length, 1);
  blocked = false;
  await assert.rejects(service.deleteNote('missing'));
  await service.deleteNote(id);
  assert.equal(current.length, 0);
  unsubscribe();
});
