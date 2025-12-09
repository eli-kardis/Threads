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
}

/**
 * 알람 이벤트 핸들러
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncThreads') {
    await performSync();
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

    case 'GET_HASHTAG_FILTERS':
      return await storage.getHashtagFilters();

    case 'UPDATE_HASHTAG_FILTERS':
      await storage.setHashtagFilters(message.filters);
      return { success: true };

    case 'GET_SYNC_STATS':
      return await storage.getSyncStats();

    case 'LIST_DATABASES':
      return await listNotionDatabases();

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

    // 마지막 동기화 이후 새 게시글 조회
    const newThreads = await threadsApi.getNewThreadsSince(
      settings.threadsToken,
      lastSyncTime
    );

    console.log(`Found ${newThreads.length} new threads to sync`);

    // 각 게시글을 Notion에 동기화
    for (const thread of newThreads) {
      try {
        // 이미 동기화된 게시글인지 확인
        const alreadySynced = await storage.isThreadSynced(thread.id);
        if (alreadySynced) {
          console.log(`Thread ${thread.id} already synced, skipping`);
          skippedCount++;
          continue;
        }

        // 해시태그 필터 확인
        const shouldSync = await storage.shouldSyncPost(thread.hashtags || []);
        if (!shouldSync) {
          console.log(`Thread ${thread.id} filtered out by hashtag filter`);
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
 * 단일 게시글을 Notion에 동기화
 */
async function syncThreadToNotion(thread, settings) {
  return await notionApi.createPage(
    settings.notionSecret,
    settings.notionDbId,
    thread,
    settings.fieldMapping || getDefaultFieldMapping()
  );
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
 * 알림 표시
 */
function showNotification(title, message, type = 'info') {
  const iconPath = type === 'error'
    ? 'icons/icon48.png'
    : 'icons/icon48.png';

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
