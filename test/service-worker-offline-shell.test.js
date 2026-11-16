const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'service-worker.js'), 'utf8');
const ORIGIN = 'https://battlecruiser.test';

function requestUrl(request) {
  return typeof request === 'string' ? new URL(request, ORIGIN).href : new URL(request.url).href;
}

function createWorker(options = {}) {
  const listeners = new Map();
  const entries = new Map();
  const precacheRequests = [];
  const cache = {
    addAll: async function() {
      throw new Error('cache.addAll must not be used by release install');
    },
    put: async function(request, response) {
      const url = new URL(requestUrl(request));
      if (url.origin === ORIGIN) precacheRequests.push(url.pathname);
      entries.set(url.href, response.clone());
    },
    match: async function(request, matchOptions = {}) {
      const url = new URL(requestUrl(request));
      const exact = entries.get(url.href);
      if (exact) return exact.clone();
      if (matchOptions.ignoreSearch) {
        for (const [key, value] of entries.entries()) {
          const cachedUrl = new URL(key);
          if (cachedUrl.origin === url.origin && cachedUrl.pathname === url.pathname) return value.clone();
        }
      }
      return undefined;
    },
    keys: async function() {
      return Array.from(entries.keys()).map(url => new Request(url));
    }
  };
  const caches = {
    open: async function() { return cache; },
    match: function(request, matchOptions) { return cache.match(request, matchOptions); },
    keys: async function() { return ['battlecruiser-static-9.4.77']; },
    delete: async function() { return true; }
  };
  const self = {
    location: { origin: ORIGIN, pathname: '/service-worker.js', href: ORIGIN + '/service-worker.js' },
    clients: { claim: async function() {} },
    skipWaiting: function() {},
    addEventListener: function(name, handler) { listeners.set(name, handler); }
  };
  const networkFetch = options.fetch || (async function(request) {
    if (options.precacheError && new URL(request.url).origin === ORIGIN) {
      throw new Error('simulated precache failure');
    }
    return new Response('network:' + new URL(request.url).pathname, { status: 200 });
  });
  vm.runInNewContext(source, {
    self: self,
    caches: caches,
    fetch: networkFetch,
    Request: Request,
    Response: Response,
    URL: URL,
    Promise: Promise,
    console: console
  }, { filename: 'service-worker.js' });
  return { listeners, entries, precacheRequests, cache, networkFetch };
}

async function dispatchInstall(worker) {
  const waits = [];
  worker.listeners.get('install')({ waitUntil: function(promise) { waits.push(promise); } });
  await Promise.all(waits);
}

async function dispatchFetch(worker, request) {
  let responsePromise;
  worker.listeners.get('fetch')({
    request: request,
    respondWith: function(promise) { responsePromise = promise; }
  });
  assert.ok(responsePromise, 'fetch handler must call respondWith for same-origin GET shell requests');
  return responsePromise;
}

test('Service Worker version matches the canonical application version', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const appVersion = app.match(/const VERSION=["'](\d+\.\d+\.\d+)["']/);
  const swVersion = source.match(/BC_SW_VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/);
  assert.ok(appVersion, 'app.js must declare its version');
  assert.ok(swVersion, 'Service Worker must declare its version');
  assert.equal(swVersion[1], appVersion[1]);
});

test('install precaches the document shell and essential static assets', async () => {
  const worker = createWorker();
  await dispatchInstall(worker);
  const appVersion = source.match(/BC_SW_VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/)[1];
  const styleVersion = source.match(/\.\/style\.css\?v=([^"]+)/)[1];
  for (const asset of [
    '/', '/index.html', '/app.js', '/style.css',
    '/manifest.json', '/favicon.png', '/icons/icon-192x192.png', '/icons/icon-512x512.png',
    '/js/mi-cuenta.js', '/js/offline.js', '/js/hotfix-configuracion-20260902.js', '/js/configuracion-ajustes-migrados-20260903.js', '/js/hotfix-secciones-visibles-20260903.js'
  ]) {
    assert.ok(worker.precacheRequests.includes(asset), 'missing precache entry: ' + asset);
  }
  for (const asset of ['/', '/index.html', '/app.js?v=' + appVersion, '/style.css?v=' + styleVersion]) {
    assert.ok(worker.entries.has(new URL(asset, ORIGIN).href), 'shell asset was not cached: ' + asset);
  }
  for (const asset of ['/js/mi-cuenta.js?v=1.2', '/js/hotfix-configuracion-20260902.js?v=20261020.4', '/js/configuracion-ajustes-migrados-20260903.js?v=9.2', '/js/hotfix-secciones-visibles-20260903.js?v=20261030.1']) {
    assert.ok(worker.entries.has(new URL(asset, ORIGIN).href), 'critical Android module was not cached: ' + asset);
  }
});

test('a failed core precache rejects installation rather than silently installing an incomplete worker', async () => {
  const worker = createWorker({ precacheError: true });
  await assert.rejects(dispatchInstall(worker), /simulated precache failure/);
});

test('successful same-origin shell requests are cached for subsequent offline use', async () => {
  const worker = createWorker();
  const request = new Request(ORIGIN + '/js/offline.js?v=9.4.77');
  const response = await dispatchFetch(worker, request);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'network:/js/offline.js');
  assert.ok(worker.entries.has(request.url), 'network response must be cached under its requested URL');
});

test('offline fallback serves the exact cached app.js release URL', async () => {
  const worker = createWorker({
    fetch: async function(request) {
      const url = new URL(request.url);
      if (url.origin !== ORIGIN) return new Response('cached external dependency', { status: 200 });
      throw new TypeError('offline');
    }
  });
  await dispatchInstall(worker);
  const appVersion = source.match(/BC_SW_VERSION\s*=\s*["']([^"']+)["']/)[1];
  const response = await dispatchFetch(worker, new Request(ORIGIN + '/app.js?v=' + appVersion));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'cached:/app.js');
});

test('offline fallback fails closed when an explicit app.js release version is not cached', async () => {
  const worker = createWorker({
    fetch: async function(request) {
      const url = new URL(request.url);
      if (url.origin !== ORIGIN) return new Response('cached external dependency', { status: 200 });
      throw new TypeError('offline');
    }
  });
  await dispatchInstall(worker);
  const response = await dispatchFetch(worker, new Request(ORIGIN + '/app.js?v=9.4.77'));
  assert.equal(response.status, 0);
});

test('offline fallback serves the exact app root from the precache', async () => {
  const worker = createWorker({
    fetch: async function(request) {
      const url = new URL(request.url);
      if (url.origin !== ORIGIN) return new Response('cached external dependency', { status: 200 });
      throw new TypeError('offline');
    }
  });
  await dispatchInstall(worker);
  const response = await dispatchFetch(worker, new Request(ORIGIN + '/'));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'cached:/');
});

test('offline fallback rejects a cache-busting query on an unversioned navigation URL', async () => {
  const worker = createWorker({
    fetch: async function(request) {
      const url = new URL(request.url);
      if (url.origin !== ORIGIN) return new Response('cached external dependency', { status: 200 });
      throw new TypeError('offline');
    }
  });
  await dispatchInstall(worker);
  const response = await dispatchFetch(worker, new Request(ORIGIN + '/?offline_check=1'));
  assert.equal(response.status, 0);
});

test('legacy unversioned URL may use one unique cached pathname candidate', async () => {
  const worker = createWorker({ fetch: async function() { throw new TypeError('offline'); } });
  await worker.cache.put(new Request(ORIGIN + '/js/legacy-module.js?v=1'), new Response('cached legacy module', { status: 200 }));
  const response = await dispatchFetch(worker, new Request(ORIGIN + '/js/legacy-module.js'));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'cached legacy module');
});

test('legacy unversioned URL rejects ambiguous cached pathname candidates', async () => {
  const worker = createWorker({ fetch: async function() { throw new TypeError('offline'); } });
  await worker.cache.put(new Request(ORIGIN + '/js/legacy-module.js?v=1'), new Response('old version', { status: 200 }));
  await worker.cache.put(new Request(ORIGIN + '/js/legacy-module.js?v=2'), new Response('new version', { status: 200 }));
  const response = await dispatchFetch(worker, new Request(ORIGIN + '/js/legacy-module.js'));
  assert.equal(response.status, 0);
});

test('a genuinely uncached shell request fails closed offline instead of inventing a response', async () => {
  const worker = createWorker({
    fetch: async function() { throw new TypeError('offline'); }
  });
  const response = await dispatchFetch(worker, new Request(ORIGIN + '/unseen-module.js?v=1'));
  assert.equal(response.status, 0);
});
