const EXPECTED_VERSION = (await import('node:fs/promises')).readFile('public/app.js', 'utf8').then((text) => {
  const match = text.match(/const VERSION="([^"]+)"/);
  if (!match) throw new Error('Could not determine expected application version from public/app.js.');
  return match[1];
});

const version = await EXPECTED_VERSION;
console.log(`🔎 Expected production version: ${version}`);
await new Promise((resolve) => setTimeout(resolve, 8000));

const url = new URL('https://battlecruiser.robvg9.workers.dev/app.js');
url.searchParams.set('bc_verify', `${Date.now()}-${process.hrtime.bigint()}`);
console.log(`🔎 Probing: ${url}`);

const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
if (!response.ok) throw new Error(`Production probe failed with HTTP ${response.status}.`);

const production = await response.text();
if (!production.includes(`const VERSION="${version}"`)) {
  const markers = production.match(/const VERSION="[^"]+"/g)?.slice(0, 5) ?? [];
  console.error('First version markers found in production:', markers);
  throw new Error(`Production is not serving the expected version ${version}.`);
}

console.log(`✅ Production serves BattleCruiser ${version}.`);
