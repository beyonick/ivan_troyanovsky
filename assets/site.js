/* site.js — поведение главной. Движение — по DESIGN.md § 7.
   Ховер кадров живёт отдельно, в photo-tilt.js (§ 7.9). */

(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cfg = window.SITE_CONFIG || {};

  /* — Герой: источник видео и удержание воспроизведения — */

  var heroVideo = document.querySelector('.herovideo video');

  function setHeroSource() {
    if (!heroVideo) return;
    var chain = [cfg.heroVideo, cfg.heroVideoMp4, cfg.heroVideoFallback].filter(Boolean);
    var i = 0;
    function next() {
      if (i >= chain.length) return;
      heroVideo.src = chain[i++];
      heroVideo.load();
      var p = heroVideo.play();
      if (p && p.catch) p.catch(function () {});
    }
    // Сеть или кодек не сработали — уходим на следующий адрес, а не в чёрный экран.
    heroVideo.addEventListener('error', next);
    next();
  }

  function keepHeroAlive() {
    if (!heroVideo) return;
    // Браузер ставит autoplay-видео на паузу за экраном и сам не возобновляет.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var p = e.target.play();
          if (p && p.catch) p.catch(function () {});
        });
      }, { threshold: 0.1 }).observe(heroVideo);
    }
    heroVideo.addEventListener('ended', function () {
      heroVideo.currentTime = 0;
      var p = heroVideo.play();
      if (p && p.catch) p.catch(function () {});
    });
  }

  /* — Прелоадер (§ 8). Держит первый экран, пока грузится видео героя.
       Вход и уход — маской (§ 7.1). Один раз за сессию: возврат внутри той же
       сессии не блокируем. Снимается по canplay видео И минимальному времени
       показа; жёсткий потолок MAX, чтобы никого не держать на медленной сети. — */

  function bindPreload() {
    var pl = document.getElementById('preload');
    if (!pl) return;
    var html = document.documentElement;

    var seen = false;
    try { seen = sessionStorage.getItem('pl') === '1'; } catch (e) {}
    if (seen) { if (pl.parentNode) pl.parentNode.removeChild(pl); return; }

    var MIN = 1400, MAX = 6000, t0 = Date.now(), done = false;
    html.style.overflow = 'hidden';
    requestAnimationFrame(function () { pl.classList.add('in'); });

    function finish() {
      if (done) return;
      done = true;
      try { sessionStorage.setItem('pl', '1'); } catch (e) {}
      pl.classList.add('out');
      setTimeout(function () { pl.classList.add('gone'); }, 240);

      var removed = false;
      function drop() {
        if (removed) return;
        removed = true;
        if (pl.parentNode) pl.parentNode.removeChild(pl);
        html.style.overflow = '';
        if (heroVideo) {
          try { heroVideo.currentTime = 0; } catch (e) {}
          var p = heroVideo.play();
          if (p && p.catch) p.catch(function () {});
        }
      }
      pl.addEventListener('transitionend', function (e) {
        if (e.target === pl && e.propertyName === 'clip-path') drop();
      });
      setTimeout(drop, 1200); // страховка, если transitionend не придёт
    }

    function ready() {
      setTimeout(finish, Math.max(0, MIN - (Date.now() - t0)));
    }

    if (reduce) { setTimeout(finish, 600); return; }

    if (heroVideo && heroVideo.readyState >= 3) {
      ready();
    } else if (heroVideo) {
      var on = function () {
        heroVideo.removeEventListener('canplay', on);
        heroVideo.removeEventListener('canplaythrough', on);
        ready();
      };
      heroVideo.addEventListener('canplay', on);
      heroVideo.addEventListener('canplaythrough', on);
    } else {
      ready();
    }
    setTimeout(finish, MAX);
  }

  /* — Имя героя: та же техника маски, что у прелоадера, запускается сразу — */

  function bindHeroName() {
    var el = document.getElementById('heroname');
    if (!el) return;
    if (reduce) { el.classList.add('in'); return; }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add('in'); });
    });
  }

  /* — Навигация: difference над героем, обычный чёрный дальше (§ 8) — */

  function bindNav() {
    var bar = document.querySelector('.navbar');
    var hero = document.querySelector('.hero');
    if (!bar) return;

    function sync() {
      // Страница без героя (заявка) — под навигацией всегда белый холст,
      // difference там дал бы белый текст на белом. Такая шапка сразу solid.
      if (!hero) { bar.classList.add('solid'); return; }
      bar.classList.toggle('solid', window.scrollY > hero.offsetHeight - 80);
    }
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();

    var burger = bar.querySelector('.burger');
    if (!burger) return;
    burger.addEventListener('click', function () {
      var open = bar.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    Array.prototype.forEach.call(bar.querySelectorAll('.navmenu a'), function (a) {
      a.addEventListener('click', function () {
        bar.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* — Раскрытие кадров и счётчики по появлению в кадре (§ 7.1, § 7.3) — */

  function bindReveals() {
    // Всё, что лежит в горизонтальной ленте (.htrack, страница истории),
    // здесь не трогаем: там кадры въезжают сбоку, а не снизу, и ведёт их
    // свой наблюдатель в story.js. Иначе страховка sweep() ниже, которая
    // проверяет только вертикаль (r.top), открыла бы разом всю ленту —
    // у всех её кадров top одинаковый и всегда в пределах экрана.
    function ownHere(el) { return !el.closest('.htrack'); }
    var once = Array.prototype.slice.call(document.querySelectorAll('.reveal, .rise')).filter(ownHere);

    if (reduce || !('IntersectionObserver' in window)) {
      once.forEach(function (el) { el.classList.add('in'); markDone(el); });
      return;
    }

    // Кадры и счётчики — один раз и навсегда: маска не закрывается обратно.
    var left = once.length;
    function reveal(el) {
      if (el.classList.contains('in')) return;
      el.classList.add('in');
      markDone(el);
      left--;
    }
    // Доигравшая маска снимается совсем: clip-path, оставленный навсегда,
    // режет миниатюры и тени, вылетающие за блок на hover (§7.9).
    function markDone(el) {
      if (!el.classList.contains('reveal')) return;
      setTimeout(function () { el.classList.add('done'); }, 2600);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        reveal(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    once.forEach(function (el) { io.observe(el); });

    // Страховка от первого срабатывания IntersectionObserver: он всегда
    // вызывается один раз сразу при подписке, для всех целей и без единого
    // пересечения — это не значит, что дальше он будет ловить каждый кадр
    // исправно. Поэтому страховка не гасится по первому колбэку, а сама
    // проверяет геометрию раз в 600ms, пока не откроются все кадры. Кадр,
    // навсегда зажатый в clip-path: inset(100%), недопустим.
    function sweep() {
      if (!left) return;
      once.forEach(function (el) {
        if (el.classList.contains('in')) return;
        var r = el.getBoundingClientRect();
        // Всё, что в кадре ИЛИ уже прокручено выше, — показываем. Элемент,
        // навсегда застрявший невидимым (мгновенный скролл, загрузка с якоря),
        // недопустим.
        if (r.top < innerHeight * 0.98) reveal(el);
      });
      if (left) setTimeout(sweep, 600);
    }
    setTimeout(sweep, 600);
  }

  /* — Текст построчно из маски (§ 7.1-бис) — */

  // Разбор исходной разметки в токены. Слово — токен; вложенный тег
  // (ссылка, <time>, <em>) — тоже один токен и переносится целиком, чтобы
  // разрезание строк не разрывало разметку. <br> — жёсткая граница строки.
  function tokenize(el) {
    if (!el.dataset.raw) el.dataset.raw = el.innerHTML;
    var src = document.createElement('div');
    src.innerHTML = el.dataset.raw;

    var tokens = [];
    Array.prototype.forEach.call(src.childNodes, function (node) {
      if (node.nodeType === 3) {
        // Не /\s+/: в JS \s ловит и неразрывный пробел, а он ставится
        // нарочно (§4: после однобуквенных предлогов) и рвать его нельзя.
        (node.nodeValue || '').split(/[ \t\n\r\f\v]+/).forEach(function (w) {
          if (w) tokens.push({ word: w });
        });
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.tagName === 'BR') { tokens.push({ br: true }); return; }
      tokens.push({ node: node });
    });
    return tokens;
  }

  function tokenNode(t) {
    if (t.node) return t.node.cloneNode(true);
    return document.createTextNode(t.word);
  }

  function splitLines(el) {
    var tokens = tokenize(el);
    if (!tokens.length) return;

    // Мерим переносы: раскладываем токены без обёрток и смотрим, у кого
    // совпадает offsetTop — это и есть визуальная строка при текущей ширине.
    el.textContent = '';
    var probes = [], seg = 0;
    tokens.forEach(function (t) {
      if (t.br) { seg++; probes.push({ br: true, seg: seg }); return; }
      var s = document.createElement('span');
      s.style.display = 'inline-block';
      s.appendChild(tokenNode(t));
      el.appendChild(s);
      // Пробел — отдельным узлом между пробами, как и в итоговой сборке:
      // засунутый внутрь инлайн-блока, он не схлопывается и мерил бы строку
      // шире, чем она потом отрисуется.
      el.appendChild(document.createTextNode(' '));
      probes.push({ span: s, seg: seg, token: t });
    });

    var lines = [];
    var lastTop = null, lastSeg = null;
    probes.forEach(function (p) {
      if (p.br) return;
      var top = p.span.offsetTop;
      if (lastTop === null || Math.abs(top - lastTop) > 1 || p.seg !== lastSeg) {
        lines.push([]);
        lastTop = top;
        lastSeg = p.seg;
      }
      lines[lines.length - 1].push(p.token);
    });

    // Сдвиг стаггера для соседей в ряду: d1/d2/d3 сдвигают всю строку блока,
    // чтобы соседние блоки в одной строке не открывались одновременно.
    var base = el.classList.contains('d3') ? 3
             : el.classList.contains('d2') ? 2
             : el.classList.contains('d1') ? 1 : 0;

    el.textContent = '';
    lines.forEach(function (lineTokens, i) {
      var ln = document.createElement('span');
      ln.className = 'ln';
      var inner = document.createElement('span');
      inner.style.setProperty('--i', base + i);
      lineTokens.forEach(function (t, j) {
        if (j) inner.appendChild(document.createTextNode(' '));
        inner.appendChild(tokenNode(t));
      });
      ln.appendChild(inner);
      el.appendChild(ln);
    });
    el.dataset.lineCount = lines.length + base;
  }

  // Маску со строки больше не снимаем: у неё постоянный запас на выносные
  // элементы (см. .ln в base.css). Раньше маска снималась после доигрывания
  // и низ буквы проявлялся рывком с задержкой — убрано 2026-09-07.
  function linesDone() {}

  function bindLines() {
    function ownHere(el) { return !el.closest('.htrack'); }
    // Базовая проза (.lead/.txt) не анимируется — карвинг-аут из DESIGN.md
    // §7.1 (2026-09-07, по прямой просьбе «базовый текст не анимируется»).
    // В разметке класс .lines на неё не ставят; здесь фиксируем то же
    // в коде — даже если .lines попадёт на .lead/.txt, splitLines её не
    // тронет и маску не повесит.
    function basicProse(el) { return el.classList.contains('lead') || el.classList.contains('txt'); }
    var els = Array.prototype.slice.call(document.querySelectorAll('.lines'))
      .filter(ownHere).filter(function (el) { return !basicProse(el); });
    if (!els.length) return;

    els.forEach(splitLines);
    bindResplit(els);

    if (reduce) {
      els.forEach(function (el) { el.classList.add('in'); el.dataset.revealed = '1'; linesDone(el); });
      return;
    }

    var left = els.length;
    function reveal(el) {
      if (el.classList.contains('in')) return;
      el.classList.add('in');
      el.dataset.revealed = '1';
      linesDone(el);
      left--;
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          reveal(e.target);
          io.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
      els.forEach(function (el) { io.observe(el); });
    } else {
      els.forEach(reveal);
    }

    // Та же страховка, что у bindReveals(): первое срабатывание
    // IntersectionObserver не гарантирует, что он и дальше будет ловить
    // каждый заголовок исправно. Заголовок, навсегда зажатый в маске
    // (текст невидим), недопустим — это хуже, чем нераскрытый кадр.
    function sweep() {
      if (!left) return;
      els.forEach(function (el) {
        if (el.classList.contains('in')) return;
        var r = el.getBoundingClientRect();
        if (r.top < innerHeight * 0.98) reveal(el);
      });
      if (left) setTimeout(sweep, 600);
    }
    setTimeout(sweep, 600);
  }

  // Заголовки многострочные — перенос слов зависит от ширины экрана,
  // поэтому строки режем заново при resize (ориентация, ресайз окна) и
  // после загрузки шрифтов. Вешается и при reduce: там анимации нет, но
  // строки так же отмерены и так же могут вылезти за край.
  function bindResplit(els) {
    function resplit() {
      els.forEach(function (el) {
        var wasIn = el.dataset.revealed === '1';
        splitLines(el);
        if (wasIn) {
          // Строки уже открыты — ставим их на место без повторного показа.
          el.classList.add('no-anim');
          el.classList.add('in');
          requestAnimationFrame(function () {
            requestAnimationFrame(function () { el.classList.remove('no-anim'); });
          });
        }
      });
    }
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(resplit, 150);
    });
    // Первая нарезка идёт до загрузки веб-шрифтов: строки отмерены по
    // запасному шрифту, а он у́же. С настоящим шрифтом отмеренная строка
    // (nowrap) могла стать шире бокса и вылезти за край — найдено на
    // подписи героя на 375px (v2). Режем заново, когда шрифты готовы.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(resplit);
  }

  // Лента истории (.htrack) раскрывается своим наблюдателем в story.js —
  // отдаём ему ту же нарезку строк и то же снятие маски, чтобы правило
  // появления на всех страницах было одно.
  window.SITE_LINES = { split: splitLines, done: linesDone };

  /* — Кадр за курсором в списках (§ 7.4) — */

  function bindFollow(scopeSel, rowSel) {
    var scope = document.querySelector(scopeSel);
    if (!scope) return;
    var rows = scope.querySelectorAll(rowSel);
    var thumbs = scope.querySelectorAll('.thumb-follow');
    if (!rows.length || !thumbs.length) return;
    if (window.matchMedia && !window.matchMedia('(hover: hover)').matches) return;

    var active = -1, x = 0, y = 0, raf = 0;

    function place() {
      raf = 0;
      var w = Math.min(window.innerWidth * 0.46, 680);
      var h = Math.round(w * 2 / 3);
      for (var i = 0; i < thumbs.length; i++) {
        var t = thumbs[i];
        t.style.width = w + 'px';
        t.style.height = h + 'px';
        t.style.left = Math.round(x - w / 2) + 'px';
        t.style.top = Math.round(y - h / 2) + 'px';
        t.style.opacity = i === active ? '1' : '0';
      }
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(place); }

    scope.addEventListener('mousemove', function (e) { x = e.clientX; y = e.clientY; schedule(); });
    scope.addEventListener('mouseleave', function () { active = -1; schedule(); });
    Array.prototype.forEach.call(rows, function (row, i) {
      row.addEventListener('mouseenter', function () { active = i; schedule(); });
    });
  }

  /* — Покупка и заказ (ТЗ v2 §4.2–4.4). Адреса — только из config.js:
       платёжная ссылка урока и ссылка заказа отпечатка. Пока они пусты,
       то же действие открывает письмо с темой — человек не упирается
       в мёртвую кнопку. — */

  function bindCommerce() {
    function mail(subject) {
      return 'mailto:' + (cfg.email || '') + '?subject=' + encodeURIComponent(subject);
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-buy]'), function (a) {
      a.href = cfg.lessonCheckout || mail(a.getAttribute('data-buy'));
      if (cfg.lessonCheckout) a.rel = 'noopener';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-order]'), function (a) {
      a.href = cfg.printOrder || mail(a.getAttribute('data-order'));
      if (cfg.printOrder) a.rel = 'noopener';
    });
  }

  /* — Мягкая инерция прокрутки (§ 7.7). Реальная позиция не подменяется:
       перехватывается только колесо, window.scrollY остаётся настоящим. — */

  function bindSmoothScroll() {
    if (reduce) return;
    var target = window.scrollY, current = window.scrollY;
    var running = false, alive = false, off = false;

    function maxScroll() {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }
    function tick() {
      alive = true;
      var diff = target - current;
      if (Math.abs(diff) < 0.4) {
        current = target;
        window.scrollTo(0, current);
        running = false;
        return;
      }
      current += diff * 0.055;
      window.scrollTo(0, current);
      requestAnimationFrame(tick);
    }
    function onWheel(e) {
      if (e.ctrlKey || off) return;
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= window.innerHeight;
      e.preventDefault();
      if (!running) { target = window.scrollY; current = window.scrollY; }
      target = Math.max(0, Math.min(target + dy, maxScroll()));
      if (!running) {
        running = true;
        alive = false;
        requestAnimationFrame(tick);
        // Кадры не пришли (скрытая вкладка, троттлинг) — отдаём прокрутку
        // браузеру, страница не должна залипать никогда.
        setTimeout(function () {
          if (!alive) {
            off = true;
            running = false;
            window.removeEventListener('wheel', onWheel);
          }
        }, 300);
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', function () {
      if (!running) { target = window.scrollY; current = window.scrollY; }
    }, { passive: true });
  }

  /* — Футер обнажается: высота подложки равна высоте футера (§ 7.5) — */

  function bindFooter() {
    var shell = document.querySelector('.footshell');
    var foot = document.querySelector('.foot');
    if (!shell || !foot) return;
    function sync() { shell.style.height = foot.offsetHeight + 'px'; }
    window.addEventListener('resize', sync);
    if ('ResizeObserver' in window) new ResizeObserver(sync).observe(foot);
    sync();
  }

  function start() {
    setHeroSource();
    bindPreload();
    keepHeroAlive();
    bindHeroName();
    bindNav();
    bindReveals();
    // До bindLines: нарезка строк пересобирает ссылку из исходного HTML
    // (dataset.raw), и адрес, выставленный позже, потерялся бы.
    bindCommerce();
    bindLines();
    bindFollow('.bigindex', '.brow');
    bindFollow('.voicewrap', '.voice');
    bindSmoothScroll();
    bindFooter();
    if (typeof initPhotoTilt === 'function') initPhotoTilt();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* Сетка по кнопке — служебный оверлей для вёрстки (DESIGN.md §5).
   Состояние держится в sessionStorage, чтобы не включать заново на каждой
   странице; клавиша G — то же самое с клавиатуры. */
(function () {
  var btn = document.getElementById('gridtoggle');
  var grid = document.getElementById('gridoverlay');
  if (!btn || !grid) return;

  function set(on) {
    grid.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    try { sessionStorage.setItem('grid', on ? '1' : '0'); } catch (e) {}
  }

  var saved = '0';
  try { saved = sessionStorage.getItem('grid') || '0'; } catch (e) {}
  set(saved === '1');

  btn.addEventListener('click', function () {
    set(!grid.classList.contains('on'));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'g' && e.key !== 'G' && e.key !== 'п' && e.key !== 'П') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    set(!grid.classList.contains('on'));
  });
})();
