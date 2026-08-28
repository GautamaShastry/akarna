import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = process.cwd();

// Two passes:
//  - default: background service worker (ES module) + side panel page.
//  - `--mode content`: the content script, bundled as a single classic IIFE.
//    MV3 content scripts are classic scripts: no `import`, no relative chunks.
export default defineConfig(({ mode }) => {
  if (mode === 'content') {
    return {
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
          entry: resolve(root, 'src/content/index.ts'),
          name: 'AkarnaContent',
          formats: ['iife'],
          fileName: () => 'content.js',
        },
      },
    };
  }

  return {
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          background: resolve(root, 'src/background/index.ts'),
          sidepanel: resolve(root, 'sidepanel.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
