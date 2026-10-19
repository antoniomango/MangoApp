// responsabile.html — sezione Sistema: sicurezza account, link delle viste, job, registro modifiche.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

let _sistema = {};   // chiave -> valore, da config_sistema

async function loadSistemaConfig() {
  const { data } = await sb.from('config_sistema').select('chiave, valore');
  _sistema = Object.fromEntries((data || []).map(r => [r.chiave, r.valore]));
  renderSistemaConfig();
  renderSistemaLink();
  renderSicurezzaAccount();
  loadJobSchedulati();
}

// ── Sicurezza dell'account: verifica a due fattori con l'app di autenticazione ──
async function renderSicurezzaAccount() {
  const el = document.getElementById('sicurezza-account-body');
  if (!el || !currentUserRow) return;
  const [{ data: st }, { data: lf }, { data: aal }] = await Promise.all([
    sb.rpc('mfa_stato', { p_responsabile_id: currentUserRow.id, p_session_token: null }),
    sb.auth.mfa.listFactors(),
    sb.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const verificato = (lf?.totp || []).find(f => f.status === 'verified');
  const conCodice = aal?.currentLevel === 'aal2';
  const richiesta = !!st?.richiesta;
  let corpo;
  if (!verificato) {
    corpo = `<div style="font-size:13px;margin-bottom:10px">Non attiva. Con la verifica a due fattori, oltre alla password serve un codice a 6 cifre generato da un'app sul tuo telefono (Google Authenticator, Microsoft Authenticator, Authy…).</div>
      <button class="btn btn-primary" onclick="mfaAvviaIscrizione()">Attiva la verifica a due fattori</button>
      <div id="mfa-iscrizione" style="margin-top:14px"></div>`;
  } else if (!conCodice) {
    corpo = `<div style="font-size:13px;margin-bottom:10px">Attiva sul tuo account. Per modificare queste impostazioni conferma prima un codice.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input type="text" id="mfa-codice" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Codice a 6 cifre" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit;width:170px"><button class="btn btn-primary" onclick="mfaConfermaSessione()">Conferma codice</button></div>`;
  } else if (!richiesta) {
    corpo = `<div style="font-size:13px;margin-bottom:10px">Attiva sul tuo account, ma <strong>non ancora obbligatoria</strong>: finché non la rendi obbligatoria, chi conosce la password entra anche senza codice.</div>
      <button class="btn btn-ok" onclick="mfaImposta(true)">Rendi obbligatoria</button>`;
  } else {
    corpo = `<div style="font-size:13px;margin-bottom:10px"><strong>Obbligatoria</strong>: senza il codice non si entra e le operazioni da responsabile sono rifiutate.</div>
      <button class="btn btn-secondary" onclick="mfaImposta(false)">Togli l'obbligo</button>`;
  }
  el.innerHTML = '<div style="font-size:13px;font-weight:600;margin-bottom:6px">Verifica a due fattori (account responsabile)</div>' + corpo;
}

async function mfaAvviaIscrizione() {
  const box = document.getElementById('mfa-iscrizione');
  // un tentativo lasciato a metà va tolto prima di iniziarne un altro
  const { data: lf } = await sb.auth.mfa.listFactors();
  for (const f of (lf?.all || []).filter(x => x.factor_type === 'totp' && x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'MangoApp ' + new Date().toISOString().slice(0, 10) });
  if (error || !data) { box.innerHTML = '<div style="color:var(--alert);font-size:13px">Impossibile avviare l\'attivazione. Riprova.</div>'; return; }
  window._mfaFattoreInCorso = data.id;
  box.innerHTML = `<div style="font-size:13px;margin-bottom:8px">1. Apri l'app di autenticazione e scansiona questo codice (oppure inserisci la chiave a mano).</div>
    <img alt="Codice QR per l'app di autenticazione" src="${escapeHtml(data.totp.qr_code)}" style="width:180px;height:180px;background:#fff;padding:6px;border-radius:8px">
    <div style="font-size:12px;margin:8px 0;color:var(--muted)">Chiave: <code style="word-break:break-all">${escapeHtml(data.totp.secret)}</code></div>
    <div style="font-size:13px;margin-bottom:8px">2. Scrivi qui il codice a 6 cifre che mostra l'app.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><input type="text" id="mfa-codice" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Codice a 6 cifre" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit;width:170px"><button class="btn btn-primary" onclick="mfaVerificaIscrizione()">Verifica e attiva</button></div>`;
}
async function mfaVerificaIscrizione() {
  const codice = (document.getElementById('mfa-codice')?.value || '').replace(/\s/g, '');
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: window._mfaFattoreInCorso, code: codice });
  if (error) { toast('Codice non valido: riprova', 'err'); return; }
  toast('Verifica a due fattori attivata. Ora puoi renderla obbligatoria.', 'ok');
  renderSicurezzaAccount();
}
async function mfaConfermaSessione() {
  const codice = (document.getElementById('mfa-codice')?.value || '').replace(/\s/g, '');
  const { data: lf } = await sb.auth.mfa.listFactors();
  const f = (lf?.totp || []).find(x => x.status === 'verified');
  const { error } = f ? await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: codice }) : { error: new Error('nessun fattore') };
  if (error) { toast('Codice non valido: riprova', 'err'); return; }
  renderSicurezzaAccount();
}
async function mfaImposta(attiva) {
  if (attiva && !confirm('Da ora, per entrare servirà la password e il codice dell\'app. Se perdi il telefono senza aver salvato la chiave non potrai più entrare da solo. Confermi?')) return;
  const { data, error } = await sb.rpc('imposta_mfa_responsabile', { p_attiva: attiva, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Operazione non riuscita (' + (data?.errore || error?.message || '') + ')', 'err'); return; }
  toast(attiva ? 'Verifica a due fattori obbligatoria' : 'Obbligo tolto', 'ok');
  renderSicurezzaAccount();
}

function renderSistemaConfig() {
  const el = document.getElementById('sistema-config-body');
  if (!el) return;
  const riga = (titolo, sotto, campo) => `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px"><div style="flex:1;min-width:220px"><div style="font-size:13px;font-weight:600">${titolo}</div><div style="font-size:11px;color:var(--muted);margin-top:3px">${sotto}</div></div>${campo}</div>`;
  const ro = v => `<code style="font-size:12px;word-break:break-all;max-width:320px">${escapeHtml(v || '— non impostato —')}</code>`;
  el.innerHTML =
    riga('Indirizzo dell\'app', 'Usato nei link delle notifiche (sola lettura: si imposta in fase di installazione)', ro(_sistema.app_base_url)) +
    riga('Indirizzo delle funzioni server', 'Usato per le notifiche push (sola lettura: si imposta in fase di installazione)', ro(_sistema.edge_functions_base_url)) +
    riga('Fuso orario dell\'azienda', 'Nome del fuso (es. Europe/Rome): decide "oggi", gli orari di lavoro e i promemoria, indipendentemente dal dispositivo',
      `<input type="text" value="${escapeHtml(_sistema.fuso_orario || '')}" onchange="salvaSistema('fuso_orario', this.value.trim())" style="width:180px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px">`) +
    riga('Fotocamera interna attiva', 'Se attiva l\'app operatore scatta le foto con la fotocamera interna anziché con quella di sistema',
      `<input type="checkbox" ${_sistema.fotocamera_interna_attiva === 'true' ? 'checked' : ''} onchange="salvaSistema('fotocamera_interna_attiva', this.checked ? 'true' : 'false')" style="width:18px;height:18px">`) +
    riga('Versione minima del client', 'I dispositivi con una versione più vecchia devono ricaricare l\'app prima di operazioni delicate (es. mango-v40)',
      `<input type="text" value="${escapeHtml(_sistema.versione_minima_client || '')}" pattern="mango-v[0-9]+" onchange="salvaSistema('versione_minima_client', this.value.trim())" style="width:130px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px">`) +
    riga('Limite database (MB)', 'Dimensione massima prevista del database: alimenta la barra di utilizzo in Archivio',
      `<input type="number" min="1" step="1" value="${escapeHtml(_sistema.limite_db_mb || '')}" onchange="salvaSistema('limite_db_mb', this.value.trim())" style="width:110px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px">`) +
    riga('Notifiche push — ID app', 'Identificativo dell\'app di notifiche (OneSignal); vuoto = notifiche push disattivate',
      `<input type="text" value="${escapeHtml(_sistema.onesignal_app_id || '')}" onchange="salvaSistema('onesignal_app_id', this.value.trim())" style="width:270px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit">`) +
    riga('PIN — tentativi errati consentiti', 'Dopo questo numero di errori nella finestra, l\'accesso si blocca (da 3 a 5)',
      `<input type="number" min="3" max="5" step="1" value="${escapeHtml(_sistema.pin_tentativi_max || '')}" onchange="salvaSistema('pin_tentativi_max', this.value.trim())" style="width:90px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit">`) +
    riga('PIN — finestra dei tentativi (minuti)', 'Intervallo in cui si contano i tentativi errati (da 15 a 120)',
      `<input type="number" min="15" max="120" step="1" value="${escapeHtml(_sistema.pin_finestra_minuti || '')}" onchange="salvaSistema('pin_finestra_minuti', this.value.trim())" style="width:90px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit">`) +
    riga('PIN — primo blocco (minuti)', 'Durata del primo blocco; raddoppia a ogni blocco consecutivo (da 15 a 120)',
      `<input type="number" min="15" max="120" step="1" value="${escapeHtml(_sistema.pin_blocco_base_minuti || '')}" onchange="salvaSistema('pin_blocco_base_minuti', this.value.trim())" style="width:90px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit">`) +
    riga('PIN — blocco massimo (minuti)', 'Tetto alla durata del blocco (da 1440 a 10080)',
      `<input type="number" min="1440" max="10080" step="1" value="${escapeHtml(_sistema.pin_blocco_max_minuti || '')}" onchange="salvaSistema('pin_blocco_max_minuti', this.value.trim())" style="width:90px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit">`) +
    riga('PIN — avviso al responsabile dopo N blocchi', 'Dopo questo numero di blocchi consecutivi il responsabile riceve una notifica (da 1 a 3)',
      `<input type="number" min="1" max="3" step="1" value="${escapeHtml(_sistema.pin_blocchi_alert || '')}" onchange="salvaSistema('pin_blocchi_alert', this.value.trim())" style="width:90px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit">`) +
    riga('Durata della sessione operatore (ore)', 'Dopo questo tempo l\'operatore deve rifare il PIN (da 1 a 24)',
      `<input type="number" min="1" max="24" step="1" value="${escapeHtml(_sistema.sessione_ore || '')}" onchange="salvaSistema('sessione_ore', this.value.trim())" style="width:90px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit">`);
}

// ── Link delle viste (sezione Sistema): indirizzi da configurazione (app_base_url) o dedotti dalla pagina; mai ?env, token o dati riservati ──
let _sistemaLink = [];
function indirizzoBaseApp() {
  const cfg = String(_sistema.app_base_url || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^\s?#]+$/i.test(cfg)) return { base: cfg, dedotto: false };
  return { base: location.origin + location.pathname.replace(/[^\/]*$/, '').replace(/\/+$/, ''), dedotto: true };   // origine + cartella della pagina, senza nome file, query o hash
}
function indirizzoLocale(base) {
  let h = ''; try { h = new URL(base).hostname.toLowerCase(); } catch (e) { return false; }
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '::1' || h === '[::1]' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h);
}
function renderSistemaLink() {
  const el = document.getElementById('sistema-link-body'); if (!el) return;
  const T = Etichette.linkViste, { base, dedotto } = indirizzoBaseApp();
  _sistemaLink = T.viste.map(v => ({ nome: v.nome, url: base + '/' + v.file }));
  const avvisi = [];
  if (indirizzoLocale(base)) avvisi.push(T.avvisoLocale);
  if (!IS_PRODUZIONE) avvisi.push(T.avvisoTest);
  const nota = dedotto ? `<div style="font-size:11px;color:var(--muted);margin-bottom:10px">${escapeHtml(T.avvisoDedotto)}</div>` : '';
  const puoCondividere = typeof navigator.share === 'function';
  const btn = 'btn btn-secondary';
  el.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:4px">${escapeHtml(T.titolo)}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">${escapeHtml(T.sotto)}</div>
    ${avvisi.map(a => `<div role="alert" style="background:var(--warn-soft);color:var(--warn-ink);border:1px solid var(--warn-line);border-radius:10px;padding:10px 12px;font-size:12px;font-weight:600;margin-bottom:10px">${escapeHtml(a)}</div>`).join('')}${nota}
    ${T.viste.map((v, i) => { const u = _sistemaLink[i].url, n = escapeHtml(v.nome); return `<div style="padding:12px 0;border-top:1px solid var(--border)">
      <div style="font-size:13px;font-weight:600">${n}</div>
      <div style="font-size:12px;color:var(--muted);margin:2px 0 8px">${escapeHtml(v.per)} ${escapeHtml(v.accesso)}</div>
      <textarea class="sistema-link-url" readonly rows="2" spellcheck="false" aria-label="${escapeHtml(T.ariaIndirizzo(v.nome))}" onfocus="this.select()" style="width:100%;box-sizing:border-box;resize:none;field-sizing:content;min-height:44px;padding:8px 10px;margin-bottom:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--ink);font-family:var(--font-mono);font-size:12px;word-break:break-all">${escapeHtml(u)}</textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button type="button" class="${btn}" style="width:auto;min-height:44px" onclick="copiaLinkVista(${i})" aria-label="${escapeHtml(T.ariaCopia(v.nome))}"><i data-ic="appunti"></i> ${escapeHtml(T.copia)}</button>
        <a class="${btn}" style="width:auto;min-height:44px;display:inline-flex;align-items:center;gap:6px;text-decoration:none" href="${escapeHtml(u)}" target="_blank" rel="noopener" aria-label="${escapeHtml(T.ariaApri(v.nome))}"><i data-ic="invio"></i> ${escapeHtml(T.apri)}</a>
        ${puoCondividere ? `<button type="button" class="${btn}" style="width:auto;min-height:44px" onclick="condividiLinkVista(${i})" aria-label="${escapeHtml(T.ariaCondividi(v.nome))}"><i data-ic="megafono"></i> ${escapeHtml(T.condividi)}</button>` : ''}
      </div></div>`; }).join('')}
    <div style="border-top:1px solid var(--border);padding-top:12px;font-size:12px;color:var(--muted);line-height:1.5">
      <div>${escapeHtml(T.installa)}</div><div style="margin-top:4px">${escapeHtml(T.approva)}</div><div style="margin-top:4px">${escapeHtml(T.nota)}</div></div>`;
}
async function copiaLinkVista(i) {
  const v = _sistemaLink[i]; if (!v) return;
  const T = Etichette.linkViste;
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(v.url); toast(T.copiato(v.nome), 'ok'); return; } } catch (e) { /* si prova la riserva */ }
  const inp = document.querySelectorAll('#sistema-link-body .sistema-link-url')[i];   // riserva: selezione + execCommand (http, iframe)
  let fatto = false;
  if (inp) { try { inp.focus(); inp.select(); inp.setSelectionRange(0, 9999); fatto = !!document.execCommand('copy'); } catch (e) { fatto = false; } }
  toast(fatto ? T.copiato(v.nome) : T.nonCopiato, fatto ? 'ok' : 'err');
}
async function condividiLinkVista(i) {
  const v = _sistemaLink[i]; if (!v || typeof navigator.share !== 'function') return;
  try { await navigator.share({ title: 'Mango — ' + v.nome, url: v.url }); } catch (e) { /* annullato dall'utente */ }
}

// Job pianificati sul server (sola lettura: gli orari si cambiano solo in installazione, vedi documentazione)
async function loadJobSchedulati() {
  const el = document.getElementById('sistema-job-body');
  if (!el) return;
  const { data, error } = await sb.rpc('elenco_job_schedulati', { p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { el.innerHTML = '<div style="color:var(--muted);font-size:13px">Elenco dei job non disponibile</div>'; return; }
  const esito = e => e === 'succeeded' ? 'ok' : (e || '—');
  el.innerHTML = '<div style="font-size:13px;font-weight:600;margin-bottom:4px">Attività pianificate sul server</div>' +
    '<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Sola lettura: gli orari (formato cron, in UTC) si impostano in fase di installazione. Gli intervalli di conservazione dei dati si cambiano nelle Soglie.</div>' +
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="text-align:left;color:var(--muted);font-size:11px"><th style="padding:4px 6px">Attività</th><th style="padding:4px 6px">Orario (cron)</th><th style="padding:4px 6px">Attiva</th><th style="padding:4px 6px">Ultimo esito</th></tr></thead><tbody>' +
    data.job.map(j => '<tr style="border-top:1px solid var(--border)"><td style="padding:5px 6px">' + escapeHtml(j.nome) + '</td><td style="padding:5px 6px"><code>' + escapeHtml(j.schedule) + '</code></td><td style="padding:5px 6px">' + (j.attivo ? 'sì' : 'no') + '</td><td style="padding:5px 6px">' + escapeHtml(esito(j.ultimo_esito)) + '</td></tr>').join('') +
    '</tbody></table></div>';
}

async function salvaSistema(chiave, valore) {
  const { data, error } = await sb.rpc('imposta_config_sistema', { p_chiave: chiave, p_valore: valore, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) toast('Salvataggio NON riuscito: ' + (data?.errore || error?.message || ''), 'err');
  else toast('Impostazione salvata', 'ok');
  await loadSistemaConfig();
}

const REGISTRO_PAGINA = 100;
let _registroRighe = [];

async function loadRegistroModifiche(reset) {
  const body = document.getElementById('registro-config-body');
  if (!body) return;
  if (reset) _registroRighe = [];
  let q = sb.from('config_modifiche').select('id, tabella, chiave_riga, azione, valori_prima, valori_dopo, utente_id, creato_il')
    .order('id', { ascending: false }).range(_registroRighe.length, _registroRighe.length + REGISTRO_PAGINA - 1);
  const tab = document.getElementById('reg-tabella')?.value, dal = document.getElementById('reg-dal')?.value, al = document.getElementById('reg-al')?.value;
  if (tab) q = q.eq('tabella', tab);
  if (dal) q = q.gte('creato_il', dal + 'T00:00:00');
  if (al) q = q.lte('creato_il', al + 'T23:59:59');
  const { data, error } = await q;
  if (error) { body.innerHTML = `<div style="color:var(--alert)">${escapeHtml(error.message)}</div>`; return; }
  _registroRighe = _registroRighe.concat(data || []);
  const sel = document.getElementById('reg-tabella');
  if (sel && sel.options.length <= 1) {
    const { data: tabelle } = await sb.from('config_modifiche').select('tabella').order('id', { ascending: false }).limit(1000);
    [...new Set((tabelle || []).map(r => r.tabella))].sort().forEach(t => sel.add(new Option(t, t)));
  }
  const ids = [...new Set(_registroRighe.map(r => r.utente_id).filter(Boolean))];
  const { data: utenti } = ids.length ? await sb.from('users').select('id, nome, cognome').in('id', ids) : { data: [] };
  const nome = id => { const u = (utenti || []).find(x => x.id === id); return u ? `${u.nome} ${u.cognome}` : '—'; };
  const compatto = v => v == null ? '—' : escapeHtml(JSON.stringify(v)).slice(0, 400);
  body.innerHTML = _registroRighe.length ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase"><th style="padding:6px">Quando</th><th style="padding:6px">Chi</th><th style="padding:6px">Tabella</th><th style="padding:6px">Azione</th><th style="padding:6px">Prima</th><th style="padding:6px">Dopo</th></tr></thead><tbody>${
    _registroRighe.map(r => `<tr style="border-top:1px solid var(--border);vertical-align:top"><td style="padding:6px;white-space:nowrap">${new Date(r.creato_il).toLocaleString('it-IT')}</td><td style="padding:6px">${escapeHtml(nome(r.utente_id))}</td><td style="padding:6px">${escapeHtml(r.tabella)}${r.chiave_riga ? `<div style="color:var(--muted);font-size:11px">${escapeHtml(r.chiave_riga)}</div>` : ''}</td><td style="padding:6px">${escapeHtml(r.azione)}</td><td style="padding:6px;font-family:var(--font-mono);font-size:11px;max-width:260px;word-break:break-all">${compatto(r.valori_prima)}</td><td style="padding:6px;font-family:var(--font-mono);font-size:11px;max-width:260px;word-break:break-all">${compatto(r.valori_dopo)}</td></tr>`).join('')}</tbody></table></div>` : '<span style="color:var(--muted)">Nessuna modifica registrata.</span>';
  const altre = document.getElementById('reg-altre');
  if (altre) altre.style.display = (data || []).length === REGISTRO_PAGINA ? '' : 'none';
}
