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
  const cacheNames = Array.isArray(options.existingCacheNames) ? options.existingCacheNames.slice() : [];
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
    open: async function(name) { if (name && !cacheNames.includes(name)) cacheNames.push(name); return cache; },
    match: function(request, matchOptions) { return cache.match(request, matchOptions); },
    keys: async function() { return cacheNames.slice(); },
    delete: async function() { return true; }
  };
  let claimCount = 0;
  const self = {
    location: { origin: ORIGIN, pathname: '/service-worker.js', href: ORIGIN + '/service-worker.js' },
    clients: { claim: async function() { claimCount++; } },
    skipWaiting: function() {},
    addEventListener: function(name, handler) { listeners.set(name, handler); }
  };
  let networkFetch = options.fetch || (async function(request) {
    if (options.precacheError && new URL(request.url).origin === ORIGIN) {
      throw new Error('simulated precache failure');
    }
    return new Response('network:' + new URL(request.url).pathname, { status: 200 });
  });
  // Keep a stable VM fetch function whose closure observes later online/offline changes.
  const fetchAdapter = function(request) { return networkFetch(request); };
  vm.runInNewContext(source, {
    self: self,
    caches: caches,
    fetch: fetchAdapter,
    Request: Request,
    Response: Response,
    URL: URL,
    Promise: Promise,
    console: console
  }, { filename: 'service-worker.js' });
  return { listeners, entries, precacheRequests, cache, cacheNames, get claimCount() { return claimCount; }, networkFetch, setNetworkFetch: function(nextFetch) { networkFetch = nextFetch; } };
}

async function dispatchInstall(worker) {
  const waits = [];
  worker.listeners.get('install')({ waitUntil: function(promise) { waits.push(promise); } });
  await Promise.all(waits);
}

async function dispatchActivate(worker) {
  const waits = [];
  worker.listeners.get('activate')({ waitUntil: function(promise) { waits.push(promise); } });
  await Promise.all(waits);
}

test('first installation claims its initial document when no prior release cache exists', async () => {
  const worker = createWorker();
  await dispatchInstall(worker);
  await dispatchActivate(worker);
  assert.equal(worker.claimCount, 1);
});

test('an update does not claim existing documents while an older release cache exists', async () => {
  const worker = createWorker({ existingCacheNames: ['battlecruiser-static-9.5.114'] });
  await dispatchInstall(worker);
  await dispatchActivate(worker);
  assert.equal(worker.claimCount, 0);
  assert.ok(worker.cacheNames.includes('battlecruiser-static-9.5.114'));
});


function simulateOffline(worker) {
  worker.setNetworkFetch(async function(request) {
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) return new Response('cached external dependency', { status: 200 });
    throw new TypeError('offline');
  });
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
    '/js/bc-modal-manager.js', '/js/mi-cuenta.js', '/js/offline.js', '/js/hotfix-configuracion-20260902.js', '/js/configuracion-ajustes-migrados-20260903.js', '/js/hotfix-secciones-visibles-20260903.js'
  ]) {
    assert.ok(worker.precacheRequests.includes(asset), 'missing precache entry: ' + asset);
  }
  for (const asset of ['/', '/index.html', '/app.js?v=' + appVersion, '/style.css?v=' + styleVersion]) {
    assert.ok(worker.entries.has(new URL(asset, ORIGIN).href), 'shell asset was not cached: ' + asset);
  }
  for (const asset of ['/js/bc-modal-manager.js?v=1.0', '/js/mi-cuenta.js?v=1.3', '/js/hotfix-configuracion-20260902.js?v=20261020.4', '/js/configuracion-ajustes-migrados-20260903.js?v=9.2', '/js/hotfix-secciones-visibles-20260903.js?v=20261030.1']) {
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

test('versioned JavaScript and CSS are served cache-first without a network revalidation', async () => {
  let networkCalls = 0;
  const worker = createWorker({
    fetch: async function() {
      networkCalls++;
      return new Response('unexpected network response', { status: 200 });
    }
  });
  const assets = [
    new Request(ORIGIN + '/js/ventas.js?v=20261120.2'),
    new Request(ORIGIN + '/style.css?v=9.5.135')
  ];
  for (const request of assets) {
    await worker.cache.put(request, new Response('cached:' + new URL(request.url).pathname, { status: 200 }));
  }

  for (const request of assets) {
    const response = await dispatchFetch(worker, request);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'cached:' + new URL(request.url).pathname);
  }
  assert.equal(networkCalls, 0, 'versioned assets should not revalidate a known release URL');
});

test('a missing versioned asset falls back to the network once and is cached under its exact URL', async () => {
  let networkCalls = 0;
  const worker = createWorker({
    fetch: async function(request) {
      networkCalls++;
      return new Response('network:' + new URL(request.url).pathname, { status: 200 });
    }
  });
  const request = new Request(ORIGIN + '/js/new-module.js?v=1.0.0');
  const response = await dispatchFetch(worker, request);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'network:/js/new-module.js');
  assert.equal(networkCalls, 1);
  assert.ok(worker.entries.has(request.url));
});

test('HTML documents and unversioned shell assets remain network-first', async () => {
  let networkCalls = 0;
  const worker = createWorker({
    fetch: async function(request) {
      networkCalls++;
      const url = new URL(request.url);
      return new Response('fresh:' + url.pathname, { status: 200 });
    }
  });
  const requests = [
    new Request(ORIGIN + '/index.html'),
    new Request(ORIGIN + '/js/legacy-module.js')
  ];
  for (const request of requests) {
    await worker.cache.put(request, new Response('stale:' + new URL(request.url).pathname, { status: 200 }));
  }

  for (const request of requests) {
    const response = await dispatchFetch(worker, request);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'fresh:' + new URL(request.url).pathname);
  }
  assert.equal(networkCalls, 2, 'documents and unversioned resources must continue to revalidate');
});

test('offline fallback serves the exact cached app.js release URL', async () => {
  const worker = createWorker();
  await dispatchInstall(worker);
  simulateOffline(worker);
  const appVersion = source.match(/BC_SW_VERSION\s*=\s*["']([^"']+)["']/)[1];
  const response = await dispatchFetch(worker, new Request(ORIGIN + '/app.js?v=' + appVersion));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'network:/app.js');
});

test('offline fallback fails closed when an explicit app.js release version is not cached', async () => {
  const worker = createWorker();
  await dispatchInstall(worker);
  simulateOffline(worker);
  const response = await dispatchFetch(worker, new Request(ORIGIN + '/app.js?v=9.4.77'));
  assert.equal(response.status, 0);
});

test('offline fallback serves the exact app root from the precache', async () => {
  const worker = createWorker();
  await dispatchInstall(worker);
  simulateOffline(worker);
  const response = await dispatchFetch(worker, new Request(ORIGIN + '/'));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'network:/');
});

test('offline fallback rejects a cache-busting query on an unversioned navigation URL', async () => {
  const worker = createWorker();
  await dispatchInstall(worker);
  simulateOffline(worker);
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
