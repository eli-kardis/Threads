/**
 * Threads 장기 토큰 자동 갱신
 * - Threads API로 토큰 갱신 (60일 연장)
 * - gh CLI로 GitHub Secrets 업데이트
 */

import { execFileSync } from 'child_process';

const REFRESH_URL = 'https://graph.threads.net/refresh_access_token';

const TOKEN_CONFIGS = [
  { envKey: 'THREADS_TOKEN_PRIMARY', secretName: 'THREADS_TOKEN_PRIMARY', label: 'Primary' },
  { envKey: 'THREADS_TOKEN_SECONDARY', secretName: 'THREADS_TOKEN_SECONDARY', label: 'Secondary' },
];

async function refreshToken(currentToken) {
  const url = `${REFRESH_URL}?grant_type=th_refresh_token&access_token=${currentToken}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

function updateGitHubSecret(secretName, value) {
  try {
    execFileSync('gh', ['secret', 'set', secretName], {
      input: value,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch (err) {
    console.error(`[TokenRefresh] Failed to update secret ${secretName}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('[TokenRefresh] Starting token refresh...');

  // GH_TOKEN 확인 (gh secret set에 필요)
  if (!process.env.GH_TOKEN) {
    console.error('[TokenRefresh] GH_TOKEN not set. Cannot update GitHub Secrets.');
    console.error('[TokenRefresh] Add GH_PAT secret (repo scope) to your repository.');
    process.exit(1);
  }

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;

  for (const config of TOKEN_CONFIGS) {
    const token = process.env[config.envKey];
    if (!token) {
      console.log(`[TokenRefresh] ${config.label}: not configured, skipping`);
      skipped++;
      continue;
    }

    try {
      const result = await refreshToken(token);
      const days = Math.floor(result.expiresIn / 86400);
      console.log(`[TokenRefresh] ${config.label}: refreshed (${days}일 유효)`);

      if (updateGitHubSecret(config.secretName, result.accessToken)) {
        console.log(`[TokenRefresh] ${config.label}: GitHub Secret updated`);
        refreshed++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`[TokenRefresh] ${config.label}: FAILED - ${err.message}`);
      if (err.message.includes('expired')) {
        console.error(`[TokenRefresh] ${config.label}: 토큰이 만료되었습니다. 수동으로 새 토큰을 발급받아 GitHub Secret에 등록해주세요.`);
      }
      failed++;
    }
  }

  console.log(`\n[TokenRefresh] Result: ${refreshed} refreshed, ${failed} failed, ${skipped} skipped`);

  // 모든 토큰이 실패한 경우에만 exit(1)
  if (failed > 0 && refreshed === 0 && skipped < TOKEN_CONFIGS.length) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[TokenRefresh] Fatal:', err);
  process.exit(1);
});
