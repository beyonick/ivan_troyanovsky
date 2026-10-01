/* bind.js — подставляет контент из админки (content.js, shoots.js) в
   разметку. Подключается ДО site.js: нарезка строк (§7.1) берёт уже
   подставленный текст. Без данных разметка остаётся как есть.

   data-c="home.ch1"          — текст элемента
   data-c-src="home.aboutPhoto" — src картинки
   data-c-href="settings.instagram" — адрес ссылки
   data-c-mail                — mailto: на settings.email, текст — сама почта
   #shopWorks, #mcList, #rollTrack — списки собираются из данных. */
(function () {
  'use strict';
  var C = window.CONTENT;
  if (!C) return;
  var S = window.SHOOTS || [];

  function get(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, C);
  }
  // §4: неразрывный пробел после однобуквенных предлогов и союзов.
  function typo(s) {
    return String(s).replace(/(^|[\s(«])([вВсСкКоОуУиИаАяЯ])\s+/g, '$1$2 ');
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

  each('[data-c]', function (el) {
    var v = get(el.getAttribute('data-c'));
    if (v != null && v !== '') el.textContent = typo(v);
  });
  each('[data-c-src]', function (el) {
    var v = get(el.getAttribute('data-c-src'));
    if (v) el.setAttribute('src', v);
  });
  each('[data-c-href]', function (el) {
    var v = get(el.getAttribute('data-c-href'));
    if (v) el.setAttribute('href', v);
    else if (el.hasAttribute('data-c-hide')) el.style.display = 'none';
  });
  // Постер видео героя — до загрузки видео (§6).
  var poster = C.settings && C.settings.heroPoster;
  var hv = document.querySelector('.herovideo video');
  if (poster && hv) hv.setAttribute('poster', poster);

  var mail = C.settings && C.settings.email;
  if (mail) each('[data-c-mail]', function (el) {
    el.setAttribute('href', 'mailto:' + mail);
    if (!el.hasAttribute('data-c-keep')) el.textContent = mail;
  });

  /* Магазин: одна работа — один экран, сторона кадра чередуется. */
  var shop = document.getElementById('shopWorks');
  if (shop && C.shop && C.shop.works) {
    var html = '';
    C.shop.works.forEach(function (w, i) {
      if (w.status === 'hidden') return;
      var n = (i < 9 ? '0' : '') + (i + 1), left = i % 2 === 0;
      var frame = '<div class="workframe' + (left ? '' : ' end') + '" style="grid-column:' + (left ? '1' : '5') + ' / span 8">' +
        '<div class="ph" style="--ar:' + w.w + '/' + w.h + '"><img src="' + esc(w.image) + '" alt="' + esc(w.alt || '') + '" loading="lazy"></div></div>';
      var sold = w.status === 'sold';
      var info = '<div class="workinfo" style="grid-column:' + (left ? '10' : '1') + ' / span 3">' +
        '<p class="cap lines" style="margin:0">№ ' + n + '</p>' +
        '<h2 class="wname lines">' + esc(typo(w.title)) + '</h2>' +
        '<dl class="spec"><div><dt>Размер</dt><dd>' + esc(w.size) + '</dd></div>' +
        '<div><dt>Тираж</dt><dd>' + esc(w.edition) + '</dd></div>' +
        '<div><dt>Цена</dt><dd>' + esc(sold ? 'Продано' : w.price) + '</dd></div></dl>' +
        (sold ? '' : '<p class="lines d1" style="margin-top:32px"><a class="nav" href="#w' + n + '" data-order="Отпечаток № ' + n + '">Заказать отпечаток</a></p>') +
        '</div>';
      html += '<article class="work" id="w' + n + '"><div class="wrap"><div class="grid workgrid">' +
        (left ? frame + info : info + frame) + '</div></div></article>';
    });
    shop.innerHTML = html;
  }

  /* Мастер-классы: строки списка (§7.4). */
  var mc = document.getElementById('mcList');
  if (mc && C.learning && C.learning.masterclasses) {
    var st = { open: 'Набор открыт', full: 'Мест нет', past: 'Прошёл' };
    mc.innerHTML = C.learning.masterclasses.filter(function (m) { return m.status !== 'hidden'; }).map(function (m) {
      return '<div class="brow"><span class="bname">' + esc(m.place) + '</span><span class="bmeta">' +
        [m.date, m.format, m.price, m.seats ? m.seats + ' мест' : '', st[m.status] || '']
          .filter(Boolean).map(function (x) { return '<span class="cap" style="margin:0">' + esc(x) + '</span>'; }).join('') +
        '</span></div>';
    }).join('');
  }

  /* Глава «Плёнка»: ролик из выбранной съёмки, первым — негатив. */
  var roll = document.getElementById('rollTrack');
  var rs = C.home && C.home.ch3Roll && S.filter(function (x) { return x.slug === C.home.ch3Roll; })[0];
  if (roll && rs) {
    var first = roll.querySelector('.roll-fr');
    roll.innerHTML = (first ? first.outerHTML : '') + rs.frames.map(function (f) {
      return '<figure class="roll-fr" style="aspect-ratio:' + f.w + '/' + f.h + '"><div class="ph"><img src="' +
        esc(f.l) + '" alt="' + esc(f.alt) + '" loading="lazy"></div></figure>';
    }).join('');
    var link = document.getElementById('rollLink');
    if (link) {
      link.setAttribute('href', rs.href || ('syomka.html?s=' + encodeURIComponent(rs.slug)));
      link.textContent = [rs.title, rs.year].filter(Boolean).join(' · ');
    }
    var cnt = document.querySelector('.roll-count');
    if (cnt) cnt.textContent = '01 / ' + (rs.frames.length + (first ? 1 : 0));
  }
})();
