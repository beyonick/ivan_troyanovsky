/* booking.js — заявка на съёмку. Четыре шага и все состояния из DESIGN.md § 12:
   пустое, ошибка валидации, загрузка, успех, дата занята, ошибка отправки,
   месяц закрыт целиком.

   Движение — § 7: шаг проявляется тихо, спиннеров нет, ничего не прыгает.
   Занятые даты — моковый JSON из assets/busy.js (§ 12), зависят от города. */

(function () {
  'use strict';

  var root = document.getElementById('bkmain');
  if (!root) return;

  var cfg = window.SITE_CONFIG || {};
  var BUSY = window.BOOKING_BUSY || {};
  var MAIL = cfg.email || '[ПОЧТА]';

  /* — Справочники. Тон — § 9: конкретика, ни одного обещания. — */

  var TYPES = [
    { id: 'love', label: 'Love story', note: '2–3 часа, один город' },
    { id: 'wedding', label: 'Свадьба', note: 'День целиком, с утра' },
    { id: 'family', label: 'Семейная', note: 'Дома или на улице' },
    { id: 'portrait', label: 'Портрет', note: 'Один человек, час' }
  ];
  var CITIES = [
    { id: 'spb', label: 'Петербург', note: 'Живу здесь' },
    { id: 'msk', label: 'Москва', note: 'Раз в месяц' },
    { id: 'nyc', label: 'Нью-Йорк', note: 'Дважды в год' }
  ];
  var SLOTS = [
    { id: 'morning', label: 'Утро', note: '07:00 — 10:00, пустой город' },
    { id: 'day', label: 'День', note: '12:00 — 16:00, ровный свет' },
    { id: 'golden', label: 'Золотой час', note: 'За полтора часа до заката' }
  ];

  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  var MONTH_COUNT = 9; // горизонт записи: текущий месяц и восемь следующих

  /* — Состояние — */

  var st = null;

  function blank() {
    return {
      step: 1, type: null, city: null, monthIdx: 0,
      date: null, slot: null,
      name: '', contact: '', about: '',
      touched: false, step3err: '', sending: false, sendError: false, done: false
    };
  }
  st = blank();

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var base = new Date(today.getFullYear(), today.getMonth(), 1);

  /* — Календарь: чистые функции над датами — */

  function monthAt(i) {
    var d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  }
  function keyOf(mo) { return mo.y + '-' + (mo.m < 9 ? '0' : '') + (mo.m + 1); }
  function labelOf(mo) { return MONTHS[mo.m] + ' ' + mo.y; }
  function daysIn(mo) { return new Date(mo.y, mo.m + 1, 0).getDate(); }
  function firstDow(mo) { return (new Date(mo.y, mo.m, 1).getDay() + 6) % 7; } // Пн = 0

  function busyOf(mo) {
    var city = st.city ? st.city.id : CITIES[0].id;
    var v = (BUSY[city] || {})[keyOf(mo)];
    return v === undefined ? [] : v;
  }
  function monthClosed(mo) { return busyOf(mo) === 'all'; }

  function isBusy(mo, day) {
    var v = busyOf(mo);
    if (v === 'all') return true;
    return v.indexOf(day) !== -1;
  }
  function isPast(mo, day) {
    return new Date(mo.y, mo.m, day) < today;
  }
  function isFree(mo, day) { return !isBusy(mo, day) && !isPast(mo, day); }

  function freeCount(mo) {
    var n = 0;
    for (var d = 1; d <= daysIn(mo); d++) if (isFree(mo, d)) n++;
    return n;
  }
  // Ближайшая свободная дата начиная с месяца fromIdx. Возвращает {i, day, mo} или null.
  function nearestFree(fromIdx) {
    for (var i = fromIdx; i < MONTH_COUNT; i++) {
      var mo = monthAt(i);
      for (var d = 1; d <= daysIn(mo); d++) if (isFree(mo, d)) return { i: i, day: d, mo: mo };
    }
    return null;
  }
  function dateLabel(mo, day) { return day + ' ' + MONTHS_GEN[mo.m] + ' ' + mo.y; }

  /* — Разметка — */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function optionsHtml(list, current, name) {
    return list.map(function (o, i) {
      var on = current && current.id === o.id;
      return '<button class="opt" type="button" data-' + name + '="' + i + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="optname">' + esc(o.label) + '</span>' +
        '<span class="mark">' + esc(on ? 'Выбрано' : o.note) + '</span>' +
        '</button>';
    }).join('');
  }

  function calendarHtml() {
    var mo = monthAt(st.monthIdx);
    var out = '<div class="monthnav">' +
      '<span class="monthname">' + esc(labelOf(mo)) + '</span>' +
      '<span style="display:flex;gap:32px">' +
      '<button class="linkbtn" type="button" data-month="-1"' + (st.monthIdx === 0 ? ' disabled' : '') + '>Раньше</button>' +
      '<button class="linkbtn" type="button" data-month="1"' + (st.monthIdx === MONTH_COUNT - 1 ? ' disabled' : '') + '>Позже</button>' +
      '</span></div>';

    // Месяц закрыт целиком. Пустой календарь без объяснения — самый быстрый
    // способ потерять пару, поэтому месяц не молчит.
    if (monthClosed(mo)) {
      var near = nearestFree(st.monthIdx + 1);
      var cityName = st.city ? st.city.label : '';
      out += '<p class="txt" style="margin-top:24px">В этом месяце меня нет в городе ' + esc(cityName) + '. ' +
        (near
          ? 'Ближайшая свободная дата — ' + esc(dateLabel(near.mo, near.day)) + '. Если у вас жёсткий день, напишите — посмотрю, что можно сдвинуть.'
          : 'Свободных дат в ближайшие месяцы нет. Напишите мне — разберёмся вручную.') + '</p>' +
        '<div class="navrow" style="margin-top:32px">' +
        (near ? '<button class="btn" type="button" data-goto="' + near.i + '">Показать ближайшие даты</button>' : '') +
        '<a class="linkbtn" href="mailto:' + esc(MAIL) + '" style="display:inline-block">Написать напрямую</a>' +
        '</div>';
      return out;
    }

    out += '<div class="calhead">' + DOW.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>';
    out += '<div class="cal" aria-label="' + esc(labelOf(mo)) + '">';
    for (var b = 0; b < firstDow(mo); b++) out += '<span class="cell void" aria-hidden="true"></span>';
    for (var d = 1; d <= daysIn(mo); d++) {
      var free = isFree(mo, d);
      var past = isPast(mo, d);
      var on = st.date && st.date.i === st.monthIdx && st.date.day === d;
      // Прошедший день просто гаснет: зачёркивание значит «занято», а не «вчера».
      var cls = 'cell' + (past ? ' past' : (free ? '' : ' busy')) + (on ? ' on' : '');
      var title = past ? 'Дата уже прошла' : (!free ? 'Дата занята' : dateLabel(mo, d));
      out += '<button class="' + cls + '" type="button" data-day="' + d + '"' +
        (free ? '' : ' disabled aria-disabled="true"') +
        (on ? ' aria-current="date"' : '') +
        ' title="' + esc(title) + '">' + d + '</button>';
    }
    out += '</div>';

    var hint = 'Зачёркнутые даты заняты. Свободных в этом месяце — ' + freeCount(mo);
    if (st.date && st.date.i === st.monthIdx && st.date.auto) {
      hint = 'Ближайшее свободное — ' + dateLabel(mo, st.date.day) + ', оно и выбрано. Зачёркнутые даты заняты';
    }
    out += '<p class="cap">' + esc(hint) + '</p>';
    return out;
  }

  function slotsHtml() {
    var hint = st.slot ? st.slot.note : 'Выберите время — от него зависит свет';
    return '<div style="margin-top:56px">' +
      '<p class="lbl">Время съёмки</p>' +
      '<div class="slots">' + SLOTS.map(function (s, i) {
        var on = st.slot && st.slot.id === s.id;
        return '<button class="slot" type="button" data-slot="' + i + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(s.label) + '</button>';
      }).join('') + '</div>' +
      '<p class="cap">' + esc(hint) + '</p></div>';
  }

  function summaryHtml() {
    var rows = [
      ['Съёмка', st.type ? st.type.label : '—'],
      ['Город', st.city ? st.city.label : '—'],
      ['Дата', st.date ? dateLabel(monthAt(st.date.i), st.date.day) : '—'],
      ['Время', st.slot ? st.slot.label : '—']
    ];
    return '<div class="summary">' + rows.map(function (r) {
      return '<div class="srow"><span class="cap">' + esc(r[0]) + '</span>' +
        '<span class="cap" style="color:var(--ink)">' + esc(r[1]) + '</span></div>';
    }).join('') + '</div>';
  }

  function loadingHtml() {
    return '<div class="bar" style="max-width:280px"></div>' +
      '<p class="cap">Не закрывайте вкладку — это займёт пару секунд</p>';
  }

  /* — Шаги — */

  function stepHtml() {
    if (st.done) {
      var contact = st.contact.trim() || 'указанный контакт';
      return '<div class="stepbody">' +
        '<p class="lbl">Готово</p>' +
        '<h2 class="h2" tabindex="-1" style="margin-top:24px;font-size:clamp(36px,4vw,64px)">Спасибо. Я прочитал.</h2>' +
        '<p class="txt" style="margin-top:32px">Отвечу на ' + esc(contact) + ' в течение суток, обычно быстрее. ' +
        'Если не отвечу за двое суток — напишите ещё раз, значит письмо потерялось.</p>' +
        summaryHtml() +
        '<div class="navrow"><button class="linkbtn" type="button" data-reset="1">Заполнить заново</button>' +
        '<a class="linkbtn" href="/" style="display:inline-block">На главную</a></div>' +
        '</div>';
    }

    if (st.step === 1) {
      return '<div class="stepbody">' +
        '<p class="lbl">Шаг 01 из 04</p>' +
        '<h2 class="h3" tabindex="-1" style="margin-top:24px;margin-bottom:56px">Что снимаем?</h2>' +
        optionsHtml(TYPES, st.type, 'type') +
        '<p class="cap">Если не уверены — выберите ближайшее, уточним в переписке</p>' +
        '</div>';
    }

    if (st.step === 2) {
      return '<div class="stepbody">' +
        '<p class="lbl">Шаг 02 из 04</p>' +
        '<h2 class="h3" tabindex="-1" style="margin-top:24px;margin-bottom:56px">В каком городе?</h2>' +
        optionsHtml(CITIES, st.city, 'city') +
        '<p class="cap">Другой город — напишите в последнем шаге, приеду, если получится</p>' +
        '<div class="navrow"><button class="linkbtn" type="button" data-back="1">Назад</button></div>' +
        '</div>';
    }

    if (st.step === 3) {
      return '<div class="stepbody">' +
        '<p class="lbl">Шаг 03 из 04</p>' +
        '<h2 class="h3" tabindex="-1" style="margin-top:24px;margin-bottom:40px">Когда?</h2>' +
        '<div id="bkcal">' + calendarHtml() + '</div>' +
        '<div id="bkslots">' + slotsHtml() + '</div>' +
        '<div class="bkerr" aria-live="polite">' +
        (st.step3err ? '<p class="err" style="margin-top:32px">' + esc(st.step3err) + '</p>' : '') + '</div>' +
        '<div class="navrow">' +
        '<button class="btn" type="button" data-next="1">Дальше</button>' +
        '<button class="linkbtn" type="button" data-back="1">Назад</button>' +
        '</div></div>';
    }

    // Шаг 04 — единственный с полями. Плейсхолдеров нет, только лейблы (§ 8).
    return '<div class="stepbody">' +
      '<p class="lbl">Шаг 04 из 04</p>' +
      '<h2 class="h3" tabindex="-1" style="margin-top:24px;margin-bottom:56px">Как вас зовут?</h2>' +
      '<div class="fields">' +
      field('name', 'Имя и имя вашего человека', st.name, 'text', 'name') +
      field('contact', 'Телефон или телеграм', st.contact, 'text', 'tel') +
      field('about', 'Пара слов о себе', st.about, 'text', 'off',
        'Как познакомились, кто первый написал — необязательно, но я прочитаю') +
      '</div>' +
      summaryHtml() +
      '<div class="bkerr" aria-live="polite">' + sendErrorHtml() + '</div>' +
      '<div id="bksubmit">' + submitHtml() + '</div>' +
      '</div>';
  }

  function sendErrorHtml() {
    return st.sendError
      ? '<p class="err" style="margin-top:40px">Не отправилось. Попробуйте ещё раз или напишите на ' + esc(MAIL) + '</p>'
      : '';
  }

  // Кнопка отправки живёт отдельным куском: состояния «отправляю» и «не
  // отправилось» меняют только её, а не перерисовывают поля с текстом человека.
  function submitHtml() {
    return '<div class="navrow">' +
      '<button class="btn" type="button" data-next="1"' + (st.sending ? ' disabled' : '') + '>' +
      (st.sending ? 'Отправляю…' : (st.sendError ? 'Отправить ещё раз' : 'Отправить заявку')) + '</button>' +
      (st.sendError
        ? '<a class="linkbtn" href="mailto:' + esc(MAIL) + '" style="display:inline-block">Написать на почту</a>'
        : '<button class="linkbtn" type="button" data-back="1"' + (st.sending ? ' disabled' : '') + '>Назад</button>') +
      '</div>' +
      (st.sending ? loadingHtml() : '');
  }

  function paintSubmit() {
    var box = document.getElementById('bksubmit');
    if (box) box.innerHTML = submitHtml();
    var live = root.querySelector('.bkerr');
    if (live) live.innerHTML = sendErrorHtml();
  }

  function field(id, label, value, type, autocomplete, hint) {
    return '<div class="fieldwrap" data-field="' + id + '">' +
      '<label class="lbl" for="bk-' + id + '">' + esc(label) + '</label>' +
      '<input class="field" id="bk-' + id + '" name="' + id + '" type="' + type + '" autocomplete="' + autocomplete + '" value="' + esc(value) + '">' +
      (hint ? '<p class="cap" style="margin:0">' + esc(hint) + '</p>' : '') +
      '<div class="fielderr" aria-live="polite"></div>' +
      '</div>';
  }

  /* — Валидация. Срабатывает по нажатию на кнопку, а не по каждому символу. — */

  function nameError() {
    return st.name.trim().length === 0 ? 'Напишите, как к вам обращаться' : '';
  }
  function contactError() {
    var v = st.contact.trim();
    if (v.length === 0) return 'Нужен способ вам ответить';
    var digits = v.replace(/\D/g, '');
    // Похоже на телефон, но цифр не хватает — это опечатка, а не ник.
    if (/^[+\d]/.test(v) && digits.length < 10) return 'Похоже, номер неполный';
    if (v.length < 3) return 'Нужен способ вам ответить';
    return '';
  }

  function paintFieldErrors() {
    var errs = { name: nameError(), contact: contactError() };
    Object.keys(errs).forEach(function (id) {
      var wrap = root.querySelector('[data-field="' + id + '"]');
      if (!wrap) return;
      var input = wrap.querySelector('.field');
      var box = wrap.querySelector('.fielderr');
      var bad = st.touched && !!errs[id];
      input.setAttribute('aria-invalid', bad ? 'true' : 'false');
      box.innerHTML = bad ? '<p class="err">' + esc(errs[id]) + '</p>' : '';
    });
    return !errs.name && !errs.contact;
  }

  /* — Рендер — */

  function paintSteps() {
    var items = document.querySelectorAll('[data-stepitem]');
    Array.prototype.forEach.call(items, function (el) {
      var n = Number(el.getAttribute('data-stepitem'));
      var cur = st.done ? 5 : st.step;
      el.classList.toggle('on', n === cur);
      el.classList.toggle('done', n < cur);
      if (n === cur) el.setAttribute('aria-current', 'step');
      else el.removeAttribute('aria-current');
    });
    var bars = document.querySelectorAll('.progress span');
    Array.prototype.forEach.call(bars, function (el, i) {
      el.classList.toggle('on', st.done || i < st.step);
    });
  }

  function render(focus) {
    root.innerHTML = stepHtml();
    paintSteps();
    if (st.touched && st.step === 4 && !st.done) paintFieldErrors();
    if (focus) {
      var h = root.querySelector('h2');
      if (h) h.focus({ preventScroll: true });
    }
  }

  function repaintCalendar() {
    var box = document.getElementById('bkcal');
    var slots = document.getElementById('bkslots');
    if (box) box.innerHTML = calendarHtml();
    if (slots) slots.innerHTML = slotsHtml();
  }

  function clearStepError() {
    var live = root.querySelector('.bkerr');
    if (live) live.innerHTML = '';
  }

  // Даты у каждого города свои — выбранная дата при смене города сбрасывается,
  // а ближайшая свободная подставляется сама: пустой календарь ничего не объясняет.
  function enterStep3() {
    st.monthIdx = 0;
    st.date = null;
    st.slot = null;
    var near = nearestFree(0);
    if (near) {
      st.monthIdx = near.i;
      st.date = { i: near.i, day: near.day, auto: true };
    }
  }

  /* — События — */

  root.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('button, a') : null;
    if (!el || el.disabled) return;

    if (el.hasAttribute('data-type')) {
      st.type = TYPES[Number(el.getAttribute('data-type'))];
      st.step = 2;
      return render(true);
    }
    if (el.hasAttribute('data-city')) {
      st.city = CITIES[Number(el.getAttribute('data-city'))];
      st.step = 3;
      enterStep3();
      return render(true);
    }
    if (el.hasAttribute('data-month')) {
      var d = Number(el.getAttribute('data-month'));
      st.monthIdx = Math.max(0, Math.min(MONTH_COUNT - 1, st.monthIdx + d));
      return repaintCalendar();
    }
    if (el.hasAttribute('data-goto')) {
      st.monthIdx = Number(el.getAttribute('data-goto'));
      return repaintCalendar();
    }
    if (el.hasAttribute('data-day')) {
      var day = Number(el.getAttribute('data-day'));
      st.date = { i: st.monthIdx, day: day, auto: false };
      st.step3err = '';
      repaintCalendar();
      clearStepError();
      var again = root.querySelector('[data-day="' + day + '"]');
      if (again) again.focus({ preventScroll: true });
      return;
    }
    if (el.hasAttribute('data-slot')) {
      var si = el.getAttribute('data-slot');
      st.slot = SLOTS[Number(si)];
      st.step3err = '';
      var slotBox = document.getElementById('bkslots');
      if (slotBox) {
        slotBox.innerHTML = slotsHtml();
        var back = slotBox.querySelector('[data-slot="' + si + '"]');
        if (back) back.focus({ preventScroll: true });
      }
      clearStepError();
      return;
    }
    if (el.hasAttribute('data-back')) {
      st.step = Math.max(1, st.step - 1);
      st.step3err = '';
      st.sendError = false;
      return render(true);
    }
    if (el.hasAttribute('data-reset')) {
      st = blank();
      return render(true);
    }
    if (el.hasAttribute('data-next')) return goNext();
  });

  root.addEventListener('input', function (e) {
    var f = e.target;
    if (!f.classList || !f.classList.contains('field')) return;
    if (f.name === 'name') st.name = f.value;
    else if (f.name === 'contact') st.contact = f.value;
    else if (f.name === 'about') st.about = f.value;
    // Ошибка снимается сразу, как только поле починили; новая не появляется
    // до следующего нажатия на кнопку.
    if (st.touched) paintFieldErrors();
  });

  // Enter в поле — то же, что нажать кнопку шага.
  root.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('field')) {
      e.preventDefault();
      goNext();
      return;
    }
    // Клавиатура в календаре — § 8, управление обязательно.
    var keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (keys.indexOf(e.key) < 0) return;
    var cal = e.target.closest ? e.target.closest('.cal') : null;
    if (!cal) return;
    e.preventDefault();
    var cells = Array.prototype.slice.call(cal.querySelectorAll('button'));
    var i = cells.indexOf(document.activeElement);
    if (i < 0) {
      for (var f = 0; f < cells.length; f++) if (!cells[f].disabled) { cells[f].focus(); return; }
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      var list = e.key === 'Home' ? cells : cells.slice().reverse();
      for (var h = 0; h < list.length; h++) if (!list[h].disabled) { list[h].focus(); return; }
      return;
    }
    var by = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : 7;
    var j = i + by;
    while (j >= 0 && j < cells.length && cells[j].disabled) j += by > 0 ? 1 : -1;
    if (j >= 0 && j < cells.length) cells[j].focus();
  });

  /* — Переходы и отправка — */

  function goNext() {
    if (st.step === 3) {
      if (!st.date || !st.slot) {
        st.step3err = !st.date ? 'Выберите дату съёмки' : 'Выберите время съёмки';
        var live = root.querySelector('.bkerr');
        if (live) live.innerHTML = '<p class="err" style="margin-top:32px">' + esc(st.step3err) + '</p>';
        return;
      }
      st.step = 4;
      st.step3err = '';
      return render(true);
    }
    if (st.step !== 4) {
      st.step = st.step + 1;
      return render(true);
    }

    st.touched = true;
    if (!paintFieldErrors()) {
      // Фокус уходит на первое проблемное поле — состояние «ошибка валидации».
      var bad = root.querySelector('.field[aria-invalid="true"]');
      if (bad) bad.focus();
      return;
    }
    send();
  }

  function payload() {
    var mo = st.date ? monthAt(st.date.i) : null;
    return {
      type: st.type ? st.type.id : null,
      city: st.city ? st.city.id : null,
      date: mo ? keyOf(mo) + '-' + (st.date.day < 10 ? '0' : '') + st.date.day : null,
      slot: st.slot ? st.slot.id : null,
      name: st.name.trim(),
      contact: st.contact.trim(),
      about: st.about.trim()
    };
  }

  function send() {
    st.sending = true;
    st.sendError = false;
    paintSubmit();

    function ok() { st.sending = false; st.done = true; render(true); }
    function fail() {
      // Введённое не стирается никогда — человек не должен упереться в тупик.
      st.sending = false;
      st.sendError = true;
      paintSubmit();
    }

    if (!cfg.bookingEndpoint) {
      // Приёмника заявок ещё нет (см. DEPLOY.md § 4). Форма проходится целиком,
      // чтобы были видны все состояния, но заявка никуда не уходит.
      if (window.console) console.warn('[booking] SITE_CONFIG.bookingEndpoint не задан — заявка никуда не отправляется.');
      setTimeout(ok, 1200);
      return;
    }

    fetch(cfg.bookingEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload())
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      ok();
    }).catch(fail);
  }

  render(false);
})();
