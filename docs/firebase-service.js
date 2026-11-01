import { firebaseConfig, databaseType, treeId } from './firebase-config.js';
import { validateNote, normalizeNotes, MAX_NOTES } from './note-model.js';

// O modo local é explícito e só existe quando nenhum projeto foi configurado.
// Falhas do Firebase nunca desviam gravações silenciosamente para localStorage.
const localMode = firebaseConfig === null;
const storageKey = `arvore-recados:${treeId}:notes`;
const identityKey = `arvore-recados:${treeId}:uid`;
const localMessage = 'Modo local: recados salvos somente neste navegador. O mural compartilhado ainda não está conectado.';
const subscribers = new Set();
const pendingIds = new Set();
let uid = null;
let latest = [];
let status = { state: 'connecting', message: 'Preparando a árvore…' };
let driverPromise;

function localId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function setStatus(next) {
  status = next;
  subscribers.forEach(sub => sub.onStatus({ ...status }));
}

function emitNotes(entries = latest) {
  latest = normalizeNotes(entries);
  const confirmed = latest.filter(note => !pendingIds.has(note.id));
  subscribers.forEach(sub => sub.onData(confirmed.map(note => ({ ...note }))));
}

function friendlyError(error) {
  const code = String(error?.code || '');
  if (code.includes('permission') || code.includes('PERMISSION')) return new Error('O mural não permitiu esta ação. Tente novamente mais tarde.');
  if (code.includes('operation-not-allowed') || code.includes('configuration-not-found')) return new Error('O mural compartilhado ainda precisa ser ativado.');
  if (code.includes('network') || code.includes('unavailable')) return new Error('Sem conexão com o mural. Confira sua internet e tente novamente.');
  return new Error(error?.message || 'Não foi possível salvar seu recado. Tente novamente.');
}

function readLocal() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Não foi possível ler os recados deste navegador.');
  return normalizeNotes(data);
}

async function start() {
  if (localMode) {
    try {
      uid = localStorage.getItem(identityKey);
      if (!uid) {
        uid = `local_${localId()}`;
        localStorage.setItem(identityKey, uid);
      }
      emitNotes(readLocal());
      setStatus({ state: 'offline', mode: 'local', message: localMessage });
      window.addEventListener('storage', event => {
        if (event.key !== storageKey && event.key !== null) return;
        try { emitNotes(readLocal()); }
        catch (error) { setStatus({ state: 'error', message: friendlyError(error).message }); }
      });
      return {
        async create(note) {
          const data = readLocal();
          if (data.length >= MAX_NOTES) throw new Error('Esta árvore local chegou a 250 recados. Exclua um dos seus para adicionar outro.');
          const id = localId();
          const next = [{ ...note, id, uid, createdAt: Date.now() }, ...data];
          // Em caso de quota/bloqueio do armazenamento, não emitir sucesso nem alterar a árvore.
          localStorage.setItem(storageKey, JSON.stringify(next));
          emitNotes(next);
          return id;
        },
        async remove(id) {
          const data = readLocal();
          const found = data.find(note => note.id === id);
          if (!found || found.uid !== uid) throw new Error('Você pode excluir apenas seus próprios recados.');
          const next = data.filter(note => note.id !== id);
          localStorage.setItem(storageKey, JSON.stringify(next));
          emitNotes(next);
        }
      };
    } catch {
      throw new Error('Este navegador bloqueou o armazenamento. Libere os dados do site para salvar recados.');
    }
  }

  if (!firebaseConfig?.apiKey || !firebaseConfig?.projectId || !['rtdb', 'firestore'].includes(databaseType)) {
    throw new Error('O mural compartilhado ainda precisa ser configurado.');
  }
  if (/psicurando/i.test(`${firebaseConfig.projectId} ${firebaseConfig.databaseURL || ''}`)) {
    throw new Error('Este projeto está bloqueado para preservar o PsiCurando.');
  }
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(treeId)) throw new Error('Identificador da árvore inválido.');

  const cdn = 'https://www.gstatic.com/firebasejs/13.1.0';
  const [appSDK, authSDK] = await Promise.all([
    import(`${cdn}/firebase-app.js`), import(`${cdn}/firebase-auth.js`)
  ]);
  const app = appSDK.initializeApp(firebaseConfig, 'arvore-recados');
  const auth = authSDK.getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser) await authSDK.signInAnonymously(auth);
  uid = auth.currentUser.uid;
  window.addEventListener('offline', () => setStatus({ state: 'offline', message: 'Sem internet. Os novos recados precisam de conexão para ser publicados.' }));

  if (databaseType === 'rtdb') {
    if (!firebaseConfig.databaseURL) throw new Error('O endereço do mural ainda precisa ser configurado.');
    const sdk = await import(`${cdn}/firebase-database.js`);
    const db = sdk.getDatabase(app);
    const notesRef = sdk.ref(db, `christmasTrees/${treeId}/notes`);
    let connected = false;
    sdk.onValue(sdk.ref(db, '.info/connected'), snap => {
      connected = snap.val() === true;
      setStatus(connected
        ? { state: 'online', message: 'Mural compartilhado · atualizado em tempo real' }
        : { state: 'offline', message: 'Conectando ao mural. Aguarde a conexão para publicar.' });
    });
    sdk.onValue(sdk.query(notesRef, sdk.orderByChild('createdAt'), sdk.limitToLast(MAX_NOTES)), snap => {
      emitNotes(Object.entries(snap.val() || {}).map(([id, data]) => ({ ...data, id })));
    }, error => setStatus({ state: 'error', message: friendlyError(error).message }));
    return {
      async create(note) {
        if (!connected) throw new Error('Aguarde a conexão com o mural para publicar.');
        const record = sdk.push(notesRef);
        pendingIds.add(record.key);
        try {
          await sdk.set(record, { ...note, uid, createdAt: sdk.serverTimestamp() });
          return record.key;
        } finally {
          pendingIds.delete(record.key);
          emitNotes();
        }
      },
      async remove(id) {
        if (!connected) throw new Error('Aguarde a conexão com o mural para excluir.');
        await sdk.remove(sdk.child(notesRef, id));
      }
    };
  }

  const sdk = await import(`${cdn}/firebase-firestore.js`);
  const db = sdk.getFirestore(app);
  const notesRef = sdk.collection(db, 'christmas_trees', treeId, 'notes');
  sdk.onSnapshot(sdk.query(notesRef, sdk.orderBy('createdAt', 'desc'), sdk.limit(MAX_NOTES)), { includeMetadataChanges: true }, snapshot => {
    emitNotes(snapshot.docs.filter(doc => !doc.metadata.hasPendingWrites).map(doc => ({ ...doc.data(), id: doc.id })));
    setStatus(snapshot.metadata.fromCache
      ? { state: 'offline', message: 'Conectando ao mural. Aguardando confirmação do servidor.' }
      : { state: 'online', message: 'Mural compartilhado · atualizado em tempo real' });
  }, error => setStatus({ state: 'error', message: friendlyError(error).message }));
  return {
    async create(note) {
      if (status.state !== 'online' || !navigator.onLine) throw new Error('Aguarde a conexão com o mural para publicar.');
      const record = sdk.doc(notesRef);
      await sdk.setDoc(record, { ...note, uid, createdAt: sdk.serverTimestamp() });
      return record.id;
    },
    async remove(id) {
      if (status.state !== 'online' || !navigator.onLine) throw new Error('Aguarde a conexão com o mural para excluir.');
      await sdk.deleteDoc(sdk.doc(notesRef, id));
    }
  };
}

function ensureDriver() {
  if (!driverPromise) {
    driverPromise = start().catch(error => {
      const clean = friendlyError(error);
      setStatus({ state: 'error', message: clean.message });
      throw clean;
    });
  }
  return driverPromise;
}

export function subscribeNotes(onData, onStatus = () => {}) {
  const subscriber = { onData, onStatus };
  subscribers.add(subscriber);
  onStatus({ ...status });
  onData(latest.filter(note => !pendingIds.has(note.id)).map(note => ({ ...note })));
  ensureDriver().catch(() => {});
  return () => subscribers.delete(subscriber);
}

export function getCurrentUid() { return uid; }
export async function addNote(input) {
  const note = validateNote(input);
  try { return await (await ensureDriver()).create(note); }
  catch (error) { throw friendlyError(error); }
}
export async function deleteNote(id) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Recado inválido.');
  const note = latest.find(note => note.id === id);
  if (!note || note.uid !== uid) throw new Error('Você pode excluir apenas seus próprios recados.');
  try { await (await ensureDriver()).remove(id); }
  catch (error) { throw friendlyError(error); }
}
