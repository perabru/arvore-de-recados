export const COLORS = ['gold', 'red', 'green', 'cream'];
export const MAX_NOTES = 250;

export function validateNote(input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const recipient = typeof input?.recipient === 'string' ? input.recipient.trim() : '';
  const message = typeof input?.message === 'string' ? input.message.trim() : '';
  const color = input?.color;
  if (!name || name.length > 50) throw new Error('Escreva seu nome com até 50 caracteres.');
  if (recipient.length > 50) throw new Error('O destinatário deve ter até 50 caracteres.');
  if (!message || message.length > 300) throw new Error('Escreva um recado de 1 a 300 caracteres.');
  if (!COLORS.includes(color)) throw new Error('Escolha uma cor para o enfeite.');
  return { name, recipient, message, color };
}

export function normalizeNotes(entries) {
  return entries.flatMap(entry => {
    try {
      const note = validateNote(entry);
      const createdAt = entry.createdAt?.toMillis?.() ?? entry.createdAt;
      if (typeof entry.id !== 'string' || typeof entry.uid !== 'string' || !Number.isFinite(createdAt)) return [];
      return [{ ...note, id: entry.id, uid: entry.uid, createdAt }];
    } catch { return []; }
  }).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)).slice(0, MAX_NOTES);
}

