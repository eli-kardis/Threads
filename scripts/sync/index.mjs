/**
 * Threads to Notion 동기화 엔트리포인트
 * GitHub Actions에서 실행
 */

import { loadAccounts, getNotionSecret, getSyncMode, validateConfig } from './config.mjs';
import { runHourlySync } from './hourly-sync.mjs';
import { runMidnightSync } from './midnight-sync.mjs';

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Threads to Notion Sync');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // 설정 검증
  const validation = validateConfig();
  if (!validation.valid) {
    console.error('Configuration errors:');
    validation.errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }

  const mode = getSyncMode();
  const accounts = loadAccounts();
  const notionSecret = getNotionSecret();

  console.log(`Mode: ${mode}`);
  console.log(`Accounts: ${accounts.length}`);
  console.log('-'.repeat(60));

  // 기본 필드 매핑 (Extension 설정과 동일하게 유지)
  const fieldMapping = {
    title: 'Name',
    content: 'Content',
    createdAt: 'Created',
    sourceUrl: 'URL',
    views: 'Views',
    likes: 'Likes',
    replies: 'Replies',
    reposts: 'Reposts',
    quotes: 'Quotes',
    shares: 'Shares',
    username: 'Username'
  };

  const results = [];

  // 각 계정에 대해 동기화 실행
  for (const account of accounts) {
    console.log(`\n>>> Processing account: ${account.name} (${account.id})`);

    let result;
    if (mode === 'midnight') {
      result = await runMidnightSync(account, notionSecret, fieldMapping);
    } else {
      result = await runHourlySync(account, notionSecret, fieldMapping);
    }

    results.push(result);
    console.log('-'.repeat(40));
  }

  // 결과 요약
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  let totalSynced = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  results.forEach(r => {
    totalSynced += r.syncedCount || 0;
    totalUpdated += r.updatedCount || 0;
    totalErrors += r.errors?.length || 0;

    console.log(`Account: ${r.account}`);
    console.log(`  - Synced: ${r.syncedCount || 0}`);
    if (r.updatedCount) console.log(`  - Updated: ${r.updatedCount}`);
    console.log(`  - Skipped: ${r.skippedCount || 0}`);
    console.log(`  - Errors: ${r.errors?.length || 0}`);
    if (r.followers) console.log(`  - Followers: ${r.followers}`);
    console.log('');
  });

  console.log('-'.repeat(60));
  console.log(`Total Synced: ${totalSynced}`);
  if (totalUpdated > 0) console.log(`Total Updated: ${totalUpdated}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log('='.repeat(60));

  // 에러가 있으면 종료 코드 1
  if (totalErrors > 0) {
    console.log('\nSync completed with errors');
    process.exit(1);
  }

  console.log('\nSync completed successfully');
}

// 실행
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
