// 사용자가 앱 연결 해제 시 호출됨
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'POST') {
    // Meta에서 보내는 signed_request 처리
    const { signed_request } = req.body || {};

    console.log('Deauthorize callback received:', signed_request);

    // 필요시 사용자 데이터 정리 로직 추가

    return res.status(200).json({ success: true });
  }

  return res.status(200).json({ success: true });
}
