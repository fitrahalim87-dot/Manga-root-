import { generateRecapWithProviders } from '../src/lib/geminiDirect';

export const maxDuration = 60;

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = body ? JSON.parse(body) : {};
      } catch {
        return res.status(400).json({ error: 'Format JSON request tidak valid.' });
      }
    }

    const result = await generateRecapWithProviders(body || {}, process.env.GEMINI_API_KEY || '');
    return res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('API Error in Vercel Serverless Function:', error);
    return res.status(500).json({ error: error?.message || 'Gagal memproses naskah manga.' });
  }
}
