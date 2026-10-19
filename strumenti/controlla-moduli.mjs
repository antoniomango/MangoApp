// Controllo dei file delle pagine PRIMA di ogni rilascio che sposta codice (divisione di responsabile.html in js/responsabile/*.js).
// `node --check` guarda un file alla volta: non vede un nome dichiarato due volte tra file, un file non caricato dal service worker, un ordine sbagliato.
// Uso: node strumenti/controlla-moduli.mjs        (esce con 1 al primo controllo che fallisce; stampa "OK   ..." per quelli superati)
// Controlli:
//  1. nessun nome di primo livello (function / let / const / var / class) dichiarato due volte tra gli script di una stessa pagina
//     (un let/const doppio è un SyntaxError che si vede solo caricando la pagina). Eccezioni note: strumenti/controlla-moduli.eccezioni.txt
//  2. ogni file js/ e css/ citato da una pagina HTML e ogni file di js/responsabile/ è nella precache ASSETS di sw.js
//  3. in responsabile.html: i file di js/responsabile/ stanno DOPO config.deploy.js, config.js, comune.js, etichette.js e PRIMA dello script
//     in linea principale; se esiste strumenti/moduli-responsabile.txt (un file per riga) l'ordine deve essere quello
//  4. APP_VERSION (js/config.js) uguale a CACHE (sw.js)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// MANGO_RADICE: controlla una copia della cartella (usata solo per le prove negative); di norma il repository
const radice = process.env.MANGO_RADICE ? path.resolve(process.env.MANGO_RADICE) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leggi = (p) => fs.readFileSync(path.join(radice, p), 'utf8');
const esiste = (p) => fs.existsSync(path.join(radice, p));
let fallito = false;
const ok = (m) => console.log('OK   ' + m);
const ko = (m, d) => { console.log('FAIL ' + m + (d ? ' -> ' + d : '')); fallito = true; };

// ---------- estrazione dei nomi di primo livello (maschera di commenti/stringhe/template/regex + profondità delle graffe) ----------
const KW = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'instanceof', 'yield', 'await']);
function maschera(src) {
  const n = src.length, mask = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (mask[k] !== '\n') mask[k] = ' '; };
  let i = 0, prevSig = '', prevWord = '';
  const skipString = (q, a) => { let k = a + 1; while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; } return k + 1; };
  const regexFine = (a) => { let q = a + 1, cls = false; while (q < n && src[q] !== '\n') { const e = src[q]; if (e === '\\') { q += 2; continue; } if (e === '[') cls = true; else if (e === ']') cls = false; else if (e === '/' && !cls) break; q++; } q++; while (q < n && /[a-z]/i.test(src[q])) q++; return q; };
  const skipExpr = (a) => {
    let d = 1, k = a, ps = '(';
    while (k < n && d > 0) {
      const c = src[k];
      if (c === '/' && src[k + 1] !== '/' && src[k + 1] !== '*' && '(,=:[!&|?{};+-*%<>~^'.includes(ps)) { k = regexFine(k); ps = '/'; continue; }
      if (/\S/.test(c)) ps = c;
      if (c === '{') { d++; k++; } else if (c === '}') { d--; k++; }
      else if (c === '\'' || c === '"') k = skipString(c, k);
      else if (c === '`') k = skipTpl(k);
      else if (c === '/' && src[k + 1] === '/') { while (k < n && src[k] !== '\n') k++; }
      else if (c === '/' && src[k + 1] === '*') { k = src.indexOf('*/', k + 2) + 2; }
      else k++;
    }
    return k;
  };
  const skipTpl = (a) => { let k = a + 1; while (k < n && src[k] !== '`') { if (src[k] === '\\') { k += 2; continue; } if (src[k] === '$' && src[k + 1] === '{') { k = skipExpr(k + 2); continue; } k++; } return k + 1; };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { let k = i; while (k < n && src[k] !== '\n') k++; blank(i, k); i = k; continue; }
    if (c === '/' && src[i + 1] === '*') { const k = src.indexOf('*/', i + 2) + 2; blank(i, k); i = k; continue; }
    if (c === '\'' || c === '"') { const k = skipString(c, i); blank(i + 1, k - 1); i = k; prevSig = c; prevWord = ''; continue; }
    if (c === '`') { const k = skipTpl(i); blank(i + 1, k - 1); i = k; prevSig = c; prevWord = ''; continue; }
    if (c === '/') {
      if (prevSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prevSig) || KW.has(prevWord)) { const k = regexFine(i); blank(i + 1, k - 1); i = k; prevSig = '/'; prevWord = ''; continue; }
    }
    if (/\S/.test(c)) {
      prevSig = c;
      if (/[A-Za-z_$]/.test(c)) { let k = i; while (k < n && /[\w$]/.test(src[k])) k++; prevWord = src.slice(i, k); prevSig = 'a'; i = k; continue; }
      if (/[0-9]/.test(c)) { let k = i; while (k < n && /[\w.]/.test(src[k])) k++; prevWord = ''; prevSig = '0'; i = k; continue; }
      prevWord = '';
    }
    i++;
  }
  return mask.join('');
}
function nomiDichiarati(mask, a, b) {
  const nomi = []; let d = 0, ps = a;
  const flush = (e) => { const part = mask.slice(ps, e).trim(); if (!part) return; const head = part.split('=')[0]; if (/^[\[{]/.test(head.trim())) (head.match(/[A-Za-z_$][\w$]*/g) || []).forEach((x) => nomi.push(x)); else { const m = head.trim().match(/^[A-Za-z_$][\w$]*/); if (m) nomi.push(m[0]); } };
  for (let k = a; k < b; k++) { const c = mask[k]; if ('({['.includes(c)) d++; else if (')}]'.includes(c)) d--; else if (c === ',' && d === 0) { flush(k); ps = k + 1; } }
  flush(b); return nomi;
}
// restituisce [{ nome, tipo }] delle dichiarazioni di primo livello
function nomiPrimoLivello(src) {
  const mask = maschera(src), n = mask.length, out = [];
  const skipWs = (k) => { while (k < n && /\s/.test(mask[k])) k++; return k; };
  let i = 0;
  while (true) {
    i = skipWs(i); if (i >= n) break;
    const start = i; let d = 0, k = i, fine = -1;
    const rest = mask.slice(i, i + 40);
    const isFn = /^(async\s+)?function\b/.test(rest) || /^class\b/.test(rest);
    while (k < n) {
      const c = mask[k];
      if ('({['.includes(c)) d++;
      else if (')}]'.includes(c)) { d--; if (d === 0 && c === '}' && isFn) { fine = k + 1; break; } }
      else if (c === ';' && d === 0) { fine = k + 1; break; }
      else if (c === '\n' && d === 0 && k > start) {
        let p = k - 1; while (p > start && /[ \t\r]/.test(mask[p])) p--;
        const q = skipWs(k), next = mask[q] ?? '', nw = (mask.slice(q, q + 8).match(/^[A-Za-z_$][\w$]*/) || [''])[0];
        if ((/[\w$)\]}'"`]/.test(mask[p]) || mask[p] === ';') && /[A-Za-z_$]/.test(next) && !['else', 'catch', 'finally', 'in', 'of', 'instanceof'].includes(nw)) { fine = k; break; }
      }
      k++;
    }
    if (fine < 0) fine = n;
    const t = mask.slice(start, fine); let m;
    if ((m = t.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/))) out.push({ nome: m[1], tipo: 'function' });
    else if ((m = t.match(/^class\s+([A-Za-z_$][\w$]*)/))) out.push({ nome: m[1], tipo: 'class' });
    else if ((m = t.match(/^(let|const|var)\s+/))) nomiDichiarati(mask, start + m[0].length, fine).forEach((x) => out.push({ nome: x, tipo: m[1] }));
    i = fine;
  }
  return out;
}

// ---------- pagine: script in ordine ----------
function scriptDi(html) {
  const out = []; const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) {
    const attr = m[1]; const src = (attr.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
    const tipo = (attr.match(/type\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (tipo && !/^(module|text\/javascript|application\/javascript)$/i.test(tipo)) continue;
    out.push({ src: src || null, codice: m[2], pos: m.index });
  }
  return out;
}
const locale = (u) => u && !/^(https?:)?\/\//i.test(u) && !u.startsWith('data:');
const pulito = (u) => u.split('?')[0].split('#')[0].replace(/^\.\//, '').replace(/^\/MangoApp\//, '').replace(/^\//, '');

const pagine = fs.readdirSync(radice).filter((f) => f.endsWith('.html')).sort();
const eccezioni = new Set(esiste('strumenti/controlla-moduli.eccezioni.txt')
  ? leggi('strumenti/controlla-moduli.eccezioni.txt').split('\n').map((r) => r.replace(/#.*/, '').trim()).filter(Boolean) : []);

// 1. nomi doppi per pagina
let doppi = [];
const usate = new Set();
for (const pg of pagine) {
  const html = leggi(pg);
  const visti = new Map();
  for (const s of scriptDi(html)) {
    let nome, testo;
    if (s.src) { if (!locale(s.src)) continue; nome = pulito(s.src); if (!/\.js$/.test(nome) || !esiste(nome)) { if (!esiste(nome)) doppi.push(`${pg}: file referenziato ma assente: ${nome}`); continue; } testo = leggi(nome); }
    else { nome = `${pg} (script in linea)`; testo = s.codice; }
    for (const { nome: n, tipo } of nomiPrimoLivello(testo)) {
      if (eccezioni.has(`${pg} ${n}`)) continue;
      (visti.get(n) ?? visti.set(n, []).get(n)).push(`${nome} [${tipo}]`);
    }
  }
  for (const [n, dove] of visti) if (dove.length > 1) doppi.push(`${pg}: «${n}» dichiarato ${dove.length} volte: ${dove.join(' ; ')}`);
}
if (doppi.length) ko('nessun nome di primo livello dichiarato due volte per pagina', doppi.join('\n     ')); else ok(`nessun nome di primo livello dichiarato due volte (${pagine.length} pagine controllate)${eccezioni.size ? `, ${eccezioni.size} eccezione/i nota/e` : ''}`);
if (fallito) process.exit(1);

// 2. precache
const sw = leggi('sw.js');
const assets = new Set([...(sw.match(/const ASSETS = \[([\s\S]*?)\];/)?.[1] || '').matchAll(/['"]([^'"]+)['"]/g)].map((m) => pulito(m[1])));
if (!assets.size) { ko('ASSETS di sw.js', 'elenco non trovato'); process.exit(1); }
const richiesti = new Map();   // file -> pagine
for (const pg of pagine) {
  const html = leggi(pg);
  const refs = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])
    .concat([...html.matchAll(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi)].map((m) => (m[0].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1]).filter(Boolean));
  for (const u of refs) { if (!locale(u)) continue; const p = pulito(u); if (/^(js|css)\//.test(p)) (richiesti.get(p) ?? richiesti.set(p, []).get(p)).push(pg); }
}
for (const dir of ['js/responsabile']) if (esiste(dir)) for (const f of fs.readdirSync(path.join(radice, dir)).filter((x) => x.endsWith('.js'))) if (!richiesti.has(`${dir}/${f}`)) richiesti.set(`${dir}/${f}`, ['(presente su disco ma non caricato da nessuna pagina)']);
const mancanti = [...richiesti].filter(([f, pgs]) => !assets.has(f) || pgs[0].startsWith('(')).map(([f, pgs]) => `${f} (${pgs.join(', ')})${pgs[0].startsWith('(') ? '' : ' non è in ASSETS di sw.js'}`);
if (mancanti.length) { ko('ogni js/ e css/ caricato da una pagina è nella precache di sw.js', mancanti.join('\n     ')); process.exit(1); }
ok(`tutti i ${richiesti.size} file js/ e css/ caricati dalle pagine sono in ASSETS di sw.js`);

// 3. ordine in responsabile.html
{
  const html = leggi('responsabile.html');
  const sc = scriptDi(html).filter((s) => s.src ? locale(s.src) : true);
  const idx = (f) => sc.findIndex((s) => s.src && pulito(s.src) === f);
  const base = ['js/config.deploy.js', 'js/config.js', 'js/comune.js', 'js/etichette.js'];
  const moduli = sc.map((s, i) => ({ s, i })).filter(({ s }) => s.src && pulito(s.src).startsWith('js/responsabile/'));
  const inLinea = sc.map((s, i) => ({ s, i })).filter(({ s }) => !s.src && s.codice.trim().length > 0);
  // script in linea principale = il più lungo (oggi lo script da ~9.700 righe; dopo la divisione resta solo quello di avvio/service worker)
  const principale = inLinea.slice().sort((a, b) => b.s.codice.length - a.s.codice.length)[0];
  const problemi = [];
  for (let k = 0; k < base.length; k++) { if (idx(base[k]) < 0) problemi.push(`${base[k]} non è caricato da responsabile.html`); else if (k > 0 && idx(base[k]) < idx(base[k - 1])) problemi.push(`${base[k]} deve stare dopo ${base[k - 1]}`); }
  if (principale && idx('js/etichette.js') > principale.i) problemi.push('js/etichette.js deve stare prima dello script in linea principale');
  for (const { s, i } of moduli) {
    const f = pulito(s.src);
    for (const b of base) if (idx(b) >= 0 && i < idx(b)) problemi.push(`${f} deve stare dopo ${b}`);
    // prima dello script in linea principale, oppure di qualunque script in linea che dichiari/usi init()
    const dopoPrincipale = inLinea.filter(({ i: j, s: x }) => j < i && /\binit\s*\(\s*\)\s*;/.test(x.codice));
    if (dopoPrincipale.length) problemi.push(`${f} è caricato dopo lo script in linea che avvia la pagina (init())`);
  }
  if (esiste('strumenti/moduli-responsabile.txt')) {
    const att = leggi('strumenti/moduli-responsabile.txt').split('\n').map((r) => r.replace(/#.*/, '').trim()).filter(Boolean);
    const reali = moduli.map(({ s }) => pulito(s.src).replace('js/responsabile/', ''));
    if (att.join('|') !== reali.join('|')) problemi.push(`ordine dei moduli diverso da strumenti/moduli-responsabile.txt (atteso: ${att.join(', ')}; trovato: ${reali.join(', ')})`);
  }
  if (problemi.length) { ko('ordine di caricamento degli script di responsabile.html', problemi.join('\n     ')); process.exit(1); }
  ok(`ordine di caricamento degli script di responsabile.html corretto (${moduli.length} moduli in js/responsabile/)`);
}

// 4. versioni
{
  const v = (leggi('js/config.js').match(/const APP_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1];
  const c = (sw.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1];
  if (!v || !c || v !== c) { ko('APP_VERSION (js/config.js) uguale a CACHE (sw.js)', `APP_VERSION=${v}, CACHE=${c}`); process.exit(1); }
  ok(`APP_VERSION e CACHE coincidono (${v})`);
}
process.exit(fallito ? 1 : 0);
