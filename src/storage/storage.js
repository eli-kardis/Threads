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
  LAST_SYNC_TIME: 'lastSyncTime'
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

export { STORAGE_KEYS, clear as clearAll };
