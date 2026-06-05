<?php
/**
 * auth.php — VD Browser authentication
 * Endpoints: ?action=me | register | login | logout
 * Storage: data/users.json (hashed passwords, bcrypt)
 */
session_start();
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');

define('USERS_FILE', __DIR__ . '/data/users.json');

// ── helpers ──────────────────────────────────────────────────────

function loadUsers(): array {
    if (!file_exists(USERS_FILE)) return [];
    $raw = @file_get_contents(USERS_FILE);
    return $raw ? (json_decode($raw, true) ?? []) : [];
}

function saveUsers(array $users): void {
    $dir = dirname(USERS_FILE);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents(USERS_FILE, json_encode($users, JSON_PRETTY_PRINT));
}

function genId(): string {
    return 'usr_' . bin2hex(random_bytes(8));
}

function respond(array $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function publicUser(array $u): array {
    return ['id' => $u['id'], 'username' => $u['username'], 'email' => $u['email']];
}

// ── router ───────────────────────────────────────────────────────

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$body   = ($method === 'POST')
    ? (json_decode(file_get_contents('php://input'), true) ?? [])
    : [];

switch ($action) {

    // ── me ───────────────────────────────────────────────────────
    case 'me':
        if (!empty($_SESSION['user_id'])) {
            $users = loadUsers();
            foreach ($users as $u) {
                if ($u['id'] === $_SESSION['user_id']) respond(['ok' => true, 'user' => publicUser($u)]);
            }
        }
        respond(['ok' => false]);

    // ── register ─────────────────────────────────────────────────
    case 'register':
        $username = trim($body['username'] ?? '');
        $email    = strtolower(trim($body['email'] ?? ''));
        $password = $body['password'] ?? '';

        if (!$username || !$email || !$password)
            respond(['ok' => false, 'error' => 'All fields required'], 400);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL))
            respond(['ok' => false, 'error' => 'Invalid email'], 400);
        if (strlen($password) < 6)
            respond(['ok' => false, 'error' => 'Password must be at least 6 characters'], 400);

        $users = loadUsers();
        foreach ($users as $u) {
            if ($u['email'] === $email)       respond(['ok' => false, 'error' => 'Email already registered'], 409);
            if ($u['username'] === $username) respond(['ok' => false, 'error' => 'Username already taken'], 409);
        }

        $new = [
            'id'            => genId(),
            'username'      => $username,
            'email'         => $email,
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'created_at'    => date('c'),
        ];
        $users[] = $new;
        saveUsers($users);
        $_SESSION['user_id'] = $new['id'];
        respond(['ok' => true, 'user' => publicUser($new)]);

    // ── login ─────────────────────────────────────────────────────
    case 'login':
        $email    = strtolower(trim($body['email'] ?? ''));
        $password = $body['password'] ?? '';

        if (!$email || !$password)
            respond(['ok' => false, 'error' => 'Email and password required'], 400);

        $users = loadUsers();
        $found = null;
        foreach ($users as $u) {
            if ($u['email'] === $email) { $found = $u; break; }
        }

        if (!$found || !password_verify($password, $found['password_hash']))
            respond(['ok' => false, 'error' => 'Invalid email or password'], 401);

        $_SESSION['user_id'] = $found['id'];
        respond(['ok' => true, 'user' => publicUser($found)]);

    // ── logout ────────────────────────────────────────────────────
    case 'logout':
        session_destroy();
        respond(['ok' => true]);

    default:
        respond(['ok' => false, 'error' => 'Unknown action'], 404);
}
