# 🌐 External URL Injection / Chatbot Bridge — Piano Tecnico

> **Stato:** Pianificato (Phase 4, opzionale)
> **Stima implementazione:** ~2 ore
> **Dipendenze:** Nessuna (PHP puro, nessun Node.js o WebSocket server)

---

## Obiettivo

Permettere a un sistema esterno (chatbot, script Python, curl, altra tab browser) di:

1. **Inviare un URL** al VD Browser e farlo navigare automaticamente
2. **Triggerare azioni AI** (summarize, screenshot, extract links, form fill, ecc.)
3. **Ricevere il risultato** in modo asincrono via webhook o BroadcastChannel

---

## Architettura a 3 livelli

Tre layer progressivi — ognuno autonomo, non dipende dagli altri:

```
┌─────────────────────────────────────────────────────┐
│  Layer 1 — URL Parameters     (apertura one-shot)   │
│  Layer 2 — BroadcastChannel  (same-origin / tabs)   │
│  Layer 3 — PHP SSE Bridge    (sistema esterno)      │
└─────────────────────────────────────────────────────┘
```

---

## Layer 1 — URL Parameter Bootstrap

**Caso d'uso:** il chatbot apre una nuova finestra/tab del VD Browser già puntata a un URL specifico, con un'azione AI pre-triggerata.

**Endpoint:**
```
vd-browser.php?inject=BASE64_JSON
```

**Struttura JSON:**
```json
{
  "url": "https://esempio.com",
  "action": "summarize",
  "lang": "it"
}
```

**Azioni supportate:** `navigate`, `summarize`, `extract_links`, `screenshot`, `form_fill`, `translate`, `rebuild`

**Flusso JS — `initUrlInjection()` chiamato in `boot()`:**

1. Legge `?inject=...` dai query params
2. Decodifica Base64 → JSON
3. Chiama `navigate(json.url)` (funzione già esistente)
4. Aspetta `iframe.onload`
5. Esegue l'azione AI richiesta (es. `runAiAction('summarize')`)
6. Apre il pannello AI con il risultato visibile

**File modificati:** solo `vd-browser.js` (+20 righe)
**File nuovi:** nessuno

---

## Layer 2 — BroadcastChannel (same-origin)

**Caso d'uso:** il chatbot gira sulla stessa origin del VD Browser (es. VivacityAI Studio sullo stesso server) e vuole controllare il browser da un'altra tab senza aprire una nuova finestra.

**Lato chatbot (altra tab, stessa origin):**
```javascript
const bc = new BroadcastChannel('vdb-bridge');

// Invia un comando
bc.postMessage({
  id: 'cmd_001',
  type: 'summarize',
  url: 'https://github.com'
});

// Ricevi il risultato
bc.onmessage = e => {
  if (e.data.id === 'cmd_001') {
    console.log('Risultato:', e.data.result.text);
  }
};
```

**Lato VD Browser — in `boot()`:**
```javascript
window._vdbBridge = new BroadcastChannel('vdb-bridge');
window._vdbBridge.onmessage = e => handleBridgeCommand(e.data);
```

**Risposta con risultato:**
```javascript
window._vdbBridge.postMessage({
  id: cmd.id,
  status: 'ok',
  type: cmd.type,
  result: { text: aiOutput }
});
```

**File modificati:** solo `vd-browser.js` (+30 righe)
**File nuovi:** nessuno

---

## Layer 3 — PHP SSE Bridge (sistema esterno)

**Caso d'uso:** chatbot Python, script Node.js, curl — qualsiasi sistema che può fare richieste HTTP.

### Diagramma architetturale

```
[Chatbot esterno]
     │
     │  POST bridge.php?action=cmd&token=SECRET
     │  body: { type, url, session, params, callback_url }
     ▼
┌──────────────┐
│  bridge.php  │──── scrive ────► bridge_queue.json
│              │
│              │◄─── SSE stream ─── [VD Browser JS]
│              │    (EventSource,                │
│              │     poll ogni 1.5s)             │
│              │                                 │
│              │◄─── POST result ────────────────┘
│              │     bridge.php?action=result
└──────────────┘
     │
     │  (opzionale) POST callback_url
     ▼
[Chatbot riceve risultato]
```

### `bridge.php` — 3 endpoint in un file

| Endpoint | Metodo | Autenticazione | Descrizione |
|----------|--------|----------------|-------------|
| `bridge.php?action=listen&session=UUID&token=SECRET` | GET | token | SSE stream — VD Browser si connette qui al boot |
| `bridge.php?action=cmd&token=SECRET` | POST | token | Chatbot invia un comando JSON |
| `bridge.php?action=result&session=UUID&token=SECRET` | POST | token | VD Browser risponde con il risultato |

### `bridge_queue.json` — formato

```json
{
  "cmd_abc123": {
    "id": "cmd_abc123",
    "session": "vdb_uuid_qui",
    "type": "summarize",
    "url": "https://github.com",
    "params": {
      "prompt": "Spiega in italiano",
      "lang": "it"
    },
    "callback_url": "https://my-chatbot.example.com/webhook",
    "status": "pending",
    "created_at": "2026-06-05T01:00:00Z"
  }
}
```

> File auto-creato da `bridge.php` se non esiste. Richiede permesso di scrittura (chmod 664).
> Pulizia automatica dei comandi con `status=done` dopo 5 minuti.

---

## Protocollo Comandi

### Comando (chatbot → bridge.php → VD Browser)

```json
{
  "id": "cmd_abc123",
  "session": "vdb_uuid",
  "type": "navigate | summarize | screenshot | extract_links | translate | form_fill | rebuild | run_ai",
  "url": "https://esempio.com",
  "params": {
    "prompt": "Testo libero per run_ai",
    "lang": "it"
  },
  "callback_url": "https://my-chatbot.example.com/webhook"
}
```

> `callback_url` è opzionale. Se omesso, il risultato è recuperabile solo via SSE/BroadcastChannel.

### Risultato (VD Browser → bridge.php → callback)

```json
{
  "id": "cmd_abc123",
  "status": "ok | error",
  "type": "summarize",
  "url": "https://esempio.com",
  "result": {
    "text": "La pagina descrive...",
    "screenshot_base64": null,
    "links": null
  },
  "error": null,
  "timestamp": "2026-06-05T01:02:00Z"
}
```

---

## Sicurezza

| Meccanismo | Descrizione |
|------------|-------------|
| **Bearer token** | Configurabile in Settings (`cfg.bridgeToken`), persiste in `localStorage`. Tutte le richieste a `bridge.php` richiedono `?token=SECRET` o header `Authorization: Bearer SECRET`. Risposta 401 se mancante o errato. |
| **Session UUID** | Ogni istanza VD Browser genera un UUID in `sessionStorage` al boot (`vdb-session-id`). I comandi sono filtrati per session ID, così due istanze aperte non si interferiscono. |
| **Pulizia automatica** | `bridge.php` rimuove comandi con `status=done` o `created_at` > 5 minuti ad ogni richiesta (nessun cron job necessario). |
| **IP whitelist** _(opzionale)_ | Array configurabile in `bridge.php` (`$ALLOWED_IPS`). Se vuoto, accetta tutti. |
| **CORS** | `bridge.php` emette `Access-Control-Allow-Origin: *` solo se il token è valido. |

---

## File da modificare / creare

### File modificati

| File | Modifiche |
|------|-----------|
| `vd-browser.js` | `initBridge()` chiamato in `boot()` (orchestra tutti e 3 i layer); `handleBridgeCommand(cmd)` routing; `sendBridgeResult(id, result)`; `initUrlInjection()` per Layer 1 |
| `vd-browser.php` | Campo "Bridge token" in Settings panel; indicatore stato bridge nella topbar (dot verde/grigio `.bridge-dot`) |
| `vd-browser.css` | `.bridge-dot` + stati (connected / disconnected / receiving) |

### File nuovi

| File | Descrizione |
|------|-------------|
| `bridge.php` | SSE listener + cmd queue (PHP flat file) + result collector + webhook callback (~180 righe) |
| `bridge_queue.json` | Auto-creato da bridge.php al primo uso |

---

## Flusso completo — curl → VD Browser → risultato

```bash
# 1. Ottieni il session ID dall'istanza VD Browser aperta
#    (visibile nell'indicatore bridge in topbar o in Settings)

# 2. Invia un comando
curl -X POST "https://mioserver.com/vd/bridge.php?action=cmd&token=miosecret" \
     -H "Content-Type: application/json" \
     -d '{
       "type": "summarize",
       "url": "https://github.com/MisterCoder74/vd_online_browser",
       "session": "vdb_a1b2c3d4",
       "callback_url": "https://my-chatbot.example.com/result"
     }'

# Risposta immediata da bridge.php:
# { "status": "queued", "id": "cmd_x9k2m" }

# 3. VD Browser (già aperto) riceve il comando via SSE,
#    naviga a github.com/MisterCoder74/vd_online_browser,
#    chiama getPageText() → GPT-4o-mini → testo risultato

# 4. VD Browser fa POST a bridge.php?action=result con il testo

# 5. bridge.php chiama callback_url con il JSON risultato
#    (o il chatbot fa polling su bridge.php?action=poll&id=cmd_x9k2m)
```

---

## Ordine di implementazione

| Step | Layer | Stima | Note |
|------|-------|-------|------|
| 1 | Layer 1 — URL params | 30 min | Solo JS, zero file nuovi |
| 2 | Layer 2 — BroadcastChannel | 20 min | Solo JS, ~30 righe |
| 3 | Layer 3 — `bridge.php` | 45 min | Nuovo file PHP |
| 4 | Layer 3 — JS SSE client + UI Settings | 30 min | `EventSource`, dot status, bridge token field |
| 5 | Test curl end-to-end | 15 min | Verifica comandi + callback |
| 6 | README update | 10 min | Nuova sezione Bridge |

**Totale stimato: ~2.5 ore**

---

## Note & Vincoli

- **PHP flat file** per la queue: nessun DB richiesto, funziona su qualsiasi shared hosting. Se il progetto scala, si può migrare a SQLite o Redis senza cambiare il protocollo.
- **Autofill / form_fill** su pagine cross-origin: il comando arriverà, ma l'esecuzione lato iframe fallirà per le stesse limitazioni già documentate nel password manager.
- **Screenshot** via bridge: il comando `screenshot` può restituire il PNG come base64 nel JSON risultato (upload `~50–200 KB` per screenshot a 1080p). Alternativa: restituire un URL temporaneo.
- **run_ai** è il comando più flessibile: passa un prompt libero + contesto della pagina corrente a GPT-4o-mini.
