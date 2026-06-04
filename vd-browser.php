<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VD Browser</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="vd-browser.css?v=<?php echo time(); ?>">
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
</head>
<body>

<!-- ════════════════ TOP BAR ════════════════ -->
<div class="topbar">
  <span class="brand">VD<em>Browser</em></span>
  <div class="topbar-sep"></div>
  <button class="nav-btn" id="btn-back"    title="Back (Alt+←)"    onclick="goBack()"    disabled>&#8592;</button>
  <button class="nav-btn" id="btn-fwd"     title="Forward (Alt+→)" onclick="goForward()" disabled>&#8594;</button>
  <button class="nav-btn" id="btn-reload"  title="Reload (F5)"     onclick="reloadPage()">&#8635;</button>
  <button class="nav-btn" id="btn-home"    title="Home"            onclick="goHome()">&#8962;</button>
  <div class="topbar-sep"></div>
  <div class="url-wrap">
    <span class="sec-icon" id="sec-icon">&#128275;</span>
    <input class="url-input" id="url-input" type="text" placeholder="Enter URL or search…"
           onkeydown="handleUrlKey(event)" value="">
    <button class="url-go" onclick="navigate()" title="Go">&#9654;</button>
    <button class="bm-star" id="bm-star" onclick="quickBookmark()" title="Bookmark">&#9734;</button>
  </div>
  <div class="topbar-sep"></div>
  <button class="nav-btn" title="Screenshot + Annotate (Ctrl+Shift+S)" onclick="takeScreenshot()">&#128247;</button>
  <button class="nav-btn" id="btn-zip" title="Download page + assets as ZIP" onclick="downloadPageZip()">&#128230; ZIP</button>
  <button class="nav-btn" title="Copy URL"                  onclick="copyUrl()">&#128279;</button>
  <button class="nav-btn" title="Open in new tab"           onclick="openInNewTab()">&#8599;</button>
  <div class="topbar-sep"></div>
  <button class="nav-btn" id="btn-edit"  title="Toggle edit mode (Ctrl+E)"   onclick="toggleEditMode()">&#9998;</button>
  <button class="nav-btn" id="btn-split" title="Side-by-side split (Ctrl+\)" onclick="toggleSplit()">&#9638;&#9638;</button>
  <button class="nav-btn" id="btn-pip"   title="Picture-in-Picture (Ctrl+P)" onclick="openPip()">&#128204;</button>
  <div class="topbar-sep"></div>
  <button class="nav-btn accent" id="btn-sb" title="Toggle sidebar (Ctrl+B)" onclick="toggleSidebar()">&#9638;</button>
</div>

<!-- ════════════════ TAB BAR ════════════════ -->
<div class="tabbar" id="tabbar">
  <button class="newtab" onclick="newTab()" title="New Tab">+</button>
</div>

<!-- ════════════════ MAIN ════════════════ -->
<div class="main-area">

  <!-- ── SIDEBAR ── -->
  <div class="sidebar" id="sidebar">
    <div class="s-tabs">
      <div class="s-tab active" data-p="bookmarks" onclick="switchPanel('bookmarks')" title="Bookmarks">&#128214;</div>
      <div class="s-tab"        data-p="ai"        onclick="switchPanel('ai')"        title="AI Assistant">&#129302;</div>
      <div class="s-tab"        data-p="notes"     onclick="switchPanel('notes')"     title="Notes">&#128221;</div>
      <div class="s-tab"        data-p="history"   onclick="switchPanel('history')"   title="History">&#128336;</div>
      <div class="s-tab"        data-p="reader"    onclick="switchPanel('reader')"    title="Reader Mode">&#128218;</div>
      <div class="s-tab"        data-p="settings"  onclick="switchPanel('settings')"  title="Settings">&#9881;</div>
      <div class="s-tab"        data-p="sessions"  onclick="switchPanel('sessions')"  title="Sessions">&#128203;</div>
      <div class="s-tab"        data-p="passwords" onclick="switchPanel('passwords')" title="Password Manager">&#128273;</div>
    </div>

    <!-- BOOKMARKS -->
    <div class="s-panel active" id="panel-bookmarks">
      <div class="p-head">&#128214; Bookmarks <span class="cnt" id="bm-cnt">0</span></div>
      <div class="p-body">
        <div class="bm-form">
          <input class="mini-input" type="text" id="bm-title" placeholder="Title…">
          <input class="mini-input" type="text" id="bm-url"   placeholder="URL…">
          <input class="mini-input" type="text" id="bm-tags"  placeholder="Tags (comma-separated)…">
          <button class="act-btn primary" onclick="addBookmark()">&#43; Save bookmark</button>
        </div>
        <div id="bm-list"></div>
        <button class="act-btn" onclick="window.location.assign('vd-ai-bookman.html')" style="margin-top:8px;border-style:dashed;">
          &#128218; Open full Bookmark Manager
        </button>
      </div>
    </div>

    <!-- AI ASSISTANT -->
    <div class="s-panel" id="panel-ai">
      <div class="p-head">&#129302; AI Assistant</div>
      <div class="p-body">
        <div class="sec-lbl">Page actions</div>
        <button class="act-btn" onclick="ai('summarize')">&#128196; Summarize this page</button>
        <button class="act-btn" onclick="ai('keypoints')">&#10024; Extract key points</button>
        <button class="act-btn" onclick="ai('translate')">&#127758; Translate to English</button>
        <button class="act-btn" onclick="ai('links')">&#128279; Extract important links</button>
        <button class="act-btn" onclick="ai('tags')">&#127991; Auto-tag &amp; categorize</button>
        <button class="act-btn" onclick="ai('reading')">&#9201; Estimate reading time</button>
        <button class="act-btn" onclick="ai('eli5')">&#129782; Explain like I'm 5</button>
        <button class="act-btn" onclick="ai('tweet')">&#128140; Draft a tweet about this</button>
        <div class="sec-lbl" style="margin-top:12px;">Tab management</div>
        <button class="act-btn" onclick="aiGroupTabs()">&#128193; Group my open tabs with AI</button>
        <!-- PERSISTENT TAB GROUPS -->
        <div id="tab-groups-box" style="display:none;margin-top:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);">Saved groups</span>
            <div class="tg-actions" style="margin-bottom:0;">
              <button class="tg-btn" onclick="aiGroupTabs()" title="Re-run AI grouping">&#8635; Re-group</button>
              <button class="tg-btn" onclick="clearTabGroups()" title="Remove saved groups">&#10005; Clear</button>
            </div>
          </div>
          <div class="tg-meta" id="tg-meta"></div>
          <div id="tg-list"></div>
        </div>
        <div class="sec-lbl" style="margin-top:12px;">Form Filler (AI)</div>
        <button class="act-btn" id="ff-detect-btn" onclick="detectForms()">&#128269; Detect &amp; analyze forms</button>
        <div id="ff-area" style="display:none;margin-top:6px;">
          <div id="ff-fields"></div>
          <div style="display:flex;gap:5px;margin-top:4px;">
            <button class="act-btn primary" style="flex:1;" onclick="fillForms()">&#128137; Fill all fields</button>
            <button class="act-btn" style="flex:0 0 auto;" onclick="document.getElementById('ff-area').style.display='none';">&#10005;</button>
          </div>
        </div>
        <div class="sec-lbl" style="margin-top:12px;">Page rebuilder (AI)</div>
        <textarea class="mini-input" id="rebuild-prompt" rows="2"
                  style="resize:vertical;min-height:55px;" placeholder="Describe changes… e.g. 'dark mode, remove ads, bigger font'"></textarea>
        <button class="act-btn" onclick="rebuildPage()">&#127959; Rebuild page with AI</button>
        <div class="sec-lbl" style="margin-top:12px;">Ask about this page</div>
        <textarea class="mini-textarea" id="ai-q" rows="3" placeholder="What are the main arguments? Is this site trustworthy? …" style="min-height:70px;"></textarea>
        <button class="act-btn primary" onclick="ai('ask')" style="margin-top:5px;">&#9889; Ask AI</button>
        <div class="sec-lbl">Response</div>
        <div class="ai-out idle" id="ai-out">Set your OpenAI API key in Settings, then click any action above.</div>
      </div>
    </div>

    <!-- NOTES -->
    <div class="s-panel" id="panel-notes">
      <div class="p-head">&#128221; Page Notes <span class="cnt" id="notes-cnt">0</span></div>
      <div class="p-body">
        <div style="font-size:10px;color:var(--text3);margin-bottom:6px;">Notes are saved per URL automatically.</div>
        <textarea class="mini-textarea" id="notes-area" placeholder="Take notes about this page…" oninput="saveNote()"></textarea>
        <div class="sec-lbl" style="margin-top:12px;">All notes</div>
        <div id="notes-list"></div>
      </div>
    </div>

    <!-- HISTORY -->
    <div class="s-panel" id="panel-history">
      <div class="p-head">&#128336; History <span class="cnt" id="hist-cnt">0</span></div>
      <div class="p-body">
        <button class="act-btn danger" onclick="clearHistory()">&#128465; Clear history</button>
        <div id="hist-list" style="margin-top:8px;"></div>
      </div>
    </div>

    <!-- READER MODE -->
    <div class="s-panel" id="panel-reader">
      <div class="p-head">&#128218; Reader Mode</div>
      <div class="p-body">
        <div class="sec-lbl">Controls</div>
        <button class="act-btn" onclick="ai('reader')">&#128218; Generate clean article view</button>
        <div class="sec-lbl" style="margin-top:10px;">Font size</div>
        <input type="range" min="12" max="22" value="15" oninput="setReaderFont(this.value)"
               style="width:100%;accent-color:var(--accent);margin-bottom:6px;">
        <div class="sec-lbl">Article</div>
        <div id="reader-out" style="font-size:14px;line-height:1.8;color:var(--text2);background:var(--bg3);border:1px solid var(--border);border-radius:var(--r2);padding:12px;min-height:120px;">
          <span style="color:var(--text3);font-size:12px;font-style:italic;">Click "Generate clean article view" above.</span>
        </div>
      </div>
    </div>

    <!-- SETTINGS -->
    <div class="s-panel" id="panel-settings">
      <div class="p-head">&#9881; Settings</div>
      <div class="p-body">
        <div class="sec-lbl">OpenAI API Key</div>
        <input class="mini-input" type="password" id="cfg-key" placeholder="sk-…" oninput="saveSettings()">
        <div class="sec-lbl">CORS Proxy</div>
        <select class="set-select" id="cfg-proxy-preset" onchange="applyProxyPreset(this.value)" style="margin-bottom:5px;">
          <option value="local" selected>proxy.php — local server (recommended)</option>
          <option value="off">None (direct, most sites blocked)</option>
          <option value="allorigins">AllOrigins (free, external)</option>
          <option value="custom">Custom proxy URL…</option>
        </select>
        <input class="mini-input" type="text" id="cfg-proxy" placeholder="https://yourproxy.com/?url=" oninput="saveSettings()" style="display:none;">
        <div id="proxy-status" style="font-size:10px;margin-bottom:4px;color:var(--accent);">
          🖥️ Active: <code style="color:var(--amber);font-size:10px;">proxy.php (local)</code>
        </div>
        <div style="font-size:10px;color:var(--text3);line-height:1.5;">
          <strong style="color:var(--text2);">proxy.php</strong> fetches pages server-side with cURL — no CORS, no QUIC errors, no third-party dependency. Place <code style="color:var(--amber);">proxy.php</code> in the same folder as this HTML file.
        </div>
        <div class="sec-lbl">Homepage</div>
        <input class="mini-input" type="text" id="cfg-home" placeholder="about:home" oninput="saveSettings()" value="about:home">
        <div class="sec-lbl">Search engine</div>
        <select class="set-select" id="cfg-engine" onchange="saveSettings()">
          <option value="https://www.google.com/search?q=">Google</option>
          <option value="https://duckduckgo.com/?q=">DuckDuckGo</option>
          <option value="https://search.brave.com/search?q=">Brave</option>
          <option value="https://www.bing.com/search?q=">Bing</option>
        </select>
        <div class="set-row" style="margin-top:12px;">
          <div class="set-lbl">Save browsing history<small>Stored in localStorage</small></div>
          <div class="toggle on" id="tog-hist" onclick="togSetting('hist')"></div>
        </div>
        <div class="set-row">
          <div class="set-lbl">Open blocked sites in new tab<small>Auto-redirect when embed fails</small></div>
          <div class="toggle" id="tog-autoext" onclick="togSetting('autoext')"></div>
        </div>
        <div style="margin-top:14px;">
          <button class="act-btn" onclick="exportData()">&#128228; Export all data (JSON)</button>
          <button class="act-btn danger" onclick="clearAllData()">&#128465; Clear all data</button>
        </div>
      </div>
    </div>

    <!-- SESSIONS -->
    <div class="s-panel" id="panel-sessions">
      <div class="p-head">&#128203; Sessions <span class="cnt" id="sess-cnt">0</span></div>
      <div class="p-body">
        <div class="sec-lbl">Save current tabs as session</div>
        <div style="display:flex;gap:4px;">
          <input class="mini-input" type="text" id="sess-name-in" placeholder="Session name…"
                 style="flex:1;margin-bottom:0;" onkeydown="if(event.key==='Enter')saveSession()">
          <button class="act-btn primary" onclick="saveSession()"
                  style="white-space:nowrap;width:auto;padding:6px 10px;margin-bottom:0;">&#128190; Save</button>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:4px;">
          Saves all <span id="sess-tab-count">0</span> open tab(s) under this name.
        </div>
        <div class="sec-lbl" style="margin-top:12px;">Saved sessions</div>
        <div id="sess-list"></div>
      </div>
    </div>

    <!-- PASSWORDS -->
    <div class="s-panel" id="panel-passwords">
      <div class="p-head">&#128273; Passwords <span class="cnt" id="pwd-cnt">0</span></div>
      <div class="p-body">
        <input class="mini-input" type="text" id="pwd-search" placeholder="Search site or username&#8230;"
               oninput="renderPwdPanel()">
        <div class="sec-lbl" style="margin-top:10px;">Add credential</div>
        <input class="mini-input" type="text" id="pwd-domain" placeholder="Domain (e.g. github.com)">
        <input class="mini-input" type="text" id="pwd-user"   placeholder="Username / email">
        <div style="display:flex;gap:4px;align-items:center;">
          <input class="mini-input" type="password" id="pwd-pass" placeholder="Password"
                 style="flex:1;margin-bottom:0;" onkeydown="if(event.key==='Enter')addPwd()">
          <button class="act-btn" id="pwd-eye" onclick="togglePwdVis()"
                  style="width:auto;padding:6px 8px;margin-bottom:0;" title="Show/hide">&#128065;</button>
        </div>
        <div style="display:flex;gap:4px;margin-top:5px;">
          <button class="act-btn primary" style="flex:1;" onclick="addPwd()">&#43; Save</button>
          <button class="act-btn" style="flex:0 0 auto;padding:6px 10px;" onclick="fillDomainFromTab()"
                  title="Fill domain from current tab">&#128279;</button>
        </div>
        <div class="sec-lbl" style="margin-top:12px;">Saved credentials</div>
        <div id="pwd-list"></div>
      </div>
    </div>
  </div><!-- /sidebar -->

  <!-- ── BROWSER AREA ── -->
  <div class="browser-area" id="browser-area">

    <!-- EDIT TOOLBAR -->
    <div class="edit-toolbar" id="edit-toolbar">
      <span style="font-size:10px;color:var(--amber);font-weight:700;margin-right:4px;">&#9998; EDIT</span>
      <button class="edit-btn" onclick="editCmd('bold')"      title="Bold"><b>B</b></button>
      <button class="edit-btn" onclick="editCmd('italic')"    title="Italic"><i>I</i></button>
      <button class="edit-btn" onclick="editCmd('underline')" title="Underline"><u>U</u></button>
      <div class="edit-sep"></div>
      <button class="edit-btn" onclick="editCmd('formatBlock','h1')" title="H1">H1</button>
      <button class="edit-btn" onclick="editCmd('formatBlock','h2')" title="H2">H2</button>
      <button class="edit-btn" onclick="editCmd('formatBlock','p')"  title="Paragraph">&#182;</button>
      <div class="edit-sep"></div>
      <button class="edit-btn" onclick="editInsertLink()"        title="Insert link">&#128279;</button>
      <button class="edit-btn" onclick="editCmd('removeFormat')" title="Clear formatting">&#10005;F</button>
      <div style="flex:1;"></div>
      <button class="edit-btn primary" onclick="editSave()">&#128190; Save HTML</button>
      <button class="edit-btn" onclick="toggleEditMode()" style="margin-left:4px;">Exit</button>
    </div>

    <!-- SPLIT WRAPPER -->
    <div class="split-wrap" id="split-wrap">

      <!-- LEFT PANE (main) -->
      <div class="pane-main" id="pane-L">
        <div class="loadbar"><div class="loadbar-fill" id="loadbar"></div></div>

        <!-- FIND BAR -->
        <div class="find-bar" id="find-bar">
          <span style="font-size:11px;color:var(--text3);">&#128269;</span>
          <input id="find-input" class="find-input" type="text" placeholder="Find in page…"
                 oninput="findExec()" onkeydown="findKey(event)">
          <span id="find-count" class="find-count"></span>
          <button class="find-btn" onclick="findStep(-1)" title="Previous (Shift+Enter)">&#9650;</button>
          <button class="find-btn" onclick="findStep(1)"  title="Next (Enter)">&#9660;</button>
          <button class="find-btn" onclick="closeFindBar()" title="Close (Esc)">&#10005;</button>
        </div>

        <!-- HOME PAGE -->
        <div class="home visible" id="home">
          <div class="home-logo">VDBrowser<sub>v1.0</sub></div>
          <div class="home-search-row">
            <input type="text" id="home-q" placeholder="Search or enter a URL…" onkeydown="if(event.key==='Enter')homeSearch()">
            <button onclick="homeSearch()">Go</button>
          </div>
          <div class="quicklinks">
            <a class="ql" onclick="loadUrl('https://google.com')"><span>&#128269;</span>Google</a>
            <a class="ql" onclick="loadUrl('https://github.com')"><span>&#128025;</span>GitHub</a>
            <a class="ql" onclick="loadUrl('https://wikipedia.org')"><span>&#128214;</span>Wikipedia</a>
            <a class="ql" onclick="loadUrl('https://www.vivacitydesign.net/vd_ai_division/index.html')"><span>&#129302;</span>Vivacity AI Division</a>
          </div>
        </div>

        <!-- IFRAME -->
        <iframe class="browser-iframe" id="main-frame" style="display:none;"
                sandbox="allow-same-origin allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock"
                title="VD Browser Frame"></iframe>

        <!-- BLOCKED OVERLAY -->
        <div class="blocked" id="blocked">
          <div class="blocked-icon">&#128683;</div>
          <h2>Site can't be embedded</h2>
          <p><strong id="blocked-url"></strong> has blocked embedding via
            <code>X-Frame-Options</code> or <code>Content-Security-Policy</code>.<br><br>
            Open it externally, or add a CORS proxy in Settings.
          </p>
          <button class="ext-btn" onclick="openInNewTab()">&#8599; Open in new tab</button>
        </div>
      </div><!-- /pane-L -->

      <!-- RIGHT PANE (split) -->
      <div class="pane-main pane-r" id="pane-R">
        <div class="split-navrow">
          <button class="snb" id="split-back" onclick="splitGoBack()" disabled title="Back">&#8592;</button>
          <button class="snb" id="split-fwd"  onclick="splitGoFwd()"  disabled title="Forward">&#8594;</button>
          <button class="snb" onclick="splitReload()" title="Reload">&#8635;</button>
          <span class="sec-icon" id="split-sec" style="font-size:12px;margin:0 2px;">&#128275;</span>
          <input type="text" id="split-url-in" placeholder="Enter URL or search…" onkeydown="splitUrlKey(event)">
          <button class="snb" onclick="splitNavigate()">&#9654;</button>
          <button class="snb" onclick="splitSendToMain()" title="Send URL to main pane">&#8592;&#9632;</button>
          <button class="snb danger" onclick="closeSplit()" title="Close split">&#10005;</button>
        </div>
        <div class="loadbar"><div class="loadbar-fill" id="split-lb"></div></div>
        <div class="split-home" id="split-home">Enter a URL above to browse</div>
        <iframe class="browser-iframe" id="split-frame" style="display:none;"
                sandbox="allow-same-origin allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock"
                title="Split Frame"></iframe>
        <div class="blocked" id="split-blocked" style="display:none;">
          <div class="blocked-icon">&#128683;</div>
          <h2>Site can't be embedded</h2>
          <p>This site blocked embedding. Open it externally.</p>
          <button class="ext-btn" onclick="splitOpenNew()">&#8599; Open in new tab</button>
        </div>
      </div><!-- /pane-R -->

    </div><!-- /split-wrap -->
  </div><!-- /browser-area -->

</div><!-- /main-area -->

<!-- STATUS BAR -->
<div class="statusbar">
  <span><span class="sb-dot g"></span>VDBrowser v1.0</span>
  <span id="sb-url">about:home</span>
  <span id="sb-proxy" style="display:none;">🌐 <span style="color:var(--accent)">proxy on</span></span>
  <span>&#129302; AI: <span id="sb-ai" style="color:var(--red)">no key</span></span>
  <span class="sb-right" id="sb-time"></span>
</div>

<!-- TOASTS -->
<div class="toast-wrap" id="toasts"></div>

<script src="vd-browser.js?v=<?php echo time(); ?>"></script>

<!-- ════ PiP WINDOW ════ -->
<div class="pip-win" id="pip-win" style="display:none;">
  <div class="pip-header" id="pip-drag">
    <span style="font-size:10px;color:var(--text3);margin-right:3px;">&#128204; PiP</span>
    <span id="pip-title" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--text2);"></span>
    <button class="pip-btn back" onclick="pipSendToMain()" title="Send URL to main pane">&#8592;&#9632;</button>
    <button class="pip-btn" onclick="closePip()" title="Close PiP">&#10005;</button>
  </div>
  <iframe class="pip-iframe" id="pip-frame"
          sandbox="allow-same-origin allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock"
          title="PiP Frame"></iframe>
</div>

<!-- ════ SCREENSHOT ANNOTATOR ════ -->
<div class="ann-overlay" id="ann-overlay">
  <div class="ann-toolbar">
    <span style="font-family:var(--font-display);font-size:13px;color:var(--accent);margin-right:4px;">&#9986; Annotator</span>
    <div class="ann-sep"></div>
    <button class="ann-tool active" id="ann-t-pen"   onclick="setAnnTool('pen')"   title="Pen (freehand)">&#9998;</button>
    <button class="ann-tool"        id="ann-t-rect"  onclick="setAnnTool('rect')"  title="Rectangle">&#9633;</button>
    <button class="ann-tool"        id="ann-t-arrow" onclick="setAnnTool('arrow')" title="Arrow">&#8599;</button>
    <button class="ann-tool"        id="ann-t-text"  onclick="setAnnTool('text')"  title="Text">T</button>
    <button class="ann-tool"        id="ann-t-erase" onclick="setAnnTool('erase')" title="Eraser">&#9003;</button>
    <button class="ann-tool"        id="ann-t-crop"  onclick="setAnnTool('crop')"  title="Crop">&#9986;</button>
    <div class="ann-sep"></div>
    <input type="color" id="ann-color" value="#c8f060"
           oninput="annUpdateColor(this.value)"
           style="width:28px;height:28px;border:1px solid var(--border);border-radius:var(--r);background:none;cursor:pointer;padding:1px;"
           title="Color">
    <input type="range" id="ann-size" min="1" max="20" value="3"
           oninput="annUpdateSize(this.value)"
           style="width:64px;" title="Brush size">
    <span id="ann-size-val" style="font-size:11px;color:var(--text3);min-width:16px;">3</span>
    <div class="ann-sep"></div>
    <button class="ann-tool" onclick="annUndo()"    title="Undo (Ctrl+Z)">&#8617;</button>
    <button class="ann-tool" onclick="annClear()"   title="Clear all annotations">&#128465;</button>
    <div style="flex:1;"></div>
    <button class="ann-tool" onclick="annCopy()"     title="Copy to clipboard">&#128203;</button>
    <button class="ann-tool" onclick="annDownload()" title="Download PNG">&#128190;</button>
    <button class="ann-tool danger" onclick="closeAnnotator()" title="Close" style="margin-left:4px;">&#10005;</button>
  </div>
  <div id="ann-crop-bar" class="ann-crop-confirm">
    <span style="font-size:12px;color:var(--text2);">Drag to select crop region.</span>
    <button class="ann-tool" onclick="annConfirmCrop()" style="background:var(--accent-dim);border-color:var(--accent);color:var(--accent);">&#10003; Crop</button>
    <button class="ann-tool" onclick="annCancelCrop()">&#10007; Cancel</button>
  </div>
  <div class="ann-canvas-wrap" id="ann-canvas-wrap">
    <div id="ann-canvas-container" style="position:relative;display:inline-block;">
      <canvas id="ann-crop-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:3;display:none;"></canvas>
      <canvas id="ann-bg" style="display:block;max-width:100%;"></canvas>
      <canvas id="ann-draw" style="position:absolute;top:0;left:0;width:100%;height:100%;cursor:crosshair;"
        onmousedown="annMouseDown(event)"
        onmousemove="annMouseMove(event)"
        onmouseup="annMouseUp(event)"
        onmouseleave="annMouseUp(event)"
        ontouchstart="annMouseDown(event)"
        ontouchmove="annMouseMove(event)"
        ontouchend="annMouseUp(event)">
      </canvas>
    </div>
  </div>
</div>

</body>
</html>
