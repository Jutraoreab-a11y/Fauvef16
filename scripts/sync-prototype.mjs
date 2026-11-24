import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'prototype');
const destination = resolve(root, 'public/studio');

mkdirSync(destination, { recursive: true });

for (const file of ['index.html', 'styles.css', 'data.js', 'draw.js', 'app.js']) {
  cpSync(resolve(source, file), resolve(destination, file));
}
