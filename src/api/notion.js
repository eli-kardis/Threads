/**
 * Notion API 클라이언트 모듈
 * Notion 데이터베이스에 페이지를 생성하고 관리
 */

import { retryWithBackoff } from '../shared/utils.js';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Rate Limit: 3 requests per second
const REQUEST_DELAY = 334; // ~3 req/sec
let lastRequestTime = 0;

/**
 * Rate Limit을 준수하며 요청 대기
 */
async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < REQUEST_DELAY) {
    await new Promise(resolve =>
      setTimeout(resolve, REQUEST_DELAY - timeSinceLastRequest)
    );
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
 * Notion 연결 테스트
 * @param {string} secret
 * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
 */
export async function testConnection(secret) {
  try {
    const user = await notionRequest('/users/me', secret);
    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Integration에 공유된 모든 데이터베이스 목록 조회
 * @param {string} secret
 * @returns {Promise<Array<{id: string, title: string, icon: string|null}>>}
 */
export async function listDatabases(secret) {
  try {
    const allDatabases = [];
    let cursor = null;

    do {
      const body = {
        filter: {
          value: 'database',
          property: 'object'
        },
        page_size: 100
      };

      if (cursor) {
        body.start_cursor = cursor;
      }

      const response = await notionRequest('/search', secret, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      allDatabases.push(...response.results);

      if (!response.has_more) break;
      cursor = response.next_cursor;
    } while (true);

    return allDatabases.map(db => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || 'Untitled',
      icon: db.icon?.emoji || db.icon?.external?.url || null
    }));
  } catch (error) {
    console.error('Failed to list databases:', error);
    throw error;
  }
}

/**
 * 데이터베이스 정보 조회
 * @param {string} secret
 * @param {string} databaseId
 * @returns {Promise<Object>}
 */
export async function getDatabase(secret, databaseId) {
  return await notionRequest(`/databases/${databaseId}`, secret);
}

/**
 * 데이터베이스의 프로퍼티(필드) 목록 조회
 * @param {string} secret
 * @param {string} databaseId
 * @returns {Promise<Object>}
 */
export async function getDatabaseProperties(secret, databaseId) {
  const database = await getDatabase(secret, databaseId);
  return database.properties;
}

/**
 * Notion 데이터베이스에 페이지 생성
 * @param {string} secret
 * @param {string} databaseId
 * @param {Object} threadPost - Threads 게시글 데이터
 * @param {Object} fieldMapping - 필드 매핑 설정
 * @returns {Promise<Object>}
 */
export async function createPage(secret, databaseId, threadPost, fieldMapping) {
  const properties = buildProperties(threadPost, fieldMapping);

  const pageData = {
    parent: { database_id: databaseId },
    properties,
    children: buildContent(threadPost)
  };

  return await retryWithBackoff(
    () => notionRequest('/pages', secret, {
      method: 'POST',
      body: JSON.stringify(pageData)
    }),
    3,
    1000
  );
}

/**
 * Threads 게시글 데이터를 Notion 프로퍼티로 변환
 * @param {Object} threadPost
 * @param {Object} fieldMapping
 * @returns {Object}
 */
function buildProperties(threadPost, fieldMapping) {
  const properties = {};

  // 제목 필드
  if (fieldMapping.title) {
    properties[fieldMapping.title] = {
      title: [
        {
          text: {
            content: threadPost.title || threadPost.text?.slice(0, 100) || 'Untitled'
          }
        }
      ]
    };
  }

  // 본문 필드 (Rich Text)
  if (fieldMapping.content && threadPost.text) {
    properties[fieldMapping.content] = {
      rich_text: [
        {
          text: {
            content: threadPost.text.slice(0, 2000) // Notion 제한
          }
        }
      ]
    };
  }

  // 이미지 URL 필드
  if (fieldMapping.image && threadPost.imageUrl) {
    properties[fieldMapping.image] = {
      url: threadPost.imageUrl
    };
  }

  // 태그 필드 (Multi-select)
  if (fieldMapping.tags && threadPost.hashtags?.length > 0) {
    properties[fieldMapping.tags] = {
      multi_select: threadPost.hashtags.map(tag => ({ name: tag }))
    };
  }

  // 작성 시간 필드
  if (fieldMapping.createdAt && threadPost.createdAt) {
    properties[fieldMapping.createdAt] = {
      date: {
        start: threadPost.createdAt
      }
    };
  }

  // Threads 원본 URL
  if (fieldMapping.sourceUrl && threadPost.url) {
    properties[fieldMapping.sourceUrl] = {
      url: threadPost.url
    };
  }

  return properties;
}

/**
 * 페이지 콘텐츠 블록 생성
 * @param {Object} threadPost
 * @returns {Array}
 */
function buildContent(threadPost) {
  const blocks = [];

  // 본문 텍스트
  if (threadPost.text) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: threadPost.text
            }
          }
        ]
      }
    });
  }

  // 이미지
  if (threadPost.imageUrl) {
    blocks.push({
      object: 'block',
      type: 'image',
      image: {
        type: 'external',
        external: {
          url: threadPost.imageUrl
        }
      }
    });
  }

  // 원본 링크
  if (threadPost.url) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: '원본 보기: '
            }
          },
          {
            type: 'text',
            text: {
              content: threadPost.url,
              link: { url: threadPost.url }
            }
          }
        ]
      }
    });
  }

  return blocks;
}

/**
 * 페이지 업데이트 (기존 글 수정 시)
 * @param {string} secret
 * @param {string} pageId
 * @param {Object} properties
 * @returns {Promise<Object>}
 */
export async function updatePage(secret, pageId, properties) {
  return await retryWithBackoff(
    () => notionRequest(`/pages/${pageId}`, secret, {
      method: 'PATCH',
      body: JSON.stringify({ properties })
    }),
    3,
    1000
  );
}
