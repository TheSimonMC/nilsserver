// GitHub-Pages-Version ohne eigenes Backend.
// Spielerzahlen/Status werden aus status.json gelesen.
// Du kannst status.json später manuell oder über deinen eigenen Workflow aktualisieren.
window.NILSSERVER_CONFIG = {
  address: "nilsserver.net",
  statusSource: "status.json",
  refreshMs: 30000,
  statusLabel: "Serverdaten",

  // Fallback, falls status.json nicht erreichbar ist.
  // Keine erfundenen Spielerzahlen: Werte auf null lassen, bis du echte Daten einträgst.
  fallbackStatus: {
    online: null,
    players: {
      online: null,
      max: null
    },
    updatedAt: null
  }
};
