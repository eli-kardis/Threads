// Notion OAuth 토큰 교환 API
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
    // Notion OAuth 토큰 교환
    const credentials = Buffer.from(
      `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect_uri || process.env.NOTION_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Notion token error:', tokenData);
      return res.status(400).json(tokenData);
    }

    // 성공 응답
    return res.status(200).json({
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      bot_id: tokenData.bot_id,
      workspace_id: tokenData.workspace_id,
      workspace_name: tokenData.workspace_name,
      workspace_icon: tokenData.workspace_icon,
      owner: tokenData.owner,
    });
  } catch (error) {
    console.error('Notion token exchange error:', error);
    return res.status(500).json({ error: 'Token exchange failed', message: error.message });
  }
}
