// Installa l'hook pre-commit locale (copia strumenti/hook-pre-commit.sh in .git/hooks/pre-commit).
// Idempotente: si puo' rilanciare dopo ogni nuovo clone. Uso: node strumenti/installa-hook.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const radice = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const origine = path.join(radice, 'strumenti', 'hook-pre-commit.sh');
const dirHook = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: radice, encoding: 'utf8' }).trim();
const destinazione = path.resolve(radice, dirHook, 'pre-commit');

fs.mkdirSync(path.dirname(destinazione), { recursive: true });
const testo = fs.readFileSync(origine, 'utf8').replace(/\r\n/g, '\n');
fs.writeFileSync(destinazione, testo, { mode: 0o755 });
fs.chmodSync(destinazione, 0o755);
console.log('Hook pre-commit installato: ' + destinazione);
