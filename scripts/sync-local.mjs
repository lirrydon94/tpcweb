import fs from 'node:fs/promises';
import path from 'node:path';
import { publishState, validateState } from '../src/model.js';
import { readWorkspace, writeWorkspace } from './workspace-file.mjs';

// Browser database fragments can contain old revisions and cannot reliably
// identify the current workspace. Only import the user's explicit backup file.
const filename = process.argv[2];
if (!filename) {
  console.error('Starta npm run dev, öppna din befintliga sida på port 5500 och välj Hantera → Spara till projektet.');
  console.error('Alternativ: exportera en säkerhetskopia och kör npm run sync -- "sökväg/till/säkerhetskopia.json".');
  process.exitCode = 1;
} else {
  try {
    const working = JSON.parse(await fs.readFile(path.resolve(filename), 'utf8'));
    const errors = validateState(working);
    if (errors.length) throw new Error(errors.join('\n'));
    const root = path.resolve(import.meta.dirname, '..');
    const previous = await readWorkspace(root);
    await writeWorkspace(root, {
      working, published: publishState(working), revision: previous.revision + 1,
      appliedFixes: previous.appliedFixes,
    });
    console.log('Säkerhetskopian har sparats i src/default-data.js. Ta med filen i din commit och push.');
  } catch (error) {
    console.error(`Kunde inte spara säkerhetskopian: ${error.message}`);
    process.exitCode = 1;
  }
}
