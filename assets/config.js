/* config.js — единственное место, где меняются внешние адреса и флаги.
   Подключается в <head> (до разметки): флаги разделов должны сработать
   раньше первой отрисовки, иначе скрытый пункт меню мелькнёт.
   Ключи и секреты сюда НЕ класть — файл публичный (site/DEPLOY.md). */

window.SITE_CONFIG = {
  // Видео героя лежит НЕ в репозитории: оно платится и раздаётся со стороны
  // клиента (Selectel Object Storage + CDN). Пока heroVideo пуст, страница
  // играет локальный запасной файл video/hero.webm.
  // TODO перед продом (см. site/DEPLOY.md §3): перезалить объект как hero.webm
  // (без пробелов и «!» в имени), выставить Cache-Control:
  // public, max-age=31536000, immutable и поставить перед хранилищем CDN.
  // Монтаж из нескольких коротких Super 8 — ОДНИМ файлом сюда же, не слайдером
  // (ТЗ v2, расхождение №2).
  heroVideo: "https://378927d7-40c7-486c-a37f-a3b5c4f454a6.selstorage.ru/kak%20!!!!!!!!!!!!-SE_3.webm",
  // mp4/H.264 для Safari до 16 и старых Android. Пока пусто — там только постер.
  heroVideoMp4: "",
  // Запасной файл в репозитории. Держите его лёгким (сейчас 1,3 МБ).
  heroVideoFallback: "video/hero.webm",
  heroPoster: "img/hero-poster.jpg",

  // Разделы сайта (ТЗ v2 §3). false — пункт меню и вход на главной скрыты,
  // а прямой заход на страницу уводит на главную. Включается в один шаг.
  // Старт «только портфолио» = обе false.
  sections: {
    learning: true,   // /obuchenie.html
    shop: true        // /magazin.html — скрывать, если работ меньше трёх
  },

  // Покупка видеоурока: адрес внешнего чекаута (платёжная ссылка ЮKassa,
  // Stripe Payment Link, Gumroad / Lemon Squeezy — что выберет Ваня, ТЗ §4.3).
  // Пока пусто — кнопка «Купить» открывает письмо на email ниже.
  lessonCheckout: "",

  // Заказ отпечатка из магазина: ссылка (Telegram, форма, чекаут).
  // Пока пусто — письмо на email с номером работы в теме.
  printOrder: "",

  // Почта для связи — футер, «Купить» и «Заказать», пока ссылки выше пусты.
  // Заменить на реальную вместе с [ПОЧТА] в разметке.
  email: "[ПОЧТА]"
};

/* Настройки из админки (assets/content.js → settings) перекрывают
   значения выше: контакты, ссылки оплаты, видео, флаги разделов.
   content.js подключается в <head> раньше этого файла. */
(function () {
  var c = window.CONTENT && window.CONTENT.settings;
  if (!c) return;
  for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) window.SITE_CONFIG[k] = c[k];
})();

/* Флаги разделов — до первой отрисовки. Выключенный раздел получает класс
   на <html> (.off-shop / .off-learning), CSS прячет всё с data-flag этого
   раздела. Страница самого раздела (<html data-section="shop">) при
   выключенном флаге уходит на главную. */
(function () {
  var s = window.SITE_CONFIG.sections || {};
  var root = document.documentElement;
  Object.keys(s).forEach(function (k) {
    if (s[k] === false) root.classList.add('off-' + k);
  });
  var own = root.getAttribute('data-section');
  if (own && s[own] === false) location.replace('index.html');
})();
