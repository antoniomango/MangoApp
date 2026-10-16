// js/comune.js — funzioni di utilità condivise da responsabile.html, operatore.html, ufficio.html e schermo.html.
//
// Script classico, nessuna libreria: le funzioni sono globali (usate anche dagli attributi onclick).
// Caricamento: dopo js/config.js e prima di js/accesso.js e dello script della pagina.
// Nessuna dipendenza dalle variabili della pagina: ciò che serve arriva come parametro.

// Testo → HTML: null e undefined diventano stringa vuota, ogni altro valore viene convertito (0 compreso).
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Testo libero usato come argomento dentro onclick="fn('...')": oltre all'escape HTML,
// barra rovesciata e apice singolo vengono preceduti da una barra rovesciata (livello stringa JS).
function escapeJsAttr(str) {
  return escapeHtml(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// conAnno=false: forma breve senza anno (elenchi dell'operatore).
function formatDateTime(d, conAnno = true) {
  if (!d) return '—';
  const opzioni = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };
  if (conAnno) opzioni.year = 'numeric';
  return new Date(d).toLocaleString('it-IT', opzioni);
}

function scadenzaClass(scadenza) {
  if (!scadenza) return '';
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const diff = Math.floor((new Date(scadenza) - oggi) / 86400000);
  if (diff < 0) return 'scad-danger';
  if (diff <= 3) return 'scad-warning';
  if (diff <= 7) return 'scad-ok';
  return '';
}

// Codici degli altri ordini dello stesso gruppo di spedizione unica. `ordini`: elenco degli ordini in cache della pagina.
function codiciFratelliGruppo(o, ordini) {
  if (!o.gruppo_spedizione_id) return [];
  return (ordini || [])
    .filter(x => x.gruppo_spedizione_id === o.gruppo_spedizione_id && x.id !== o.id)
    .map(x => x.codice || '—');
}

// Nome di una fase dal suo id. `elencoFasi`: elenco delle fasi in cache della pagina.
function getFaseNome(faseId, elencoFasi) {
  const f = (elencoFasi || []).find(x => x.id === faseId);
  return f ? f.nome : `Fase ${faseId}`;
}

// Messaggio breve in basso (elemento #toast). type: 'ok' | 'err' | altro/vuoto = neutro; durataMs: tempo di permanenza.
function toast(msg, type = '', durataMs = 3500) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (type === 'ok' ? ' ok' : type === 'err' ? ' err' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), durataMs);
}

// Schermata di accesso (operatore, ufficio, schermo di reparto)
function showErr(msg) {
  const e = document.getElementById('login-err');
  if (e) e.textContent = msg;
}

// Messaggio d'errore di verifica_pin in forma leggibile (richiede js/accesso.js).
function messaggioErrorePin(data) { return MangoAccesso.messaggio(data); }

// Cambio del nome nell'elenco di accesso: PIN azzerato e messaggio pulito.
function suCambioNomeLogin() {
  showErr('');
  if (window.pinPad) pinPad.azzera();
}
