# VD Online Browser

A **browser-in-browser** web application — a single PHP+HTML project that embeds a fully-featured browsing experience inside an iframe, with an AI-powered sidebar, tab management, bookmarks, notes, history, sessions, find in page, split view, PiP, edit mode, and more.

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
- **Local PHP proxy** (`proxy.php`, recommended): server-side cURL fetch, no CORS errors, no QUIC issues
- **AllOrigins fallback**: public CORS proxy for environments without PHP
- **Custom proxy**: any proxy URL configurable in Settings
- **Direct mode**: no proxy (most modern sites will block embedding)
- Pages loaded via `fetch()` + `iframe.srcdoc` injection with auto-injected `<base href>` for relative URLs

### 🪟 Side-by-Side Split Mode _(Fase 2)_
- `Ctrl+\` or toolbar button to enter/exit split mode
- Two independent browsing panes side by side
- Right pane has its own URL bar, Back/Forward/Reload, and load history
- "Send to main pane" button (←■) transfers the URL to the left pane
- Each pane loads pages through the configured proxy
- Close button exits split mode and clears the right pane

### 📌 Picture-in-Picture (PiP) _(Fase 2)_
- Toolbar button opens the current page in a floating mini-window (340×230px)
- Draggable by header — reposition anywhere on screen
- Resizable via `resize: both`
- "Send to main pane" button to pop back as the active tab
- Close button dismisses the PiP window

### ✏️ Edit Mode _(Fase 2)_
- `Ctrl+E` or toolbar button to toggle edit mode on the current page
- **contentEditable** injected via postMessage into the iframe
- **Toolbar** with: Bold, Italic, Underline, H1, H2, Paragraph, Insert Link, Clear Formatting
- **Save HTML** downloads the modified page as an `.html` file
- Visual indicator: dashed yellow outline on the body in edit mode

### 🏗️ Page Rebuilder (AI) _(Fase 2)_
- Text field in AI panel: describe the changes you want ("dark mode, remove ads, bigger font")
- Fetches current page HTML via proxy, sends to GPT-4o-mini with instructions
- Returns complete rebuilt HTML (up to 4096 tokens output)
- **Download** button saves the rebuilt page as `.html`
- **Preview** button opens the rebuilt page in a new tab directly in the browser

### 🤖 AI Assistant (GPT-4o-mini, requires OpenAI API key)
All AI actions fetch **real page content** via `proxy.php` before sending to GPT.

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
| **Group tabs with AI** _(Fase 1)_ | Clusters all open tabs into labeled groups; groups saved as snapshots in `localStorage`, persistent across panel switches and page reloads |
| **Page rebuilder** _(Fase 2)_ | Generates modified HTML based on description |

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

### ⚙️ Settings
- OpenAI API key (password field, persisted)
- CORS proxy picker (local / AllOrigins / custom / none)
- Custom homepage URL
- Search engine selector (Google, DuckDuckGo, Brave, Bing)
- History toggle, auto-extract toggle
- Export all data (JSON)
- Clear all data

### 🪟 Bookmark → Split Pane
- Each bookmark has a second button (⎗) to open it directly in the right split pane
- Auto-activates split mode if not already open
- Main pane click behavior unchanged

### ⌨️ Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close current tab |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+L` / `F6` | Focus URL bar |
| `Ctrl+R` / `F5` | Reload page |
| `Ctrl+F` | Find in page |
| `Ctrl+E` | Toggle edit mode |
| `Ctrl+\` | Toggle split mode |
| `Alt+←` | Back |
| `Alt+→` | Forward |

---

## 🗺️ Roadmap

### ✅ Fase 1 — Complete
- [x] Session manager (save/restore named tab sets)
- [x] Smart tab grouper (AI clusters open tabs; saved as localStorage snapshots, persistent)
- [x] Find in page (Ctrl+F, real iframe highlighting)

### ✅ Fase 2 — Complete
- [x] Side-by-side split mode (dual iframe layout, independent navigation)
- [x] Bookmark → split pane (⎗ button per bookmark, auto-opens split if needed)
- [x] PiP tab (floating draggable mini-window, resizable)
- [x] Edit mode (contentEditable + formatting toolbar + save HTML)
- [x] Page rebuilder (AI generates HTML variant from description)
- [x] Bug fix: `buildFetchUrl()` destructuring in `splitLoadFrame` and `rebuildPage` (was sending `[object Object]` as fetch URL)

### 📋 Fase 3 — Planned
- [ ] Screenshot + annotate (html2canvas injection + draw tools)
- [ ] AI form filler (detect forms, GPT autofill via postMessage)
- [ ] Password manager panel (per-domain credentials, autofill)
- [ ] Page & asset download as ZIP (JSZip + proxy multi-fetch)

### 🔐 Fase 4 — Last
- [ ] User registration & login system (PHP + bcrypt)
- [ ] Migrate all `localStorage` data to per-user JSON files on the server (`users/{id}/bookmarks.json`, `history.json`, `notes.json`, `settings.json`, `sessions.json`, `tab-groups.json`); `localStorage` kept as offline/guest fallback

---

## ⚠️ Known Limitations

- **JS-heavy SPAs** (React/Next.js apps): HTML loads but external API calls remain cross-origin and may break functionality
- **Major platforms** (Google, YouTube, Twitter/X, Facebook): actively block proxies server-side — use "Open in new tab" fallback
- **Direct mode** (no proxy): virtually all modern sites block iframe embedding via `X-Frame-Options` / `Content-Security-Policy`
- **Edit mode**: `document.execCommand` is deprecated but still functional in all current browsers; works best on proxy-loaded pages

---

## 📄 License

MIT — feel free to fork and extend.
