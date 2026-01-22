/**
 * Threads API 클라이언트 (GitHub Actions용)
 * 기존 Extension 코드 기반, Node.js 환경 적응
 */

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';

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
      url.searchParams.append(key, String(value));
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
 * 사용자 정보 조회
 * @param {string} accessToken
 * @returns {Promise<Object>}
 */
export async function getUserInfo(accessToken) {
  return threadsRequest('/me', accessToken, {
    fields: 'id,username,threads_profile_picture_url'
  });
}

/**
 * 사용자의 Threads 게시글 목록 조회
 * @param {string} accessToken
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function getUserThreads(accessToken, options = {}) {
  const { limit = 25, since, until, after } = options;

  const sinceTimestamp = since ? Math.floor(new Date(since).getTime() / 1000) : undefined;
  const untilTimestamp = until ? Math.floor(new Date(until).getTime() / 1000) : undefined;

  return threadsRequest('/me/threads', accessToken, {
    fields: 'id,text,timestamp,media_type,media_url,permalink,username,is_quote_post',
    limit,
    since: sinceTimestamp,
    until: untilTimestamp,
    after
  });
}

/**
 * 게시글 인사이트 조회
 * @param {string} accessToken
 * @param {string} threadId
 * @returns {Promise<Object>}
 */
export async function getThreadInsights(accessToken, threadId) {
  try {
    const response = await threadsRequest(`/${threadId}/insights`, accessToken, {
      metric: 'views,likes,replies,reposts,quotes,shares'
    });

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
 * 계정 전체 인사이트 조회
 * @param {string} accessToken
 * @param {number} period - 기간 (일)
 * @returns {Promise<Object>}
 */
export async function getAccountInsights(accessToken, period = 7) {
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
      period
    };

    if (response.data) {
      response.data.forEach(metric => {
        const value = metric.total_value?.value || metric.values?.[0]?.value || 0;
        stats[metric.name] = value;
      });
    }

    return stats;
  } catch (error) {
    console.warn('Failed to get account insights:', error.message);
    return { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, followers_count: 0, period };
  }
}

/**
 * 모든 게시글 조회 (페이지네이션)
 * @param {string} accessToken
 * @param {Object} options
 * @returns {Promise<Array>}
 */
export async function getAllUserThreads(accessToken, options = {}) {
  const { since, limit = 30, maxPages = 50 } = options;
  const allThreads = [];
  let cursor = null;
  let pageCount = 0;

  do {
    if (pageCount >= maxPages) {
      console.log(`Reached max pages (${maxPages}), stopping`);
      break;
    }

    const response = await getUserThreads(accessToken, {
      limit: Math.min(limit, 50),
      since,
      after: cursor
    });

    const threads = response.data || [];
    const originalThreads = threads.filter(t => !t.is_quote_post && t.media_type !== 'REPOST_FACADE');
    allThreads.push(...originalThreads.map(normalizeThread));

    cursor = response.paging?.cursors?.after || null;
    pageCount++;

    if (allThreads.length >= limit) {
      break;
    }
  } while (cursor);

  return allThreads.slice(0, limit);
}

/**
 * Thread 정규화
 * @param {Object} apiThread
 * @returns {Object}
 */
export function normalizeThread(apiThread) {
  const text = apiThread.text || '';
  const firstLine = text.split('\n')[0];
  const title = firstLine.slice(0, 50) + (firstLine.length > 50 ? '...' : '');

  return {
    id: apiThread.id,
    text,
    title: title || 'Untitled Thread',
    mediaType: apiThread.media_type,
    imageUrl: apiThread.media_type !== 'TEXT' ? apiThread.media_url : null,
    url: apiThread.permalink,
    createdAt: apiThread.timestamp,
    username: apiThread.username,
    isQuotePost: apiThread.is_quote_post,
  };
}

/**
 * 딜레이 헬퍼
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
