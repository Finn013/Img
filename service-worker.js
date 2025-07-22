
const CACHE_NAME = 'grid-drawer-cache'; // Простое имя, без версий
const urlsToCache = [
  '/Img/',
  '/Img/index.html',
  '/Img/style.css',
  '/Img/main.js',
  '/Img/manifest.json',
  '/Img/icon-192.png',
  '/Img/icon-512.png'
];

// 1. Установка: кешируем все необходимое один раз.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Кеш создан. Все файлы для офлайн-работы добавлены.');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Перехват запросов: всегда отвечаем только из кеша.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Если запрос есть в кеше, возвращаем его. 
        // Если нет - ничего не делаем. Запрос просто не будет выполнен.
        return response;
      })
  );
});

// Логика активации и удаления старых кешей полностью убрана, 
// так как сервис-воркер больше не управляет версиями.
