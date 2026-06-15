// ── STATE ─────────────────────────────────────
let tabs = [];
let tabCtr = 0;
let activeId = null;
let sideOpen = true;
let cfg = {};
let bookmarks = [];
let history_  = [];   // renamed to avoid collision with window.history
let notes = {};
let passwords = [];
let sessions = {};
let currentUser = null;  // { id, username, email } — null = guest mode
let _syncTimer  = null;
// In-memory mirrors for data that can't rely on localStorage when logged in:
let _tabGroupsData = null;   // { savedAt, groups[] } — kept in sync with server
let _lastActiveUrl = '';     // current active URL — replaces localStorage for logged-in users

// ── BOOT ──────────────────────────────────────
async function boot() {
  loadCfg();
  await authCheckSession();
  if (currentUser) {
    clearDataCache();                  // wipe any stale data from previous user/session
    const loaded = await pullState();  // load from server → also writes back to localStorage
    if (!loaded) {
      // Fresh account with no server data yet — start truly empty, do NOT seed
      // from localStorage (would contaminate with data from other accounts)
      persistToLocalStorage();         // persist the empty state to localStorage
    }
    applyCfgUI();
  } else {
    loadBM(); loadHist(); loadNotes(); loadSessions(); loadPwds();
  }
  newTab();
  // Restore last active page — prefer in-memory (set by pullState for logged-in), fallback to localStorage for guest
  const lastUrl = _lastActiveUrl || localStorage.getItem('vdb-last-url');
  if (lastUrl && lastUrl !== 'about:home') loadUrl(lastUrl);
  renderBM(); renderHist(); renderNotes(); renderSessions(); renderTabGroups(); renderPwdPanel();
  updateAiStatus(); updateProxyStatus();
  setInterval(() => { document.getElementById('sb-time').textContent = new Date().toLocaleTimeString(); }, 1000);
  document.addEventListener('keydown', globalKey);
  document.getElementById('url-input').addEventListener('focus', e => e.target.select());
  if (!currentUser && !localStorage.getItem('vdb-guest')) showAuthOverlay();
}

// ── TABS ──────────────────────────────────────
function newTab(url) {
  tabCtr++;
  const t = { id: tabCtr, title: 'New Tab', url: 'about:home', fav: '🏠', hist: [], hi: -1 };
  tabs.push(t);
  activateTab(tabCtr);
  if (url) loadUrl(url);
}

function activateTab(id) {
  activeId = id;
  const t = getTab();
  if (!t) return;
  const inp = document.getElementById('url-input');
  inp.value = t.url === 'about:home' ? '' : t.url;
  if (t.url === 'about:home') showHome();
  else loadFrame(t.url);
  updateNavBtns();
  loadNoteFor(t.url);
  renderTabs();
}

function closeTab(e, id) {
  e.stopPropagation();
  if (tabs.length === 1) { tabs = []; tabCtr = 0; newTab(); return; }
  tabs = tabs.filter(t => t.id !== id);
  if (activeId === id) activateTab(tabs[tabs.length - 1].id);
  else renderTabs();
}

function getTab(id) { return tabs.find(t => t.id === (id ?? activeId)); }

function setTab(props) { const t = getTab(); if (t) Object.assign(t, props); }

function renderTabs() {
  const bar = document.getElementById('tabbar');
  const btn = bar.querySelector('.newtab');
  bar.innerHTML = '';
  tabs.forEach(t => {
    const d = document.createElement('div');
    d.className = 'tab' + (t.id === activeId ? ' active' : '');
    d.innerHTML = `<span class="tab-fav">${t.fav}</span><span class="tab-ttl">${esc(t.title)}</span>
      <button class="tab-x" onclick="closeTab(event,${t.id})">✕</button>`;
    d.addEventListener('click', () => activateTab(t.id));
    bar.appendChild(d);
  });
  const nb = document.createElement('button');
  nb.className = 'newtab'; nb.textContent = '+'; nb.onclick = () => newTab();
  bar.appendChild(nb);
}

// ── NAVIGATION ────────────────────────────────
function navigate() {
  const v = document.getElementById('url-input').value.trim();
  if (v) loadUrl(v);
}

function loadUrl(raw) {
  if (!raw || raw === 'about:home') { goHome(); return; }
  let url = raw;
  const isUrl = /^https?:\/\//i.test(raw) || /^[\w-]+\.[\w.]{2,}/.test(raw);
  if (!isUrl) {
    url = (cfg.engine || 'https://www.google.com/search?q=') + encodeURIComponent(raw);
  } else if (!/^https?:\/\//i.test(raw)) {
    url = 'https://' + raw;
  }
  const t = getTab();
  if (t) {
    t.hist = t.hist.slice(0, t.hi + 1);
    t.hist.push(url); t.hi = t.hist.length - 1;
  }
  document.getElementById('url-input').value = url;
  loadFrame(url);
  addHist(url);
}

function loadFrame(url) {
  const fr   = document.getElementById('main-frame');
  const home = document.getElementById('home');
  const blk  = document.getElementById('blocked');
  const lb   = document.getElementById('loadbar');
  home.classList.remove('visible');
  blk.classList.remove('visible');
  fr.style.display = 'block';
  lb.classList.add('spin');
  setTab({ url });
  updateNavBtns();
  const sec = document.getElementById('sec-icon');
  sec.textContent = url.startsWith('https://') ? '🔒' : '⚠️';
  sec.className = 'sec-icon' + (url.startsWith('https://') ? ' s' : '');
  document.getElementById('sb-url').textContent = url;

  const useProxy = cfg.proxyPreset && cfg.proxyPreset !== 'off';

  if (useProxy) {
    // ── PROXY PATH: fetch HTML server-side, inject via srcdoc ────────────
    const { fetchUrl, mode } = buildFetchUrl(url);
    fetch(fetchUrl)
      .then(r => { if (!r.ok) throw new Error('Proxy HTTP ' + r.status); return mode === 'allorigins-json' ? r.json() : r.text(); })
      .then(data => {
        let html = mode === 'allorigins-json' ? (data.contents || '') : data;
        if (!html) throw new Error('Empty response from proxy');
        // Inject <base> so relative URLs resolve against the real origin
        const origin = (() => { try { const u = new URL(url); return u.origin + u.pathname.replace(/[^/]*$/, ''); } catch(e) { return url; } })();
        if (/<head[\s>]/i.test(html)) {
          html = html.replace(/(<head[^>]*>)/i, `$1<base href="${origin}">`);
        } else {
          html = `<base href="${origin}">` + html;
        }
        fr.removeAttribute('src');
        fr.srcdoc = injectFindScript(html);
        lb.classList.remove('spin');
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const title = (titleMatch ? titleMatch[1].trim() : null) || domain(url);
        finishLoad(fr, url, title);
      })
      .catch(err => {
        lb.classList.remove('spin');
        console.warn('Proxy fetch failed:', err);
        toast('Proxy error: ' + err.message, 'err');
        showBlocked(url);
      });
  } else {
    // ── DIRECT PATH: set src as before ───────────────────────────────────
    fr.srcdoc = '';
    fr.src = url;
    fr.onload = () => {
      lb.classList.remove('spin');
      let title = url;
      try { title = fr.contentDocument?.title || domain(url); } catch(e) { title = domain(url); }
      finishLoad(fr, url, title);
    };
    fr.onerror = () => { lb.classList.remove('spin'); showBlocked(url); };
    setTimeout(() => { try { if (fr.contentDocument === null) showBlocked(url); } catch(e) {} }, 4000);
  }
}

function finishLoad(fr, url, title) {
  title = title || domain(url);
  setTab({ title, fav: fav(url) });
  renderTabs();
  document.getElementById('url-input').value = url;
  loadNoteFor(url);
  const isBm = bookmarks.some(b => b.url === url);
  const star = document.getElementById('bm-star');
  star.textContent = isBm ? '★' : '☆';
  star.classList.toggle('on', isBm);
  document.getElementById('bm-url').value = url;
  document.getElementById('bm-title').value = title;
  // Persist last active page — guest only; logged-in users rely on server state
  _lastActiveUrl = url;
  if (!currentUser) localStorage.setItem('vdb-last-url', url);
}

function showBlocked(url) {
  document.getElementById('main-frame').style.display = 'none';
  document.getElementById('blocked').classList.add('visible');
  document.getElementById('blocked-url').textContent = url;
  document.getElementById('loadbar').classList.remove('spin');
  if (cfg.autoext) window.open(url, '_blank');
}

function showHome() {
  document.getElementById('main-frame').style.display = 'none';
  document.getElementById('home').classList.add('visible');
  document.getElementById('blocked').classList.remove('visible');
  document.getElementById('url-input').value = '';
  document.getElementById('sb-url').textContent = 'about:home';
  setTab({ url: 'about:home', title: 'New Tab', fav: '🏠' });
  renderTabs();
}

function goHome() {
  const h = cfg.home;
  if (h && h !== 'about:home') loadUrl(h); else showHome();
}
function goBack() {
  const t = getTab(); if (!t || t.hi <= 0) return;
  t.hi--; loadFrame(t.hist[t.hi]); document.getElementById('url-input').value = t.hist[t.hi]; updateNavBtns();
}
function goForward() {
  const t = getTab(); if (!t || t.hi >= t.hist.length - 1) return;
  t.hi++; loadFrame(t.hist[t.hi]); document.getElementById('url-input').value = t.hist[t.hi]; updateNavBtns();
}
function reloadPage() { const t = getTab(); if (t && t.url !== 'about:home') loadFrame(t.url); }
function updateNavBtns() {
  const t = getTab();
  document.getElementById('btn-back').disabled = !t || t.hi <= 0;
  document.getElementById('btn-fwd').disabled  = !t || t.hi >= t.hist.length - 1;
}
function openInNewTab() { const u = getTab()?.url; if (u && u !== 'about:home') window.open(u, '_blank'); }
function copyUrl() { const u = getTab()?.url; if (u) navigator.clipboard.writeText(u).then(() => toast('URL copied','ok')); }
function homeSearch() { const q = document.getElementById('home-q').value.trim(); if (q) loadUrl(q); }
function handleUrlKey(e) { if (e.key === 'Enter') navigate(); if (e.key === 'Escape') e.target.blur(); }

// ── SIDEBAR ───────────────────────────────────
function toggleSidebar() {
  sideOpen = !sideOpen;
  document.getElementById('sidebar').classList.toggle('collapsed', !sideOpen);
  document.getElementById('btn-sb').textContent = sideOpen ? '⊟' : '⊞';
}
function switchPanel(name) {
  document.querySelectorAll('.s-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.s-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + name)?.classList.add('active');
  document.querySelector(`.s-tab[data-p="${name}"]`)?.classList.add('active');
}


// ── PASSWORD MANAGER ──────────────────────────
function loadPwds() {
  try { passwords = JSON.parse(localStorage.getItem('vdb-passwords') || '[]'); } catch { passwords = []; }
}
function savePwds() {
  if (!currentUser) localStorage.setItem('vdb-passwords', JSON.stringify(passwords));
  const el = document.getElementById('pwd-cnt');
  if (el) el.textContent = passwords.length;
  scheduleSync();
}
function renderPwdPanel() {
  const q    = (document.getElementById('pwd-search')?.value || '').trim().toLowerCase();
  const list = document.getElementById('pwd-list');
  if (!list) return;
  const el = document.getElementById('pwd-cnt');
  if (el) el.textContent = passwords.length;
  const filtered = passwords.filter(p =>
    p.domain.toLowerCase().includes(q) || p.username.toLowerCase().includes(q));
  if (!filtered.length) {
    list.innerHTML = '<div style="color:var(--text3);font-size:11px;text-align:center;padding:16px 0;">' +
      (passwords.length ? 'No match' : 'No credentials saved yet') + '</div>';
    return;
  }
  list.innerHTML = filtered.map(p => `
    <div class="pwd-item">
      <div class="pwd-item-head">
        <div>
          <div class="pwd-domain">${esc(p.domain)}</div>
          <div class="pwd-user">${esc(p.username)}</div>
        </div>
        <button class="act-btn danger" onclick="deletePwd('${p.id}')"
                style="width:auto;padding:3px 7px;font-size:11px;margin:0;" title="Delete">✕</button>
      </div>
      <div class="pwd-btns">
        <button class="act-btn" onclick="copyPwd('${p.id}','u')">👤 Copy user</button>
        <button class="act-btn" onclick="copyPwd('${p.id}','p')">🔑 Copy pass</button>
        <button class="act-btn primary" onclick="autofillPwd('${p.id}')">↩ Autofill</button>
      </div>
    </div>`).join('');
}
function addPwd() {
  const domain   = document.getElementById('pwd-domain').value.trim();
  const username = document.getElementById('pwd-user').value.trim();
  const password = document.getElementById('pwd-pass').value;
  if (!domain || !username || !password) { toast('Fill all three fields', 'err'); return; }
  passwords.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    domain, username, password, created: new Date().toISOString()
  });
  savePwds(); renderPwdPanel();
  document.getElementById('pwd-domain').value = '';
  document.getElementById('pwd-user').value   = '';
  document.getElementById('pwd-pass').value   = '';
  toast('Credential saved', 'ok');
}
function deletePwd(id) {
  passwords = passwords.filter(p => p.id !== id);
  savePwds(); renderPwdPanel();
  toast('Deleted', 'ok');
}
function copyPwd(id, field) {
  const p = passwords.find(p => p.id === id);
  if (!p) return;
  navigator.clipboard.writeText(field === 'u' ? p.username : p.password)
    .then(() => toast(field === 'u' ? 'Username copied' : 'Password copied', 'ok'))
    .catch(() => toast('Copy failed', 'err'));
}
function autofillPwd(id) {
  const cred = passwords.find(p => p.id === id);
  if (!cred) return;
  try {
    const fr  = document.getElementById('main-frame');
    const doc = fr.contentDocument;
    if (!doc) { toast('Cannot access page (cross-origin)', 'err'); return; }
    const userField = doc.querySelector(
      'input[type="email"],input[name*="user" i],input[name*="email" i],' +
      'input[id*="user" i],input[id*="email" i],' +
      'input[autocomplete="username"],input[autocomplete="email"]'
    );
    const passField = doc.querySelector('input[type="password"]');
    let filled = 0;
    if (userField) {
      userField.focus(); userField.value = cred.username;
      userField.dispatchEvent(new Event('input',  { bubbles: true }));
      userField.dispatchEvent(new Event('change', { bubbles: true }));
      filled++;
    }
    if (passField) {
      passField.focus(); passField.value = cred.password;
      passField.dispatchEvent(new Event('input',  { bubbles: true }));
      passField.dispatchEvent(new Event('change', { bubbles: true }));
      filled++;
    }
    if (!filled) { toast('No login fields found', 'err'); return; }
    toast('Autofilled!', 'ok');
  } catch(e) { toast('Autofill error (cross-origin?): ' + e.message, 'err'); }
}
function togglePwdVis() {
  const f = document.getElementById('pwd-pass');
  const b = document.getElementById('pwd-eye');
  f.type = f.type === 'password' ? 'text' : 'password';
  b.innerHTML = f.type === 'password' ? '&#128065;' : '&#128584;';
}
function fillDomainFromTab() {
  const url = getTab()?.url;
  if (!url || url === 'about:home') return;
  try { document.getElementById('pwd-domain').value = new URL(url).hostname.replace(/^www\./, ''); } catch {}
}

// ── BOOKMARKS ─────────────────────────────────
function loadBM()  { bookmarks = JSON.parse(localStorage.getItem('vdb-bm') || '[]'); }
function saveBM()  { if (!currentUser) localStorage.setItem('vdb-bm', JSON.stringify(bookmarks)); scheduleSync(); }

function addBookmark() {
  const title = document.getElementById('bm-title').value.trim() || 'Untitled';
  const url   = document.getElementById('bm-url').value.trim();
  const tags  = document.getElementById('bm-tags').value.split(',').map(s => s.trim()).filter(Boolean);
  if (!url) { toast('URL required','err'); return; }
  bookmarks = bookmarks.filter(b => b.url !== url); // dedup
  bookmarks.unshift({ id: Date.now(), title, url, tags, at: new Date().toISOString() });
  saveBM(); renderBM(); toast('Bookmark saved','ok');
  document.getElementById('bm-tags').value = '';
  document.getElementById('bm-star').textContent = '★';
  document.getElementById('bm-star').classList.add('on');
}

function delBM(id) {
  bookmarks = bookmarks.filter(b => b.id !== id);
  saveBM(); renderBM(); toast('Bookmark removed','ok');
}

function renderBM() {
  const el = document.getElementById('bm-list');
  document.getElementById('bm-cnt').textContent = bookmarks.length;
  if (!bookmarks.length) { el.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:14px 0;">No bookmarks yet.</div>'; return; }
  el.innerHTML = bookmarks.map(b => `
    <div class="bm-item" onclick="loadUrl('${esc(b.url)}')">
      <span style="font-size:13px;">${fav(b.url)}</span>
      <div class="bm-item-txt">
        <div class="bm-item-title">${esc(b.title)}</div>
        <div class="bm-item-url">${esc(domain(b.url))}</div>
      </div>
      <button class="bm-del" onclick="event.stopPropagation();openInSplit('${esc(b.url)}')" title="Open in split pane" style="font-size:11px;opacity:.7;">&#9707;</button>
      <button class="bm-del" onclick="event.stopPropagation();delBM(${b.id})" title="Remove">✕</button>
    </div>`).join('');
}

function openInSplit(url) {
  const wrap = document.getElementById('split-wrap');
  if (!wrap.classList.contains('split')) toggleSplit();
  splitLoadFrame(url);
  document.getElementById('split-url-in').value = url;
}

function quickBookmark() {
  const t = getTab(); if (!t || t.url === 'about:home') { toast('Nothing to bookmark','ok'); return; }
  const star = document.getElementById('bm-star');
  if (star.classList.contains('on')) {
    bookmarks = bookmarks.filter(b => b.url !== t.url); saveBM(); renderBM();
    star.textContent = '☆'; star.classList.remove('on'); toast('Bookmark removed','ok');
  } else {
    document.getElementById('bm-title').value = t.title || domain(t.url);
    document.getElementById('bm-url').value   = t.url;
    addBookmark();
    switchPanel('bookmarks'); if (!sideOpen) toggleSidebar();
  }
}

// ── HISTORY ───────────────────────────────────
function loadHist() { history_ = JSON.parse(localStorage.getItem('vdb-hist') || '[]'); }
function saveHist() { if (!currentUser) localStorage.setItem('vdb-hist', JSON.stringify(history_.slice(0, 500))); scheduleSync(); }

function addHist(url) {
  if (!cfg.hist) return;
  history_ = history_.filter(h => h.url !== url);
  history_.unshift({ url, title: domain(url), at: new Date().toISOString() });
  saveHist(); renderHist();
}

function clearHistory() { history_ = []; saveHist(); renderHist(); toast('History cleared','ok'); }

function renderHist() {
  const el = document.getElementById('hist-list');
  document.getElementById('hist-cnt').textContent = history_.length;
  if (!history_.length) { el.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:14px 0;">No history yet.</div>'; return; }
  el.innerHTML = history_.slice(0, 60).map(h => `
    <div class="hist-item" onclick="loadUrl('${esc(h.url)}')">
      <span style="font-size:12px;">${fav(h.url)}</span>
      <div class="hist-txt">
        <div class="hist-title">${esc(h.title || domain(h.url))}</div>
        <div class="hist-url">${esc(h.url)}</div>
      </div>
      <span class="hist-time">${relTime(h.at)}</span>
    </div>`).join('');
}

// ── NOTES ─────────────────────────────────────
function loadNotes() { notes = JSON.parse(localStorage.getItem('vdb-notes') || '{}'); }
function saveNote()  {
  const u = getTab()?.url; if (!u || u === 'about:home') return;
  const v = document.getElementById('notes-area').value;
  if (v) notes[u] = v; else delete notes[u];
  if (!currentUser) localStorage.setItem('vdb-notes', JSON.stringify(notes));
  scheduleSync();
  renderNotes();
}
function loadNoteFor(url) {
  document.getElementById('notes-area').value = notes[url] || '';
  document.getElementById('notes-cnt').textContent = Object.keys(notes).length;
}
function renderNotes() {
  const el = document.getElementById('notes-list');
  document.getElementById('notes-cnt').textContent = Object.keys(notes).length;
  const entries = Object.entries(notes);
  if (!entries.length) { el.innerHTML = '<div style="color:var(--text3);font-size:12px;">No notes yet.</div>'; return; }
  el.innerHTML = entries.map(([url, txt]) => `
    <div class="note-item" onclick="loadUrl('${esc(url)}')">
      <div class="note-item-url">${esc(domain(url))}</div>
      <div class="note-item-txt">${esc(txt)}</div>
    </div>`).join('');
}

// ── AI ────────────────────────────────────────
/** Fetch the current page's text content through the active proxy */
async function getPageText(url) {
  const preset = cfg.proxyPreset;
  if (!preset || preset === 'off') return null;

  let html = '';
  if (preset === 'local' || preset === 'custom') {
    const proxyBase = preset === 'local' ? 'proxy.php' : (cfg.proxy || 'proxy.php');
    const res = await fetch(proxyBase + '?url=' + encodeURIComponent(url));
    if (!res.ok) throw new Error('Proxy returned HTTP ' + res.status);
    html = await res.text();
  } else if (preset === 'allorigins') {
    const res = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url));
    if (!res.ok) throw new Error('AllOrigins HTTP ' + res.status);
    const json = await res.json();
    html = json.contents || '';
  }

  if (!html) return null;

  // Strip scripts, styles, nav, footer — extract plain text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Keep first ~6000 chars (~1500 tokens) to stay within GPT budget
  return text.length > 6000 ? text.slice(0, 6000) + '…[truncated]' : text;
}

async function ai(action) {
  if (!currentUser && !cfg.key) { toast('Set your OpenAI API key in Settings','err'); switchPanel('settings'); return; }
  const out = document.getElementById('ai-out');
  const url = getTab()?.url || '';
  const t   = getTab()?.title || '';
  const q   = document.getElementById('ai-q').value.trim();

  out.className = 'ai-out thinking';
  out.textContent = '⏳ Fetching page content…';

  // ── Fetch actual page content via proxy ──────────────────────────────
  let pageText = null;
  try { pageText = await getPageText(url); } catch(e) { console.warn('Could not fetch page text:', e.message); }

  const contentCtx = pageText
    ? `Page title: "${t}"\nPage URL: ${url}\n\nPage content (extracted text):\n${pageText}\n\n`
    : `Page title: "${t}"\nPage URL: ${url}\n(Note: could not retrieve page text — answering from URL/title only)\n\n`;

  let prompt = '';
  if (action === 'summarize')      prompt = contentCtx + 'Write a concise 3-5 sentence summary of this page.';
  else if (action === 'keypoints') prompt = contentCtx + 'List 5-7 key points from this page as bullet points.';
  else if (action === 'translate') prompt = contentCtx + 'Translate the main content of this page to English.';
  else if (action === 'links')     prompt = contentCtx + 'List all important links, references, or resources mentioned in this page.';
  else if (action === 'tags')      prompt = contentCtx + 'Generate 5-8 short tags/categories for this page. Return only a comma-separated list.';
  else if (action === 'reading')   prompt = contentCtx + 'Estimate the reading time for this page based on its word count and explain briefly.';
  else if (action === 'eli5')      prompt = contentCtx + 'Explain what this page is about as if I am 5 years old.';
  else if (action === 'tweet')     prompt = contentCtx + 'Draft a compelling tweet (under 280 chars) about this page.';
  else if (action === 'reader')    prompt = contentCtx + 'Rewrite the main article content in clean, readable markdown. Remove ads, navigation, footers.';
  else if (action === 'ask')       { if (!q) { toast('Type a question first','err'); return; } prompt = contentCtx + 'Question: ' + q; }

  out.textContent = '⏳ Thinking…';

  try {
    const data = await openaiChat('gpt-4o-mini', [{ role: 'user', content: prompt }], 512);
    const ans = data.choices?.[0]?.message?.content || 'No response.';
    out.className = 'ai-out';
    out.innerHTML = ans.replace(/\n/g, '<br>');
    if (action === 'reader') document.getElementById('reader-out').innerHTML = ans.replace(/\n/g, '<br>');
  } catch (e) {
    out.className = 'ai-out';
    out.textContent = '⚠ Error: ' + e.message;
    toast('AI error: ' + e.message, 'err');
  }
}

// ── PROXY ─────────────────────────────────────
const PROXY_PRESETS = {
  off:        null,
  local:      'local',        // uses proxy.php in same folder
  allorigins: 'allorigins',   // fetch → /get JSON endpoint
  custom:     'custom',
};

function buildFetchUrl(url) {
  const p = cfg.proxyPreset;
  if (!p || p === 'off')         return { fetchUrl: url, mode: 'direct' };
  if (p === 'local')             return { fetchUrl: 'proxy.php?url=' + encodeURIComponent(url), mode: 'html' };
  if (p === 'allorigins')        return { fetchUrl: 'https://api.allorigins.win/get?url=' + encodeURIComponent(url), mode: 'allorigins-json' };
  if (p === 'custom' && cfg.proxy) return { fetchUrl: cfg.proxy + encodeURIComponent(url), mode: 'html' };
  return { fetchUrl: url, mode: 'direct' };
}

function applyProxyPreset(val, silent) {
  cfg.proxyPreset = val;
  const custEl   = document.getElementById('cfg-proxy');
  if (val === 'custom') {
    custEl.style.display = 'block';
    cfg.proxy = custEl.value.trim();
  } else {
    custEl.style.display = 'none';
    cfg.proxy = null;
  }
  updateProxyStatus();
  if (!silent) saveSettings();
}

function updateProxyStatus() {
  const statusEl = document.getElementById('proxy-status');
  const sbProxy  = document.getElementById('sb-proxy');
  const on = cfg.proxyPreset && cfg.proxyPreset !== 'off';
  if (statusEl) {
    const labels = { local: '🖥️ proxy.php (local)', allorigins: '🌐 allorigins.win', custom: '🔧 custom proxy' };
    if (on) {
      const label = labels[cfg.proxyPreset] || cfg.proxy || 'proxy';
      statusEl.innerHTML = `Active: <code style="color:var(--amber);font-size:10px;">${label}</code>`;
      statusEl.style.color = 'var(--accent)';
    } else {
      statusEl.innerHTML = '⛔ No proxy — most sites will be blocked by X-Frame-Options';
      statusEl.style.color = 'var(--text3)';
    }
  }
  if (sbProxy) sbProxy.style.display = on ? 'inline' : 'none';
}

function updateAiStatus() {
  const el = document.getElementById('sb-ai');
  if (currentUser || cfg.key) { el.textContent = 'ready'; el.style.color = 'var(--accent)'; }
  else { el.textContent = 'no key'; el.style.color = 'var(--red)'; }
}

// ── OPENAI HELPER ─────────────────────────────────────────────────────────────
// Logged-in users → server-side proxy (openai.php); key never leaves server.
// Guest users → direct call with localStorage cfg.key.
async function openaiChat(model, messages, maxTokens = 512, temperature = null) {
  if (currentUser) {
    const opts = { model, messages, max_tokens: maxTokens };
    if (temperature !== null) opts.temperature = temperature;
    const r = await fetch('openai.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'OpenAI proxy error ' + r.status);
    return data;
  } else {
    const key = cfg.key;
    if (!key) throw new Error('Set your OpenAI API key in Settings');
    const opts = { model, messages, max_tokens: maxTokens };
    if (temperature !== null) opts.temperature = temperature;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(opts)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'API error ' + r.status);
    return data;
  }
}

function setReaderFont(v) { document.getElementById('reader-out').style.fontSize = v + 'px'; }

// ── FORM FILLER ────────────────────────────────
let _ffFields = []; // current detected fields

function detectForms() {
  const fr = document.getElementById('main-frame');
  if (!fr || fr.style.display === 'none') { toast('No page loaded', 'err'); return; }
  const btn = document.getElementById('ff-detect-btn');
  const area = document.getElementById('ff-area');
  const list = document.getElementById('ff-fields');
  btn.disabled = true; btn.textContent = '⏳ Detecting…';
  list.innerHTML = '<div class="ff-empty">Scanning page for form fields…</div>';
  area.style.display = 'block';
  try {
    const idoc = fr.contentDocument;
    if (!idoc) throw new Error('no document');
    const sel = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=file]),select,textarea';
    const flds = [];
    idoc.querySelectorAll(sel).forEach((el, i) => {
      let lbl = '';
      if (el.id) { const L = idoc.querySelector('label[for="' + el.id + '"]'); if (L) lbl = L.textContent.trim(); }
      if (!lbl) { const P = el.closest('label'); if (P) lbl = P.textContent.trim(); }
      if (!lbl) lbl = el.getAttribute('aria-label') || el.placeholder || el.name || el.id || '';
      const opts = [];
      if (el.tagName === 'SELECT') Array.from(el.options).forEach(o => opts.push(o.text.trim()));
      flds.push({ idx: i, tag: el.tagName.toLowerCase(), type: el.type || '', name: el.name || el.id || '', label: lbl.trim(), placeholder: el.placeholder || '', options: opts });
    });
    _handleFormData(flds);
  } catch (e) {
    fr.contentWindow?.postMessage({ type: 'vdbFormDetect' }, '*');
    setTimeout(() => { if (btn.disabled) { btn.disabled = false; btn.innerHTML = '&#128269; Detect &amp; analyze forms'; } }, 8000);
  }
}

async function _handleFormData(fields) {
  const btn  = document.getElementById('ff-detect-btn');
  const list = document.getElementById('ff-fields');
  btn.disabled = false; btn.innerHTML = '&#128269; Detect &amp; analyze forms';
  if (!fields.length) {
    list.innerHTML = '<div class="ff-empty">No fillable form fields found on this page.</div>';
    return;
  }
  _ffFields = fields;
  list.innerHTML = '<div class="ff-empty">Asking AI for suggestions…</div>';
  const key = currentUser ? true : (cfg.key || '');
  if (!key) {
    _renderFormFields(fields, fields.map(() => ''));
    toast('Add OpenAI API key in Settings for smart suggestions', 'err');
    return;
  }
  const t = getTab();
  const url = t?.url || window.location.href;
  const fieldDesc = fields.map(f =>
    `Field ${f.idx}: label="${f.label||f.placeholder||f.name||'(unnamed)'}" type="${f.type}" name="${f.name}"` +
    (f.options.length ? ` options=[${f.options.slice(0,8).join(', ')}]` : '')
  ).join('\n');
  const sysMsg = `You are an AI that suggests realistic form fill values. Given a page URL and its form fields, respond with a JSON array of objects {idx, value}. Only fill fields that make sense (skip passwords, CAPTCHAs, file uploads). Use realistic placeholder data. For select fields, choose from the provided options.`;
  const userMsg = `Page URL: ${url}\n\nForm fields:\n${fieldDesc}\n\nRespond ONLY with a JSON array, no explanation. Example: [{"idx":0,"value":"John Doe"},{"idx":1,"value":"john@example.com"}]`;
  try {
    const j = await openaiChat('gpt-4o-mini', [{ role: 'system', content: sysMsg }, { role: 'user', content: userMsg }], 400);
    let raw = j.choices[0].message.content.trim();
    raw = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const suggestions = JSON.parse(raw);
    const valMap = {};
    suggestions.forEach(s => { valMap[s.idx] = s.value; });
    _renderFormFields(fields, fields.map(f => valMap[f.idx] || ''));
  } catch(e) {
    _renderFormFields(fields, fields.map(() => ''));
    toast('AI suggestions failed: ' + e.message, 'err');
  }
}

function _renderFormFields(fields, values) {
  const list = document.getElementById('ff-fields');
  list.innerHTML = '';
  if (!fields.length) { list.innerHTML = '<div class="ff-empty">No fillable fields found.</div>'; return; }
  fields.forEach((f, i) => {
    const label = f.label || f.placeholder || f.name || `Field ${f.idx}`;
    const type  = f.type || f.tag;
    const val   = values[i] || '';
    const wrap  = document.createElement('div');
    wrap.className = 'ff-field';
    wrap.innerHTML = `<div class="ff-label" title="${label} (${type})">${label} <span style="opacity:.5;">[${type}]</span></div>`;
    if (f.tag === 'select' && f.options.length) {
      const sel = document.createElement('select');
      sel.className = 'ff-input';
      sel.dataset.ffIdx = f.idx;
      f.options.forEach((opt, oi) => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (opt.toLowerCase().includes((val||'').toLowerCase())) o.selected = true;
        sel.appendChild(o);
      });
      wrap.appendChild(sel);
    } else if (f.type === 'textarea' || f.tag === 'textarea') {
      const ta = document.createElement('textarea');
      ta.className = 'ff-input'; ta.rows = 2;
      ta.dataset.ffIdx = f.idx; ta.value = val;
      ta.style.resize = 'vertical';
      wrap.appendChild(ta);
    } else {
      const inp = document.createElement('input');
      inp.className = 'ff-input';
      inp.type = ['password','email','url','number','tel'].includes(f.type) ? f.type : 'text';
      inp.dataset.ffIdx = f.idx; inp.value = val;
      inp.placeholder = f.placeholder || '';
      wrap.appendChild(inp);
    }
    list.appendChild(wrap);
  });
}

function fillForms() {
  const fr  = document.getElementById('main-frame');
  const els = document.querySelectorAll('#ff-fields [data-ff-idx]');
  if (!els.length) { toast('No fields to fill', 'err'); return; }
  const values = Array.from(els).map(el => ({ idx: +el.dataset.ffIdx, value: el.value })).filter(v => v.value);
  if (!values.length) { toast('All fields are empty — add values first', 'err'); return; }
  try {
    const idoc = fr.contentDocument;
    if (!idoc) throw new Error('no document');
    const sel = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=file]),select,textarea';
    const inputs = idoc.querySelectorAll(sel);
    values.forEach(v => {
      const el = inputs[v.idx]; if (!el || !v.value) return;
      if (el.tagName === 'SELECT') {
        for (let i = 0; i < el.options.length; i++) {
          if (el.options[i].text.toLowerCase().includes(v.value.toLowerCase()) || el.options[i].value.toLowerCase() === v.value.toLowerCase()) { el.selectedIndex = i; break; }
        }
      } else { el.value = v.value; }
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  } catch (e) {
    fr.contentWindow?.postMessage({ type: 'vdbFormFill', values }, '*');
  }
  toast(`Filled ${values.length} field${values.length>1?'s':''}`, 'ok');
}

// ── SCREENSHOT ────────────────────────────────
const ann = { tool:'pen', color:'#c8f060', size:3, drawing:false, sx:0, sy:0, undoStack:[], screenshotImg:null };

async function takeScreenshot() {
  const frame = document.getElementById('main-frame');
  if (!frame || frame.style.display === 'none') { toast('No page loaded', 'err'); return; }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const loadH2C = async (win, doc) => {
    win = win || window; doc = doc || document;
    if (win.html2canvas) return win.html2canvas;
    return new Promise((res, rej) => {
      const s = doc.createElement('script');
      s.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
      s.onload = () => res(win.html2canvas); s.onerror = rej;
      (doc.head || doc.documentElement).appendChild(s);
    });
  };

  const captureIframe = async (useForeignObject) => {
    const iwin = frame.contentWindow;
    const idoc = frame.contentDocument;
    if (!idoc) return null;
    const root = idoc.documentElement || idoc.body;
    const h2c  = await loadH2C(iwin, idoc);
    const bgRaw = getComputedStyle(root).backgroundColor;
    const bg    = (bgRaw && bgRaw !== 'rgba(0, 0, 0, 0)') ? bgRaw : '#ffffff';
    return h2c(root, {
      useCORS: true, allowTaint: true, logging: false,
      foreignObjectRendering: useForeignObject,
      scale: dpr,
      width:        frame.clientWidth,
      height:       frame.clientHeight,
      windowWidth:  frame.clientWidth,
      windowHeight: frame.clientHeight,
      backgroundColor: bg
    });
  };

  try {
    // ── 1. Capture iframe content ──────────────────────────────────────────────
    // Try foreignObjectRendering first (uses browser real CSS engine — handles
    // gradients, external fonts, flex/grid, custom properties).
    // Fall back to plain html2canvas if it errors.
    let iframeDataUrl = null;
    try {
      const c = await captureIframe(true);
      if (c) iframeDataUrl = c.toDataURL('image/png');
    } catch (e1) {
      console.warn('foreignObject capture failed, retrying plain:', e1);
      try {
        const c = await captureIframe(false);
        if (c) iframeDataUrl = c.toDataURL('image/png');
      } catch (e2) {
        console.warn('plain capture also failed:', e2);
      }
    }

    // ── 2. Capture outer UI (topbar + panels, skip blank iframe area) ──────────
    const h2c = await loadH2C(window, document);
    const outerCanvas = await h2c(document.body, {
      useCORS: true, allowTaint: true, logging: false, scale: dpr,
      ignoreElements: el => el.id === 'main-frame'
    });

    if (!iframeDataUrl) {
      openAnnotator(outerCanvas.toDataURL('image/png'));
      return;
    }

    // ── 3. Composite: paint iframe over outer UI at exact position ─────────────
    const fRect  = frame.getBoundingClientRect();
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;
    const final   = document.createElement('canvas');
    final.width   = outerCanvas.width;
    final.height  = outerCanvas.height;
    const fCtx    = final.getContext('2d');
    fCtx.drawImage(outerCanvas, 0, 0);
    const iframeImg = await new Promise(res => {
      const img = new Image(); img.onload = () => res(img); img.src = iframeDataUrl;
    });
    fCtx.drawImage(iframeImg,
      (fRect.left + scrollX) * dpr, (fRect.top + scrollY) * dpr,
      fRect.width * dpr, fRect.height * dpr);
    openAnnotator(final.toDataURL('image/png'));

  } catch (e) {
    toast('Screenshot failed: ' + e.message, 'err');
  }
}

function openAnnotator(dataUrl) {
  const overlay = document.getElementById('ann-overlay');
  const wrap    = document.getElementById('ann-canvas-wrap');
  overlay.classList.add('visible');
  const img = new Image();
  img.onload = () => {
    ann.screenshotImg = img;
    ann.undoStack = [];
    const bg   = document.getElementById('ann-bg');
    const draw = document.getElementById('ann-draw');
    const cont = document.getElementById('ann-canvas-container');
    bg.width = draw.width = img.naturalWidth;
    bg.height = draw.height = img.naturalHeight;
    bg.getContext('2d').drawImage(img, 0, 0);
    draw.getContext('2d').clearRect(0, 0, draw.width, draw.height);
    const maxW = wrap.clientWidth - 40;
    const scale = Math.min(1, maxW / img.naturalWidth);
    const dispW = Math.round(img.naturalWidth  * scale);
    const dispH = Math.round(img.naturalHeight * scale);
    bg.style.width = draw.style.width = dispW + 'px';
    bg.style.height = draw.style.height = dispH + 'px';
  };
  img.src = dataUrl;
}

function closeAnnotator() {
  document.getElementById('ann-overlay').classList.remove('visible');
  // remove any floating text input
  document.querySelectorAll('.ann-text-input').forEach(el => el.remove());
}

function setAnnTool(t) {
  if (ann.tool === 'crop' && t !== 'crop') annCancelCrop();
  ann.tool = t;
  ['pen','rect','arrow','text','erase','crop'].forEach(x => {
    const b = document.getElementById('ann-t-' + x);
    if (b) b.classList.toggle('active', x === t);
  });
  const cropBar = document.getElementById('ann-crop-bar');
  if (cropBar) cropBar.classList.toggle('visible', t === 'crop');
  const cropOv = document.getElementById('ann-crop-overlay');
  if (cropOv) cropOv.style.display = t === 'crop' ? 'block' : 'none';
}

function _annPos(e, canvas) {
  const r = canvas.getBoundingClientRect();
  const sx = canvas.width  / r.width;
  const sy = canvas.height / r.height;
  const src = e.touches ? e.touches[0] : e;
  return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy };
}

function _annSaveUndo() {
  const draw = document.getElementById('ann-draw');
  const ctx  = draw.getContext('2d');
  ann.undoStack.push(ctx.getImageData(0, 0, draw.width, draw.height));
  if (ann.undoStack.length > 30) ann.undoStack.shift();
}

function annMouseDown(e) {
  if (e.button !== 0 && !e.touches) return;
  const draw = document.getElementById('ann-draw');
  const pos  = _annPos(e, draw);
  if (ann.tool === 'text') { annPlaceText(e, draw, pos); return; }
  if (ann.tool === 'crop') {
    ann.drawing = true; ann.sx = pos.x; ann.sy = pos.y; ann.cropRect = null; return;
  }
  _annSaveUndo();
  ann.drawing = true;
  ann.sx = pos.x; ann.sy = pos.y;
  const ctx = draw.getContext('2d');
  ctx.strokeStyle = ann.tool === 'erase' ? 'rgba(0,0,0,1)' : ann.color;
  ctx.lineWidth   = ann.tool === 'erase' ? ann.size * 3 : ann.size;
  ctx.lineCap = ctx.lineJoin = 'round';
  if (ann.tool === 'erase') ctx.globalCompositeOperation = 'destination-out';
  else ctx.globalCompositeOperation = 'source-over';
  if (ann.tool === 'pen' || ann.tool === 'erase') { ctx.beginPath(); ctx.moveTo(pos.x, pos.y); }
}

function annMouseMove(e) {
  if (!ann.drawing) return;
  e.preventDefault();
  const draw = document.getElementById('ann-draw');
  const pos  = _annPos(e, draw);
  const ctx  = draw.getContext('2d');
  if (ann.tool === 'crop') {
    const ov = document.getElementById('ann-crop-overlay');
    if (!ov) return;
    ov.width = draw.width; ov.height = draw.height;
    const octx = ov.getContext('2d');
    octx.clearRect(0, 0, ov.width, ov.height);
    octx.fillStyle = 'rgba(0,0,0,0.45)';
    octx.fillRect(0, 0, ov.width, ov.height);
    const cx = Math.min(ann.sx, pos.x), cy = Math.min(ann.sy, pos.y);
    const cw = Math.abs(pos.x - ann.sx), ch = Math.abs(pos.y - ann.sy);
    octx.clearRect(cx, cy, cw, ch);
    octx.strokeStyle = '#c8f060'; octx.lineWidth = 1.5;
    octx.setLineDash([5,3]); octx.strokeRect(cx, cy, cw, ch); octx.setLineDash([]);
    ann.cropRect = { x: cx, y: cy, w: cw, h: ch };
    return;
  }
  if (ann.tool === 'pen' || ann.tool === 'erase') {
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
  } else {
    // Restore last committed state then draw preview
    const last = ann.undoStack[ann.undoStack.length - 1];
    if (last) ctx.putImageData(last, 0, 0);
    else ctx.clearRect(0, 0, draw.width, draw.height);
    ctx.strokeStyle = ann.color; ctx.lineWidth = ann.size;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    if (ann.tool === 'rect') {
      ctx.strokeRect(ann.sx, ann.sy, pos.x - ann.sx, pos.y - ann.sy);
    } else if (ann.tool === 'arrow') {
      _drawArrow(ctx, ann.sx, ann.sy, pos.x, pos.y);
    }
  }
}

function annMouseUp(e) {
  if (!ann.drawing) return;
  if (ann.tool === 'crop') { ann.drawing = false; return; }
  ann.drawing = false;
  const draw = document.getElementById('ann-draw');
  const ctx  = draw.getContext('2d');
  ctx.globalCompositeOperation = 'source-over';
}

function _drawArrow(ctx, x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const hw = Math.max(ctx.lineWidth * 3, 10);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hw * Math.cos(angle - Math.PI/6), y2 - hw * Math.sin(angle - Math.PI/6));
  ctx.lineTo(x2 - hw * Math.cos(angle + Math.PI/6), y2 - hw * Math.sin(angle + Math.PI/6));
  ctx.closePath(); ctx.fillStyle = ann.color; ctx.fill();
}

function annPlaceText(e, canvas, pos) {
  document.querySelectorAll('.ann-text-input').forEach(el => el.remove());
  // Append to canvas container (position:relative) so absolute coords map directly to canvas display space
  const cont   = document.getElementById('ann-canvas-container');
  const cRect  = canvas.getBoundingClientRect();
  const fontSize = Math.max(14, ann.size * 4);
  // Convert canvas-space coords to display-space (CSS pixels relative to container top-left)
  const dispX  = pos.x * (cRect.width  / canvas.width);
  const dispY  = pos.y * (cRect.height / canvas.height);
  const input  = document.createElement('input');
  input.type   = 'text';
  input.className   = 'ann-text-input';
  input.style.left  = dispX + 'px';
  input.style.top   = (dispY - fontSize * 0.9) + 'px'; // shift up so baseline aligns with click point
  input.style.color = ann.color;
  input.style.fontSize = fontSize + 'px';
  cont.appendChild(input);
  // Delay focus slightly so mouseup on canvas doesn't steal it back
  setTimeout(() => input.focus(), 20);
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const val = input.value.trim();
    input.remove();
    if (!val) return;
    _annSaveUndo();
    const draw = document.getElementById('ann-draw');
    const ctx  = draw.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = ann.color;
    ctx.font      = `${fontSize}px monospace`;
    ctx.fillText(val, pos.x, pos.y);
  };
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
    if (ev.key === 'Escape') { committed = true; input.remove(); }
  });
  // Small delay on blur to let Enter keydown fire first
  input.addEventListener('blur', () => setTimeout(commit, 80));
}

function annUndo() {
  if (!ann.undoStack.length) return;
  const draw = document.getElementById('ann-draw');
  const ctx  = draw.getContext('2d');
  ctx.putImageData(ann.undoStack.pop(), 0, 0);
}

function annClear() {
  _annSaveUndo();
  const draw = document.getElementById('ann-draw');
  draw.getContext('2d').clearRect(0, 0, draw.width, draw.height);
}

function _annComposite() {
  const bg   = document.getElementById('ann-bg');
  const draw = document.getElementById('ann-draw');
  const out  = document.createElement('canvas');
  out.width = bg.width; out.height = bg.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(bg, 0, 0);
  ctx.drawImage(draw, 0, 0);
  return out;
}

function annConfirmCrop() {
  if (!ann.cropRect || ann.cropRect.w < 4 || ann.cropRect.h < 4) { toast('Draw a selection first','err'); return; }
  const { x, y, w, h } = ann.cropRect;
  const bg = document.getElementById('ann-bg'), draw = document.getElementById('ann-draw');
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
  const tc = tmp.getContext('2d');
  tc.drawImage(bg, x, y, w, h, 0, 0, w, h);
  tc.drawImage(draw, x, y, w, h, 0, 0, w, h);
  bg.width = draw.width = w; bg.height = draw.height = h;
  bg.style.width = draw.style.width = bg.style.height = draw.style.height = '';
  bg.getContext('2d').drawImage(tmp, 0, 0);
  draw.getContext('2d').clearRect(0, 0, w, h);
  const wrap = document.getElementById('ann-canvas-wrap');
  const scale = Math.min(1, (wrap.clientWidth - 40) / w);
  bg.style.width = draw.style.width = Math.round(w * scale) + 'px';
  bg.style.height = draw.style.height = Math.round(h * scale) + 'px';
  ann.undoStack = []; ann.cropRect = null;
  annCancelCrop(); setAnnTool('pen');
  toast('Cropped!', 'ok');
}

function annCancelCrop() {
  ann.cropRect = null;
  const ov = document.getElementById('ann-crop-overlay');
  if (ov) { ov.getContext('2d').clearRect(0,0,ov.width,ov.height); ov.style.display='none'; }
  const bar = document.getElementById('ann-crop-bar');
  if (bar) bar.classList.remove('visible');
  const btn = document.getElementById('ann-t-crop');
  if (btn) btn.classList.remove('active');
}

function annDownload() {
  const c = _annComposite();
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = 'screenshot-' + Date.now() + '.png';
  a.click();
  toast('Screenshot saved', 'ok');
}

async function annCopy() {
  try {
    const c = _annComposite();
    c.toBlob(async blob => {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Copied to clipboard', 'ok');
    }, 'image/png');
  } catch(e) { toast('Copy failed: ' + e.message, 'err'); }
}

function annUpdateSize(v) { ann.size = +v; document.getElementById('ann-size-val').textContent = v; }
function annUpdateColor(v) { ann.color = v; }



// ── SETTINGS ──────────────────────────────────
function loadCfg() {
  cfg = JSON.parse(localStorage.getItem('vdb-cfg') || '{}');
  cfg.hist    = cfg.hist    !== false;
  cfg.autoext = cfg.autoext || false;
  cfg.engine  = cfg.engine  || 'https://www.google.com/search?q=';
  cfg.home    = cfg.home    || 'about:home';
  // Default to allorigins if no proxy ever set
  if (cfg.proxyPreset === undefined) cfg.proxyPreset = 'local';
  if (cfg.proxy === undefined) cfg.proxy = null;
  // Reflect to UI
  if (!currentUser && cfg.key) { const el = document.getElementById('cfg-key'); if (el) el.value = cfg.key; }
  if (cfg.home)   { const el = document.getElementById('cfg-home');   if (el) el.value = cfg.home; }
  const eng = document.getElementById('cfg-engine');
  if (eng && cfg.engine) eng.value = cfg.engine;
  const preset = document.getElementById('cfg-proxy-preset');
  if (preset) preset.value = cfg.proxyPreset || 'off';
  applyProxyPreset(cfg.proxyPreset || 'off', true);
  const th = document.getElementById('tog-hist');    if (th) th.classList.toggle('on', cfg.hist);
  const ta = document.getElementById('tog-autoext'); if (ta) ta.classList.toggle('on', cfg.autoext);
}

function saveSettings() {
  const rawKey = document.getElementById('cfg-key').value.trim();
  if (currentUser) {
    // Logged in: save API key server-side, never in localStorage
    if (rawKey) {
      fetch('data.php?action=setkey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: rawKey })
      }).then(() => {
        document.getElementById('cfg-key').value = '';
        document.getElementById('cfg-key').placeholder = 'Stored on server ●●●●●●●●';
        updateAiStatus();
        toast('API key saved on server', 'ok');
      });
    }
  } else {
    cfg.key = rawKey;
  }
  cfg.home        = document.getElementById('cfg-home').value.trim() || 'about:home';
  cfg.engine      = document.getElementById('cfg-engine').value;
  cfg.proxyPreset = document.getElementById('cfg-proxy-preset').value;
  if (cfg.proxyPreset === 'custom') cfg.proxy = document.getElementById('cfg-proxy').value.trim();
  localStorage.setItem('vdb-cfg', JSON.stringify(cfg));
  updateAiStatus(); updateProxyStatus();
  scheduleSync();
}

function togSetting(k) {
  cfg[k] = !cfg[k];
  document.getElementById('tog-' + k).classList.toggle('on', cfg[k]);
  localStorage.setItem('vdb-cfg', JSON.stringify(cfg));
  scheduleSync();
}

function exportData() {
  const data = { bookmarks, history: history_, notes, passwords, cfg: { engine: cfg.engine, home: cfg.home } };
  const b = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b);
  a.download = 'vdbrowser-data.json'; a.click();
  toast('Data exported','ok');
}

function clearAllData() {
  if (!confirm('Clear ALL data (bookmarks, history, notes, settings)?')) return;
  localStorage.removeItem('vdb-bm'); localStorage.removeItem('vdb-hist');
  localStorage.removeItem('vdb-notes'); localStorage.removeItem('vdb-cfg');
  localStorage.removeItem('vdb-passwords');
  if (currentUser) fetch('data.php', { method: 'DELETE' }).catch(() => {});
  location.reload();
}


// ── PAGE ZIP DOWNLOAD ─────────────────────────
async function downloadPageZip() {
  const url = getTab()?.url;
  if (!url || url === 'about:home') { toast('Navigate to a page first', 'err'); return; }
  const { fetchUrl, mode: fMode } = buildFetchUrl(url);
  if (!fetchUrl || fMode === 'direct') { toast('Enable a proxy in Settings first', 'err'); return; }
  if (typeof JSZip === 'undefined') { toast('JSZip not loaded', 'err'); return; }
  const btn = document.getElementById('btn-zip');
  if (btn) { btn.disabled = true; }
  toast('Fetching page…', 'ok');
  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error('Proxy error ' + res.status);
    const rawHtml = fMode === 'allorigins-json' ? ((await res.json()).contents || '') : await res.text();
    if (!rawHtml) throw new Error('Empty response');

    const zip    = new JSZip();
    const parser = new DOMParser();
    const doc    = parser.parseFromString(rawHtml, 'text/html');
    const base   = new URL(url);
    const fetched = new Map();
    let   assetIdx = 0;
    const MAX_ASSETS = 30;

    async function fetchAsset(attr, folder) {
      if (!attr) return null;
      let absUrl;
      try { absUrl = new URL(attr, base).href; } catch { return null; }
      if (fetched.has(absUrl)) return fetched.get(absUrl);
      if (fetched.size >= MAX_ASSETS) return null;
      try {
        const { fetchUrl: af, mode: am } = buildFetchUrl(absUrl);
        if (am === 'direct') return null;
        const r = await fetch(af);
        if (!r.ok) return null;
        const blob = am === 'allorigins-json'
          ? new Blob([(await r.json()).contents || ''])
          : await r.blob();
        const rawExt = absUrl.split('?')[0].split('.').pop().toLowerCase().slice(0, 5);
        const ext    = /^[a-z0-9]+$/.test(rawExt) ? rawExt : 'bin';
        assetIdx++;
        const zipPath = folder + '/' + assetIdx + '.' + ext;
        zip.file(zipPath, blob);
        fetched.set(absUrl, zipPath);
        return zipPath;
      } catch { return null; }
    }

    for (const el of doc.querySelectorAll('link[rel="stylesheet"][href]')) {
      const p = await fetchAsset(el.getAttribute('href'), 'css');
      if (p) el.setAttribute('href', p);
    }
    for (const el of doc.querySelectorAll('script[src]')) {
      const p = await fetchAsset(el.getAttribute('src'), 'js');
      if (p) el.setAttribute('src', p);
    }
    for (const el of doc.querySelectorAll('img[src]')) {
      const p = await fetchAsset(el.getAttribute('src'), 'img');
      if (p) el.setAttribute('src', p);
    }
    for (const el of doc.querySelectorAll('link[rel*="icon"][href]')) {
      const p = await fetchAsset(el.getAttribute('href'), 'img');
      if (p) el.setAttribute('href', p);
    }

    zip.file('index.html', '<!DOCTYPE html>\n' + doc.documentElement.outerHTML);
    toast('Packing ZIP…', 'ok');
    const blob = await zip.generateAsync({
      type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }
    });
    const pageName = (getTab()?.title || 'page')
      .replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '') || 'page';
    Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: pageName + '.zip'
    }).click();
    toast('ZIP downloaded! (' + fetched.size + ' assets bundled)', 'ok');
  } catch(e) {
    toast('ZIP error: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

// ── KEYBOARD ──────────────────────────────────
function globalKey(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'b')              { e.preventDefault(); toggleSidebar(); }
  if (ctrl && e.key === 'l')              { e.preventDefault(); document.getElementById('url-input').focus(); }
  if (ctrl && e.key === 't')              { e.preventDefault(); newTab(); }
  if (ctrl && e.key === 'w')              { e.preventDefault(); if (activeId) closeTab(e, activeId); }
  if (ctrl && e.key === 'r' || e.key === 'F5') { e.preventDefault(); reloadPage(); }
  if (ctrl && e.key === 'f')              { e.preventDefault(); toggleFindBar(); }
  if (ctrl && e.key === 'e')              { e.preventDefault(); toggleEditMode(); }
  if (ctrl && e.shiftKey && e.key === 'S'){ e.preventDefault(); takeScreenshot(); }
  if (ctrl && e.key === 'z' && document.getElementById('ann-overlay').classList.contains('visible')) { e.preventDefault(); annUndo(); }
  if (ctrl && e.key === '\\')            { e.preventDefault(); toggleSplit(); }
  if (e.key === 'F6')                     { e.preventDefault(); document.getElementById('url-input').focus(); }
  if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
}

// ── SESSIONS ──────────────────────────────────
// sessions declared at top of STATE block

function loadSessions() {
  sessions = JSON.parse(localStorage.getItem('vdb-sessions') || '{}');
}
function _saveSessions() {
  if (!currentUser) localStorage.setItem('vdb-sessions', JSON.stringify(sessions));
  scheduleSync();
}

function saveSession() {
  const name = document.getElementById('sess-name-in').value.trim();
  if (!name) { toast('Enter a session name', 'err'); return; }
  sessions[name] = {
    saved: new Date().toISOString(),
    tabs: tabs.map(t => ({ url: t.url, title: t.title, fav: t.fav }))
  };
  document.getElementById('sess-name-in').value = '';
  _saveSessions();
  renderSessions();
  toast(`Session "${name}" saved — ${tabs.length} tab(s)`, 'ok');
}

function restoreSession(name) {
  const s = sessions[name];
  if (!s || !s.tabs?.length) return;
  tabs = []; tabCtr = 0; activeId = null;
  document.getElementById('tabbar').innerHTML = '';
  s.tabs.forEach(t => newTab(t.url === 'about:home' ? undefined : t.url));
  toast(`Session "${name}" restored`, 'ok');
}

function deleteSession(name) {
  if (!confirm(`Delete session "${name}"?`)) return;
  delete sessions[name];
  _saveSessions();
  renderSessions();
  toast(`Session "${name}" deleted`, 'ok');
}

function renderSessions() {
  const list = document.getElementById('sess-list');
  const cnt  = document.getElementById('sess-cnt');
  const hint = document.getElementById('sess-tab-count');
  if (hint) hint.textContent = tabs.length;
  if (!list) return;
  const names = Object.keys(sessions);
  if (cnt) cnt.textContent = names.length;
  if (!names.length) {
    list.innerHTML = '<div style="color:var(--text3);font-size:11px;text-align:center;padding:20px 0;">No saved sessions yet</div>';
    return;
  }
  list.innerHTML = names.map(name => {
    const s = sessions[name];
    const date = new Date(s.saved).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
    const preview = (s.tabs || []).map(t => t.title || t.url).slice(0, 4).join(', ') + (s.tabs.length > 4 ? '…' : '');
    return `<div class="bm-item" style="flex-direction:column;gap:4px;align-items:stretch;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:13px;">&#128203;</span>
        <span style="font-weight:600;flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(name)}</span>
        <button class="bm-del" onclick="restoreSession('${esc(name).replace(/'/g,"\\'")}');" title="Restore session"
                style="color:var(--accent);padding:2px 7px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:var(--r1);">↩</button>
        <button class="bm-del" onclick="deleteSession('${esc(name).replace(/'/g,"\\'")}');" title="Delete">&#10005;</button>
      </div>
      <div style="font-size:10px;color:var(--text3);">${s.tabs.length} tab${s.tabs.length!==1?'s':''} · ${date}</div>
      <div style="font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(preview)}</div>
    </div>`;
  }).join('');
}

// ── SMART TAB GROUPER ─────────────────────────
async function aiGroupTabs() {
  if (!currentUser && !cfg.key) { toast('Set your OpenAI API key in Settings', 'err'); switchPanel('settings'); return; }
  if (tabs.length < 2) { toast('Open at least 2 tabs to group', 'err'); return; }
  switchPanel('ai');
  const out = document.getElementById('ai-out');
  out.className = 'ai-out thinking';
  out.textContent = '⏳ Grouping your tabs…';
  const tabList = tabs.map((t, i) => `${i+1}. ${t.title} — ${t.url}`).join('\n');
  const prompt = `You are a browser tab organizer. Group the following open tabs into 2–5 meaningful categories. Assign each tab to exactly one group.\n\nTabs:\n${tabList}\n\nReturn ONLY a JSON object, no markdown:\n{"groups":[{"name":"Group Name","emoji":"🔧","tabs":[1,3]},…]}`;
  try {
    const data = await openaiChat('gpt-4o-mini', [{ role: 'user', content: prompt }], 512);
    if (!data.choices?.length) throw new Error('No choices returned');
    let raw = data.choices?.[0]?.message?.content || '{}';
    raw = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch(e) { throw new Error('AI returned invalid JSON'); }
    const groups = parsed.groups || [];
    if (!groups.length) throw new Error('No groups returned');

    // Build snapshot (title+url+fav) so groups persist even if tabs close
    const snapshot = groups.map(g => ({
      name: g.name, emoji: g.emoji || '📁',
      tabs: (g.tabs || []).map(idx => {
        const t = tabs[idx - 1];
        return t ? { title: t.title, url: t.url, fav: t.fav } : null;
      }).filter(Boolean)
    }));
    const tgPayload = { savedAt: new Date().toISOString(), groups: snapshot };
    _tabGroupsData = tgPayload;
    if (!currentUser) localStorage.setItem('vdb-tab-groups', JSON.stringify(tgPayload));
    scheduleSync();
    renderTabGroups();

    out.className = 'ai-out';
    out.textContent = `✅ ${snapshot.length} groups saved — see "Saved groups" above.`;
  } catch(e) {
    out.className = 'ai-out';
    out.textContent = '⚠ Error: ' + e.message;
    toast('Tab grouper error: ' + e.message, 'err');
  }
}

function renderTabGroups() {
  // Use in-memory mirror (logged-in) or localStorage fallback (guest)
  const raw = _tabGroupsData || (() => {
    const s = localStorage.getItem('vdb-tab-groups');
    return s ? (() => { try { return JSON.parse(s); } catch { return null; } })() : null;
  })();
  const box  = document.getElementById('tab-groups-box');
  const list = document.getElementById('tg-list');
  const meta = document.getElementById('tg-meta');
  if (!raw) { box.style.display = 'none'; return; }
  const { savedAt, groups } = raw;
  if (!groups || !groups.length) { box.style.display = 'none'; return; }
  box.style.display = '';
  const d = new Date(savedAt);
  meta.textContent = `${groups.length} groups · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
  list.innerHTML = groups.map(g => `
    <div class="tg-box">
      <div class="tg-group-hd"><span>${esc(g.emoji)}</span><span>${esc(g.name)}</span></div>
      ${g.tabs.map(t => `
        <div class="tg-tab" onclick="loadUrl('${esc(t.url)}')" title="${esc(t.url)}">
          <span>${esc(t.fav || '🌐')}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.title)}</span>
        </div>`).join('')}
    </div>`).join('');
}

function clearTabGroups() {
  _tabGroupsData = null;
  localStorage.removeItem('vdb-tab-groups');
  scheduleSync();
  renderTabGroups();
  toast('Tab groups cleared', 'ok');
}

// ── FIND IN PAGE ──────────────────────────────
function toggleFindBar() {
  const bar = document.getElementById('find-bar');
  const visible = bar.classList.toggle('visible');
  if (visible) {
    document.getElementById('find-input').focus();
    document.getElementById('find-input').select();
  } else {
    document.getElementById('find-count').textContent = '';
    clearFindInFrame();
  }
}

function closeFindBar() {
  document.getElementById('find-bar').classList.remove('visible');
  document.getElementById('find-input').value = '';
  document.getElementById('find-count').textContent = '';
  clearFindInFrame();
}

function findKey(e) {
  if (e.key === 'Escape')  { closeFindBar(); return; }
  if (e.key === 'Enter')   { findStep(e.shiftKey ? -1 : 1); }
}

function findExec() {
  const q = document.getElementById('find-input').value;
  if (!q) { document.getElementById('find-count').textContent = ''; clearFindInFrame(); return; }
  document.getElementById('main-frame').contentWindow?.postMessage({ type: 'vdbFind', query: q, step: 0 }, '*');
}

function findStep(dir) {
  const q = document.getElementById('find-input').value;
  if (!q) return;
  document.getElementById('main-frame').contentWindow?.postMessage({ type: 'vdbFind', query: q, step: dir }, '*');
}

function clearFindInFrame() {
  document.getElementById('main-frame').contentWindow?.postMessage({ type: 'vdbFindClear' }, '*');
}

// Listen for find results posted from inside the iframe
window.addEventListener('message', e => {
  if (e.data?.type === 'vdb-open-tab') {
    const url = e.data.url;
    if (url && url.startsWith('http')) newTab(url);
    return;
  }
  if (e.data?.type === 'vdbFindResult') {
    const { count, current } = e.data;
    document.getElementById('find-count').textContent = count > 0 ? `${current}/${count}` : (count === 0 ? 'No results' : '');
  }
  if (e.data?.type === 'vdbEditHtml') {
    const name = (getTab()?.title || 'edited-page').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([e.data.html], { type: 'text/html' })),
      download: name + '.html'
    });
    a.click();
    toast('Edited page saved!', 'ok');
  }
  if (e.data?.type === 'vdbFormData') {
    _handleFormData(e.data.fields || []);
  }
});

// Inject find + edit controller scripts into srcdoc HTML
function injectFindScript(html) {
  const FIND_HL = 'background:#ffdd44;color:#000;border-radius:2px;padding:0 1px;';
  const FIND_AC = 'background:#ff8800;color:#000;border-radius:2px;padding:0 1px;';
  const script = [
    '<script>(function(){',
    '  var marks=[],idx=0,HL="'+FIND_HL+'",AC="'+FIND_AC+'";',
    '  function clrM(){marks.forEach(function(m){var p=m.parentNode;if(p){p.replaceChild(document.createTextNode(m.textContent),m);p.normalize();}});marks=[];idx=0;}',
    '  function mkAll(q){',
    '    clrM();if(!q)return;',
    '    var re=new RegExp(q.replace(/[.*+?^${}()|\\[\\]\\\\]/g,"\\\\$&"),"gi");',
    '    var walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);',
    '    var nodes=[],n;while(n=walk.nextNode())nodes.push(n);',
    '    nodes.forEach(function(node){',
    '      var tag=(node.parentNode||{}).tagName;',
    '      if(["SCRIPT","STYLE","NOSCRIPT","TEXTAREA"].indexOf(tag)>=0)return;',
    '      var txt=node.textContent;if(!re.test(txt))return;re.lastIndex=0;',
    '      var frag=document.createDocumentFragment(),last=0,m;',
    '      while(m=re.exec(txt)){',
    '        if(m.index>last)frag.appendChild(document.createTextNode(txt.slice(last,m.index)));',
    '        var sp=document.createElement("mark");sp.textContent=m[0];',
    '        sp.setAttribute("data-vdbf","1");sp.style.cssText=HL;',
    '        frag.appendChild(sp);marks.push(sp);last=m.index+m[0].length;',
    '      }',
    '      if(last<txt.length)frag.appendChild(document.createTextNode(txt.slice(last)));',
    '      node.parentNode.replaceChild(frag,node);',
    '    });',
    '    if(marks.length){marks[0].style.cssText=AC;marks[0].scrollIntoView({block:"center",behavior:"smooth"});}',
    '    window.parent.postMessage({type:"vdbFindResult",count:marks.length,current:marks.length?1:0},"*");',
    '  }',
    '  window.addEventListener("message",function(e){',
    '    var d=e.data;if(!d||!d.type)return;',
    '    if(d.type==="vdbFind"){',
    '      var q=d.query,s=d.step;',
    '      if(!marks.length||s===0){mkAll(q);return;}',
    '      if(marks.length){',
    '        marks[idx].style.cssText=HL;',
    '        idx=(idx+s+marks.length)%marks.length;',
    '        marks[idx].style.cssText=AC;',
    '        marks[idx].scrollIntoView({block:"center",behavior:"smooth"});',
    '        window.parent.postMessage({type:"vdbFindResult",count:marks.length,current:idx+1},"*");',
    '      }',
    '    }else if(d.type==="vdbFindClear"){',
    '      clrM();',
    '    }else if(d.type==="vdbEditOn"){',
    '      document.body.contentEditable="true";',
    '      document.body.style.outline="2px dashed rgba(255,200,0,.35)";',
    '      document.body.style.minHeight="100%";',
    '    }else if(d.type==="vdbEditOff"){',
    '      document.body.contentEditable="false";',
    '      document.body.style.outline="";',
    '    }else if(d.type==="vdbEditCmd"){',
    '      try{document.execCommand(d.cmd,false,d.val||null);}catch(ex){}',
    '    }else if(d.type==="vdbEditGet"){',
    '      window.parent.postMessage({type:"vdbEditHtml",html:document.documentElement.outerHTML},"*");',
    '    }else if(d.type==="vdbFormDetect"){',
    '      var flds=[],sel="input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=file]),select,textarea";',
    '      document.querySelectorAll(sel).forEach(function(el,i){',
    '        var lbl="";',
    '        if(el.id){var L=document.querySelector("label[for=\""+el.id+"\"]");if(L)lbl=L.textContent.trim();}',
    '        if(!lbl){var P=el.closest("label");if(P)lbl=P.textContent.trim();}',
    '        if(!lbl)lbl=el.getAttribute("aria-label")||el.placeholder||el.name||el.id||"";',
    '        var opts=[];',
    '        if(el.tagName==="SELECT")Array.from(el.options).forEach(function(o){opts.push(o.text.trim());});',
    '        flds.push({idx:i,tag:el.tagName.toLowerCase(),type:el.type||"",name:el.name||el.id||"",label:lbl.trim(),placeholder:el.placeholder||"",options:opts});',
    '      });',
    '      window.parent.postMessage({type:"vdbFormData",fields:flds},"*");',
    '    }else if(d.type==="vdbFormFill"){',
    '      var inp=document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=file]),select,textarea");',
    '      (d.values||[]).forEach(function(v){',
    '        var el=inp[v.idx];if(!el||!v.value)return;',
    '        if(el.tagName==="SELECT"){for(var i=0;i<el.options.length;i++){if(el.options[i].text.toLowerCase().indexOf(v.value.toLowerCase())>=0||el.options[i].value.toLowerCase()===v.value.toLowerCase()){el.selectedIndex=i;break;}}}',
    '        else{el.value=v.value;}',
    '        ["input","change"].forEach(function(ev){el.dispatchEvent(new Event(ev,{bubbles:true}));});',
    '      });',
    '    }',
    '  });',
    '}());',
    '<\/script>'
  ].join('\n');
  if (/\<\/body\>/i.test(html)) return html.replace(/\<\/body\>/i, script + '\n</body>');
  return html + '\n' + script;
}
// ── SPLIT MODE ────────────────────────────────
let splitUrl = 'about:home';
let splitHistory = [], splitHistIdx = -1;

function toggleSplit() {
  const wrap = document.getElementById('split-wrap');
  const btn  = document.getElementById('btn-split');
  const on   = !wrap.classList.contains('split');
  wrap.classList.toggle('split', on);
  btn.style.color = on ? 'var(--accent)' : '';
  if (on) {
    document.getElementById('split-url-in').focus();
    toast('Split mode ON — enter a URL in the right pane', 'ok');
  } else {
    const sf = document.getElementById('split-frame');
    sf.srcdoc = ''; sf.src = 'about:blank'; sf.style.display = 'none';
    document.getElementById('split-home').style.display = '';
    document.getElementById('split-blocked').style.display = 'none';
    splitHistory = []; splitHistIdx = -1;
    toast('Split mode OFF', 'ok');
  }
}

function closeSplit() {
  document.getElementById('split-wrap').classList.remove('split');
  document.getElementById('btn-split').style.color = '';
  const sf = document.getElementById('split-frame');
  sf.srcdoc = ''; sf.src = 'about:blank'; sf.style.display = 'none';
  document.getElementById('split-home').style.display = '';
  document.getElementById('split-blocked').style.display = 'none';
  splitHistory = []; splitHistIdx = -1;
}

function splitUrlKey(e) {
  if (e.key === 'Enter') splitNavigate();
  if (e.key === 'Escape') document.getElementById('split-url-in').blur();
}

function splitNavigate() {
  const raw = document.getElementById('split-url-in').value.trim();
  if (!raw) return;
  let url;
  if (/^https?:\/\//i.test(raw)) { url = raw; }
  else if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(raw)) { url = 'https://' + raw; }
  else { url = (cfg.engine || 'https://google.com/search?q=') + encodeURIComponent(raw); }
  splitLoadFrame(url);
}

function splitLoadFrame(url) {
  const sf  = document.getElementById('split-frame');
  const lb  = document.getElementById('split-lb');
  const sec = document.getElementById('split-sec');
  splitUrl = url;
  document.getElementById('split-url-in').value = url;
  document.getElementById('split-home').style.display = 'none';
  document.getElementById('split-blocked').style.display = 'none';
  lb.style.width = '0'; lb.className = 'loadbar-fill spin';
  sec.textContent = url.startsWith('https') ? '🔒' : '⚠️';

  const { fetchUrl, mode: fMode } = buildFetchUrl(url);
  if (!fetchUrl || fMode === 'direct') {
    sf.removeAttribute('srcdoc'); sf.src = url; sf.style.display = '';
    lb.className = 'loadbar-fill'; lb.style.width = '100%';
    splitPushHistory(url); return;
  }
  fetch(fetchUrl)
    .then(r => { if (!r.ok) throw new Error(r.status); return fMode === 'allorigins-json' ? r.json() : r.text(); })
    .then(data => {
      let htm = fMode === 'allorigins-json' ? (data.contents || '') : data;
      if (!htm) throw new Error('Empty response');
      const origin = (() => { try { const u = new URL(url); return u.origin + u.pathname.replace(/[^/]*$/, ''); } catch(e) { return url; } })();
      if (/<head[\s>]/i.test(htm)) { htm = htm.replace(/(<head[^>]*>)/i, `$1<base href="${origin}">`); }
      else { htm = `<base href="${origin}">` + htm; }
      sf.removeAttribute('src'); sf.srcdoc = injectFindScript(htm); sf.style.display = '';
      lb.className = 'loadbar-fill'; lb.style.width = '100%';
      setTimeout(() => { lb.style.width = '0'; }, 600);
      splitPushHistory(url);
    })
    .catch(() => {
      lb.className = 'loadbar-fill'; lb.style.width = '0';
      document.getElementById('split-blocked').style.display = '';
    });
}

function splitPushHistory(url) {
  splitHistory = splitHistory.slice(0, splitHistIdx + 1);
  splitHistory.push(url);
  splitHistIdx = splitHistory.length - 1;
  document.getElementById('split-back').disabled = splitHistIdx <= 0;
  document.getElementById('split-fwd').disabled  = splitHistIdx >= splitHistory.length - 1;
}

function splitGoBack()   { if (splitHistIdx > 0) { splitHistIdx--; splitLoadFrame(splitHistory[splitHistIdx]); } }
function splitGoFwd()    { if (splitHistIdx < splitHistory.length - 1) { splitHistIdx++; splitLoadFrame(splitHistory[splitHistIdx]); } }
function splitReload()   { if (splitUrl && splitUrl !== 'about:home') splitLoadFrame(splitUrl); }
function splitOpenNew()  { if (splitUrl) window.open(splitUrl, '_blank'); }
function splitSendToMain() { if (splitUrl && splitUrl !== 'about:home') loadUrl(splitUrl); }

// ── PiP TAB ──────────────────────────────────
let pipUrl = null;

function openPip() {
  const t = getTab();
  if (!t || t.url === 'about:home') { toast('Navigate to a page first', 'err'); return; }
  pipUrl = t.url;
  document.getElementById('pip-title').textContent = t.title || domain(t.url);
  const pf = document.getElementById('pip-frame');
  const mf = document.getElementById('main-frame');
  if (mf.srcdoc) { pf.srcdoc = mf.srcdoc; }
  else { pf.removeAttribute('srcdoc'); pf.src = t.url; }
  document.getElementById('pip-win').style.display = 'flex';
  initPipDrag();
  toast('PiP opened — drag the header to reposition', 'ok');
}

function closePip() {
  document.getElementById('pip-win').style.display = 'none';
  const pf = document.getElementById('pip-frame');
  pf.srcdoc = ''; pf.src = 'about:blank';
  pipUrl = null;
}

function pipSendToMain() {
  if (pipUrl) loadUrl(pipUrl);
  closePip();
}

function initPipDrag() {
  const win = document.getElementById('pip-win');
  const hdr = document.getElementById('pip-drag');
  let dx = 0, dy = 0, mx = 0, my = 0;
  hdr.onmousedown = e => {
    e.preventDefault();
    mx = e.clientX; my = e.clientY;
    document.onmousemove = ev => {
      dx = mx - ev.clientX; dy = my - ev.clientY;
      mx = ev.clientX; my = ev.clientY;
      win.style.top  = Math.max(0, win.offsetTop  - dy) + 'px';
      win.style.left = Math.max(0, win.offsetLeft - dx) + 'px';
      win.style.bottom = 'auto'; win.style.right = 'auto';
    };
    document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; };
  };
}

// ── EDIT MODE ─────────────────────────────────
let editModeActive = false;

function toggleEditMode() {
  editModeActive = !editModeActive;
  const toolbar = document.getElementById('edit-toolbar');
  const btn     = document.getElementById('btn-edit');
  if (editModeActive) {
    const fr = document.getElementById('main-frame');
    if (!fr.srcdoc && (!fr.src || fr.src === 'about:blank')) {
      toast('Navigate to a page first', 'err'); editModeActive = false; return;
    }
    fr.contentWindow?.postMessage({ type: 'vdbEditOn' }, '*');
    toolbar.classList.add('visible');
    btn.style.color = 'var(--amber)';
    toast('Edit mode ON — click any text to edit', 'ok');
  } else {
    document.getElementById('main-frame').contentWindow?.postMessage({ type: 'vdbEditOff' }, '*');
    toolbar.classList.remove('visible');
    btn.style.color = '';
    toast('Edit mode OFF', 'ok');
  }
}

function editCmd(cmd, val) {
  document.getElementById('main-frame').contentWindow
    ?.postMessage({ type: 'vdbEditCmd', cmd, val: val || null }, '*');
}

function editInsertLink() {
  const url = prompt('Link URL:');
  if (url) editCmd('createLink', url);
}

function editSave() {
  document.getElementById('main-frame').contentWindow?.postMessage({ type: 'vdbEditGet' }, '*');
}

// ── PAGE REBUILDER ────────────────────────────
async function rebuildPage() {
  if (!currentUser && !cfg.key) { toast('Set OpenAI API key in Settings', 'err'); switchPanel('settings'); return; }
  const prompt = document.getElementById('rebuild-prompt').value.trim();
  if (!prompt) { toast('Describe the changes you want', 'err'); return; }
  const url = getTab()?.url;
  if (!url || url === 'about:home') { toast('Navigate to a page first', 'err'); return; }
  switchPanel('ai');
  const out = document.getElementById('ai-out');
  out.className = 'ai-out thinking';
  out.textContent = '⏳ Fetching page & rebuilding with AI…';

  try {
    const { fetchUrl, mode: rMode } = buildFetchUrl(url);
    if (!fetchUrl || rMode === 'direct') throw new Error('Enable a proxy in Settings first (proxy.php recommended)');
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error('Proxy error ' + res.status);
    const rawHtml = rMode === 'allorigins-json' ? ((await res.json()).contents || '') : await res.text();
    if (!rawHtml) throw new Error('Empty page response');

    const gptPrompt = `You are a website restyler. Below is the source HTML of a web page. Apply the following changes and return the COMPLETE modified HTML making sure you cover all the elements included in the <body> block. ABSOLUTELY no markdown fences, no explanations, no placeholders like "content would go here" or "to do".\n\nChanges: ${prompt}\n\nOriginal HTML (first 11000 chars):\n${rawHtml.slice(0, 11000)}`;
    const rebuiltData = await openaiChat('gpt-4.1-nano', [{ role: 'user', content: gptPrompt }], 28000);
    if (!rebuiltData.choices?.length) throw new Error('AI returned empty content');
    let rebuilt = rebuiltData.choices?.[0]?.message?.content || '';
    rebuilt = rebuilt.replace(/^```html?\n?/i, '').replace(/```\s*$/, '').trim();
    if (!rebuilt) throw new Error('AI returned empty content');

    window._rebuiltHtml = rebuilt;
    window._rebuiltName = (getTab()?.title || 'rebuilt-page').replace(/[^a-z0-9]/gi, '-').toLowerCase();

    out.className = 'ai-out';
    out.innerHTML = `<div style="color:var(--accent);font-weight:600;margin-bottom:6px;">&#10003; Page rebuilt!</div>
      <div style="font-size:11px;color:var(--text3);">Changes: ${esc(prompt)}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px;">${rebuilt.length.toLocaleString()} chars generated</div>
      <button class="act-btn primary" onclick="downloadRebuilt()" style="margin-top:8px;">&#8595; Download rebuilt HTML</button>
      <button class="act-btn" onclick="previewRebuilt()" style="margin-top:4px;">&#128065; Preview in browser</button>`;
    toast('Page rebuilt!', 'ok');
  } catch(e) {
    out.className = 'ai-out';
    out.textContent = '⚠ Error: ' + e.message;
    toast('Rebuild error: ' + e.message, 'err');
  }
}

function downloadRebuilt() {
  if (!window._rebuiltHtml) return;
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([window._rebuiltHtml], { type: 'text/html' })),
    download: (window._rebuiltName || 'rebuilt-page') + '.html'
  });
  a.click();
  toast('Downloaded!', 'ok');
}

function previewRebuilt() {
  if (!window._rebuiltHtml) return;
  newTab();
  setTimeout(() => {
    const fr = document.getElementById('main-frame');
    fr.removeAttribute('src'); fr.srcdoc = window._rebuiltHtml; fr.style.display = '';
    document.getElementById('home').classList.remove('visible');
    document.getElementById('blocked').style.display = 'none';
    setTab({ url: 'rebuilt:page', title: window._rebuiltName || 'Rebuilt Page' });
    updateNavBtns();
  }, 80);
}

// ── UTILS ─────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function domain(url) { try { return new URL(url).hostname.replace('www.',''); } catch(e) { return url; } }

function fav(url) {
  const d = domain(url).toLowerCase();
  const map = { 'google.com':'🔍','github.com':'🐙','youtube.com':'▶️','twitter.com':'🐦','x.com':'🐦',
    'facebook.com':'📘','instagram.com':'📸','wikipedia.org':'📖','reddit.com':'🤖',
    'stackoverflow.com':'🔶','notion.so':'📓','figma.com':'🎨','linkedin.com':'💼',
    'amazon.com':'📦','netflix.com':'🎬','spotify.com':'🎵','news.ycombinator.com':'🔸' };
  for (const [k,v] of Object.entries(map)) { if (d.includes(k)) return v; }
  return '🌐';
}

function relTime(iso) {
  const d = new Date(iso), n = Date.now(), s = Math.floor((n - d) / 1000);
  if (s < 60)    return s + 's';
  if (s < 3600)  return Math.floor(s/60) + 'm';
  if (s < 86400) return Math.floor(s/3600) + 'h';
  return Math.floor(s/86400) + 'd';
}

function toast(msg, type = 'ok') {
  const w = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = (type==='ok'?'✓':type==='err'?'✕':'ℹ') + ' ' + msg;
  w.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ── START ─────────────────────────────────────
boot();


// ── AUTH & SERVER SYNC ─────────────────────────────────────────

async function authCheckSession() {
  try {
    const r = await fetch('auth.php?action=me');
    const j = await r.json();
    if (j.ok && j.user) { currentUser = j.user; updateAuthUI(); }
  } catch { /* offline or no PHP backend — guest mode */ }
}

function updateAuthUI() {
  const badge    = document.getElementById('auth-user-badge');
  const loginBtn = document.getElementById('auth-login-btn');
  if (currentUser) {
    document.getElementById('auth-user-name').textContent = currentUser.username;
    if (badge)    badge.style.display    = 'flex';
    if (loginBtn) loginBtn.style.display = 'none';
    const an = document.getElementById('acc-username');
    const ae = document.getElementById('acc-email');
    if (an) an.textContent = currentUser.username;
    if (ae) ae.textContent = currentUser.email;
    const bl = document.getElementById('acc-btn-login');
    const bo = document.getElementById('acc-btn-logout');
    if (bl) bl.style.display = 'none';
    if (bo) bo.style.display = '';
  } else {
    if (badge)    badge.style.display    = 'none';
    if (loginBtn) loginBtn.style.display = '';
    const an = document.getElementById('acc-username');
    const ae = document.getElementById('acc-email');
    if (an) an.textContent = 'Guest';
    if (ae) ae.textContent = '—';
    const bl = document.getElementById('acc-btn-login');
    const bo = document.getElementById('acc-btn-logout');
    if (bl) bl.style.display = '';
    if (bo) bo.style.display = 'none';
  }
}

function showAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('auth-err').textContent = '';
}
function hideAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'none';
}
function authToggleForm(form) {
  document.getElementById('auth-form-login').style.display    = form === 'login'    ? '' : 'none';
  document.getElementById('auth-form-register').style.display = form === 'register' ? '' : 'none';
  document.getElementById('auth-err').textContent = '';
}
function authGuest() {
  localStorage.setItem('vdb-guest', '1');
  hideAuthOverlay();
}

async function authLogin() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-err');
  if (!email || !password) { errEl.textContent = 'Email and password required'; return; }
  try {
    const r = await fetch('auth.php?action=login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const j = await r.json();
    if (j.ok) {
      currentUser = j.user;
      localStorage.removeItem('vdb-guest');
      hideAuthOverlay(); updateAuthUI();
      clearDataCache();                    // clear previous user's data before loading this user's
      const loaded = await pullState();    // server → memory + localStorage
      if (!loaded) persistToLocalStorage(); // fresh account: persist empty state
      applyCfgUI();
      renderBM(); renderHist(); renderNotes(); renderSessions(); renderTabGroups(); renderPwdPanel();
      toast('Welcome back, ' + j.user.username + '!', 'ok');
    } else { errEl.textContent = j.error || 'Login failed'; }
  } catch { errEl.textContent = 'Network error'; }
}

async function authRegister() {
  const username = document.getElementById('auth-reg-username').value.trim();
  const email    = document.getElementById('auth-reg-email').value.trim();
  const password = document.getElementById('auth-reg-password').value;
  const errEl    = document.getElementById('auth-err');
  if (!username || !email || !password) { errEl.textContent = 'All fields required'; return; }
  try {
    const r = await fetch('auth.php?action=register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const j = await r.json();
    if (j.ok) {
      currentUser = j.user;
      localStorage.removeItem('vdb-guest');
      clearDataCache();                    // new account starts with clean slate
      hideAuthOverlay(); updateAuthUI();
      persistToLocalStorage();             // write empty state to localStorage
      renderBM(); renderHist(); renderNotes(); renderSessions(); renderTabGroups(); renderPwdPanel();
      toast('Account created! Welcome, ' + j.user.username + '!', 'ok');
    } else { errEl.textContent = j.error || 'Registration failed'; }
  } catch { errEl.textContent = 'Network error'; }
}

async function authLogout() {
  try { await fetch('auth.php?action=logout', { method: 'POST' }); } catch {}
  currentUser = null;
  clearDataCache();   // wipe in-memory state + localStorage so next user starts clean
  updateAuthUI();
  toast('Logged out', 'ok');
  showAuthOverlay();
}

// ── SERVER SYNC ─────────────────────────────────────────────────

/** Reset in-memory state and clear all data localStorage keys.
 *  Called on login, register, and logout to prevent cross-account contamination. */
function clearDataCache() {
  bookmarks = []; history_ = []; notes = {}; passwords = []; sessions = {};
  _tabGroupsData = null; _lastActiveUrl = '';
  // Nuclear clear: remove every vdb-* key except cfg and guest flag
  Object.keys(localStorage)
    .filter(k => k.startsWith('vdb-') && k !== 'vdb-cfg' && k !== 'vdb-guest')
    .forEach(k => localStorage.removeItem(k));
}

/** Persist current in-memory state to localStorage (guest/offline cache only).
 *  When logged in, the server is the single source of truth — do not write localStorage. */
function persistToLocalStorage() {
  if (currentUser) return;   // logged-in users: server only
  localStorage.setItem('vdb-bm',        JSON.stringify(bookmarks));
  localStorage.setItem('vdb-hist',      JSON.stringify(history_));
  localStorage.setItem('vdb-notes',     JSON.stringify(notes));
  localStorage.setItem('vdb-passwords', JSON.stringify(passwords));
  localStorage.setItem('vdb-sessions',  JSON.stringify(sessions));
}

function scheduleSync() {
  if (!currentUser) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(pushState, 700);
}

async function pushState() {
  if (!currentUser) return;
  const state = {
    bookmarks,
    history:   history_,
    notes,
    passwords,
    sessions,
    tabGroups: _tabGroupsData,
    lastUrl:   _lastActiveUrl || null,
    cfg: {
      engine: cfg.engine, home: cfg.home, hist: cfg.hist,
      autoext: cfg.autoext, proxyPreset: cfg.proxyPreset, proxy: cfg.proxy
      // cfg.key intentionally excluded — stays client-side only
    }
  };
  try {
    await fetch('data.php', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(state)
    });
  } catch { /* silent — will retry on next mutation */ }
}

async function pullState() {
  try {
    const r = await fetch('data.php');
    if (!r.ok) return false;
    const j = await r.json();
    if (!j.ok || !j.data) return false;
    const d = j.data;
    if (Array.isArray(d.bookmarks))                    bookmarks = d.bookmarks;
    if (Array.isArray(d.history))                      history_  = d.history;
    if (d.notes !== undefined)                         notes     = d.notes;
    if (Array.isArray(d.passwords))                    passwords = d.passwords;
    if (d.sessions && typeof d.sessions === 'object')  sessions  = d.sessions;
    if (d.tabGroups) { _tabGroupsData = d.tabGroups; }
    if (d.lastUrl)   { _lastActiveUrl  = d.lastUrl; }
    if (d.cfg && typeof d.cfg === 'object') {
      const savedKey = cfg.key;           // never overwrite API key from server
      Object.assign(cfg, d.cfg);
      cfg.key = savedKey;
      localStorage.setItem('vdb-cfg', JSON.stringify(cfg));
    }
    persistToLocalStorage();  // write server data back to localStorage (offline cache)
    return true;
  } catch { return false; }
}

function applyCfgUI() {
  const keyEl = document.getElementById('cfg-key');
  if (keyEl) {
    if (currentUser) {
      // Show server-side key status (never populate with actual key)
      keyEl.value = '';
      fetch('data.php?action=haskey')
        .then(r => r.json())
        .then(j => { keyEl.placeholder = j.hasKey ? 'Stored on server ●●●●●●●●' : 'Enter API key to save server-side'; })
        .catch(() => { keyEl.placeholder = 'Enter API key to save server-side'; });
    } else if (cfg.key) {
      keyEl.value = cfg.key;
    }
  }
  if (cfg.home) { const el = document.getElementById('cfg-home'); if (el) el.value = cfg.home; }
  const eng = document.getElementById('cfg-engine');
  if (eng && cfg.engine) eng.value = cfg.engine;
  const preset = document.getElementById('cfg-proxy-preset');
  if (preset) preset.value = cfg.proxyPreset || 'off';
  applyProxyPreset(cfg.proxyPreset || 'off', true);
  const th = document.getElementById('tog-hist');    if (th) th.classList.toggle('on', cfg.hist);
  const ta = document.getElementById('tog-autoext'); if (ta) ta.classList.toggle('on', cfg.autoext);
}
