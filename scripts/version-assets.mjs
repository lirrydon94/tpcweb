import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Run on the publication copy, leaving local source files untouched.
const root = path.resolve(process.argv[2]);
const files = ['styles.css', 'config.js', ...(await fs.readdir(path.join(root, 'src')))
  .filter(file => file.endsWith('.js')).sort().map(file => `src/${file}`)];
const hash = createHash('sha256');
for (const file of files) hash.update(await fs.readFile(path.join(root, file)));
const version = hash.digest('hex').slice(0, 16);
await fs.writeFile(path.join(root, 'build-version.json'), JSON.stringify({ version }));
const htmlPath = path.join(root, 'index.html');
const html = await fs.readFile(htmlPath, 'utf8');
await fs.writeFile(htmlPath, html
  .replace('./styles.css"', `./styles.css?v=${version}"`)
  .replace('./src/app.js"', `./src/app.js?v=${version}"`));
for (const file of files.filter(file => file.endsWith('.js'))) {
  const filename = path.join(root, file);
  const source = await fs.readFile(filename, 'utf8');
  await fs.writeFile(filename, source.replaceAll('__APP_BUILD_VERSION__', version).replace(
    /(from\s+['"])(\.{1,2}\/[^'"?]+\.js)(['"])/g,
    `$1$2?v=${version}$3`,
  ));
}
