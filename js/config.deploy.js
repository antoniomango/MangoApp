// js/config.deploy.js — configurazione di DEPLOY (facoltativa), caricata PRIMA di js/config.js.
//
// Serve a chi installa MangoApp su un proprio server/progetto Supabase senza toccare js/config.js:
// copiare qui gli indirizzi e la chiave pubblica ("anon") del proprio progetto. La chiave anon e'
// pubblica per progetto (sta in ogni client): NON inserire qui mai la ruolo_di_servizio, password o token.
//
// Esempio (togliere i commenti e sostituire i valori):
//   window.MANGO_CONFIG = {
//     ambienti: {
//       produzione: { url: 'https://IL-TUO-PROGETTO.supabase.co', anon: 'LA-TUA-CHIAVE-ANON' },
//       // test: { url: '...', anon: '...' }     // facoltativo
//     },
//     ambienteDefault: 'produzione'              // facoltativo
//   };
//
// Con il file cosi' com'e' (vuoto) valgono i valori predefiniti di js/config.js (GitHub Pages).
window.MANGO_CONFIG = window.MANGO_CONFIG || {};
