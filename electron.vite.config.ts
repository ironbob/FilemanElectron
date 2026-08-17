import { join, resolve } from 'path'
import { cpSync, rmSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'

/**
 * 根目录 icons/ 是运行时按 URL 引用的静态资源(FileList/DirCompare 的文件类型图标,
 * 引用形如 './icons/ic_xxx.svg' —— 相对 index.html 解析)。renderer root = 项目根,
 * dev 由 Vite dev server 直接伺服;但构建只产出被 import 的资产,icons/ 不在其中 →
 * 打包态 file:// 下 404。构建收尾时把它原样拷进 out/renderer/icons,两种态 URL 一致。
 * main.py 是图标批量改名的一次性辅助脚本,不随包分发。
 */
function copyRootIconsPlugin(): Plugin {
  return {
    name: 'copy-root-icons',
    apply: 'build',
    closeBundle() {
      const src = resolve(__dirname, 'icons')
      const dest = resolve(__dirname, 'out/renderer/icons')
      cpSync(src, dest, { recursive: true })
      rmSync(join(dest, 'main.py'), { force: true })
    }
  }
}

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
    plugins: [vue(), copyRootIconsPlugin()]
  }
})
