import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const configured = process.env.VITE_API_BASE_URL || loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL || '';
  let apiOrigin = '';
  try {
    const url = new URL(configured);
    if (['http:', 'https:'].includes(url.protocol)) apiOrigin = url.origin;
  } catch { /* A relative URL uses the same origin. */ }
  const csp = ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
    "script-src 'self' https://js.stripe.com", "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: https://*.stripe.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com https://m.stripe.network",
    ["connect-src 'self'", 'https://api.stripe.com', 'https://*.stripe.com', 'https://m.stripe.network', apiOrigin].filter(Boolean).join(' ')
  ].join('; ');
  return {
  plugins: [react()],
  preview: { headers: { 'Content-Security-Policy': csp, 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' } },
  server: {
    proxy: {
      '/api': {
        target: process.env.VPS_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/testSetup.js',
    css: true,
  },
  };
});
