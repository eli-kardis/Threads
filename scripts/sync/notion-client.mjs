/**
 * Notion API 클라이언트 (GitHub Actions용)
 * 기존 Extension 코드 기반, Node.js 환경 적응
 */

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

let lastRequestTime = 0;
const REQUEST_DELAY = 350; // ~3 req/sec

// 필드 타입별 자동 매핑 키워드
const FIELD_KEYWORDS = {
  title: ['title', 'name', '제목', '이름'],
  content: ['content', 'text', 'body', '내용', '본문'],
  createdAt: ['created', 'date', 'time', '작성일', '날짜', '생성'],
  sourceUrl: ['url', 'link', 'source', '링크', '주소', '원본'],
  threadId: ['thread id', 'threadid', '스레드 id', 'post id'],
  views: ['view', 'read', '조회', '읽음'],
  likes: ['like', 'heart', '좋아요', '하트'],
  replies: ['repl', 'comment', '댓글', '답글'],
  reposts: ['repost', 'share', '리포스트', '공유'],
  quotes: ['quote', '인용'],
  shares: ['share', '공유'],
  username: ['user', 'author', 'name', '사용자', '작성자', '계정']
};

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
 * 데이터베이스 스키마 조회
 * @param {string} secret
 * @param {string} databaseId
 * @returns {Promise<Object>}
 */
export async function getDatabaseSchema(secret, databaseId) {
  return notionRequest(`/databases/${databaseId}`, secret, {
    method: 'GET'
  });
}

/**
 * 데이터베이스 스키마에서 필드 매핑 자동 감지
 * @param {string} secret
 * @param {string} databaseId
 * @returns {Promise<Object>}
 */
export async function autoDetectFieldMapping(secret, databaseId) {
  const schema = await getDatabaseSchema(secret, databaseId);
  const properties = schema.properties || {};

  const mapping = {
    title: null,
    content: null,
    createdAt: null,
    sourceUrl: null,
    threadId: null,
    views: null,
    likes: null,
    replies: null,
    reposts: null,
    quotes: null,
    shares: null,
    username: null
  };

  // 1단계: 타입 기반 매칭
  for (const [propName, propConfig] of Object.entries(properties)) {
    const propType = propConfig.type;
    const nameLower = propName.toLowerCase();

    // title 타입은 무조건 title 필드
    if (propType === 'title' && !mapping.title) {
      mapping.title = propName;
      continue;
    }

    // url 타입 필드
    if (propType === 'url' && !mapping.sourceUrl) {
      mapping.sourceUrl = propName;
      continue;
    }

    // date 타입 필드
    if (propType === 'date' && !mapping.createdAt) {
      // 'created', 'date', '작성' 등 키워드 포함 시 매핑
      if (FIELD_KEYWORDS.createdAt.some(kw => nameLower.includes(kw))) {
        mapping.createdAt = propName;
        continue;
      }
    }

    // number 타입 필드 (통계)
    if (propType === 'number') {
      for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
        if (['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'].includes(field)) {
          if (!mapping[field] && keywords.some(kw => nameLower.includes(kw))) {
            mapping[field] = propName;
            break;
          }
        }
      }
      continue;
    }

    // rich_text 타입 필드 (content, username, threadId)
    if (propType === 'rich_text') {
      if (!mapping.content && FIELD_KEYWORDS.content.some(kw => nameLower.includes(kw))) {
        mapping.content = propName;
        continue;
      }
      if (!mapping.username && FIELD_KEYWORDS.username.some(kw => nameLower.includes(kw))) {
        mapping.username = propName;
        continue;
      }
      if (!mapping.threadId && FIELD_KEYWORDS.threadId.some(kw => nameLower.includes(kw))) {
        mapping.threadId = propName;
        continue;
      }
    }
  }

  // 2단계: date 필드가 아직 없으면 첫 번째 date 타입 사용
  if (!mapping.createdAt) {
    for (const [propName, propConfig] of Object.entries(properties)) {
      if (propConfig.type === 'date') {
        mapping.createdAt = propName;
        break;
      }
    }
  }

  console.log('[AutoDetect] Field mapping:', JSON.stringify(mapping, null, 2));
  return mapping;
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

  // fieldMapping에서 null이 아닌 필드만 사용
  const statFields = ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'];
  statFields.forEach(key => {
    const field = fieldMapping[key];
    if (field && stats[key] !== undefined) {
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
 * fieldMapping에서 null인 필드는 건너뜀 (자동 감지 실패 시)
 */
function buildProperties(thread, fieldMapping, insights) {
  const fm = fieldMapping || {};
  const properties = {};

  // 제목 (title 필드는 필수)
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

  // Thread ID (숫자)
  if (fm.threadId && thread.id) {
    properties[fm.threadId] = {
      rich_text: [{ text: { content: String(thread.id) } }]
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

/**
 * 페이지에서 Thread ID 추출 (숫자 ID)
 * @param {Object} page
 * @param {string} threadIdField
 * @returns {string|null}
 */
export function extractThreadIdFromPage(page, threadIdField) {
  if (!threadIdField) return null;
  const prop = page.properties?.[threadIdField];
  return prop?.rich_text?.[0]?.plain_text || null;
}
