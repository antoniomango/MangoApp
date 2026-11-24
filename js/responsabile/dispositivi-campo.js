// responsabile.html — Dispositivi di campo (manipolatore e simili): elenco, configurazione, codice del dispositivo, log eventi.
// Script classico: stesso ambito globale della pagina; caricato dopo macchine.js (ordine in strumenti/moduli-responsabile.txt).
// Il codice del dispositivo compare solo in una finestra temporanea: mai in localStorage, sessionStorage, IndexedDB, console o variabili globali.

const DC = { lista: [], silenzio: 30, form: null, evDisp: null, evLimite: 200, evEsito: '', eventi: [], caricato: false, errore: '' };

function dcT() { return Etichette.faseAutomatica.dispositivi; }

async function dcApriSezione() {
  await dcCarica();
  dcRender();
}

async function dcCarica() {
  DC.errore = '';
  const [{ data: lista, error: e1 }, { data: kpi }] = await Promise.all([
    sb.rpc('dispositivi_campo_lista', { p_responsabile_id: currentUserRow.id, p_session_token: null }),
    sb.from('kpi_config').select('valore, default_valore').eq('chiave', 'dispositivo_avviso_silenzio_minuti').maybeSingle(),
  ]);
  if (e1 || !lista?.ok) { DC.errore = (dcT().errori[lista?.errore] || lista?.errore || e1?.message || 'Elenco non disponibile'); DC.lista = []; }
  else DC.lista = lista.dispositivi || [];
  DC.silenzio = kpi ? Number(kpi.valore ?? kpi.default_valore) || 30 : 30;
  DC.caricato = true;
  if (DC.evDisp && !DC.lista.some(d => d.id === DC.evDisp)) { DC.evDisp = null; DC.eventi = []; }
}

// "3 min fa", "2 h fa", "mai"
function dcFa(iso) {
  if (!iso) return dcT().mai;
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'adesso';
  if (min < 60) return min + ' min fa';
  if (min < 48 * 60) return Math.round(min / 60) + ' h fa';
  return Math.round(min / 1440) + ' giorni fa';
}
function dcSilenzioso(d) {
  if (!d.attivo) return false;
  if (!d.ultimo_contatto_il) return true;
  return (Date.now() - new Date(d.ultimo_contatto_il).getTime()) / 60000 > DC.silenzio;
}
function dcDataOra(iso) { return iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'; }

function dcRender() {
  const el = document.getElementById('dc-contenuto'); if (!el) return;
  const T = dcT();
  if (DC.errore) { el.innerHTML = `<div class="empty-state"><p>${escapeHtml(DC.errore)}</p></div>`; return; }
  const righe = DC.lista.map(d => {
    const sil = dcSilenzioso(d);
    const fin = d.finestra_aperta ? `${escapeHtml(T.finestra)}: <strong>${escapeHtml(d.finestra_aperta.codice_ordine || '—')}</strong> · ${escapeHtml(d.finestra_aperta.nome_fase || '')}` : escapeHtml(T.nessunaFinestra);
    const fasi = (d.fasi || []).map(f => escapeHtml(f.nome)).join(', ');
    return `<div class="fs-card" style="margin-bottom:12px;padding:14px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <strong style="font-size:16px">${escapeHtml(d.nome)}</strong>
        <span class="fs-tag ${d.attivo ? 'fs-tag-cnc' : 'fs-tag-opz'}">${escapeHtml(d.attivo ? T.attivo : T.disattivo)}</span>
        <span class="fs-desc" style="margin:0">${escapeHtml(d.tipo || '')}</span>
      </div>
      ${sil ? `<div class="fs-avviso warn" style="margin:8px 0">▲<span>${escapeHtml(d.ultimo_contatto_il ? T.silenzio(DC.silenzio) : T.silenzio(DC.silenzio) + ' (' + T.mai + ')')}</span></div>` : ''}
      <div class="fs-desc" style="margin:8px 0 0">${escapeHtml(T.contatto)}: <strong>${escapeHtml(dcFa(d.ultimo_contatto_il))}</strong> · ${escapeHtml(T.contatore)}: <strong>${d.ultimo_contatore == null ? '—' : escapeHtml(String(d.ultimo_contatore))}</strong></div>
      <div class="fs-desc" style="margin:4px 0 0">${fin}</div>
      ${fasi ? `<div class="fs-desc" style="margin:4px 0 0">${escapeHtml(Etichette.faseAutomatica.tag)}: ${fasi}</div>` : ''}
      <div class="fs-desc" style="margin:4px 0 0">${d.token_presente ? escapeHtml(T.codicePresente) + escapeHtml(dcDataOra(d.token_creato_il)) : escapeHtml(T.codiceAssente)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn btn-secondary" onclick="dcModifica('${escapeJsAttr(d.id)}')">${escapeHtml(T.modifica)}</button>
        <button class="btn btn-secondary" onclick="dcGeneraCodice('${escapeJsAttr(d.id)}')">${escapeHtml(T.generaCodice)}</button>
        <button class="btn btn-secondary" onclick="dcApriEventi('${escapeJsAttr(d.id)}')">${escapeHtml(T.log)}</button>
      </div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="fs-desc" style="margin:0 0 12px">${escapeHtml(T.spiega)}</div>
    <div style="margin-bottom:12px"><button class="btn btn-primary" onclick="dcNuovo()">+ ${escapeHtml(T.nuovo)}</button> <button class="btn btn-secondary" onclick="dcApriSezione()">Aggiorna</button></div>
    ${DC.form ? dcFormHtml() : ''}
    ${righe || `<div class="empty-state"><p>${escapeHtml(T.nessuno)}</p></div>`}
    ${DC.evDisp ? dcEventiHtml() : ''}`;
}

function dcFormHtml() {
  const T = dcT(), f = DC.form;
  return `<div class="fs-card" style="margin-bottom:14px;padding:14px">
    <div class="fs-row"><label class="fs-lbl" for="dc-f-nome">${escapeHtml(T.nome)}</label><input class="fs-inp" id="dc-f-nome" maxlength="60" value="${escapeHtml(f.nome)}" oninput="DC.form.nome=this.value"></div>
    <div class="fs-row fs-two">
      <div><label class="fs-lbl" for="dc-f-tol">${escapeHtml(T.tolleranza)}</label><input class="fs-inp num" id="dc-f-tol" type="number" min="0" max="120" step="1" value="${escapeHtml(String(f.tolleranza_secondi))}" oninput="DC.form.tolleranza_secondi=this.value" style="width:110px"></div>
      <div><label class="fs-lbl" for="dc-f-soglia">${escapeHtml(T.soglia)}</label><input class="fs-inp num" id="dc-f-soglia" type="number" min="1" max="100000" step="1" value="${escapeHtml(String(f.soglia_azzeramento))}" oninput="DC.form.soglia_azzeramento=this.value" style="width:110px"><div class="fs-desc">${escapeHtml(T.soglia2)}</div></div>
    </div>
    <div class="fs-row inline"><div><div class="fs-crit-t">${escapeHtml(T.attivo)}</div></div>${fsSwitch('dc-f-attivo', f.attivo, 'DC.form.attivo=this.checked')}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-primary" onclick="dcSalva()">${escapeHtml(T.salva)}</button><button class="btn btn-secondary" onclick="DC.form=null;dcRender()">${escapeHtml(T.annulla)}</button></div>
  </div>`;
}
function dcNuovo() { DC.form = { id: null, nome: '', attivo: true, tolleranza_secondi: 30, soglia_azzeramento: 10 }; dcRender(); document.getElementById('dc-f-nome')?.focus(); }
function dcModifica(id) {
  const d = DC.lista.find(x => x.id === id); if (!d) return;
  DC.form = { id: d.id, nome: d.nome, attivo: !!d.attivo, tolleranza_secondi: d.tolleranza_secondi, soglia_azzeramento: d.soglia_azzeramento };
  dcRender(); document.getElementById('dc-f-nome')?.focus();
}
async function dcSalva() {
  const f = DC.form; if (!f) return;
  const nome = (f.nome || '').trim();
  if (!nome) { toast(dcT().errori.nome_obbligatorio, 'err'); return; }
  const dati = { nome, attivo: !!f.attivo, tolleranza_secondi: Number(f.tolleranza_secondi), soglia_azzeramento: Number(f.soglia_azzeramento) };
  if (f.id) dati.id = f.id;
  const { data, error } = await sb.rpc('dispositivo_campo_salva', { p_dati: dati, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Salvataggio NON riuscito: ' + (dcT().errori[data?.errore] || data?.errore || error?.message || 'errore'), 'err'); return; }
  DC.form = null;
  toast('Dispositivo salvato', 'ok');
  await dcApriSezione();
  if (typeof fsCaricaDati === 'function' && document.getElementById('sec-fasi-config')?.classList.contains('active')) fsCaricaDati().then(fsRender);
}

// ── codice del dispositivo ─────────────────────────────────────────────────────────────────────────────────
async function dcGeneraCodice(id) {
  const d = DC.lista.find(x => x.id === id); if (!d) return;
  if (!confirm(`${d.nome}\n\n${dcT().generaConferma}`)) return;
  const { data, error } = await sb.rpc('dispositivo_campo_genera_token', { p_dispositivo_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok || !data.token) { toast('Codice NON generato: ' + (dcT().errori[data?.errore] || data?.errore || error?.message || 'errore'), 'err'); return; }
  dcMostraCodice(d.nome, data.token);   // il codice vive solo nella finestra e nella sua chiusura
  dcCarica().then(dcRender);
}
function dcMostraCodice(nome, codice) {
  const T = dcT();
  const ov = document.createElement('div');
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML = `<div style="background:var(--surface,#fff);color:var(--ink);border-radius:14px;padding:20px;max-width:520px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.35)">
      <h3 style="margin:0 0 6px">${escapeHtml(T.codiceTitolo)}</h3><div class="fs-desc" style="margin:0 0 10px">${escapeHtml(nome)}</div>
      <input class="fs-inp" readonly style="width:100%;font-family:var(--font-mono);font-size:13px" aria-label="${escapeHtml(T.codiceTitolo)}">
      <div class="fs-avviso warn" style="margin:10px 0">▲<span>${escapeHtml(T.codiceAvviso)}</span></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-secondary" data-dc-copia>${escapeHtml(T.copia)}</button><button type="button" class="btn btn-primary" data-dc-chiudi>${escapeHtml(T.chiudi)}</button></div>
    </div>`;
  const inp = ov.querySelector('input'); inp.value = codice;
  const chiudi = () => { inp.value = ''; ov.remove(); };
  ov.querySelector('[data-dc-chiudi]').onclick = chiudi;
  ov.querySelector('[data-dc-copia]').onclick = async () => {
    try { await navigator.clipboard.writeText(inp.value); toast(T.copiato, 'ok'); }
    catch (e) { inp.select(); try { document.execCommand('copy'); toast(T.copiato, 'ok'); } catch (e2) { toast('Copia non riuscita: seleziona il codice e copialo a mano', 'err'); } }
  };
  document.body.appendChild(ov);
  inp.focus(); inp.select();
}

// ── log eventi ─────────────────────────────────────────────────────────────────────────────────────────────
async function dcApriEventi(id) { DC.evDisp = id; await dcCaricaEventi(); }
async function dcCaricaEventi() {
  if (!DC.evDisp) return;
  const { data, error } = await sb.rpc('dispositivo_campo_eventi', { p_dispositivo_id: DC.evDisp, p_limite: DC.evLimite, p_esito: DC.evEsito || null, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Eventi non caricati: ' + (data?.errore || error?.message || 'errore'), 'err'); DC.eventi = []; }
  else DC.eventi = data.eventi || [];
  dcRender();
  document.getElementById('dc-eventi')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function dcEventiHtml() {
  const T = dcT(), d = DC.lista.find(x => x.id === DC.evDisp);
  const C = T.colonne;
  return `<div class="fs-card" id="dc-eventi" style="margin-top:14px;padding:14px">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <strong>${escapeHtml(T.log)}${d ? ' · ' + escapeHtml(d.nome) : ''}</strong>
      <label class="fs-desc" style="margin:0">${escapeHtml(T.logQuanti)} <select class="fs-inp" onchange="DC.evLimite=Number(this.value);dcCaricaEventi()">${[50, 200, 500].map(n => `<option value="${n}" ${n === DC.evLimite ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="fs-desc" style="margin:0">${escapeHtml(T.logEsito)} <select class="fs-inp" onchange="DC.evEsito=this.value;dcCaricaEventi()"><option value="">${escapeHtml(T.logTutti)}</option>${Object.entries(T.esiti).map(([k, v]) => `<option value="${escapeHtml(k)}" ${k === DC.evEsito ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select></label>
      <button class="btn btn-secondary" onclick="DC.evDisp=null;DC.eventi=[];dcRender()">${escapeHtml(T.chiudi)}</button>
    </div>
    ${DC.eventi.length ? `<div style="overflow-x:auto"><table class="fs-tempi-tab" style="width:100%"><thead><tr><th>${escapeHtml(C.quando)}</th><th>${escapeHtml(C.contatore)}</th><th>${escapeHtml(C.carico)}</th><th>${escapeHtml(C.esito)}</th><th>${escapeHtml(C.ordine)}</th><th>${escapeHtml(C.fase)}</th></tr></thead><tbody>
      ${DC.eventi.map(e => `<tr><td>${escapeHtml(dcDataOra(e.ricevuto_il))}</td><td class="v">${e.contatore == null ? '—' : escapeHtml(String(e.contatore))}</td><td class="v">${e.carico_kg == null ? '—' : escapeHtml(String(e.carico_kg))}</td><td>${escapeHtml(T.esiti[e.esito] || e.esito || '')}</td><td>${escapeHtml(e.codice_ordine || '—')}</td><td>${escapeHtml(e.nome_fase || '—')}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="fs-desc">${escapeHtml(T.logVuoto)}</div>`}
  </div>`;
}
