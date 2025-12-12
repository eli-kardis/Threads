# Threads to Notion Sync - 수정 필요 이슈 목록

> 생성일: 2025-12-13
> 코드 리뷰 결과 발견된 이슈 중 아직 수정되지 않은 항목들

---

## Critical (즉시 수정 필요)

### 1. innerHTML XSS 취약점
- **파일**: `src/ui/options.js`
- **위치**: 90-96행, 106-113행, 129-135행, 263-269행, 349-355행, 726-733행, 740-748행
- **문제**: `innerHTML`을 사용하여 동적 콘텐츠 삽입 시 XSS 공격 가능
- **현재 코드**:
```javascript
oauthSection.innerHTML = `
  <div style="...">
    <p>User ID: ${data.threadsUserId || 'N/A'}</p>  // 위험!
  </div>
`;
```
- **해결 방안**: `textContent` 사용 또는 DOM API로 요소 생성
```javascript
const div = document.createElement('div');
const p = document.createElement('p');
p.textContent = `User ID: ${data.threadsUserId || 'N/A'}`;
div.appendChild(p);
oauthSection.replaceChildren(div);
```

---

## High (조기 수정 권장)

### 2. Race Condition - 동기화 상태 관리
- **파일**: `src/background.js`
- **위치**: 12행, 276행, 386행, 395행, 489행
- **문제**: `isSyncing` 플래그가 동시 요청 시 race condition 발생 가능
- **현재 코드**:
```javascript
let isSyncing = false;

async function performSync() {
  if (isSyncing) return;
  isSyncing = true;
  // ... 비동기 작업
  isSyncing = false;  // finally에서 설정되지만 race 가능
}
```
- **해결 방안**: Promise 기반 락 또는 AbortController 사용
```javascript
let syncPromise = null;

async function performSync() {
  if (syncPromise) {
    return syncPromise;  // 기존 작업 결과 반환
  }
  syncPromise = doSync();
  try {
    return await syncPromise;
  } finally {
    syncPromise = null;
  }
}
```

### 3. Storage 키 불일치
- **파일**: `src/ui/options.js` vs `src/storage/storage.js`
- **위치**: options.js 256행
- **문제**: `tokenExpiresAt` vs `threadsTokenExpiresAt` 키 불일치
- **현재 코드** (options.js):
```javascript
await chrome.storage.local.set({ tokenExpiresAt: expiresAt });
```
- **storage.js에서 사용하는 키**:
```javascript
THREADS_TOKEN_EXPIRES_AT: 'threadsTokenExpiresAt'
```
- **해결 방안**: 일관된 키 사용
```javascript
await chrome.storage.local.set({ threadsTokenExpiresAt: expiresAt });
```

### 4. 에러 처리 부재 - Notion API 필드 조회
- **파일**: `src/ui/options.js`
- **위치**: 500-511행
- **문제**: Notion API 호출 시 응답 검증 부재
- **현재 코드**:
```javascript
const response = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {...});
const database = await response.json();
const properties = database.properties;  // properties가 없으면 에러
```
- **해결 방안**:
```javascript
const database = await response.json();
if (!database.properties) {
  throw new Error('데이터베이스 속성을 찾을 수 없습니다');
}
const properties = database.properties;
```

---

## Medium (개선 권장)

### 5. 하드코딩된 Client ID/Secret
- **파일**: `src/ui/options.js`
- **위치**: 6-18행
- **문제**: OAuth 클라이언트 정보가 소스코드에 하드코딩됨
- **현재 코드**:
```javascript
const THREADS_OAUTH_CONFIG = {
  clientId: '1571587097603276',  // 하드코딩!
  ...
};
```
- **해결 방안**: 환경 변수 또는 별도 설정 파일 사용 (Chrome Extension의 경우 제한적)
- **대안**: 서버 프록시를 통한 토큰 교환 (현재 구현됨 - tokenServerUrl)

### 6. 무한 대기 가능성 - Rate Limit
- **파일**: `src/api/notion.js`
- **위치**: 21-32행
- **문제**: `waitForRateLimit()`에서 타임아웃 없이 무한 대기 가능
- **현재 코드**:
```javascript
async function waitForRateLimit() {
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < REQUEST_DELAY) {
    await new Promise(resolve => setTimeout(resolve, ...));  // 타임아웃 없음
  }
}
```
- **해결 방안**: 최대 대기 시간 설정
```javascript
const MAX_WAIT_TIME = 5000;
const waitTime = Math.min(REQUEST_DELAY - timeSinceLastRequest, MAX_WAIT_TIME);
```

### 7. 에러 메시지 노출
- **파일**: 여러 파일
- **문제**: 상세한 에러 메시지가 사용자에게 노출됨
- **예시**:
```javascript
showStatus('notionStatus', `연결 실패: ${error.message}`, 'error');
```
- **해결 방안**: 사용자 친화적 메시지 + 콘솔 로그 분리
```javascript
console.error('Connection failed:', error);
showStatus('notionStatus', '연결에 실패했습니다. 다시 시도해주세요.', 'error');
```

---

## Low (선택적 개선)

### 8. 미사용 변수/코드
- **파일**: `src/ui/options.js`
- **위치**: 54행
- **문제**: `currentSettings` 변수가 완전히 활용되지 않음

### 9. 콘솔 로그 정리
- **파일**: 전체
- **문제**: 프로덕션 환경에서 불필요한 `console.log` 존재
- **해결 방안**: 조건부 로깅 또는 로그 레벨 도입
```javascript
const DEBUG = false;
const log = DEBUG ? console.log.bind(console) : () => {};
```

### 10. 매직 넘버
- **파일**: `src/ui/dashboard.js`
- **위치**: 188행 (6), 224행 (3), 379행 (20)
- **문제**: 하드코딩된 숫자값
- **해결 방안**: 상수로 추출
```javascript
const CHART_DAYS = 7;
const MIN_POSTS_FOR_ANALYSIS = 3;
const MAX_HISTORY_DISPLAY = 20;
```

### 11. 타입 안전성
- **파일**: `src/api/threads.js`
- **위치**: 188행
- **문제**: `normalizeThread` 함수의 두 번째 파라미터 타입 검증 없음
```javascript
export function normalizeThread(apiThread, insights = null) {
  // insights가 객체인지 검증 없음
}
```

---

## 테스트 필요 영역

### 미테스트 파일 (테스트 커버리지 0%)
1. `src/background.js` - 핵심 비즈니스 로직
2. `src/ui/options.js` - OAuth 플로우
3. `src/ui/dashboard.js` - 차트 및 통계
4. `src/content.js` - DOM 조작

### 권장 테스트 케이스
```
[ ] OAuth 토큰 교환 성공/실패
[ ] 토큰 만료 시 자동 갱신
[ ] 동기화 중복 방지
[ ] Notion API rate limit 처리
[ ] 페이지네이션 무한 루프 방지
[ ] 잘못된 입력값 처리
```

---

## 수정 우선순위

| 순위 | 이슈 | 난이도 | 영향도 |
|-----|------|-------|-------|
| 1 | innerHTML XSS 취약점 | 중 | Critical |
| 2 | Storage 키 불일치 | 하 | High |
| 3 | Race Condition | 중 | High |
| 4 | Notion API 에러 처리 | 하 | High |
| 5 | Rate Limit 타임아웃 | 하 | Medium |
| 6 | 에러 메시지 정리 | 하 | Medium |
| 7 | 콘솔 로그 정리 | 하 | Low |
| 8 | 매직 넘버 상수화 | 하 | Low |

---

## 이미 수정 완료된 이슈

- [x] CSP 정책 추가
- [x] substr → slice 마이그레이션
- [x] Storage 배열 길이 버그
- [x] 페이지네이션 무한루프 방지
- [x] Content Script 메모리 누수
- [x] MutationObserver 정리
- [x] 토큰 만료 시간 검증
- [x] username 검증 강화
- [x] OAuth 취소 처리
- [x] Chart.js 메모리 누수
- [x] 토큰 갱신 재시도 로직
