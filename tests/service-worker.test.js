const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const base = 'https://example.test/manabi-drive-prototype/';
const root = path.resolve(__dirname, '..');
const handlers = {};
const saved = new Map();
const toUrl = value => new URL(typeof value === 'string' ? value : value.url, base);
const cache = {
  async addAll(resources) {
    for (const resource of resources) {
      const url = toUrl(resource);
      const relativePath = url.pathname.slice(new URL(base).pathname.length) || 'index.html';
      const file = path.join(root, relativePath);
      assert.ok(fs.existsSync(file), `offline resource is missing: ${resource}`);
      saved.set(url.href, new Response(fs.readFileSync(file)));
    }
  },
  async put(request, response) { saved.set(toUrl(request).href, response); }
};
const caches = {
  async open() { return cache; },
  async keys() { return []; },
  async delete() {},
  async match(request, options = {}) {
    const wanted = toUrl(request);
    for (const [key, response] of saved) {
      const candidate = new URL(key);
      if (options.ignoreSearch ? candidate.origin + candidate.pathname === wanted.origin + wanted.pathname : candidate.href === wanted.href) return response.clone();
    }
    return undefined;
  }
};
const self = {
  location: {origin: new URL(base).origin},
  clients: {async claim() {}},
  async skipWaiting() {},
  addEventListener(name, callback) { handlers[name] = callback; }
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), {
  self, caches, URL, Response, fetch: async () => { throw new Error('offline'); }
});

(async () => {
  let install;
  handlers.install({waitUntil(promise) { install = promise; }});
  await install;
  async function offlineFetch(relative, destination, mode = 'no-cors') {
    let response;
    handlers.fetch({
      request: {url: new URL(relative, base).href, method: 'GET', destination, mode},
      respondWith(promise) { response = promise; }
    });
    assert.ok(response, `request was not intercepted: ${relative}`);
    return response;
  }
  const script = await offlineFetch('drive-3d.js?v=fix2', 'script');
  assert.match(await script.text(), /class DriveScene/);
  const questions = await offlineFetch('questions.js?v=fix2', 'script');
  assert.match(await questions.text(), /ensureAnswerChoice/);
  const stylesheet = await offlineFetch('style.css?v=fix2', 'style');
  assert.match(await stylesheet.text(), /\.road-choices/);
  const page = await offlineFetch('?offline-test', 'document', 'navigate');
  assert.match(await page.text(), /まなびドライブ/);
  const missing = await offlineFetch('missing.js?v=fix2', 'script');
  assert.equal(missing.type, 'error', 'a missing script must not return the HTML page');
  console.log('Required assets exist and offline requests receive the correct resource.');
})().catch(error => { console.error(error); process.exitCode = 1; });
