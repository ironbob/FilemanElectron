import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts')
        },
        external: [
          // Optional native dependencies - will be loaded at runtime if available
          '@aozp/smb2',
          '@marsaud/smb2',
          'smb2',
          'ssh2',
          'webdav',
          'adbkit',
          '@devicefarmer/adbkit'
        ]
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'electron/src'),
        '@shared': resolve(__dirname, 'shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, '.'),
    server: process.env.E2E_PORT
      ? { host: '127.0.0.1', port: Number(process.env.E2E_PORT), strictPort: true }
      : undefined,
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared')
      }
    },
    plugins: [vue()]
  }
})
