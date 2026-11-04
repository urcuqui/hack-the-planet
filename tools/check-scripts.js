// Syntax-checks every inline <script> block in the game pages, plus the shared
// js/ modules. Parsing only (new Function never runs the code).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PAGES = ['index.html', 'level1.html', 'level2.html', 'level3.html', 'level4.html'];

function inlineScripts(html) {
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/.test(match[1] || ''))
    .map(match => match[2]);
}

function checkSource(label, source) {
  try {
    new Function(source);
  } catch (error) {
    error.message = `JavaScript syntax error in ${label}: ${error.message}`;
    throw error;
  }
}

function checkAll() {
  const report = [];
  for (const file of PAGES) {
    const scripts = inlineScripts(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    if (scripts.length === 0) throw new Error(`No inline <script> blocks found in ${file}`);
    scripts.forEach((script, i) => checkSource(`${file} inline script #${i + 1}`, script));
    report.push(`${file}: ${scripts.length} inline script block(s)`);
  }
  for (const dir of ['js', 'js/racer', 'js/arena', 'js/incident']) {
    for (const file of fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.js'))) {
      checkSource(`${dir}/${file}`, fs.readFileSync(path.join(ROOT, dir, file), 'utf8'));
      report.push(`${dir}/${file}`);
    }
  }
  return report;
}

module.exports = { PAGES, inlineScripts, checkAll };

if (require.main === module) {
  checkAll().forEach(line => console.log(`OK: ${line}`));
}
