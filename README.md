# VD Online Browser

A **browser-in-browser** web application — a single PHP+HTML project that embeds a fully-featured browsing experience inside an iframe, with an AI-powered sidebar, tab management, bookmarks, notes, history, and much more.

Built with a dark-themed design system (Fraunces + DM Mono, CSS custom properties), no external JS frameworks.

---

## 📁 Project Files

| File | Description |
|------|-------------|
| `vd-browser.html` | Main browser-in-browser application (single file, all JS/CSS inline) |
| `proxy.php` | Server-side cURL proxy — fetches pages and returns HTML to the browser |
| `vd-ai-bookman.html` | Standalone AI-powered Bookmark Manager (linked from the browser sidebar) |
| `book_man_api.php` | PHP backend API for the Bookmark Manager |
| `bookmarks.json` | Persistent bookmark storage |

---

## 🚀 Setup

1. Place all files in the same folder on a PHP-enabled server (Apache/Nginx + PHP 7.4+)
2. Make sure `curl` is enabled in your PHP installation (`extension=curl`)
3. Open `vd-browser.html` in your browser
4. In **Settings**, enter your OpenAI API key to enable AI features

> **Local dev:** Use XAMPP, WAMP, Laragon, or `php -S localhost:8000`

---

## ✅ Current Features

### 🌐 Navigation
- Multi-tab browsing with unlimited tabs
- Back / Forward / Reload / Home navigation
- URL bar with security icon (🔒 HTTPS / ⚠️ HTTP)
- Quick-bookmark star in the top bar
- Copy URL, Open in new tab buttons
- Collapsible sidebar (toggle button or `Ctrl+B`)
- Last active page auto-restored on reload (persists via `localStorage`)

### 🔀 Proxy & Page Loading
- **Local PHP proxy** (`proxy.php`, recommended): server-side cURL fetch, no CORS errors, no QUIC issues, no rate limits
- **AllOrigins fallback**: public CORS proxy for environments without PHP
- **Custom proxy**: any proxy URL configurable in Settings
- **Direct mode**: no proxy (most modern sites will block embedding)
- Pages loaded via `fetch()` + `iframe.srcdoc` injection — no direct iframe `src` assignment
- `<base href>` injected automatically so relative asset URLs resolve correctly

### 🤖 AI Assistant (GPT-4o-mini, requires OpenAI API key)
All AI actions fetch **real page content** via `proxy.php` before sending to GPT — no guessing from URL/title.

| Action | Description |
|--------|-------------|
| Summarize page | 3–5 sentence summary |
| Extract key points | Bulleted list of main points |
| Translate to English | Full content translation |
| Extract important links | Resources and references found on the page |
| Auto-tag & categorize | 5–8 comma-separated tags |
| Estimate reading time | Word-count-based estimate |
| Explain like I'm 5 | ELI5 explanation |
| Draft a tweet | 280-char tweet about the page |
| Ask about this page | Free-form Q&A with page context |
| Generate reader view | Clean article markdown in Reader Mode panel |
| **Group tabs with AI** _(Fase 1)_ | Clusters all open tabs into labeled groups |

### 📋 Sessions _(Fase 1)_
- Save the current set of open tabs as a named session
- Restore any saved session (reopens all tabs)
- Delete sessions
- Sessions persist in `localStorage` (`vdb-sessions`)

### 🔍 Find in Page _(Fase 1)_
- `Ctrl+F` to open the find bar
- Real-time highlighting inside the iframe (injected into `srcdoc`)
- Previous / Next navigation (also `Shift+Enter` / `Enter`)
- Match counter (`current/total`)
- `Esc` to close and clear highlights

### 🔖 Bookmarks
- Add/delete bookmarks with title, URL, and tags
- Quick-star toggle from the top bar
- Full Bookmark Manager link (opens `vd-ai-bookman.html`)
- Persisted in `localStorage`

### 📝 Notes
- Per-URL notes, saved automatically on input
- Notes list view with all saved entries
- Persisted in `localStorage`

### 🕐 History
- Automatic history tracking (up to 500 entries)
- Relative timestamps
- Clear history button
- Persisted in `localStorage`

### 📖 Reader Mode
- AI-generated clean article view for the active page
- Font size slider (12–22px)
- Rendered directly in the sidebar

### ⚙️ Settings
- OpenAI API key (password field, persisted)
- CORS proxy picker (local / AllOrigins / custom / none)
- Custom homepage URL
- Search engine selector (Google, DuckDuckGo, Brave, Bing)
- History toggle, auto-extract toggle
- Export all data (JSON)
- Clear all data

### ⌨️ Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close current tab |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+L` / `F6` | Focus URL bar |
| `Ctrl+R` / `F5` | Reload page |
| `Ctrl+F` | Find in page |
| `Alt+←` | Back |
| `Alt+→` | Forward |

---

## 🗺️ Roadmap

### ✅ Fase 1 — Complete
- [x] Session manager (save/restore named tab sets)
- [x] Smart tab grouper (AI clusters open tabs)
- [x] Find in page (Ctrl+F, real iframe highlighting)

### 🔄 Fase 2 — In progress
- [ ] Side-by-side mode (split two iframes)
- [ ] PiP tab (floating detachable mini-window)
- [ ] Edit mode (contentEditable injection + save/download)
- [ ] Page rebuilder (AI generates HTML variant from description)

### 📋 Fase 3 — Planned
- [ ] Screenshot + annotate (html2canvas injection + draw tools)
- [ ] AI form filler (detect forms, GPT autofill via postMessage)
- [ ] Password manager panel (per-domain credentials, AES-256, autofill)
- [ ] Page & asset download as ZIP (JSZip + proxy multi-fetch)

### 🔐 Fase 4 — Last
- [ ] User registration & login system (PHP + bcrypt)

---

## ⚠️ Known Limitations

- **JS-heavy SPAs** (React/Next.js apps): HTML loads but external API calls remain cross-origin and may break functionality
- **Major platforms** (Google, YouTube, Twitter/X, Facebook): actively block proxies server-side — use "Open in new tab" fallback
- **Direct mode** (no proxy): virtually all modern sites block iframe embedding via `X-Frame-Options` / `Content-Security-Policy`

---

## 📄 License

MIT — feel free to fork and extend.
