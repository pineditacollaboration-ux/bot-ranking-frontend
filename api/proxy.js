// Vercel Serverless Function - Proxy para API del bot
// Esto permite HTTPS (Vercel) → HTTP (Bot) sin problemas de mixed content

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const BOT_API_URL = 'http://45.126.208.136:7000';
  
  try {
    // Extraer el path de la URL (eliminar /api/proxy)
    const path = req.url.replace(/^\/api\/proxy/, '');
    const url = `${BOT_API_URL}${path}`;
    
    console.log('Proxying to:', url);
    
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || 'royal_secure_key_123',
      },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();
    
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Error en proxy', message: error.message });
  }
}
