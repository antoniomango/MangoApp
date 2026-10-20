// responsabile.html — Operatori, schede della sezione, dispositivi, profili e taglie.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// ═══════════════════════════════════════════════
// OPERATORI
// ═══════════════════════════════════════════════
function _etichettaPin(op) {
  if (op.pin_da_reimpostare && op.pin_scelta_scadenza && new Date(op.pin_scelta_scadenza) > new Date()) return `<div class="op-etichette"><span class="op-etichetta attesa" title="Può scegliere il PIN dal suo telefono approvato">Sta per scegliere il PIN (fino a ${escapeHtml(formatDateTime(op.pin_scelta_scadenza))})</span></div>`;
  if (op.pin_da_reimpostare) return `<div class="op-etichette"><button type="button" class="op-etichetta assenza" title="Il PIN era troppo facile: l'accesso è bloccato finché non imposti un nuovo PIN" onclick="openModalModificaOperatore('${escapeJsAttr(op.id)}')">PIN da reimpostare: accesso bloccato</button></div>`;
  if (op.pin_da_cambiare) return `<div class="op-etichette"><span class="op-etichetta attesa" title="Al prossimo accesso sceglierà un PIN a 6 cifre">PIN da cambiare al prossimo accesso</span></div>`;
  return '';
}

function _cardOperatore(op, conDati, etichette) {
  etichette = (etichette || '') + _etichettaPin(op);
  return `
    <div class="op-card ${op.attivo ? '' : 'inactive'}">
      <div class="op-name">${escapeHtml(op.nome)} ${escapeHtml(op.cognome)}</div>
      <div class="op-role">${op.ruolo === 'operatore' ? 'Operatore' : 'Vista ufficio'} ${op.attivo ? '' : '· <span style="color:var(--alert)">Disattivo</span>'}</div>
      ${etichette || ''}
      <div class="op-actions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        <button class="btn btn-secondary" style="padding:5px 10px;font-size:12px" onclick="openModalModificaOperatore('${escapeJsAttr(op.id)}')"><i data-ic="matita"></i> Modifica</button>
        ${conDati ? `<button class="btn btn-secondary" style="padding:5px 10px;font-size:12px" onclick="apriDatiOperatore('${escapeJsAttr(op.id)}')"><i data-ic="persona"></i> Dati</button>` : ''}
        ${op.attivo
          ? `<button class="btn btn-secondary" style="padding:5px 10px;font-size:12px" onclick="toggleOperatore('${escapeJsAttr(op.id)}', false)">Disattiva</button>`
          : `<button class="btn btn-ok" style="padding:5px 10px;font-size:12px" onclick="toggleOperatore('${escapeJsAttr(op.id)}', true)">Attiva</button>`
        }
        <button class="btn" style="padding:5px 10px;font-size:12px;background:var(--warn-strong);color:var(--on-warn)" onclick="forzaLogout('${escapeJsAttr(op.id)}', '${escapeJsAttr(op.nome)}')"><i data-ic="esci"></i> Esci</button>
        <button class="btn" style="padding:5px 10px;font-size:12px;background:var(--alert);color:var(--on-alert)" onclick="eliminaOperatore('${escapeJsAttr(op.id)}', '${escapeJsAttr(op.nome + ' ' + op.cognome)}')" aria-label="Elimina ${escapeHtml(op.nome)} ${escapeHtml(op.cognome)}"><i data-ic="cestino"></i></button>
      </div>
    </div>`;
}

// Etichette di stato sulla card (solo ruolo 'operatore'): assenza di oggi o prossima entro
// 14 giorni + richieste in attesa. Dati da _assDati (richieste_assenza via RLS + disponibilita_giornaliera).
function _etichetteOperatore(op) {
  const st = _assStatoOperatore(op.id);
  const out = [];
  if (st.assenza) out.push(`<button type="button" class="op-etichetta assenza" title="Vedi le assenze di ${escapeHtml(op.nome)}" onclick="apriAssenzeOperatore('${escapeJsAttr(op.id)}')">${escapeHtml(st.assenza)}</button>`);
  if (st.inAttesa) out.push(`<button type="button" class="op-etichetta attesa" title="Apri le richieste in attesa" onclick="operatoriScheda('richieste'); richiesteVista('attesa')">${st.inAttesa} ${st.inAttesa === 1 ? 'richiesta' : 'richieste'} in attesa</button>`);
  return out.length ? `<div class="op-etichette">${out.join('')}</div>` : '';
}

function renderOperatori() {
  const grid = document.getElementById('ops-grid');
  const gridUff = document.getElementById('ops-grid-ufficio');
  const produzione = operatoriCache.filter(o => o.ruolo === 'operatore');
  const ufficio = operatoriCache.filter(o => o.ruolo === 'sola_lettura');
  grid.innerHTML = produzione.length
    ? produzione.map(op => _cardOperatore(op, true, _etichetteOperatore(op))).join('')
    : '<div class="empty-state"><div class="icon"><i data-ic="persone"></i></div><p>Nessun operatore di produzione</p></div>';
  if (gridUff) gridUff.innerHTML = ufficio.length
    ? ufficio.map(op => _cardOperatore(op, false, op.puo_registrare_avvisi ? '<div class="op-etichette"><span class="op-etichetta">Registra gli avvisi ai clienti</span></div>' : '')).join('')
    : '<div class="empty-state"><div class="icon"><i data-ic="persone"></i></div><p>Nessun profilo ufficio</p></div>';
}

async function forzaLogout(id, nome) {
  if (!confirm(`Vuoi buttare fuori "${nome}" dall'app? Dovrà reinserire il PIN al prossimo accesso.`)) return;
  const { data, error } = await sb.rpc('forza_logout_operatore', {
    p_operatore_id: id,
    p_responsabile_id: currentUserRow.id,
    p_session_token: null,
  });
  if (error || !data?.ok) { toast(messaggioErroreOperatore(data?.errore || error?.message), 'err'); return; }
  toast(`${nome} verrà disconnesso alla prossima apertura dell'app`, 'ok');
}

let _opAvvisi = false;
function opAvvisiRiga(visibile, valore, modifica) {
  _opAvvisi = !!valore;
  const riga = document.getElementById('op-avvisi-row'), c = document.getElementById('op-avvisi');
  if (!riga || !c) return;
  riga.style.display = visibile ? '' : 'none';
  c.checked = _opAvvisi; c.disabled = !modifica;
}
function openModalNuovoOperatore(ruolo) {
  document.getElementById('op-edit-id').value = '';
  document.getElementById('op-nome').value = '';
  document.getElementById('op-cognome').value = '';
  document.getElementById('op-pin').value = '';
  document.getElementById('op-ruolo').value = ruolo === 'sola_lettura' ? 'sola_lettura' : 'operatore';
  document.getElementById('op-modal-title').textContent = ruolo === 'sola_lettura' ? 'Nuovo profilo ufficio' : 'Nuovo Operatore';
  document.getElementById('op-modal-btn').textContent = 'Crea';
  document.getElementById('op-pin-label').textContent = 'PIN (6 cifre) *';
  document.getElementById('op-pin-hint').style.display = 'none';
  MangoRegolePin.rendi(document.getElementById('op-pin-regole'));
  document.getElementById('op-scelta-pin-btn').style.display = 'none';
  document.getElementById('op-scelta-pin-nota').style.display = 'none';
  document.getElementById('op-escluso-pianificazione').checked = false;
  document.getElementById('op-ore-default').value = '';
  opAvvisiRiga(false, false, false);   // il permesso si dà dopo la creazione, dalla scheda del profilo
  const existingComp2 = document.getElementById('op-competenze-section');
  if (existingComp2) existingComp2.remove();
  const existingFerie2 = document.getElementById('op-ferie-section');
  if (existingFerie2) existingFerie2.remove();
  document.getElementById('modal-operatore').classList.add('open');
}

function openModalModificaOperatore(id) {
  const op = operatoriCache.find(o => o.id === id);
  if (!op) return;
  document.getElementById('op-edit-id').value = op.id;
  document.getElementById('op-nome').value = op.nome;
  document.getElementById('op-cognome').value = op.cognome;
  document.getElementById('op-pin').value = '';
  document.getElementById('op-ruolo').value = op.ruolo;
  document.getElementById('op-modal-title').textContent = `Modifica — ${op.nome} ${op.cognome}`;
  document.getElementById('op-modal-btn').textContent = 'Salva';
  document.getElementById('op-pin-label').textContent = 'Nuovo PIN (6 cifre)';
  document.getElementById('op-pin-hint').style.display = '';
  MangoRegolePin.rendi(document.getElementById('op-pin-regole'));
  document.getElementById('op-scelta-pin-btn').style.display = '';
  const _nota = document.getElementById('op-scelta-pin-nota');
  const _aperta = op.pin_scelta_scadenza && new Date(op.pin_scelta_scadenza) > new Date();
  _nota.textContent = _aperta ? 'Scelta del PIN aperta fino a ' + formatDateTime(op.pin_scelta_scadenza) + ' (dal telefono approvato)' : 'Serve un telefono già approvato e assegnato a questa persona; la scelta resta aperta 24 ore.';
  _nota.style.display = '';
  document.getElementById('op-escluso-pianificazione').checked = !!op.escluso_pianificazione;
  document.getElementById('op-ore-default').value = op.ore_default ?? '';
  opAvvisiRiga(op.ruolo === 'sola_lettura', op.puo_registrare_avvisi, true);

  // Sezione competenze in sola lettura
  const fasiConOp = fasi.filter(f => (f.competenze || []).includes(id)).map(f => {
    const priorita = (f.competenze || []).indexOf(id) + 1;
    const etichetta = priorita === 1 ? '1ª scelta' : priorita === 2 ? '2ª scelta' : priorita === 3 ? '3ª scelta' : `${priorita}ª scelta`;
    return { nome: f.nome, etichetta };
  });
  let compHtml = '';
  if (fasiConOp.length) {
    compHtml = `<div style="margin-top:12px;padding:8px 10px;background:var(--ext-bg);border:1px solid var(--ext-line);border-radius:6px">
      <div style="font-size:11px;font-weight:600;color:var(--ext);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em">Competenze assegnate</div>
      ${fasiConOp.map(c => `<div style="font-size:12px;display:flex;gap:8px;padding:2px 0">
        <span style="flex:1">${escapeHtml(c.nome)}</span>
        <span style="color:var(--muted);font-size:11px">${escapeHtml(c.etichetta)}</span>
      </div>`).join('')}
    </div>`;
  } else {
    compHtml = `<div style="margin-top:12px;padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--muted);font-style:italic">Nessuna competenza assegnata — verrà proposto per qualsiasi fase</div>`;
  }
  const existingComp = document.getElementById('op-competenze-section');
  if (existingComp) existingComp.remove();
  const compDiv = document.createElement('div');
  compDiv.id = 'op-competenze-section';
  compDiv.innerHTML = compHtml;
  document.querySelector('#modal-operatore .modal-body').appendChild(compDiv);

  // Assenze in programma dell'operatore: sola lettura (stessa fonte e stesse etichette della scheda Assenze).
  // Un solo modo per segnare un'assenza: "Segnala assenza".
  const existingFerie = document.getElementById('op-ferie-section');
  if (existingFerie) existingFerie.remove();
  const ferieDiv = document.createElement('div');
  ferieDiv.id = 'op-ferie-section';
  ferieDiv.innerHTML = `
    <div style="margin-top:16px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:8px">Assenze in programma</div>
      <div id="op-ferie-list" style="font-size:12px;color:var(--muted);font-style:italic">Caricamento...</div>
      <div style="margin-top:10px"><button type="button" class="btn btn-secondary" style="font-size:12px;padding:5px 12px" onclick="segnalaAssenzaDaOperatore('${id}')"><i data-ic="avviso"></i> Segnala assenza</button></div>
    </div>`;
  document.querySelector('#modal-operatore .modal-body').appendChild(ferieDiv);
  caricaAssenzeOperatore(id);

  document.getElementById('modal-operatore').classList.add('open');
}

// Messaggi utente per i codici di errore restituiti dalle RPC di gestione operatori
const MESSAGGI_ERRORE_OPERATORE = {
  sessione_non_valida: 'Sessione scaduta, effettua di nuovo il login',
  non_autorizzato: 'Non sei autorizzato a questa operazione',
  utente_non_trovato: 'Operatore non trovato',
  auto_cambio_ruolo_non_consentito: 'Non puoi cambiare il tuo stesso ruolo',
  ultimo_responsabile: 'Impossibile: resteresti senza nessun responsabile nel sistema',
  auto_operazione_non_consentita: 'Non puoi eseguire questa operazione su te stesso',
};
function messaggioErroreOperatore(codice) {
  return MESSAGGI_ERRORE_OPERATORE[codice] || codice || 'Errore sconosciuto';
}

async function salvaOperatore() {
  const editId = document.getElementById('op-edit-id').value;
  const nome = document.getElementById('op-nome').value.trim();
  const cognome = document.getElementById('op-cognome').value.trim();
  const pin = document.getElementById('op-pin').value.trim();
  const ruolo = document.getElementById('op-ruolo').value;

  if (!nome || !cognome) { toast('Nome e cognome obbligatori', 'err'); return; }

  if (editId) {
    // MODIFICA
    const esclusoPianificazione = document.getElementById('op-escluso-pianificazione').checked;
    const opAttuale = operatoriCache.find(o => o.id === editId);
    const oreInput = document.getElementById('op-ore-default').value.trim();
    const oreDefaultAttuale = oreInput === '' ? null : numeroOLiteral(oreInput);   // vuoto = come da orario; 0 resta 0
    if (oreInput !== '' && oreDefaultAttuale === null) { toast('Ore al giorno non valide', 'err'); return; }

    if (opAttuale && ruolo !== opAttuale.ruolo) {
      const conferma = confirm(`Stai cambiando il ruolo di ${nome} ${cognome} da ${opAttuale.ruolo} a ${ruolo}. Confermi?`);
      if (!conferma) return;
    }

    if (pin) {
      // Aggiorna PIN via RPC (il PIN è hashato nel DB)
      const { data: pinData } = await sb.rpc('aggiorna_pin_operatore', { p_operatore_id: editId, p_nuovo_pin: pin, p_responsabile_id: currentUserRow.id });
      if (!pinData?.ok) { toast(messaggioPin(pinData) || 'Errore aggiornamento PIN', 'err'); return; }
    }
    const { data, error } = await sb.rpc('aggiorna_operatore', {
      p_operatore_id: editId,
      p_nome: nome,
      p_cognome: cognome,
      p_ruolo: ruolo,
      p_ore_default: oreDefaultAttuale,
      p_escluso_pianificazione: esclusoPianificazione,
      p_responsabile_id: currentUserRow.id,
      p_session_token: null,
    });
    if (error || !data?.ok) { toast(messaggioErroreOperatore(data?.errore || error?.message), 'err'); return; }
    if (ruolo === 'sola_lettura' && opAttuale && opAttuale.ruolo === 'sola_lettura' && !!opAttuale.puo_registrare_avvisi !== _opAvvisi) {
      const { data: pa } = await sb.rpc('imposta_permesso_avvisi', { p_utente_id: editId, p_valore: _opAvvisi, p_responsabile_id: currentUserRow.id, p_session_token: null });
      if (!pa?.ok) { toast('Permesso non salvato: ' + messaggioErroreOperatore(pa?.errore), 'err'); }
    }
    closeModal('modal-operatore');
    toast('Operatore aggiornato', 'ok');
  } else {
    // CREAZIONE
    const { data, error } = await sb.rpc('crea_operatore', { p_nome: nome, p_cognome: cognome, p_pin: pin, p_ruolo: ruolo, p_responsabile_id: currentUserRow.id });
    if (error || !data?.ok) { toast(messaggioPin(data) || error?.message || data?.errore || 'Errore', 'err'); return; }
    closeModal('modal-operatore');
    toast('Operatore creato', 'ok');
  }

  await loadOperatori();
  renderOperatori();
}

// Le regole di formato del PIN vivono solo sul server (valida_formato_pin): qui si mostra solo l'esito
function messaggioPin(err) {
  const d = (err && typeof err === 'object') ? err : { errore: err };
  const m = MangoRegolePin.messaggio(d);
  if (m) return m;
  return null;
}

async function abilitaSceltaPin() {
  const id = document.getElementById('op-edit-id').value;
  const op = operatoriCache.find(o => o.id === id);
  if (!id || !op) return;
  if (!confirm(`${op.nome} ${op.cognome} verrà disconnesso/a e potrà scegliersi un nuovo PIN dal suo telefono approvato nelle prossime 24 ore. Il PIN attuale smette di funzionare. Confermi?`)) return;
  const { data, error } = await sb.rpc('abilita_scelta_pin', { p_operatore_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast(data?.errore === 'nessun_telefono_approvato' ? 'Prima approva un telefono assegnato a questa persona (scheda Telefoni)' : 'Operazione non riuscita', 'err'); return; }
  closeModal('modal-operatore');
  toast('Scelta del PIN aperta per 24 ore', 'ok');
  await loadOperatori();
  renderOperatori();
}

async function toggleOperatore(id, attivo) {
  const { data, error } = await sb.rpc('imposta_stato_operatore', {
    p_operatore_id: id,
    p_attivo: attivo,
    p_responsabile_id: currentUserRow.id,
    p_session_token: null,
  });
  if (error || !data?.ok) { toast(messaggioErroreOperatore(data?.errore || error?.message), 'err'); return; }
  toast(attivo ? 'Operatore attivato' : 'Operatore disattivato', 'ok');
  await loadOperatori();
  renderOperatori();
}

async function eliminaOperatore(id, nome) {
  if (!confirm(`Eliminare il profilo di "${nome}"?\n\nIl profilo verrà disattivato e non potrà più accedere all'app.`)) return;
  const { data, error } = await sb.rpc('elimina_operatore', {
    p_operatore_id: id,
    p_responsabile_id: currentUserRow.id,
    p_session_token: null,
  });
  if (error || !data?.ok) { toast(messaggioErroreOperatore(data?.errore || error?.message), 'err'); return; }
  toast('Profilo eliminato', 'ok');
  await loadOperatori();
  renderOperatori();
}

// ═══════════════════════════════════════════════
// SEZIONE OPERATORI — schede Produzione / Ufficio / Richieste / Assenze
// ═══════════════════════════════════════════════
const OPS_SCHEDE = ['produzione', 'ufficio', 'richieste', 'assenze', 'dispositivi'];
const OPS_SCHEDA_CHIAVE = 'mangoapp-operatori-scheda';
let _opsScheda = (() => {
  try { const v = localStorage.getItem(OPS_SCHEDA_CHIAVE); return OPS_SCHEDE.includes(v) ? v : 'produzione'; }
  catch (e) { return 'produzione'; }
})();
function _opsSalvaScheda(v) { try { localStorage.setItem(OPS_SCHEDA_CHIAVE, v); } catch (e) { /* storage non disponibile: resta in memoria */ } }

// Stato ARIA di un gruppo di schede: aria-selected, tabindex "roving", pannelli nascosti.
function _selezionaTab(valori, v, idTab, idPannello) {
  valori.forEach(x => {
    const tab = document.getElementById(idTab(x));
    if (tab) { tab.setAttribute('aria-selected', x === v ? 'true' : 'false'); tab.tabIndex = x === v ? 0 : -1; }
    if (idPannello) { const p = document.getElementById(idPannello(x)); if (p) p.hidden = x !== v; }
  });
}

// Frecce sinistra/destra, Home, Fine su un role="tablist" (pattern WAI-ARIA, attivazione automatica).
function tabsTastiera(e, apri) {
  const tabs = [...e.currentTarget.querySelectorAll(':scope > [role="tab"]')];
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length
    : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
    : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
  if (j === null) return;
  e.preventDefault();
  e.stopPropagation();
  apri(tabs[j].dataset.tab);
  tabs[j].focus();
}

function operatoriScheda(v) {
  if (!OPS_SCHEDE.includes(v)) v = 'produzione';
  _opsScheda = v;
  _opsSalvaScheda(v);
  _selezionaTab(OPS_SCHEDE, v, x => 'ops-tab-' + x, x => 'ops-pan-' + x);
  if (v === 'produzione') { renderOperatori(); aggiornaStatoAssenze(); }
  else if (v === 'ufficio') renderOperatori();
  else if (v === 'richieste') richiesteVista(_ricVista);
  else if (v === 'dispositivi') { caricaDispositivi(); avviaAggiornamentoDispositivi(); }
  else { renderAssenze(); aggiornaStatoAssenze(); }
  if (v !== 'dispositivi') fermaAggiornamentoDispositivi();
}

// ── Telefoni autorizzati ──
let _dispositivi = [];
let _dispTimer = null;
async function caricaDispositivi() {
  const { data, error } = await sb.rpc('dispositivi_elenco', { p_responsabile_id: currentUserRow.id, p_session_token: null });
  const el = document.getElementById('disp-elenco');
  if (error || !data?.ok) { if (el) el.innerHTML = '<div style="color:var(--alert)">Elenco non disponibile</div>'; return; }
  _dispositivi = data.dispositivi || [];
  aggiornaContaDispositivi();
  renderDispositivi();
}
function aggiornaContaDispositivi() {
  const n = _dispositivi.filter(d => d.stato === 'in_attesa').length;
  const b = document.getElementById('ops-tab-disp-conta');
  if (b) { b.textContent = String(n); b.hidden = !n; }
}
async function aggiornaBadgeDispositivi() {
  const { data } = await sb.rpc('dispositivi_elenco', { p_responsabile_id: currentUserRow?.id, p_session_token: null });
  if (data?.ok) { _dispositivi = data.dispositivi || []; aggiornaContaDispositivi(); }
}
function avviaAggiornamentoDispositivi() { fermaAggiornamentoDispositivi(); _dispTimer = setInterval(() => { if (!document.hidden) caricaDispositivi(); }, 10000); }
function fermaAggiornamentoDispositivi() { if (_dispTimer) { clearInterval(_dispTimer); _dispTimer = null; } }
function renderDispositivi() {
  const el = document.getElementById('disp-elenco');
  if (!el) return;
  if (!_dispositivi.length) { el.innerHTML = '<div class="empty-state"><p>Nessun telefono registrato</p></div>'; return; }
  const dt = v => v ? formatDateTime(v) : '—';
  const stato = { in_attesa: ['In attesa di approvazione', 'var(--warn-ink)'], approvato: ['Approvato', 'var(--ok-ink)'], revocato: ['Bloccato', 'var(--alert)'] };
  el.innerHTML = '<div class="ops-grid">' + _dispositivi.map(d => {
    const [t, c] = stato[d.stato] || [d.stato, 'var(--muted)'];
    const id = escapeJsAttr(d.id);
    return `<div class="op-card ${d.stato === 'revocato' ? 'inactive' : ''}">
      <div class="op-name">${escapeHtml(d.etichetta || 'Telefono nuovo')}</div>
      <div class="op-role" style="color:${c};font-weight:600">${escapeHtml(t)}</div>
      ${d.assegnato_a ? `<div style="font-size:13px;margin-top:4px">Assegnato a: <strong>${escapeHtml(d.assegnato_a)}</strong></div>` : (d.stato === 'approvato' ? '<div style="font-size:12px;color:var(--warn-ink);margin-top:4px">Non assegnato a nessuna persona</div>' : '')}
      ${d.stato === 'in_attesa' ? `<div style="margin:8px 0;font-size:12px;color:var(--muted)">Codice sul telefono: <strong style="font-family:var(--font-mono);font-size:20px;color:var(--ink);letter-spacing:.1em">${escapeHtml(d.codice || '')}</strong></div>` : ''}
      <div style="font-size:12px;color:var(--muted);margin-top:6px">Richiesto: ${escapeHtml(dt(d.creato_il))}${d.stato !== 'in_attesa' ? `<br>Ultimo uso: ${escapeHtml(dt(d.ultimo_uso))}${d.ultimo_utente ? ' · ' + escapeHtml(d.ultimo_utente) : ''}` : ''}</div>
      <div class="op-actions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
        ${d.stato !== 'approvato' ? `<button class="btn btn-ok" style="padding:5px 10px;font-size:12px" onclick="approvaDispositivo('${id}')">${d.stato === 'revocato' ? 'Riapprova' : 'Approva'}</button>` : `<button class="btn btn-secondary" style="padding:5px 10px;font-size:12px" onclick="approvaDispositivo('${id}')">Persona e nome</button><button class="btn" style="padding:5px 10px;font-size:12px;background:var(--warn-strong);color:var(--on-warn)" onclick="revocaDispositivo('${id}')">Blocca</button>`}
        <button class="btn" style="padding:5px 10px;font-size:12px;background:var(--alert);color:var(--on-alert)" onclick="eliminaDispositivo('${id}')" aria-label="Rimuovi"><i data-ic="cestino"></i></button>
      </div>
    </div>`;
  }).join('') + '</div>';
}
function approvaDispositivo(id) {
  const d = _dispositivi.find(x => x.id === id);
  document.getElementById('disp-modal-id').value = id;
  document.getElementById('disp-modal-titolo').textContent = d?.stato === 'approvato' ? 'Telefono: persona e nome' : 'Approva telefono';
  const sel = document.getElementById('disp-modal-persona');
  const persone = operatoriCache.filter(o => o.attivo && ['operatore', 'sola_lettura'].includes(o.ruolo));
  sel.innerHTML = '<option value="">— Scegli la persona —</option>' + persone.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.cognome)} ${escapeHtml(o.nome)}${o.ruolo === 'sola_lettura' ? ' (ufficio)' : ''}</option>`).join('');
  sel.value = d?.utente_assegnato || '';
  document.getElementById('disp-modal-etichetta').value = d?.stato === 'approvato' ? (d.etichetta || '') : '';
  document.getElementById('modal-approva-disp').classList.add('open');
}
async function confermaApprovaDispositivo() {
  const id = document.getElementById('disp-modal-id').value;
  const utente = document.getElementById('disp-modal-persona').value;
  if (!utente) { toast('Scegli di chi è il telefono', 'err'); return; }
  const { data, error } = await sb.rpc('dispositivo_approva', { p_dispositivo_id: id, p_utente_id: utente, p_etichetta: document.getElementById('disp-modal-etichetta').value.trim() || null, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast(data?.errore === 'etichetta_non_valida' ? 'Il nome del telefono è troppo lungo (massimo 60 caratteri)' : data?.errore === 'utente_non_valido' ? 'La persona scelta non è valida' : 'Operazione non riuscita', 'err'); return; }
  closeModal('modal-approva-disp');
  toast(data.finestra_pin ? 'Telefono approvato: la persona può scegliere il suo PIN (24 ore)' : 'Telefono approvato', 'ok');
  caricaDispositivi();
  loadOperatori().then(renderOperatori);
}
async function revocaDispositivo(id) {
  if (!confirm('Bloccare questo telefono? Chi lo sta usando viene disconnesso subito e non potrà più entrare finché non lo riapprovi.')) return;
  const { data, error } = await sb.rpc('dispositivo_revoca', { p_dispositivo_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Operazione non riuscita', 'err'); return; }
  toast('Telefono bloccato', 'ok');
  caricaDispositivi();
}
async function eliminaDispositivo(id) {
  if (!confirm('Rimuovere questo telefono dall\'elenco? Se è in uso viene disconnesso; per rientrare dovrà essere approvato di nuovo.')) return;
  const { data, error } = await sb.rpc('dispositivo_elimina', { p_dispositivo_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Operazione non riuscita', 'err'); return; }
  toast('Telefono rimosso', 'ok');
  caricaDispositivi();
}

// ── Dati di un operatore (profilo) ──
let _doOperatore = null, _doCampi = [], _doValori = {};
async function apriDatiOperatore(id) {
  const op = operatoriCache.find(o => o.id === id);
  _doOperatore = id; _doCampi = []; _doValori = {};
  document.getElementById('do-titolo').textContent = `Dati — ${op ? op.nome + ' ' + op.cognome : ''}`;
  document.getElementById('do-err').textContent = '';
  const corpo = document.getElementById('do-corpo');
  corpo.innerHTML = 'Caricamento…';
  document.getElementById('modal-dati-operatore').classList.add('open');
  const { data, error } = await sb.rpc('profilo_operatore_leggi_resp', { p_operatore_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { corpo.innerHTML = `<div class="ric-err">${escapeHtml(ricErrore(data?.errore || error?.message))}</div>`; return; }
  _doCampi = data.campi || [];
  _doValori = Object.fromEntries(_doCampi.map(c => [c.id, c.valore ?? '']));
  if (!_doCampi.length) { corpo.innerHTML = '<p style="color:var(--muted)">Nessun campo del profilo attivo.</p>'; return; }
  let html = '', gruppo = null;
  _doCampi.forEach(c => {
    if (c.gruppo !== gruppo) { gruppo = c.gruppo; html += `<div class="do-gruppo">${escapeHtml(gruppo)}</div>`; }
    const idc = 'do-' + escapeHtml(c.id);
    const on = `oninput="_doValori['${escapeJsAttr(c.id)}'] = this.value" onchange="_doValori['${escapeJsAttr(c.id)}'] = this.value"`;
    const v = _doValori[c.id];
    const ctl = c.tipo === 'scelta'
      ? `<select id="${idc}" ${on}><option value="">—</option>${(c.opzioni || []).map(o => `<option value="${escapeHtml(o)}"${String(o) === String(v) ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`
      : `<input id="${idc}" type="${c.tipo === 'telefono' ? 'tel' : 'text'}" maxlength="${c.tipo === 'telefono' ? 20 : c.tipo === 'numero' ? 10 : 100}" value="${escapeHtml(v)}" ${on}>`;
    html += `<div class="form-group" style="margin-bottom:12px"><label for="${idc}">${escapeHtml(c.etichetta)}</label>${ctl}</div>`;
  });
  corpo.innerHTML = html;
}
async function salvaDatiOperatore() {
  const err = document.getElementById('do-err');
  err.textContent = '';
  const modificati = {};
  _doCampi.forEach(c => { if ((_doValori[c.id] ?? '') !== (c.valore ?? '')) modificati[c.id] = _doValori[c.id] ?? ''; });
  if (!Object.keys(modificati).length) { closeModal('modal-dati-operatore'); return; }
  const { data, error } = await sb.rpc('profilo_operatore_salva_resp', { p_operatore_id: _doOperatore, p_valori: modificati, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) {
    const campo = _doCampi.find(c => c.id === data?.campo_id);
    err.textContent = (campo ? campo.etichetta + ': ' : '') + ricErrore(data?.errore || error?.message);
    return;
  }
  toast('Dati operatore salvati', 'ok');
  closeModal('modal-dati-operatore');
}

// ── Taglie della squadra + CSV per ordini di abbigliamento e DPI ──
let _taglie = null;
async function apriTaglieSquadra() {
  const corpo = document.getElementById('taglie-corpo');
  corpo.innerHTML = '<div style="padding:20px;color:var(--muted)">Caricamento…</div>';
  document.getElementById('modal-taglie').classList.add('open');
  const { data, error } = await sb.rpc('taglie_squadra', { p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { corpo.innerHTML = `<div class="ric-err" style="padding:20px">${escapeHtml(ricErrore(data?.errore || error?.message))}</div>`; return; }
  // taglie_squadra restituisce anche i profili vista ufficio (sola_lettura): qui solo la produzione
  const idProduzione = new Set(operatoriCache.filter(o => o.ruolo === 'operatore').map(o => o.id));
  _taglie = { ...data, operatori: (data.operatori || []).filter(o => idProduzione.has(o.id)) };
  if (!data.campi.length) { corpo.innerHTML = '<div style="padding:20px;color:var(--muted)">Nessun campo attivo nel gruppo "Taglie" (Impostazioni → Campi del profilo).</div>'; return; }
  corpo.innerHTML = `<table class="tabella-taglie"><thead><tr><th>Operatore</th>${data.campi.map(c => `<th>${escapeHtml(c.etichetta)}</th>`).join('')}</tr></thead><tbody>
    ${_taglie.operatori.map(o => `<tr><td><strong>${escapeHtml(o.cognome)} ${escapeHtml(o.nome)}</strong></td>${data.campi.map(c => `<td>${escapeHtml(o.valori[c.id] || '—')}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;
}
function _csvCella(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // niente formule eseguite dal foglio di calcolo
  return `"${s.replace(/"/g, '""')}"`;
}
function esportaTaglieCsv() {
  if (!_taglie?.campi?.length) { toast('Niente da esportare', 'err'); return; }
  const righe = [['Cognome', 'Nome', ..._taglie.campi.map(c => c.etichetta)],
    ..._taglie.operatori.map(o => [o.cognome, o.nome, ..._taglie.campi.map(c => o.valori[c.id] || '')])];
  const csv = righe.map(r => r.map(_csvCella).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = `taglie-squadra-${_isoOggi()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Impostazioni: Campi del profilo ──
let _campiProfilo = [];
const TIPI_CAMPO = { testo: 'Testo', telefono: 'Telefono', scelta: 'Scelta', numero: 'Numero' };
async function loadCampiProfilo() {
  const { data, error } = await sb.from('campi_profilo').select('*').order('gruppo').order('posizione').order('id').limit(500);
  const el = document.getElementById('campi-profilo-body');
  if (error) { el.innerHTML = `<div class="ric-err">${escapeHtml(error.message)}</div>`; return; }
  _campiProfilo = data || [];
  document.getElementById('gruppi-campi-profilo').innerHTML = [...new Set(['Contatti', 'Taglie', ..._campiProfilo.map(c => c.gruppo)])].map(g => `<option value="${escapeHtml(g)}">`).join('');
  renderCampiProfilo();
}
function renderCampiProfilo() {
  const el = document.getElementById('campi-profilo-body');
  if (!_campiProfilo.length) { el.innerHTML = '<p style="color:var(--muted)">Nessun campo.</p>'; return; }
  el.innerHTML = _campiProfilo.map((c, i) => {
    const id = escapeJsAttr(c.id);
    const stessoGruppo = _campiProfilo.filter(x => x.gruppo === c.gruppo);
    const pos = stessoGruppo.indexOf(c);
    return `<div class="cfg-riga ${c.attivo ? '' : 'disattivo'}">
      <input type="text" maxlength="60" aria-label="Etichetta" value="${escapeHtml(c.etichetta)}" onchange="aggiornaCampoProfilo('${id}', { etichetta: this.value.trim() })">
      <span style="font-size:12px;color:var(--muted)">${escapeHtml(TIPI_CAMPO[c.tipo] || c.tipo)}</span>
      <input type="text" maxlength="40" aria-label="Gruppo" value="${escapeHtml(c.gruppo)}" list="gruppi-campi-profilo" onchange="aggiornaCampoProfilo('${id}', { gruppo: this.value.trim() })">
      <div class="cfg-azioni">
        <button class="btn btn-secondary" title="Su" aria-label="Sposta su" ${pos === 0 ? 'disabled' : ''} onclick="spostaCampoProfilo('${id}', -1)">↑</button>
        <button class="btn btn-secondary" title="Giù" aria-label="Sposta giù" ${pos === stessoGruppo.length - 1 ? 'disabled' : ''} onclick="spostaCampoProfilo('${id}', 1)">↓</button>
        <button class="btn ${c.attivo ? 'btn-secondary' : 'btn-ok'}" onclick="aggiornaCampoProfilo('${id}', { attivo: ${!c.attivo} })">${c.attivo ? 'Disattiva' : 'Attiva'}</button>
        <button class="btn btn-danger" aria-label="Elimina" onclick="eliminaCampoProfilo('${id}')"><i data-ic="cestino"></i></button>
      </div>
      ${c.tipo === 'scelta' ? `<input class="cfg-opzioni" type="text" maxlength="600" aria-label="Opzioni" value="${escapeHtml((c.opzioni || []).join(', '))}" onchange="aggiornaOpzioniCampo('${id}', this.value)">` : ''}
    </div>`;
  }).join('');
}
function _opzioniDaTesto(testo) {
  return [...new Set(String(testo).split(',').map(s => s.trim()).filter(Boolean))].slice(0, 60);
}
async function aggiornaCampoProfilo(id, modifiche) {
  if ('etichetta' in modifiche && !modifiche.etichetta) { toast('L\'etichetta non può essere vuota', 'err'); return renderCampiProfilo(); }
  if ('gruppo' in modifiche && !modifiche.gruppo) { toast('Il gruppo non può essere vuoto', 'err'); return renderCampiProfilo(); }
  const { data, error } = await sb.rpc('salva_campo_profilo', { p_id: id, p_dati: modifiche, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); }
  else toast('Campo aggiornato', 'ok');
  await loadCampiProfilo();
}
async function aggiornaOpzioniCampo(id, testo) {
  const opzioni = _opzioniDaTesto(testo);
  if (!opzioni.length) { toast('Serve almeno un\'opzione', 'err'); return renderCampiProfilo(); }
  await aggiornaCampoProfilo(id, { opzioni });
}
async function spostaCampoProfilo(id, delta) {
  const c = _campiProfilo.find(x => x.id === id);
  const gruppo = _campiProfilo.filter(x => x.gruppo === c.gruppo);
  const i = gruppo.indexOf(c), j = i + delta;
  if (j < 0 || j >= gruppo.length) return;
  const ordine = gruppo.slice(); [ordine[i], ordine[j]] = [ordine[j], ordine[i]];
  const { data, error } = await sb.rpc('riordina_config', { p_tabella: 'campi_profilo', p_ids_in_ordine: ordine.map(x => x.id), p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) toast('Errore: ' + (data?.errore || error?.message || ''), 'err');
  await loadCampiProfilo();
}
async function eliminaCampoProfilo(id) {
  const c = _campiProfilo.find(x => x.id === id);
  if (!confirm(`Eliminare il campo "${c?.etichetta}"?`)) return;
  const { data, error } = await sb.rpc('elimina_campo_profilo', { p_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  toast('Campo eliminato', 'ok');
  await loadCampiProfilo();
}
function _nuovoCampoTipoCambiato() {
  document.getElementById('nuovo-campo-opzioni').hidden = document.getElementById('nuovo-campo-tipo').value !== 'scelta';
}
async function aggiungiCampoProfilo() {
  const etichetta = document.getElementById('nuovo-campo-etichetta').value.trim();
  const tipo = document.getElementById('nuovo-campo-tipo').value;
  const gruppo = document.getElementById('nuovo-campo-gruppo').value.trim() || 'Contatti';
  if (!etichetta) { toast('Scrivi l\'etichetta del campo', 'err'); return; }
  let opzioni = null;
  if (tipo === 'scelta') {
    opzioni = _opzioniDaTesto(document.getElementById('nuovo-campo-opzioni').value);
    if (!opzioni.length) { toast('Indica le opzioni separate da virgola', 'err'); return; }
  }
  const posizione = Math.max(0, ..._campiProfilo.filter(c => c.gruppo === gruppo).map(c => c.posizione || 0)) + 10;
  const { data, error } = await sb.rpc('salva_campo_profilo', { p_id: null, p_dati: { etichetta, tipo, opzioni, gruppo, posizione }, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  document.getElementById('nuovo-campo-etichetta').value = '';
  document.getElementById('nuovo-campo-opzioni').value = '';
  toast('Campo aggiunto', 'ok');
  await loadCampiProfilo();
}
