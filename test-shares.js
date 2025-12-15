/**
 * Shares 메트릭 테스트 스크립트
 * 사용법: node test-shares.js YOUR_ACCESS_TOKEN
 */

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';

async function threadsRequest(endpoint, accessToken, params = {}) {
  const url = new URL(`${THREADS_API_BASE}${endpoint}`);
  url.searchParams.append('access_token', accessToken);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Threads API error: ${response.status}`
    );
  }

  return response.json();
}

async function testSharesMetric(accessToken) {
  console.log('🔍 최신 글 1개 조회 중...\n');

  // 1. 최신 글 1개 가져오기
  const threadsResponse = await threadsRequest('/me/threads', accessToken, {
    fields: 'id,text,timestamp,permalink',
    limit: 1
  });

  if (!threadsResponse.data || threadsResponse.data.length === 0) {
    console.log('❌ 게시글이 없습니다.');
    return;
  }

  const thread = threadsResponse.data[0];
  console.log('📝 최신 글:');
  console.log(`   ID: ${thread.id}`);
  console.log(`   텍스트: ${thread.text?.slice(0, 50)}...`);
  console.log(`   시간: ${thread.timestamp}`);
  console.log(`   URL: ${thread.permalink}\n`);

  // 2. 인사이트 조회 (shares 포함)
  console.log('📊 인사이트 조회 중 (shares 포함)...\n');

  const insightsResponse = await threadsRequest(`/${thread.id}/insights`, accessToken, {
    metric: 'views,likes,replies,reposts,quotes,shares'
  });

  console.log('✅ 인사이트 결과:');
  console.log(JSON.stringify(insightsResponse, null, 2));

  // 파싱된 결과
  console.log('\n📈 파싱된 통계:');
  if (insightsResponse.data) {
    insightsResponse.data.forEach(metric => {
      const value = metric.values?.[0]?.value || 0;
      console.log(`   ${metric.name}: ${value}`);
    });
  }
}

// 실행
const accessToken = process.argv[2];

if (!accessToken) {
  console.log('❌ 사용법: node test-shares.js YOUR_ACCESS_TOKEN');
  process.exit(1);
}

testSharesMetric(accessToken)
  .then(() => console.log('\n✅ 테스트 완료'))
  .catch(err => console.error('\n❌ 에러:', err.message));
