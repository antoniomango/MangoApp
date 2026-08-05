// js/config.js — unico punto di configurazione degli ambienti (produzione/test)
//
// Script classico (non ES module): i tre file HTML dichiarano funzioni e
// oltre 250 attributi onclick inline che si aspettano SUPABASE_URL/SUPABASE_ANON
// come identificatori globali di script classico, condivisi fra i vari <script>
// della stessa pagina. Un modulo ES ha uno scope proprio e non li esporrebbe
// come globali senza toccare ogni funzione richiamata da onclick — qui
// serve la forma meno invasiva possibile rispetto al codice esistente.

const AMBIENTI = {
  produzione: {
    url:  'https://mtpzfxnyfkzikzlkomwz.supabase.co',
    anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10cHpmeG55Zmt6aWt6bGtvbXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NzczNzEsImV4cCI6MjA5NzI1MzM3MX0.3JxpgQORCSUUdSgawmcizNgaJhpDnmQ_zT_c41WfJbs'
  },
  test: {
    url:  'https://kpdlynvmsoctagwtzrxr.supabase.co',
    anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZGx5bnZtc29jdGFnd3R6cnhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjE3MzgsImV4cCI6MjA5Nzk5NzczOH0._2rKWXsJDFOI42IrN4lJiWFpbC5eievSRWsuFC1BURM'
  }
};

function rilevaAmbiente() {
  const daUrl = new URLSearchParams(location.search).get('env');
  if (daUrl) {
    if (AMBIENTI[daUrl]) {
      localStorage.setItem('mangoapp-env', daUrl);
      return daUrl;
    }
    // Parametro presente ma sconosciuto (es. errore di battitura): default
    // sicuro a produzione, e ripulisce lo stato salvato — un typo non deve
    // MAI lasciare l'app agganciata a un ambiente non-produzione per errore.
    localStorage.removeItem('mangoapp-env');
    return 'produzione';
  }
  const salvato = localStorage.getItem('mangoapp-env');
  if (salvato && AMBIENTI[salvato]) return salvato;
  return 'produzione';
}

const AMBIENTE      = rilevaAmbiente();
const SUPABASE_URL  = AMBIENTI[AMBIENTE].url;
const SUPABASE_ANON = AMBIENTI[AMBIENTE].anon;
const IS_PRODUZIONE = AMBIENTE === 'produzione';

// Versione del client — da incrementare SEMPRE insieme a CACHE in sw.js (stesso valore,
// stesso commit). Letta da responsabile.html per la guardia di versione sulle operazioni
// distruttive (esportazione/archiviazione) — vedi Checklist-Sicurezza.md nel vault.
const APP_VERSION = 'mango-v13';

// ═══════════════════════════════════════════════
// INDICATORE VISIVO — banda fissa quando non produzione
// ═══════════════════════════════════════════════
function mostraBandaAmbienteTest() {
  if (IS_PRODUZIONE) return;
  const banda = document.createElement('div');
  banda.id = 'mango-banda-ambiente';
  banda.textContent = `⚠ AMBIENTE DI ${AMBIENTE.toUpperCase()} — NON È PRODUZIONE ⚠`;
  banda.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:999999',
    'background:#B03A2E', 'color:#fff', 'font-family:sans-serif',
    'font-weight:700', 'font-size:13px', 'letter-spacing:0.5px',
    'text-align:center', 'padding:6px 8px', 'box-shadow:0 2px 6px rgba(0,0,0,0.3)'
  ].join(';');
  document.body.prepend(banda);
  // Spinge il contenuto sotto la banda invece di sovrapporlo.
  document.body.style.paddingTop = '32px';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mostraBandaAmbienteTest);
} else {
  mostraBandaAmbienteTest();
}
