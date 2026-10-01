/* admin.js — админка сайта. Данные: GET /api/content → { content, shoots }.
   Всё правится в памяти и уходит на сервер одной кнопкой «Сохранить»
   (Ctrl+S). Кадры нарезает браузер: три размера webp (1600 / 960 / 360),
   на сервер уходят готовые файлы. «Публикация» — git commit + push. */
(function () {
  'use strict';

  var state = null;          // { content, shoots }
  var trash = [];            // файлы удалённых кадров — стираются после сохранения
  var dirty = false, tab = 'shoots', current = 0;

  var $ = function (s) { return document.querySelector(s); };
  var pane = $('#pane'), statusEl = $('#status'), saveBtn = $('#save');

  /* — Сервер — */
  function key() { try { return sessionStorage.getItem('adminKey') || ''; } catch (e) { return ''; } }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Admin-Key': key() }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { showLogin(j.error); throw new Error('auth'); }
        if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.log = j.log; throw e; }
        return j;
      });
    });
  }
  function setStatus(t, cls) { statusEl.textContent = t; statusEl.className = 'status' + (cls ? ' ' + cls : ''); }
  function markDirty() { dirty = true; saveBtn.disabled = false; setStatus('Есть несохранённые изменения', 'dirty'); }

  function load() {
    setStatus('Загружаю…');
    api('/api/content').then(function (d) {
      state = { content: d.content, shoots: d.shoots };
      dirty = false; saveBtn.disabled = true; setStatus('Всё сохранено');
      render();
    }).catch(function (e) { if (e.message !== 'auth') setStatus('Не загрузилось: ' + e.message, 'err'); });
  }

  function validate() {
    var seen = {};
    for (var i = 0; i < state.shoots.length; i++) {
      var s = state.shoots[i];
      if (!s.title) return 'У съёмки №' + (i + 1) + ' нет названия';
      if (!/^[a-z0-9-]+$/.test(s.slug || '')) return 'Адрес съёмки «' + s.title + '» — только латиница, цифры и дефис';
      if (seen[s.slug]) return 'Адрес «' + s.slug + '» повторяется';
      seen[s.slug] = 1;
    }
    return '';
  }
  function save() {
    var err = validate();
    if (err) { setStatus(err, 'err'); return Promise.reject(new Error(err)); }
    saveBtn.disabled = true; setStatus('Сохраняю…');
    // Служебные поля с «_» в файлы не пишутся.
    var body = JSON.stringify(state, function (k, v) { return k.charAt(0) === '_' ? undefined : v; });
    return api('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function () {
        var del = trash.splice(0);
        return Promise.all(del.map(function (p) { return api('/api/delete?path=' + encodeURIComponent(p), { method: 'POST' }).catch(function () {}); }));
      })
      .then(function () {
        dirty = false;
        setStatus('Сохранено · ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
      })
      .catch(function (e) { saveBtn.disabled = false; setStatus('Не сохранилось: ' + e.message, 'err'); throw e; });
  }
  saveBtn.addEventListener('click', function () { save().catch(function () {}); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'ы')) { e.preventDefault(); if (dirty) save().catch(function () {}); }
  });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* — Вход — */
  function showLogin(msg) {
    $('#login').hidden = false;
    $('#loginErr').textContent = key() ? (msg || 'Неверный пароль') : '';
    $('#pw').focus();
  }
  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    try { sessionStorage.setItem('adminKey', $('#pw').value); } catch (_) {}
    $('#login').hidden = true;
    load();
  });

  /* — Вкладки — */
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) return;
    tab = b.getAttribute('data-tab');
    Array.prototype.forEach.call($('#tabs').children, function (x) { x.setAttribute('aria-current', x === b ? 'true' : 'false'); });
    render();
    window.scrollTo(0, 0);
  });

  /* — Разметка — */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  function btn(text, fn, cls, title) {
    return h('button', { type: 'button', class: 'btn small ' + (cls || ''), title: title || null,
      onclick: function (e) { e.stopPropagation(); fn(); } }, text);
  }
  function field(label, obj, k, o) {
    o = o || {};
    var input;
    if (o.type === 'textarea') input = h('textarea', { rows: o.rows || 3, placeholder: o.placeholder || null });
    else if (o.type === 'select') {
      input = h('select');
      o.options.forEach(function (p) { input.appendChild(h('option', { value: p[0] }, p[1])); });
    } else input = h('input', { type: o.type || 'text', placeholder: o.placeholder || null });
    input.value = obj[k] == null ? '' : obj[k];
    function upd() { obj[k] = input.value; markDirty(); if (o.onchange) o.onchange(input.value); }
    input.addEventListener(o.type === 'select' ? 'change' : 'input', upd);
    return h('label', { class: 'f' }, h('span', null, label), input, o.hint ? h('p', { class: 'hint' }, o.hint) : null);
  }
  function check(label, obj, k) {
    var i = h('input', { type: 'checkbox' });
    i.checked = !!obj[k];
    i.addEventListener('change', function () { obj[k] = i.checked; markDirty(); render(); });
    return h('label', { class: 'check' }, i, label);
  }
  function move(arr, i, d) {
    var j = i + d;
    if (j < 0 || j >= arr.length) return false;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    markDirty();
    return true;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  var TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  function slugify(t) {
    return String(t).toLowerCase().split('').map(function (c) { return TR[c] != null ? TR[c] : c; }).join('')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  /* — Картинки: нарезка в браузере — */
  function loadImg(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' });
    return new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = URL.createObjectURL(file);
    });
  }
  function toWebp(img, side, q) {
    var w = img.width, hh = img.height, s = Math.min(1, side / Math.max(w, hh));
    var c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(hh * s);
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, c.width, c.height);
    return new Promise(function (r) { c.toBlob(r, 'image/webp', q); });
  }
  function upload(path, blob) { return api('/api/upload?path=' + encodeURIComponent(path), { method: 'POST', body: blob }); }
  // sizes: [[имя, сторона, качество, путь]] → { w, h, paths }
  function processImage(file, sizes) {
    return loadImg(file).then(function (img) {
      var out = { w: img.width, h: img.height, paths: {} };
      return sizes.reduce(function (p, s) {
        return p.then(function () { return toWebp(img, s[1], s[2]).then(function (b) { return upload(s[3], b); }).then(function () { out.paths[s[0]] = s[3]; }); });
      }, Promise.resolve()).then(function () { return out; });
    });
  }
  // Одна картинка в одном размере: поле «заменить».
  function imageField(label, obj, k, dir, side, onDone) {
    var input = h('input', { type: 'file', accept: 'image/*' });
    input.addEventListener('change', function () {
      var f = input.files[0]; if (!f) return;
      setStatus('Загружаю картинку…');
      processImage(f, [['l', side, 0.8, 'img/' + dir + '/' + uid() + '.webp']]).then(function (r) {
        obj[k] = r.paths.l; if (onDone) onDone(r); markDirty(); render();
      }).catch(function (e) { setStatus('Ошибка загрузки: ' + e.message, 'err'); });
    });
    return h('div', { class: 'f' }, h('span', null, label),
      h('div', { class: 'imgfield' }, obj[k] ? h('img', { src: '/' + obj[k], alt: '' }) : null,
        h('label', { class: 'btn small' }, obj[k] ? 'Заменить' : 'Загрузить', input)));
  }

  /* — Съёмки — */
  function cover(s) { return typeof s.cover === 'number' ? s.frames[s.cover] : s.cover; }
  function renderShoots() {
    var S = state.shoots;
    if (current >= S.length) current = Math.max(0, S.length - 1);
    var list = h('div', { class: 'list' });
    S.forEach(function (s, i) {
      var c = cover(s);
      list.appendChild(h('div', { class: 'row' + (i === current ? ' on' : ''), onclick: function () { current = i; render(); } },
        h('img', { src: c ? '/' + (c.t || c.m) : '', alt: '' }),
        h('div', { class: 't' }, h('b', null, s.title || 'Без названия'),
          h('small', null, s.frames.length + ' к. ' + [s.place, s.year].filter(Boolean).join(' · '))),
        s.hidden ? h('span', { class: 'tag' }, 'скрыта') : null,
        h('div', { class: 'acts' },
          btn('↑', function () { if (move(S, i, -1)) { current = i - 1; render(); } }, '', 'Выше'),
          btn('↓', function () { if (move(S, i, 1)) { current = i + 1; render(); } }, '', 'Ниже'))));
    });
    var left = h('div', null,
      h('button', { type: 'button', class: 'btn', onclick: addShoot }, '+ Новая съёмка'),
      h('div', { style: 'height:16px' }), list,
      h('p', { class: 'hint' }, 'Порядок здесь — порядок в портфолио на сайте.'));
    paint(h('h2', null, 'Съёмки'),
      h('div', { class: 'split' }, left, S.length ? shootEditor(S[current]) : h('p', { class: 'empty' }, 'Съёмок пока нет.')));
  }
  function addShoot() {
    state.shoots.push({ slug: '', title: '', place: '', year: '', cover: 0, frames: [], _new: true });
    current = state.shoots.length - 1; markDirty(); render();
  }
  function shootEditor(s) {
    var slugField = field('Адрес (латиницей)', s, 'slug', {
      hint: 'Часть ссылки: /syomka.html?s=' + (s.slug || '…') + '. Меняйте до загрузки кадров — по нему называется папка.',
      onchange: function () { s._slugTouched = true; } });
    var titleField = field('Название — имена пары', s, 'title', { onchange: function (v) {
      if (s._new && !s._slugTouched) { s.slug = slugify(v); slugField.querySelector('input').value = s.slug; }
    } });
    var drop = h('label', { class: 'drop' }, 'Перетащите сюда кадры или нажмите, чтобы выбрать. Можно сразу много — нарежутся в три размера.');
    var fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true });
    drop.appendChild(fileIn);
    fileIn.addEventListener('change', function () { addFrames(s, fileIn.files); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); addFrames(s, e.dataTransfer.files); });

    var grid = h('div', { class: 'frames' });
    s.frames.forEach(function (f, i) {
      var alt = h('textarea', { placeholder: 'Что на кадре — для незрячих и поиска' });
      alt.value = f.alt || '';
      alt.addEventListener('input', function () { f.alt = alt.value; markDirty(); });
      var radio = h('input', { type: 'radio', name: 'cover' });
      radio.checked = s.cover === i;
      radio.addEventListener('change', function () { s.cover = i; markDirty(); render(); });
      grid.appendChild(h('div', { class: 'frame' + (s.cover === i ? ' cover' : '') },
        h('div', { class: 'im' }, h('img', { src: '/' + (f.t || f.m), alt: '', loading: 'lazy' })), alt,
        h('div', { class: 'fa' }, h('label', null, radio, 'обложка'),
          btn('←', function () { moveFrame(s, i, -1); }, '', 'Раньше'),
          btn('→', function () { moveFrame(s, i, 1); }, '', 'Позже'),
          btn('×', function () { delFrame(s, i); }, 'danger', 'Удалить кадр'))));
    });

    return h('div', null,
      h('div', { class: 'cols' }, titleField, slugField, field('Город', s, 'place'), field('Год', s, 'year')),
      field('Вступление', s, 'intro', { type: 'textarea', hint: 'Пара строк в начале ленты: когда, где, что было. Можно пусто.' }),
      field('Своя страница', s, 'href', { placeholder: 'например story-zhenya-nikita.html', hint: 'Только если у съёмки есть рукописная страница-история. Обычно пусто.' }),
      check('Пара согласна на публикацию', s, 'consent'),
      check('Скрыть с сайта', s, 'hidden'),
      h('p', null,
        s.slug ? h('a', { class: 'ghost', href: '/' + (s.href || 'syomka.html?s=' + s.slug), target: '_blank', rel: 'noopener' }, 'Открыть на сайте') : null, ' ',
        btn('Удалить съёмку', function () { delShoot(s); }, 'danger')),
      h('h3', null, 'Кадры · ' + s.frames.length), drop, grid,
      s.frames.length ? h('p', { class: 'hint' }, 'Обложка — кадр для сетки портфолио. Стрелки меняют порядок в ленте.') : null);
  }
  function addFrames(s, files) {
    files = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); });
    if (!files.length) return;
    if (!/^[a-z0-9-]+$/.test(s.slug || '')) { setStatus('Сначала название и адрес съёмки — по адресу называется папка кадров', 'err'); return; }
    var n = 0, base = 'img/s/' + s.slug + '/';
    files.reduce(function (p, f) {
      return p.then(function () {
        setStatus('Кадры: ' + (++n) + ' из ' + files.length + '…');
        var id = uid();
        return processImage(f, [['l', 1600, 0.78, base + id + '.webp'], ['m', 960, 0.76, base + 'm/' + id + '.webp'], ['t', 360, 0.72, base + 't/' + id + '.webp']])
          .then(function (r) {
            s.frames.push({ l: r.paths.l, m: r.paths.m, t: r.paths.t, w: r.w, h: r.h, alt: '' });
            if (s.cover == null) s.cover = 0;
            markDirty(); render();
          });
      });
    }, Promise.resolve()).then(function () {
      setStatus('Загружено кадров: ' + files.length + ' — сохраните', 'dirty');
    }).catch(function (e) { setStatus('Ошибка загрузки: ' + e.message, 'err'); });
  }
  function moveFrame(s, i, d) {
    var j = i + d;
    if (!move(s.frames, i, d)) return;
    if (s.cover === i) s.cover = j; else if (s.cover === j) s.cover = i;
    render();
  }
  function delFrame(s, i) {
    if (!confirm('Удалить кадр из съёмки?')) return;
    var f = s.frames.splice(i, 1)[0];
    [f.l, f.m, f.t].forEach(function (p) { if (p && p.indexOf('img/s/') === 0) trash.push(p); });
    if (typeof s.cover === 'number') { if (s.cover === i) s.cover = 0; else if (s.cover > i) s.cover--; }
    markDirty(); render();
  }
  function delShoot(s) {
    if (!confirm('Удалить съёмку «' + (s.title || 'без названия') + '» вместе с кадрами?')) return;
    s.frames.forEach(function (f) { [f.l, f.m, f.t].forEach(function (p) { if (p && p.indexOf('img/s/') === 0) trash.push(p); }); });
    state.shoots.splice(state.shoots.indexOf(s), 1);
    markDirty(); render();
  }

  /* — Главная — */
  function renderHome() {
    var H = state.content.home, St = state.content.settings;
    var vid = h('input', { type: 'file', accept: 'video/mp4,video/webm' });
    vid.addEventListener('change', function () {
      var f = vid.files[0]; if (!f) return;
      if (f.size > 40e6 && !confirm('Файл ' + Math.round(f.size / 1e6) + ' МБ — тяжело для первого экрана. Всё равно загрузить?')) return;
      var ext = /mp4$/i.test(f.name) || f.type === 'video/mp4' ? 'mp4' : 'webm';
      setStatus('Загружаю видео…');
      upload('video/hero-' + uid() + '.' + ext, f).then(function (r) {
        St[ext === 'mp4' ? 'heroVideoMp4' : 'heroVideo'] = r.path; markDirty(); render();
      }).catch(function (e) { setStatus('Ошибка загрузки: ' + e.message, 'err'); });
    });
    var rolls = state.shoots.map(function (s) { return [s.slug, s.title]; });
    paint(h('h2', null, 'Главная'),
      h('h3', null, 'Первый экран'),
      field('Посыл под именем', H, 'tagline'),
      field('Видео (webm)', St, 'heroVideo', { hint: 'Адрес файла или ссылка на хранилище. Монтаж из нескольких клипов — одним файлом, до 10–15 МБ.' }),
      field('Видео для Safari (mp4)', St, 'heroVideoMp4'),
      h('div', { class: 'f' }, h('label', { class: 'btn small' }, 'Загрузить видео с компьютера', vid)),
      imageField('Кадр до загрузки видео (постер)', St, 'heroPoster', 'site', 2000),
      h('h3', null, 'Пролог'),
      field('Фраза', H, 'prolog', { type: 'textarea', rows: 2 }),
      imageField('Кадр во весь экран', H, 'prologImage', 'site', 2400),
      h('h3', null, 'I · Тишина'), field('Текст', H, 'ch1', { type: 'textarea' }),
      h('h3', null, 'II · До'), field('Текст', H, 'ch2', { type: 'textarea' }),
      h('h3', null, 'III · Плёнка'), field('Заголовок', H, 'ch3Title'), field('Текст', H, 'ch3', { type: 'textarea' }),
      field('Какой ролик показывать лентой', H, 'ch3Roll', { type: 'select', options: rolls }),
      h('h3', null, 'IV · Как есть'), field('Заголовок', H, 'ch4Title'), field('Текст', H, 'ch4', { type: 'textarea' }),
      h('h3', null, 'V · Свои'), field('Заголовок', H, 'ch5Title'),
      field('О себе', H, 'about', { type: 'textarea', rows: 6 }),
      imageField('Портрет', H, 'aboutPhoto', 'site', 2000),
      h('h3', null, 'Эпилог'), field('Фраза', H, 'epilog', { type: 'textarea', rows: 2 }));
  }

  /* — Магазин — */
  var WSTATUS = [['available', 'В продаже'], ['sold', 'Продано'], ['hidden', 'Скрыта']];
  function renderShop() {
    var Sh = state.content.shop, W = Sh.works;
    var live = W.filter(function (w) { return w.status !== 'hidden'; }).length;
    var cards = W.map(function (w, i) {
      return h('div', { class: 'card' },
        h('div', { class: 'head' }, h('b', null, '№ ' + (i + 1) + ' · ' + (w.title || 'без названия')),
          btn('↑', function () { if (move(W, i, -1)) render(); }), btn('↓', function () { if (move(W, i, 1)) render(); }),
          btn('×', function () { if (confirm('Убрать работу из магазина?')) { W.splice(i, 1); markDirty(); render(); } }, 'danger')),
        imageField('Кадр', w, 'image', 'shop', 2200, function (r) { w.w = r.w; w.h = r.h; }),
        h('div', { class: 'cols' }, field('Название', w, 'title'), field('Размер', w, 'size'), field('Тираж', w, 'edition'),
          field('Цена', w, 'price'), field('Статус', w, 'status', { type: 'select', options: WSTATUS })),
        field('Что на кадре (для незрячих)', w, 'alt'));
    });
    paint(h('h2', null, 'Магазин'),
      live < 3 ? h('p', { class: 'hint', style: 'color:#B3261E' }, 'На сайте меньше трёх работ — по ТЗ магазин лучше выключить в «Настройках».') : null,
      field('Вступление', Sh, 'intro', { type: 'textarea' }),
      field('Строка внизу страницы', Sh, 'note', { type: 'textarea', rows: 2 }),
      h('h3', null, 'Работы · ' + W.length), cards,
      h('button', { type: 'button', class: 'btn', onclick: function () {
        W.push({ image: '', w: 3, h: 2, alt: '', title: '', size: '', edition: '', price: '', status: 'available' }); markDirty(); render();
      } }, '+ Добавить работу'));
  }

  /* — Обучение — */
  var MSTATUS = [['open', 'Набор открыт'], ['full', 'Мест нет'], ['past', 'Прошёл'], ['hidden', 'Скрыт']];
  function renderLearning() {
    var L = state.content.learning, M = L.masterclasses, St = state.content.settings;
    var cards = M.map(function (m, i) {
      return h('div', { class: 'card' },
        h('div', { class: 'head' }, h('b', null, (m.place || 'Без места') + ' · ' + (m.date || '')),
          btn('↑', function () { if (move(M, i, -1)) render(); }), btn('↓', function () { if (move(M, i, 1)) render(); }),
          btn('×', function () { if (confirm('Удалить мастер-класс?')) { M.splice(i, 1); markDirty(); render(); } }, 'danger')),
        h('div', { class: 'cols' }, field('Город / место', m, 'place'), field('Дата', m, 'date'), field('Формат', m, 'format'),
          field('Цена', m, 'price'), field('Мест', m, 'seats'), field('Статус', m, 'status', { type: 'select', options: MSTATUS })));
    });
    paint(h('h2', null, 'Обучение'),
      field('Заголовок страницы', L, 'heading'), field('Вступление', L, 'intro', { type: 'textarea' }),
      h('h3', null, 'Видеоурок'),
      field('О чём урок', L.lesson, 'about', { type: 'textarea' }),
      h('div', { class: 'cols' }, field('Что внутри', L.lesson, 'inside'), field('Длительность', L.lesson, 'duration'),
        field('Кому подойдёт', L.lesson, 'audience'), field('Цена', L.lesson, 'price')),
      field('Ссылка на оплату', St, 'lessonCheckout', { type: 'url', placeholder: 'https://…',
        hint: 'Платёжная ссылка (ЮKassa, Продамус, Lemon Squeezy…). Ссылку на сам урок покупателю присылает платёжный сервис. Пусто — кнопка «Купить» открывает письмо.' }),
      h('h3', null, 'Мастер-классы · ' + M.length), cards,
      h('button', { type: 'button', class: 'btn', onclick: function () {
        M.push({ place: '', date: '', format: '', price: '', seats: '', status: 'open' }); markDirty(); render();
      } }, '+ Добавить мастер-класс'));
  }

  /* — Настройки — */
  function renderSettings() {
    var St = state.content.settings;
    paint(h('h2', null, 'Настройки'),
      h('h3', null, 'Разделы на сайте'),
      check('Обучение', St.sections, 'learning'), check('Магазин', St.sections, 'shop'),
      h('p', { class: 'hint' }, 'Выключенный раздел пропадает из меню, а его страница уводит на главную.'),
      h('h3', null, 'Связь — футер на всех страницах'),
      h('div', { class: 'cols' }, field('Почта', St, 'email', { type: 'email' }), field('Instagram', St, 'instagram', { type: 'url' }),
        field('VK', St, 'vk', { type: 'url', hint: 'Пусто — ссылка не показывается.' }), field('Telegram', St, 'telegram', { type: 'url', hint: 'Пусто — ссылка не показывается.' })),
      h('h3', null, 'Покупки'),
      field('Ссылка заказа отпечатка', St, 'printOrder', { type: 'url', placeholder: 'https://t.me/… или форма',
        hint: 'Пусто — «Заказать отпечаток» открывает письмо с номером работы в теме.' }),
      field('Ссылка оплаты видеоурока', St, 'lessonCheckout', { type: 'url' }));
  }

  /* — Публикация — */
  function renderPublish() {
    var log = h('pre', { class: 'log', hidden: true });
    var go = h('button', { type: 'button', class: 'primary', onclick: function () {
      go.disabled = true;
      (dirty ? save() : Promise.resolve()).then(function () {
        setStatus('Публикую…');
        return api('/api/publish', { method: 'POST' });
      }).then(function (r) {
        log.hidden = false; log.textContent = r.log; setStatus('Опубликовано — сайт обновится через минуту');
      }).catch(function (e) {
        log.hidden = false; log.textContent = e.log || e.message; setStatus('Не опубликовалось', 'err');
      }).then(function () { go.disabled = false; });
    } }, 'Опубликовать на сайт');
    paint(h('h2', null, 'Публикация'),
      h('p', null, '«Сохранить» записывает изменения в файлы сайта на этом компьютере — их видно на локальном сайте сразу.'),
      h('p', null, '«Опубликовать» отправляет сохранённое в GitHub, оттуда Vercel сам обновит сайт.'),
      h('p', { class: 'hint' }, 'Перед каждым сохранением прежние файлы копируются в admin/backups — откатить можно оттуда.'),
      h('p', null, go), log);
  }

  // Вкладка целиком: массивы и пустые значения разворачивает h().
  function paint() {
    pane.replaceChildren(h.apply(null, ['div', null].concat(Array.prototype.slice.call(arguments))));
  }

  function render() {
    if (!state) return;
    ({ shoots: renderShoots, home: renderHome, shop: renderShop, learning: renderLearning,
       settings: renderSettings, publish: renderPublish })[tab]();
  }

  load();
})();
