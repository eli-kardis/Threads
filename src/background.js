/**
 * 백그라운드 서비스 워커
 * 확장 프로그램의 핵심 로직 수행
 */

import * as storage from './storage/storage.js';
import * as notionApi from './api/notion.js';
import * as threadsApi from './api/threads.js';
import { generateId, formatDate } from './shared/utils.js';

// 동기화 상태
let isSyncing = false;

/**
 * 확장 프로그램 설치/업데이트 시 초기화
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Threads to Notion Sync installed:', details.reason);

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
    console.log('Sync alarm set:', options.syncInterval, 'minutes');
  } else {
    chrome.alarms.clear('syncThreads');
    console.log('Sync alarm cleared');
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
    console.log('Daily stats refresh alarm set for:', next9am.toLocaleString());
  } else {
    chrome.alarms.clear('dailyStatsRefresh');
    console.log('Daily stats refresh alarm cleared');
  }
}

/**
 * 토큰 갱신 체크 알람 설정 (매일 한 번)
 */
async function setupTokenRefreshAlarm() {
  chrome.alarms.create('tokenRefreshCheck', {
    periodInMinutes: 24 * 60 // 24시간마다
  });
  console.log('Token refresh check alarm set');
}

/**
 * 토큰 만료 체크 및 자동 갱신
 */
async function checkAndRefreshToken() {
  console.log('Checking token expiration...');

  const token = await storage.getThreadsToken();
  if (!token) {
    console.log('No token configured');
    return { success: false, reason: 'no_token' };
  }

  // 만료 7일 이내인지 확인
  const isExpiringSoon = await storage.isTokenExpiringSoon();
  if (!isExpiringSoon) {
    const remainingDays = await storage.getTokenRemainingDays();
    console.log(`Token is still valid (${remainingDays} days remaining)`);
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

  try {
    console.log('Refreshing long-lived token...');
    const result = await threadsApi.refreshLongLivedToken(token);

    // 새 토큰 저장
    await storage.setThreadsToken(result.access_token);

    // 만료 시간 저장 (현재 시간 + expires_in 초)
    const expiresAt = Date.now() + (result.expires_in * 1000);
    await storage.setTokenExpiresAt(expiresAt);

    const newRemainingDays = Math.ceil(result.expires_in / (24 * 60 * 60));
    console.log(`Token refreshed successfully. Valid for ${newRemainingDays} days`);

    showNotification(
      '토큰 갱신 완료',
      `액세스 토큰이 갱신되었습니다. (${newRemainingDays}일 유효)`,
      'success'
    );

    return { success: true, reason: 'refreshed', expiresIn: result.expires_in };
  } catch (error) {
    console.error('Token refresh failed:', error);
    showNotification(
      '토큰 갱신 실패',
      `토큰 갱신 중 오류가 발생했습니다: ${error.message}`,
      'error'
    );
    return { success: false, reason: 'refresh_failed', error: error.message };
  }
}

/**
 * 알람 이벤트 핸들러
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncThreads') {
    await performSync();
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
      return await performSync();

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
      return await getAccountInsightsData(message.period || 7);

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
    isSyncing,
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
 * 동기화 수행
 */
async function performSync() {
  if (isSyncing) {
    return { success: false, message: 'Sync already in progress' };
  }

  const isConfigured = await storage.isConfigured();
  if (!isConfigured) {
    return { success: false, message: 'Please configure settings first' };
  }

  isSyncing = true;
  let syncedCount = 0;
  let skippedCount = 0;
  let errors = [];

  try {
    const settings = await storage.getAllSettings();
    const lastSyncTime = await storage.getLastSyncTime();

    // 동기화 시작 시 현재 본인 username 조회 (매번 fresh하게)
    const myUserResult = await threadsApi.testConnection(settings.threadsToken);
    if (!myUserResult.success) {
      throw new Error('Failed to verify user identity: ' + (myUserResult.error || 'Unknown error'));
    }
    const myUsername = myUserResult.user?.username;
    console.log(`Verified current user: @${myUsername}`);

    // 마지막 동기화 이후 새 게시글 조회 (페이지네이션으로 전체)
    const newThreads = await threadsApi.getAllUserThreads(
      settings.threadsToken,
      { since: lastSyncTime }
    );

    console.log(`Found ${newThreads.length} new threads to sync`);

    // 각 게시글을 Notion에 동기화
    for (const thread of newThreads) {
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
          console.log(`Thread ${thread.id} already synced, skipping`);
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
  } finally {
    isSyncing = false;
  }
}

/**
 * 특정 날짜부터 동기화 (과거 게시글 동기화용)
 * @param {string|null} fromDate - ISO 날짜 문자열 (null이면 전체 동기화)
 */
async function syncFromDate(fromDate) {
  if (isSyncing) {
    return { success: false, message: 'Sync already in progress' };
  }

  const isConfigured = await storage.isConfigured();
  if (!isConfigured) {
    return { success: false, message: 'Please configure settings first' };
  }

  isSyncing = true;
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
    console.log(`Verified current user: @${myUsername}`);

    // fromDate부터 게시글 조회 (null이면 전체) - 페이지네이션으로 모든 게시글 조회
    const threads = await threadsApi.getAllUserThreads(
      settings.threadsToken,
      { since: fromDate }
    );

    console.log(`Found ${threads.length} threads to sync from ${fromDate || 'the beginning'}`);

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
          console.log(`Thread ${thread.id} already synced, skipping`);
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
  } finally {
    isSyncing = false;
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
    quotes: insights.quotes
  };

  const result = await notionApi.createPage(
    settings.notionSecret,
    settings.notionDbId,
    threadWithStats,
    settings.fieldMapping || getDefaultFieldMapping()
  );

  // threadId와 Notion pageId 매핑 저장 (통계 업데이트용)
  await storage.addThreadPageMapping(thread.id, result.id, thread.url, thread.createdAt);

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
  console.log('New post detected:', postData);

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
    console.log('Attempting to exchange token for long-lived token...');
    const result = await threadsApi.exchangeForLongLivedToken(token, appSecret);

    // 성공 = 단기 토큰이었음 → 새 장기 토큰 저장
    await storage.setThreadsToken(result.access_token);
    await storage.setThreadsAppSecret(appSecret);

    const expiresAt = Date.now() + (result.expires_in * 1000);
    await storage.setTokenExpiresAt(expiresAt);

    const remainingDays = Math.ceil(result.expires_in / (24 * 60 * 60));
    console.log(`Short-lived token exchanged to long-lived. Valid for ${remainingDays} days`);

    return {
      success: true,
      type: 'exchanged',
      newToken: result.access_token,
      remainingDays
    };
  } catch (error) {
    // 2. 실패 = 이미 장기 토큰 → 만료일 60일 설정
    console.log('Token exchange failed, assuming already long-lived token:', error.message);

    const sixtyDays = 60 * 24 * 60 * 60 * 1000;
    await storage.setTokenExpiresAt(Date.now() + sixtyDays);
    await storage.setThreadsAppSecret(appSecret);

    console.log('Long-lived token detected. Expiration set to 60 days');

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
 * 모든 동기화된 게시물의 통계 새로고침
 */
async function refreshAllPostsStats() {
  console.log('Starting daily stats refresh...');

  const isConfigured = await storage.isConfigured();
  if (!isConfigured) {
    console.log('Not configured, skipping stats refresh');
    return;
  }

  const settings = await storage.getAllSettings();
  const mappings = await storage.getThreadPageMappings();

  if (!mappings || mappings.length === 0) {
    console.log('No thread-page mappings found');
    return;
  }

  // 게시일 기준 30일 이내 게시글만 필터링 (인사이트 대시보드용)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentMappings = mappings.filter(m => {
    if (!m.postCreatedAt) return true; // 기존 데이터(postCreatedAt 없음)는 일단 포함
    return new Date(m.postCreatedAt) >= thirtyDaysAgo;
  });

  console.log(`Filtering: ${mappings.length} total -> ${recentMappings.length} within 30 days`);

  if (recentMappings.length === 0) {
    console.log('No recent posts to refresh (all posts are older than 30 days)');
    return;
  }

  let updatedCount = 0;
  let errorCount = 0;

  for (const mapping of recentMappings) {
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

      updatedCount++;
      console.log(`Updated stats for thread ${mapping.threadId}`);

      // Rate limit 준수 (Notion API: 3 req/sec)
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error) {
      console.error(`Failed to update stats for thread ${mapping.threadId}:`, error);
      errorCount++;
    }
  }

  console.log(`Daily stats refresh complete: ${updatedCount} updated, ${errorCount} errors`);

  if (updatedCount > 0) {
    showNotification(
      '통계 새로고침 완료',
      `${updatedCount}개 게시물 통계가 업데이트되었습니다`,
      'success'
    );
  }
}

/**
 * 계정 전체 인사이트 데이터 조회
 * @param {number} period - 기간 (7, 14, 30, 90일)
 */
async function getAccountInsightsData(period) {
  const isConfigured = await storage.isConfigured();
  if (!isConfigured) {
    return { error: 'Not configured' };
  }

  const settings = await storage.getAllSettings();
  const insights = await threadsApi.getAccountInsights(settings.threadsToken, { period });

  return insights;
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
console.log('Threads to Notion Sync background service worker started');
