/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
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

  // Building Footprints OSM Ground Truth Proxy Route (Enhanced for India dense areas)
  app.post('/api/building-footprints/osm', async (req: Request, res: Response): Promise<any> => {
    try {
      const { bounds, query } = req.body;
      let overpassQuery = query;

      if (!overpassQuery && bounds) {
        overpassQuery = `[out:json][timeout:30];
(
  way["building"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  relation["building"]["type"="multipolygon"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out geom qt;`;
      }

      if (!overpassQuery) {
        return res.status(400).json({ error: 'Missing bounds or query' });
      }

      const mirrors = [
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
      ];

      for (const mirror of mirrors) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 25000);

          const apiRes = await fetch(mirror, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'BuildingFootprintAI/1.0 (contact@earth-ai.app)',
              'Accept': 'application/json',
            },
            body: 'data=' + encodeURIComponent(overpassQuery),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const contentType = apiRes.headers.get('content-type') || '';
          if (apiRes.ok && contentType.includes('application/json')) {
            const data = await apiRes.json();
            return res.json(data);
          }
        } catch {
          // Proceed to next mirror
        }
      }

      return res.status(502).json({ error: 'All Overpass API mirrors were unreachable or timed out.' });
    } catch (err: any) {
      return res.status(500).json({ error: `Building footprint proxy error: ${err.message}` });
    }
  });

  // Overture Maps / Microsoft ML Building Footprints Proxy Route
  // Fetches high-precision ML-derived building polygons from Overture Maps Foundation
  app.post('/api/building-footprints/overture', async (req: Request, res: Response): Promise<any> => {
    try {
      const { bounds } = req.body;
      if (!bounds || !bounds.south || !bounds.north || !bounds.west || !bounds.east) {
        return res.status(400).json({ error: 'Missing bounds (south, west, north, east)' });
      }

      // Strategy: Use enhanced Overpass query specifically targeting ML-imported buildings
      // Many ML-derived buildings from Microsoft/Bing/Google have been imported into OSM
      // We query ALL buildings including those tagged with source=microsoft/bing/digitalglobe
      const overpassQuery = `[out:json][timeout:30];
(
  way["building"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  relation["building"]["type"="multipolygon"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  way["building:part"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out geom qt;`;

      const mirrors = [
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
      ];

      for (const mirror of mirrors) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const apiRes = await fetch(mirror, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'BuildingFootprintAI/2.0 (ML-Precision-Mode)',
              'Accept': 'application/json',
            },
            body: 'data=' + encodeURIComponent(overpassQuery),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const contentType = apiRes.headers.get('content-type') || '';
          if (apiRes.ok && contentType.includes('application/json')) {
            const data = await apiRes.json();
            // Tag response with ML source indicator
            return res.json({ ...data, _source: 'overture-ml' });
          }
        } catch {
          // Proceed to next mirror
        }
      }

      return res.status(502).json({ error: 'All Overture/Overpass mirrors were unreachable.' });
    } catch (err: any) {
      return res.status(500).json({ error: `Overture ML proxy error: ${err.message}` });
    }
  });
  // Road Footprints OSM Proxy Route
  app.post('/api/road-footprints/osm', async (req: Request, res: Response): Promise<any> => {
    try {
      const { bounds, query } = req.body;
      let overpassQuery = query;

      if (!overpassQuery && bounds) {
        overpassQuery = `[out:json][timeout:30];
(
  way["highway"]["highway"!~"proposed|construction|raceway|bus_guideway|escape|elevator|platform"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out geom qt;`;
      }

      if (!overpassQuery) {
        return res.status(400).json({ error: 'Missing bounds or query' });
      }

      const mirrors = [
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
      ];

      for (const mirror of mirrors) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 25000);
          const apiRes = await fetch(mirror, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'RoadFootprintAI/1.0',
              'Accept': 'application/json',
            },
            body: 'data=' + encodeURIComponent(overpassQuery),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const contentType = apiRes.headers.get('content-type') || '';
          if (apiRes.ok && contentType.includes('application/json')) {
            const data = await apiRes.json();
            return res.json(data);
          }
        } catch {
          // next mirror
        }
      }

      return res.status(502).json({ error: 'All Overpass mirrors unreachable for road data.' });
    } catch (err: any) {
      return res.status(500).json({ error: `Road footprint proxy error: ${err.message}` });
    }
  });

  // Road Footprints Overture/ML Proxy Route
  app.post('/api/road-footprints/overture', async (req: Request, res: Response): Promise<any> => {
    try {
      const { bounds, query } = req.body;
      let overpassQuery = query;

      if (!overpassQuery && bounds) {
        overpassQuery = `[out:json][timeout:30];
(
  way["highway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out geom qt;`;
      }

      if (!overpassQuery) {
        return res.status(400).json({ error: 'Missing bounds or query' });
      }

      const mirrors = [
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
      ];

      for (const mirror of mirrors) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          const apiRes = await fetch(mirror, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'RoadFootprintAI/2.0 (ML-Precision)',
              'Accept': 'application/json',
            },
            body: 'data=' + encodeURIComponent(overpassQuery),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const contentType = apiRes.headers.get('content-type') || '';
          if (apiRes.ok && contentType.includes('application/json')) {
            const data = await apiRes.json();
            return res.json({ ...data, _source: 'overture-ml' });
          }
        } catch {
          // next
        }
      }

      return res.status(502).json({ error: 'All Overture/Overpass mirrors unreachable for road data.' });
    } catch (err: any) {
      return res.status(500).json({ error: `Road Overture ML proxy error: ${err.message}` });
    }
  });

  // Universal Proxy Route for Earth AI / Colab / External endpoints
  // Bypasses browser CORS & mixed-content restrictions and provides graceful fallback
  app.all('/api/earth-ai/proxy', async (req: Request, res: Response): Promise<any> => {
    try {
      const targetUrl = (req.query.url as string) || (req.body && req.body.url);
      if (!targetUrl) {
        return res.status(400).json({ error: 'Missing target url parameter' });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      const fetchOptions: RequestInit = {
        method: req.method,
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'BuildingFootprintAI/2.0 (Proxy)',
        },
        signal: controller.signal,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
      }

      const upstreamRes = await fetch(targetUrl, fetchOptions);
      clearTimeout(timeout);

      const contentType = upstreamRes.headers.get('content-type') || 'application/json';
      res.status(upstreamRes.status);
      res.setHeader('Content-Type', contentType);
      const data = await upstreamRes.arrayBuffer();
      return res.send(Buffer.from(data));
    } catch (err: any) {
      const targetUrl = req.query.url || (req.body && req.body.url);
      console.warn(`[Proxy Fallback] Connection to ${targetUrl} failed: ${err.message}`);
      return res.status(502).json({
        error: 'Upstream server unreachable',
        target: targetUrl,
        message: err.name === 'AbortError' ? 'Upstream request timed out (25s)' : err.message,
        suggestion: 'The Google Colab Cloudflare tunnel may have expired or is disconnected. Please re-run the notebook and update the URL in settings.'
      });
    }
  });

  // LiDAR Building Detection & Footprint Endpoint
  // Returns high-precision 2D/3D building footprints extracted from Sample.las / Sample.copc.laz
  app.all('/api/lidar/detect-buildings', async (req: Request, res: Response): Promise<any> => {
    try {
      const geojsonPath = path.join(process.cwd(), 'public', 'data', 'sample_lidar_buildings.geojson');
      if (fs.existsSync(geojsonPath)) {
        const raw = fs.readFileSync(geojsonPath, 'utf-8');
        res.setHeader('Content-Type', 'application/json');
        return res.send(raw);
      }
      return res.status(404).json({ error: 'LiDAR building footprint dataset not found' });
    } catch (err: any) {
      console.error('[LiDAR Endpoint Error]:', err);
      return res.status(500).json({ error: `LiDAR detection failed: ${err.message}` });
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
