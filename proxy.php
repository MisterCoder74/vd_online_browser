<?php
/**
 * VD Browser — proxy.php
 * Fetches a remote URL server-side and returns its HTML,
 * with a <base> tag injected so relative assets resolve correctly.
 *
 * Usage: proxy.php?url=https://example.com
 */

// ── CORS headers (allow same-origin requests from the HTML page) ──────────
header('Access-Control-Allow-Origin: *');
header('Content-Type: text/html; charset=utf-8');

// ── Input validation ───────────────────────────────────────────────────────
$url = isset($_GET['url']) ? trim($_GET['url']) : '';

if (!$url) {
    http_response_code(400);
    echo '<!-- proxy.php: missing ?url= parameter -->';
    exit;
}

// Only allow http / https
if (!preg_match('/^https?:\/\//i', $url)) {
    http_response_code(400);
    echo '<!-- proxy.php: only http/https URLs are allowed -->';
    exit;
}

// ── Blocklist (optional — add domains you never want proxied) ─────────────
$blocklist = [
    // 'ads.example.com',
];
$host = strtolower(parse_url($url, PHP_URL_HOST));
foreach ($blocklist as $blocked) {
    if (str_contains($host, $blocked)) {
        http_response_code(403);
        echo '<!-- proxy.php: blocked host -->';
        exit;
    }
}

// ── Fetch via cURL ─────────────────────────────────────────────────────────
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 5,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    CURLOPT_HTTPHEADER     => [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.5',
    ],
    CURLOPT_ENCODING       => '',   // accept gzip / deflate automatically
]);

$html     = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err      = curl_error($ch);
$finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL); // after redirects
curl_close($ch);

if ($html === false || $err) {
    http_response_code(502);
    echo "<!-- proxy.php: cURL error — $err -->";
    exit;
}

if ($httpCode >= 400) {
    http_response_code($httpCode);
    echo "<!-- proxy.php: upstream returned HTTP $httpCode -->";
    exit;
}

// ── Build base URL (preserves path for relative assets) ───────────────────
$parsed   = parse_url($finalUrl);
$basePath = isset($parsed['path']) ? preg_replace('/[^\/]*$/', '', $parsed['path']) : '/';
$baseUrl  = $parsed['scheme'] . '://' . $parsed['host'] . $basePath;

// ── Inject <base> tag ──────────────────────────────────────────────────────
$baseTag = '<base href="' . htmlspecialchars($baseUrl, ENT_QUOTES) . '">';

if (preg_match('/<head[\s>]/i', $html)) {
    // Insert right after opening <head …>
    $html = preg_replace('/(<head[^>]*>)/i', '$1' . $baseTag, $html, 1);
} else {
    $html = $baseTag . $html;
}

// ── Inject _blank interceptor (opens links in VD Browser's own tabs) ──────
$interceptScript = '<script>(function(){'
    . 'document.addEventListener("click",function(e){'
    .   'var a=e.target.closest("a[target=\'_blank\']");'
    .   'if(a&&a.href&&a.href.indexOf("javascript:")<0){'
    .     'e.preventDefault();e.stopPropagation();'
    .     'window.parent.postMessage({type:"vdb-open-tab",url:a.href},"*");'
    .   '}'
    . '},true);'   // capture phase so we beat any inline onclick handlers
    . '})();</script>';

// Insert just before </body> if present, otherwise append
if (preg_match('/<\/body>/i', $html)) {
    $html = preg_replace('/<\/body>/i', $interceptScript . '</body>', $html, 1);
} else {
    $html .= $interceptScript;
}

// ── Send response ──────────────────────────────────────────────────────────
echo $html;
