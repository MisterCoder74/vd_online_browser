<?php
/**
 * data.php — VD Browser per-user state storage
 * GET  → load user's state.json
 * POST → save user's state.json (full replace)
 * DELETE → clear user's state.json
 *
 * Requires active PHP session ($_SESSION['user_id'])
 * Note: cfg.key is stripped server-side even if accidentally sent.
 */
session_start();
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');

// Auth guard
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
    exit;
}

// Sanitize user ID for filesystem path
$userId    = preg_replace('/[^a-z0-9_]/', '', $_SESSION['user_id']);
$stateFile = __DIR__ . '/data/' . $userId . '/state.json';
$method    = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if (!file_exists($stateFile)) {
        echo json_encode(['ok' => true, 'data' => null]);
    } else {
        $data = json_decode(file_get_contents($stateFile), true);
        echo json_encode(['ok' => true, 'data' => $data]);
    }

} elseif ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
        exit;
    }
    // Safety: never persist the API key server-side
    if (isset($body['cfg']['key'])) unset($body['cfg']['key']);

    $dir = dirname($stateFile);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents($stateFile, json_encode($body, JSON_PRETTY_PRINT));
    echo json_encode(['ok' => true]);

} elseif ($method === 'DELETE') {
    if (file_exists($stateFile)) unlink($stateFile);
    echo json_encode(['ok' => true]);

} else {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
}
