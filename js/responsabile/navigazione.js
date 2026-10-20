// responsabile.html — Navigazione: menu a gruppi, barra laterale compatta, barra mobile, cambio sezione
// Script classico: stesso ambito globale della pagina; caricato prima di avvio.js

// ═══════════════════════════════════════════════
// NAVIGAZIONE
// ═══════════════════════════════════════════════
// ── Menu a tendina: gruppi e sottogruppi (data-gruppo), stato ricordato per dispositivo ──
const NAV_STATO_CHIAVE = 'mangoapp-responsabile-menu';
let _navStato = (() => {
  try { const s = JSON.parse(localStorage.getItem(NAV_STATO_CHIAVE) || 'null'); if (s && typeof s === 'object') return s; } catch (e) { /* storage non disponibile */ }
  return { produzione: true };   // primo accesso: Produzione aperta, gli altri chiusi
})();
function navSalvaStato() { try { localStorage.setItem(NAV_STATO_CHIAVE, JSON.stringify(_navStato)); } catch (e) { /* storage non disponibile */ } }
function navImposta(id, aperto, salva = true) {
  const g = document.querySelector(`.nav-gruppo[data-gruppo="${id}"]`);
  if (!g) return;
  g.classList.toggle('aperto', !!aperto);
  g.querySelector(':scope > .nav-gruppo-testa')?.setAttribute('aria-expanded', aperto ? 'true' : 'false');
  _navStato[id] = !!aperto;
  if (salva) navSalvaStato();
}
function navToggle(id) { navImposta(id, !_navStato[id]); }
function navInizializza() { document.querySelectorAll('.nav-gruppo').forEach(g => navImposta(g.dataset.gruppo, !!_navStato[g.dataset.gruppo], false)); }
// Apre il gruppo e il sottogruppo della pagina corrente
function navApriPerSezione(name) {
  let g = document.getElementById('nav-' + name)?.closest('.nav-gruppo');
  while (g) { navImposta(g.dataset.gruppo, true); g = g.parentElement?.closest('.nav-gruppo'); }
}
document.addEventListener('keydown', e => {   // voci del menu da tastiera
  if ((e.key === 'Enter' || e.key === ' ') && e.target?.classList?.contains('nav-item')) { e.preventDefault(); e.target.click(); }
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', navInizializza); else navInizializza();


// ── Barra laterale a scomparsa: stato per utente in localStorage (best effort), classe su <html> già applicata dallo script in <head> ──
const NAV_COMPATTA_CHIAVE = 'mangoapp-responsabile-nav-compatta';
const NAV_ULTIMO_UTENTE = 'mangoapp-responsabile-ultimo-utente';
let _navUtente = null, _navSopraTimer = null;
const navCompattaChiave = () => NAV_COMPATTA_CHIAVE + (_navUtente ? ':' + _navUtente : '');
function navCompattaLeggi() { try { return localStorage.getItem(navCompattaChiave()) === '1'; } catch (e) { return false; } }
function navCompattaImposta(compatta, salva = true) {
  document.documentElement.classList.toggle('nav-compatta', !!compatta);
  const b = document.getElementById('nav-compatta-btn');
  if (b) {
    const t = compatta ? 'Espandi la barra laterale ( [ )' : 'Riduci la barra laterale ( [ )';
    b.setAttribute('aria-expanded', compatta ? 'false' : 'true'); b.title = t; b.setAttribute('aria-label', compatta ? 'Espandi la barra laterale' : 'Riduci la barra laterale');
    const tx = b.querySelector('.nav-compatta-testo'); if (tx) tx.textContent = compatta ? 'Espandi barra' : 'Riduci barra';
  }
  document.querySelectorAll('#menu-laterale .nav-item').forEach(i => {   // in compatta il nome sta nel tooltip e in aria-label
    if (compatta) { const t = [...i.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim(); if (t) { i.title = t; i.setAttribute('aria-label', t); } }
    else { i.removeAttribute('title'); i.removeAttribute('aria-label'); }
  });
  if (!compatta) navSopra(false);
  if (salva) { try { localStorage.setItem(navCompattaChiave(), compatta ? '1' : '0'); } catch (e) { /* storage non disponibile */ } }
}
function navCompattaToggle() { navCompattaImposta(!document.documentElement.classList.contains('nav-compatta')); }
function navAssociaUtente(userId) {   // dopo l'accesso: la preferenza è quella dell'utente
  _navUtente = userId || null;
  try { if (userId) localStorage.setItem(NAV_ULTIMO_UTENTE, userId); } catch (e) { /* storage non disponibile */ }
  navCompattaImposta(navCompattaLeggi(), false);
}
function navSopra(si) { document.getElementById('menu-laterale')?.classList.toggle('nav-sopra', !!si); }
(function navCompattaEventi() {
  const nav = document.getElementById('menu-laterale'); if (!nav) return;
  const compatta = () => document.documentElement.classList.contains('nav-compatta') && window.innerWidth > 820;
  const puoHover = () => { try { return window.matchMedia('(hover: hover)').matches; } catch (e) { return false; } };
  nav.addEventListener('mouseenter', () => { if (!compatta() || !puoHover()) return; clearTimeout(_navSopraTimer); _navSopraTimer = setTimeout(() => navSopra(true), 180); });
  nav.addEventListener('mouseleave', () => { clearTimeout(_navSopraTimer); navSopra(false); });
  nav.addEventListener('focusin', () => { if (compatta()) navSopra(true); });
  nav.addEventListener('focusout', e => { if (!nav.contains(e.relatedTarget) && !nav.matches(':hover')) navSopra(false); });
  document.addEventListener('keydown', e => {   // scorciatoia "[": non quando si scrive in un campo
    if (e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey || window.innerWidth <= 820) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault(); navCompattaToggle();
  });
  navCompattaImposta(document.documentElement.classList.contains('nav-compatta'), false);   // allinea pulsante e tooltip alla classe già applicata dallo script in <head>
})();

// ── Telefono: barra in basso e pannello "Altro" (il menu laterale) ──
function _barraAttiva(voce) {
  const chiave = voce === 'dashboard' || voce === 'ordini' || voce === 'operatori' || voce === 'notifiche' ? voce : 'altro';
  document.querySelectorAll('.barra-mobile [data-barra]').forEach(b => b.classList.toggle('attiva', b.dataset.barra === chiave));
}
function barraVai(voce) {
  if (voce === 'ordini') {
    showSection('dashboard');
    _barraAttiva('ordini');
    document.getElementById('ordini-elenco')?.scrollIntoView({ block: 'start' });
    return;
  }
  showSection(voce);
  window.scrollTo(0, 0);
}
function apriAltro() {
  const aperto = !document.body.classList.contains('altro-aperto');
  document.body.classList.toggle('altro-aperto', aperto);
  document.querySelector('.barra-mobile [data-barra="altro"]')?.setAttribute('aria-expanded', aperto ? 'true' : 'false');
}
function chiudiAltro() {
  document.body.classList.remove('altro-aperto');
  document.querySelector('.barra-mobile [data-barra="altro"]')?.setAttribute('aria-expanded', 'false');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('altro-aperto')) chiudiAltro(); });
// Schede della pagina Tipi prodotto: "Tipi prodotto" | "Lati dell'anta"
function tipiScheda(v) {
  if (v !== 'lati') v = 'tipi';
  _selezionaTab(['tipi', 'lati'], v, x => 'tp-tab-' + x, x => 'tp-pan-' + x);
  const nuovo = document.getElementById('tp-nuovo-btn'); if (nuovo) nuovo.hidden = v === 'lati';
  const sub = document.getElementById('tp-sub');
  if (sub) sub.textContent = v === 'lati' ? "Lati dell'anta: etichette configurabili" : 'Gestisci i tipi di prodotto disponibili — si aggiornano ovunque in automatico';
  if (v === 'lati') loadLatiConfig().then(renderLatiConfig);
}

function showSection(name) {
  if (!fsPuoUscire(name) || !fmPuoUscire(name)) return;   // modifiche non salvate in Fasi: barra di scelta nell'intestazione del dettaglio
  // Alias storici: Richieste e Assenze squadra sono ora schede della sezione Operatori
  if (name === 'richieste' || name === 'assenze') { _opsScheda = name; _opsSalvaScheda(name); name = 'operatori'; }
  chiudiAltro();
  _barraAttiva(name);
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  // Alias: la vecchia sezione "Lati dell'anta" è ora una scheda di Tipi prodotto
  const _vaiLati = name === 'lati-config';
  if (_vaiLati) name = 'tipi-prodotto-config';
  document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
  document.getElementById('sec-' + name)?.classList.add('active');
  const _voce = document.getElementById('nav-' + name);
  if (_voce) { _voce.classList.add('active'); _voce.setAttribute('aria-current', 'page'); }
  navApriPerSezione(name);

  if (name === 'dashboard') renderDashboard();
  else if (name === 'ordini') renderOrdiniTable();
  else if (name === 'operatori') { operatoriScheda(_opsScheda); }
  else if (name === 'archivio') { renderArchivioTable(); loadDimensioneDatabase(); }
  else if (name === 'notifiche') renderNotifiche();
  else if (name === 'fasi-config') fsApriSezione();
  else if (name === 'orario-config') renderOrarioConfig();
  else if (name === 'macro-config') renderMacroConfig();
  else if (name === 'ufficio') loadUfficio();
  else if (name === 'kpi') loadKpi();
  else if (name === 'kpi-config') loadKpiConfig();
  else if (name === 'pianificazione') {
    const sel = document.getElementById('piano-data-sel');
    if (sel && !sel.value) sel.value = Calendario.oggiIso();
    caricaDisponibilitaPanel();
    renderPianificazione();
  }
  else if (name === 'tipi-prodotto-config') { renderTipiProdottoConfig(); tipiScheda(_vaiLati ? 'lati' : 'tipi'); }
  else if (name === 'strutture-config') renderAttributoConfig('struttura');
  else if (name === 'materiali-config') renderAttributoConfig('materiale');
  else if (name === 'priorita-config') renderPrioritaConfig();
  else if (name === 'oggi') loadOggiResp();
  else if (name === 'piano-config') loadPianoConfig();
  else if (name === 'macchine-config') fmApriSezione();
  else if (name === 'fasi-extra-config') { loadCatalogoFasiExtra(); }
  else if (name === 'notif-config') { loadNotifDestinatari(); }
  else if (name === 'sistema-config') { loadSistemaConfig(); }
  else if (name === 'attributi-config') { loadAttributiConfig().then(renderAttributiConfig); }
  else if (name === 'registro-config') { loadRegistroModifiche(true); }
  else if (name === 'lavorazioni-cnc-config') { loadLavorazioniCnc().then(renderLavorazioniCncConfig); }
  else if (name === 'tempi-rif-config') { loadTempiRiferimento(); }
  else if (name === 'campi-profilo-config') { loadCampiProfilo(); }
  else if (name === 'tipi-richiesta-config') { loadTipiRichiesta(); }
}















// ─────────────────────────────────────────────────────────────────────────────




