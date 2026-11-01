import { subscribeNotes, addNote, deleteNote, getCurrentUid } from './firebase-service.js';

const $ = (id) => document.getElementById(id);
const palette = { gold: '#bd9555', red: '#ae6658', green: '#7f9b79', cream: '#d8c79e' };
let notes = [];
let selectedId = null;
let connectionState = 'connecting';
let localMode = false;
let submitting = false;
let toastTimer;
let newestId = null;
let lastFocus;

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4500);
}

function openDialog(dialog) {
  lastFocus = document.activeElement;
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  dialog.close();
  if (lastFocus?.isConnected) lastFocus.focus();
}

document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => closeDialog($(button.dataset.close)));
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeDialog(dialog);
  });
});

function formatDate(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(timestamp));
}

function showNote(id) {
  const note = notes.find((item) => item.id === id);
  if (!note) return;
  selectedId = id;
  $('dialogName').textContent = note.name;
  $('dialogRecipient').textContent = note.recipient ? `Para ${note.recipient}` : 'Para quem precisar de um carinho hoje';
  $('dialogMessage').textContent = note.message;
  $('dialogDate').textContent = formatDate(note.createdAt);
  if (Number.isFinite(note.createdAt) && note.createdAt > 0) $('dialogDate').dateTime = new Date(note.createdAt).toISOString();
  else $('dialogDate').removeAttribute('datetime');
  $('deleteButton').hidden = !note.uid || note.uid !== getCurrentUid();
  $('deleteFeedback').textContent = '';
  $('noteDialog').style.setProperty('--gold', palette[note.color] || palette.gold);
  if ($('allNotesDialog').open) $('allNotesDialog').close();
  openDialog($('noteDialog'));
}

// Positions stay within the actual pine silhouette. A tree can show 54 baubles;
// every stored message remains accessible in the full message list.
function ornamentPositions() {
  const rows = [
    { y: 164, width: 36, count: 2 },
    { y: 196, width: 53, count: 3 },
    { y: 238, width: 65, count: 4 },
    { y: 270, width: 87, count: 5 },
    { y: 304, width: 111, count: 6 },
    { y: 347, width: 111, count: 7 },
    { y: 379, width: 137, count: 8 },
    { y: 412, width: 163, count: 9 },
    { y: 445, width: 178, count: 10 }
  ];
  const slots = [];
  rows.forEach((row, rowIndex) => {
    for (let i = 0; i < row.count; i++) {
      slots.push({ x: 250 - row.width + (2 * row.width * (i + 0.5)) / row.count, y: row.y + ((i + rowIndex) % 2 ? 4 : -3) });
    }
  });
  // Distribute the first few messages across the whole tree, rather than filling
  // a single row. Coprime stepping gives every position exactly once.
  return slots.map((_, index) => slots[(index * 17) % slots.length]);
}
const positions = ornamentPositions();

function renderTree() {
  const holder = $('ornaments');
  holder.replaceChildren();
  const visible = [...notes].sort((a, b) => b.createdAt - a.createdAt).slice(0, positions.length);
  visible.forEach((note, index) => {
    const position = positions[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ornament' + (note.id === newestId ? ' new' : '');
    button.style.left = `${(position.x / 500) * 100}%`;
    button.style.top = `${(position.y / 580) * 100}%`;
    button.style.setProperty('--bauble', palette[note.color] || palette.gold);
    button.setAttribute('aria-label', `Ler recado de ${note.name}${note.recipient ? ` para ${note.recipient}` : ''}`);
    const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    star.setAttribute('viewBox', '0 0 20 20');
    star.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm10 1 2.5 6 6.5.5-5 4.3 1.5 6.2L10 14.5 4.5 18 6 11.8 1 7.5 7.5 7Z');
    path.setAttribute('fill', 'currentColor');
    star.append(path);
    const label = document.createElement('span');
    label.className = 'ornament-label';
    label.textContent = `De ${note.name}`;
    button.append(star, label);
    button.addEventListener('click', () => showNote(note.id));
    holder.append(button);
  });
  $('noteCount').textContent = String(notes.length);
  $('countLabel').textContent = notes.length === 1 ? 'recado pendurado' : 'recados pendurados';
  $('emptyHint').hidden = notes.length > 0;
  // Decorative baubles are artwork, while clickable ornaments are real notes.
  document.querySelector('.decorative-baubles').style.opacity = notes.length > 8 ? '.25' : '.85';
  renderList();
}

function renderList() {
  const query = $('searchNotes').value.trim().toLocaleLowerCase('pt-BR');
  const list = $('allNotesList');
  list.replaceChildren();
  const filtered = [...notes].sort((a, b) => b.createdAt - a.createdAt).filter((note) => `${note.name} ${note.recipient || ''} ${note.message}`.toLocaleLowerCase('pt-BR').includes(query));
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = query ? 'Nenhum recado encontrado. Tente outro nome ou outra palavra.' : connectionState === 'connecting' ? 'Buscando os recados da árvore…' : 'Nossa árvore está esperando o primeiro carinho. Que tal deixar o seu?';
    list.append(empty);
    return;
  }
  filtered.forEach((note) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-list-item';
    button.style.setProperty('--bauble', palette[note.color] || palette.gold);
    const message = document.createElement('p');
    message.textContent = note.message;
    const author = document.createElement('span');
    author.textContent = `De ${note.name}${note.recipient ? ` · Para ${note.recipient}` : ''}`;
    button.append(message, author);
    button.addEventListener('click', () => showNote(note.id));
    list.append(button);
  });
}

function onStatus(status) {
  connectionState = status.state;
  localMode = status.mode === 'local';
  $('connectionStatus').className = `connection-status ${status.state}${localMode ? ' local-mode' : ''}`;
  const messages = {
    connecting: 'Conectando à nossa árvore…',
    online: 'Recados conectados em tempo real',
    offline: 'Sem conexão. Reconecte para enviar seu recado.',
    error: 'Não foi possível conectar. Tente novamente em instantes.'
  };
  $('statusText').textContent = status.message || messages[status.state] || messages.error;
  $('privacyNote').textContent = localMode ? 'Neste modo, seu recado fica somente neste navegador. Ele ainda não aparece para outras pessoas.' : 'Seu recado ficará visível para todos. Compartilhe carinho e evite informações pessoais.';
  $('submitButton').disabled = submitting || (status.state !== 'online' && !localMode);
  renderList();
}

$('writeButton').addEventListener('click', () => {
  $('recado').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  setTimeout(() => $('name').focus({ preventScroll: true }), 250);
});
$('browseButton').addEventListener('click', () => {
  renderList();
  openDialog($('allNotesDialog'));
});
$('searchNotes').addEventListener('input', renderList);
$('message').addEventListener('input', () => { $('characterCount').textContent = `${$('message').value.length} / 300`; });

$('noteForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting) return;
  const data = new FormData(event.currentTarget);
  const note = {
    name: String(data.get('name') || '').trim(),
    recipient: String(data.get('recipient') || '').trim(),
    message: String(data.get('message') || '').trim(),
    color: String(data.get('color') || 'gold')
  };
  $('formFeedback').className = 'form-feedback';
  if (!note.name || !note.message) {
    $('formFeedback').textContent = 'Preencha seu nome e escreva uma mensagem para pendurar.';
    (!note.name ? $('name') : $('message')).focus();
    return;
  }
  if (note.name.length > 50 || note.recipient.length > 50 || note.message.length > 300) {
    $('formFeedback').textContent = 'Use até 50 caracteres nos nomes e 300 no recado.';
    return;
  }
  if (connectionState !== 'online' && !localMode) {
    $('formFeedback').textContent = 'Espere a conexão voltar para enviar seu recado.';
    return;
  }
  submitting = true;
  $('submitButton').disabled = true;
  $('submitLabel').textContent = 'Pendurando seu carinho…';
  $('formFeedback').textContent = '';
  try {
    newestId = await addNote(note);
    event.target.reset();
    $('characterCount').textContent = '0 / 300';
    $('formFeedback').className = 'form-feedback success';
    $('formFeedback').textContent = localMode ? 'Recado salvo neste navegador. O compartilhamento entre pessoas ainda não está conectado.' : 'Seu carinho já está na árvore. Obrigado por fazer parte!';
    toast(localMode ? 'Recado salvo somente neste navegador. ✦' : 'Seu recado foi pendurado com carinho. ✦');
    renderTree();
    setTimeout(() => { newestId = null; }, 1500);
  } catch (error) {
    $('formFeedback').textContent = error?.message || 'Seu recado não foi enviado. Tente novamente.';
  } finally {
    submitting = false;
    $('submitLabel').textContent = 'Pendurar na árvore';
    $('submitButton').disabled = connectionState !== 'online' && !localMode;
  }
});

$('deleteButton').addEventListener('click', async () => {
  const note = notes.find((item) => item.id === selectedId);
  if (!note || note.uid !== getCurrentUid()) return;
  $('deleteButton').disabled = true;
  $('deleteButton').textContent = 'Excluindo…';
  try {
    await deleteNote(note.id);
    closeDialog($('noteDialog'));
    toast('Seu recado foi retirado da árvore.');
  } catch (error) {
    $('deleteFeedback').textContent = error?.message || 'Não foi possível excluir. Tente novamente.';
  } finally {
    $('deleteButton').disabled = false;
    $('deleteButton').textContent = 'Excluir meu recado';
  }
});

$('shareButton').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.hash = '';
  url.search = '';
  const share = { title: 'Árvore de Recados', text: localMode ? 'Conheça esta árvore de recados de Natal!' : 'Tem palavras que são um presente. Deixe seu recado na nossa árvore de Natal!', url: url.href };
  try {
    if (navigator.share) await navigator.share(share);
    else {
      await navigator.clipboard.writeText(url.href);
      toast(localMode ? 'Link copiado. Os recados locais não são enviados junto.' : 'Link da árvore copiado. Espalhe esse carinho!');
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    // A selectable link remains usable when clipboard permissions are denied.
    toast(`Compartilhe este link: ${url.href}`);
  }
});

renderTree();
onStatus({ state: 'connecting' });
try {
  subscribeNotes((data) => {
    notes = Array.isArray(data) ? data.filter((note) => note && typeof note.id === 'string' && typeof note.name === 'string' && typeof note.message === 'string') : [];
    renderTree();
    if ($('noteDialog').open && selectedId && !notes.some((note) => note.id === selectedId)) closeDialog($('noteDialog'));
  }, onStatus);
} catch (error) {
  onStatus({ state: 'error', message: error?.message });
}
