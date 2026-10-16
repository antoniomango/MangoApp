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

// Spedizione unica: finestra mostrata prima di segnare «Spedito» / «Ritirato» su un ordine che ha altri membri spedibili.
// membri = [{ ordine_id, codice, pronto, fasi }] come restituito dal server; risolve 'tutti', 'solo' oppure null (annulla).
function sceltaSpedizioneGruppo(membri, ritira, ordineId) {
  return new Promise(resolve => {
    const E = Etichette.spedizioneUnica;
    const box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.style.cssText = 'position:fixed;inset:0;z-index:320;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:16px';
    const righe = (membri || []).map(m => {
      const testo = m.pronto ? E.membroPronto(m.codice) : E.membroNonPronto(m.codice, m.fasi);
      return `<li style="margin:4px 0;${m.pronto ? '' : 'color:var(--warn);font-weight:600'}">${escapeHtml(testo)}${m.ordine_id === ordineId ? ' ←' : ''}</li>`;
    }).join('');
    box.innerHTML = `<div style="background:var(--surface);color:inherit;border:1px solid var(--border);border-radius:14px;padding:18px;max-width:440px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,0.3)">`
      + `<h3 style="margin:0 0 8px;font-size:17px">${escapeHtml(E.spedisciTitolo)}</h3>`
      + `<p style="margin:0 0 8px;font-size:14px">${escapeHtml(E.spedisciIntro(ritira))}</p>`
      + `<ul style="margin:0 0 12px;padding-left:20px;font-size:14px">${righe}</ul>`
      + `<div style="display:flex;flex-direction:column;gap:8px">`
      + `<button type="button" class="btn btn-ok" data-sc="tutti" style="padding:12px;font-size:15px">${escapeHtml(E.spedisciTutti(ritira))}</button>`
      + `<button type="button" class="btn btn-secondary" data-sc="solo" style="padding:12px;font-size:15px">${escapeHtml(E.spedisciSoloQuesto)}</button>`
      + `<button type="button" class="btn btn-secondary" data-sc="annulla" style="padding:10px;font-size:14px">${escapeHtml(E.spedisciAnnulla)}</button>`
      + `</div></div>`;
    box.addEventListener('click', ev => {
      const sc = ev.target.closest && ev.target.closest('[data-sc]')?.dataset.sc;
      if (!sc) return;
      box.remove();
      resolve(sc === 'tutti' ? 'tutti' : sc === 'solo' ? 'solo' : null);
    });
    document.body.appendChild(box);
  });
}

// Riepilogo dopo «Spedisci tutti»: se qualche ordine non è partito resta a schermo finché lo si chiude, altrimenti un messaggio breve.
function riepilogoSpedizioneGruppo(data, ritira) {
  const E = Etichette.spedizioneUnica;
  const spediti = data?.spediti || [], non = data?.non_spediti || [];
  if (!non.length) { toast(E.riepilogoTutti(spediti, ritira), 'ok'); return; }
  const box = document.createElement('div');
  box.setAttribute('role', 'alertdialog');
  box.style.cssText = 'position:fixed;inset:0;z-index:320;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:16px';
  box.innerHTML = `<div style="background:var(--surface);color:inherit;border:2px solid var(--warn);border-radius:14px;padding:18px;max-width:440px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,0.3)">`
    + `<h3 style="margin:0 0 8px;font-size:17px;color:var(--warn)">${escapeHtml(E.spedisciTitolo)}</h3>`
    + (spediti.length ? `<p style="margin:6px 0;font-size:14px">${escapeHtml(E.riepilogoSpediti(spediti, ritira))}</p>` : '')
    + non.map(x => `<p style="margin:6px 0;font-size:14px;font-weight:600">${escapeHtml(E.riepilogoNonSpedito(x.codice, x.fasi, ritira))}</p>`).join('')
    + `<button type="button" class="btn btn-ok" style="margin-top:10px;width:100%;padding:12px;font-size:15px">${escapeHtml(E.nonProntiChiudi)}</button></div>`;
  box.querySelector('button').onclick = () => box.remove();
  document.body.appendChild(box);
}

// Flusso comune del pulsante «Spedito»: anteprima dal server, scelta tutti/solo questo, chiamata. `chiama(tuttoGruppo)` esegue segna_spedito e restituisce { data }.
// Restituisce { ok, eseguito, data } oppure null se annullato. Se non c'è un gruppo con altri membri spedibili usa `confermaSingolo()` (conferma classica).
async function segnaSpeditoConGruppo({ ordineId, ritira, anteprima, chiama, confermaSingolo }) {
  let membri = [];
  try { const r = await anteprima(); if (r?.ok && Array.isArray(r.membri)) membri = r.membri; } catch (e) { console.warn('anteprima spedizione', e); }
  if (membri.length > 1) {
    const scelta = await sceltaSpedizioneGruppo(membri, ritira, ordineId);
    if (!scelta) return null;
    const data = await chiama(scelta === 'tutti');
    return { tutti: scelta === 'tutti', data };
  }
  if (!confermaSingolo()) return null;
  return { tutti: false, data: await chiama(false) };
}
