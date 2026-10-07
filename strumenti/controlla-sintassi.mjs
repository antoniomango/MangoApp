// Controllo di sintassi obbligatorio PRIMA di ogni commit di rilascio.
// Estrae ogni <script> in linea dei file HTML della radice e lo controlla con `node --check`, poi controlla js/*.js e sw.js.
// Uso: node strumenti/controlla-sintassi.mjs   (esce con codice 1 se anche un solo blocco ha un errore)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sintassi-'));
let blocchi = 0, errori = 0;

function controlla(codice, ext, etichetta) {
  const f = path.join(tmp, 'blocco' + (++blocchi) + ext);
  fs.writeFileSync(f, codice);
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { errori++; console.error('ERRORE in ' + etichetta + String.fromCharCode(10) + (r.stderr || '').split(f).join(etichetta)); }
}

for (const nome of fs.readdirSync(radice).filter(n => n.endsWith('.html')).sort()) {
  const h = fs.readFileSync(path.join(radice, nome), 'utf8');
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(h))) {
    const attr = m[1];
    if (/\bsrc\s*=/.test(attr)) continue;
    const tipo = (attr.match(/type\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (tipo && !/^(module|text\/javascript|application\/javascript)$/i.test(tipo)) continue;   // json, template, ecc.
    n++;
    controlla(m[2], tipo === 'module' ? '.mjs' : '.js', `${nome} (script in linea n. ${n})`);
  }
  console.log(`${nome}: ${n} script in linea`);
}
for (const nome of [...fs.readdirSync(path.join(radice, 'js')).filter(n => n.endsWith('.js')).map(n => 'js/' + n), 'sw.js']) {
  const r = spawnSync(process.execPath, ['--check', path.join(radice, nome)], { encoding: 'utf8' });
  blocchi++;
  if (r.status !== 0) { errori++; console.error('ERRORE in ' + nome + '\n' + r.stderr); } else console.log(nome + ': ok');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(errori ? `\nSINTASSI NON VALIDA: ${errori} errori su ${blocchi} blocchi — NON rilasciare.` : `\nSintassi valida: ${blocchi} blocchi controllati, nessun errore.`);
process.exit(errori ? 1 : 0);
