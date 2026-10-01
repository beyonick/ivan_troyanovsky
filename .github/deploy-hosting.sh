#!/usr/bin/env bash
# Собирает сайт в _deploy/ и заливает на хостинг TimeWeb. Без --upload только собирает.
# Переменные для заливки: HOSTING_PROTOCOL (sftp|ftp), HOSTING_HOST, HOSTING_USER, HOSTING_PASSWORD, HOSTING_DIR.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=_deploy
PY=${PYTHON:-python3}

# В сборку не идут: админка (работает только локально через admin/server.py),
# служебные файлы репозитория и документация.
rm -rf "$OUT"
"$PY" - "$OUT" <<'PY'
import pathlib, shutil, sys
out = pathlib.Path(sys.argv[1])
skip = {'.git', '.github', 'admin', sys.argv[1], '.gitignore', '.nojekyll', 'README.md', 'DEPLOY.md'}
out.mkdir()
for p in pathlib.Path('.').iterdir():
    if p.name in skip:
        continue
    (shutil.copytree if p.is_dir() else shutil.copy2)(p, out / p.name)
PY

# nginx на TimeWeb отдаёт css и js с кэшем на год и заголовки из .htaccess к ним не применяет.
# Поэтому каждая ссылка на css/js получает ?v=<хэш содержимого>: поменялся файл — поменялся адрес.
"$PY" - "$OUT" <<'PY'
import hashlib, pathlib, re, sys
out = pathlib.Path(sys.argv[1]).resolve()
LINK = re.compile(r"""\b(href|src)="(/?(?:[\w.-]+/)*[\w.-]+\.(?:css|js))\"""")
done = {}
def version(path):
    if path not in done:
        done[path] = hashlib.sha1(path.read_bytes()).hexdigest()[:10]
    return done[path]
pages = list(out.glob('*.html')) + list(out.glob('legacy/*.html'))
for page in pages:
    text = page.read_text('utf-8')
    def sub(m):
        target = (page.parent / m.group(2)).resolve() if not m.group(2).startswith('/') else out / m.group(2).lstrip('/')
        if not target.is_file():
            return m.group(0)
        return f'{m.group(1)}="{m.group(2)}?v={version(target)}"'
    page.write_text(LINK.sub(sub, text), 'utf-8')
print(f'cache-bust: {len(pages)} pages, {len(done)} files versioned')
PY
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

# .well-known и cgi-bin создаёт сам хостинг: --delete не должен их трогать.
LFTP_PASSWORD="$HOSTING_PASSWORD" lftp --env-password -u "$HOSTING_USER" "${HOSTING_PROTOCOL}://${HOSTING_HOST}" -e "
  set cmd:fail-exit yes
  set net:max-retries 3
  set net:timeout 20
  set sftp:auto-confirm yes
  set ftp:ssl-allow yes
  mirror --reverse --delete --verbose --parallel=4 \
    --exclude-glob .well-known/ --exclude-glob cgi-bin/ \
    $OUT/ $HOSTING_DIR/
  quit
" || fail "заливка на ${HOSTING_HOST} не удалась, подробности в логе шага"
