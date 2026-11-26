import { testProviderKey } from '../src/lib/geminiDirect';

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = body ? JSON.parse(body) : {};
      } catch {
        return res.status(400).json({ ok: false, error: 'Format JSON request tidak valid.' });
      }
    }

    const result = await testProviderKey(body || {});
    return res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('Vercel /api/test-key error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Gagal menguji koneksi API Key di server.'
    });
  }
}
