// Censimento dei valori inseriti in HTML senza escape (template letterali ${...} dentro codice HTML) nei file serviti dall'app.
// SOLA LETTURA: non modifica nessun file. Uso: node strumenti/controlla-escape.mjs [--elenco] [--json] [--strict]
//   (senza opzioni)  totali per categoria + elenco dei punti D ed E
//   --elenco         elenca anche A, B, C
//   --json           stampa solo il JSON completo (file, riga, espressione, categoria, motivo, contesto, funzione, campo)
//   --strict         esce con 1 se esistono punti D o E non coperti dal file di eccezioni
// Categorie:
//   A  con escape adatto al contesto (escapeHtml / escapeJsAttr / esc locale)
//   B  numero, data, booleano, costante, id, enum di stato: non può contenere markup
//   C  HTML costruito dal codice (eccezione legittima; i template interni sono controllati a parte). Include le eccezioni di
//      strumenti/controlla-escape.eccezioni.txt (formato: file<TAB>espressione[<TAB>motivo])
//   D  testo da DB o da input utente senza escape (o con escape inadatto al contesto) -> da correggere
//   E  incerto -> da valutare
// File analizzati: html e js tracciati da git (solo file dell'app). Esclusi: test/, supabase/, node_modules, *.min.js, file generati
// (nessun file vendor è nel repository: le librerie arrivano da CDN). Solo gli script in linea degli html (senza src) sono analizzati.
// Limiti dichiarati: le concatenazioni con '+' di stringhe HTML (senza template) non sono analizzate; analisi statica euristica.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

// ---------- file ----------
function elencoFile() {
  let l;
  try { l = execSync('git ls-files', { cwd: radice, encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch { l = []; }
  return l.filter(f => /\.(html|js)$/.test(f) && !/^(test|supabase|node_modules|backups|pgsql)\//.test(f) && !/\.min\.js$/.test(f));
}

// ---------- scanner del codice JS ----------
const KW = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'instanceof', 'yield', 'await']);
// Cammina il codice da `i` (se stopBrace: fino alla graffa chiusa di livello 0, restituita come indice). Registra i template via cb.
function scanCode(src, i, stopBrace, cb) {
  const n = src.length; let depth = 0, prevSig = '', prevWord = '';
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") { let k = i + 1; while (k < n && src[k] !== c && src[k] !== '\n') { if (src[k] === '\\') k++; k++; } i = k + 1; prevSig = 'x'; prevWord = ''; continue; }
    if (c === '`') { const t = parseTemplate(src, i, cb); i = t.end; prevSig = 'x'; prevWord = ''; continue; }
    if (c === '/') {
      const regex = prevSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prevSig) || (/[a-z]/i.test(prevSig) && KW.has(prevWord));
      if (regex) { let q = i + 1, cls = false; while (q < n && src[q] !== '\n') { const e = src[q]; if (e === '\\') { q += 2; continue; } if (e === '[') cls = true; else if (e === ']') cls = false; else if (e === '/' && !cls) break; q++; } q++; while (q < n && /[a-z]/i.test(src[q])) q++; i = q; prevSig = 'x'; prevWord = ''; continue; }
    }
    if (c === '{') depth++;
    else if (c === '}') { if (stopBrace && depth === 0) return i; depth--; }
    if (/[A-Za-z0-9_$]/.test(c)) { let k = i; while (k < n && /[A-Za-z0-9_$]/.test(src[k])) k++; prevWord = src.slice(i, k); prevSig = src[k - 1]; i = k; continue; }
    if (!/\s/.test(c)) { prevSig = c; prevWord = ''; }
    i++;
  }
  return i;
}
// src[i] === '`'. Restituisce { start, end, statico, exprs:[{start,end,text}] }; chiama cb(template) se presente.
function parseTemplate(src, i, cb) {
  const start = i; i++; let statico = ''; const exprs = [];
  while (i < src.length && src[i] !== '`') {
    if (src[i] === '\\') { statico += src.slice(i, i + 2); i += 2; continue; }
    if (src[i] === '$' && src[i + 1] === '{') {
      const s = i + 2; const e = scanCode(src, s, true, cb);
      exprs.push({ start: s, end: e, text: src.slice(s, e) }); statico += '\u0001'; i = e + 1; continue;
    }
    statico += src[i]; i++;
  }
  const t = { start, end: i + 1, statico, exprs };
  if (cb) cb(t);
  return t;
}
const HTML_RE = /<[a-zA-Z\/!]|\s[\w-]+\s*=\s*["']/;

// ---------- maschera: contenuto di stringhe/template/commenti sostituito da spazi (lunghezza invariata) ----------
function maschera(s) {
  const o = s.split(''); let i = 0; const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '"' || c === "'") { let k = i + 1; while (k < n && s[k] !== c) { if (s[k] === '\\') { o[k] = ' '; k++; } o[k] = ' '; k++; } i = k + 1; continue; }
    if (c === '`') { const t = parseTemplate(s, i, null); for (let k = i + 1; k < t.end - 1; k++) o[k] = ' '; i = t.end; continue; }
    i++;
  }
  return o.join('');
}
// Divide al livello 0 per operatore (stringa); restituisce [parti] oppure null se l'operatore non c'è.
function dividi(expr, masc, op) {
  const parti = []; let dep = 0, ult = 0;
  for (let i = 0; i < masc.length; i++) {
    const c = masc[i];
    if ('([{'.includes(c)) dep++; else if (')]}'.includes(c)) dep--;
    else if (dep === 0 && masc.startsWith(op, i)) {
      if (op === '+' && (masc[i + 1] === '+' || masc[i - 1] === '+' || masc[i + 1] === '=')) continue;
      if (op === '-' && (masc[i + 1] === '-' || masc[i - 1] === '-' || masc[i + 1] === '>' || i === 0 || /[(\[,?:=*\/+\-&|!<>]/.test(masc.slice(0, i).trimEnd().slice(-1) || '('))) continue;
      if (op === '?' && (masc[i + 1] === '?' || masc[i + 1] === '.' || masc[i - 1] === '?')) continue;
      if (op === '*' && (masc[i + 1] === '*' || masc[i - 1] === '*')) continue;
      if (op === '||' || op === '&&' || op === '??') { /* ok */ }
      parti.push(expr.slice(ult, i)); ult = i + op.length; i += op.length - 1;
    }
  }
  if (!parti.length) return null; parti.push(expr.slice(ult)); return parti;
}
const parentesiChiusa = (masc, iniz) => { let dep = 0; for (let i = iniz; i < masc.length; i++) { if (masc[i] === '(') dep++; else if (masc[i] === ')') { dep--; if (dep === 0) return i; } } return -1; };

// ---------- indici sul codice (funzioni, assegnazioni) ----------
const files = new Map(); // nome -> { src, templates:[], base }
const funz = new Map();  // nome funzione -> [{file, corpo}]
const RANK = { A: 0, B: 1, C: 2, E: 3, D: 4 };
const peggiore = (a, b) => (RANK[b.cat] > RANK[a.cat] ? b : a);

function corpoDa(src, i) { // i = indice subito dopo la firma; ricava il corpo della funzione
  const mat = /^\s*(?:=>\s*)?/.exec(src.slice(i)); let k = i + (mat ? mat[0].length : 0);
  if (src[k] === '{') { const e = scanCode(src, k + 1, true, null); return src.slice(k, e + 1); }
  if (src[k] === '`') return src.slice(k, parseTemplate(src, k, null).end);
  const e = src.indexOf('\n', k); return src.slice(k, e < 0 ? undefined : e);
}
function indicizzaFunzioni(nome, src) {
  const add = (n, corpo, da) => { if (!funz.has(n)) funz.set(n, []); funz.get(n).push({ file: nome, corpo, fine: src.indexOf(corpo, da) + corpo.length }); };
  let m;
  const r1 = /function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*/g;
  while ((m = r1.exec(src))) add(m[1], corpoDa(src, m.index + m[0].length), m.index);
  const r2 = /([A-Za-z_$][\w$]*)\s*[=:]\s*(?:async\s+)?(?:function\s*\*?\s*[\w$]*\s*\([^)]*\)|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)\s*/g;
  while ((m = r2.exec(src))) add(m[1], corpoDa(src, m.index + m[0].length), m.index);
  const r3 = /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm; // metodi abbreviati
  while ((m = r3.exec(src))) if (!/^(if|for|while|switch|catch|function)$/.test(m[1])) add(m[1], corpoDa(src, m.index + m[0].length - 1), m.index);
}
const haMarkup = (corpo) => { let trovato = false; scanCode(corpo, 0, false, t => { if (/<[a-zA-Z]/.test(t.statico)) trovato = true; }); return trovato || /['"]<[a-zA-Z][^'"]*['"]/.test(corpo); };

// ---------- regole sui nomi di campo ----------
const NOMI_B = /^(id|.*_id|.*Id|n|i|j|k|idx|index|num|numero|count|tot|totale|qta|quantita|quantità|pezzi|minuti|.*_minuti|.*Minuti|ore|pct|perc|percent\w*|prezzo|importo|.*_at|.*_il|data|.*_data|data_.*|scadenza|progress\w*|pos|posizione|width|height|colspan|anno|mese|giorno|durata|versione|peso|ordine|nrighe|righe|conta|contatore|n[A-Z]\w*|num[A-Z]\w*|tot[A-Z]\w*)$/;
const NOMI_B2 = /^(ore\w*|\w*_ore\w*|n_\w+|\w*_previste|\w*_totali|pezzi_\w+|tempo\w*|fatt[io]|fatte|totali|size|step|ritardo\w*|riempimenti|campioni|settimane\w*|smalt|urgente|numero_\w+|nel_piano|speditiPeriodo|pp|minuti\w*|\w*_pct|\w*Pct|\w*_min|\w*_max|ym|soglia\w*|percentuale|tetto\w*)$/;
const NOMI_C = /^(\w*[Hh]tml|\w*HTML|opzioni|opts|optsHtml|opzDip|badge\w*|icona\w*|icon\w*|svg\w*)$/;
const NOMI_ENUM =/^(stato|stato_\w+|ruolo)$/;
const NOMI_D = /^(nome|cognome|note|nota|descrizione|cliente|codice|titolo|messaggio|motivo|etichetta|label|email|indirizzo|testo|commento|ragione|name|title|text|msg|desc|materiale|struttura|fase|macchina|operatore|lavorazione|prodotto|tipo|categoria|gruppo|nome_file|filename|url|riferimento|rif|segnalazione|errore|error|message|\w*_nome|nome_\w+|\w*[nN]ote|\w*_testo|\w*[dD]escrizione|\w*[cC]liente\w*|\w*[cC]odice\w*|\w*[tT]itolo|\w*[mM]otivo|\w*[mM]essaggio|\w*[lL]abel|\w*[eE]tichetta|\w*[nN]ome|\w*[tT]esto)$/;
const NOMI_FMT = /^(formatDate|formatDateTime|formatTime|formatDuration|formatMinuti|formatMin|fmt\w*|formatta\w*|oreMinuti|minutiInOre|dataIt|oraIt)$/;

function ultimoSegmento(t) {
  const m = /([A-Za-z_$][\w$]*)\s*(?:\[[^\]]*\])?\s*$/.exec(t.replace(/\(\s*\)$/, '')); return m ? m[1] : '';
}

function ritorni(corpo) { // espressioni restituite: return ... oppure corpo-espressione di una freccia
  const out = []; const c = corpo.trim();
  if (c[0] !== '{') { out.push(c.replace(/;\s*$/, '')); return out; }
  const re = /(?:^|[^a-zA-Z0-9_$.])return +/g; let m;
  while ((m = re.exec(c))) { const k = m.index + m[0].length; if (c[k] === '`') { const e = parseTemplate(c, k, null).end; out.push(c.slice(k, e)); } else { let e = k; while (e < c.length && c[e] !== ';' && c[e] !== '\n') e++; out.push(c.slice(k, e)); } }
  return out;
}
// ---------- classificazione ----------
// Fine dell'istruzione che inizia in k: fino a fine riga, ma si prosegue se le parentesi sono aperte o la riga dopo continua con . ? : + | &
function fineIstruzione(src, k) {
  let fine = src.indexOf('\n', k); if (fine < 0) return src.length;
  for (let giri = 0; giri < 60; giri++) {
    const m = maschera(src.slice(k, fine)); let dp = 0; for (const ch of m) { if ('([{'.includes(ch)) dp++; else if (')]}'.includes(ch)) dp--; }
    const prossima = /^\s*([^\s])/.exec(src.slice(fine + 1, fine + 200)); const continua = prossima && '.?:+|&'.includes(prossima[1]);
    if (dp <= 0 && !continua) break;
    const a = src.indexOf('\n', fine + 1); if (a < 0) return src.length; fine = a;
  }
  return fine;
}
// RHS (fino a ; o fine riga) delle assegnazioni del nome tra la dichiarazione più vicina PRIMA di `pos` e `pos` (ambito approssimato).
// Se la dichiarazione non è una const/let/var con assegnazione (parametro, destrutturazione, ciclo) restituisce [] (si usano le regole sui nomi).
function assegnazioni(src, nome, pos) {
  const n = nome.replace(/\$/g, '\\$'); const limite = pos == null ? src.length : pos;
  const dichiarazioni = [...src.slice(0, limite).matchAll(new RegExp('(?:\\b(?:const|let|var)\\s+' + n + '\\b|[(,]\\s*' + n + '\\s*(?=[,)=])|(?<![\\w$.])' + n + '\\s*=>|\\b(?:const|let|var)\\s*[\\[{][^=;]*\\b' + n + '\\b[^=;]*[\\]}]\\s*=|\\bfor\\s*\\(\\s*(?:const|let|var)\\s+' + n + '\\b)', 'g'))];
  if (!dichiarazioni.length) return [];
  const ultima = dichiarazioni[dichiarazioni.length - 1];
  if (!/^(?:const|let|var)\s+[\w$]+$/.test(ultima[0].trim()) || /^for/.test(ultima[0])) return [];
  const out = []; const re = new RegExp('(?:^|[^\\w$.])' + n + '\\s*(?:=|\\+=)(?!=)\\s*', 'g'); re.lastIndex = ultima.index; let m;
  while ((m = re.exec(src)) && m.index < limite) {
    const k = m.index + m[0].length; let fine;
    if (src[k] === '`') fine = parseTemplate(src, k, null).end; else fine = fineIstruzione(src, k);
    out.push({ rhs: src.slice(k, fine).replace(/;\s*$/, ''), pos: k });
    if (out.length >= 8) break;
  }
  return out;
}
const fin = (cat, motivo) => ({ cat, motivo });

function classifica(expr, ctx, src, prof = 0) {
  const t = expr.trim(); const masc = maschera(t);
  if (!t) return fin('B', 'vuoto');
  // parentesi esterne
  if (t[0] === '(' && parentesiChiusa(masc, 0) === t.length - 1) return classifica(t.slice(1, -1), ctx, src, prof);
  // operatori logici/ternario
  let p = dividi(t, masc, '?');
  if (p && p.length >= 2) { const resto = t.slice(p[0].length + 1); const mr = masc.slice(p[0].length + 1); const q = dividi(resto, mr, ':'); const rami = q ? q : [resto]; return rami.map(r => classifica(r, ctx, src, prof)).reduce(peggiore); }
  p = dividi(t, masc, '||') || dividi(t, masc, '??'); if (p) return p.map(r => classifica(r, ctx, src, prof)).reduce(peggiore);
  p = dividi(t, masc, '&&'); if (p) return classifica(p[p.length - 1], ctx, src, prof);
  if (/^!/.test(t) || dividi(t, masc, '===') || dividi(t, masc, '!==') || dividi(t, masc, '==') || dividi(t, masc, '!=') || dividi(t, masc, '>=') || dividi(t, masc, '<=')) return fin('B', 'booleano');
  for (const op of ['*', '/', '%']) if (dividi(t, masc, op)) return fin('B', 'operazione aritmetica: numero');
  p = dividi(t, masc, '+'); if (p) return p.map(r => classifica(r, ctx, src, prof)).reduce(peggiore);
  p = dividi(t, masc, '-'); if (p) return fin('B', 'sottrazione: numero');
  // letterali
  if (/^(['"])(?:(?!\1)[^\\]|\\.)*\1$/.test(t)) return fin('B', 'costante di testo');
  if (/^-?\d+(\.\d+)?$/.test(t) || /^(true|false|null|undefined)$/.test(t)) return fin('B', 'costante');
  if (t[0] === '`') {
    const tp = parseTemplate(t, 0, null);
    if (tp.end === t.length) { if (HTML_RE.test(tp.statico)) return fin('C', 'template annidato con markup (controllato a parte)'); return tp.exprs.map(x => classifica(x.text, ctx, src, prof)).reduce(peggiore, fin('B', 'template senza interpolazioni')); }
  }
  // trasformazioni di stringa/numero: la categoria è quella dell'origine (String(x), x.replace(...), x.toLowerCase()...)
  let mt = /^String\s*\(/.exec(t);
  if (mt && parentesiChiusa(masc, mt[0].length - 1) === t.length - 1) return classifica(t.slice(mt[0].length, -1), ctx, src, prof);
  mt = /^(.+)\.(replace|replaceAll|toLowerCase|toUpperCase|trim|slice|substring|padStart|padEnd|toString|split|charAt|at)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)(\s*\[\d+\])?$/s.exec(t);
  if (mt && !/^(escapeHtml|escapeJsAttr|esc)\s*\(/.test(t)) { const r = classifica(mt[1], ctx, src, prof); return fin(r.cat, r.motivo + ' (trasformazione ' + mt[2] + ')'); }
  if (/\.(findIndex|indexOf|lastIndexOf|size|count|reduce)\s*\([^)]*\)?$|\.(length|size)$/.test(t) && !/\.join\(/.test(t)) return fin('B', 'indice o conteggio numerico');
  // escape
  let m = /^(escapeHtml|escapeJsAttr|esc)\s*\(/.exec(t);
  if (m && parentesiChiusa(masc, m[0].length - 1) === t.length - 1) {
    const f = m[1]; const interno = t.slice(m[0].length, -1);
    if (ctx.tipo === 'onclick' && f !== 'escapeJsAttr') {
      const ic = classifica(interno, { tipo: 'testo', pos: ctx.pos }, src, prof + 1);
      if (ic.cat === 'B') return fin('B', 'valore non testuale dentro onclick');
      return fin('D', f + ' in onclick: un apice nel testo esce dalla stringa JS (serve escapeJsAttr)');
    }
    if (ctx.tipo === 'attr' && ctx.quote === "'" && f === 'escapeHtml') return fin('D', "escapeHtml non escapa l'apostrofo, attributo tra apici singoli");
    if (ctx.tipo === 'tag') return fin('E', 'escape in posizione di tag/attributo senza apici');
    return fin('A', f + ' adatto al contesto');
  }
  // .map(...).join(...)
  { const mj = /^([A-Za-z_$][\w$.]*)\.join\s*\(/.exec(t);
    if (mj && parentesiChiusa(masc, mj[0].length - 1) === t.length - 1) {
      const nome = ultimoSegmento(mj[1]); const pushes = [...src.matchAll(new RegExp(nome.replace(/\$/g, '\\$') + '\\s*\\.push\\s*\\(\\s*([^)]{0,200})', 'g'))].map(x => x[1]);
      if (pushes.length && pushes.every(x => /^\s*[`'"]\s*<|^\s*[A-Za-z_$][\w$]*\s*$|^\s*`/.test(x))) return fin('C', 'frammenti di markup accodati con push in ' + nome + ' (template controllati a parte)');
      return fin('E', 'join di ' + nome + ': contenuto dell\'array non determinabile');
    } }
  // mappa di costanti: {a:'x', b:'y'}[chiave]
  if (/^\{[\s\S]*\}\s*\[[^\]]+\]$/.test(t) && !/\$\{|escapeHtml|\+/.test(t)) return fin('B', 'mappa di costanti indicizzata');
  // testi fissi del codice (Etichette): proprietà senza chiamata = testo scritto nel codice; le funzioni di configurazione restituiscono dati da DB
  { const me = /^Etichette\.([A-Za-z_$][\w$]*)/.exec(t);
    if (me && !/\.map\s*\(/.test(t)) {
      const CONFIG = /^(struttura|tipoProdotto|materiale|opzione|attributo|attributiCustom|attributiLato|latoEtichetta|latiAttivi|valoriLatoOrdine|riepilogoLato|lavorazioniCncOrdine|valoreAttributoCustom|attributiOrdine|prioritaEtichetta|prioritaPeso)$/;
      if (CONFIG.test(me[1])) return fin('D', 'etichetta di configurazione da DB (Etichette.' + me[1] + '), scritta dal responsabile');
      if (/^Etichette\.[\w$.]+$/.test(t) || /^Etichette\.(stato\w*|origineVocePiano|dataBreve|minutiTesto)\s*\(/.test(t)) return fin('B', 'testo fisso o enum chiuso di Etichette');
    } }
  // elenco di testi: ...map(CB).join(...) — si classifica quello che restituisce la callback
  { const mj = /\.map\s*\(/g; let ult = -1, q; while ((q = mj.exec(masc))) { let dp = 0; for (const ch of masc.slice(0, q.index)) { if ('([{'.includes(ch)) dp++; else if (')]}'.includes(ch)) dp--; } if (dp === 0) ult = q.index; }
    if (ult >= 0 && /\.join\s*\(/.test(masc.slice(ult))) {
      const ap = masc.indexOf('(', ult); const ch = parentesiChiusa(masc, ap);
      if (ch > 0) {
        const cb = t.slice(ap + 1, ch).trim(); let esiti = [];
        if (/^(escapeHtml|esc)$/.test(cb)) return fin('A', 'elenco escapato con map(' + cb + ')');
        const fr = /^(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*/.exec(cb);
        if (fr) { const corpo = cb.slice(fr[0].length).trim(); esiti = (corpo[0] === '{' ? ritorni(corpo) : [corpo]).map(e => classifica(e, { tipo: 'testo', pos: ctx.pos }, src, prof + 1)); }
        else if (/^[A-Za-z_$][\w$.]*$/.test(cb)) { const df = funz.get(ultimoSegmento(cb)); if (df && df.some(d => haMarkup(d.corpo))) return fin('C', 'elenco di markup da ' + cb + ' (template controllati a parte)'); }
        if (esiti.length) { const w = esiti.reduce(peggiore); return fin(w.cat, 'elenco map/join: ' + w.motivo); }
      }
    } }
  if (/\.join\s*\(/.test(t) && /\.map\s*\(/.test(t)) return fin('E', 'map/join con callback non analizzabile');
  // numerici
  if (/^(Number|parseInt|parseFloat|Math\.\w+|String\(\s*(Number|Math))\s*\(/.test(t)) return fin('B', 'conversione numerica');
  if (/\.(toFixed|toLocaleString|toLocaleDateString|toLocaleTimeString|toISOString|getTime|getFullYear|getMonth|getDate|getHours|getMinutes)\s*\([^)]*\)$/.test(t) || /\.length$/.test(t)) return fin('B', 'numero o data formattata');
  // chiamate
  m = /^([\w$.]+?)\s*\(/.exec(t);
  if (m && parentesiChiusa(masc, m[0].length - 1) === t.length - 1) {
    const nome = ultimoSegmento(m[1]);
    if (NOMI_FMT.test(nome) && !funz.has(nome)) return fin('B', 'formattatore numerico/data');
    const defs = funz.get(nome);
    if (defs && defs.length) {
      if (defs.some(d => haMarkup(d.corpo))) return fin('C', 'helper che restituisce markup: ' + nome + ' (template interni controllati a parte)');
      if (NOMI_FMT.test(nome)) return fin('B', 'formattatore ' + nome + ' senza markup');
      if (prof < 3) { const rr = []; for (const d of defs) for (const e of ritorni(d.corpo)) rr.push(classifica(e, { tipo: 'testo', pos: d.fine }, files.get(d.file).src, prof + 1)); if (rr.length) { const w = rr.reduce(peggiore); if (w.cat === 'B' || w.cat === 'A' || w.cat === 'C') return fin(w.cat, 'valore restituito da ' + nome + '(): ' + w.motivo); return fin(w.cat, nome + '() restituisce: ' + w.motivo); } }
      return fin('E', 'funzione ' + nome + '() senza markup e senza return analizzabili');
    }
    return fin('E', 'chiamata a ' + nome + '() non risolta nel codice');
  }
  // identificatore o catena di proprietà
  if (/^[A-Za-z_$][\w$]*(?:\s*\?*\.\s*[A-Za-z_$][\w$]*|\s*\?\.\[[^\]]*\]|\[[^\]]*\])*$/.test(t)) {
    const semplice = /^[A-Za-z_$][\w$]*$/.test(t);
    if (semplice && prof < 2) {
      const ass = assegnazioni(src, t, ctx.pos);
      if (ass.length) {
        const r = ass.map(a => classifica(a.rhs, { tipo: 'testo', pos: a.pos }, src, prof + 1)).reduce(peggiore);
        if (r.cat === 'B' || r.cat === 'C' || r.cat === 'A') return fin(r.cat, 'variabile ' + t + ' assegnata con: ' + r.motivo);
        if (r.cat === 'D' || r.cat === 'E') { /* ricade sulla regola del nome sotto */ }
      }
    }
    const nome = ultimoSegmento(t);
    if (NOMI_ENUM.test(nome)) return fin('B', "valore di enum chiuso del database (" + nome + ")");
    if (NOMI_B.test(nome) || NOMI_B2.test(nome)) return fin('B', 'id/numero/data (' + nome + ')');
    if (semplice && NOMI_C.test(nome)) return fin('E', 'variabile di markup (' + nome + ') costruita per concatenazione: verificare i punti di assegnazione');
    if (NOMI_D.test(nome)) return fin('D', 'testo da DB/utente (' + nome + ')');
    return fin('E', 'origine non determinabile (' + nome + ')');
  }
  return fin('E', 'espressione non classificabile');
}

// ---------- contesto ----------
function contesto(statico, idx) {
  const prima = statico.slice(0, idx); const lt = prima.lastIndexOf('<'), gt = prima.lastIndexOf('>');
  let tail;
  if (lt > gt) tail = prima.slice(lt); else if (lt === -1 && gt === -1) tail = prima; else return { tipo: 'testo' };
  const m = /([\w:-]+)\s*=\s*(["'])((?:(?!\2)[\s\S])*)$/.exec(tail);
  if (m) return { tipo: /^on/i.test(m[1]) ? 'onclick' : 'attr', attr: m[1], quote: m[2] };
  if (lt > gt) return { tipo: 'tag' };
  return { tipo: 'testo' };
}

// ---------- eccezioni ----------
const eccezioni = new Set();
try {
  for (const r of fs.readFileSync(path.join(radice, 'strumenti', 'controlla-escape.eccezioni.txt'), 'utf8').split('\n')) {
    if (!r.trim() || r.startsWith('#')) continue; const [f, e] = r.split('\t'); if (f && e) eccezioni.add(f.trim() + '\t' + e.trim());
  }
} catch { /* file facoltativo */ }

// ---------- esecuzione ----------
const lista = elencoFile();
for (const f of lista) {
  const s = fs.readFileSync(path.join(radice, f), 'utf8');
  if (f.endsWith('.html')) {
    // script in linea: lo sorgente è sostituito da spazi altrove, così gli offset (e le righe) restano quelli del file
    let corpo = ' '.repeat(s.length).split(''); const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
    while ((m = re.exec(s))) { if (/\bsrc\s*=/.test(m[1]) || /type\s*=\s*["'](?!text\/javascript|module)/.test(m[1])) continue; const off = m.index + m[0].indexOf('>') + 1; for (let k = 0; k < m[2].length; k++) corpo[off + k] = s[off + k]; }
    // mantieni i ritorni a capo
    corpo = corpo.map((c, k) => (s[k] === '\n' ? '\n' : c)).join('');
    files.set(f, { src: corpo, orig: s });
  } else files.set(f, { src: s, orig: s });
}
for (const [f, d] of files) indicizzaFunzioni(f, d.src);

const risultati = [];
for (const [f, d] of files) {
  const righe = []; let o = 0; for (const r of d.orig.split('\n')) { righe.push(o); o += r.length + 1; }
  const rigaDi = (pos) => { let a = 0, b = righe.length - 1; while (a < b) { const mid = (a + b + 1) >> 1; if (righe[mid] <= pos) a = mid; else b = mid - 1; } return a + 1; };
  const funzioneDi = (pos) => { const pre = d.src.slice(Math.max(0, pos - 6000), pos); let ult = ''; const re = /(?:function\s*\*?\s*([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*[=:]\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>)/g; let m; while ((m = re.exec(pre))) ult = m[1] || m[2]; return ult; };
  const tpls = [];
  scanCode(d.src, 0, false, t => tpls.push(t));
  for (const t of tpls) {
    if (!t.exprs.length || !HTML_RE.test(t.statico)) continue;
    t.exprs.forEach((x, k) => {
      // posizione dell'espressione nel template (indice nello statico = posizione del k-esimo segnaposto)
      let idx = -1; for (let q = 0; q <= k; q++) idx = t.statico.indexOf('\u0001', idx + 1);
      const ctx = contesto(t.statico, idx);
      let r = classifica(x.text, { ...ctx, pos: x.start }, d.src);
      const expr = x.text.trim().replace(/\s+/g, ' ');
      if ((r.cat === 'D' || r.cat === 'E') && (eccezioni.has(f + '\t' + expr) || eccezioni.has(f + '\t' + (expr.length > 140 ? expr.slice(0, 137) + '...' : expr)))) r = fin('C', 'eccezione confermata (file eccezioni)');
      risultati.push({ file: f, riga: rigaDi(x.start), espressione: expr.length > 140 ? expr.slice(0, 137) + '...' : expr, categoria: r.cat, motivo: r.motivo, contesto: ctx.tipo + (ctx.attr ? ':' + ctx.attr + ctx.quote : ''), funzione: funzioneDi(x.start), campo: ultimoSegmento(x.text.trim()) });
    });
  }
}
risultati.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.riga - b.riga));

if (args.has('--json')) { console.log(JSON.stringify(risultati, null, 1)); process.exit(0); }
const tot = { A: 0, B: 0, C: 0, D: 0, E: 0 }; for (const r of risultati) tot[r.categoria]++;
const stampa = (r) => console.log(`${r.categoria}  ${r.file}:${r.riga}  \${${r.espressione}}  [${r.contesto}]  ${r.motivo}`);
if (args.has('--elenco')) risultati.forEach(stampa);
else risultati.filter(r => r.categoria === 'D' || r.categoria === 'E').forEach(stampa);
console.log(`\nFile analizzati: ${files.size} · interpolazioni in template HTML: ${risultati.length}`);
console.log(`TOTALI  A (con escape): ${tot.A} · B (sicuri per natura): ${tot.B} · C (markup costruito dal codice): ${tot.C} · D (da correggere): ${tot.D} · E (da valutare): ${tot.E}`);
// Concatenazioni '+' con markup (fuori dall'analisi dei template): solo elenco, da valutare a mano
const concat = [];
for (const [f, d] of files) d.src.split('\n').forEach((r, k) => { if (/['"][^'"`]*<[a-zA-Z][^'"`]*['"] *\+|\+ *['"][^'"`]*<[a-zA-Z/]/.test(r)) concat.push(`${f}:${k + 1}  ${r.trim().slice(0, 110)}`); });
if (concat.length) { console.log(`\nConcatenazioni '+' con markup non analizzate (${concat.length}), da valutare a mano:`); concat.forEach(r => console.log('  ' + r)); }
if (args.has('--strict') && (tot.D || tot.E)) process.exit(1);
