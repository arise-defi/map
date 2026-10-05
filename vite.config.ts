/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  // Default to the local Express server proxy (http://127.0.0.1:3000)
  // But allow overriding it in .env if needed.
  const target = env.PROXY_TARGET || 'http://127.0.0.1:3000';
  const isLocalProxy = target.includes('127.0.0.1') || target.includes('localhost');

  let idToken = env.CLOUD_RUN_ID_TOKEN || env.VITE_CLOUD_RUN_ID_TOKEN || '';
  if (!idToken && !isLocalProxy) {
    try {
      idToken = execSync(
        `gcloud auth print-identity-token --audiences="${target}"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();
    } catch (e) {
      console.warn(
        '\n⚠️  [Vite Proxy] Failed to automatically generate Google ID token via gcloud.\n' +
        'If you get 403 Forbidden errors, please run this command in your terminal and paste the output into your .env file as CLOUD_RUN_ID_TOKEN:\n\n' +
        `  gcloud auth print-identity-token --audiences="${target}"\n`
      );
    }
  }

  return {
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          headers: idToken ? {
            Authorization: `Bearer ${idToken}`
          } : {}
        }
      }
    },
    plugins: [react()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      'process.env.GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY || ''),
      'process.env.DOWNSTREAM_PROXY_URL': JSON.stringify(env.DOWNSTREAM_PROXY_URL || '')
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
