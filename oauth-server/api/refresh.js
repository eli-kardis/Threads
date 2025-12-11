// 토큰 갱신 API
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { access_token } = req.query;

  if (!access_token) {
    return res.status(400).json({ error: 'Missing access_token parameter' });
  }

  try {
    // 장기 토큰 갱신 요청
    const response = await fetch(
      `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${access_token}`
    );

    const data = await response.json();

    if (data.error) {
      return res.status(400).json(data);
    }

    return res.status(200).json({
      access_token: data.access_token,
      token_type: 'bearer',
      expires_in: data.expires_in
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({ error: 'Token refresh failed', message: error.message });
  }
}
