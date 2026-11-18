#!/bin/sh
# Controlli automatici prima del commit: sintassi + escape dei valori inseriti in HTML.
# Installazione: node strumenti/installa-hook.mjs (copia questo file in .git/hooks/pre-commit).
RADICE=$(git rev-parse --show-toplevel 2>/dev/null) || RADICE=.
cd "$RADICE" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "COMMIT BLOCCATO: node non e' nel PATH, i controlli non possono girare." >&2
  echo "Installa Node.js o apri un terminale in cui 'node' funziona, poi riprova." >&2
  exit 1
fi

node strumenti/controlla-sintassi.mjs
rc=$?
if [ $rc -ne 0 ]; then
  echo "" >&2
  echo "COMMIT BLOCCATO: controlla-sintassi non e' passato (codice $rc)." >&2
  echo "Correggi l'errore di sintassi indicato sopra e riprova." >&2
  echo "Nota: i controlli leggono i file su disco, anche quelli non in stage." >&2
  exit $rc
fi

node strumenti/controlla-escape.mjs --strict
rc=$?
if [ $rc -ne 0 ]; then
  echo "" >&2
  echo "COMMIT BLOCCATO: controlla-escape --strict ha trovato valori inseriti in HTML senza escape (codice $rc)." >&2
  echo "Come procedere: usa escapeHtml (testo e attributi tra doppi apici) o escapeJsAttr (argomenti degli handler inline)." >&2
  echo "Solo se l'HTML e' costruito dal codice o i valori sono fissi: riga con motivo in strumenti/controlla-escape.eccezioni.txt." >&2
  echo "Nota: i controlli leggono i file su disco, anche quelli non in stage." >&2
  exit $rc
fi
exit 0
