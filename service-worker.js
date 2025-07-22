const CACHE_NAME = 'grid-drawer-cache-v2'; // <-- Версия кеша
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// 1. Установка: кешируем все файлы
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Кеш открыт, добавляем файлы');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Активация: удаляем старые кеши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Если имя кеша не совпадает с текущей версией, удаляем его
          if (cacheName !== CACHE_NAME) {
            console.log('Удаление старого кеша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. Перехват запросов: отдаем из кеша
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Если ресурс есть в кеше, возвращаем его
        if (response) {
          return response;
        }
        // Иначе, пытаемся загрузить из сети (на случай, если что-то не попало в кеш)
        return fetch(event.request);
      })
  );
});