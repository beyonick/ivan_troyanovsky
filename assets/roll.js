/* roll.js — глава «Плёнка»: один ролик целиком, лентой.
   Вертикальный скролл страницы ведёт ленту по горизонтали — техника
   ленты истории (story.js): позиция скролла не подменяется, окно
   приколото sticky, лента догоняет цель с мягкой инерцией. На тач-вводе
   и при prefers-reduced-motion — обычная горизонтальная прокрутка. */
(function () {
  'use strict';
  var roll = document.querySelector('.roll');
  if (!roll) return;
  var pin = roll.querySelector('.roll-pin');
  var track = roll.querySelector('.roll-track');
  var bar = roll.querySelector('.roll-bar i');
  var count = roll.querySelector('.roll-count');
  var total = track.querySelectorAll('.roll-fr').length;

  var mq = window.matchMedia;
  var touch = mq && !mq('(hover: hover)').matches;
  var reduce = mq && mq('(prefers-reduced-motion: reduce)').matches;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function progress(p) {
    p = Math.min(1, Math.max(0, p || 0));
    if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
    if (count) count.textContent = pad(Math.min(total, Math.round(p * (total - 1)) + 1)) + ' / ' + pad(total);
  }

  if (touch || reduce) {
    roll.classList.add('native');
    pin.addEventListener('scroll', function () {
      var m = pin.scrollWidth - pin.clientWidth;
      progress(m ? pin.scrollLeft / m : 0);
    }, { passive: true });
    progress(0);
    return;
  }

  var max = 0, target = 0, cur = 0, running = false;
  function measure() {
    max = Math.max(0, track.scrollWidth - pin.clientWidth);
    // Сколько пикселей ленты вправо — столько же страницы вниз.
    roll.style.height = (pin.clientHeight + max) + 'px';
    aim();
    kick();
  }
  function aim() {
    var top = roll.getBoundingClientRect().top;
    target = Math.min(Math.max(-top, 0), max);
  }
  function tick() {
    cur += (target - cur) * 0.08;
    if (Math.abs(target - cur) < 0.3) cur = target;
    track.style.transform = 'translate3d(' + (-cur).toFixed(2) + 'px,0,0)';
    progress(max ? cur / max : 0);
    if (cur !== target) requestAnimationFrame(tick);
    else running = false;
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(tick); } }

  window.addEventListener('scroll', function () { aim(); kick(); }, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  // Кадры ленты грузятся лениво — ширина ленты растёт по мере загрузки.
  Array.prototype.forEach.call(track.querySelectorAll('img'), function (img) {
    if (!img.complete) img.addEventListener('load', measure);
  });
  measure();
})();
