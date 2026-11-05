// Static checks over the HTML pages: syntax, local references, navigation and
// completion hooks. Runs without a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PAGES, checkAll } = require('../tools/check-scripts.js');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const LEVEL_PAGES = PAGES.filter(p => p !== 'index.html');

test('inline scripts in the hub and all four levels parse, plus every module', () => {
  const modules = ['js', 'js/racer', 'js/arena', 'js/incident', 'js/social'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.js')));
  assert.equal(checkAll().length, PAGES.length + modules.length);
  assert.ok(modules.length >= 6, 'progress + racer modules');
});

test('every local href/src/location target exists', () => {
  const pattern = /(?:href|src)\s*=\s*["']([^"'#]+)["']|location\.href\s*=\s*['"]([^'"]+)['"]/g;
  for (const page of PAGES) {
    for (const m of read(page).matchAll(pattern)) {
      const target = m[1] || m[2];
      if (/^(https?:|data:|mailto:)/.test(target)) continue;
      assert.ok(fs.existsSync(path.join(ROOT, target)), `${page} → ${target}`);
    }
  }
});

test('external scripts are pinned and integrity-checked', () => {
  for (const page of PAGES) {
    for (const m of read(page).matchAll(/<script[^>]*src=["'](https?:[^"']+)["'][^>]*>/g)) {
      assert.match(m[0], /integrity="sha384-[A-Za-z0-9+/=]+"/, `${page}: ${m[1]}`);
      assert.match(m[0], /crossorigin="anonymous"/, `${page}: ${m[1]}`);
      assert.match(m[1], /r128|@0\.128\.0/, `${page}: ${m[1]} should be version-pinned`);
    }
  }
});

test('each level loads the progress module and links back to the hub', () => {
  for (const page of LEVEL_PAGES) {
    const html = read(page);
    assert.match(html, /<script src="js\/progress\.js"><\/script>/, page);
    assert.match(html, /href="index\.html"|HUB_URL/, page);
  }
});

test('each level records its own completion, from game logic only', () => {
  const expected = { 'level1.html': 1, 'level2.html': 2, 'level3.html': 3, 'level4.html': 4 };
  for (const [page, id] of Object.entries(expected)) {
    const calls = [...read(page).matchAll(/HTPProgress\.recordCompletion\((\d)/g)].map(m => Number(m[1]));
    assert.deepEqual(calls, [id], `${page} should call recordCompletion(${id}) exactly once in source`);
  }
  assert.doesNotMatch(read('index.html'), /recordCompletion/, 'the hub must not mark levels complete');
});

test('level 1 keeps the full cinematic intro', () => {
  const html = read('level1.html');
  for (const marker of ['id="intro-screen"', 'id="pre-intro"', 'skipIntro()', 'function scheduleIntroTimeline',
    "showNarrator('PandeCorp.'", "showNarrator('Hack.'", 'Systems don\'t change the world']) {
    assert.ok(html.includes(marker), marker);
  }
});

test('the former "return to level 1" navigation is gone', () => {
  for (const page of PAGES) assert.doesNotMatch(read(page), /RETURN TO LEVEL 1/i, page);
});

test('level 2 no longer truncates option labels', () => {
  assert.doesNotMatch(read('level2.html'), /options\[[^\]]+\]\.substring\(/);
});

test('hub lists every level in campaign order', () => {
  const P = require('../js/progress.js');
  const hub = read('index.html');
  assert.match(hub, /HTPProgress\.LEVELS\.forEach/);
  for (const level of P.LEVELS) assert.ok(fs.existsSync(path.join(ROOT, level.url)), level.url);
  assert.match(hub, /prefers-reduced-motion/);
});
