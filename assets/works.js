/* works.js — портфолио в трёх видах: Сетка / Список / Галерея
   (референс — kononenkogroup.com/work). Данные — window.SHOOTS из
   shoots.js. Вид запоминается на сессию. Появление — та же маска §7.1
   (.reveal → .in → .done), наведение на кадр — тот же photo-tilt §7.9.

   Сетка   — обложка каждой съёмки, со сдвигом по двум колонкам.
   Список  — имя крупно слева, все кадры съёмки миниатюрами справа;
             над миниатюрой кадр показывается целиком за курсором.
   Галерея — все кадры всех съёмок вразброс; раскладка считается здесь
             по «линии горизонта» колонок с детерминированным случайным
             сдвигом — при каждом заходе одна и та же картина. */
(function () {
  'use strict';
  // Скрытые в админке съёмки на сайт не выходят.
  var data = (window.SHOOTS || []).filter(function (s) { return !s.hidden; });
  var root = document.getElementById('worksView');
  var section = document.getElementById('raboty');
  if (!root || !section || !data.length) return;

  var mq = window.matchMedia;
  var reduce = mq && mq('(prefers-reduced-motion: reduce)').matches;
  var hover = mq && mq('(hover: hover)').matches;
  var tilt = (typeof initPhotoTilt === 'function') ? initPhotoTilt() : null;

  var VIEWS = ['grid', 'list', 'gallery'];
  var view = 'grid';
  try { var v = sessionStorage.getItem('worksView'); if (VIEWS.indexOf(v) > -1) view = v; } catch (e) {}

  /* — Помощники — */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function cover(s) { return typeof s.cover === 'number' ? s.frames[s.cover] : s.cover; }
  function href(s) { return s.href || ('syomka.html?s=' + encodeURIComponent(s.slug)); }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function frames(n) { return n + ' ' + plural(n, 'кадр', 'кадра', 'кадров'); }
  function meta(s) { return [s.place, s.year].filter(Boolean).join(' · '); }
  function frameHTML(f, src, opts) {
    opts = opts || {};
    return '<div class="mask reveal"' + (opts.tilt === false ? '' : ' data-tilt') + '>' +
      '<div class="inner ph" style="aspect-ratio:' + f.w + '/' + f.h + '">' +
      '<img src="' + esc(src) + '" alt="' + esc(f.alt) + '" loading="lazy" decoding="async"></div></div>';
  }

  /* — Счётчик в шапке раздела — */
  (function () {
    var c = document.getElementById('worksCount');
    if (!c) return;
    var total = data.reduce(function (a, s) { return a + s.frames.length; }, 0);
    c.textContent = data.length + ' ' + plural(data.length, 'съёмка', 'съёмки', 'съёмок') + ' · ' + frames(total);
  })();

  /* — Появление: маска §7.1, один раз. Та же страховка, что в site.js:
       кадр, навсегда оставшийся в маске, недопустим. — */
  var io = (!reduce && 'IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.02 }) : null;
  var pending = [];
  function show(el) {
    if (el.classList.contains('in')) return;
    el.classList.add('in');
    setTimeout(function () { el.classList.add('done'); }, 2600);
  }
  function watch(scope) {
    var rs = Array.prototype.slice.call(scope.querySelectorAll('.reveal'));
    if (!io) { rs.forEach(function (r) { r.classList.add('in', 'done'); }); return; }
    rs.forEach(function (r) { io.observe(r); });
    pending = rs;
    sweep();
  }
  var sweepT = 0;
  function sweep() {
    clearTimeout(sweepT);
    pending = pending.filter(function (r) {
      if (r.classList.contains('in')) return false;
      if (r.getBoundingClientRect().top < innerHeight * 0.98) { show(r); return false; }
      return true;
    });
    if (pending.length) sweepT = setTimeout(sweep, 600);
  }
  function attachTilt(scope) {
    if (!tilt) return;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-tilt]'), function (n) { tilt.attach(n); });
  }

  /* — Сетка — */
  function renderGrid() {
    var html = '<div class="wgrid wrap"><div class="grid">';
    data.forEach(function (s, i) {
      var c = cover(s), vert = c.w < c.h, slot = i % 3;
      var col = vert ? ['2 / span 4', '9 / span 4', '5 / span 4'][slot]
                     : ['1 / span 5', '7 / span 6', '4 / span 6'][slot];
      // Правая обложка ниже левой; на узком экране — чередуем край.
      var cls = 'witem' + (slot === 1 ? ' off' : '') + (vert ? ' v' : '') + (i % 2 ? ' r' : '');
      html += '<a class="' + cls + '" href="' + esc(href(s)) + '" style="grid-column:' + col + '">' +
        frameHTML(c, c.m) +
        '<span class="sline"><span class="sname">' + esc(s.title) + '</span>' +
        '<span class="cap" style="margin:0">' + esc(meta(s) || frames(s.frames.length)) + '</span></span></a>';
    });
    return html + '</div></div>';
  }

  /* — Список — */
  function renderList() {
    var html = '<div class="wlist wrap">';
    data.forEach(function (s) {
      var info = [meta(s), frames(s.frames.length)].filter(Boolean).join(' · ');
      html += '<div class="wrow grid">' +
        '<a class="wrow-name" href="' + esc(href(s)) + '" style="grid-column:1 / span 5">' +
        '<span class="bname">' + esc(s.title) + '</span><span class="cap">' + esc(info) + '</span></a>' +
        '<div class="wthumbs reveal" style="grid-column:7 / span 6">';
      s.frames.forEach(function (f, j) {
        html += '<a class="wthumb" href="' + esc(href(s)) + '" data-peek="' + esc(f.m) + '" data-ar="' + f.w + '/' + f.h + '"' +
          ' aria-label="' + esc(s.title + ', кадр ' + (j + 1)) + '">' +
          '<img src="' + esc(f.t) + '" alt="' + esc(f.alt) + '" loading="lazy" decoding="async"></a>';
      });
      html += '</div></div>';
    });
    return html + '</div>';
  }

  /* — Галерея — */
  // Кадры всех съёмок вперемешку: по одному из каждой по кругу.
  function interleave() {
    var out = [], i = 0, more = true;
    while (more) {
      more = false;
      data.forEach(function (s) {
        if (i < s.frames.length) { out.push({ s: s, f: s.frames[i] }); more = true; }
      });
      i++;
    }
    return out;
  }
  function renderGallery() {
    var html = '<div class="wgal" id="wgal">';
    interleave().forEach(function (it) {
      html += '<a class="gtile" href="' + esc(href(it.s)) + '" data-title="' + esc(it.s.title) + '"' +
        ' data-ar="' + (it.f.w / it.f.h).toFixed(4) + '">' + frameHTML(it.f, it.f.m) + '</a>';
    });
    return html + '</div>';
  }
  // Детерминированный генератор (mulberry32): раскладка не меняется
  // от захода к заходу и от ресайза к ресайзу при той же ширине.
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function layoutGallery() {
    var g = document.getElementById('wgal');
    if (!g) return;
    var W = g.clientWidth;
    var cols = W > 1024 ? 12 : (W > 640 ? 8 : 4);
    var cw = W / cols, gut = W > 640 ? 24 : 12;
    var sky = [], c, j;
    for (c = 0; c < cols; c++) sky[c] = 0;
    var rnd = rng(20081);
    Array.prototype.forEach.call(g.children, function (t) {
      var ar = parseFloat(t.getAttribute('data-ar')) || 1.5;
      var r = rnd(), span;
      if (cols === 12) span = r < .42 ? 2 : r < .78 ? 3 : r < .93 ? 4 : 6;
      else if (cols === 8) span = r < .45 ? 2 : r < .85 ? 3 : 4;
      else span = r < .55 ? 2 : r < .9 ? 3 : 4;
      if (ar < 1 && span > 2) span--;           // вертикальный кадр уже
      // Несколько случайных стартов, берём самый низкий «горизонт» —
      // разброс без дыр. Старт с -1 и до cols-span+1: кадр может уйти
      // за край экрана на одну колонку (как в референсе).
      var best = null;
      for (var k = 0; k < 6; k++) {
        var s0 = Math.floor(rnd() * (cols - span + 3)) - 1, y = 0;
        for (j = s0; j < s0 + span; j++) if (j >= 0 && j < cols) y = Math.max(y, sky[j]);
        if (!best || y < best.y) best = { c: s0, y: y };
      }
      var w = span * cw - gut, h = w / ar;
      var top = best.y + gut + Math.round(rnd() * cw * 0.55);
      var left = best.c * cw + gut / 2 + Math.round((rnd() - .5) * cw * 0.35);
      t.style.left = left + 'px';
      t.style.top = top + 'px';
      t.style.width = w + 'px';
      t.style.height = h + 'px';
      for (j = best.c; j < best.c + span; j++) if (j >= 0 && j < cols) sky[j] = top + h;
    });
    g.style.height = Math.max.apply(null, sky) + gut + 'px';
  }

  /* — Кадр за курсором над миниатюрой (Список) и подпись (Галерея) — */
  var peek = document.createElement('div');
  peek.className = 'peek';
  peek.setAttribute('aria-hidden', 'true');
  peek.innerHTML = '<img alt="">';
  var tip = document.createElement('div');
  tip.className = 'gtip';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML = '<p class="cap"></p>';
  document.body.appendChild(peek);
  document.body.appendChild(tip);

  var mx = 0, my = 0, raf = 0, peekOn = false, tipOn = false;
  function place() {
    raf = 0;
    if (peekOn) {
      var pw = peek.offsetWidth, ph = peek.offsetHeight;
      var x = mx + 28, y = my - ph / 2;
      if (x + pw > innerWidth - 16) x = mx - pw - 28;
      // Не заезжать под шапку (96px сверху) и за низ экрана.
      y = Math.max(96, Math.min(y, innerHeight - ph - 16));
      peek.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }
    if (tipOn) tip.style.transform = 'translate(' + Math.round(mx + 18) + 'px,' + Math.round(my + 18) + 'px)';
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(place); }

  if (hover) {
    root.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; schedule(); });
    root.addEventListener('mouseover', function (e) {
      var th = e.target.closest && e.target.closest('.wthumb');
      if (th) {
        var ar = th.getAttribute('data-ar').split('/');
        var vert = +ar[0] < +ar[1];
        peek.style.setProperty('--par', ar[0] + '/' + ar[1]);
        peek.style.setProperty('--pw', vert ? 'min(22vw, 320px)' : 'min(34vw, 520px)');
        peek.firstChild.src = th.getAttribute('data-peek');
        peekOn = true; peek.classList.add('on'); schedule();
      }
      var gt = e.target.closest && e.target.closest('.gtile');
      if (gt) {
        tip.firstChild.textContent = gt.getAttribute('data-title');
        tipOn = true; tip.classList.add('on'); schedule();
      }
    });
    root.addEventListener('mouseout', function (e) {
      var to = e.relatedTarget;
      if (e.target.closest('.wthumb') && !(to && to.closest && to.closest('.wthumb'))) {
        peekOn = false; peek.classList.remove('on');
      }
      if (e.target.closest('.gtile') && !(to && to.closest && to.closest('.gtile'))) {
        tipOn = false; tip.classList.remove('on');
      }
    });
  }

  /* — Отрисовка вида и переключатель — */
  var sw = document.getElementById('viewswitch');
  function render(next, keep) {
    view = next;
    try { sessionStorage.setItem('worksView', view); } catch (e) {}
    peekOn = tipOn = false; peek.classList.remove('on'); tip.classList.remove('on');
    root.setAttribute('data-view', view);
    root.innerHTML = view === 'list' ? renderList() : view === 'gallery' ? renderGallery() : renderGrid();
    if (view === 'gallery') layoutGallery();
    watch(root);
    attachTilt(root);
    if (sw) Array.prototype.forEach.call(sw.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-view') === view ? 'true' : 'false');
    });
    // Новый вид начинается с начала: если раздел уже ушёл вверх — к нему.
    if (!keep) {
      var top = section.getBoundingClientRect().top;
      if (top < 0) window.scrollTo(0, window.scrollY + root.getBoundingClientRect().top - 120);
    }
  }
  if (sw) {
    sw.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-view]');
      if (b && b.getAttribute('data-view') !== view) render(b.getAttribute('data-view'));
    });
    // Переключатель виден, только пока портфолио на экране.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { sw.classList.toggle('on', e.isIntersecting); });
      }, { rootMargin: '-30% 0px -30% 0px' }).observe(root);
    } else sw.classList.add('on');
  }

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (view === 'gallery') layoutGallery(); }, 150);
  });

  render(view, true);
})();
