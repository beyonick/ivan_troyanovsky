# -*- coding: utf-8 -*-
"""Админка сайта Ивана Трояновского — локальный сервер.

Запуск (из папки site/):
    set ADMIN_PASSWORD=придумать-пароль
    python admin/server.py
Открыть http://localhost:8200/admin/  — сайт целиком тоже отдаётся отсюда.

Что делает:
  GET  /api/content          — content.js + shoots.js как JSON
  POST /api/save             — записать content.js и shoots.js (копия в admin/backups/)
  POST /api/upload?path=...  — сохранить файл (кадр/видео) в img/ или video/
  POST /api/delete?path=...  — удалить файл в img/s/
  POST /api/publish          — git add + commit + push текущей ветки
Кадры нарезает браузер (3 размера webp) — серверу Pillow не нужен.
Слушает только 127.0.0.1. Пароль — заголовок X-Admin-Key.
"""
import http.server, json, os, re, shutil, socketserver, subprocess, sys, time
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASSWORD = os.environ.get('ADMIN_PASSWORD', '')
PORT = int(os.environ.get('ADMIN_PORT', '8200'))
FILES = {'content': 'assets/content.js', 'shoots': 'assets/shoots.js'}
HEAD = {
    'content': "/* content.js — тексты, магазин, обучение, настройки.\n"
               "   Пишется из админки (/admin). Руками — можно, формат JSON. */\n"
               "window.CONTENT = ",
    'shoots': "/* shoots.js — съёмки и кадры. Пишется из админки (/admin).\n"
              "   l — 1600px, m — 960px, t — 360px; cover — номер кадра-обложки. */\n"
              "window.SHOOTS = ",
}
UPLOAD_OK = re.compile(r'^(img/(s|story|shop|site)/[\w\-./]+\.(webp|jpg|jpeg|png)|video/[\w\-.]+\.(webm|mp4))$')


def read_js(name):
    s = open(os.path.join(ROOT, FILES[name]), encoding='utf-8').read()
    start = s.index('=', s.index('window.')) + 1
    return json.loads(s[start:].strip().rstrip(';').strip())


def write_js(name, data):
    path = os.path.join(ROOT, FILES[name])
    bdir = os.path.join(ROOT, 'admin', 'backups')
    os.makedirs(bdir, exist_ok=True)
    if os.path.exists(path):
        shutil.copy(path, os.path.join(bdir, '%s-%s.js' % (name, time.strftime('%Y%m%d-%H%M%S'))))
    with open(path, 'w', encoding='utf-8') as f:
        f.write(HEAD[name] + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '/api/' in (self.path or ''):
            sys.stderr.write('%s\n' % (fmt % args))

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _auth(self):
        if not PASSWORD:
            return True
        if self.headers.get('X-Admin-Key') == PASSWORD:
            return True
        self._json(401, {'error': 'Неверный пароль'})
        return False

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n) if n else b''

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/api/content':
            if not self._auth():
                return
            return self._json(200, {'content': read_js('content'), 'shoots': read_js('shoots'),
                                    'auth': bool(PASSWORD)})
        if u.path in ('/admin', '/admin/'):
            self.path = '/admin/index.html'
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if not self._auth():
            return
        try:
            if u.path == '/api/save':
                d = json.loads(self._body().decode('utf-8'))
                if 'content' in d:
                    write_js('content', d['content'])
                if 'shoots' in d:
                    write_js('shoots', d['shoots'])
                return self._json(200, {'ok': True})
            if u.path == '/api/upload':
                rel = (q.get('path') or [''])[0].replace('\\', '/').lstrip('/')
                if not UPLOAD_OK.match(rel) or '..' in rel:
                    return self._json(400, {'error': 'Недопустимый путь: ' + rel})
                full = os.path.join(ROOT, rel)
                os.makedirs(os.path.dirname(full), exist_ok=True)
                with open(full, 'wb') as f:
                    f.write(self._body())
                return self._json(200, {'ok': True, 'path': rel})
            if u.path == '/api/delete':
                rel = (q.get('path') or [''])[0].replace('\\', '/').lstrip('/')
                if not rel.startswith('img/s/') or '..' in rel:
                    return self._json(400, {'error': 'Удалять можно только кадры съёмок'})
                full = os.path.join(ROOT, rel)
                if os.path.isfile(full):
                    os.remove(full)
                return self._json(200, {'ok': True})
            if u.path == '/api/publish':
                msg = 'Админка: обновление контента ' + time.strftime('%Y-%m-%d %H:%M')
                out = []
                for cmd in (['git', 'add', '-A', 'assets/content.js', 'assets/shoots.js', 'img', 'video'],
                            ['git', 'commit', '-m', msg],
                            ['git', 'push', '-u', 'origin', 'HEAD']):
                    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
                    out.append('$ ' + ' '.join(cmd) + '\n' + (r.stdout + r.stderr).strip())
                    if r.returncode and cmd[1] != 'commit':
                        return self._json(500, {'error': 'git: ошибка', 'log': '\n'.join(out)})
                return self._json(200, {'ok': True, 'log': '\n'.join(out)})
        except Exception as e:  # ответ админке, а не обрыв соединения
            return self._json(500, {'error': str(e)})
        self._json(404, {'error': 'Нет такого действия'})


class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    if not PASSWORD:
        print('ВНИМАНИЕ: ADMIN_PASSWORD не задан — админка открыта без пароля (только localhost).')
    print('Админка: http://localhost:%d/admin/' % PORT)
    S(('127.0.0.1', PORT), H).serve_forever()
