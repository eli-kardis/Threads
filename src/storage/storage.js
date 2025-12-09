/**
 * Chrome Storage 래퍼 모듈
 * chrome.storage.local을 추상화하여 API 토큰 및 설정 관리
 */

const STORAGE_KEYS = {
  THREADS_TOKEN: 'threadsAccessToken',
  NOTION_SECRET: 'notionSecret',
  NOTION_DB_ID: 'notionDatabaseId',
  FIELD_MAPPING: 'fieldMapping',
  SYNC_OPTIONS: 'syncOptions',
  SYNC_HISTORY: 'syncHistory',
  LAST_SYNC_TIME: 'lastSyncTime',
  HASHTAG_FILTERS: 'hashtagFilters',
  SYNCED_THREAD_IDS: 'syncedThreadIds'
};

/**
 * 스토리지에서 값 조회
 * @param {string} key
 * @returns {Promise<any>}
 */
async function get(key) {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

/**
 * 스토리지에 값 저장
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
async function set(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

/**
 * 스토리지에서 값 삭제
 * @param {string} key
 * @returns {Promise<void>}
 */
async function remove(key) {
  await chrome.storage.local.remove(key);
}

/**
 * 모든 스토리지 데이터 삭제
 * @returns {Promise<void>}
 */
async function clear() {
  await chrome.storage.local.clear();
}

// === API 토큰 관리 ===

/**
 * Threads 액세스 토큰 저장
 * @param {string} token
 */
export async function setThreadsToken(token) {
  await set(STORAGE_KEYS.THREADS_TOKEN, token);
}

/**
 * Threads 액세스 토큰 조회
 * @returns {Promise<string|null>}
 */
export async function getThreadsToken() {
  return await get(STORAGE_KEYS.THREADS_TOKEN);
}

/**
 * Notion 시크릿 키 저장
 * @param {string} secret
 */
export async function setNotionSecret(secret) {
  await set(STORAGE_KEYS.NOTION_SECRET, secret);
}

/**
 * Notion 시크릿 키 조회
 * @returns {Promise<string|null>}
 */
export async function getNotionSecret() {
  return await get(STORAGE_KEYS.NOTION_SECRET);
}

/**
 * Notion 데이터베이스 ID 저장
 * @param {string} dbId
 */
export async function setNotionDatabaseId(dbId) {
  await set(STORAGE_KEYS.NOTION_DB_ID, dbId);
}

/**
 * Notion 데이터베이스 ID 조회
 * @returns {Promise<string|null>}
 */
export async function getNotionDatabaseId() {
  return await get(STORAGE_KEYS.NOTION_DB_ID);
}

// === 필드 매핑 관리 ===

/**
 * 필드 매핑 설정 저장
 * @param {Object} mapping - { title: string, content: string, image: string, tags: string }
 */
export async function setFieldMapping(mapping) {
  await set(STORAGE_KEYS.FIELD_MAPPING, mapping);
}

/**
 * 필드 매핑 설정 조회
 * @returns {Promise<Object|null>}
 */
export async function getFieldMapping() {
  return await get(STORAGE_KEYS.FIELD_MAPPING);
}

// === 동기화 옵션 관리 ===

/**
 * 동기화 옵션 저장
 * @param {Object} options - { autoSync: boolean, syncInterval: number }
 */
export async function setSyncOptions(options) {
  await set(STORAGE_KEYS.SYNC_OPTIONS, options);
}

/**
 * 동기화 옵션 조회
 * @returns {Promise<Object>}
 */
export async function getSyncOptions() {
  const options = await get(STORAGE_KEYS.SYNC_OPTIONS);
  return options || { autoSync: true, syncInterval: 5 };
}

// === 동기화 히스토리 관리 ===

/**
 * 동기화 히스토리에 항목 추가
 * @param {Object} entry - { id, threadId, notionPageId, status, timestamp, error? }
 */
export async function addSyncHistoryEntry(entry) {
  const history = await get(STORAGE_KEYS.SYNC_HISTORY) || [];
  history.unshift(entry);

  // 최근 100개만 유지
  if (history.length > 100) {
    history.splice(100);
  }

  await set(STORAGE_KEYS.SYNC_HISTORY, history);
}

/**
 * 동기화 히스토리 조회
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getSyncHistory(limit = 50) {
  const history = await get(STORAGE_KEYS.SYNC_HISTORY) || [];
  return history.slice(0, limit);
}

/**
 * 마지막 동기화 시간 저장
 * @param {string} timestamp
 */
export async function setLastSyncTime(timestamp) {
  await set(STORAGE_KEYS.LAST_SYNC_TIME, timestamp);
}

/**
 * 마지막 동기화 시간 조회
 * @returns {Promise<string|null>}
 */
export async function getLastSyncTime() {
  return await get(STORAGE_KEYS.LAST_SYNC_TIME);
}

// === 설정 완료 여부 확인 ===

/**
 * 필수 설정이 완료되었는지 확인
 * @returns {Promise<boolean>}
 */
export async function isConfigured() {
  const [threadsToken, notionSecret, notionDbId] = await Promise.all([
    getThreadsToken(),
    getNotionSecret(),
    getNotionDatabaseId()
  ]);

  return !!(threadsToken && notionSecret && notionDbId);
}

/**
 * 모든 설정 조회
 * @returns {Promise<Object>}
 */
export async function getAllSettings() {
  const [threadsToken, notionSecret, notionDbId, fieldMapping, syncOptions] = await Promise.all([
    getThreadsToken(),
    getNotionSecret(),
    getNotionDatabaseId(),
    getFieldMapping(),
    getSyncOptions()
  ]);

  return {
    threadsToken,
    notionSecret,
    notionDbId,
    fieldMapping,
    syncOptions
  };
}

// === 해시태그 필터 관리 ===

/**
 * 해시태그 필터 설정 저장
 * @param {Object} filters - { enabled: boolean, mode: 'include'|'exclude', hashtags: string[] }
 */
export async function setHashtagFilters(filters) {
  await set(STORAGE_KEYS.HASHTAG_FILTERS, filters);
}

/**
 * 해시태그 필터 설정 조회
 * @returns {Promise<Object>}
 */
export async function getHashtagFilters() {
  const filters = await get(STORAGE_KEYS.HASHTAG_FILTERS);
  return filters || { enabled: false, mode: 'include', hashtags: [] };
}

/**
 * 게시글이 필터 조건을 통과하는지 확인
 * @param {Array<string>} postHashtags - 게시글의 해시태그 목록
 * @returns {Promise<boolean>}
 */
export async function shouldSyncPost(postHashtags) {
  const filters = await getHashtagFilters();

  if (!filters.enabled || filters.hashtags.length === 0) {
    return true; // 필터 비활성화 시 모든 게시글 동기화
  }

  const normalizedPostTags = postHashtags.map(t => t.toLowerCase());
  const normalizedFilterTags = filters.hashtags.map(t => t.toLowerCase());

  const hasMatchingTag = normalizedPostTags.some(tag =>
    normalizedFilterTags.includes(tag)
  );

  if (filters.mode === 'include') {
    return hasMatchingTag; // 포함 모드: 일치하는 태그가 있어야 동기화
  } else {
    return !hasMatchingTag; // 제외 모드: 일치하는 태그가 없어야 동기화
  }
}

// === 동기화된 Thread ID 관리 (중복 방지) ===

/**
 * 동기화된 Thread ID 목록 조회
 * @returns {Promise<Set<string>>}
 */
export async function getSyncedThreadIds() {
  const ids = await get(STORAGE_KEYS.SYNCED_THREAD_IDS) || [];
  return new Set(ids);
}

/**
 * 동기화된 Thread ID 추가
 * @param {string} threadId
 */
export async function addSyncedThreadId(threadId) {
  const ids = await get(STORAGE_KEYS.SYNCED_THREAD_IDS) || [];
  if (!ids.includes(threadId)) {
    ids.push(threadId);
    // 최근 500개만 유지
    if (ids.length > 500) {
      ids.shift();
    }
    await set(STORAGE_KEYS.SYNCED_THREAD_IDS, ids);
  }
}

/**
 * Thread가 이미 동기화되었는지 확인
 * @param {string} threadId
 * @returns {Promise<boolean>}
 */
export async function isThreadSynced(threadId) {
  const syncedIds = await getSyncedThreadIds();
  return syncedIds.has(threadId);
}

// === 동기화 통계 ===

/**
 * 동기화 통계 조회
 * @returns {Promise<Object>}
 */
export async function getSyncStats() {
  const history = await getSyncHistory(100);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - today.getDay());

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  let todayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let successCount = 0;
  let failedCount = 0;

  history.forEach(entry => {
    const entryDate = new Date(entry.timestamp);

    if (entry.status === 'success') {
      successCount++;
      if (entryDate >= today) todayCount++;
      if (entryDate >= thisWeekStart) weekCount++;
      if (entryDate >= thisMonthStart) monthCount++;
    } else {
      failedCount++;
    }
  });

  return {
    total: history.length,
    success: successCount,
    failed: failedCount,
    successRate: history.length > 0 ? Math.round((successCount / history.length) * 100) : 0,
    today: todayCount,
    thisWeek: weekCount,
    thisMonth: monthCount
  };
}

export { STORAGE_KEYS, clear as clearAll };
