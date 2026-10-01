/* shoot.js — страница одной съёмки по шаблону: syomka.html?s=<slug>.
   Собирает ленту из window.SHOOTS (shoots.js) в ту же разметку, что у
   рукописной истории story-zhenya-nikita.html, — дальше ленту ведёт
   story.js без изменений. Подключается ДО site.js и story.js.
   Съёмка с собственной страницей (href) уводит на неё. */
(function () {
  'use strict';
  var data = (window.SHOOTS || []).filter(function (x) { return !x.hidden; });
  var track = document.getElementById('htrack');
  if (!track) return;

  var slug = new URLSearchParams(location.search).get('s');
  var idx = -1;
  for (var i = 0; i < data.length; i++) if (data[i].slug === slug) idx = i;
  if (idx < 0) { location.replace('/#raboty'); return; }
  var s = data[idx];
  if (s.href) { location.replace(s.href); return; }
  var next = data[(idx + 1) % data.length];

  function esc(v) {
    return String(v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function cover(x) { return typeof x.cover === 'number' ? x.frames[x.cover] : x.cover; }
  function href(x) { return x.href || ('syomka.html?s=' + encodeURIComponent(x.slug)); }

  var n = s.frames.length;
  var meta = [s.place, s.year, n + ' ' + plural(n, 'кадр', 'кадра', 'кадров')].filter(Boolean).join(' · ');

  document.title = s.title + ' — Иван Трояновский';
  var d = document.querySelector('meta[name="description"]');
  if (d) d.setAttribute('content', s.title + '. ' + meta + '. Съёмка Ивана Трояновского.');

  var html = '<section class="pan pan--intro">' +
    '<p class="lbl lines">Съёмка ' + pad(idx + 1) + ' / ' + pad(data.length) + '</p>' +
    '<h1 class="h1 lines" style="margin-top:24px">' + esc(s.title) + '</h1>' +
    (s.intro ? '<p class="lead">' + esc(s.intro) + '</p>' : '') +
    '<div class="meta"><p class="cap lines d2" style="margin:0">' + esc(meta) + '</p></div></section>';

  s.frames.forEach(function (f) {
    html += '<figure class="fr" style="aspect-ratio:' + f.w + '/' + f.h + '">' +
      '<div class="mask reveal"><div class="inner ph"><img src="' + esc(f.l) + '" alt="' + esc(f.alt) + '"' +
      ' loading="lazy" decoding="async" width="' + f.w + '" height="' + f.h + '"></div></div></figure>';
  });

  // Конец ленты — следующая съёмка, как памятная карточка (тот же
  // .endcard, что в истории Жени и Никиты: фото под углом и заголовок-ссылка).
  var c = cover(next);
  html += '<section class="endcard"><div class="endcard-in">' +
    '<div class="ecphoto" style="aspect-ratio:' + c.w + '/' + c.h + '">' +
    '<div class="mask reveal"><div class="inner ph"><img src="' + esc(c.m) + '" alt="' + esc(c.alt) + '" loading="lazy"></div></div></div>' +
    '<div class="ectext">' +
    '<a class="heroaction reveal d1" href="' + esc(href(next)) + '"><p class="lbl">Следующая съёмка</p>' +
    '<p class="h3" style="margin-top:16px">' + esc(next.title) + '</p></a>' +
    '<div class="ecsec reveal d3"><a href="/#raboty">Все съёмки</a>' +
    '<a href="https://instagram.com/ivantroyanovsky" rel="noopener">Instagram</a></div>' +
    '</div></div></section>';

  track.innerHTML = html;
  var count = document.getElementById('hcount');
  if (count) count.textContent = '01 / ' + pad(n);
})();
