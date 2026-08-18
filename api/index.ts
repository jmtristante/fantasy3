import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

const FANTASY_API = 'https://fantasy-api.llt-services.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(200).end();
  }

  try {
    // Get path from query param ?path=/v1/competition/1/players
    const path = (req.query.path as string) || '/';
    const targetUrl = `${FANTASY_API}${path}`;
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

    const laligaToken = req.headers['x-laliga-token'] as string;
    if (laligaToken) headers['Authorization'] = `Bearer ${laligaToken}`;

    const contentType = req.headers['content-type'];
    if (contentType) headers['Content-Type'] = contentType;

    const body = await new Promise<string>((resolve, reject) => {
      const proxyReq = https.request({
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: req.method,
        headers,
      }, (proxyRes) => {
        let data = '';
        proxyRes.on('data', (chunk: Buffer) => data += chunk.toString());
        proxyRes.on('end', () => resolve(data));
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(proxyRes.statusCode || 500, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        });
      });
      proxyReq.on('error', reject);
      proxyReq.end();
    });

    res.end(body);
  } catch (err: any) {
    res.status(500).json({ error: 'Proxy error', message: err.message });
  }
}
