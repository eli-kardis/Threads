/**
 * 매시간 동기화 로직 (01:00~23:00 KST)
 * - 팔로워 수 기록
 * - 새 글 동기화 (최근 10개)
 */

import * as threads from './threads-client.mjs';
import * as notion from './notion-client.mjs';
import { SYNC_CONFIG, RATE_LIMITS } from './config.mjs';

/**
 * 매시간 동기화 실행
 * @param {Object} account - 계정 설정
 * @param {string} notionSecret - Notion API Secret
 * @param {Object} fieldMapping - 필드 매핑 (기본값 사용)
 * @returns {Promise<Object>} - 결과
 */
export async function runHourlySync(account, notionSecret, fieldMapping = {}) {
  console.log(`[Hourly] Starting sync for account: ${account.name}`);

  const result = {
    account: account.id,
    syncedCount: 0,
    skippedCount: 0,
    errors: [],
    followers: null
  };

  try {
    // 1. 사용자 정보 확인
    const userInfo = await threads.getUserInfo(account.threadsToken);
    console.log(`[Hourly] User: @${userInfo.username}`);

    // 2. 팔로워 수 기록 (대시보드용)
    try {
      const accountInsights = await threads.getAccountInsights(account.threadsToken, 1);
      result.followers = accountInsights.followers_count;
      console.log(`[Hourly] Followers: ${result.followers}`);
    } catch (err) {
      console.warn(`[Hourly] Failed to get followers:`, err.message);
    }

    // 3. 최근 게시글 조회
    const recentThreads = await threads.getAllUserThreads(account.threadsToken, {
      limit: SYNC_CONFIG.HOURLY_POST_LIMIT
    });
    console.log(`[Hourly] Found ${recentThreads.length} recent threads`);

    // 4. 각 게시글 동기화
    for (const thread of recentThreads) {
      // 본인 글만 동기화
      if (thread.username !== userInfo.username) {
        result.skippedCount++;
        continue;
      }

      try {
        // Notion에서 중복 체크 (URL 기반)
        // URL 필드가 감지되지 않으면 중복 체크 건너뜀
        let existingPage = null;
        if (fieldMapping.sourceUrl) {
          existingPage = await notion.findPageBySourceUrl(
            notionSecret,
            account.notionDbId,
            thread.url,
            fieldMapping.sourceUrl
          );
        }

        if (existingPage) {
          result.skippedCount++;
          continue;
        }

        // 인사이트 조회
        const insights = await threads.getThreadInsights(account.threadsToken, thread.id);
        await threads.sleep(RATE_LIMITS.THREADS_DELAY_MS);

        // Notion에 페이지 생성
        await notion.createPage(
          notionSecret,
          account.notionDbId,
          thread,
          fieldMapping,
          insights
        );

        result.syncedCount++;
        console.log(`[Hourly] Synced: ${thread.id} - ${thread.title?.slice(0, 30)}...`);

        await threads.sleep(RATE_LIMITS.NOTION_DELAY_MS);
      } catch (err) {
        console.error(`[Hourly] Error syncing ${thread.id}:`, err.message);
        result.errors.push({ threadId: thread.id, error: err.message });
      }
    }

    console.log(`[Hourly] Completed: ${result.syncedCount} synced, ${result.skippedCount} skipped`);
  } catch (error) {
    console.error(`[Hourly] Fatal error:`, error.message);
    result.errors.push({ fatal: true, error: error.message });
  }

  return result;
}
