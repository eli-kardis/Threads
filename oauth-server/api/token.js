// Threads OAuth 토큰 교환 API
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { code, redirect_uri } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  try {
    // 단기 토큰 발급
    const tokenResponse = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.THREADS_APP_ID,
        client_secret: process.env.THREADS_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: redirect_uri || process.env.REDIRECT_URI,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return res.status(400).json(tokenData);
    }

    // 장기 토큰으로 교환
    const longLivedResponse = await fetch(
      `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${process.env.THREADS_APP_SECRET}&access_token=${tokenData.access_token}`
    );

    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      // 장기 토큰 실패해도 단기 토큰 반환
      return res.status(200).json(tokenData);
    }

    return res.status(200).json({
      access_token: longLivedData.access_token,
      token_type: 'bearer',
      expires_in: longLivedData.expires_in,
      user_id: tokenData.user_id,
    });
  } catch (error) {
    console.error('Token exchange error:', error);
    return res.status(500).json({ error: 'Token exchange failed', message: error.message });
  }
}
