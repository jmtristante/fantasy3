import type { VercelRequest, VercelResponse } from '@vercel/node';
import http from 'http';
import https from 'https';

const FANTASY_API = 'https://fantasy-api.llt-services.com';

function proxyRequest(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    // Extract the path after /api/
    const apiPath = req.url || '/';
    const targetUrl = `${FANTASY_API}${apiPath}`;

    const urlObj = new URL(targetUrl);

    const headers: Record<string, string> = {
      'x-app': '2',
      'x-lang': 'es',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Connection': 'keep-alive',
      'Host': urlObj.host,
    };

    // Forward LaLiga token
    const laligaToken = req.headers['x-laliga-token'] as string;
    if (laligaToken) headers['Authorization'] = `Bearer ${laligaToken}`;

    // Forward content type
    const contentType = req.headers['content-type'];
    if (contentType) headers['Content-Type'] = contentType;

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: req.method,
      headers,
    };

    const proxyReq = https.request(options, (proxyRes) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');

      // Forward status and content type
      res.writeHead(proxyRes.statusCode || 500, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      });

      proxyRes.pipe(res);
      proxyRes.on('end', () => resolve());
    });

    proxyReq.on('error', (err) => {
      res.status(500).json({ error: 'Proxy error', message: err.message });
      resolve();
    });

    // Forward request body if present
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(200).end();
  }

  return proxyRequest(req, res);
}
