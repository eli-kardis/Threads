# No More Guess — SaaS 설계 스펙

## 컨셉

- **영어**: No More Guess
- **한국어**: 모르고 쓰던 어제, 알고 쓰는 오늘
- **미션**: 크리에이터가 확신을 갖고 글을 쓰게 한다
- **비전**: Threads 크리에이터가 매주 자기 글이 어디로 가고 있는지 보면서, 다음 한 걸음을 확신하는 세상

## 타겟

Threads로 비즈니스하는 1인 크리에이터 (팔로워 1K~100K).
퍼스널 브랜딩을 무기로 비즈니스를 이끌어가려는 사람.

**핵심 고통:**
- 뭘 써야 할지 모른다
- 왜 됐고 왜 안 됐는지 모른다
- 글쓰기와 비즈니스가 연결되지 않는다
- 데이터를 봐도 해석할 수 없어서, 결국 감으로 돌아간다

**인사이트:** 크리에이터는 분석가가 되고 싶은 게 아니라, 글을 잘 쓰고 싶을 뿐이다.

## 경쟁 포지셔닝

| 경쟁자 | 하는 것 | 안 하는 것 |
|--------|---------|-----------|
| 분석 도구 (무료) | 숫자를 보여줌 | 해석, 행동 제안 |
| 범용 AI | 맞춤 답 가능 | 내 데이터를 모름, 매번 맥락 설명 필요 |

**빈 자리:** 내 글 패턴과 성과를 꿰고 있으면서, 다음에 뭘 써야 하는지 알아서 알려주는 곳이 없다.

## 핵심 기능

### 1. 자동 데이터 수집

- Threads 로그인(OAuth) 즉시 최근 100개 게시글 우선 수집 → 첫 진단 리포트 생성 → 나머지는 백그라운드에서 전체 수집
- 이후 신규 게시글 자동 수집 (주기적 동기화)
- 수집 데이터: 텍스트, 미디어 타입, 조회수, 좋아요, 댓글, 리포스트, 인용, 게시 시간, 해시태그
- 참고: Threads API의 `shares` 메트릭은 반환이 불확실하므로 MVP에서 제외. 확산력은 리포스트+인용 기준으로 측정

### 2. 첫 진단 리포트 (무료)

가입 즉시 제공. 과거 데이터 기반으로:

- **"너 이런 크리에이터야"** — 글 패턴 분류 (주제, 길이, 형식, 시간대)
- **기준선 산출** — 본인 평균 조회수, 참여율, 상위 20% 기준값
- **잘 된 글 분석** — 상위 성과 글의 공통 패턴
- **목표 추천** — 데이터 기반으로 4가지 목표 중 맞는 것 추천

**목표 추천 로직:**
- 참여율이 본인 평균 대비 높은 편 → "참여 유도" 추천
- 조회수는 높은데 참여율이 낮은 편 → "도달 확대" 추천 (이미 강한 영역 강화)
- 리포스트+인용 비율이 높은 편 → "확산력" 추천
- 위 어느 것도 두드러지지 않으면 → "팔로워 성장" 기본 추천

목적: 첫 경험에서 즉시 가치 체감 → "이걸 매주 받고 싶으면 구독" 전환 유도

### 3. 목표 설정

4가지 목표 중 1개 선택 (월 단위 고정):

| 목표 | "잘 됐다" 기준 |
|------|---------------|
| 도달 확대 | 조회수가 내 평균 대비 높은 글 |
| 팔로워 성장 | 게시 전후 팔로워 변화가 큰 시점의 글 |
| 참여 유도 | (좋아요+댓글+리포스트) / 조회수 비율이 높은 글 |
| 확산력 | 리포스트+인용 수가 높은 글 |

- 기준은 **절대값이 아니라 본인 평균 대비 상대값**
- 첫 진단에서 서비스가 목표 추천
- 월초에 목표 유지 or 변경 가능
- 글이 쌓일수록 기준선 자동 업데이트

### 4. 주간 AI 리포트 (유료)

매주 자동 생성. 목표 기준으로:

**분석 파트:**
- 이번 주 올린 글 중 목표 기준 상위/하위 분류
- 상위 글의 공통 패턴 (주제, 형식, 길이, 시간대)
- 하위 글과의 차이점
- 최근 추세 변화 (이전 주 대비)

**AI 가이드 파트 (LLM 생성):**
- 구체적 다음 행동 제안 (주제 + 형식 + 예시 문장)
- LLM에 제공하는 컨텍스트:
  - 상위 글 패턴 + 하위 글과의 차이
  - 최근 추세 변화
  - 아직 시도하지 않은 영역
- 블로그 수준 일반론이 아닌, **이 사용자만을 위한 맞춤 가이드**

### 5. 월간 리포트 (유료)

한 달 종합 정리:

- 이번 달 성장 추이 (목표 기준)
- 가장 효과적이었던 글 패턴 요약
- 다음 달 목표 재설정 기회
- 지난 달 대비 변화

## 플랜 구조

| 항목 | 무료 | 유료 |
|------|------|------|
| 데이터 수집 | ✓ | ✓ |
| 첫 진단 리포트 | ✓ (1회) | ✓ |
| 목표 설정 | ✓ | ✓ |
| 주간 AI 리포트 | X | ✓ |
| 월간 리포트 | X | ✓ |
| AI 구체적 가이드 | X | ✓ |

## 기술 아키텍처

### 스택

- **프론트엔드**: Next.js (App Router)
- **백엔드/DB**: Supabase (PostgreSQL + Auth + Edge Functions)
- **배포**: Vercel
- **AI**: LLM API (Claude) — 리포트 가이드 생성
- **외부 API**: Threads API (데이터 수집), Notion API (내보내기 옵션)

### 인증 흐름

- Threads OAuth로 가입/로그인 (Supabase Auth의 커스텀 OAuth 또는 서버사이드 처리)
- 별도 이메일 가입 없음. Threads 계정 = 서비스 계정
- 기존 OAuth 서버(`oauth-server/`)의 토큰 교환 로직 재활용
- Threads 토큰 갱신은 기존 `refreshLongLivedToken()` 로직 재활용 (60일 주기)
- Notion 연결은 선택적 — 별도 OAuth 플로우로 추가 연결

### 기존 자산 활용

확장프로그램에서 복사 가능한 코드:

| 모듈 | 원본 | 활용 |
|------|------|------|
| Threads API 클라이언트 | `src/api/threads.js` | 게시글 조회, 인사이트, 토큰 관리 로직 재사용 |
| Notion API 클라이언트 | `src/api/notion.js` | Notion 내보내기 기능에 재사용 |
| OAuth 서버 | `oauth-server/` | Threads/Notion 토큰 교환 로직 재사용 |
| 동기화 스크립트 | `scripts/sync/` | 배치 동기화 로직 참고 |
| 데이터 정규화 | `normalizeThread()` | 게시글 표준화 로직 재사용 |

### 데이터 모델 (핵심)

```
users
  - id, threads_user_id, threads_username
  - threads_access_token, threads_token_expires_at
  - plan (free/pro), plan_expires_at
  - created_at

threads_posts
  - id, user_id, threads_id, text, media_type, permalink
  - views, likes, replies, reposts, quotes
  - hashtags (TEXT[])
  - posted_at, synced_at

follower_snapshots
  - id, user_id, follower_count, recorded_at

user_goals
  - id, user_id, goal_type, month, created_at

user_baselines
  - id, user_id
  - avg_views, top20_views                          -- 도달 확대 기준
  - avg_engagement_rate, top20_engagement_rate       -- 참여 유도 기준
  - avg_reposts_quotes, top20_reposts_quotes         -- 확산력 기준
  - avg_follower_delta_per_post                      -- 팔로워 성장 기준
  - calculated_at

reports
  - id, user_id, type (first/weekly/monthly)
  - analysis_data (JSON), ai_guide (TEXT)
  - period_start, period_end, created_at

subscriptions
  - id, user_id, stripe_customer_id, stripe_subscription_id
  - status (active/canceled/past_due)
  - current_period_start, current_period_end
  - created_at
```

### 데이터 흐름

```
1. 사용자 Threads OAuth 로그인 → Supabase Auth 세션 생성
2. 최근 100개 게시글 우선 수집 → threads_posts 저장
3. 팔로워 수 스냅샷 기록 → follower_snapshots 저장
4. 기준선 산출 → user_baselines 저장
5. 첫 진단 리포트 생성 → reports 저장 → 사용자에게 표시
6. 목표 추천 표시 → 사용자 선택 → user_goals 저장
7. 백그라운드에서 나머지 게시글 전체 수집 (완료 시 기준선 재산출)
8. 이후 주기적 신규 게시글 동기화 + 팔로워 스냅샷 (Edge Function + cron)
9. 매주 주간 리포트 자동 생성 (유료 사용자만, Edge Function + LLM API)
10. 매월 월간 리포트 자동 생성 (유료 사용자만)
```

## Notion 내보내기 (옵션)

- 자체 DB가 주축, Notion은 부가 기능
- 사용자가 Notion 연결 시, 리포트를 Notion 페이지로 내보내기 가능
- 기존 확장프로그램의 Notion API 클라이언트 코드 재활용

## 제약 사항

- Threads API 데이터 범위: 조회수, 좋아요, 댓글, 리포스트, 인용, 팔로워 수까지. 공유(shares)는 API 반환 불확실하여 제외. 프로필 링크 클릭, 전환 추적은 불가
- Threads API Rate Limit 준수 필요
- LLM API 비용: 사용자당 주 1회 호출 기준. 프롬프트에는 상위/하위 글 각 5개 요약만 포함 (전체 글 전송 X). Claude Haiku로 비용 최적화, 실패 시 1회 재시도 후 분석 파트만 제공
- "비즈니스 성과 연결"은 간접 지표(팔로워 변화, 프로필 조회수)로 추론. 직접 매출 추적은 스코프 밖

## 기존 확장프로그램과의 관계

- 확장프로그램은 **그대로 유지** (별도 제품으로 계속 운영)
- SaaS는 독립된 신규 제품. 확장프로그램 사용자 마이그레이션은 MVP 스코프 밖
- 코드만 복사 활용, 제품 간 연동은 없음

## 성공 기준

- 가입 후 첫 진단 리포트까지 **30초 이내** (최근 100개 기준 우선 생성, 전체 수집은 백그라운드)
- 주간 리포트의 AI 가이드가 **블로그 일반론이 아닌 개인 맞춤** 수준
- 무료 → 유료 전환율 목표: **10% 이상**
- 유료 사용자 월간 이탈률: **5% 이하**
