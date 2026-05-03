const fs = require('node:fs');
const path = require('node:path');

const targets = ['level3.html', 'level4.html'];

for (const file of targets) {
  const target = path.resolve(__dirname, '..', file);
  const html = fs.readFileSync(target, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);

  if (scripts.length === 0) {
    throw new Error(`No inline <script> blocks found in ${file}`);
  }

  scripts.forEach((script, index) => {
    try {
      new Function(script);
    } catch (error) {
      error.message = `JavaScript syntax error in ${file} inline script #${index + 1}: ${error.message}`;
      throw error;
    }
  });

  console.log(`OK: ${scripts.length} inline script block(s) in ${file} passed syntax validation.`);
}
