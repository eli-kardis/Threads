/**
 * 백그라운드 서비스 워커
 * 확장 프로그램의 핵심 로직 수행
 */

import * as storage from './storage/storage.js';
import * as notionApi from './api/notion.js';
import * as threadsApi from './api/threads.js';
import { generateId, formatDate, sleep } from './shared/utils.js';

// 디버그 모드 (프로덕션에서는 false)
const DEBUG = false;
const log = DEBUG ? console.log.bind(console) : () => {};

// 동기화 상태 (Promise 기반 락)
let syncPromise = null;

// 팔로워 수 캐시 (1분 유효 - 데이터 신선도 유지)
const FOLLOWERS_CACHE_TTL = 60 * 1000;
let followersCache = { count: 0, fetchedAt: 0 };

// 요청 결합 (Request Coalescing) - 동일 요청 중복 방지
const pendingInsightsRequests = new Map();

// isSyncing getter (하위 호환성 유지)
const isSyncing = () => syncPromise !== null;

/**
 * 확장 프로그램 설치/업데이트 시 초기화
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  log('Threads to Notion Sync installed:', details.reason);

  if (details.reason === 'install') {
    // 첫 설치 시 설정 페이지 열기
    chrome.runtime.openOptionsPage();
  }

  // 동기화 알람 설정
  await setupSyncAlarm();

  // 토큰 갱신 체크 알람 설정
  await setupTokenRefreshAlarm();
});

/**
 * 동기화 알람 설정
 */
async function setupSyncAlarm() {
  const options = await storage.getSyncOptions();

  if (options.autoSync) {
    chrome.alarms.create('syncThreads', {
      periodInMinutes: options.syncInterval || 5
    });
    log('Sync alarm set:', options.syncInterval || 5, 'minutes');
  } else {
    chrome.alarms.clear('syncThreads');
    log('Sync alarm cleared');
  }

  // 매일 아침 9시 통계 새로고침 알람 설정
  await setupDailyStatsAlarm(options.dailyStatsRefresh);
}

/**
 * 매일 아침 9시 통계 새로고침 알람 설정
 */
async function setupDailyStatsAlarm(enabled) {
  if (enabled) {
    // 다음 9시 계산
    const now = new Date();
    const next9am = new Date();
    next9am.setHours(9, 0, 0, 0);

    if (now >= next9am) {
      next9am.setDate(next9am.getDate() + 1);
    }

    chrome.alarms.create('dailyStatsRefresh', {
      when: next9am.getTime(),
      periodInMinutes: 24 * 60 // 24시간마다 반복
    });
    log('Daily stats refresh alarm set for:', next9am.toLocaleString());
  } else {
    chrome.alarms.clear('dailyStatsRefresh');
    log('Daily stats refresh alarm cleared');
  }
}

/**
 * 토큰 갱신 체크 알람 설정 (매일 한 번)
 */
async function setupTokenRefreshAlarm() {
  chrome.alarms.create('tokenRefreshCheck', {
    periodInMinutes: 24 * 60 // 24시간마다
  });
  log('Token refresh check alarm set');
}

// 토큰 갱신 재시도 상수
const TOKEN_REFRESH_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000
};

/**
 * 토큰 만료 체크 및 자동 갱신 (재시도 로직 포함)
 */
async function checkAndRefreshToken() {
  log('Checking token expiration...');

  const token = await storage.getThreadsToken();
  if (!token) {
    log('No token configured');
    return { success: false, reason: 'no_token' };
  }

  // 만료 7일 이내인지 확인
  const isExpiringSoon = await storage.isTokenExpiringSoon();
  if (!isExpiringSoon) {
    const remainingDays = await storage.getTokenRemainingDays();
    log(`Token is still valid (${remainingDays} days remaining)`);
    return { success: true, reason: 'not_expiring_soon', remainingDays };
  }

  // App Secret이 있어야 갱신 가능
  const appSecret = await storage.getThreadsAppSecret();
  if (!appSecret) {
    console.warn('Token expiring soon but no App Secret configured');
    showNotification(
      '토큰 만료 임박',
      '토큰이 곧 만료됩니다. 설정 페이지에서 App Secret을 입력하고 토큰을 갱신해주세요.',
      'error'
    );
    return { success: false, reason: 'no_app_secret' };
  }

  // 재시도 로직
  let lastError = null;
  for (let attempt = 1; attempt <= TOKEN_REFRESH_CONFIG.MAX_RETRIES; attempt++) {
    try {
      log(`Refreshing long-lived token (attempt ${attempt}/${TOKEN_REFRESH_CONFIG.MAX_RETRIES})...`);
      const result = await threadsApi.refreshLongLivedToken(token);

      // 새 토큰 저장
      await storage.setThreadsToken(result.access_token);

      // 만료 시간 저장 (현재 시간 + expires_in 초)
      const expiresAt = Date.now() + (result.expires_in * 1000);
      await storage.setTokenExpiresAt(expiresAt);

      const newRemainingDays = Math.ceil(result.expires_in / (24 * 60 * 60));
      log(`Token refreshed successfully. Valid for ${newRemainingDays} days`);

      showNotification(
        '토큰 갱신 완료',
        `액세스 토큰이 갱신되었습니다. (${newRemainingDays}일 유효)`,
        'success'
      );

      return { success: true, reason: 'refreshed', expiresIn: result.expires_in };
    } catch (error) {
      lastError = error;
      console.warn(`Token refresh attempt ${attempt} failed:`, error.message);

      if (attempt < TOKEN_REFRESH_CONFIG.MAX_RETRIES) {
        log(`Retrying in ${TOKEN_REFRESH_CONFIG.RETRY_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, TOKEN_REFRESH_CONFIG.RETRY_DELAY_MS));
      }
    }
  }

  // 모든 재시도 실패
  console.error('Token refresh failed after all retries:', lastError);
  showNotification(
    '토큰 갱신 실패',
    `토큰 갱신 중 오류가 발생했습니다: ${lastError.message}`,
    'error'
  );
  return { success: false, reason: 'refresh_failed', error: lastError.message };
}

/**
 * 알람 이벤트 핸들러
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncThreads') {
    await performSync({ limit: 10 }); // 자동 동기화: 10개만
  } else if (alarm.name === 'dailyStatsRefresh') {
    await refreshAllPostsStats();
  } else if (alarm.name === 'tokenRefreshCheck') {
    await checkAndRefreshToken();
  }
});

/**
 * 메시지 핸들러 (Content Script, Popup, Options와 통신)
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.message }));

  return true; // 비동기 응답 허용
});

/**
 * 메시지 처리
 * @param {Object} message
 * @param {Object} sender
 * @returns {Promise<Object>}
 */
async function handleMessage(message, sender) {
  switch (message.type) {
    case 'SYNC_NOW':
      return await popupSync(); // 팝업 버튼: 14일 인사이트 새로고침 + 새 글 동기화

    case 'GET_SYNC_STATUS':
      return await getSyncStatus();

    case 'NEW_POST_DETECTED':
      return await handleNewPostDetected(message.postData);

    case 'TEST_CONNECTIONS':
      return await testConnections();

    case 'UPDATE_SYNC_OPTIONS':
      await storage.setSyncOptions(message.options);
      await setupSyncAlarm();
      return { success: true };

    case 'GET_SYNC_HISTORY':
      return await storage.getSyncHistory(message.limit || 50);

    case 'GET_SYNC_STATS':
      return await storage.getSyncStats();

    case 'LIST_DATABASES':
      return await listNotionDatabases();

    case 'REFRESH_STATS':
      await refreshAllPostsStats();
      return { success: true };

    case 'SETUP_LONG_LIVED_TOKEN':
      return await setupLongLivedToken(message.token, message.appSecret);

    case 'REFRESH_TOKEN':
      return await checkAndRefreshToken();

    case 'GET_TOKEN_STATUS':
      return await getTokenStatus();

    case 'SYNC_FROM_DATE':
      return await syncFromDate(message.fromDate);

    case 'SAVE_APP_SECRET':
      await storage.setThreadsAppSecret(message.appSecret);
      return { success: true };

    case 'GET_ACCOUNT_INSIGHTS':
      const settingsForInsights = await storage.getAllSettings();
      return await threadsApi.getAccountInsights(settingsForInsights.threadsToken, { period: message.period || 7 });

    case 'GET_AGGREGATED_INSIGHTS':
      return await getAggregatedInsightsWithCoalescing(message.period || 7);

    case 'GET_ALL_INSIGHTS':
      return await getAllInsights();

    case 'GET_THREAD_MAPPINGS':
      return await storage.getThreadPageMappings();

    case 'GET_FOLLOWERS_HISTORY':
      return await storage.getFollowersHistory(message.limit || 90);

    case 'GET_FOLLOWERS_CHANGE_STATS':
      return await storage.getFollowersChangeStats();

    case 'RECORD_FOLLOWERS_NOW':
      await recordDailyFollowers();
      return { success: true };

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

/**
 * 동기화 상태 조회
 */
async function getSyncStatus() {
  const [isConfigured, lastSyncTime, history, options] = await Promise.all([
    storage.isConfigured(),
    storage.getLastSyncTime(),
    storage.getSyncHistory(10),
    storage.getSyncOptions()
  ]);

  const successCount = history.filter(h => h.status === 'success').length;
  const failCount = history.filter(h => h.status === 'failed').length;

  return {
    isConfigured,
    isSyncing: isSyncing(),
    lastSyncTime,
    autoSync: options.autoSync,
    syncInterval: options.syncInterval,
    recentStats: {
      success: successCount,
      failed: failCount,
      total: history.length
    }
  };
}

/**
 * 팝업 동기화 (인사이트 새로고침 + 새 글 동기화)
 * - 14일 이내 게시글 인사이트 새로고침
 * - 마지막 동기화된 게시글 이후 새 글 동기화
 */
async function popupSync() {
  console.log('[Background] popupSync called');

  // Promise 기반 락: 이미 동기화 중이면 기존 작업 결과 반환
  if (syncPromise) {
    console.log('[Background] Sync already in progress, returning existing promise');
    return syncPromise;
  }

  const isConfigured = await storage.isConfigured();
  if (!isConfigured) {
    console.log('[Background] Not configured');
    return { success: false, message: '설정이 필요합니다' };
  }

  console.log('[Background] Starting doPopupSync...');

  // 실제 동기화 로직을 Promise로 래핑
  syncPromise = doPopupSync();

  try {
    const result = await syncPromise;
    console.log('[Background] doPopupSync completed:', result);
    return result;
  } finally {
    syncPromise = null;
  }
}

/**
 * 팝업 동기화 실제 로직
 */
async function doPopupSync() {
  let refreshedCount = 0;
  let syncedCount = 0;

  // Service Worker keep-alive: 긴 작업 중 종료 방지
  const keepAliveInterval = setInterval(() => {
    console.log('[Background] Keep-alive ping');
  }, 20000);

  try {
    console.log('[Background] doPopupSync started');
    const settings = await storage.getAllSettings();
    const mappings = await storage.getThreadPageMappings();
    console.log('[Background] Got settings and mappings:', mappings.length, 'posts');

    // === STEP 1: 14일 이내 게시글 인사이트 새로고침 ===
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const recentMappings = mappings.filter(m => {
      if (!m.postCreatedAt) return false;
      return new Date(m.postCreatedAt) >= fourteenDaysAgo;
    });

    console.log(`[Background] STEP 1: Refreshing insights for ${recentMappings.length} posts (last 14 days)`);
    log(`Refreshing insights for ${recentMappings.length} posts (last 14 days)`);

    for (const mapping of recentMappings) {
      try {
        const insights = await threadsApi.getThreadInsights(settings.threadsToken, mapping.threadId);
        await notionApi.updatePageStats(settings.notionSecret, mapping.notionPageId, insights, settings.fieldMapping || {});
        await storage.updateThreadInsights(mapping.threadId, insights);
        refreshedCount++;
        await sleep(350); // Rate limit
      } catch (err) {
        console.error(`Failed to refresh insights for ${mapping.threadId}:`, err);
      }
    }

    console.log(`[Background] STEP 1 completed: ${refreshedCount} posts refreshed`);

    // === STEP 2: 마지막 게시글 작성시간 이후 새 글 동기화 ===
    console.log('[Background] STEP 2: Checking for new posts to sync...');
    // 가장 최신 게시글의 작성시간 찾기
    let latestPostTime = null;
    for (const m of mappings) {
      if (m.postCreatedAt) {
        const postTime = new Date(m.postCreatedAt);
        if (!latestPostTime || postTime > latestPostTime) {
          latestPostTime = postTime;
        }
      }
    }

    log(`Latest synced post time: ${latestPostTime?.toISOString() || 'none'}`);

    // 본인 username 조회
    console.log('[Background] Verifying user identity...');
    const myUserResult = await threadsApi.testConnection(settings.threadsToken);
    if (!myUserResult.success) {
      throw new Error('Failed to verify user identity');
    }
    const myUsername = myUserResult.user?.username;
    console.log(`[Background] User verified: @${myUsername}`);

    // 최근 게시글 조회 (30개)
    console.log('[Background] Fetching recent threads...');
    const response = await threadsApi.getUserThreads(settings.threadsToken, { limit: 30 });
    const recentThreads = (response.data || [])
      .filter(t => !t.is_quote_post && t.media_type !== 'REPOST_FACADE')
      .map(threadsApi.normalizeThread);
    console.log(`[Background] Found ${recentThreads.length} recent threads`);

    for (const thread of recentThreads) {
      // 본인 글 체크
      if (thread.username !== myUsername) continue;

      // 이미 동기화된 글 스킵
      const alreadySynced = await storage.isThreadSynced(thread.id);
      if (alreadySynced) continue;

      // 마지막 게시글 이후인지 체크 (latestPostTime이 있으면)
      if (latestPostTime && thread.createdAt) {
        const threadTime = new Date(thread.createdAt);
        if (threadTime <= latestPostTime) continue;
      }

      // 동기화
      try {
        console.log(`[Background] Syncing new thread: ${thread.id}`);
        await syncThreadToNotion(thread, settings);
        await storage.addSyncedThreadId(thread.id);
        syncedCount++;
        log(`Synced new thread: ${thread.id}`);
        await sleep(350);
      } catch (err) {
        console.error(`Failed to sync thread ${thread.id}:`, err);
      }
    }

    console.log(`[Background] Popup sync complete: ${refreshedCount} refreshed, ${syncedCount} synced`);
    log(`Popup sync complete: ${refreshedCount} refreshed, ${syncedCount} synced`);

    return {
      success: true,
      refreshedCount,
      syncedCount,
      message: `인사이트 ${refreshedCount}개 새로고침, ${syncedCount}개 동기화`
    };
  } catch (error) {
    console.error('[Background] Popup sync error:', error);
    return { success: false, error: error.message };
  } finally {
    // keep-alive 정리
    clearInterval(keepAliveInterval);
    console.log('[Background] Keep-alive stopped');
  }
}

/**
 * 동기화 수행
 * @param {Object} options - { limit: number }
 */
async function performSync(options = {}) {
  const { limit = 30 } = options;

  // Promise 기반 락
  if (syncPromise) {
    return syncPromise;
  }

  const isConfigured = await storage.isConfigured();
  if (!isConfigured) {
    return { success: false, message: 'Please configure settings first' };
  }

  // 실제 동기화 로직을 Promise로 래핑
  syncPromise = doPerformSync(limit);

  try {
    return await syncPromise;
  } finally {
    syncPromise = null;
  }
}

/**
 * 동기화 실제 로직
 */
async function doPerformSync(limit) {
  let syncedCount = 0;
  let skippedCount = 0;
  let errors = [];

  try {
    const settings = await storage.getAllSettings();

    // 동기화 시작 시 현재 본인 username 조회 (매번 fresh하게)
    const myUserResult = await threadsApi.testConnection(settings.threadsToken);
    if (!myUserResult.success) {
      throw new Error('Failed to verify user identity: ' + (myUserResult.error || 'Unknown error'));
    }
    const myUsername = myUserResult.user?.username;
    if (!myUsername) {
      throw new Error('Failed to retrieve username from Threads API');
    }
    log(`Verified current user: @${myUsername}`);

    // 최근 게시글만 조회 (최신순)
    const response = await threadsApi.getUserThreads(settings.threadsToken, { limit });
    const recentThreads = (response.data || [])
      .filter(t => !t.is_quote_post && t.media_type !== 'REPOST_FACADE')
      .map(threadsApi.normalizeThread);

    log(`Found ${recentThreads.length} recent threads to check`);

    // 각 게시글을 Notion에 동기화 (ID 기반으로 이미 동기화된 글 스킵)
    for (const thread of recentThreads) {
      try {
        // 본인 글인지 검증
        if (thread.username !== myUsername) {
          console.warn(`Skipping thread ${thread.id}: belongs to @${thread.username}, not @${myUsername}`);
          skippedCount++;
          continue;
        }

        // 이미 동기화된 게시글인지 확인
        const alreadySynced = await storage.isThreadSynced(thread.id);
        if (alreadySynced) {
          log(`Thread ${thread.id} already synced, skipping`);
          skippedCount++;
          continue;
        }

        const result = await syncThreadToNotion(thread, settings);
        syncedCount++;

        // 동기화된 ID 저장
        await storage.addSyncedThreadId(thread.id);

        await storage.addSyncHistoryEntry({
          id: generateId(),
          threadId: thread.id,
          notionPageId: result.id,
          status: 'success',
          timestamp: formatDate(new Date()),
          title: thread.title
        });
      } catch (error) {
        console.error('Failed to sync thread:', thread.id, error);
        errors.push({ threadId: thread.id, error: error.message });

        await storage.addSyncHistoryEntry({
          id: generateId(),
          threadId: thread.id,
          notionPageId: null,
          status: 'failed',
          timestamp: formatDate(new Date()),
          error: error.message,
          title: thread.title
        });
      }
    }

    // 마지막 동기화 시간 업데이트
    await storage.setLastSyncTime(formatDate(new Date()));

    // 결과 알림
    if (syncedCount > 0) {
      showNotification(
        'Sync Complete',
        `${syncedCount} threads synced to Notion${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`,
        'success'
      );
    }

    return {
      success: true,
      syncedCount,
      skippedCount,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    console.error('Sync failed:', error);
    showNotification('Sync Failed', error.message, 'error');
    return { success: false, error: error.message };
  }
}

/**
 * 특정 날짜부터 동기화 (과거 게시글 동기화용)
 * @param {string|null} fromDate - ISO 날짜 문자열 (null이면 전체 동기화)
 */
async function syncFromDate(fromDate) {
  // Promise 기반 락
  if (syncPromise) {
    return syncPromise;
  }

  const isConfigured = await storage.isConfigured();
  if (!isConfigured) {
    return { success: false, message: 'Please configure settings first' };
  }

  // 실제 동기화 로직을 Promise로 래핑
  syncPromise = doSyncFromDate(fromDate);

  try {
    return await syncPromise;
  } finally {
    syncPromise = null;
  }
}

/**
 * 특정 날짜부터 동기화 실제 로직
 */
async function doSyncFromDate(fromDate) {
  let syncedCount = 0;
  let skippedCount = 0;
  let errors = [];

  try {
    const settings = await storage.getAllSettings();

    // 본인 username 조회
    const myUserResult = await threadsApi.testConnection(settings.threadsToken);
    if (!myUserResult.success) {
      throw new Error('Failed to verify user identity: ' + (myUserResult.error || 'Unknown error'));
    }
    const myUsername = myUserResult.user?.username;
    if (!myUsername) {
      throw new Error('Failed to retrieve username from Threads API');
    }
    log(`Verified current user: @${myUsername}`);

    // fromDate부터 게시글 조회 (null이면 전체) - 페이지네이션으로 모든 게시글 조회
    const threads = await threadsApi.getAllUserThreads(
      settings.threadsToken,
      { since: fromDate }
    );

    log(`Found ${threads.length} threads to sync from ${fromDate || 'the beginning'}`);

    // 각 게시글을 Notion에 동기화
    for (const thread of threads) {
      try {
        // 본인 글인지 검증
        if (thread.username !== myUsername) {
          console.warn(`Skipping thread ${thread.id}: belongs to @${thread.username}, not @${myUsername}`);
          skippedCount++;
          continue;
        }

        // 이미 동기화된 게시글인지 확인
        const alreadySynced = await storage.isThreadSynced(thread.id);
        if (alreadySynced) {
          log(`Thread ${thread.id} already synced, skipping`);
          skippedCount++;
          continue;
        }

        const result = await syncThreadToNotion(thread, settings);
        syncedCount++;

        // 동기화된 ID 저장
        await storage.addSyncedThreadId(thread.id);

        await storage.addSyncHistoryEntry({
          id: generateId(),
          threadId: thread.id,
          notionPageId: result.id,
          status: 'success',
          timestamp: formatDate(new Date()),
          title: thread.title
        });
      } catch (error) {
        console.error('Failed to sync thread:', thread.id, error);
        errors.push({ threadId: thread.id, error: error.message });
      }
    }

    // 마지막 동기화 시간 업데이트
    await storage.setLastSyncTime(formatDate(new Date()));

    // 결과 알림
    if (syncedCount > 0) {
      showNotification(
        'Sync Complete',
        `${syncedCount} threads synced to Notion${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`,
        'success'
      );
    }

    return {
      success: true,
      syncedCount,
      skippedCount,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    console.error('Sync from date failed:', error);
    showNotification('Sync Failed', error.message, 'error');
    return { success: false, error: error.message };
  }
}

/**
 * 단일 게시글을 Notion에 동기화
 */
async function syncThreadToNotion(thread, settings) {
  // 통계 데이터 조회
  const insights = await threadsApi.getThreadInsights(settings.threadsToken, thread.id);

  // 통계 데이터 병합
  const threadWithStats = {
    ...thread,
    views: insights.views,
    likes: insights.likes,
    replies: insights.replies,
    reposts: insights.reposts,
    quotes: insights.quotes,
    shares: insights.shares
  };

  const result = await notionApi.createPage(
    settings.notionSecret,
    settings.notionDbId,
    threadWithStats,
    settings.fieldMapping || getDefaultFieldMapping()
  );

  // threadId와 Notion pageId 매핑 저장 (통계 업데이트용, 인사이트 포함, 제목 포함)
  await storage.addThreadPageMapping(thread.id, result.id, thread.url, thread.createdAt, insights, thread.title);

  return result;
}

/**
 * 기본 필드 매핑
 */
function getDefaultFieldMapping() {
  return {
    title: 'Name',
    content: 'Content',
    createdAt: 'Created',
    sourceUrl: 'URL'
  };
}

/**
 * Content Script에서 새 글 감지 시 처리
 */
async function handleNewPostDetected(postData) {
  log('New post detected:', postData);

  const isConfigured = await storage.isConfigured();
  if (!isConfigured) {
    return { success: false, message: 'Not configured' };
  }

  const settings = await storage.getAllSettings();

  try {
    const result = await syncThreadToNotion(postData, settings);

    await storage.addSyncHistoryEntry({
      id: generateId(),
      threadId: postData.id,
      notionPageId: result.id,
      status: 'success',
      timestamp: formatDate(new Date())
    });

    showNotification(
      'Thread Synced',
      'Your thread has been saved to Notion',
      'success'
    );

    return { success: true, notionPageId: result.id };
  } catch (error) {
    await storage.addSyncHistoryEntry({
      id: generateId(),
      threadId: postData.id,
      notionPageId: null,
      status: 'failed',
      timestamp: formatDate(new Date()),
      error: error.message
    });

    showNotification('Sync Failed', error.message, 'error');
    return { success: false, error: error.message };
  }
}

/**
 * 토큰 자동 설정 (단기 → 장기 변환 또는 장기 토큰 만료일 설정)
 */
async function setupLongLivedToken(token, appSecret) {
  try {
    // 1. 먼저 토큰 교환 시도 (단기 토큰인 경우)
    log('Attempting to exchange token for long-lived token...');
    const result = await threadsApi.exchangeForLongLivedToken(token, appSecret);

    // 성공 = 단기 토큰이었음 → 새 장기 토큰 저장
    await storage.setThreadsToken(result.access_token);
    await storage.setThreadsAppSecret(appSecret);

    const expiresAt = Date.now() + (result.expires_in * 1000);
    await storage.setTokenExpiresAt(expiresAt);

    const remainingDays = Math.ceil(result.expires_in / (24 * 60 * 60));
    log(`Short-lived token exchanged to long-lived. Valid for ${remainingDays} days`);

    return {
      success: true,
      type: 'exchanged',
      newToken: result.access_token,
      remainingDays
    };
  } catch (error) {
    // 2. 실패 = 이미 장기 토큰 → 만료일 60일 설정
    log('Token exchange failed, assuming already long-lived token:', error.message);

    const sixtyDays = 60 * 24 * 60 * 60 * 1000;
    await storage.setTokenExpiresAt(Date.now() + sixtyDays);
    await storage.setThreadsAppSecret(appSecret);

    log('Long-lived token detected. Expiration set to 60 days');

    return {
      success: true,
      type: 'already_long_lived',
      remainingDays: 60
    };
  }
}

/**
 * 토큰 상태 조회
 */
async function getTokenStatus() {
  const token = await storage.getThreadsToken();
  const expiresAt = await storage.getTokenExpiresAt();
  const appSecret = await storage.getThreadsAppSecret();

  if (!token) {
    return { hasToken: false };
  }

  const remainingDays = expiresAt ? await storage.getTokenRemainingDays() : null;
  const isExpired = expiresAt ? await storage.isTokenExpired() : null;
  const isExpiringSoon = expiresAt ? await storage.isTokenExpiringSoon() : false;

  return {
    hasToken: true,
    hasAppSecret: !!appSecret,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    remainingDays,
    isExpired,
    isExpiringSoon
  };
}

/**
 * Notion 데이터베이스 목록 조회
 */
async function listNotionDatabases() {
  const settings = await storage.getAllSettings();

  if (!settings.notionSecret) {
    return { error: 'Notion Secret이 설정되지 않았습니다' };
  }

  try {
    return await notionApi.listDatabases(settings.notionSecret);
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * 연결 테스트
 */
async function testConnections() {
  const settings = await storage.getAllSettings();
  const results = { threads: null, notion: null };

  if (settings.threadsToken) {
    results.threads = await threadsApi.testConnection(settings.threadsToken);
  }

  if (settings.notionSecret) {
    results.notion = await notionApi.testConnection(settings.notionSecret);
  }

  return results;
}

/**
 * 일일 팔로워 수 기록
 */
async function recordDailyFollowers() {
  log('Recording daily followers count...');

  try {
    const settings = await storage.getAllSettings();
    if (!settings.threadsToken) {
      log('No token, skipping followers recording');
      return;
    }

    const followersCount = await getCachedFollowersCount(settings.threadsToken);
    if (followersCount > 0) {
      await storage.addFollowersHistoryEntry(followersCount);
      log(`Recorded daily followers: ${followersCount}`);
    }
  } catch (error) {
    console.error('Failed to record daily followers:', error);
  }
}

/**
 * 모든 동기화된 게시물의 통계 새로고침
 */
async function refreshAllPostsStats() {
  log('Starting daily stats refresh...');

  // 먼저 팔로워 수 기록
  await recordDailyFollowers();

  const isConfigured = await storage.isConfigured();
  if (!isConfigured) {
    log('Not configured, skipping stats refresh');
    return;
  }

  const settings = await storage.getAllSettings();
  const mappings = await storage.getThreadPageMappings();

  if (!mappings || mappings.length === 0) {
    log('No thread-page mappings found');
    return;
  }

  // 1. insights 없는 게시글 (백필 대상)
  const missingInsights = mappings.filter(m => !m.insights);

  // 2. 게시일 기준 7일 이내 게시글 (정기 새로고침)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentMappings = mappings.filter(m => {
    if (!m.postCreatedAt) return false;
    const postDate = new Date(m.postCreatedAt);
    return postDate >= sevenDaysAgo;
  });

  // 합쳐서 중복 제거
  const toRefresh = [...new Map(
    [...missingInsights, ...recentMappings].map(m => [m.threadId, m])
  ).values()];

  log(`Refresh targets: ${toRefresh.length} (missing: ${missingInsights.length}, recent 7d: ${recentMappings.length})`);

  if (toRefresh.length === 0) {
    log('No posts to refresh');
    return;
  }

  let updatedCount = 0;
  let errorCount = 0;

  for (const mapping of toRefresh) {
    try {
      // Threads API에서 최신 통계 조회
      const insights = await threadsApi.getThreadInsights(settings.threadsToken, mapping.threadId);

      // Notion 페이지 통계 업데이트
      await notionApi.updatePageStats(
        settings.notionSecret,
        mapping.notionPageId,
        insights,
        settings.fieldMapping || {}
      );

      // Storage 인사이트 업데이트 (대시보드용)
      await storage.updateThreadInsights(mapping.threadId, insights);

      updatedCount++;
      log(`Updated stats for thread ${mapping.threadId}`);

      // Rate limit 준수 (Notion API: 3 req/sec)
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error) {
      console.error(`Failed to update stats for thread ${mapping.threadId}:`, error);
      errorCount++;
    }
  }

  log(`Daily stats refresh complete: ${updatedCount} updated, ${errorCount} errors`);

  if (updatedCount > 0) {
    showNotification(
      '통계 새로고침 완료',
      `${updatedCount}개 게시물 통계가 업데이트되었습니다`,
      'success'
    );
  }
}

/**
 * 캐시된 팔로워 수 조회 (1분 TTL)
 * @param {string} token - Threads 액세스 토큰
 * @returns {Promise<number>}
 */
async function getCachedFollowersCount(token) {
  const now = Date.now();

  // 캐시가 유효하면 캐시된 값 반환
  if (now - followersCache.fetchedAt < FOLLOWERS_CACHE_TTL && followersCache.count > 0) {
    log('Using cached followers count:', followersCache.count);
    return followersCache.count;
  }

  // 캐시 만료 - API 호출
  try {
    const accountInsights = await threadsApi.getAccountInsights(token, { period: 7 });
    followersCache = {
      count: accountInsights.followers_count || 0,
      fetchedAt: now
    };
    log('Fetched fresh followers count:', followersCache.count);
    return followersCache.count;
  } catch (error) {
    console.warn('Failed to get followers count:', error);
    return followersCache.count || 0; // 실패 시 기존 캐시 반환
  }
}

/**
 * 요청 결합 래퍼 - 동일 period 요청 중복 방지
 * @param {number} period
 * @returns {Promise<Object>}
 */
async function getAggregatedInsightsWithCoalescing(period) {
  const cacheKey = `insights_${period}`;

  // 이미 진행 중인 요청이 있으면 재사용
  if (pendingInsightsRequests.has(cacheKey)) {
    log(`Reusing pending request for period ${period}`);
    return pendingInsightsRequests.get(cacheKey);
  }

  // 새 요청 생성 및 등록
  const promise = getAggregatedInsights(period);
  pendingInsightsRequests.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    pendingInsightsRequests.delete(cacheKey);
  }
}

/**
 * 통합 인사이트 API - 모든 기간 한 번에 조회
 * @returns {Promise<Object>} - { week, month, total, followers_count }
 */
async function getAllInsights() {
  const mappings = await storage.getThreadPageMappings();
  const settings = await storage.getAllSettings();

  // 기간별 집계를 한 번의 mappings 순회로 처리
  const week = aggregateByPeriod(mappings, 7);
  const month = aggregateByPeriod(mappings, 30);
  const total = aggregateByPeriod(mappings, 90);

  // 팔로워 수는 캐시된 값 사용
  let followers_count = 0;
  if (settings.threadsToken) {
    followers_count = await getCachedFollowersCount(settings.threadsToken);
  }

  return {
    week: { ...week, followers_count },
    month: { ...month, followers_count },
    total: { ...total, followers_count },
    followers_count
  };
}

/**
 * 기간별 인사이트 집계 (내부 헬퍼)
 * @param {Array} mappings
 * @param {number} period
 * @returns {Object}
 */
function aggregateByPeriod(mappings, period) {
  let filteredMappings = mappings;

  if (period !== 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - period);

    filteredMappings = mappings.filter(m => {
      if (!m.postCreatedAt) return true;
      return new Date(m.postCreatedAt) >= cutoffDate;
    });
  }

  const aggregated = {
    views: 0,
    likes: 0,
    replies: 0,
    reposts: 0,
    quotes: 0,
    shares: 0,
    postCount: filteredMappings.length,
    period
  };

  for (const mapping of filteredMappings) {
    if (mapping.insights) {
      aggregated.views += mapping.insights.views || 0;
      aggregated.likes += mapping.insights.likes || 0;
      aggregated.replies += mapping.insights.replies || 0;
      aggregated.reposts += mapping.insights.reposts || 0;
      aggregated.quotes += mapping.insights.quotes || 0;
      aggregated.shares += mapping.insights.shares || 0;
    }
  }

  return aggregated;
}

/**
 * Storage 기반 인사이트 집계 (대시보드용)
 * @param {number} period - 기간 (7, 30, 90=전체)
 * @returns {Promise<Object>} - 집계된 인사이트 데이터
 */
async function getAggregatedInsights(period) {
  const mappings = await storage.getThreadPageMappings();
  const aggregated = aggregateByPeriod(mappings, period);
  aggregated.fetchedAt = new Date().toISOString();

  // 팔로워 수는 캐시된 값 사용
  try {
    const settings = await storage.getAllSettings();
    if (settings.threadsToken) {
      aggregated.followers_count = await getCachedFollowersCount(settings.threadsToken);
    }
  } catch (error) {
    console.warn('Failed to get followers count:', error);
    aggregated.followers_count = 0;
  }

  log(`Aggregated insights (${period} days): ${aggregated.postCount} posts, ${aggregated.views} views`);

  return aggregated;
}

/**
 * 알림 표시
 */
function showNotification(title, message, type = 'info') {
  const iconPath = chrome.runtime.getURL('icons/icon48.png');

  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconPath,
    title: `Threads to Notion: ${title}`,
    message,
    priority: type === 'error' ? 2 : 1
  });
}

// 서비스 워커 활성화 로그
log('Threads to Notion Sync background service worker started');
