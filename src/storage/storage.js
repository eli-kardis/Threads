/**
 * Chrome Storage 래퍼 모듈
 * chrome.storage.local을 추상화하여 API 토큰 및 설정 관리
 */

const STORAGE_KEYS = {
  THREADS_TOKEN: 'threadsAccessToken',
  THREADS_APP_SECRET: 'threadsAppSecret',
  THREADS_TOKEN_EXPIRES_AT: 'threadsTokenExpiresAt',
  NOTION_SECRET: 'notionSecret',
  NOTION_DB_ID: 'notionDatabaseId',
  FIELD_MAPPING: 'fieldMapping',
  SYNC_OPTIONS: 'syncOptions',
  SYNC_HISTORY: 'syncHistory',
  LAST_SYNC_TIME: 'lastSyncTime',
  SYNCED_THREAD_IDS: 'syncedThreadIds',
  THREAD_PAGE_MAPPINGS: 'threadPageMappings'
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
 * Threads App Secret 저장
 * @param {string} secret
 */
export async function setThreadsAppSecret(secret) {
  await set(STORAGE_KEYS.THREADS_APP_SECRET, secret);
}

/**
 * Threads App Secret 조회
 * @returns {Promise<string|null>}
 */
export async function getThreadsAppSecret() {
  return await get(STORAGE_KEYS.THREADS_APP_SECRET);
}

/**
 * Threads 토큰 만료 시간 저장
 * @param {number} expiresAt - Unix timestamp (밀리초)
 */
export async function setTokenExpiresAt(expiresAt) {
  await set(STORAGE_KEYS.THREADS_TOKEN_EXPIRES_AT, expiresAt);
}

/**
 * Threads 토큰 만료 시간 조회
 * @returns {Promise<number|null>}
 */
export async function getTokenExpiresAt() {
  return await get(STORAGE_KEYS.THREADS_TOKEN_EXPIRES_AT);
}

/**
 * 토큰이 곧 만료되는지 확인 (7일 이내)
 * @returns {Promise<boolean>}
 */
export async function isTokenExpiringSoon() {
  const expiresAt = await getTokenExpiresAt();
  if (!expiresAt) return false;

  const now = Date.now();
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

  return expiresAt - now < sevenDaysInMs;
}

/**
 * 토큰이 만료되었는지 확인
 * @returns {Promise<boolean>}
 */
export async function isTokenExpired() {
  const expiresAt = await getTokenExpiresAt();
  if (!expiresAt) return true; // 만료 시간이 없으면 만료된 것으로 간주

  return Date.now() >= expiresAt;
}

/**
 * 토큰 남은 일수 조회
 * @returns {Promise<number|null>}
 */
export async function getTokenRemainingDays() {
  const expiresAt = await getTokenExpiresAt();
  if (!expiresAt) return null;

  const now = Date.now();
  const remainingMs = expiresAt - now;

  if (remainingMs <= 0) return 0;

  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
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
  return options || { autoSync: true, syncInterval: 1, dailyStatsRefresh: true };
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

/**
 * 마지막 동기화 시간 초기화 (전체 동기화용)
 */
export async function clearLastSyncTime() {
  await remove(STORAGE_KEYS.LAST_SYNC_TIME);
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

// === Thread-Page 매핑 관리 (통계 업데이트용) ===

/**
 * Thread ID와 Notion Page ID 매핑 추가
 * @param {string} threadId
 * @param {string} notionPageId
 * @param {string} sourceUrl - Thread 원본 URL
 * @param {string} postCreatedAt - 게시글 작성 시간 (ISO 8601)
 */
export async function addThreadPageMapping(threadId, notionPageId, sourceUrl, postCreatedAt) {
  const mappings = await get(STORAGE_KEYS.THREAD_PAGE_MAPPINGS) || [];

  // 이미 존재하면 업데이트
  const existingIndex = mappings.findIndex(m => m.threadId === threadId);
  if (existingIndex >= 0) {
    mappings[existingIndex] = { threadId, notionPageId, sourceUrl, postCreatedAt, updatedAt: new Date().toISOString() };
  } else {
    mappings.push({ threadId, notionPageId, sourceUrl, postCreatedAt, createdAt: new Date().toISOString() });
  }

  // 최근 500개만 유지
  if (mappings.length > 500) {
    mappings.shift();
  }

  await set(STORAGE_KEYS.THREAD_PAGE_MAPPINGS, mappings);
}

/**
 * 모든 Thread-Page 매핑 조회
 * @returns {Promise<Array<{threadId: string, notionPageId: string, sourceUrl: string}>>}
 */
export async function getThreadPageMappings() {
  return await get(STORAGE_KEYS.THREAD_PAGE_MAPPINGS) || [];
}

/**
 * 특정 Thread의 Notion Page ID 조회
 * @param {string} threadId
 * @returns {Promise<string|null>}
 */
export async function getNotionPageIdByThreadId(threadId) {
  const mappings = await getThreadPageMappings();
  const mapping = mappings.find(m => m.threadId === threadId);
  return mapping?.notionPageId || null;
}

export { STORAGE_KEYS, clear as clearAll };
