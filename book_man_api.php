<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

$bookmarksFile = 'bookmarks.json';

function loadBookmarks($file) {
  if (!file_exists($file)) {
    file_put_contents($file, json_encode([]));
    return [];
  }
  $data = file_get_contents($file);
  $decoded = json_decode($data, true);
  return is_array($decoded) ? $decoded : [];
}

function persistBookmarks($file, $bookmarks) {
  file_put_contents($file, json_encode(array_values($bookmarks), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function sanitizeBookmark($input) {
  // NO htmlspecialchars — data stays clean; escaping is the frontend's responsibility
  return [
    'id'        => isset($input['id']) ? (string)$input['id'] : (string)(time() * 1000 + rand(0, 999)),
    'title'     => isset($input['title'])     ? (string)$input['title']     : '',
    'url'       => isset($input['url'])       ? (string)$input['url']       : '',
    'notes'     => isset($input['notes'])     ? (string)$input['notes']     : '',
    'tags'      => isset($input['tags']) && is_array($input['tags']) ? $input['tags'] : [],
    'aiTagged'  => isset($input['aiTagged'])  ? (bool)$input['aiTagged']    : false,
    'createdAt' => isset($input['createdAt']) ? (string)$input['createdAt'] : date('c'),
  ];
}

$body = json_decode(file_get_contents('php://input'), true);
$method = $_SERVER['REQUEST_METHOD'];

// ── GET — return all bookmarks ────────────────────────────────────────────────
if ($method === 'GET') {
  echo json_encode(loadBookmarks($bookmarksFile));
  exit;
}

// ── POST — add new bookmark ───────────────────────────────────────────────────
if ($method === 'POST') {
  if (empty($body['title']) || empty($body['url'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'title and url are required']);
    exit;
  }
  $bookmarks = loadBookmarks($bookmarksFile);
  $bookmark = sanitizeBookmark($body);
  $bookmarks[] = $bookmark;
  persistBookmarks($bookmarksFile, $bookmarks);
  echo json_encode(['status' => 'success', 'bookmark' => $bookmark]);
  exit;
}

// ── PUT — update existing bookmark (e.g. after AI retag) ─────────────────────
if ($method === 'PUT') {
  if (empty($body['id'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'id is required']);
    exit;
  }
  $bookmarks = loadBookmarks($bookmarksFile);
  $found = false;
  foreach ($bookmarks as &$bm) {
    if ((string)$bm['id'] === (string)$body['id']) {
      $bm = sanitizeBookmark(array_merge($bm, $body));
      $found = true;
      break;
    }
  }
  unset($bm);
  if (!$found) {
    http_response_code(404);
    echo json_encode(['status' => 'error', 'message' => 'bookmark not found']);
    exit;
  }
  persistBookmarks($bookmarksFile, $bookmarks);
  echo json_encode(['status' => 'success']);
  exit;
}

// ── DELETE — remove bookmark by id ───────────────────────────────────────────
if ($method === 'DELETE') {
  if (empty($body['id'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'id is required']);
    exit;
  }
  $bookmarks = loadBookmarks($bookmarksFile);
  $filtered = array_filter($bookmarks, fn($bm) => (string)$bm['id'] !== (string)$body['id']);
  if (count($filtered) === count($bookmarks)) {
    http_response_code(404);
    echo json_encode(['status' => 'error', 'message' => 'bookmark not found']);
    exit;
  }
  persistBookmarks($bookmarksFile, $filtered);
  echo json_encode(['status' => 'success']);
  exit;
}

// ── Fallback ──────────────────────────────────────────────────────────────────
http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);