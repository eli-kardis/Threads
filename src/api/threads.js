/**
 * Threads API 클라이언트 모듈
 * Threads 게시글 데이터 조회
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
  const { limit = 25, since, until } = options;

  return await threadsRequest('/me/threads', accessToken, {
    fields: 'id,text,timestamp,media_type,media_url,permalink,username,is_quote_post',
    limit,
    since,
    until
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
 * Threads API 응답을 내부 형식으로 변환
 * @param {Object} apiThread - Threads API 응답
 * @returns {Object} - 표준화된 게시글 객체
 */
export function normalizeThread(apiThread) {
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
    hashtags
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
