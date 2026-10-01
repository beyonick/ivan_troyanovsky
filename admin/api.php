<?php
/* Админка на хостинге — то же API, что у admin/server.py, только на PHP.
   .htaccess в корне переводит /api/<действие> сюда (?action=<действие>).

   GET  /api/content          — content.js + shoots.js как JSON
   POST /api/save             — записать content.js и shoots.js (копия в admin/backups/)
   POST /api/upload?path=...  — сохранить файл (кадр/видео) в img/ или video/
   POST /api/delete?path=...  — удалить файл в img/s/
   POST /api/publish          — на хостинге нечего публиковать: сохранённое уже на сайте

   Пароль — заголовок X-Admin-Key. В репозитории его нет: deploy-hosting.sh
   берёт секрет ADMIN_PASSWORD и кладёт рядом admin-auth.php с солью и хэшем
   PBKDF2. Нет файла — админка закрыта для всех. */

declare(strict_types=1);

const LIMIT = 8;     // неудачных попыток входа
const WINDOW = 900;  // за 15 минут — потом ждать

$ROOT = dirname(__DIR__);
$FILES = ['content' => 'assets/content.js', 'shoots' => 'assets/shoots.js'];
$HEAD = [
    'content' => "/* content.js — тексты, магазин, обучение, настройки.\n"
               . "   Пишется из админки (/admin). Руками — можно, формат JSON. */\n"
               . "window.CONTENT = ",
    'shoots' => "/* shoots.js — съёмки и кадры. Пишется из админки (/admin).\n"
              . "   l — 1600px, m — 960px, t — 360px; cover — номер кадра-обложки. */\n"
              . "window.SHOOTS = ",
];
const UPLOAD_OK = '#^(img/(s|story|shop|site)/[\w\-./]+\.(webp|jpg|jpeg|png)|video/[\w\-.]+\.(webm|mp4))$#';

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

function out(int $code, array $obj): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($obj, JSON_UNESCAPED_UNICODE);
    exit;
}

/* Счётчик неудач по IP — файлом, базы на хостинге нет. */
function attempts_file(): string
{
    return sys_get_temp_dir() . '/troyanovsky-admin-' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '') . '.json';
}
function attempts(): array
{
    $raw = @file_get_contents(attempts_file());
    $a = $raw ? json_decode($raw, true) : null;
    if (!is_array($a) || time() - ($a['since'] ?? 0) > WINDOW) {
        return ['count' => 0, 'since' => time()];
    }
    return $a;
}

function auth(): void
{
    $auth = is_file(__DIR__ . '/admin-auth.php') ? require __DIR__ . '/admin-auth.php' : null;
    if (!is_array($auth)) {
        out(401, ['error' => 'Пароль на сервере не задан — добавьте секрет ADMIN_PASSWORD в GitHub и перевыложите сайт']);
    }
    $a = attempts();
    if ($a['count'] >= LIMIT) {
        out(401, ['error' => 'Слишком много попыток. Попробуйте через 15 минут']);
    }
    $key = (string) ($_SERVER['HTTP_X_ADMIN_KEY'] ?? '');
    $hash = hash_pbkdf2('sha256', $key, hex2bin($auth['salt']), (int) $auth['iterations'], 64);
    if ($key !== '' && hash_equals($auth['hash'], $hash)) {
        if ($a['count']) @unlink(attempts_file());
        return;
    }
    if ($key !== '') {
        $a['count']++;
        @file_put_contents(attempts_file(), json_encode($a), LOCK_EX);
        sleep(1);
    }
    out(401, ['error' => 'Неверный пароль']);
}

function read_js(string $name): object|array
{
    global $ROOT, $FILES;
    $s = file_get_contents("$ROOT/{$FILES[$name]}");
    $start = strpos($s, '=', strpos($s, 'window.')) + 1;
    $json = rtrim(trim(substr($s, $start)), ";\r\n\t ");
    $d = json_decode($json); // объектами: иначе пустой {} вернулся бы как []
    if (!is_object($d) && !is_array($d)) throw new RuntimeException("{$FILES[$name]}: не читается как JSON");
    return $d;
}

function write_js(string $name, $data): void
{
    global $ROOT, $FILES, $HEAD;
    $path = "$ROOT/{$FILES[$name]}";
    $bdir = __DIR__ . '/backups';
    if (!is_dir($bdir)) @mkdir($bdir, 0755, true);
    if (is_file($path)) copy($path, "$bdir/$name-" . date('Ymd-His') . '.js');
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if (file_put_contents($path, $HEAD[$name] . $json . ";\n", LOCK_EX) === false) {
        throw new RuntimeException("{$FILES[$name]}: нет прав на запись");
    }
    bump($name);
}

/* nginx TimeWeb кэширует js на год, поэтому после записи меняем ?v= в ссылках
   на файл во всех страницах — браузеры заберут новую версию. */
function bump(string $name): void
{
    global $ROOT, $FILES;
    $v = substr(sha1_file("$ROOT/{$FILES[$name]}"), 0, 10);
    $re = '#(assets/' . $name . '\.js)(\?v=[\w]+)?"#';
    foreach (array_merge(glob("$ROOT/*.html") ?: [], glob("$ROOT/legacy/*.html") ?: []) as $page) {
        $t = file_get_contents($page);
        $n = preg_replace($re, '$1?v=' . $v . '"', $t);
        if ($n !== null && $n !== $t) file_put_contents($page, $n, LOCK_EX);
    }
}

function rel_path(): string
{
    $rel = ltrim(str_replace('\\', '/', (string) ($_GET['path'] ?? '')), '/');
    if (str_contains($rel, '..')) out(400, ['error' => 'Недопустимый путь: ' . $rel]);
    return $rel;
}

$action = (string) ($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
auth();

try {
    if ($action === 'content' && $method === 'GET') {
        out(200, ['content' => read_js('content'), 'shoots' => read_js('shoots'), 'auth' => true, 'mode' => 'hosting']);
    }
    if ($method !== 'POST') out(405, ['error' => 'Нужен POST']);

    if ($action === 'save') {
        $d = json_decode((string) file_get_contents('php://input'));
        if (!is_object($d)) out(400, ['error' => 'Пустые или битые данные']);
        if (isset($d->content)) write_js('content', $d->content);
        if (isset($d->shoots)) write_js('shoots', $d->shoots);
        out(200, ['ok' => true]);
    }
    if ($action === 'upload') {
        $rel = rel_path();
        if (!preg_match(UPLOAD_OK, $rel)) out(400, ['error' => 'Недопустимый путь: ' . $rel]);
        $full = "$ROOT/$rel";
        if (!is_dir(dirname($full))) mkdir(dirname($full), 0755, true);
        $in = fopen('php://input', 'rb');
        $fh = fopen($full, 'wb');
        if (!$in || !$fh) throw new RuntimeException("$rel: нет прав на запись");
        $n = stream_copy_to_stream($in, $fh);
        fclose($fh);
        if (!$n) { @unlink($full); out(400, ['error' => 'Файл не дошёл — возможно, больше лимита хостинга']); }
        out(200, ['ok' => true, 'path' => $rel]);
    }
    if ($action === 'delete') {
        $rel = rel_path();
        if (!str_starts_with($rel, 'img/s/')) out(400, ['error' => 'Удалять можно только кадры съёмок']);
        if (is_file("$ROOT/$rel")) unlink("$ROOT/$rel");
        out(200, ['ok' => true]);
    }
    if ($action === 'publish') {
        out(200, ['ok' => true, 'log' => 'Админка на хостинге: сохранённое уже на сайте, публиковать отдельно не нужно.']);
    }
} catch (Throwable $e) { // ответ админке, а не белая страница
    out(500, ['error' => $e->getMessage()]);
}
out(404, ['error' => 'Нет такого действия']);
