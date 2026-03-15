import { resolve } from 'path'
import { builtinModules } from 'module'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Only externalize electron and node builtins — bundle all npm deps
const external = [
  'electron',
  /^electron\/.+/,
  ...builtinModules.flatMap((m) => [m, `node:${m}`]),
]

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
        },
        external,
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts'),
        },
        external,
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    css: {
      transformer: 'postcss',
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    ssr: {
      external: ['lightningcss'],
    },
    build: {
      cssMinify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
  },
})
