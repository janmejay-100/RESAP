
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const root = __dirname;
const toolFiles = {};

const toolsDirectory = resolve(root, 'tools');

// Include tool pages only if the tools directory exists.
if (existsSync(toolsDirectory)) {
  const files = readdirSync(toolsDirectory);

  files.forEach((file) => {
    if (file.endsWith('.html')) {
      const name = file.replace(/\.html$/, '');
      toolFiles[`tools/${name}`] = resolve(toolsDirectory, file);
    }
  });
}

const input = {
  main: resolve(root, 'index.html'),
  ...toolFiles,
};

// Add optional pages only when they exist.
const optionalPages = [
  'about',
  'contact',
  'privacy',
  'terms',
  '404',
];

optionalPages.forEach((page) => {
  const filePath = resolve(root, `${page}.html`);

  if (existsSync(filePath)) {
    input[page] = filePath;
  }
});

export default defineConfig({
  root,
  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    rollupOptions: {
      input,
    },
  },

 server: {
  host: "0.0.0.0",
  port: 3000,
  strictPort: true,
}
});
