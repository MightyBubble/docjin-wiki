import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return fallback
  }
  return parsed
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false
  return fallback
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devPort = parsePort(env.VITE_DEV_SERVER_PORT, 5178)
  const strictPort = parseBoolean(env.VITE_DEV_STRICT_PORT, true)
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001'
  const host = env.VITE_DEV_SERVER_HOST || '127.0.0.1'

  return {
    plugins: [react()],
    server: {
      host,
      port: devPort,
      strictPort,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host,
      port: devPort,
      strictPort,
    },
  }
})
