/**
 * 환경변수 로드 및 설정 관리
 */

/**
 * 계정 설정 로드
 * @returns {Object[]} accounts - 계정 배열
 */
export function loadAccounts() {
  const accounts = [];

  // Primary 계정
  if (process.env.THREADS_TOKEN_PRIMARY && process.env.NOTION_DB_PRIMARY) {
    accounts.push({
      id: 'primary',
      name: 'Primary',
      threadsToken: process.env.THREADS_TOKEN_PRIMARY,
      notionDbId: process.env.NOTION_DB_PRIMARY,
    });
  }

  // Secondary 계정
  if (process.env.THREADS_TOKEN_SECONDARY && process.env.NOTION_DB_SECONDARY) {
    accounts.push({
      id: 'secondary',
      name: 'Secondary',
      threadsToken: process.env.THREADS_TOKEN_SECONDARY,
      notionDbId: process.env.NOTION_DB_SECONDARY,
    });
  }

  return accounts;
}

/**
 * Notion 시크릿 로드 (공유)
 * @returns {string|null}
 */
export function getNotionSecret() {
  return process.env.NOTION_SECRET || null;
}

/**
 * 동기화 모드 파싱
 * @returns {'hourly' | 'midnight'}
 */
export function getSyncMode() {
  const args = process.argv.slice(2);
  const modeArg = args.find(arg => arg.startsWith('--mode='));

  if (modeArg) {
    const mode = modeArg.split('=')[1];
    if (mode === 'midnight') return 'midnight';
  }

  return 'hourly';
}

/**
 * 설정 검증
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateConfig() {
  const errors = [];

  if (!process.env.NOTION_SECRET) {
    errors.push('NOTION_SECRET is required');
  }

  const accounts = loadAccounts();
  if (accounts.length === 0) {
    errors.push('At least one account (THREADS_TOKEN_* + NOTION_DB_*) is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Rate limit 설정
 */
export const RATE_LIMITS = {
  NOTION_DELAY_MS: 350,      // Notion: ~3 req/sec
  THREADS_DELAY_MS: 200,     // Threads: 안전 마진
};

/**
 * 동기화 설정
 */
export const SYNC_CONFIG = {
  HOURLY_POST_LIMIT: 10,           // 동기화: 최근 10개 확인
  MIDNIGHT_INSIGHT_DAYS: 30,       // 자정: 30일 인사이트 업데이트
  MAX_PAGINATION_PAGES: 50,        // 최대 페이지네이션
};
