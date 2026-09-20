/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleAuth } from 'google-auth-library';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  app.post('/api/maps-grounding', async (req: Request, res: Response): Promise<any> => {
    try {
      const { useVertexAI, model, requestBody } = req.body;

      const downstreamProxy = process.env.DOWNSTREAM_PROXY_URL;
      if (downstreamProxy) {
        // Strip trailing slash if present so URLs never have double slashes (//api)
        const cleanProxyUrl = downstreamProxy.replace(/\/+$/, '');
        let headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        try {
          const auth = new GoogleAuth();
          const client = await auth.getIdTokenClient(cleanProxyUrl);
          const idTokenHeaders = await client.getRequestHeaders();
          if (idTokenHeaders['Authorization']) {
            headers['Authorization'] = idTokenHeaders['Authorization'];
          }
        } catch (authError: any) {
          console.warn('Failed to obtain authentication token for downstream proxy:', authError.message);
        }

        const apiResponse = await fetch(`${cleanProxyUrl}/api/maps-grounding`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ useVertexAI, model, requestBody: req.body.requestBody || req.body }),
        });

        const contentType = apiResponse.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const rawText = await apiResponse.text();
          return res.status(apiResponse.status).json({
            error: `Downstream proxy returned non-JSON response (status ${apiResponse.status}): ${rawText.substring(0, 400)}`
          });
        }

        const data = await apiResponse.json();
        return res.status(apiResponse.status).json(data);
      }

      let endpoint: string;
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (useVertexAI) {
        // 1. Gemini Enterprise (aiplatform.googleapis.com)
        let accessToken = '';
        try {
          const auth = new GoogleAuth({
            scopes: 'https://www.googleapis.com/auth/cloud-platform',
          });
          const client = await auth.getClient();
          const tokenResponse = await client.getAccessToken();
          accessToken = tokenResponse.token || '';
        } catch (adcErr: any) {
          console.error('❌ [GoogleAuth Error] Could not load ADC inside AI Studio container:', adcErr.message);
          return res.status(401).json({
            error: `Google Cloud credentials (ADC) not available in AI Studio Applet sandbox (${adcErr.message}). To use Maps Grounding inside AI Studio, either switch to 'Gemini API' in the Settings sidebar (gear icon), OR toggle 'Custom GCP Credentials' in Settings to supply your personal OAuth token.`
          });
        }

        const activeModel = model || 'gemini-2.5-pro';
        const projectId = req.body.projectId || process.env.GCP_PROJECT_ID || 'maps-grounding-001';
        const rawLocation = req.body.location || process.env.GCP_LOCATION || 'us-central1';
        const location = rawLocation;

        const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
        endpoint = `https://${host}/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/${activeModel}:generateContent`;
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }
      } else {
        // 2. Google AI Studio (Gemini Developer API Key)
        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
          return res.status(400).json({ error: 'Gemini API Key is not configured on the server.' });
        }

        const activeModel = model || 'gemini-3.5-flash';
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent`;
        headers['x-goog-api-key'] = apiKey;
      }

      const apiResponse = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body.requestBody || req.body),
      });

      const contentType = apiResponse.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const rawText = await apiResponse.text();
        console.error(`❌ [PROXY ERROR] Non-JSON response from Gemini Enterprise (${apiResponse.status}):`, rawText.substring(0, 500));
        return res.status(apiResponse.status).json({
          error: `Gemini Enterprise returned non-JSON response (status ${apiResponse.status}): ${rawText.substring(0, 400)}` 
        });
      }

      const data = await apiResponse.json();
      return res.status(apiResponse.status).json(data);
    } catch (error: any) {
      console.error('Proxy Server Error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
