// responsabile.html — Nuovo ordine, consegna, sospendi/riattiva/spedisci, modifica ordine, elimina, fasi extra in modifica.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

function prefillDaCatalogo(catalogoId) {
  mostraMacchinaExtra(document.getElementById('nef-macchina-box'), catalogoId || null, 'nef-macchina');
  const row = document.getElementById('nef-salva-catalogo-row');
  const pp = document.getElementById('nef-piu-pressate-row');
  if (pp) pp.style.display = 'none';   // l'inserimento libero non ha una macchina; con una voce di catalogo la decide il catalogo
  if (!catalogoId) {
    // Fase libera: mostra opzione salva nel catalogo
    if (row) row.style.display = '';
    return;
  }
  if (row) row.style.display = 'none';
  const c = catalogoFasiExtra.find(x => x.id === catalogoId);
  if (!c) return;
  document.getElementById('nef-nome').value = c.nome;
  document.getElementById('nef-tipo-gestione').value = c.tipo_gestione;
}

// ═══════════════════════════════════════════════
// ORDINI: CREA / SOSPENDI / RIATTIVA / SPEDITO
// ═══════════════════════════════════════════════
// ── TIPO ORDINE ──────────────────────────────────
function setTipoOrdine(tipo) {
  document.getElementById('modal-tipo').value = tipo;
  document.getElementById('tipo-btn-standard').className = tipo === 'standard' ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('tipo-btn-extra').className = tipo === 'extra' ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('standard-fields-section').style.display = tipo === 'standard' ? '' : 'none';
  // Toggle fasi extra standard (checkbox)
  document.getElementById('std-extra-toggle-row').style.display = tipo === 'standard' ? '' : 'none';
  document.getElementById('std-fasi-opzionali-container').style.display = tipo === 'standard' ? '' : 'none';
  if (tipo !== 'standard') {
    document.getElementById('ord-extra-toggle').checked = false;
    fasiAttive().filter(f => f.opzionale).forEach(f => {
      const el = document.getElementById(`ord-fase-opz-${f.id}`);
      if (el) el.checked = false;
    });
    document.getElementById('std-extra-fasi-section').style.display = 'none';
    document.getElementById('std-extra-fasi-list').innerHTML = '';
  }
  const extraSec = document.getElementById('extra-fasi-section');
  if (tipo === 'extra') {
    extraSec.style.display = 'block';
    if (!document.querySelectorAll('.extra-fase-row').length) {
      (async () => {
        if (!catalogoFasiExtra.length) await loadCatalogoFasiExtra();
        for (let i = 0; i < 3; i++) addFaseExtra();
      })();
    }
  } else {
    extraSec.style.display = 'none';
  }
}

function toggleStdExtraFasi(cb) {
  const sec = document.getElementById('std-extra-fasi-section');
  const list = document.getElementById('std-extra-fasi-list');
  if (cb.checked) {
    sec.style.display = 'block';
    if (!list.children.length) addStdFaseExtra();
  } else {
    sec.style.display = 'none';
    list.innerHTML = '';
  }
}

function addStdFaseExtra() {
  const list = document.getElementById('std-extra-fasi-list');
  const row = document.createElement('div');
  row.className = 'extra-std-row';
  row.innerHTML = `<input type="text" placeholder="Nome fase aggiuntiva…" list="nomi-fasi-extra-storia" autocomplete="off"><button type="button" onclick="this.parentElement.remove()" title="Rimuovi" aria-label="Rimuovi">✕</button>`;
  list.appendChild(row);
  row.querySelector('input').focus();
}

let extraFaseCounter = 0;

// ── Macchina delle fasi extra ──
// Catalogo con una sola macchina: la imposta il database. Con più macchine il responsabile sceglie; la proposta (macchina meno carica)
// la calcola il database. Nessuna macchina nel catalogo: nessuna scelta.
const MSG_FASI_EXTRA = {
  ordine_spedito: "L'ordine è già spedito: non si possono aggiungere fasi.", ordine_eliminato: "L'ordine è stato eliminato.", ordine_non_trovato: 'Ordine non trovato.',
  catalogo_non_attivo: 'La voce di catalogo scelta è disattivata.', catalogo_non_trovato: 'Voce di catalogo non trovata.',
  numero_gia_usato: "Esiste già una fase con questo numero nell'ordine.", numero_non_valido: 'Numero di fase non valido.', nome_obbligatorio: 'Inserisci il nome di tutte le fasi.',
  macchina_non_valida: 'Macchina non valida o non attiva.', macchina_non_del_catalogo: 'La macchina scelta non appartiene a questa fase del catalogo.',
  tipo_gestione_non_valido: 'Tipo di gestione non valido.', fasi_non_valide: 'Dati delle fasi non validi.',
  sessione_non_valida: 'Sessione non valida: accedi di nuovo.', non_autorizzato: 'Operazione non consentita.',
  ...Etichette.pressate.config.errori
};
function messaggioFasiExtra(errore) { return MSG_FASI_EXTRA[errore] || errore || ''; }

async function mostraMacchinaExtra(box, catalogoId, classeSelect) {
  if (!box) return;
  box.style.display = 'none';
  box.innerHTML = '';
  box.dataset.cat = catalogoId || '';
  const c = catalogoId ? catalogoFasiExtra.find(x => x.id === catalogoId) : null;
  if (!c || (c.macchine_ids || []).length < 2) return;
  const { data } = await sb.rpc('proposta_macchina_fase_extra', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_catalogo_id: catalogoId });
  if (box.dataset.cat !== (catalogoId || '')) return;   // nel frattempo è stata scelta un'altra voce
  if (!data?.ok || !(data.macchine || []).length) return;
  box.innerHTML = `<label style="font-size:12px;display:block;margin-bottom:3px">Macchina</label>
    <select class="${classeSelect}" style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-family:var(--font-sans);font-size:13px;background:var(--bg);color:var(--ink);outline:none">
      ${data.macchine.map(m => `<option value="${m.id}" ${m.id === data.proposta ? 'selected' : ''}>${escapeHtml(m.nome)} — oggi ${fmtMinuti(m.minuti_oggi)} min, ${m.fasi_extra_aperte} fasi extra aperte${m.id === data.proposta ? ' (proposta: la meno carica)' : ''}</option>`).join('')}
    </select>`;
  box.style.display = '';
}

function onCatalogoFaseChange(sel) {
  const row = sel.closest('.extra-fase-row');
  const catalogoId = sel.value || null;
  row.dataset.catalogoId = catalogoId || '';
  const nomeInput = row.querySelector('.extra-fase-nome');
  const esternaChk = row.querySelector('.extra-fase-esterna');
  const salvaRow = row.querySelector('.extra-fase-salva-row');
  const ppRow = row.querySelector('.extra-fase-pp-row');
  if (ppRow) ppRow.style.display = catalogoId ? 'none' : '';   // con una voce di catalogo la casella la decide il catalogo
  if (catalogoId) {
    const c = catalogoFasiExtra.find(x => x.id === catalogoId);
    if (c) {
      nomeInput.value = c.nome;
      esternaChk.checked = c.e_attesa_esterna || false;
    }
    salvaRow.style.display = 'none';
  } else {
    salvaRow.style.display = '';
  }
  mostraMacchinaExtra(row.querySelector('.extra-fase-macchina-box'), catalogoId, 'extra-fase-macchina');
}

async function addFaseExtra() {
  if (!catalogoFasiExtra.length) await loadCatalogoFasiExtra();
  const list = document.getElementById('extra-fasi-list');
  const count = list.querySelectorAll('.extra-fase-row').length;
  if (count >= 20) { toast('Massimo 20 fasi', 'err'); return; }
  extraFaseCounter++;
  const optsHtml = catalogoFasiExtra.filter(c => c.attiva)
    .map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
  const row = document.createElement('div');
  row.className = 'extra-fase-row';
  row.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  row.innerHTML = `
    <div style="display:flex;gap:6px;align-items:center">
      <span class="ef-num" style="font-family:var(--font-mono);font-size:11px;color:var(--muted);min-width:20px;text-align:right">${count + 1}</span>
      <select class="extra-fase-catalogo" onchange="onCatalogoFaseChange(this)"
        style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-family:var(--font-sans);font-size:13px;background:var(--bg);color:var(--ink);outline:none">
        <option value="">— inserimento libero —</option>
        ${optsHtml}
      </select>
      <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);white-space:nowrap;cursor:pointer">
        <input type="checkbox" class="extra-fase-esterna"> Attesa esterna
      </label>
    </div>
    <div style="display:flex;gap:6px;align-items:center;padding-left:26px">
      <input type="text" class="extra-fase-nome" placeholder="Nome fase ${count + 1}…" list="nomi-fasi-extra-storia" autocomplete="off"
        style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-family:var(--font-sans);font-size:13px;background:var(--bg);color:var(--ink);outline:none">
      <input type="text" class="extra-fase-note" placeholder="Note (opz.)"
        style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-family:var(--font-sans);font-size:13px;background:var(--bg);color:var(--ink);outline:none">
    </div>
    <div class="extra-fase-macchina-box" style="display:none;padding-left:26px"></div>
    <div class="extra-fase-salva-row" style="padding-left:26px">
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;color:var(--indigo-ink)">
        <input type="checkbox" class="extra-fase-salva-cat" style="accent-color:var(--indigo)">
        Salva questa fase nel catalogo per riusi futuri
      </label>
    </div>
  `;
  list.appendChild(row);
  renumberExtraFasi();
}

function removeFaseExtra() {
  const list = document.getElementById('extra-fasi-list');
  const rows = list.querySelectorAll('.extra-fase-row');
  if (rows.length <= 1) { toast('Almeno una fase è richiesta', 'err'); return; }
  rows[rows.length - 1].remove();
  renumberExtraFasi();
}

function renumberExtraFasi() {
  document.querySelectorAll('.extra-fase-row').forEach((row, i) => {
    const sp = row.querySelector('.ef-num');
    if (sp) sp.textContent = i + 1;
    const nomeInput = row.querySelector('.extra-fase-nome');
    if (nomeInput && !nomeInput.value) nomeInput.placeholder = `Nome fase ${i + 1}…`;
  });
}

async function caricaClienti() {
  const { data } = await sb.from('ordini').select('cliente').neq('eliminato', true).order('cliente');
  const nomi = [...new Set((data || []).map(o => o.cliente).filter(Boolean))];
  const dl = document.getElementById('clienti-list');
  if (dl) dl.innerHTML = nomi.map(n => `<option value="${n}">`).join('');
}

// Spedizione unica: suggerimento in fase di creazione ordine, popolato da
// checkClientiApertiSuggerimento() e consumato da creaOrdine().
let _suggerimentoGruppoOrdiniIds = [];
let _suggerimentoGruppoId = null;

// ── Consegna dell'ordine (da spedire / ritira / da avvisare): lo stato sta in memoria, mai letto dal DOM al click ──
const _consegna = { ord: null, mod: null, ordManuale: false };
function consegnaDisegna(prefisso) {
  const box = document.getElementById(prefisso + '-consegna-box'); if (!box) return;
  box.innerHTML = `<div class="consegna-scelta" role="group" aria-label="Consegna">${Etichette.modalitaConsegnaElenco().map(([v, t]) =>
    `<button type="button" class="${_consegna[prefisso] === v ? 'attivo' : ''}" aria-pressed="${_consegna[prefisso] === v}" onclick="consegnaScegli('${prefisso}','${v}')">${escapeHtml(t)}</button>`).join('')}</div>`
    + (prefisso === 'ord' ? '<div class="consegna-sugg" id="ord-consegna-sugg" aria-live="polite"></div>' : '');
}
function consegnaScegli(prefisso, v) {
  _consegna[prefisso] = v;
  if (prefisso === 'ord') _consegna.ordManuale = true;
  consegnaDisegna(prefisso);
  if (prefisso === 'ord') consegnaMostraSuggerimento();
}
let _consegnaSuggerita = null;
function consegnaMostraSuggerimento() {
  const el = document.getElementById('ord-consegna-sugg'); if (!el) return;
  const cliente = document.getElementById('ord-cliente')?.value.trim() || '';
  el.textContent = _consegnaSuggerita ? Etichette.suggerimentoConsegna(cliente.toUpperCase(), _consegnaSuggerita) : '';
}
// Suggerimento dagli ultimi ordini del cliente (numero di ordini guardati letto dalla configurazione sul server)
async function consegnaSuggerisci() {
  _consegnaSuggerita = null;
  const cliente = document.getElementById('ord-cliente')?.value.trim();
  if (!cliente) { consegnaMostraSuggerimento(); return; }
  const { data } = await sb.rpc('consegna_suggerita', { p_cliente: cliente, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (data?.ok && data.modalita) {
    _consegnaSuggerita = data;
    if (!_consegna.ordManuale) { _consegna.ord = data.modalita; consegnaDisegna('ord'); }   // preselezione: sempre modificabile
  }
  consegnaMostraSuggerimento();
}
// Spedizione unica: le consegne dei suggeriti (ordini aperti dello stesso cliente) devono coincidere con quella del nuovo ordine
function consegnaGruppoSuggeriti() {
  const ordini = ordiniCache.filter(o => _suggerimentoGruppoOrdiniIds.includes(o.id));
  const chiavi = new Set(ordini.map(o => (o.modalita_consegna || 'da_spedire') + '|' + (o.risposta_cliente_consegna || '')));
  return { ordini, unica: chiavi.size <= 1, modalita: ordini[0]?.modalita_consegna || 'da_spedire', conRisposta: ordini.some(o => o.risposta_cliente_consegna) };
}

async function checkClientiApertiSuggerimento() {
  consegnaSuggerisci().catch(e => console.warn('suggerimento consegna', e));
  const banner = document.getElementById('suggerimento-gruppo-spedizione');
  const testo = document.getElementById('suggerimento-gruppo-spedizione-testo');
  const check = document.getElementById('suggerimento-gruppo-spedizione-check');
  _suggerimentoGruppoOrdiniIds = [];
  _suggerimentoGruppoId = null;
  if (banner) banner.style.display = 'none';
  if (check) check.checked = false;

  const cliente = document.getElementById('ord-cliente')?.value.trim();
  if (!cliente) return;

  const { data } = await sb.rpc('ordini_stesso_cliente_aperti', {
    p_responsabile_id: currentUserRow.id,
    p_session_token: null,
    p_cliente: cliente,
    p_ordine_id_escludi: null
  });
  if (!data?.ok || !data.dati?.length) return;

  _suggerimentoGruppoOrdiniIds = data.dati.map(o => o.id);
  // Se i suggeriti sono già tutti nello stesso gruppo esistente, riusalo; altrimenti (nessuno,
  // o più gruppi diversi coinvolti — caso raro) se ne creerà uno nuovo che li unisce tutti.
  const gruppiEsistenti = [...new Set(data.dati.map(o => o.gruppo_spedizione_id).filter(Boolean))];
  _suggerimentoGruppoId = gruppiEsistenti.length === 1 ? gruppiEsistenti[0] : null;

  const n = data.dati.length;
  const codici = data.dati.map(o => o.codice || '—').join(', ');
  const ordiniApertiLbl = n === 1 ? 'ordine aperto' : 'ordini aperti';
  if (testo) testo.textContent = `Ci sono già ${n} ${ordiniApertiLbl} per ${cliente}: ${codici}. Vuoi includere anche questo nella stessa spedizione?`;
  if (banner) banner.style.display = 'block';
}

function openModalNuovoOrdine() {
  caricaClienti();
  document.getElementById('ord-cliente').value = '';
  document.getElementById('ord-codice').value = '';
  document.getElementById('ord-note').value = '';
  document.getElementById('ord-scadenza').value = '';
  document.getElementById('extra-fasi-list').innerHTML = '';
  document.getElementById('suggerimento-gruppo-spedizione').style.display = 'none';
  document.getElementById('suggerimento-gruppo-spedizione-check').checked = false;
  _suggerimentoGruppoOrdiniIds = [];
  _suggerimentoGruppoId = null;
  _consegna.ord = null; _consegna.ordManuale = false; _consegnaSuggerita = null; consegnaDisegna('ord');
  const struEl = document.getElementById('ord-struttura');
  const tipoPEl = document.getElementById('ord-tipo-prodotto');
  if (struEl && struEl.options.length) struEl.selectedIndex = 0;
  if (tipoPEl && tipoPEl.options.length) tipoPEl.selectedIndex = 0;
  renderAttributiCustomForm('ord-attributi-custom', {});
  inizializzaFormLatiLavorazioni('ord', null);
  setTipoOrdine('standard');
  // Reset esplicito fasi opzionali — setTipoOrdine le azzera solo quando tipo !== 'standard'
  fasiAttive().filter(f => f.opzionale).forEach(f => {
    const el = document.getElementById(`ord-fase-opz-${f.id}`);
    if (el) el.checked = false;
  });
  document.getElementById('modal-ordine').classList.add('open');
}

async function creaOrdine() {
  const cliente = document.getElementById('ord-cliente').value.trim();
  if (!cliente) { toast('Inserisci il nome del cliente', 'err'); return; }
  const codice = document.getElementById('ord-codice').value.trim();
  if (!codice) { toast('Inserisci il numero ordine', 'err'); return; }
  const tipo = document.getElementById('modal-tipo').value;
  if (!_consegna.ord) { toast(Etichette.consegnaTesti.obbligatoria, 'err'); return; }
  let modalitaOrdine = _consegna.ord;
  const vuoleGruppo = !!document.getElementById('suggerimento-gruppo-spedizione-check')?.checked && _suggerimentoGruppoOrdiniIds.length;
  if (vuoleGruppo) {
    const g = consegnaGruppoSuggeriti();
    if (!g.unica) { toast(Etichette.consegnaTesti.errori.consegne_diverse, 'err'); return; }
    if (g.conRisposta) { toast('Questa spedizione ha già una risposta del cliente sulla consegna: non si può aggiungere un ordine nuovo.', 'err'); return; }
    if (g.modalita !== modalitaOrdine) {
      if (!confirm('La spedizione unica ha consegna «' + Etichette.modalitaConsegna(g.modalita) + '»: la applico anche a questo ordine?')) return;
      modalitaOrdine = g.modalita;
    }
  }

  // Valida fasi extra
  let fasiExtra = [];
  if (tipo === 'extra') {
    const rows = document.querySelectorAll('.extra-fase-row');
    fasiExtra = Array.from(rows).map((row, i) => {
      const eEsterna = row.querySelector('.extra-fase-esterna')?.checked ?? false;
      const catId = row.dataset.catalogoId || null;
      const catEntry = catId ? catalogoFasiExtra.find(x => x.id === catId) : null;
      return {
        numero: i + 1,
        nome: row.querySelector('.extra-fase-nome').value.trim(),
        note_responsabile: row.querySelector('.extra-fase-note').value.trim() || null,
        e_attesa_esterna: eEsterna,
        tipo_gestione: catEntry ? catEntry.tipo_gestione : (eEsterna ? 'spedizione_esterna' : 'standard'),
        catalogo_fase_extra_id: catId || null,
        piu_pressate: false,   // la casella esiste solo per le fasi con una macchina (voci di catalogo): la decide il catalogo
        pressate_previste: null,
        macchina_id: row.querySelector('.extra-fase-macchina')?.value || null,
        _salva_catalogo: !catId && (row.querySelector('.extra-fase-salva-cat')?.checked ?? false)
      };
    });
    if (fasiExtra.some(f => !f.nome)) { toast('Inserisci il nome di tutte le fasi', 'err'); return; }
    if (fasiExtra.some(f => f.piu_pressate && f.pressate_previste == null)) { toast(Etichette.pressate.config.errori.pressate_previste_non_valide, 'err'); return; }
    if (!fasiExtra.length) { toast('Aggiungi almeno una fase', 'err'); return; }
    // Crea le voci catalogo per le fasi con "salva nel catalogo" spuntato
    for (const f of fasiExtra) {
      if (f._salva_catalogo && f.nome) {
        const { data: nuovaCfe } = await sb.rpc('imposta_catalogo_fase_extra', {
          p_responsabile_id: currentUserRow.id,
          p_session_token: null,
          p_id: null,
          p_nome: f.nome,
          p_descrizione: null,
          p_tipo_gestione: f.tipo_gestione,
          p_e_attesa_esterna: f.e_attesa_esterna || false,
          p_attiva: true,
          p_piu_pressate: !!f.piu_pressate,
          ...(f.piu_pressate ? { p_pressate_previste: f.pressate_previste } : {})
        });
        if (nuovaCfe?.ok) {
          f.catalogo_fase_extra_id = nuovaCfe.id || null;
          catalogoFasiExtra = [];
        }
      }
      delete f._salva_catalogo;
    }
  }

  const dati = {
    cliente,
    codice,
    tipo,
    priorita: document.getElementById('ord-prio').value,
    scadenza: document.getElementById('ord-scadenza').value || null,
    quantita: parseInt(document.getElementById('ord-quantita').value) || 1,
    note_generali: document.getElementById('ord-note').value.trim() || null,
    modalita_consegna: modalitaOrdine,
  };
  if (tipo === 'standard') {
    dati.struttura = document.getElementById('ord-struttura').value;
    dati.tipo_prodotto = document.getElementById('ord-tipo-prodotto').value;
    Object.assign(dati, datiLatiLavorazioni('ord'));   // attributi_lato + lavorazioni_cnc: un solo payload, validato dal server
    dati.attributi = leggiAttributiCustom('ord-attributi-custom');
    // fasi aggiuntive e fasi opzionali scelte: create nella stessa transazione dell'ordine
    dati.fasi_aggiuntive = document.getElementById('ord-extra-toggle')?.checked
      ? Array.from(document.querySelectorAll('.extra-std-row input')).map(i => i.value.trim()).filter(Boolean) : [];
    dati.fasi_opzionali = fasiAttive().filter(f => f.opzionale && document.getElementById(`ord-fase-opz-${f.id}`)?.checked).map(f => f.id);
  }
  const { data: esito, error } = await sb.rpc('crea_ordine', { p_dati: dati, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !esito?.ok) {
    const msg = { codice_duplicato: 'Esiste già un ordine con questo numero', priorita_non_valida: 'Priorità non valida', modalita_consegna_non_valida: Etichette.consegnaTesti.errori.modalita_consegna_non_valida }[esito?.errore] || messaggioAttributo(esito?.errore);
    toast('Errore: ' + (msg || esito?.errore || error?.message || ''), 'err'); return;
  }
  const newOrdine = { id: esito.ordine_id };

  // Inserisci fasi extra tramite RPC (verifica ruolo responsabile lato DB)
  if (tipo === 'extra' && fasiExtra.length) {
    const { data: eData } = await sb.rpc('crea_fasi_extra', {
      p_ordine_id: newOrdine.id,
      p_fasi: fasiExtra,
      p_responsabile_id: currentUserRow.id
    });
    if (!eData?.ok) { toast('Errore fasi extra: ' + messaggioFasiExtra(eData?.errore), 'err'); return; }
  }

  // Le fasi applicabili le decide solo il database (trigger sull'inserimento dell'ordine); registro e ordine nella stessa RPC
  await inviaNotificaATutti('ordine_creato',
    `Nuovo ordine ${tipo === 'extra' ? 'extra' : 'standard'}: ${cliente} — ${codice}`, newOrdine.id);

  // Spedizione unica: se il responsabile ha confermato il suggerimento mostrato dopo aver
  // compilato il cliente, aggiunge il nuovo ordine (più quelli suggeriti) alla stessa spedizione.
  if (document.getElementById('suggerimento-gruppo-spedizione-check')?.checked && _suggerimentoGruppoOrdiniIds.length) {
    const { data: gData } = await sb.rpc('crea_o_aggiorna_gruppo_spedizione', {
      p_responsabile_id: currentUserRow.id,
      p_session_token: null,
      p_ordine_ids: [newOrdine.id, ..._suggerimentoGruppoOrdiniIds],
      p_gruppo_id: _suggerimentoGruppoId
    });
    if (!gData?.ok) toast('Ordine creato, ma non è stato possibile aggiungerlo alla spedizione unica: ' + (Etichette.spedizioneUnica.errori[gData?.errore] || Etichette.consegnaTesti.errori[gData?.errore] || gData?.errore || ''), 'err');
  }

  closeModal('modal-ordine');
  toast('Ordine creato con successo', 'ok');
  await loadOrdini();
  renderDashboard();
  renderOrdiniTable();
}

async function sospendi(id) {
  if (!confirm('Sospendere questo ordine?')) return;
  const o = ordiniCache.find(x => x.id === id);
  const { data: esSosp, error: errSosp } = await sb.rpc('imposta_stato_ordine', { p_ordine_id: id, p_stato: 'sospeso', p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (errSosp || !esSosp?.ok) { toast('Errore: ' + (esSosp?.errore || errSosp?.message || ''), 'err'); return; }
  await inviaNotificaATutti('ordine_sospeso', `Ordine sospeso: ${o?.cliente || ''} — ${o?.codice || ''}`, id);
  toast('Ordine sospeso', 'ok');
  await loadOrdini();
  renderDashboard();
  renderOrdiniTable();
  if (currentOrdineId === id) renderDettaglioOrdine(id);
}

async function riattiva(id) {
  const o = ordiniCache.find(x => x.id === id);
  const { data: esRiat, error: errRiat } = await sb.rpc('imposta_stato_ordine', { p_ordine_id: id, p_stato: 'aperto', p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (errRiat || !esRiat?.ok) { toast('Errore: ' + (esRiat?.errore || errRiat?.message || ''), 'err'); return; }
  await inviaNotificaATutti('ordine_sospeso', `Ordine riattivato: ${o?.cliente || ''} — ${o?.codice || ''}`, id);
  toast('Ordine riattivato', 'ok');
  await loadOrdini();
  renderDashboard();
  renderOrdiniTable();
  if (currentOrdineId === id) renderDettaglioOrdine(id);
}

async function segnaSpedito(id) {
  const ritira = Etichette.ritiraOrdine([...ordiniCache, ...ordiniSpeditiCache].find(o => o.id === id));
  const esito = await segnaSpeditoConGruppo({
    ordineId: id, ritira,
    anteprima: async () => (await sb.rpc('anteprima_spedizione_gruppo', { p_ordine_id: id, p_utente_id: currentUserRow.id })).data,
    chiama: async tutti => (await sb.rpc('segna_spedito', { p_ordine_id: id, p_utente_id: currentUserRow.id, ...(tutti ? { p_tutto_gruppo: true } : {}) })).data,
    confermaSingolo: () => confirm(ritira ? 'Segnare questo ordine come ritirato? L\'azione è irreversibile.' : 'Segnare questo ordine come spedito? L\'azione è irreversibile.')
  });
  if (!esito) return;
  const data = esito.data;
  if (data?.ok) {
    if (esito.tutti) riepilogoSpedizioneGruppo(data, ritira); else toast(ritira ? 'Ordine segnato come ritirato' : 'Ordine segnato come spedito', 'ok');
    await loadOrdini();
    renderDashboard();
    showSection('dashboard');
  } else {
    toast(data?.errore || 'Errore', 'err');
  }
}
// ═══════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════

async function eliminaOrdine(id) {
  const ordine = [...ordiniCache, ...ordiniSpeditiCache].find(o => o.id === id);
  const label = ordine ? `${ordine.cliente} — ${ordine.codice || ''}` : id;
  if (!confirm(`Eliminare definitivamente l'ordine "${label}"?\n\nQuesta azione non può essere annullata.`)) return;
  const { data: esElim, error } = await sb.rpc('elimina_ordine', { p_ordine_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !esElim?.ok) { toast('Errore eliminazione: ' + (esElim?.errore || error?.message || ''), 'err'); return; }
  // le fasi non completate vengono annullate dalla stessa RPC (annulla_fasi_ordine_eliminato)

  // Le fasi non ancora completate di un ordine eliminato non rappresentano più lavoro reale:
  // portale a 'non_applicabile' (già nell'enum, significato esatto: fase che non va eseguita).
  // Mai le fasi 'completata' — quel lavoro è stato svolto, la traccia resta. Causa radice delle
  // "fasi fantasma" trovate il 2026-09-03 (238 righe ordine_fasi + 5 fasi_ordine_extra mai
  // chiuse da questa funzione, che finora aggiornava solo ordini.eliminato) — vedi vault.
  // RPC, non un update diretto: fasi_ordine_extra non ha alcuna policy di scrittura per
  // authenticated (solo SELECT), un update client-side lì fallirebbe in silenzio sotto RLS.
  if (esElim.fasi_annullate && esElim.fasi_annullate.ok === false) console.warn('Fasi non annullate su ordine eliminato:', esElim.fasi_annullate.errore);

  toast('Ordine eliminato', 'ok');
  showSection('dashboard');
  await loadOrdini();
  renderDashboard();
  renderOrdiniTable();
}



// Seleziona il valore in una <select>; se non è tra le opzioni (disattivata/storica) la aggiunge come voce temporanea
function impostaSelectConValore(selectId, valore) {
  const el = document.getElementById(selectId);
  if (!el) return;
  if (valore && ![...el.options].some(o => o.value === valore)) {
    const o = document.createElement('option');
    o.value = valore;
    o.textContent = `${valore} (non più disponibile)`;
    el.appendChild(o);
  }
  el.value = valore || '';
}

async function openModificaOrdine(id) {
  const ordine = [...ordiniCache, ...ordiniSpeditiCache].find(o => o.id === id);
  if (!ordine) return;
  await arricchisciOrdini([ordine]);
  const isExtra = ordine.tipo === 'extra';
  document.getElementById('mod-row-tipo-struttura').style.display = isExtra ? 'none' : '';
  document.getElementById('mod-row-materiale').style.display = isExtra ? 'none' : '';
  document.getElementById('mod-row-lavorazioni').style.display = isExtra ? 'none' : '';
  document.getElementById('mod-cliente').value = ordine.cliente || '';
  document.getElementById('mod-codice').value = ordine.codice || '';
  // Nessun valore di ripiego: se il valore dell'ordine non è più tra le opzioni attive (disattivato/storico) resta selezionabile così com'è
  impostaSelectConValore('mod-tipo-prodotto', ordine.tipo_prodotto);
  impostaSelectConValore('mod-struttura', ordine.struttura);
  renderAttributiCustomForm('mod-attributi-custom', ordine.attributi || {});
  document.getElementById('mod-quantita').value = ordine.quantita || 1;
  document.getElementById('mod-prio').value = ordine.priorita || 'normale';
  if (!isExtra) inizializzaFormLatiLavorazioni('mod', ordine);
  document.getElementById('mod-attributi-custom').style.display = isExtra ? 'none' : '';
  document.getElementById('mod-prio').value = ordine.priorita || 'normale';
  document.getElementById('mod-quantita').value = ordine.quantita || 1;
  document.getElementById('mod-scadenza').value = ordine.scadenza || '';
  document.getElementById('mod-note').value = ordine.note_generali || '';
  _consegna.mod = ordine.modalita_consegna || 'da_spedire'; consegnaDisegna('mod');
  { const fr = codiciFratelliGruppo(ordine, ordiniCache); document.getElementById('mod-consegna-gruppo').textContent = fr.length ? Etichette.consegnaTesti.gruppoCambio(fr) : ''; }
  document.getElementById('modal-modifica').dataset.ordineId = id;
  document.getElementById('modal-modifica').dataset.isExtra = isExtra ? 'true' : 'false';
  // Sezione fasi extra — visibile su tutti gli ordini
  document.getElementById('mod-section-fasi-extra').style.display = '';
  document.getElementById('mod-aggiungi-fase-form').style.display = 'none';
  caricaFasiExtraModal(id);
  // Sezione fasi catalogo — solo per ordini standard
  document.getElementById('mod-section-fasi-catalogo').style.display = isExtra ? 'none' : '';
  if (!isExtra) caricaFasiCatalogoModal(id);
  document.getElementById('modal-modifica').classList.add('open');
}

async function salvaModificaOrdine() {
  const id = document.getElementById('modal-modifica').dataset.ordineId;
  const cliente = document.getElementById('mod-cliente').value.trim();
  const codice = document.getElementById('mod-codice').value.trim();
  if (!cliente) { toast('Inserisci il nome del cliente', 'err'); return; }
  if (!codice) { toast('Inserisci il numero ordine', 'err'); return; }

  const isExtra = document.getElementById('modal-modifica').dataset.isExtra === 'true';
  const nuovoTipo = document.getElementById('mod-tipo-prodotto').value;
  const nuovaStruttura = document.getElementById('mod-struttura').value;

  const payload = {
    cliente,
    codice,
    priorita: document.getElementById('mod-prio').value,
    quantita: parseInt(document.getElementById('mod-quantita').value) || 1,
    scadenza: document.getElementById('mod-scadenza').value || null,
    note_generali: document.getElementById('mod-note').value.trim() || null,
  };
  { const ord0 = [...ordiniCache, ...ordiniSpeditiCache].find(o => o.id === id);
    if (_consegna.mod && ord0 && _consegna.mod !== (ord0.modalita_consegna || 'da_spedire')) {
      const fr = codiciFratelliGruppo(ord0, ordiniCache);
      if (fr.length && !confirm(Etichette.consegnaTesti.gruppoCambio(fr) + '\n\nProcedere?')) return;
      payload.modalita_consegna = _consegna.mod;
    } }
  if (!isExtra) {
    payload.tipo_prodotto = nuovoTipo;
    payload.struttura = nuovaStruttura;
    Object.assign(payload, datiLatiLavorazioni('mod'));   // attributi_lato + lavorazioni_cnc nello stesso payload
    payload.attributi = leggiAttributiCustom('mod-attributi-custom');

  }

  const { data: esMod, error } = await sb.rpc('modifica_ordine', { p_ordine_id: id, p_dati: payload, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !esMod?.ok) {
    const msg = { codice_duplicato: 'Esiste già un ordine con questo numero' }[esMod?.errore] || Etichette.consegnaTesti.errori[esMod?.errore] || messaggioAttributo(esMod?.errore);
    toast('Errore: ' + (msg || esMod?.errore || error?.message || ''), 'err'); return;
  }
  if ((esMod.consegna?.fasi_lasciate || []).length) toast(Etichette.consegnaTesti.fasiLasciate(esMod.consegna.fasi_lasciate), 'ok');

  // Se tipo prodotto, struttura o materiale cambiano, il database ricalcola da solo le fasi (trigger sull'ordine)

  closeModal('modal-modifica');
  toast('Ordine aggiornato', 'ok');
  await loadOrdini();
  renderDashboard();
  renderOrdiniTable();
  renderDettaglioOrdine(id);
}

async function caricaFasiExtraModal(ordineId) {
  if (!catalogoFasiExtra.length) { try { await loadCatalogoFasiExtra(); } catch (e) { /* senza catalogo la casella compare solo per le fasi con macchina propria */ } }
  const { data } = await sb.from('fasi_ordine_extra')
    .select('id, numero, nome, stato, tipo_gestione, piu_pressate, pressate_previste, pressate_fatte, macchina_id, catalogo_fase_extra_id')
    .eq('ordine_id', ordineId)
    .order('numero');
  const el = document.getElementById('mod-fasi-extra-list');
  if (!data || data.length === 0) { el.innerHTML = '<em style="color:var(--muted);font-size:13px">Nessuna fase aggiuntiva</em>'; return; }
  el.innerHTML = data.map(f => {
    const badge = { disponibile:'var(--ok-soft)', in_corso:'var(--info-soft)', completata:'var(--indigo-soft)', in_attesa:'var(--urgente-bg)' }[f.stato] || 'var(--fill)';
    const tgLabel = { standard:'', conferma_ricezione:' · Conf. ricezione', spedizione_esterna:' · Sped. esterna' }[f.tipo_gestione] || '';
    const canDelete = f.stato !== 'completata';
    const delBtn = canDelete
      ? `<button class="btn btn-alert" style="padding:2px 8px;font-size:11px;margin-left:auto;flex-shrink:0"
           onclick="eliminaFaseExtra('${f.id}','${escapeJsAttr(f.nome)}','${ordineId}')">✕ Elimina</button>`
      : `<span style="font-size:11px;color:var(--muted);margin-left:auto;flex-shrink:0">completata</span>`;
    const conMacchina = !!f.macchina_id || ((catalogoFasiExtra.find(c => c.id === f.catalogo_fase_extra_id)?.macchine_ids) || []).length > 0;
    const pp = f.tipo_gestione === 'standard' && f.stato !== 'completata' && (conMacchina || f.piu_pressate)
      ? `<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);cursor:pointer;white-space:nowrap" title="${escapeHtml(Etichette.pressate.config.spiega)}"><input type="checkbox" ${f.piu_pressate ? 'checked' : ''} onchange="impostaPiuPressateFaseExtra('${f.id}', this.checked, '${ordineId}')"> ${escapeHtml(Etichette.pressate.config.casella)}</label>${f.piu_pressate ? pressateNumeroHtml('pp-num-extra', f.pressate_previste, true, `onchange="impostaPiuPressateFaseExtra('${f.id}', true, '${ordineId}', this.value)"`) : ''}` : '';
    const fatte = f.piu_pressate ? `<span style="font-size:11px;color:var(--muted);white-space:nowrap">${escapeHtml(Etichette.pressate.fatteResp(f.pressate_fatte || 0, f.pressate_previste))}</span>` : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <span style="background:${badge};padding:2px 8px;border-radius:10px;font-size:11px;white-space:nowrap">${f.stato}</span>
      <span style="font-size:13px;flex:1;min-width:120px">${escapeHtml(f.nome)}${tgLabel}</span>
      ${fatte}${pp}
      ${delBtn}
    </div>`;
  }).join('');
}

async function impostaPiuPressateFaseExtra(faseExtraId, valore, ordineId, previste) {
  const prev = previste === undefined ? undefined : pressateNumeroValido(previste);
  if (previste !== undefined && prev == null) { toast('Errore: ' + Etichette.pressate.config.errori.pressate_previste_non_valide, 'err'); await caricaFasiExtraModal(ordineId); return; }
  const { data, error } = await sb.rpc('imposta_piu_pressate_fase_extra', { p_fase_extra_id: faseExtraId, p_valore: !!valore, p_responsabile_id: currentUserRow.id, p_session_token: null, ...(prev ? { p_previste: prev } : {}) });
  if (error || !data?.ok) toast('Errore: ' + (Etichette.pressate.config.errori[data?.errore] || error?.message || data?.errore || ''), 'err');
  await caricaFasiExtraModal(ordineId);
}

async function eliminaFaseExtra(faseExtraId, nomeFase, ordineId) {
  if (!confirm(`Eliminare la fase "${nomeFase}"? Questa azione non può essere annullata.`)) return;
  const { data, error } = await sb.rpc('elimina_fase_extra', {
    p_fase_extra_id: faseExtraId,
    p_responsabile_id: currentUserRow.id
  });
  if (error || !data?.ok) {
    const msg = data?.messaggio || data?.errore || error?.message || 'Errore sconosciuto';
    toast('Errore: ' + msg, 'err');
    return;
  }
  toast(`Fase "${nomeFase}" eliminata`, 'ok');
  await caricaFasiExtraModal(ordineId);
}

async function caricaFasiCatalogoModal(ordineId) {
  const el = document.getElementById('mod-fasi-catalogo-list');
  if (!el) return;
  // Carica fasi catalogo e stato corrente per questo ordine
  const [{ data: fasiCat }, { data: ordFasi }] = await Promise.all([
    sb.from('fasi').select('id, nome, posizione, tipo_gestione, opzionale').order('posizione'),
    sb.from('ordine_fasi').select('id, fase_id, stato, spedita_il, scelta_manuale, scelta_motivo').eq('ordine_id', ordineId)
  ]);
  if (!fasiCat) { el.innerHTML = '<em>Errore caricamento fasi</em>'; return; }
  const statoMap = {};
  (ordFasi || []).forEach(r => { statoMap[r.fase_id] = r; });

  el.innerHTML = fasiCat.map(f => {
    const riga = statoMap[f.id];
    const stato = riga?.stato || 'non_applicabile';
    const attiva = stato !== 'non_applicabile';
    const bloccata = ['in_corso','completata'].includes(stato) || (riga?.spedita_il != null);
    const tgBadge = f.tipo_gestione !== 'standard'
      ? `<span style="font-size:9px;background:var(--violet-soft);color:var(--violet-ink);padding:1px 5px;border-radius:3px;margin-left:4px">${f.tipo_gestione==='conferma_ricezione'?'CONF.RIC.':'SPED.EXT.'}</span>`
      : '';
    const optBadge = f.opzionale ? `<span style="font-size:9px;background:var(--urgente-bg);color:var(--warn-ink);padding:1px 5px;border-radius:3px;margin-left:4px">OPZ</span>` : '';
    const statoColor = {disponibile:'var(--ok-soft)',in_corso:'var(--info-soft)',completata:'var(--indigo-soft)',in_attesa:'var(--urgente-bg)',non_applicabile:'var(--fill)'}[stato]||'var(--fill)';
    const motivo = bloccata ? (stato==='in_corso'?'in corso':stato==='completata'?'completata':'spedizione avviata') : '';
    // scelta manuale persistente (resta finché non la cambia il responsabile) o fase saltata perché le successive sono già completate
    const sceltaTxt = !riga?.scelta_manuale ? ''
      : riga.scelta_motivo === 'fasi_successive_completate' ? 'saltata: fasi successive già completate'
      : (riga.scelta_manuale === 'attiva' ? 'scelta manuale: attiva' : 'scelta manuale: esclusa');
    const sceltaHtml = sceltaTxt && !bloccata
      ? `<span class="scelta-fase" title="Le regole automatiche non cambiano questa fase finché non torna automatica">${sceltaTxt}</span>
         <button type="button" class="btn-link-mini" onclick="tornaAutomaticoFase('${ordineId}',${f.id})">Torna automatico</button>`
      : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
      <span style="background:${statoColor};padding:1px 7px;border-radius:8px;font-size:10px;white-space:nowrap;min-width:80px;text-align:center">${stato}</span>
      <span style="flex:1;font-size:13px">${escapeHtml(f.nome)}${tgBadge}${optBadge}${sceltaHtml ? `<span style="display:block;margin-top:2px">${sceltaHtml}</span>` : ''}</span>
      ${bloccata
        ? `<span style="font-size:11px;color:var(--muted);white-space:nowrap">${motivo}</span>`
        : `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap;font-size:12px">
             <input type="checkbox" ${attiva?'checked':''} style="width:15px;height:15px;cursor:pointer"
               onchange="impostaFaseCatalogo('${ordineId}',${f.id},this.checked,this)">
             Attiva
           </label>`
      }
    </div>`;
  }).join('');
}

async function impostaFaseCatalogo(ordineId, faseId, attiva, chk) {
  const { data, error } = await sb.rpc('imposta_fase_ordine', {
    p_ordine_id: ordineId,
    p_fase_id: faseId,
    p_attiva: attiva,
    p_responsabile_id: currentUserRow.id
  });
  if (error || !data?.ok) {
    toast('Errore: ' + (data?.messaggio || data?.errore || error?.message || ''), 'err');
    chk.checked = !attiva; // ripristina
    return;
  }
  toast(attiva ? 'Fase attivata' : 'Fase disattivata', 'ok');
  await caricaFasiCatalogoModal(ordineId);
}

async function tornaAutomaticoFase(ordineId, faseId) {
  const { data, error } = await sb.rpc('ripristina_fase_ordine_automatica', {
    p_ordine_id: ordineId, p_fase_id: faseId, p_responsabile_id: currentUserRow.id, p_session_token: null
  });
  if (error || !data?.ok) { toast('Errore: ' + (data?.messaggio || data?.errore || error?.message || ''), 'err'); return; }
  toast('Fase tornata automatica', 'ok');
  await caricaFasiCatalogoModal(ordineId);
}

async function apriAggiungiExtraFase() {
  document.getElementById('nef-nome').value = '';
  document.getElementById('nef-tipo-gestione').value = 'standard';
  document.getElementById('nef-note').value = '';
  document.getElementById('nef-piu-pressate').checked = false;
  document.getElementById('nef-pp-num-box').innerHTML = pressateNumeroHtml('', 1, false, 'id="nef-pressate-previste"', 'nef-pp-num');
  document.getElementById('nef-piu-pressate-t').textContent = Etichette.pressate.config.casella;
  document.getElementById('nef-piu-pressate-t').title = Etichette.pressate.config.spiega;
  document.getElementById('nef-piu-pressate-row').style.display = 'none';   // nessuna macchina nell'inserimento libero
  const salvaCatRow = document.getElementById('nef-salva-catalogo-row');
  const salvaCatChk = document.getElementById('nef-salva-catalogo');
  if (salvaCatRow) salvaCatRow.style.display = '';
  if (salvaCatChk) salvaCatChk.checked = false;
  // Popola dropdown catalogo
  const sel = document.getElementById('nef-catalogo');
  if (sel) {
    if (!catalogoFasiExtra.length) await loadCatalogoFasiExtra();
    const attive = catalogoFasiExtra.filter(c => c.attiva);
    sel.innerHTML = '<option value="">— inserimento libero —</option>' +
      attive.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
    sel.value = '';
  }
  mostraMacchinaExtra(document.getElementById('nef-macchina-box'), null, 'nef-macchina');
  document.getElementById('mod-aggiungi-fase-form').style.display = '';
  document.getElementById('nef-nome').focus();
}

async function aggiungiExtraFase() {
  const ordineId = document.getElementById('modal-modifica').dataset.ordineId;
  const nome = document.getElementById('nef-nome').value.trim();
  const tipoGestione = document.getElementById('nef-tipo-gestione').value;
  const salvaNelCatalogo = document.getElementById('nef-salva-catalogo')?.checked || false;
  if (tipoGestione === 'standard' && document.getElementById('nef-piu-pressate').checked && pressateNumeroValido(document.getElementById('nef-pressate-previste').value) == null) { toast(Etichette.pressate.config.errori.pressate_previste_non_valide, 'err'); return; }
  const note = document.getElementById('nef-note').value.trim() || null;
  if (!nome) { toast('Inserisci il nome della fase', 'err'); return; }
  // Determina prossimo numero
  const { data: esistenti } = await sb.from('fasi_ordine_extra').select('numero').eq('ordine_id', ordineId).order('numero', { ascending: false }).limit(1);
  const prossimoNumero = (esistenti?.[0]?.numero || 0) + 1;
  let catalogoId = document.getElementById('nef-catalogo')?.value || null;

  // Se richiesto, salva prima nel catalogo e usa il nuovo id
  if (!catalogoId && salvaNelCatalogo && nome) {
    const { data: nuovaCfe, error: errCfe } = await sb.rpc('imposta_catalogo_fase_extra', {
      p_responsabile_id: currentUserRow.id,
      p_session_token: null,
      p_id: null,
      p_nome: nome,
      p_descrizione: null,
      p_tipo_gestione: tipoGestione,
      p_e_attesa_esterna: false,
      p_attiva: true,
      p_piu_pressate: tipoGestione === 'standard' && document.getElementById('nef-piu-pressate').checked,
      ...(tipoGestione === 'standard' && document.getElementById('nef-piu-pressate').checked ? { p_pressate_previste: pressateNumeroValido(document.getElementById('nef-pressate-previste').value) } : {})
    });
    if (errCfe || !nuovaCfe?.ok) {
      toast('Errore salvataggio catalogo: ' + (errCfe?.message || nuovaCfe?.errore || ''), 'err');
      return;
    }
    catalogoId = nuovaCfe.id || null;
    catalogoFasiExtra = []; // invalida cache così viene ricaricato alla prossima apertura
  }

  const { data, error } = await sb.rpc('crea_fasi_extra', {
    p_ordine_id: ordineId,
    p_fasi: [{ numero: prossimoNumero, nome, note_responsabile: note, tipo_gestione: tipoGestione, catalogo_fase_extra_id: catalogoId || '', piu_pressate: !catalogoId && tipoGestione === 'standard' && document.getElementById('nef-piu-pressate').checked, pressate_previste: !catalogoId && tipoGestione === 'standard' && document.getElementById('nef-piu-pressate').checked ? pressateNumeroValido(document.getElementById('nef-pressate-previste').value) : null, macchina_id: document.querySelector('#nef-macchina-box select')?.value || null }],
    p_responsabile_id: currentUserRow.id
  });
  if (error || !data?.ok) { toast('Errore: ' + (error?.message || messaggioFasiExtra(data?.errore)), 'err'); return; }
  toast(`Fase "${nome}" aggiunta`, 'ok');
  document.getElementById('mod-aggiungi-fase-form').style.display = 'none';
  await caricaFasiExtraModal(ordineId);
}
