/**
 * Notion 데이터베이스에서 중복 페이지 제거 (1회성 스크립트)
 * 원본 URL 기준으로 중복을 찾아 최신 것을 archive 처리
 *
 * Usage: NOTION_SECRET=xxx NOTION_DB=xxx node scripts/sync/dedup-pages.mjs
 */

const NOTION_API = 'https://api.notion.com/v1';

async function notionRequest(path, secret, options = {}) {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Notion API ${res.status}: ${err.message || JSON.stringify(err)}`);
  }
  return res.json();
}

async function queryAllPages(secret, dbId) {
  const pages = [];
  let cursor = null;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await notionRequest(`/databases/${dbId}/query`, secret, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages;
}

async function archivePage(secret, pageId) {
  return notionRequest(`/pages/${pageId}`, secret, {
    method: 'PATCH',
    body: JSON.stringify({ archived: true }),
  });
}

async function main() {
  const secret = process.env.NOTION_SECRET;
  const dbId = process.env.NOTION_DB || '2cc5d1fb528c817bb111d21d97e2f9ea';

  if (!secret) {
    console.error('NOTION_SECRET is required');
    process.exit(1);
  }

  console.log(`[Dedup] Querying all pages from DB: ${dbId}`);
  const pages = await queryAllPages(secret, dbId);
  console.log(`[Dedup] Total pages: ${pages.length}`);

  // URL 기준으로 그룹화
  const urlGroups = new Map();
  for (const page of pages) {
    const url = page.properties?.['원본 URL']?.url;
    if (!url) continue;
    if (!urlGroups.has(url)) urlGroups.set(url, []);
    urlGroups.get(url).push(page);
  }

  // 중복 찾기: 같은 URL에 2개 이상 있는 경우
  let archivedCount = 0;
  let errorCount = 0;

  for (const [url, group] of urlGroups) {
    if (group.length <= 1) continue;

    // created_time 기준 오래된 순 정렬 → 첫 번째(원본) 유지, 나머지 archive
    group.sort((a, b) => new Date(a.created_time) - new Date(b.created_time));
    const duplicates = group.slice(1);

    const title = group[0].properties?.['첫 줄']?.title?.[0]?.plain_text || '(no title)';
    console.log(`[Dedup] "${title}" — ${duplicates.length} duplicate(s)`);

    for (const dup of duplicates) {
      try {
        await archivePage(secret, dup.id);
        archivedCount++;
      } catch (err) {
        console.error(`[Dedup] Failed to archive ${dup.id}: ${err.message}`);
        errorCount++;
      }
    }
  }

  console.log(`\n[Dedup] Done: ${archivedCount} archived, ${errorCount} errors`);
}

main().catch(err => {
  console.error('[Dedup] Fatal:', err);
  process.exit(1);
});
