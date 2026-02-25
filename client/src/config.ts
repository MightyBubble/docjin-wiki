const parsedTimeout = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS ?? '5000', 10);

export const clientConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
  apiTimeoutMs: Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 5000,
};

