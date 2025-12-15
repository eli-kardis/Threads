/**
 * Threads API 클라이언트 모듈
 * Threads 게시글 데이터 조회
 */

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';

// 페이지네이션 안전장치
const PAGINATION_LIMITS = {
  MAX_PAGES: 100,  // 최대 페이지 수 (무한 루프 방지)
  MAX_ITEMS: 5000  // 최대 아이템 수
};

/**
 * Threads API 요청
 * @param {string} endpoint
 * @param {string} accessToken
 * @param {Object} params
 * @returns {Promise<Object>}
 */
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

/**
 * Threads 연결 테스트 (사용자 정보 조회)
 * @param {string} accessToken
 * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
 */
export async function testConnection(accessToken) {
  try {
    const user = await threadsRequest('/me', accessToken, {
      fields: 'id,username,threads_profile_picture_url'
    });
    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 사용자의 Threads 게시글 목록 조회
 * @param {string} accessToken
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function getUserThreads(accessToken, options = {}) {
  const { limit = 25, since, until, after } = options;

  // since/until을 Unix timestamp (초 단위)로 변환
  const sinceTimestamp = since ? Math.floor(new Date(since).getTime() / 1000) : undefined;
  const untilTimestamp = until ? Math.floor(new Date(until).getTime() / 1000) : undefined;

  return await threadsRequest('/me/threads', accessToken, {
    fields: 'id,text,timestamp,media_type,media_url,permalink,username,is_quote_post',
    limit,
    since: sinceTimestamp,
    until: untilTimestamp,
    after
  });
}

/**
 * 특정 Threads 게시글 상세 조회
 * @param {string} accessToken
 * @param {string} threadId
 * @returns {Promise<Object>}
 */
export async function getThread(accessToken, threadId) {
  return await threadsRequest(`/${threadId}`, accessToken, {
    fields: 'id,text,timestamp,media_type,media_url,permalink,username,is_quote_post,children'
  });
}

/**
 * 계정 전체 인사이트 조회
 * @param {string} accessToken
 * @param {Object} options - { period: 7|14|30|90 }
 * @returns {Promise<Object>} - { views, likes, replies, reposts, quotes, followers_count }
 */
export async function getAccountInsights(accessToken, options = {}) {
  const { period = 7 } = options;

  // 기간 계산 (Unix timestamp)
  const now = Math.floor(Date.now() / 1000);
  const since = now - (period * 24 * 60 * 60);

  try {
    const response = await threadsRequest('/me/threads_insights', accessToken, {
      metric: 'views,likes,replies,reposts,quotes,followers_count',
      since,
      until: now
    });

    const stats = {
      views: 0,
      likes: 0,
      replies: 0,
      reposts: 0,
      quotes: 0,
      followers_count: 0,
      period,
      fetchedAt: new Date().toISOString()
    };

    if (response.data) {
      response.data.forEach(metric => {
        // total_value 또는 values 배열에서 값 추출
        const value = metric.total_value?.value || metric.values?.[0]?.value || 0;
        stats[metric.name] = value;
      });
    }

    return stats;
  } catch (error) {
    console.warn('Failed to get account insights:', error.message);
    return {
      views: 0,
      likes: 0,
      replies: 0,
      reposts: 0,
      quotes: 0,
      followers_count: 0,
      period,
      error: error.message
    };
  }
}

/**
 * Threads 게시글 통계(인사이트) 조회
 * @param {string} accessToken
 * @param {string} threadId
 * @returns {Promise<Object>} - { views, likes, replies, reposts, quotes }
 */
export async function getThreadInsights(accessToken, threadId) {
  try {
    const response = await threadsRequest(`/${threadId}/insights`, accessToken, {
      metric: 'views,likes,replies,reposts,quotes,shares'
    });

    // API 응답을 간단한 객체로 변환
    const stats = {
      views: 0,
      likes: 0,
      replies: 0,
      reposts: 0,
      quotes: 0,
      shares: 0
    };

    if (response.data) {
      response.data.forEach(metric => {
        const value = metric.values?.[0]?.value || 0;
        stats[metric.name] = value;
      });
    }

    return stats;
  } catch (error) {
    console.warn(`Failed to get insights for thread ${threadId}:`, error.message);
    return { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 };
  }
}

/**
 * Threads API 응답을 내부 형식으로 변환
 * @param {Object} apiThread - Threads API 응답
 * @returns {Object} - 표준화된 게시글 객체
 */
export function normalizeThread(apiThread, insights = null) {
  const hashtags = extractHashtags(apiThread.text || '');

  return {
    id: apiThread.id,
    text: apiThread.text || '',
    title: generateTitle(apiThread.text || ''),
    imageUrl: apiThread.media_type !== 'TEXT' ? apiThread.media_url : null,
    mediaType: apiThread.media_type,
    url: apiThread.permalink,
    createdAt: apiThread.timestamp,
    username: apiThread.username,
    isQuotePost: apiThread.is_quote_post,
    hashtags,
    // 통계 데이터 (insights가 없으면 기본값 0)
    views: insights?.views || 0,
    likes: insights?.likes || 0,
    replies: insights?.replies || 0,
    reposts: insights?.reposts || 0,
    quotes: insights?.quotes || 0,
    shares: insights?.shares || 0
  };
}

/**
 * 텍스트에서 해시태그 추출
 * @param {string} text
 * @returns {Array<string>}
 */
function extractHashtags(text) {
  const hashtagRegex = /#[\w가-힣]+/g;
  const matches = text.match(hashtagRegex) || [];
  return matches.map(tag => tag.slice(1)); // # 제거
}

/**
 * 게시글 텍스트에서 제목 생성
 * @param {string} text
 * @returns {string}
 */
function generateTitle(text) {
  if (!text) return 'Untitled Thread';

  // 첫 번째 줄 또는 50자까지
  const firstLine = text.split('\n')[0];
  const title = firstLine.slice(0, 50);

  return title.length < firstLine.length ? `${title}...` : title;
}

/**
 * 마지막 동기화 이후 새 게시글 조회
 * @param {string} accessToken
 * @param {string} sinceTimestamp - ISO 8601 형식
 * @returns {Promise<Array>}
 */
export async function getNewThreadsSince(accessToken, sinceTimestamp) {
  const response = await getUserThreads(accessToken, {
    since: sinceTimestamp,
    limit: 50
  });

  const threads = response.data || [];
  return threads.map(normalizeThread);
}

/**
 * 모든 게시글 조회 (페이지네이션 지원)
 * @param {string} accessToken
 * @param {Object} options - { since, until }
 * @returns {Promise<Array>}
 */
export async function getAllUserThreads(accessToken, options = {}) {
  const { since, until } = options;
  const allThreads = [];
  let cursor = null;
  const seenCursors = new Set(); // 무한 루프 감지용
  let pageCount = 0;

  do {
    // 무한 루프 방지: 이미 본 cursor인지 확인
    if (cursor && seenCursors.has(cursor)) {
      console.warn('Pagination loop detected, breaking');
      break;
    }
    if (cursor) {
      seenCursors.add(cursor);
    }

    // 최대 페이지 수 제한
    if (pageCount >= PAGINATION_LIMITS.MAX_PAGES) {
      console.warn(`Reached max page limit (${PAGINATION_LIMITS.MAX_PAGES}), stopping`);
      break;
    }

    // 최대 아이템 수 제한
    if (allThreads.length >= PAGINATION_LIMITS.MAX_ITEMS) {
      console.warn(`Reached max items limit (${PAGINATION_LIMITS.MAX_ITEMS}), stopping`);
      break;
    }

    const response = await getUserThreads(accessToken, {
      limit: 50,
      since,
      until,
      after: cursor
    });

    const threads = response.data || [];
    // 인용 게시글과 리포스트 제외 (원본 게시글만 동기화)
    const originalThreads = threads.filter(t => !t.is_quote_post && t.media_type !== 'REPOST_FACADE');
    allThreads.push(...originalThreads.map(normalizeThread));

    // 다음 페이지 커서
    cursor = response.paging?.cursors?.after || null;
    pageCount++;

    console.log(`Fetched ${threads.length} threads, total: ${allThreads.length}, page: ${pageCount}, hasMore: ${!!cursor}`);
  } while (cursor);

  return allThreads;
}

// === 토큰 관리 API ===

/**
 * 단기 토큰을 장기 토큰(60일)으로 교환
 * @param {string} shortLivedToken - 단기 액세스 토큰
 * @param {string} appSecret - Meta App Secret
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number}>}
 */
export async function exchangeForLongLivedToken(shortLivedToken, appSecret) {
  const url = new URL('https://graph.threads.net/access_token');
  url.searchParams.append('grant_type', 'th_exchange_token');
  url.searchParams.append('client_secret', appSecret);
  url.searchParams.append('access_token', shortLivedToken);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Token exchange failed: ${response.status}`
    );
  }

  return response.json();
}

/**
 * 장기 토큰 갱신 (서버를 통해 갱신 - App Secret 불필요)
 * @param {string} longLivedToken - 장기 액세스 토큰
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number}>}
 */
export async function refreshLongLivedToken(longLivedToken) {
  // 서버를 통해 갱신 (사용자는 App Secret 없이도 갱신 가능)
  const REFRESH_SERVER_URL = 'https://threads-murex-eight.vercel.app/api/refresh';
  const url = new URL(REFRESH_SERVER_URL);
  url.searchParams.append('access_token', longLivedToken);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Token refresh failed: ${response.status}`
    );
  }

  return response.json();
}
