import { generateRecapDirect } from '../src/lib/geminiDirect';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const result = await generateRecapDirect(req.body);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('API Error in Vercel Serverless Function:', error);
    return res.status(500).json({ error: error.message || 'Gagal memproses naskah manga.' });
  }
}
