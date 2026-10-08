// js/flusso-schermo.js — flusso di produzione: layout condiviso del grafo delle fasi + schermo live di sola lettura.
//
// Usato da responsabile.html (vista Fasi ▸ Flusso di configurazione e "Modalità schermo" della Dashboard) e da schermo.html
// (pagina di reparto). Script classico, nessuna libreria; DOM costruito solo con createElement + textContent.
//
// 1) Layout condiviso: colonne per livello, ordinamento anti-incroci, geometria degli archi (FlussoSchermo.colonne / geometriaArchi).
// 2) Schermo: FlussoSchermo.avvia(radice, opzioni). Disegna SOLO i dati restituiti dalla RPC (grafo salvato + conteggi aggregati):
//    non legge tabelle, non scrive nulla. Nessun tempo, operatore, cliente o prezzo passa di qui.
//
// Opzioni di avvia(): { carica: async () => ({ ok, dati } | { ok:false, errore:'sessione'|'rete' }),
//   esci: fn|null, accediDiNuovo: fn, testiSessione: { titolo, testo, pulsante }, pienoSchermo: bool }
const FlussoSchermo = (() => {
  'use strict';

  // ───────────────────────── layout condiviso ─────────────────────────
  // lista: [{ id }] nell'ordine di visualizzazione; dipDi(id): id delle fasi da cui dipende.
  function colonne(lista, dipDi) {
    const ids = new Set(lista.map(f => f.id));
    const dip = id => (dipDi(id) || []).filter(x => ids.has(x));
    const succ = id => lista.filter(g => (dipDi(g.id) || []).includes(id)).map(g => g.id);
    const memo = {};
    const lv = (id, vis = new Set()) => {
      if (memo[id] != null) return memo[id];
      if (vis.has(id)) return 0; vis.add(id);
      const d = dip(id);
      memo[id] = d.length ? 1 + Math.max(...d.map(x => lv(x, vis))) : 0; return memo[id];
    };
    lista.forEach(f => lv(f.id));
    const max = Math.max(0, ...Object.values(memo));
    const cols = Array.from({ length: max + 1 }, (_, k) => lista.filter(f => memo[f.id] === k));
    const pos = {}; const segna = () => cols.forEach(c => c.forEach((f, i) => { pos[f.id] = i; }));
    const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 999;
    segna();
    for (let giro = 0; giro < 3; giro++) {   // ordina ogni colonna vicino alle fasi collegate, per ridurre gli incroci
      for (let k = 1; k <= max; k++) { cols[k].sort((a, b) => media(dip(a.id).map(x => pos[x])) - media(dip(b.id).map(x => pos[x]))); segna(); }
      for (let k = max - 1; k >= 0; k--) { cols[k].sort((a, b) => media(succ(a.id).map(x => pos[x])) - media(succ(b.id).map(x => pos[x]))); segna(); }
    }
    return { cols, livello: memo };
  }

  // Archi tra i nodi già disegnati in `box` (selNodo = selettore dei nodi, con data-id). Misure in coordinate naturali (offset*): non dipendono da transform/scala.
  function geometriaArchi(box, selNodo, lista, dipDi) {
    const pos = {}; box.querySelectorAll(selNodo).forEach(n => { pos[n.dataset.id] = { x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight }; });
    const out = [];
    lista.forEach(f => (dipDi(f.id) || []).forEach(dd => {
      const a = pos[dd], b = pos[f.id]; if (!a || !b) return;
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
      out.push({ da: dd, a: f.id, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, p: [x1, y1, mx, y1, mx, y2, x2, y2] });
    }));
    return out;
  }

  // Keyframes di un punto che percorre la curva (cubica di Bézier campionata): solo transform, quindi animazione sul compositor
  function keyframesArco(nome, p) {
    const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = p, N = 10; let out = `@keyframes ${nome}{`;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t, b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      out += `${Math.round(t * 100)}%{transform:translate(${(b0 * x1 + b1 * c1x + b2 * c2x + b3 * x2).toFixed(1)}px,${(b0 * y1 + b1 * c1y + b2 * c2y + b3 * y2).toFixed(1)}px)}`;
    }
    return out + '}';
  }

  // ───────────────────────── stile dello schermo ─────────────────────────
  const CSS = `
.fls { position: fixed; inset: 0; z-index: 9000; background: var(--bg); color: var(--ink-2); font-family: var(--font-sans); font-size: clamp(12px, .85vw, 40px); overflow: hidden; }
.fls-in { position: absolute; inset: 0; display: flex; flex-direction: column; padding: 1.4em 2em 1em; gap: 1em; transform: translate(var(--sx, 0px), var(--sy, 0px)); transition: transform 4s ease-in-out; }
.fls-testa { display: flex; align-items: center; gap: 2.2em; flex-wrap: nowrap; }
.fls-titolo { font-size: 1.7em; font-weight: 600; letter-spacing: .02em; color: var(--ink-2); white-space: nowrap; }
.fls-ora { font-family: var(--font-mono); font-size: 1.15em; color: var(--muted); white-space: nowrap; }
.fls-kpi { display: flex; gap: 1.6em; margin-left: auto; }
.fls-k { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: .5em 1.1em; min-width: 9em; text-align: center; }
.fls-k b { display: block; font-family: var(--font-mono); font-size: 3em; line-height: 1.05; font-weight: 700; color: var(--ink-2); }
.fls-k span { font-size: .95em; color: var(--muted); }
.fls-k.rischio.attivo b { color: var(--alert); }
.fls-k.pronti.attivo b { color: var(--ok); }
.fls-stato { display: flex; flex-direction: column; align-items: flex-end; gap: .2em; font-size: .95em; color: var(--muted); white-space: nowrap; min-width: 13em; }
.fls-stato .riga { display: flex; align-items: center; gap: .5em; }
.fls-dot { width: .8em; height: .8em; border-radius: 50%; background: var(--ok); }
.fls-dot.giallo { background: var(--warn); }
.fls-dot.rosso { background: var(--alert); }
.fls-stato.vecchio { color: var(--warn-ink); }
.fls-esci { position: absolute; top: .5em; right: .6em; opacity: .35; background: none; border: 1px solid var(--border); color: var(--muted); border-radius: 8px; padding: .25em .7em; font: inherit; font-size: .85em; cursor: pointer; }
.fls-esci:hover, .fls-esci:focus-visible { opacity: 1; }
.fls-palco { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.fls-scorri { position: absolute; left: 0; top: 0; }
.fls-vuoto[hidden] { display: none; }
.fls-poco .fls-n-cod { visibility: hidden; }
.fls-scorri.attivo { animation: fls-scorri var(--dur, 60s) ease-in-out infinite alternate; }
.fls-grafo { position: absolute; left: 0; top: 0; width: max-content; display: flex; gap: 80px; align-items: center; transform-origin: 0 0; padding: 12px; }
.fls-col { display: flex; flex-direction: row; gap: 34px; flex: none; }
.fls-sub { display: flex; flex-direction: column; justify-content: center; gap: 22px; flex: none; }
.fls-archi { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
.fls-archi path { fill: none; stroke: var(--border-strong); stroke-width: 3; }
.fls-nodo { position: relative; width: 270px; height: 188px; flex: none; box-sizing: border-box; padding: 14px 16px 12px; background: var(--surface); border: 2px solid var(--border-strong); border-radius: 16px; transition: opacity .6s; }
.fls-nodo.ext { border-style: dashed; }
.fls-nodo.vuoto { opacity: .42; }
.fls-nodo.fine { border-color: var(--ok); }
.fls-nodo::after { content: ''; position: absolute; inset: -5px; border-radius: 20px; border: 3px solid var(--ok); opacity: 0; pointer-events: none; }
.fls-nodo.vivo::after { animation: fls-respiro 3.6s ease-in-out infinite; }
.fls-nodo.impulso::after { animation: fls-impulso .9s ease-out 1; border-color: var(--info); }
.fls-nodo.evid { outline: 3px solid var(--info); outline-offset: 3px; }
.fls-nodo.entra { animation: fls-entra .7s ease-out both; animation-delay: var(--ritardo, 0s); }
.fls-n-top { display: flex; align-items: flex-start; gap: 10px; height: 2.4em; font-size: 24px; line-height: 1.2; font-weight: 600; color: var(--ink); }
.fls-n-nome { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fls-mdot { flex: none; width: 16px; height: 16px; border-radius: 50%; margin-top: .25em; background: var(--accent-2); }
.fls-n-mid { display: flex; align-items: center; justify-content: space-between; margin: 2px 0 8px; height: 62px; }
.fls-n-num { transform-origin: 0 100%; font-family: var(--font-mono); font-size: 62px; line-height: 1; font-weight: 700; color: var(--ink); display: inline-block; }
.cambia { animation: fls-cambia .5s ease-out 1; }
.fls-n-ris { font-family: var(--font-mono); font-size: 24px; font-weight: 700; background: var(--alert); color: var(--on-alert); border-radius: 999px; padding: 2px 14px; }
.fls-n-ris[hidden] { display: none; }
.fls-n-seg { display: flex; gap: 3px; height: 12px; border-radius: 6px; overflow: hidden; background: var(--phase-bg); }
.fls-n-seg i { display: block; min-width: 0; }
.fls-n-seg .s-corso { background: var(--ok); } .fls-n-seg .s-disp { background: var(--info); } .fls-n-seg .s-bloc { background: var(--warn); }
.fls-n-seg .s-cli { background: var(--accent-2); } .fls-n-seg .s-est { background: var(--muted); }
.fls-n-cod { font-family: var(--font-mono); font-size: 16px; line-height: 1.3; color: var(--muted); margin-top: 8px; height: 1.3em; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.fls-punto, .fls-pacco { position: absolute; left: 0; top: 0; offset-rotate: 0deg; pointer-events: none; }
.fls-punto { width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: var(--ink-2); opacity: .55; will-change: transform; animation-duration: var(--dur, 9s); animation-timing-function: linear; animation-iteration-count: infinite; animation-delay: var(--rit, 0s); }
.fls-punto[hidden] { display: none; }
.fls-pacco { width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: var(--ok); border: 3px solid var(--bg); animation: fls-viaggio 1.5s ease-in-out 1 both; }
.fls-piede { display: flex; align-items: center; gap: 1.6em; flex-wrap: wrap; font-size: .95em; color: var(--muted); }
.fls-leg { display: flex; gap: 1.2em; flex-wrap: wrap; }
.fls-leg span { display: inline-flex; align-items: center; gap: .45em; }
.fls-leg i { width: 1.3em; height: .6em; border-radius: 3px; display: inline-block; }
.fls-extra { display: flex; gap: .8em; flex-wrap: wrap; margin-left: auto; align-items: center; }
.fls-extra .chip { background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: .25em .9em; color: var(--ink-2); }
.fls-extra .chip b { font-family: var(--font-mono); margin-left: .4em; color: var(--ink); }
.fls-extra .chip.r { border-color: var(--alert-line); }
.fls-nota { flex-basis: 100%; font-size: .9em; opacity: .85; }
.fls-vuoto { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 1.6em; color: var(--muted); }
.fls-velo { position: absolute; inset: 0; background: var(--bg); display: none; flex-direction: column; align-items: center; justify-content: center; gap: 1em; text-align: center; padding: 2em; z-index: 5; }
.fls-velo.aperto { display: flex; }
.fls-velo h2 { font-size: 2.2em; color: var(--ink); } .fls-velo p { font-size: 1.3em; max-width: 36em; color: var(--muted); }
.fls-velo button { font: inherit; font-size: 1.2em; padding: .6em 1.6em; border-radius: 12px; border: 1px solid var(--border-strong); background: var(--surface); color: var(--ink); cursor: pointer; }
.fls-pausa *, .fls-pausa *::before, .fls-pausa *::after { animation-play-state: paused !important; }
@keyframes fls-respiro { 0%, 100% { opacity: 0; } 50% { opacity: .5; } }
@keyframes fls-impulso { 0% { opacity: .95; transform: scale(1); } 100% { opacity: 0; transform: scale(1.08); } }
@keyframes fls-entra { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes fls-cambia { from { opacity: .15; transform: translateY(-10px) scale(1.15); } to { opacity: 1; transform: none; } }
@keyframes fls-viaggio { 0% { offset-distance: 0%; opacity: 0; transform: scale(.5); } 12% { opacity: 1; transform: scale(1); } 88% { opacity: 1; } 100% { offset-distance: 100%; opacity: 0; transform: scale(1.3); } }
@keyframes fls-scorri { from { transform: translate(0, 0); } to { transform: translate(var(--dx, 0px), var(--dy, 0px)); } }
@media (prefers-reduced-motion: reduce) {
  .fls *, .fls *::before, .fls *::after { animation: none !important; transition: none !important; }
  .fls-punto, .fls-pacco { display: none !important; }
}
`;

  const PREDEFINITI = { codici_per_fase: 5, aggiorna_secondi: 60, debounce_secondi: 2, intervallo_minimo_secondi: 5, dato_vecchio_secondi: 120, burnin_minuti: 4 };
  const SCALA_MIN = 0.5, SCALA_MAX = 2.2, MAX_PACCHI = 6, MAX_CODA = 12;
  const STATI = [['in_corso', 's-corso'], ['disponibili', 's-disp'], ['bloccate', 's-bloc'], ['in_attesa_cliente', 's-cli'], ['attesa_esterna', 's-est']];

  const el = (tag, classe, testo) => { const e = document.createElement(tag); if (classe) e.className = classe; if (testo !== undefined) e.textContent = testo; return e; };
  const ridotto = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const coloreOk = c => { try { return typeof c === 'string' && CSS_supports(c) ? c : ''; } catch (e) { return ''; } };
  const CSS_supports = c => (window.CSS && CSS.supports) ? CSS.supports('color', c) : /^#[0-9a-f]{3,8}$/i.test(c);

  function avvia(radice, opz) {
    opz = opz || {};
    if (!document.getElementById('fls-css')) { const s = el('style'); s.id = 'fls-css'; s.textContent = CSS; document.head.appendChild(s); }
    const T = Etichette.flusso;
    radice.classList.add('fls'); radice.textContent = '';

    // ── scheletro ──
    const dentro = el('div', 'fls-in');
    const testa = el('div', 'fls-testa');
    const titolo = el('div', 'fls-titolo', T.titolo);
    const ora = el('div', 'fls-ora');
    const kpi = el('div', 'fls-kpi');
    const mkKpi = (cls, etichetta) => { const k = el('div', 'fls-k ' + cls); const b = el('b', null, '–'); k.appendChild(b); k.appendChild(el('span', null, etichetta)); kpi.appendChild(k); return { k, b }; };
    const kAperti = mkKpi('aperti', T.ordiniAperti), kRischio = mkKpi('rischio', T.aRischio), kPronti = mkKpi('pronti', T.pronti);
    const stato = el('div', 'fls-stato'); const rigaStato = el('div', 'riga'); const dot = el('span', 'fls-dot'); const statoTesto = el('span', null, T.inCaricamento);
    rigaStato.appendChild(dot); rigaStato.appendChild(statoTesto); stato.appendChild(rigaStato); const statoSotto = el('div', null, '');
    stato.appendChild(statoSotto);
    testa.appendChild(titolo); testa.appendChild(ora); testa.appendChild(kpi); testa.appendChild(stato);
    const palco = el('div', 'fls-palco'); const scorri = el('div', 'fls-scorri'); palco.appendChild(scorri);
    const vuoto = el('div', 'fls-vuoto', T.inCaricamento); palco.appendChild(vuoto);
    const piede = el('div', 'fls-piede'); const leg = el('div', 'fls-leg'); const extra = el('div', 'fls-extra'); const nota = el('div', 'fls-nota', T.nota);
    STATI.forEach(([k, cls]) => { const s = el('span'); const i = el('i'); i.className = cls; s.appendChild(i); s.appendChild(document.createTextNode(T.stati[k])); leg.appendChild(s); });
    // la legenda usa le stesse classi cromatiche dei segmenti dei nodi
    leg.querySelectorAll('i').forEach(i => { const c = i.className; i.style.background = `var(--${({ 's-corso': 'ok', 's-disp': 'info', 's-bloc': 'warn', 's-cli': 'accent-2', 's-est': 'muted' })[c]})`; });
    { const e2 = el('span', null, T.esternaLegenda); const d2 = el('i'); d2.style.border = '2px dashed var(--muted)'; d2.style.background = 'none'; e2.insertBefore(d2, e2.firstChild); leg.appendChild(e2); }
    piede.appendChild(leg); piede.appendChild(extra); piede.appendChild(nota);
    dentro.appendChild(testa); dentro.appendChild(palco); dentro.appendChild(piede);
    const velo = el('div', 'fls-velo'); const vTit = el('h2'), vTesto = el('p'); const vBtn = el('button', null, ''); vBtn.type = 'button';
    velo.appendChild(vTit); velo.appendChild(vTesto); velo.appendChild(vBtn);
    radice.appendChild(dentro); radice.appendChild(velo);
    if (opz.esci) { const b = el('button', 'fls-esci', T.esci); b.type = 'button'; b.title = T.uscitaAiuto; b.setAttribute('aria-label', T.uscitaAiuto); b.addEventListener('click', () => opz.esci()); dentro.appendChild(b); }

    // ── stato interno ──
    const kfStile = el('style'); document.head.appendChild(kfStile);
    const st = { kfStile, dati: null, prec: null, forma: '', grafo: null, svg: null, nodi: {}, archi: [], fase: {}, ultimoOk: 0, ultimoTentativo: 0, errori: 0, inCorso: false, ripeti: false,
      sessione: false, ferma: false, pacchi: 0, coda: [], lock: null, timerDeb: null, timerTick: null, timerBurn: null, burnMin: 0, ro: null, rafAdatta: 0, wakeLock: 'wakeLock' in navigator };
    const par = () => Object.assign({}, PREDEFINITI, (st.dati && st.dati.parametri) || {});

    // misure naturali dei nodi (px prima della scala): devono coincidere con il CSS
    const NW = 270, NH = 188, GV = 22, GS = 34, GC = 80, PAD = 24;
    function dimensioni(cols, m) {
      let W = PAD, H = 0;
      cols.forEach((c, i) => { const sub = Math.ceil(c.length / m), per = Math.ceil(c.length / sub); W += sub * NW + (sub - 1) * GS + (i ? GC : 0); H = Math.max(H, per * NH + (per - 1) * GV); });
      return { W, H: H + PAD };
    }
    function scegliM(cols) {
      const pw = palco.clientWidth, ph = palco.clientHeight, max = Math.max(1, ...cols.map(c => c.length));
      if (!pw || !ph) return max;
      let migliore = max, scalaMigliore = -1;
      for (let m = max; m >= 1; m--) { const d = dimensioni(cols, m); const sc = Math.min(pw / d.W, ph / d.H, SCALA_MAX); if (sc > scalaMigliore + 1e-6) { scalaMigliore = sc; migliore = m; } }
      return migliore;
    }
    // ── disegno della struttura (solo se cambia la forma del grafo) ──
    function costruisci(dati, primaVolta) {
      const fasi = dati.fasi || [];
      const macro = {}; (dati.macro_fasi || []).forEach(m => { macro[m.id] = m; });
      scorri.textContent = ''; st.nodi = {}; st.archi = []; st.fase = {};
      fasi.forEach(f => { st.fase[f.id] = f; });
      vuoto.hidden = fasi.length > 0; vuoto.textContent = T.nessunaFase;
      if (!fasi.length) { st.grafo = null; return; }
      const grafo = el('div', 'fls-grafo'); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'fls-archi');
      grafo.appendChild(svg);
      const { cols } = colonne(fasi, id => (st.fase[id] && st.fase[id].dipende_da) || []);
      st.cols = cols; st.m = scegliM(cols);
      cols.forEach((c, k) => {
        const col = el('div', 'fls-col');
        const sub = Math.ceil(c.length / st.m), per = Math.ceil(c.length / sub);   // colonne molto alte si dividono in più sotto-colonne affiancate
        for (let z = 0; z < sub; z++) {
          const sc = el('div', 'fls-sub');
          c.slice(z * per, (z + 1) * per).forEach(f => {
            const n = el('div', 'fls-nodo' + (f.esterna ? ' ext' : '') + (primaVolta ? ' entra' : '')); n.dataset.id = f.id;
            if (f.esterna) n.title = T.esterna(f.tipo_gestione, f.opzionale);
            if (primaVolta) n.style.setProperty('--ritardo', (k * 0.12) + 's');
            const top = el('div', 'fls-n-top'); const md = el('span', 'fls-mdot'); const m = macro[f.macro_fase_id]; const col2 = m && coloreOk(m.colore); if (col2) md.style.background = col2;
            top.appendChild(md); top.appendChild(el('span', 'fls-n-nome', f.nome || ''));
            const mid = el('div', 'fls-n-mid'); const num = el('span', 'fls-n-num', '0'); const ris = el('span', 'fls-n-ris'); ris.hidden = true; mid.appendChild(num); mid.appendChild(ris);
            const seg = el('div', 'fls-n-seg'); const segEl = {}; STATI.forEach(([k2, cls]) => { const i = el('i', cls); seg.appendChild(i); segEl[k2] = i; });
            const cod = el('div', 'fls-n-cod');
            n.appendChild(top); n.appendChild(mid); n.appendChild(seg); n.appendChild(cod);
            sc.appendChild(n); st.nodi[f.id] = { n, num, ris, segEl, cod, ultimoN: null, evidTimer: 0 };
          });
          col.appendChild(sc);
        }
        grafo.appendChild(col);
      });
      scorri.appendChild(grafo); st.grafo = grafo; st.svg = svg;
      requestAnimationFrame(() => { if (st.ferma) return; disegnaArchi(); adatta(); if (primaVolta) setTimeout(() => Object.values(st.nodi).forEach(x => x.n.classList.remove('entra')), 2500); });
    }
    function disegnaArchi() {
      if (!st.grafo) return;
      const g = st.grafo, fasi = Object.values(st.fase);
      st.svg.setAttribute('width', g.scrollWidth); st.svg.setAttribute('height', g.scrollHeight);
      st.archi = geometriaArchi(g, '.fls-nodo', fasi, id => (st.fase[id] && st.fase[id].dipende_da) || []);
      st.svg.textContent = '';
      g.querySelectorAll('.fls-punto, .fls-pacco').forEach(x => x.remove());
      let kf = '';
      st.archi.forEach((a, idx) => {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', a.d); st.svg.appendChild(p);
        a.punti = []; kf += keyframesArco('flsA' + idx, a.p);
        for (let i = 0; i < 3; i++) {
          const d = el('div', 'fls-punto'); d.style.animationName = 'flsA' + idx; d.style.setProperty('--rit', (-(i * 3.1 + Math.random())) + 's'); d.hidden = true; g.appendChild(d); a.punti.push(d);
        }
      });
      st.kfStile.textContent = kf;
      aggiornaPunti();
    }
    function aggiornaPunti() {
      st.archi.forEach(a => {
        const nDa = (st.fase[a.da] && st.fase[a.da].qui) || 0;
        const quanti = nDa > 0 ? Math.min(3, Math.ceil(nDa / 6)) : 0;
        const dur = Math.max(5, 14 - Math.min(8, nDa)) + 's';
        a.punti.forEach((d, i) => { d.hidden = i >= quanti; d.style.setProperty('--dur', dur); });
      });
    }
    // scala il grafo nel palco; se servirebbe una scala illeggibile, scala minima e scorrimento lento avanti e indietro
    function adatta() {
      if (!st.grafo) return;
      const m = scegliM(st.cols);
      if (m !== st.m && st.dati) { costruisci(st.dati, false); (st.dati.fasi || []).forEach(f => { const x = st.nodi[f.id]; if (x) { x.num.textContent = String(f.qui); x.ultimoN = f.qui; segna(x, f); } }); return; }
      const W = st.grafo.offsetWidth, H = st.grafo.offsetHeight, pw = palco.clientWidth, ph = palco.clientHeight;
      if (!W || !H || !pw || !ph) return;
      let s = Math.min(pw / W, ph / H, SCALA_MAX); if (s < SCALA_MIN) s = SCALA_MIN;
      const w = W * s, h = H * s, dx = Math.max(0, w - pw), dy = Math.max(0, h - ph);
      st.grafo.style.transform = `scale(${s})`; palco.classList.toggle('fls-poco', s < 0.62);   // sotto questa scala i codici sarebbero illeggibili: si nascondono
      scorri.style.width = w + 'px'; scorri.style.height = h + 'px';
      scorri.style.left = dx > 0 ? '0px' : ((pw - w) / 2) + 'px'; scorri.style.top = dy > 0 ? '0px' : ((ph - h) / 2) + 'px';
      const scorre = (dx > 0 || dy > 0) && !ridotto();
      scorri.classList.toggle('attivo', scorre);
      if (scorre) { scorri.style.setProperty('--dx', -dx + 'px'); scorri.style.setProperty('--dy', -dy + 'px'); scorri.style.setProperty('--dur', Math.max(45, (dx + dy) / 12) + 's'); }
    }
    const adattaRaf = () => { if (st.rafAdatta) return; st.rafAdatta = requestAnimationFrame(() => { st.rafAdatta = 0; adatta(); }); };

    // ── aggiornamento dei valori (senza ricostruire il DOM) ──
    function segna(x, f) {
      const tot = Math.max(1, f.n);   // la barra mostra tutti gli ordini con la fase aperta (anche quelli che aspettano le fasi precedenti)
      STATI.forEach(([k]) => { const v = f[k] || 0; x.segEl[k].style.flex = v > 0 ? `${v} 1 0` : '0 0 0'; });
      x.n.classList.toggle('vuoto', f.qui === 0);
      x.n.classList.toggle('vivo', (f.in_corso || 0) > 0);
      x.ris.hidden = !(f.a_rischio > 0); x.ris.textContent = f.a_rischio > 0 ? '⚠ ' + f.a_rischio : '';
      const cod = (f.codici || []).join(' · '); const resto = f.qui - (f.codici || []).length;
      const testo = cod + (cod && resto > 0 ? ' ' + T.altriCodici(resto) : '');
      if (x.cod.textContent !== testo) x.cod.textContent = testo;
      return tot;
    }
    function evidenzia(id) {   // movimento ridotto: solo evidenziazione statica del nodo cambiato
      const x = st.nodi[id]; if (!x) return;
      x.n.classList.add('evid'); clearTimeout(x.evidTimer); x.evidTimer = setTimeout(() => x.n.classList.remove('evid'), 8000);
    }
    function pacco(a) {
      if (ridotto() || document.hidden) return;
      if (st.pacchi >= MAX_PACCHI) { if (st.coda.length < MAX_CODA) st.coda.push(a); return; }
      st.pacchi++;
      const p = el('div', 'fls-pacco'); p.style.offsetPath = `path('${a.d}')`;
      let chiuso = false; const fine = () => { if (chiuso) return; chiuso = true; p.remove(); st.pacchi--; const prox = st.coda.shift(); if (prox && !st.ferma) pacco(prox); };
      p.addEventListener('animationend', fine); setTimeout(fine, 2600);
      st.grafo.appendChild(p);
    }
    function impulso(id, classe) {
      const x = st.nodi[id]; if (!x) return;
      if (!ridotto()) { x.n.classList.remove(classe); void x.n.offsetWidth; x.n.classList.add(classe); setTimeout(() => x.n.classList.remove(classe), 1100); }   // niente listener: la classe si toglie sempre
      else evidenzia(id);
    }
    function eventi(prec, dati) {
      const prima = {}; (prec.fasi || []).forEach(f => { prima[f.id] = f.qui; });
      const calo = [], sale = [];
      (dati.fasi || []).forEach(f => { if (prima[f.id] == null) return; const d = f.qui - prima[f.id]; if (d < 0) calo.push(f.id); else if (d > 0) sale.push(f.id); });
      const usate = new Set();
      st.archi.forEach(a => { if (calo.includes(a.da) && sale.includes(a.a)) { usate.add(a.da); impulso(a.da, 'impulso'); evidenzia(a.a); pacco(a); } });
      const salgonoPronti = ((dati.ordini && dati.ordini.attesa_spedizione) || 0) > ((prec.ordini && prec.ordini.attesa_spedizione) || 0);
      const successori = id => st.archi.some(a => a.da === id);
      calo.forEach(id => {
        if (usate.has(id)) return;
        if (!successori(id) && salgonoPronti) { impulso(id, 'impulso'); const x = st.nodi[id]; if (x && !ridotto()) { x.n.classList.add('fine'); setTimeout(() => x.n.classList.remove('fine'), 2500); } }
        else evidenzia(id);
      });
      sale.forEach(id => { if (!st.archi.some(a => a.a === id && calo.includes(a.da))) evidenzia(id); });
      if (salgonoPronti) { const k = kPronti.b; k.classList.remove('cambia'); void k.offsetWidth; k.classList.add('cambia'); }
    }
    function applica(dati) {
      const prec = st.dati; st.dati = dati;
      const forma = JSON.stringify([(dati.fasi || []).map(f => [f.id, f.nome, f.macro_fase_id, f.esterna, f.tipo_gestione, f.opzionale, f.dipende_da]), (dati.macro_fasi || []).map(m => [m.id, m.colore])]);
      const nuova = forma !== st.forma;
      if (nuova) { const prima = !st.forma; st.forma = forma; costruisci(dati, prima); }
      else { (dati.fasi || []).forEach(f => { st.fase[f.id] = f; }); }
      (dati.fasi || []).forEach(f => {
        const x = st.nodi[f.id]; if (!x) return;
        const testo = String(f.qui);
        if (x.num.textContent !== testo) { x.num.textContent = testo; if (x.ultimoN != null && !ridotto()) { x.num.classList.remove('cambia'); void x.num.offsetWidth; x.num.classList.add('cambia'); } }
        x.ultimoN = f.qui; segna(x, f);
      });
      aggiornaPunti();
      if (prec && !nuova && st.grafo) eventi(prec, dati);
      // intestazione
      const o = dati.ordini || {};
      kAperti.b.textContent = String(o.aperti ?? 0); kRischio.b.textContent = String(o.a_rischio ?? 0); kPronti.b.textContent = String(o.attesa_spedizione ?? 0);
      kRischio.k.classList.toggle('attivo', (o.a_rischio || 0) > 0); kPronti.k.classList.toggle('attivo', (o.attesa_spedizione || 0) > 0);
      // fasi extra
      extra.textContent = '';
      if ((dati.extra || []).length) {
        extra.appendChild(el('span', null, T.extra + ':'));
        dati.extra.slice(0, 12).forEach(e => { const c = el('span', 'chip' + (e.a_rischio > 0 ? ' r' : ''), e.nome); c.appendChild(el('b', null, String(e.n))); extra.appendChild(c); });
      }
      vuoto.hidden = (dati.fasi || []).length > 0;
      if (!(dati.fasi || []).length) vuoto.textContent = T.nessunaFase;
      armaBurnin();
    }

    // ── orologio e stato del collegamento ──
    function oraLocale() {
      const fuso = st.dati && st.dati.fuso; const opt = { hour: '2-digit', minute: '2-digit' };
      try { return new Intl.DateTimeFormat('it-IT', fuso ? Object.assign({ timeZone: fuso }, opt) : opt).format(new Date()); } catch (e) { return new Intl.DateTimeFormat('it-IT', opt).format(new Date()); }
    }
    function aggiornaStato() {
      const adesso = Date.now(), p = par(), vecchio = p.dato_vecchio_secondi * 1000, eta = st.ultimoOk ? adesso - st.ultimoOk : Infinity;
      const dataTesto = st.dati && st.dati.oggi ? new Date(st.dati.oggi + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
      ora.textContent = (dataTesto ? dataTesto + ' · ' : '') + oraLocale();
      let colore = 'verde', msg = T.live;
      if (!st.ultimoOk) { colore = st.errori >= 3 ? 'rosso' : 'giallo'; msg = st.errori ? T.scollegato : T.inCaricamento; }
      else if (!navigator.onLine || eta >= vecchio * 3) { colore = 'rosso'; msg = T.scollegato; }
      else if (eta >= vecchio || st.errori > 0) { colore = 'giallo'; msg = T.ritardo; }
      dot.className = 'fls-dot ' + (colore === 'verde' ? '' : colore); statoTesto.textContent = msg;
      const vec = st.ultimoOk && eta >= vecchio;
      stato.classList.toggle('vecchio', !!vec);
      statoSotto.textContent = st.ultimoOk ? (vec ? T.datoVecchio + ' · ' : '') + T.aggiornatoAlle(new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: (st.dati && st.dati.fuso) || undefined }).format(new Date(st.ultimoOk))) : '';
    }

    // ── richieste di aggiornamento ──
    function richiedi(subito) {
      if (st.ferma || st.sessione) return;
      clearTimeout(st.timerDeb);
      st.timerDeb = setTimeout(esegui, subito ? 0 : par().debounce_secondi * 1000);
    }
    async function esegui() {
      if (st.ferma || st.sessione) return;
      if (st.inCorso) { st.ripeti = true; return; }
      const p = par(), dalUltima = Date.now() - st.ultimoTentativo;
      if (dalUltima < p.intervallo_minimo_secondi * 1000) { clearTimeout(st.timerDeb); st.timerDeb = setTimeout(esegui, p.intervallo_minimo_secondi * 1000 - dalUltima); return; }
      st.inCorso = true; st.ultimoTentativo = Date.now();
      let r; try { r = await opz.carica(); } catch (e) { r = { ok: false, errore: 'rete' }; }
      st.inCorso = false;
      if (st.ferma) return;
      if (r && r.ok && r.dati) { st.errori = 0; st.ultimoOk = Date.now(); applica(r.dati); }
      else if (r && r.errore === 'sessione') { sessioneCaduta(); }
      else { st.errori++; }   // si tiene l'ultimo dato: lo stato diventa giallo/rosso, il tick riprova con attesa crescente
      if (st.ripeti) { st.ripeti = false; richiedi(); }
      aggiornaStato();
    }
    function tick() {
      if (st.ferma) return;
      aggiornaStato();
      if (st.sessione || document.hidden || st.inCorso) return;
      const p = par(), dalUltima = Date.now() - st.ultimoTentativo;
      const attesa = st.errori > 0 ? Math.min(60, 5 * Math.pow(2, st.errori - 1)) * 1000 : p.aggiorna_secondi * 1000;
      if (dalUltima >= attesa) richiedi(true);
    }
    function sessioneCaduta() {
      st.sessione = true;
      const t = opz.testiSessione || {};
      vTit.textContent = t.titolo || T.sessioneTitolo; vTesto.textContent = t.testo || T.sessioneTesto; vBtn.textContent = t.pulsante || T.accediDiNuovo;
      velo.classList.add('aperto'); vBtn.focus();
    }
    vBtn.addEventListener('click', () => { if (opz.accediDiNuovo) opz.accediDiNuovo(); });

    // ── wake lock, visibilità, anti impronta ──
    async function prendiLock() {
      if (!st.wakeLock || st.ferma || document.hidden || st.lock) return;
      try { st.lock = await navigator.wakeLock.request('screen'); st.lock.addEventListener('release', () => { st.lock = null; }); } catch (e) { st.lock = null; }
    }
    function suVisibilita() {
      radice.classList.toggle('fls-pausa', document.hidden);
      if (!document.hidden) { prendiLock(); richiedi(true); adattaRaf(); }
    }
    function armaBurnin() {
      const m = par().burnin_minuti; if (m === st.burnMin) return;
      st.burnMin = m; clearInterval(st.timerBurn);
      st.timerBurn = setInterval(() => {
        const r = () => Math.round((Math.random() * 2 - 1) * 5);
        dentro.style.setProperty('--sx', r() + 'px'); dentro.style.setProperty('--sy', r() + 'px');
      }, m * 60000);
    }
    const suOnline = () => richiedi(true);
    const suPageshow = () => { prendiLock(); richiedi(true); };
    document.addEventListener('visibilitychange', suVisibilita);
    window.addEventListener('pageshow', suPageshow); window.addEventListener('online', suOnline);
    try { st.ro = new ResizeObserver(adattaRaf); st.ro.observe(palco); } catch (e) { window.addEventListener('resize', adattaRaf); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!st.ferma) { disegnaArchi(); adatta(); } });
    st.timerTick = setInterval(tick, 5000);
    if (opz.pienoSchermo && radice.requestFullscreen) { try { const pr = radice.requestFullscreen(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* si resta a pieno viewport */ } }
    prendiLock(); aggiornaStato(); richiedi(true);

    return {
      richiedi: () => richiedi(false),
      applicaDati: d => { st.errori = 0; st.ultimoOk = Date.now(); applica(d); aggiornaStato(); },   // per prove e simulazioni
      stato: () => ({ ultimoOk: st.ultimoOk, errori: st.errori, sessione: st.sessione, wakeLock: !!st.lock, wakeLockSupportato: st.wakeLock, pacchiAttivi: st.pacchi, nodi: Object.keys(st.nodi).length }),
      ferma() {
        st.ferma = true; clearTimeout(st.timerDeb); clearInterval(st.timerTick); clearInterval(st.timerBurn);
        document.removeEventListener('visibilitychange', suVisibilita); window.removeEventListener('pageshow', suPageshow); window.removeEventListener('online', suOnline);
        if (st.ro) st.ro.disconnect(); cancelAnimationFrame(st.rafAdatta);
        if (st.lock) { try { st.lock.release(); } catch (e) { /* già rilasciato */ } }
        kfStile.remove(); radice.textContent = ''; radice.classList.remove('fls', 'fls-pausa');
      },
    };
  }

  return { colonne, geometriaArchi, avvia, wakeLockSupportato: () => 'wakeLock' in navigator };
})();
