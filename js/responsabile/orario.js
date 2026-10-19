// responsabile.html — orario di lavoro, straordinari, chiusure aziendali.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

let orarioConfig = null;   // solo per la schermata Orario Lavoro: il calendario vero (giorni lavorativi, minuti, oggi) è in Calendario

async function loadOrarioConfig() {
  const { data } = await sb.from('config_orario').select('*').single();
  orarioConfig = data;
}

// Minuti netti di una fascia (inizio, fine, pausa): il riepilogo mostra solo ciò che viene digitato; il calcolo vero è nel server
function _minutiFascia(inizio, fine, pausa) {
  if (!inizio || !fine) return 0;
  const [h1, m1] = inizio.split(':').map(Number);
  const [h2, m2] = fine.split(':').map(Number);
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1) - (pausa || 0));
}

function aggiornaRiepilogoOrario() {
  const pausa = document.getElementById('or-pausa').checked;
  const minPausa = pausa ? (numeroOLiteral(document.getElementById('or-minuti-pausa').value) ?? 0) : 0;
  const sabato = document.getElementById('or-sabato').checked;
  const domenica = document.getElementById('or-domenica').checked;
  const minGiorno = _minutiFascia(document.getElementById('or-inizio').value, document.getElementById('or-fine').value, minPausa);
  const minSabato = sabato ? _minutiFascia(document.getElementById('or-inizio-sabato').value, document.getElementById('or-fine-sabato').value, numeroOLiteral(document.getElementById('or-pausa-sabato').value) ?? 0) : 0;
  const minDomenica = domenica ? _minutiFascia(document.getElementById('or-inizio-domenica').value, document.getElementById('or-fine-domenica').value, numeroOLiteral(document.getElementById('or-pausa-domenica').value) ?? 0) : 0;

  const fmtOre = min => {
    const hh = Math.floor(min / 60), mm = Math.round(min % 60);
    return mm > 0 ? `${hh}h ${mm}min` : `${hh}h`;
  };
  const cella = (titolo, valore, extra = '') => `<div><div style="color:var(--muted);font-size:11px;margin-bottom:2px">${titolo}</div><div style="font-weight:700;font-size:16px;${extra}">${valore}</div></div>`;
  let html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">`;
  html += cella('Ore nette / giorno (lun–ven)', fmtOre(minGiorno));
  if (pausa) html += cella('Di cui pausa', `${minPausa} min`);
  if (sabato) html += cella('Sabato', fmtOre(minSabato));
  if (domenica) html += cella('Domenica', fmtOre(minDomenica));
  html += cella('Totale settimana', fmtOre(minGiorno * 5 + minSabato + minDomenica), 'color:var(--accent)');
  html += `</div>`;
  document.getElementById('or-riepilogo').innerHTML = html;
}

function renderOrarioConfig() {
  if (!orarioConfig) return;
  const hm = v => (v || '').slice(0, 5);
  document.getElementById('or-inizio').value = hm(orarioConfig.ora_inizio);
  document.getElementById('or-fine').value = hm(orarioConfig.ora_fine);
  const pausa = orarioConfig.pausa_attiva ?? true;
  document.getElementById('or-pausa').checked = pausa;
  document.getElementById('or-minuti-pausa').value = orarioConfig.pausa_minuti ?? 0;   // ?? e non ||: 0 resta 0
  document.getElementById('or-pausa-hint').style.display = pausa ? '' : 'none';
  document.getElementById('or-sabato').checked = orarioConfig.sabato_lavorativo;
  document.getElementById('or-inizio-sabato').value = hm(orarioConfig.ora_inizio_sabato);
  document.getElementById('or-fine-sabato').value = hm(orarioConfig.ora_fine_sabato);
  document.getElementById('or-pausa-sabato').value = orarioConfig.pausa_sabato_minuti ?? 0;
  document.getElementById('or-sabato-ore-row').style.display = orarioConfig.sabato_lavorativo ? 'grid' : 'none';
  document.getElementById('or-domenica').checked = orarioConfig.domenica_lavorativa;
  document.getElementById('or-inizio-domenica').value = hm(orarioConfig.ora_inizio_domenica);
  document.getElementById('or-fine-domenica').value = hm(orarioConfig.ora_fine_domenica);
  document.getElementById('or-pausa-domenica').value = orarioConfig.pausa_domenica_minuti ?? 0;
  document.getElementById('or-domenica-ore-row').style.display = orarioConfig.domenica_lavorativa ? 'grid' : 'none';
  aggiornaRiepilogoOrario();
  loadChiusureAziendali();
  loadStraordinari();
}

function toggleOrarioPausa(cb) {
  document.getElementById('or-pausa-hint').style.display = cb.checked ? '' : 'none';
  aggiornaRiepilogoOrario();
}
function toggleOrarioSabato(cb) {
  document.getElementById('or-sabato-ore-row').style.display = cb.checked ? 'grid' : 'none';
  aggiornaRiepilogoOrario();
}
function toggleOrarioDomenica(cb) {
  document.getElementById('or-domenica-ore-row').style.display = cb.checked ? 'grid' : 'none';
  aggiornaRiepilogoOrario();
}

// ── Straordinari per giorni o periodi (tabella straordinari) ──
let _straordinari = [];
let _editStraordinario = null;

async function loadStraordinari() {
  const { data, error } = await sb.from('straordinari').select('id, data_inizio, data_fine, ore_extra, descrizione')
    .gte('data_fine', Calendario.oggiIso()).order('data_inizio').order('id').limit(200);
  const el = document.getElementById('or-straordinari-list');
  if (!el) return;
  if (error) { el.innerHTML = `<span style="color:var(--alert)">${escapeHtml(error.message)}</span>`; return; }
  _straordinari = data || [];
  el.innerHTML = _straordinari.length ? _straordinari.map(s => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <span style="font-size:13px;font-weight:600">${_dIt(s.data_inizio)}${s.data_fine !== s.data_inizio ? ' → ' + _dIt(s.data_fine) : ''}</span>
      <span style="font-size:12px;background:var(--alert-soft);color:var(--alert-ink);padding:2px 8px;border-radius:6px">+${String(Number(s.ore_extra)).replace('.', ',')} h/giorno</span>
      <span style="flex:1;font-size:12px;color:var(--muted)">${escapeHtml(s.descrizione || '')}</span>
      <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="avviaModificaStraordinario('${s.id}')">Modifica</button>
      <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="eliminaStraordinario('${s.id}')" aria-label="Elimina">✕</button>
    </div>`).join('') : 'Nessuno straordinario programmato';
}

function annullaModificaStraordinario() {
  _editStraordinario = null;
  ['or-str-dal', 'or-str-al', 'or-str-ore', 'or-str-desc'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('or-str-form-title').textContent = 'Aggiungi straordinario';
  document.getElementById('or-str-btn-salva').textContent = '+ Aggiungi';
  document.getElementById('or-str-btn-annulla').style.display = 'none';
}

function avviaModificaStraordinario(id) {
  const s = _straordinari.find(x => x.id === id); if (!s) return;
  _editStraordinario = id;
  document.getElementById('or-str-dal').value = s.data_inizio;
  document.getElementById('or-str-al').value = s.data_fine;
  document.getElementById('or-str-ore').value = s.ore_extra;
  document.getElementById('or-str-desc').value = s.descrizione || '';
  document.getElementById('or-str-form-title').textContent = 'Modifica straordinario';
  document.getElementById('or-str-btn-salva').textContent = '✓ Salva modifica';
  document.getElementById('or-str-btn-annulla').style.display = '';
}

async function salvaStraordinario() {
  const dal = document.getElementById('or-str-dal').value, al = document.getElementById('or-str-al').value || dal;
  const ore = numeroOLiteral(document.getElementById('or-str-ore').value);
  if (!dal || ore === null || ore <= 0) { toast('Indica il giorno (o il periodo) e le ore extra per giorno', 'err'); return; }
  const { data, error } = await sb.rpc('imposta_straordinario', { p_id: _editStraordinario, p_data_inizio: dal, p_data_fine: al, p_ore_extra: ore,
    p_descrizione: document.getElementById('or-str-desc').value, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) {
    const msg = { periodo_sovrapposto: 'Il periodo si sovrappone a un altro straordinario', date_non_valide: 'Date non valide', ore_extra_non_valide: 'Ore extra non valide (da 0 a 12)' }[data?.errore];
    toast(msg || 'Errore: ' + (data?.errore || error?.message || ''), 'err'); return;
  }
  annullaModificaStraordinario();
  await Promise.all([loadStraordinari(), Calendario.carica(sb, currentUserRow.id, null)]);
  toast('Straordinario salvato', 'ok');
}

async function eliminaStraordinario(id) {
  if (!confirm('Eliminare questo straordinario?')) return;
  const { data, error } = await sb.rpc('elimina_straordinario', { p_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await Promise.all([loadStraordinari(), Calendario.carica(sb, currentUserRow.id, null)]);
  toast('Straordinario eliminato', 'ok');
}

// Numero da un campo di testo: vuoto o non numerico = null (mai un valore di ripiego: 0 resta 0)
// Ore di una giornata tipo dal calendario unico (server): nessun 8 scritto nel codice
const oreGiornoDefault = () => (Calendario.minutiGiorno() || 0) / 60;

function numeroOLiteral(v) {
  const t = String(v ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

async function salvaOrario() {
  // Nessun valore di ripiego: un campo vuoto o non numerico blocca il salvataggio, 0 resta 0; la validazione vera è nel server
  const pausa = numeroOLiteral(document.getElementById('or-minuti-pausa').value);
  const pausaSab = numeroOLiteral(document.getElementById('or-pausa-sabato').value);
  const pausaDom = numeroOLiteral(document.getElementById('or-pausa-domenica').value);
  const orari = ['or-inizio', 'or-fine', 'or-inizio-sabato', 'or-fine-sabato', 'or-inizio-domenica', 'or-fine-domenica'].map(id => document.getElementById(id).value);
  if (pausa === null || pausaSab === null || pausaDom === null || orari.some(v => !v)) {
    toast('Compila tutti i campi con valori validi (0 è ammesso)', 'err'); return;
  }
  const payload = {
    ora_inizio: document.getElementById('or-inizio').value,
    ora_fine: document.getElementById('or-fine').value,
    pausa_attiva: document.getElementById('or-pausa').checked,
    pausa_minuti: pausa,
    sabato_lavorativo: document.getElementById('or-sabato').checked,
    ora_inizio_sabato: document.getElementById('or-inizio-sabato').value,
    ora_fine_sabato: document.getElementById('or-fine-sabato').value,
    pausa_sabato_minuti: pausaSab,
    domenica_lavorativa: document.getElementById('or-domenica').checked,
    ora_inizio_domenica: document.getElementById('or-inizio-domenica').value,
    ora_fine_domenica: document.getElementById('or-fine-domenica').value,
    pausa_domenica_minuti: pausaDom,
  };
  const { data, error } = await sb.rpc('imposta_config_orario', { p_dati: payload, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Salvataggio NON riuscito: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await Promise.all([loadOrarioConfig(), Calendario.carica(sb, currentUserRow.id, null)]);
  toast('Orario salvato', 'ok');
}

// Stato edit mode chiusura: { id }
let _editChiusura = null;

function annullaModificaChiusura() {
  _editChiusura = null;
  document.getElementById('or-chiusura-dal').value = '';
  document.getElementById('or-chiusura-al').value = '';
  document.getElementById('or-chiusura-desc').value = '';
  document.getElementById('or-chiusura-form-title').textContent = 'Aggiungi chiusura';
  document.getElementById('or-chiusura-btn-salva').textContent = '+ Aggiungi';
  document.getElementById('or-chiusura-btn-annulla').style.display = 'none';
}

function avviaModificaChiusura(id, dal, al, desc) {
  _editChiusura = { id };
  document.getElementById('or-chiusura-dal').value = dal;
  document.getElementById('or-chiusura-al').value = al;
  document.getElementById('or-chiusura-desc').value = desc || '';
  document.getElementById('or-chiusura-form-title').textContent = 'Modifica chiusura';
  document.getElementById('or-chiusura-btn-salva').textContent = '✓ Salva modifica';
  document.getElementById('or-chiusura-btn-annulla').style.display = '';
  document.getElementById('or-chiusura-dal').focus();
}

async function loadChiusureAziendali() {
  const oggi = Calendario.oggiIso();
  const { data } = await sb.from('chiusure_aziendali')
    .select('id, data_inizio, data_fine, descrizione')
    .gte('data_fine', oggi)
    .order('data_inizio');

  const el = document.getElementById('or-chiusure-list');
  if (!el) return;

  const chiusure = data || [];
  if (!chiusure.length) {
    el.innerHTML = '<span style="font-size:12px;color:var(--muted);font-style:italic">Nessuna chiusura programmata</span>';
    return;
  }

  el.innerHTML = chiusure.map(c => {
    const range = c.data_inizio === c.data_fine ? formatDate(c.data_inizio) : `${formatDate(c.data_inizio)} – ${formatDate(c.data_fine)}`;
    const desc = c.descrizione ? ` · ${escapeHtml(c.descrizione)}` : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;margin-bottom:6px;font-size:12px">
      <span style="flex:1;font-weight:600">${range}</span><span style="color:var(--muted)">${desc}</span>
      <button style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--ink);font-size:11px;padding:1px 7px" onclick="avviaModificaChiusura('${c.id}','${c.data_inizio}','${c.data_fine}','${escapeJsAttr(c.descrizione || '')}')" title="Modifica">Modifica</button>
      <button style="background:none;border:none;cursor:pointer;color:var(--alert);font-size:13px;padding:0 4px" onclick="eliminaChiusura('${c.id}')" title="Elimina" aria-label="Elimina">✕</button>
    </div>`;
  }).join('');
}

async function aggiungiChiusura() {
  const dal = document.getElementById('or-chiusura-dal').value;
  const al = document.getElementById('or-chiusura-al').value || dal;
  const desc = document.getElementById('or-chiusura-desc').value.trim() || null;

  if (!dal) { toast('Seleziona la data di inizio', 'err'); return; }

  if (_editChiusura) {
    const { data, error } = await sb.rpc('modifica_chiusura_aziendale', {
      p_id:              _editChiusura.id,
      p_data_inizio:     dal,
      p_data_fine:       al,
      p_descrizione:     desc,
      p_responsabile_id: currentUserRow.id,
    });
    if (error || !data?.ok) { toast(data?.errore || error?.message || 'Errore', 'err'); return; }
    toast('Chiusura aggiornata', 'ok');
  } else {
    const { data, error } = await sb.rpc('imposta_chiusura_aziendale', {
      p_data_inizio:     dal,
      p_data_fine:       al,
      p_descrizione:     desc,
      p_responsabile_id: currentUserRow.id,
    });
    if (error || !data?.ok) { toast(data?.errore || error?.message || 'Errore', 'err'); return; }
    toast('Chiusura aggiunta', 'ok');
  }

  annullaModificaChiusura();
  loadChiusureAziendali();
}

async function eliminaChiusura(id) {
  const { data, error } = await sb.rpc('elimina_chiusura_aziendale', {
    p_chiusura_id:     id,
    p_responsabile_id: currentUserRow.id,
  });
  if (error || !data?.ok) { toast(data?.errore || error?.message || 'Errore', 'err'); return; }
  toast('Chiusura eliminata', 'ok');
  annullaModificaChiusura();
  loadChiusureAziendali();
}
