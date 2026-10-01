#!/usr/bin/env bash
# Собирает сайт в _deploy/ и заливает на хостинг TimeWeb. Без --upload только собирает.
# Переменные для заливки: HOSTING_PROTOCOL (sftp|ftp), HOSTING_HOST, HOSTING_USER, HOSTING_PASSWORD, HOSTING_DIR.
# ADMIN_PASSWORD — пароль админки на хостинге (admin/api.php).
#
# Контент правится в админке прямо на хостинге, поэтому хостинг — главный для
# assets/content.js, assets/shoots.js, img/ и video/. Деплой их не перезаписывает
# и не удаляет, а только докладывает недостающие файлы из репозитория.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=_deploy
PY=${PYTHON:-python3}

# В сборку не идут: служебные файлы репозитория, документация,
# локальный сервер админки и её локальные бэкапы.
rm -rf "$OUT"
"$PY" - "$OUT" <<'PY'
import pathlib, shutil, sys
out = pathlib.Path(sys.argv[1])
skip = {'.git', '.github', sys.argv[1], '.gitignore', '.nojekyll', 'README.md', 'DEPLOY.md'}
out.mkdir()
for p in pathlib.Path('.').iterdir():
    if p.name in skip:
        continue
    if p.is_dir():
        shutil.copytree(p, out / p.name, ignore=shutil.ignore_patterns('server.py', 'backups', '__pycache__'))
    else:
        shutil.copy2(p, out / p.name)
PY

# nginx на TimeWeb отдаёт css и js с кэшем на год и заголовки из .htaccess к ним не применяет.
# Поэтому каждая ссылка на css/js получает ?v=<хэш содержимого>: поменялся файл — поменялся адрес.
# content.js и shoots.js на хостинге свои (их пишет админка), хэш репозитория к ним
# не подходит — им ставится время сборки, а после каждого сохранения api.php
# проставляет свой хэш сам.
"$PY" - "$OUT" <<'PY'
import hashlib, pathlib, re, sys, time
out = pathlib.Path(sys.argv[1]).resolve()
LINK = re.compile(r"""\b(href|src)="(/?(?:[\w.-]+/)*[\w.-]+\.(?:css|js))\"""")
DATA = {out / 'assets/content.js', out / 'assets/shoots.js'}
stamp = time.strftime('d%Y%m%d%H%M%S')
done = {}
def version(path):
    if path in DATA:
        return stamp
    if path not in done:
        done[path] = hashlib.sha1(path.read_bytes()).hexdigest()[:10]
    return done[path]
pages = [*out.glob('*.html'), *out.glob('legacy/*.html'), *out.glob('admin/*.html')]
for page in pages:
    text = page.read_text('utf-8')
    def sub(m):
        src = m.group(2)
        target = out / src.lstrip('/') if src.startswith('/') else (page.parent / src).resolve()
        if not target.is_file():
            return m.group(0)
        return f'{m.group(1)}="{src}?v={version(target)}"'
    page.write_text(LINK.sub(sub, text), 'utf-8')
print(f'cache-bust: {len(pages)} pages, {len(done)} files versioned')
PY

# Пароль админки — из секрета ADMIN_PASSWORD; на хостинг попадает только соль и хэш PBKDF2.
# Без секрета файла нет и api.php никого не пускает.
if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
  "$PY" - "$OUT/admin/admin-auth.php" <<'PY'
import hashlib, os, pathlib, sys
salt, iterations = os.urandom(16), 100_000
digest = hashlib.pbkdf2_hmac("sha256", os.environ["ADMIN_PASSWORD"].encode(), salt, iterations).hex()
pathlib.Path(sys.argv[1]).write_text(
    f"<?php return ['salt' => '{salt.hex()}', 'iterations' => {iterations}, 'hash' => '{digest}'];\n", "utf-8")
PY
  echo "admin: пароль задан"
else
  echo "::warning::секрет ADMIN_PASSWORD пуст — админка на хостинге закрыта для всех"
fi
echo "build: $(find "$OUT" -type f | wc -l) files, $(du -sh "$OUT" | cut -f1)"

[[ "${1:-}" == "--upload" ]] || exit 0

if [[ -z "${HOSTING_HOST:-}" ]]; then
  echo "::warning::HOSTING_HOST не задан — выкладка на хостинг пропущена"
  exit 0
fi
fail() { echo "::error::$*"; exit 1; }
[[ -n "${HOSTING_USER:-}" ]] || fail "переменная HOSTING_USER пуста"
[[ -n "${HOSTING_PASSWORD:-}" ]] || fail "секрет HOSTING_PASSWORD пуст или не виден"
[[ -n "${HOSTING_DIR:-}" ]] || fail "переменная HOSTING_DIR пуста"
echo "target=${HOSTING_PROTOCOL}://${HOSTING_HOST}/${HOSTING_DIR}"

# 1) Код сайта — зеркалом с удалением лишнего. .well-known и cgi-bin создаёт сам хостинг,
#    данные админки (контент, кадры, видео, бэкапы) живут на хостинге — их не трогаем.
# 2) Данные — только недостающие файлы: новый кадр из репозитория доедет,
#    а сохранённое в админке не перезапишется.
LFTP_PASSWORD="$HOSTING_PASSWORD" lftp --env-password -u "$HOSTING_USER" "${HOSTING_PROTOCOL}://${HOSTING_HOST}" -e "
  set cmd:fail-exit yes
  set net:max-retries 3
  set net:timeout 20
  set sftp:auto-confirm yes
  set ftp:ssl-allow yes
  mirror --reverse --delete --verbose --parallel=4 \
    --exclude-glob .well-known/ --exclude-glob cgi-bin/ \
    --exclude ^assets/content\\.js\$ --exclude ^assets/shoots\\.js\$ \
    --exclude ^img/ --exclude ^video/ --exclude ^admin/backups/ \
    $OUT/ $HOSTING_DIR/
  mirror --reverse --only-missing --verbose --parallel=4 $OUT/img/ $HOSTING_DIR/img/
  mirror --reverse --only-missing --verbose $OUT/video/ $HOSTING_DIR/video/
  mirror --reverse --only-missing --verbose --include ^content\\.js\$ --include ^shoots\\.js\$ \
    $OUT/assets/ $HOSTING_DIR/assets/
  quit
" || fail "заливка на ${HOSTING_HOST} не удалась, подробности в логе шага"
