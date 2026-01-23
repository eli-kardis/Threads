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

// 팔로워 수 캐시 (1시간 유효 - 계정별 캐싱)
const FOLLOWERS_CACHE_TTL = 60 * 60 * 1000; // 1시간
const followersCacheByAccount = new Map(); // accountId -> { count, fetchedAt }

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
 * 참고: 백그라운드 동기화는 GitHub Actions에서 처리합니다.
 * Extension은 대시보드 표시 및 수동 동기화만 담당합니다.
 */
async function setupSyncAlarm() {
  // GitHub Actions가 백그라운드 동기화를 담당하므로 syncThreads 알람 제거
  chrome.alarms.clear('syncThreads');
  log('Sync alarm cleared (GitHub Actions handles background sync)');

  // 로컬 통계 새로고침은 필요시 유지 (Notion에서 최신 데이터 가져오기)
  const options = await storage.getSyncOptions();
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
 * 참고: syncThreads 알람은 GitHub Actions로 이전되었습니다.
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyStatsRefresh') {
    await refreshAllPostsStats();
  } else if (alarm.name === 'tokenRefreshCheck') {
    await checkAndRefreshToken();
  }
  // syncThreads 알람은 더 이상 처리하지 않음 (GitHub Actions에서 처리)
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
      // 계정별 캐시 우선 사용, forceRefresh면 Notion API 호출
      if (message.accountId) {
        const accounts = await storage.getAccounts();
        const account = accounts.find(a => a.id === message.accountId);

        if (account?.notionDbId) {
          // forceRefresh가 아니면 캐시 먼저 확인
          if (!message.forceRefresh) {
            const cached = await storage.getAccountThreadPageMappings(message.accountId);
            if (cached && cached.length > 0) {
              console.log(`[Dashboard] Using cached mappings for ${message.accountId}: ${cached.length} items`);
              return cached;
            }
          }

          // 캐시 없거나 forceRefresh → Notion API 호출 후 캐시 저장
          const mappings = await getThreadMappingsFromNotion(message.accountId);
          if (mappings.length > 0) {
            await storage.setAccountThreadPageMappings(message.accountId, mappings);
            console.log(`[Dashboard] Cached ${mappings.length} mappings for ${message.accountId}`);
          }
          return mappings;
        }
      }
      // 기존 방식: 로컬 스토리지에서 조회
      return await storage.getThreadPageMappings();

    case 'GET_FOLLOWERS_HISTORY':
      // 계정별 팔로워 히스토리 지원
      if (message.accountId) {
        return await storage.getAccountFollowersHistory(message.accountId, message.limit || 90);
      }
      return await storage.getFollowersHistory(message.limit || 90);

    case 'GET_FOLLOWERS_CHANGE_STATS':
      // 계정별 팔로워 변화 통계 지원
      if (message.accountId) {
        return await getAccountFollowersChangeStats(message.accountId);
      }
      return await storage.getFollowersChangeStats();

    case 'RECORD_FOLLOWERS_NOW':
      // 계정별 팔로워 기록 지원
      await recordDailyFollowers(message.accountId);
      return { success: true };

    case 'REFRESH_ACCOUNT_INSIGHTS':
      // 계정별 인사이트 새로고침 (계정 토큰 사용)
      return await refreshAccountInsights(message.accountId);

    // === 멀티 계정 관리 ===
    case 'GET_ACCOUNTS':
      return await storage.getAccounts();

    case 'GET_CURRENT_ACCOUNT_ID':
      return await storage.getCurrentAccountId();

    case 'SET_CURRENT_ACCOUNT':
      await storage.setCurrentAccountId(message.accountId);
      return { success: true };

    case 'GET_CURRENT_ACCOUNT':
      return await storage.getCurrentAccount();

    case 'SAVE_ACCOUNT':
      await storage.saveAccount(message.account);
      return { success: true };

    case 'REMOVE_ACCOUNT':
      await storage.removeAccount(message.accountId);
      return { success: true };

    // === 대시보드 캐시 관리 ===
    case 'GET_CACHED_DASHBOARD_DATA':
      return await storage.getCachedDashboardData(message.accountId);

    case 'SET_CACHED_DASHBOARD_DATA':
      await storage.setCachedDashboardData(message.accountId, message.data);
      return { success: true };

    case 'CLEAR_DASHBOARD_CACHE':
      await storage.clearDashboardCache();
      return { success: true };

    case 'MIGRATE_THREAD_IDS':
      return await migrateThreadIds(message.accountId);

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
 * 계정별 Notion DB에서 스레드 매핑 조회
 * @param {string} accountId - 계정 ID
 * @returns {Promise<Array>}
 */
async function getThreadMappingsFromNotion(accountId) {
  try {
    const [accounts, notionSecret] = await Promise.all([
      storage.getAccounts(),
      storage.getNotionSecret()
    ]);

    const account = accounts.find(a => a.id === accountId);
    if (!account || !account.notionDbId) {
      log(`No account or DB ID found for accountId: ${accountId}`);
      return [];
    }

    if (!notionSecret) {
      log('No Notion secret configured');
      return [];
    }

    console.log(`[Dashboard] Querying Notion DB ${account.notionDbId} for account ${accountId}`);

    // Notion API로 데이터베이스의 모든 페이지 조회 (무제한)
    let pages;
    try {
      pages = await notionApi.queryAllPages(notionSecret, account.notionDbId, { limit: Infinity });
    } catch (notionError) {
      console.error(`[Dashboard] Notion API error for DB ${account.notionDbId}:`, notionError.message);
      // 권한 오류인 경우 사용자에게 안내
      if (notionError.message.includes('Could not find database')) {
        console.error('[Dashboard] 해결방법: Notion에서 해당 데이터베이스를 열고 "..." → "연결 추가"에서 Integration을 추가하세요.');
      }
      return [];
    }

    console.log(`[Dashboard] Found ${pages.length} pages from Notion DB ${account.notionDbId}`);

    // 첫 번째 페이지의 프로퍼티 구조 로깅 (디버그용)
    if (pages.length > 0) {
      const sampleProps = pages[0].properties || {};
      console.log('[Dashboard] Sample page properties:', Object.keys(sampleProps).map(k => `${k}(${sampleProps[k].type})`));
    }

    // 매핑 형식으로 변환
    const mappings = pages.map(page => {
      const props = page.properties || {};

      // 필드 값 추출 헬퍼
      const getText = (prop) => {
        if (!prop) return '';
        if (prop.title) return prop.title[0]?.plain_text || '';
        if (prop.rich_text) return prop.rich_text[0]?.plain_text || '';
        if (prop.url) return prop.url || '';
        return '';
      };

      const getNumber = (prop) => {
        if (!prop) return 0;
        if (prop.number !== undefined) return prop.number || 0;
        return 0;
      };

      const getDate = (prop) => {
        if (!prop) return null;
        if (prop.date) return prop.date.start || null;
        if (prop.created_time) return prop.created_time || null;
        return null;
      };

      // 제목 필드 찾기 (title 타입)
      let title = '';
      for (const [key, val] of Object.entries(props)) {
        if (val.type === 'title') {
          title = getText(val);
          break;
        }
      }

      // URL 필드 찾기
      let sourceUrl = '';
      for (const [key, val] of Object.entries(props)) {
        if (val.type === 'url' || key.toLowerCase().includes('url') || key.toLowerCase().includes('링크')) {
          sourceUrl = getText(val);
          if (sourceUrl) break;
        }
      }

      // 날짜 필드 찾기
      let postCreatedAt = null;
      for (const [key, val] of Object.entries(props)) {
        if (val.type === 'date' || key.toLowerCase().includes('작성') || key.toLowerCase().includes('created') || key.toLowerCase().includes('날짜')) {
          postCreatedAt = getDate(val);
          if (postCreatedAt) break;
        }
      }

      // 인사이트 필드 찾기 (number 타입 필드 모두 검사)
      const insights = {
        views: 0,
        likes: 0,
        replies: 0,
        reposts: 0,
        quotes: 0,
        shares: 0
      };

      for (const [key, val] of Object.entries(props)) {
        if (val.type !== 'number') continue;

        const keyLower = key.toLowerCase();
        if (keyLower.includes('조회') || keyLower.includes('view')) {
          insights.views = getNumber(val);
        } else if (keyLower.includes('좋아요') || keyLower.includes('like')) {
          insights.likes = getNumber(val);
        } else if (keyLower.includes('답글') || keyLower.includes('댓글') || keyLower.includes('repl') || keyLower.includes('comment')) {
          insights.replies = getNumber(val);
        } else if (keyLower.includes('리포스트') || keyLower.includes('repost')) {
          insights.reposts = getNumber(val);
        } else if (keyLower.includes('인용') || keyLower.includes('quote')) {
          insights.quotes = getNumber(val);
        } else if (keyLower.includes('공유') || keyLower.includes('share')) {
          insights.shares = getNumber(val);
        }
      }

      // Thread ID 필드 찾기 (rich_text 타입, 숫자 ID)
      let threadId = null;
      for (const [key, val] of Object.entries(props)) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes('thread') && keyLower.includes('id')) {
          threadId = getText(val);
          if (threadId && /^\d+$/.test(threadId)) break;
        }
      }

      // threadId가 없거나 숫자가 아니면 URL에서 추출 (fallback)
      const fallbackThreadId = sourceUrl ? sourceUrl.split('/').pop() : page.id;

      return {
        notionPageId: page.id,
        title,
        sourceUrl,
        postCreatedAt: postCreatedAt || page.created_time,
        insights,
        threadId: (threadId && /^\d+$/.test(threadId)) ? threadId : fallbackThreadId
      };
    });

    // 인사이트 합계 로깅 (디버그용)
    const totalViews = mappings.reduce((sum, m) => sum + (m.insights?.views || 0), 0);
    console.log(`[Dashboard] Mappings: ${mappings.length}, Total views: ${totalViews}`);

    log(`Found ${mappings.length} pages from Notion DB`);
    return mappings;
  } catch (error) {
    console.error('Failed to get thread mappings from Notion:', error);
    return [];
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
 * 계정별 인사이트 새로고침 (해당 계정의 토큰 사용)
 * Threads API에서 게시글 목록을 가져와 Notion 페이지와 매칭
 * @param {string} accountId - 계정 ID
 * @returns {Promise<Object>}
 */
async function refreshAccountInsights(accountId) {
  console.log(`[Background] refreshAccountInsights for ${accountId}`);

  try {
    const [accounts, notionSecret] = await Promise.all([
      storage.getAccounts(),
      storage.getNotionSecret()
    ]);

    const account = accounts.find(a => a.id === accountId);
    if (!account) {
      return { success: false, error: '계정을 찾을 수 없습니다' };
    }

    if (!account.threadsToken) {
      return { success: false, error: '계정에 Threads 토큰이 설정되지 않았습니다' };
    }

    if (!account.notionDbId) {
      return { success: false, error: '계정에 Notion DB가 설정되지 않았습니다' };
    }

    // 1. Threads API에서 최근 게시글 가져오기 (permalink 포함)
    console.log(`[Background] Fetching threads from API...`);
    const threadsResponse = await threadsApi.getUserThreads(account.threadsToken, { limit: 50 });
    const threads = (threadsResponse.data || [])
      .filter(t => !t.is_quote_post && t.media_type !== 'REPOST_FACADE');
    console.log(`[Background] Found ${threads.length} threads from API`);

    if (threads.length === 0) {
      return { success: true, refreshedCount: 0, message: '게시글이 없습니다' };
    }

    // 2. Notion DB에서 페이지 가져오기
    const pages = await notionApi.queryAllPages(notionSecret, account.notionDbId, { limit: 200 });
    console.log(`[Background] Found ${pages.length} pages in Notion DB`);

    // 3. Notion 페이지의 URL을 맵으로 만들기 (URL -> pageId)
    const urlToPageMap = new Map();
    for (const page of pages) {
      const props = page.properties || {};
      for (const [key, val] of Object.entries(props)) {
        if (val.type === 'url' && val.url) {
          urlToPageMap.set(val.url, page.id);
          break;
        }
      }
    }
    console.log(`[Background] Built URL map with ${urlToPageMap.size} entries`);

    // 4. Notion 페이지의 Thread ID 맵 생성 (threadId -> pageId)
    const threadIdToPageMap = new Map();
    for (const page of pages) {
      const props = page.properties || {};

      // Thread ID 필드 찾기 (숫자 ID)
      let pageThreadId = null;
      for (const [key, val] of Object.entries(props)) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes('thread') && keyLower.includes('id')) {
          if (val.rich_text && val.rich_text[0]?.plain_text) {
            const tid = val.rich_text[0].plain_text;
            if (/^\d+$/.test(tid)) {
              pageThreadId = tid;
              break;
            }
          }
        }
      }

      if (pageThreadId) {
        threadIdToPageMap.set(pageThreadId, page.id);
      }
    }
    console.log(`[Background] Built Thread ID map with ${threadIdToPageMap.size} entries`);

    // 5. 각 Thread에 대해 인사이트 가져와서 Notion 업데이트
    let refreshedCount = 0;
    let errorCount = 0;

    const fieldMapping = {
      views: '조회수',
      likes: '좋아요',
      replies: '댓글',
      reposts: '리포스트',
      quotes: '인용',
      shares: '공유'
    };

    for (const thread of threads) {
      try {
        // 1순위: Thread ID로 Notion 페이지 찾기
        let targetPageId = threadIdToPageMap.get(String(thread.id));

        // 2순위: URL로 Notion 페이지 찾기 (fallback)
        if (!targetPageId) {
          const permalink = thread.permalink;
          targetPageId = urlToPageMap.get(permalink);

          if (!targetPageId) {
            // permalink 변형 시도 (www 유무, http/https)
            const altPermalinks = [
              permalink,
              permalink?.replace('www.', ''),
              permalink?.replace('https://', 'https://www.'),
            ].filter(Boolean);

            for (const alt of altPermalinks) {
              if (urlToPageMap.has(alt)) {
                targetPageId = urlToPageMap.get(alt);
                break;
              }
            }
          }
        }

        if (!targetPageId) {
          continue; // Notion에 없는 게시글은 스킵
        }

        // Threads API에서 인사이트 조회 (숫자 ID 사용)
        const insights = await threadsApi.getThreadInsights(account.threadsToken, thread.id);
        console.log(`[Background] Thread ${thread.id}: views=${insights.views}, likes=${insights.likes}`);

        // Notion 페이지 업데이트
        await notionApi.updatePageStats(notionSecret, targetPageId, insights, fieldMapping);
        refreshedCount++;

        // Rate limit
        await sleep(350);
      } catch (err) {
        console.error(`[Background] Failed to refresh thread ${thread.id}:`, err.message);
        errorCount++;
      }
    }

    // 캐시 무효화
    await storage.setAccountThreadPageMappings(accountId, []);

    console.log(`[Background] Account insights refresh complete: ${refreshedCount} updated, ${errorCount} errors`);

    return {
      success: true,
      refreshedCount,
      errorCount,
      message: `${refreshedCount}개 게시글 인사이트 업데이트 완료`
    };
  } catch (error) {
    console.error('[Background] refreshAccountInsights error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 일일 팔로워 수 기록 (계정별 지원)
 * @param {string} accountId - 계정 ID (없으면 전역)
 */
async function recordDailyFollowers(accountId) {
  log('Recording daily followers count...');

  try {
    // 계정별 토큰 사용
    let token = null;

    if (accountId) {
      const accounts = await storage.getAccounts();
      const account = accounts.find(a => a.id === accountId);
      if (account?.threadsToken) {
        token = account.threadsToken;
        log(`Using account-specific token for ${accountId}`);
      }
    }

    // 계정별 토큰이 없으면 전역 토큰 사용 (하위 호환)
    if (!token) {
      const settings = await storage.getAllSettings();
      token = settings.threadsToken;
    }

    if (!token) {
      log('No token, skipping followers recording');
      return;
    }

    const followersCount = await getCachedFollowersCount(token, accountId || 'default');
    if (followersCount > 0) {
      // 계정별 저장
      if (accountId) {
        await storage.addAccountFollowersHistoryEntry(accountId, followersCount);
        log(`Recorded daily followers for ${accountId}: ${followersCount}`);
      } else {
        // 전역 저장 (하위 호환)
        await storage.addFollowersHistoryEntry(followersCount);
        log(`Recorded daily followers: ${followersCount}`);
      }
    }
  } catch (error) {
    console.error('Failed to record daily followers:', error);
  }
}

/**
 * 계정별 팔로워 변화 통계 계산
 * @param {string} accountId
 * @returns {Promise<Object>}
 */
async function getAccountFollowersChangeStats(accountId) {
  const history = await storage.getAccountFollowersHistory(accountId, 365);

  // 현재 팔로워 수는 해당 계정의 토큰으로 조회
  let currentFromApi = 0;
  if (accountId) {
    const accounts = await storage.getAccounts();
    const account = accounts.find(a => a.id === accountId);
    if (account?.threadsToken) {
      try {
        currentFromApi = await getCachedFollowersCount(account.threadsToken, accountId);
      } catch (err) {
        console.warn(`Failed to get followers for ${accountId}:`, err);
      }
    }
  }

  if (!history || history.length === 0) {
    return {
      current: currentFromApi,
      today: { change: 0, percent: 0 },
      week: { change: 0, percent: 0 },
      month: { change: 0, percent: 0 },
      quarter: { change: 0, percent: 0 },
      halfYear: { change: 0, percent: 0 },
      year: { change: 0, percent: 0 }
    };
  }

  const current = currentFromApi > 0 ? currentFromApi : (history[0]?.count || 0);
  const today = new Date().toISOString().split('T')[0];

  // 오늘 변화량
  const todayEntry = history.find(h => h.date === today);
  const todayChange = todayEntry?.change || 0;

  // 7일 전 팔로워 수
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weekAgoDate = sevenDaysAgo.toISOString().split('T')[0];
  const weekAgoEntry = history.find(h => h.date <= weekAgoDate);
  const weekAgoCount = weekAgoEntry?.count || current;
  const weekChange = current - weekAgoCount;

  // 30일 전 팔로워 수
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const monthAgoDate = thirtyDaysAgo.toISOString().split('T')[0];
  const monthAgoEntry = history.find(h => h.date <= monthAgoDate);
  const monthAgoCount = monthAgoEntry?.count || current;
  const monthChange = current - monthAgoCount;

  // 90일 전 팔로워 수
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const quarterAgoDate = ninetyDaysAgo.toISOString().split('T')[0];
  const quarterAgoEntry = history.find(h => h.date <= quarterAgoDate);
  const quarterAgoCount = quarterAgoEntry?.count || current;
  const quarterChange = current - quarterAgoCount;

  // 180일 전 팔로워 수
  const oneEightyDaysAgo = new Date();
  oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);
  const halfYearAgoDate = oneEightyDaysAgo.toISOString().split('T')[0];
  const halfYearAgoEntry = history.find(h => h.date <= halfYearAgoDate);
  const halfYearAgoCount = halfYearAgoEntry?.count || current;
  const halfYearChange = current - halfYearAgoCount;

  // 365일(1년) 전 팔로워 수
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);
  const yearAgoDate = oneYearAgo.toISOString().split('T')[0];
  const yearAgoEntry = history.find(h => h.date <= yearAgoDate);
  const yearAgoCount = yearAgoEntry?.count || current;
  const yearChange = current - yearAgoCount;

  return {
    current,
    today: {
      change: todayChange,
      percent: weekAgoCount > 0 ? ((todayChange / weekAgoCount) * 100).toFixed(2) : 0
    },
    week: {
      change: weekChange,
      percent: weekAgoCount > 0 ? ((weekChange / weekAgoCount) * 100).toFixed(2) : 0
    },
    month: {
      change: monthChange,
      percent: monthAgoCount > 0 ? ((monthChange / monthAgoCount) * 100).toFixed(2) : 0
    },
    quarter: {
      change: quarterChange,
      percent: quarterAgoCount > 0 ? ((quarterChange / quarterAgoCount) * 100).toFixed(2) : 0
    },
    halfYear: {
      change: halfYearChange,
      percent: halfYearAgoCount > 0 ? ((halfYearChange / halfYearAgoCount) * 100).toFixed(2) : 0
    },
    year: {
      change: yearChange,
      percent: yearAgoCount > 0 ? ((yearChange / yearAgoCount) * 100).toFixed(2) : 0
    }
  };
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
 * 캐시된 팔로워 수 조회 (계정별 1시간 TTL)
 * @param {string} token - Threads 액세스 토큰
 * @param {string} accountId - 계정 ID (캐시 키)
 * @returns {Promise<number>}
 */
async function getCachedFollowersCount(token, accountId = 'default') {
  const now = Date.now();
  const cached = followersCacheByAccount.get(accountId);

  // 캐시가 유효하면 캐시된 값 반환
  if (cached && (now - cached.fetchedAt < FOLLOWERS_CACHE_TTL) && cached.count > 0) {
    log(`Using cached followers count for ${accountId}:`, cached.count);
    return cached.count;
  }

  // 캐시 만료 - API 호출
  try {
    const accountInsights = await threadsApi.getAccountInsights(token, { period: 7 });
    const newCache = {
      count: accountInsights.followers_count || 0,
      fetchedAt: now
    };
    followersCacheByAccount.set(accountId, newCache);
    log(`Fetched fresh followers count for ${accountId}:`, newCache.count);
    return newCache.count;
  } catch (error) {
    console.warn(`Failed to get followers count for ${accountId}:`, error);
    return cached?.count || 0; // 실패 시 기존 캐시 반환
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

  // 팔로워 수는 캐시된 값 사용 (전역 설정용)
  let followers_count = 0;
  if (settings.threadsToken) {
    followers_count = await getCachedFollowersCount(settings.threadsToken, 'default');
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

  // 팔로워 수는 캐시된 값 사용 (전역 설정용)
  try {
    const settings = await storage.getAllSettings();
    if (settings.threadsToken) {
      aggregated.followers_count = await getCachedFollowersCount(settings.threadsToken, 'default');
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

/**
 * 기존 Notion 페이지에 Thread ID 마이그레이션
 * Threads API에서 게시글 목록을 가져와 URL 매칭으로 Thread ID 업데이트
 * @param {string} accountId - 계정 ID
 * @returns {Promise<Object>}
 */
async function migrateThreadIds(accountId) {
  console.log(`[Background] migrateThreadIds for ${accountId}`);

  try {
    const [accounts, notionSecret, fieldMapping] = await Promise.all([
      storage.getAccounts(),
      storage.getNotionSecret(),
      storage.getFieldMapping()
    ]);

    const account = accounts.find(a => a.id === accountId);
    if (!account) {
      return { success: false, error: '계정을 찾을 수 없습니다' };
    }

    if (!account.threadsToken) {
      return { success: false, error: '계정에 Threads 토큰이 설정되지 않았습니다' };
    }

    if (!account.notionDbId) {
      return { success: false, error: '계정에 Notion DB가 설정되지 않았습니다' };
    }

    // Thread ID 필드 이름 확인
    const threadIdFieldName = fieldMapping?.threadId;
    if (!threadIdFieldName) {
      return { success: false, error: 'Thread ID 필드 매핑이 설정되지 않았습니다. 설정 페이지에서 Thread ID 필드를 매핑해주세요.' };
    }

    // 1. Threads API에서 모든 게시글 가져오기 (숫자 ID 포함)
    console.log(`[Background] Fetching all threads from API...`);
    const threads = await threadsApi.getAllUserThreads(account.threadsToken, { since: null });
    console.log(`[Background] Found ${threads.length} threads from API`);

    if (threads.length === 0) {
      return { success: true, migratedCount: 0, message: '게시글이 없습니다' };
    }

    // 2. Notion DB에서 모든 페이지 가져오기
    const pages = await notionApi.queryAllPages(notionSecret, account.notionDbId, { limit: Infinity });
    console.log(`[Background] Found ${pages.length} pages in Notion DB`);

    // 3. URL -> Thread(숫자 ID) 맵 생성
    const urlToThreadMap = new Map();
    for (const thread of threads) {
      if (thread.permalink) {
        // URL 정규화 (www 유무, 트레일링 슬래시 등)
        const normalizedUrl = thread.permalink.replace(/\/$/, '');
        urlToThreadMap.set(normalizedUrl, thread);
        // www 없는 버전도 추가
        urlToThreadMap.set(normalizedUrl.replace('www.', ''), thread);
        // www 있는 버전도 추가
        if (!normalizedUrl.includes('www.')) {
          urlToThreadMap.set(normalizedUrl.replace('https://', 'https://www.'), thread);
        }
      }
    }
    console.log(`[Background] Built URL map with ${urlToThreadMap.size} entries`);

    // 4. 각 Notion 페이지에 대해 Thread ID 업데이트
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const page of pages) {
      try {
        const props = page.properties || {};

        // 이미 Thread ID가 있는지 확인
        let existingThreadId = '';
        for (const [key, val] of Object.entries(props)) {
          if (key === threadIdFieldName || key.toLowerCase().includes('thread') && key.toLowerCase().includes('id')) {
            if (val.rich_text && val.rich_text[0]?.plain_text) {
              existingThreadId = val.rich_text[0].plain_text;
            }
            break;
          }
        }

        // 이미 숫자 형태의 Thread ID가 있으면 스킵
        if (existingThreadId && /^\d+$/.test(existingThreadId)) {
          skippedCount++;
          continue;
        }

        // URL 필드 찾기
        let pageUrl = '';
        for (const [key, val] of Object.entries(props)) {
          if (val.type === 'url' && val.url) {
            pageUrl = val.url.replace(/\/$/, '');
            break;
          }
        }

        if (!pageUrl) {
          skippedCount++;
          continue;
        }

        // URL로 Thread 찾기
        const thread = urlToThreadMap.get(pageUrl) ||
                       urlToThreadMap.get(pageUrl.replace('www.', '')) ||
                       urlToThreadMap.get(pageUrl.replace('https://', 'https://www.'));

        if (!thread) {
          skippedCount++;
          continue;
        }

        // Thread ID 업데이트
        const updateProps = {
          [threadIdFieldName]: {
            rich_text: [{ text: { content: String(thread.id) } }]
          }
        };

        await notionApi.updatePage(notionSecret, page.id, updateProps);
        migratedCount++;
        console.log(`[Background] Migrated Thread ID ${thread.id} for page ${page.id}`);

        // Rate limit
        await sleep(350);
      } catch (err) {
        console.error(`[Background] Failed to migrate page ${page.id}:`, err.message);
        errorCount++;
      }
    }

    console.log(`[Background] Migration complete: ${migratedCount} migrated, ${skippedCount} skipped, ${errorCount} errors`);

    return {
      success: true,
      migratedCount,
      skippedCount,
      errorCount,
      message: `${migratedCount}개 페이지에 Thread ID 추가 완료 (${skippedCount}개 스킵, ${errorCount}개 오류)`
    };
  } catch (error) {
    console.error('[Background] migrateThreadIds error:', error);
    return { success: false, error: error.message };
  }
}

// 서비스 워커 활성화 로그
log('Threads to Notion Sync background service worker started');
