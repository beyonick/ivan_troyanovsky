#!/usr/bin/env bash
# Прогон admin/api.php на встроенном сервере PHP по копии сборки — до заливки на хостинг.
# Вход, чтение, сохранение (с бэкапом и новым ?v= в страницах), загрузка и удаление кадра.
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d)
cp -r _deploy/. "$T/"
python3 - "$T/admin/admin-auth.php" <<'PY'
import hashlib, pathlib, sys
salt = b'0123456789abcdef'
h = hashlib.pbkdf2_hmac('sha256', b'test-pass', salt, 1000).hex()
pathlib.Path(sys.argv[1]).write_text(f"<?php return ['salt' => '{salt.hex()}', 'iterations' => 1000, 'hash' => '{h}'];\n")
PY
php -S 127.0.0.1:8765 -t "$T" >/dev/null 2>&1 &
PID=$!
trap 'kill $PID' EXIT
sleep 1
API=http://127.0.0.1:8765/admin/api.php
K=(-H 'X-Admin-Key: test-pass')
fail() { echo "::error::admin api: $*"; exit 1; }

code=$(curl -s -o /dev/null -w '%{http_code}' "$API?action=content")
[[ $code == 401 ]] || fail "без пароля ответ $code, ждали 401"
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'X-Admin-Key: wrong' "$API?action=content")
[[ $code == 401 ]] || fail "с неверным паролем ответ $code, ждали 401"

curl -sf "${K[@]}" "$API?action=content" > "$T/c.json" || fail "content не отдаётся"
python3 - "$T/c.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d['mode'] == 'hosting' and isinstance(d['content'], dict) and isinstance(d['shoots'], list), d.keys()
d['content']['settings']['email'] = 'test@example.com'
d['content']['_emptyObject'] = {}
json.dump({'content': d['content'], 'shoots': d['shoots']}, open(sys.argv[1], 'w'), ensure_ascii=False)
PY
curl -sf "${K[@]}" -H 'Content-Type: application/json' --data-binary @"$T/c.json" "$API?action=save" >/dev/null || fail "save не прошёл"
grep -q 'test@example.com' "$T/assets/content.js" || fail "content.js не записался"
grep -q '"_emptyObject": {}' "$T/assets/content.js" || fail "пустой объект {} записался не как {}"
ls "$T"/admin/backups/content-*.js >/dev/null || fail "нет бэкапа"
v=$(sha1sum "$T/assets/content.js" | cut -c1-10)
grep -q "assets/content.js?v=$v\"" "$T/index.html" || fail "index.html не получил новый ?v= для content.js"
node -e "global.window={};require('$T/assets/content.js');if(!window.CONTENT.settings)process.exit(1)" || fail "content.js не исполняется в браузере"

printf 'RIFFtest' > "$T/f.webp"
curl -sf "${K[@]}" --data-binary @"$T/f.webp" "$API?action=upload&path=img/s/test/01.webp" >/dev/null || fail "upload не прошёл"
[[ -s "$T/img/s/test/01.webp" ]] || fail "файл не записался"
code=$(curl -s -o /dev/null -w '%{http_code}' "${K[@]}" --data-binary @"$T/f.webp" "$API?action=upload&path=assets/evil.php")
[[ $code == 400 ]] || fail "upload вне img/ и video/ пропущен ($code)"
code=$(curl -s -o /dev/null -w '%{http_code}' "${K[@]}" -X POST "$API?action=delete&path=img/s/../../index.html")
[[ $code == 400 ]] || fail "удаление с .. пропущено ($code)"
curl -sf "${K[@]}" -X POST "$API?action=delete&path=img/s/test/01.webp" >/dev/null || fail "delete не прошёл"
[[ ! -e "$T/img/s/test/01.webp" ]] || fail "файл не удалился"

echo "admin api: все проверки прошли"
