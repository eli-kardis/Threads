/**
 * 자정 특별 동기화 로직 (00:00 KST)
 * - 새 글 동기화
 * - 30일 인사이트 업데이트
 * - 90일 계정 인사이트
 * - 팔로워 확정 기록
 */

import * as threads from './threads-client.mjs';
import * as notion from './notion-client.mjs';
import { SYNC_CONFIG, RATE_LIMITS } from './config.mjs';

/**
 * 자정 동기화 실행
 * @param {Object} account - 계정 설정
 * @param {string} notionSecret - Notion API Secret
 * @param {Object} fieldMapping - 필드 매핑
 * @returns {Promise<Object>} - 결과
 */
export async function runMidnightSync(account, notionSecret, fieldMapping = {}) {
  console.log(`[Midnight] Starting special sync for account: ${account.name}`);

  const result = {
    account: account.id,
    syncedCount: 0,
    skippedCount: 0,
    updatedCount: 0,
    errors: [],
    followers: null,
    accountInsights: null
  };

  try {
    // 1. 사용자 정보 확인
    const userInfo = await threads.getUserInfo(account.threadsToken);
    console.log(`[Midnight] User: @${userInfo.username}`);

    // 2. 90일 계정 인사이트 조회
    try {
      result.accountInsights = await threads.getAccountInsights(
        account.threadsToken,
        SYNC_CONFIG.MIDNIGHT_ACCOUNT_DAYS
      );
      result.followers = result.accountInsights.followers_count;
      console.log(`[Midnight] Account insights (90d): views=${result.accountInsights.views}, followers=${result.followers}`);
    } catch (err) {
      console.warn(`[Midnight] Failed to get account insights:`, err.message);
    }

    // 3. 새 글 동기화 (매시간 동기화와 동일)
    const recentThreads = await threads.getAllUserThreads(account.threadsToken, {
      limit: SYNC_CONFIG.HOURLY_POST_LIMIT
    });
    console.log(`[Midnight] Found ${recentThreads.length} recent threads`);

    for (const thread of recentThreads) {
      if (thread.username !== userInfo.username) {
        result.skippedCount++;
        continue;
      }

      try {
        const existingPage = await notion.findPageBySourceUrl(
          notionSecret,
          account.notionDbId,
          thread.url,
          fieldMapping.sourceUrl || 'URL'
        );

        if (existingPage) {
          result.skippedCount++;
          continue;
        }

        const insights = await threads.getThreadInsights(account.threadsToken, thread.id);
        await threads.sleep(RATE_LIMITS.THREADS_DELAY_MS);

        await notion.createPage(
          notionSecret,
          account.notionDbId,
          thread,
          fieldMapping,
          insights
        );

        result.syncedCount++;
        console.log(`[Midnight] Synced: ${thread.id}`);
        await threads.sleep(RATE_LIMITS.NOTION_DELAY_MS);
      } catch (err) {
        console.error(`[Midnight] Error syncing ${thread.id}:`, err.message);
        result.errors.push({ threadId: thread.id, error: err.message });
      }
    }

    // 4. 30일 이내 게시글 인사이트 업데이트
    console.log(`[Midnight] Updating insights for posts in last ${SYNC_CONFIG.MIDNIGHT_INSIGHT_DAYS} days...`);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - SYNC_CONFIG.MIDNIGHT_INSIGHT_DAYS);
    const sinceDate = thirtyDaysAgo.toISOString().split('T')[0];

    const existingPages = await notion.queryAllPages(
      notionSecret,
      account.notionDbId,
      {
        dateField: fieldMapping.createdAt || 'Created',
        since: sinceDate,
        limit: 100
      }
    );

    console.log(`[Midnight] Found ${existingPages.length} pages to update`);

    for (const page of existingPages) {
      const pageUrl = notion.extractUrlFromPage(page, fieldMapping.sourceUrl || 'URL');
      if (!pageUrl) continue;

      // URL에서 thread ID 추출 (permalink format: https://www.threads.net/@username/post/...)
      const threadIdMatch = pageUrl.match(/\/post\/([^/?]+)/);
      if (!threadIdMatch) continue;

      const threadId = threadIdMatch[1];

      try {
        const insights = await threads.getThreadInsights(account.threadsToken, threadId);
        await threads.sleep(RATE_LIMITS.THREADS_DELAY_MS);

        await notion.updatePageStats(notionSecret, page.id, insights, fieldMapping);
        result.updatedCount++;

        await threads.sleep(RATE_LIMITS.NOTION_DELAY_MS);
      } catch (err) {
        console.warn(`[Midnight] Failed to update ${threadId}:`, err.message);
      }
    }

    console.log(`[Midnight] Completed: ${result.syncedCount} synced, ${result.updatedCount} updated, ${result.skippedCount} skipped`);
  } catch (error) {
    console.error(`[Midnight] Fatal error:`, error.message);
    result.errors.push({ fatal: true, error: error.message });
  }

  return result;
}
