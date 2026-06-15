<?php
/**
 * openai.php — VD Browser OpenAI server-side proxy (Phase 5a)
 *
 * POST { model, messages, max_tokens, temperature? }
 * → forwards to api.openai.com/v1/chat/completions using the
 *   API key stored server-side for the logged-in user.
 *
 * Never exposes the API key to the client.
 * Returns the raw OpenAI JSON response.
 *
 * Requires an active PHP session ($_SESSION['user_id']).
 * Guest users (no session) receive 401 and must use the client-side path.
 */

session_start();
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');

function respond(array $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// ── Auth guard ───────────────────────────────────────────────────────────────
if (empty($_SESSION['user_id'])) {
    respond(['error' => ['message' => 'Unauthorized — log in to use the server-side proxy.', 'type' => 'auth_error']], 401);
}

// ── Load API key from server-side storage ────────────────────────────────────
$userId  = preg_replace('/[^a-z0-9_]/', '', $_SESSION['user_id']);
$keyFile = __DIR__ . '/data/' . $userId . '/apikey.json';

if (!file_exists($keyFile)) {
    respond(['error' => ['message' => 'No API key stored. Set it in Settings.', 'type' => 'no_key']], 422);
}

$keyData = json_decode(file_get_contents($keyFile), true);
$apiKey  = trim($keyData['key'] ?? '');

if (!$apiKey) {
    respond(['error' => ['message' => 'API key is empty. Set it in Settings.', 'type' => 'no_key']], 422);
}

// ── Parse & validate request body ────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => ['message' => 'POST only', 'type' => 'invalid_request']], 405);
}

$body = json_decode(file_get_contents('php://input'), true);

if (!is_array($body) || empty($body['model']) || empty($body['messages'])) {
    respond(['error' => ['message' => 'Invalid request body: model + messages required.', 'type' => 'invalid_request']], 400);
}

// Whitelist fields — never forward unexpected keys
$payload = [
    'model'      => (string) $body['model'],
    'messages'   => $body['messages'],
    'max_tokens' => isset($body['max_tokens']) ? (int) $body['max_tokens'] : 512,
];
if (isset($body['temperature'])) $payload['temperature'] = (float) $body['temperature'];

// ── Forward to OpenAI via cURL ────────────────────────────────────────────────
$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiKey,
    ],
    CURLOPT_TIMEOUT        => 120,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($response === false || $curlErr) {
    respond(['error' => ['message' => 'Proxy network error: ' . $curlErr, 'type' => 'proxy_error']], 502);
}

// Return OpenAI's response as-is (status code forwarded too)
http_response_code($httpCode);
echo $response;
