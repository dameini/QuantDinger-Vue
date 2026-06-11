import { defineConfig, loadEnv } from 'vite'
import vue2 from '@vitejs/plugin-vue2'
import vue2Jsx from '@vitejs/plugin-vue2-jsx'
import svgLoader from 'vite-svg-loader'
import { viteMockServe } from 'vite-plugin-mock'
import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

const normalizeVersion = (value) => {
  let text = String(value || '').trim()
  if (!text) return ''
  if (text.startsWith('refs/tags/')) {
    text = text.slice('refs/tags/'.length)
  }
  if (text.startsWith('v') && text.length > 1 && /\d/.test(text[1])) {
    text = text.slice(1)
  }
  if (['latest', 'main', 'master'].includes(text)) {
    return ''
  }
  return text
}

const resolveAppVersion = (env) => {
  return normalizeVersion(env.VITE_APP_VERSION) ||
    normalizeVersion(env.APP_VERSION) ||
    normalizeVersion(process.env.APP_VERSION) ||
    normalizeVersion(env.GIT_TAG) ||
    normalizeVersion(process.env.GIT_TAG) ||
    normalizeVersion(process.env.GITHUB_REF_NAME) ||
    normalizeVersion(pkg.version) ||
    '0.0.0-dev'
}

const gitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch (e) {
    return 'unknown'
  }
})()

const buildDate = new Date().toLocaleString()

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const enableMock = env.VITE_ENABLE_MOCK === 'true'
  const appVersion = resolveAppVersion(env)

  return {
    base: './',
    resolve: {
      alias: [
        // webpack 风格的 ~package/... less @import → 直接命中 node_modules
        { find: /^~(.+)/, replacement: '$1' },
        // pro-layout 1.x 仍引用 webpack 专用插件 client，用 shim 兼容
        { find: 'webpack-theme-color-replacer/client', replacement: fileURLToPath(new URL('./src/shims/webpack-theme-color-replacer-client.js', import.meta.url)) },
        // moment 纯 CJS（module.exports = ctor），Vite 下 `import * as moment from 'moment'`
        // namespace 拿不到 isMoment 等静态方法 → 走 shim 平铺 named exports
        { find: /^moment$/, replacement: fileURLToPath(new URL('./src/shims/moment.js', import.meta.url)) },
        { find: /^store$/, replacement: 'store/dist/store.modern.js' },
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        { find: '@$', replacement: fileURLToPath(new URL('./src', import.meta.url)) }
      ],
      // 兼容旧代码中省略 .vue 后缀的 import（如 `import App from './App'`）
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue']
    },
    define: {
      APP_VERSION: JSON.stringify(appVersion),
      GIT_HASH: JSON.stringify(gitHash),
      BUILD_DATE: JSON.stringify(buildDate),
      'process.env.APP_VERSION': JSON.stringify(appVersion),
      'process.env.VUE_APP_VERSION': JSON.stringify(appVersion),
      // 兼容旧代码中的 process.env.VUE_APP_* 引用 —— 直接映射到 import.meta.env.VITE_*
      'process.env.VUE_APP_PREVIEW': JSON.stringify(env.VITE_PREVIEW || ''),
      'process.env.VUE_APP_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || ''),
      'process.env.VUE_APP_PYTHON_API_BASE_URL': JSON.stringify(env.VITE_PYTHON_API_BASE_URL || ''),
      'process.env.VUE_APP_PYODIDE_CDN_BASE': JSON.stringify(env.VITE_PYODIDE_CDN_BASE || ''),
      'process.env.VUE_APP_PYODIDE_LOCAL_BASE': JSON.stringify(env.VITE_PYODIDE_LOCAL_BASE || ''),
      'process.env.VUE_APP_PYODIDE_PREFER_CDN': JSON.stringify(env.VITE_PYODIDE_PREFER_CDN || '')
    },
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
          modifyVars: {
            'border-radius-base': '2px'
          }
        }
      }
    },
    plugins: [
      vue2(),
      vue2Jsx(),
      svgLoader({ defaultImport: 'url' }),
      viteMockServe({
        mockPath: 'src/mock/services',
        enable: enableMock,
        watchFiles: true,
        logger: true
      })
    ],
    server: {
      port: 8000,
      proxy: {
        '/api': {
          target: env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:5000',
          ws: true,
          changeOrigin: true,
          timeout: 600000,
          proxyTimeout: 600000
        }
      }
    },
    worker: {
      format: 'es'
    },
    optimizeDeps: {
      // pyodide 自己通过 Worker 内 importScripts 加载，不参与 Vite 预构建
      exclude: ['pyodide']
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      cssMinify: false,
      chunkSizeWarningLimit: 3600,
      commonjsOptions: {
        transformMixedEsModules: true
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'ant-design-vue': ['ant-design-vue'],
            echarts: ['echarts'],
            klinecharts: ['klinecharts'],
            codemirror: ['codemirror']
          }
        }
      }
    }
  }
})
