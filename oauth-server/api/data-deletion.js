// 사용자가 데이터 삭제 요청 시 호출됨
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'POST') {
    const { signed_request } = req.body || {};

    console.log('Data deletion callback received:', signed_request);

    // 확인 코드 생성 (Meta 요구사항)
    const confirmationCode = `DEL_${Date.now()}`;

    // 필요시 사용자 데이터 삭제 로직 추가

    return res.status(200).json({
      url: `https://your-domain.com/deletion-status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  }

  return res.status(200).json({ success: true });
}
