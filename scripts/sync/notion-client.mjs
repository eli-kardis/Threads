/**
 * Notion API 클라이언트 (GitHub Actions용)
 * 기존 Extension 코드 기반, Node.js 환경 적응
 */

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

let lastRequestTime = 0;
const REQUEST_DELAY = 350; // ~3 req/sec

/**
 * Rate limit 대기
 */
async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < REQUEST_DELAY) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
}

/**
 * Notion API 요청
 * @param {string} endpoint
 * @param {string} secret
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function notionRequest(endpoint, secret, options = {}) {
  await waitForRateLimit();

  const response = await fetch(`${NOTION_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Notion API error: ${response.status}`
    );
  }

  return response.json();
}

/**
 * 데이터베이스에서 URL로 페이지 검색 (중복 체크)
 * @param {string} secret
 * @param {string} databaseId
 * @param {string} sourceUrl
 * @param {string} urlField - URL 필드명 (기본: 'URL')
 * @returns {Promise<Object|null>}
 */
export async function findPageBySourceUrl(secret, databaseId, sourceUrl, urlField = 'URL') {
  try {
    const response = await notionRequest(`/databases/${databaseId}/query`, secret, {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          property: urlField,
          url: { equals: sourceUrl }
        },
        page_size: 1
      })
    });

    return response.results?.[0] || null;
  } catch (error) {
    console.warn('Failed to find page by URL:', error.message);
    return null;
  }
}

/**
 * 데이터베이스에서 모든 페이지 조회 (기간별 필터링)
 * @param {string} secret
 * @param {string} databaseId
 * @param {Object} options - { dateField, since, limit }
 * @returns {Promise<Array>}
 */
export async function queryAllPages(secret, databaseId, options = {}) {
  const { dateField, since, limit = 100 } = options;
  const allPages = [];
  let cursor = null;
  let pageCount = 0;
  const maxPages = 10;
  let useSorting = !!dateField;

  do {
    if (pageCount >= maxPages) break;

    const body = {
      page_size: Math.min(limit, 100),
      ...(cursor && { start_cursor: cursor })
    };

    // 날짜 필터 추가 (필드가 지정된 경우만)
    if (since && dateField) {
      body.filter = {
        property: dateField,
        date: { on_or_after: since }
      };
    }

    // 최신순 정렬 (dateField가 있고 정렬이 활성화된 경우만)
    if (useSorting && dateField) {
      body.sorts = [{
        property: dateField,
        direction: 'descending'
      }];
    }

    try {
      const response = await notionRequest(`/databases/${databaseId}/query`, secret, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      allPages.push(...(response.results || []));
      cursor = response.has_more ? response.next_cursor : null;
      pageCount++;

      if (allPages.length >= limit) break;
    } catch (error) {
      // 정렬 필드 오류인 경우 정렬 없이 재시도
      if (error.message.includes('sort property') && useSorting) {
        console.warn(`Sort field "${dateField}" not found, retrying without sorting`);
        useSorting = false;
        delete body.sorts;
        delete body.filter;

        const response = await notionRequest(`/databases/${databaseId}/query`, secret, {
          method: 'POST',
          body: JSON.stringify(body)
        });

        allPages.push(...(response.results || []));
        cursor = response.has_more ? response.next_cursor : null;
        pageCount++;
      } else {
        throw error;
      }
    }
  } while (cursor);

  return allPages.slice(0, limit);
}

/**
 * 페이지 생성
 * @param {string} secret
 * @param {string} databaseId
 * @param {Object} thread
 * @param {Object} fieldMapping
 * @param {Object} insights
 * @returns {Promise<Object>}
 */
export async function createPage(secret, databaseId, thread, fieldMapping = {}, insights = {}) {
  const properties = buildProperties(thread, fieldMapping, insights);

  const pageData = {
    parent: { database_id: databaseId },
    properties,
    children: buildContent(thread)
  };

  return notionRequest('/pages', secret, {
    method: 'POST',
    body: JSON.stringify(pageData)
  });
}

/**
 * 페이지 통계 업데이트
 * @param {string} secret
 * @param {string} pageId
 * @param {Object} stats
 * @param {Object} fieldMapping
 * @returns {Promise<Object>}
 */
export async function updatePageStats(secret, pageId, stats, fieldMapping = {}) {
  const properties = {};

  const mapping = {
    views: fieldMapping.views || 'Views',
    likes: fieldMapping.likes || 'Likes',
    replies: fieldMapping.replies || 'Replies',
    reposts: fieldMapping.reposts || 'Reposts',
    quotes: fieldMapping.quotes || 'Quotes',
    shares: fieldMapping.shares || 'Shares'
  };

  Object.entries(mapping).forEach(([key, field]) => {
    if (stats[key] !== undefined && field) {
      properties[field] = { number: stats[key] };
    }
  });

  if (Object.keys(properties).length === 0) {
    return null;
  }

  return notionRequest(`/pages/${pageId}`, secret, {
    method: 'PATCH',
    body: JSON.stringify({ properties })
  });
}

/**
 * 프로퍼티 빌드
 */
function buildProperties(thread, fieldMapping, insights) {
  const fm = {
    title: fieldMapping.title || 'Name',
    content: fieldMapping.content || 'Content',
    createdAt: fieldMapping.createdAt || 'Created',
    sourceUrl: fieldMapping.sourceUrl || 'URL',
    views: fieldMapping.views || 'Views',
    likes: fieldMapping.likes || 'Likes',
    replies: fieldMapping.replies || 'Replies',
    reposts: fieldMapping.reposts || 'Reposts',
    quotes: fieldMapping.quotes || 'Quotes',
    shares: fieldMapping.shares || 'Shares',
    username: fieldMapping.username || 'Username'
  };

  const properties = {};

  // 제목
  if (fm.title) {
    properties[fm.title] = {
      title: [{ text: { content: thread.title || thread.text?.slice(0, 100) || 'Untitled' } }]
    };
  }

  // 본문
  if (fm.content && thread.text) {
    properties[fm.content] = {
      rich_text: [{ text: { content: thread.text.slice(0, 2000) } }]
    };
  }

  // 작성일
  if (fm.createdAt && thread.createdAt) {
    properties[fm.createdAt] = {
      date: { start: thread.createdAt }
    };
  }

  // URL
  if (fm.sourceUrl && thread.url) {
    properties[fm.sourceUrl] = {
      url: thread.url
    };
  }

  // 인사이트
  const stats = ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'];
  stats.forEach(stat => {
    if (fm[stat] && insights[stat] !== undefined) {
      properties[fm[stat]] = { number: insights[stat] };
    }
  });

  // Username
  if (fm.username && thread.username) {
    properties[fm.username] = {
      rich_text: [{ text: { content: thread.username } }]
    };
  }

  return properties;
}

/**
 * 콘텐츠 블록 빌드
 */
function buildContent(thread) {
  const blocks = [];

  if (thread.text) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: thread.text } }]
      }
    });
  }

  if (thread.url) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: '원본 보기: ' } },
          { type: 'text', text: { content: thread.url, link: { url: thread.url } } }
        ]
      }
    });
  }

  return blocks;
}

/**
 * 페이지에서 URL 추출
 * @param {Object} page
 * @param {string} urlField
 * @returns {string|null}
 */
export function extractUrlFromPage(page, urlField = 'URL') {
  return page.properties?.[urlField]?.url || null;
}

/**
 * 페이지에서 날짜 추출
 * @param {Object} page
 * @param {string} dateField
 * @returns {string|null}
 */
export function extractDateFromPage(page, dateField = 'Created') {
  return page.properties?.[dateField]?.date?.start || null;
}
