# Technical Requirements Document (TRD)

## 1. Executive Technical Summary
- **프로젝트 개요**: 본 문서는 Threads 게시글을 Notion 데이터베이스에 자동으로 동기화하는 서버리스(Serverless) 크롬 확장 프로그램의 기술 요구사항을 정의합니다. Manifest v3를 기반으로 클라이언트 사이드에서 모든 로직을 처리하며, 사용자의 API 토큰은 `chrome.storage.local`에 안전하게 저장됩니다. Threads API와 Notion API를 직접 호출하여 데이터 동기화를 수행하는 것을 핵심 아키텍처로 합니다.
- **핵심 기술 스택**: JavaScript, Manifest v3, `chrome.storage.local`, `chart.js`, Notion API, Threads API를 사용하여 요구사항을 충족하는 가장 직접적이고 효율적인 방식으로 구현합니다.
- **주요 기술 목표**: 5초 이내의 동기화 지연 시간, 1분 미만의 평균 초기 설정 시간, 95% 이상의 동기화 성공률을 달성하고, 브라우저 CPU 점유율을 평균 5% 이하로 유지하는 것을 목표로 합니다.
- **핵심 기술 가정**: 사용자는 유효한 Threads 및 Notion API 접근 토큰을 보유하고 있으며, 지정된 Notion 데이터베이스는 동기화할 필드(제목, 본문 등)를 포함하고 있다고 가정합니다. 또한, Threads의 새 게시글을 감지할 수 있는 안정적인 방법(API 폴링 또는 DOM 분석)이 존재함을 전제합니다.

## 2. Tech Stack

| Category | Technology / Library | Reasoning (Why it's chosen for this project) |
| --- | --- | --- |
| 확장 프로그램 표준 | Manifest v3 | 최신 크롬 확장 프로그램 표준으로, 향상된 보안, 성능 및 개인정보 보호 기능을 제공합니다. 백그라운드 처리를 위한 서비스 워커(Service Worker) 모델을 사용합니다. |
| 핵심 언어 | JavaScript (ES6+) | 크롬 확장 프로그램 개발의 표준 언어이며, 별도 컴파일 과정 없이 신속한 개발이 가능합니다. `async/await`를 활용하여 비동기 API 통신을 효율적으로 처리합니다. |
| 로컬 데이터 저장소 | `chrome.storage.local` | 서버 없이 사용자의 민감한 정보(API 토큰)를 안전하게 클라이언트에 저장하기 위한 최적의 솔루션입니다. 확장 프로그램의 컨텍스트 내에서만 접근 가능합니다. |
| 데이터 시각화 | `chart.js` | 향후 게시물 통계 시각화 기능(백로그)을 구현할 때, 가볍고 유연하며 의존성이 적어 간단한 차트를 구현하기에 적합합니다. |
| 외부 API 연동 | Notion API | Notion 데이터베이스에 페이지를 생성하고 데이터를 저장하기 위한 공식적이고 안정적인 인터페이스를 제공합니다. |
| 외부 API 연동 | Threads API | Threads 게시글 데이터를 프로그래매틱하게 가져오기 위해 사용합니다. 공식 API의 제약이 있을 경우, 비공식 GraphQL 엔드포인트나 DOM 파싱을 대체 수단으로 활용합니다. |

## 3. System Architecture Design

### Top-Level building blocks
- **UI 컴포넌트 (Popup & Options Page)**
  - 사용자가 Notion 및 Threads API 키, Notion 데이터베이스 ID를 입력하고 필드를 매핑하는 인터페이스를 제공합니다.
  - 하위 구성 요소: `options.html`, `options.js`, `popup.html`, `popup.js`
- **백그라운드 서비스 워커 (Background Service Worker)**
  - 확장 프로그램의 핵심 로직을 수행합니다. 새 게시글 감지 이벤트를 수신하고, Threads API로 데이터를 가져와 Notion API로 전송하는 전체 동기화 프로세스를 관리합니다.
  - 하위 구성 요소: `background.js`
- **콘텐츠 스크립트 (Content Script)**
  - Threads 웹 페이지(`threads.net`)에 삽입되어 새 게시글 작성을 감지합니다. DOM 변경을 감시하거나 네트워크 요청을 가로채는 역할을 수행하며, 감지 시 백그라운드 스크립트에 메시지를 전송합니다.
  - 하위 구성 요소: `content.js`
- **API 클라이언트 모듈 (API Client Modules)**
  - Notion 및 Threads와의 API 통신을 담당하는 독립된 모듈입니다. 재사용성과 유지보수성을 높이기 위해 각 API별로 분리합니다. API 속도 제한(Rate Limit) 처리를 위한 로직을 포함합니다.
  - 하위 구성 요소: `api/notion.js`, `api/threads.js`
- **로컬 스토리지 관리자 (Local Storage Manager)**
  - `chrome.storage.local`을 추상화한 래퍼(Wrapper) 모듈입니다. API 키의 안전한 저장 및 조회를 담당합니다.
  - 하위 구성 요소: `storage/storage.js`

### Top-Level Component Interaction Diagram
```mermaid
graph TD
    subgraph 사용자 브라우저
        A[사용자] --> B[UI (Popup/Options)];
        B -- 설정 저장 --> C[로컬 스토리지 (chrome.storage.local)];
        F[Threads 웹 페이지] --> E[콘텐츠 스크립트];
    end

    subgraph Chrome Extension
        D[백그라운드 서비스 워커] -- 설정 조회 --> C;
        E -- 새 글 감지 메시지 --> D;
        D -- 게시글 데이터 요청 --> G[Threads API 클라이언트];
        D -- 페이지 생성 요청 --> H[Notion API 클라이언트];
        D -- 성공/실패 알림 --> I[알림 모듈 (chrome.notifications)];
    end

    subgraph 외부 서비스
      G --> J[Threads API];
      H --> K[Notion API];
    end

```
- **설정 과정**: 사용자는 UI를 통해 API 키와 데이터베이스 ID를 입력하고, 이 정보는 로컬 스토리지에 안전하게 저장됩니다.
- **게시글 감지**: 사용자가 Threads 웹 페이지에서 새 글을 게시하면, 콘텐츠 스크립트가 이를 감지하여 백그라운드 서비스 워커에 알립니다.
- **동기화 실행**: 백그라운드 서비스 워커는 로컬 스토리지에서 설정을 읽어온 후, Threads API 클라이언트를 통해 게시글 상세 데이터를 가져옵니다.
- **데이터 저장 및 알림**: 가져온 데이터를 Notion API 클라이언트를 통해 Notion 데이터베이스에 새 페이지로 생성하고, 작업 결과를 사용자에게 알림으로 표시합니다.

### Code Organization & Convention
**Domain-Driven Organization Strategy**
- **도메인 분리**: 기능적 도메인(UI, 백그라운드 로직, API 통신, 데이터 저장)에 따라 코드를 명확하게 분리하여 각 모듈의 책임을 한정합니다.
- **계층 기반 아키텍처**: UI(Presentation), 비즈니스 로직(Background), 데이터 접근(API Clients, Storage) 계층으로 구분하여 관심사를 분리합니다.
- **기능 기반 모듈**: `api`, `storage`, `ui` 등 기능별로 모듈을 그룹화하여 코드 탐색 및 유지보수를 용이하게 합니다.
- **공유 컴포넌트**: 여러 모듈에서 공통으로 사용되는 유틸리티 함수나 상수 등은 `shared` 디렉토리에서 관리합니다.

**Universal File & Folder Structure**
```
/
├── manifest.json                 # 확장 프로그램 설정 파일
├── icons/                        # 확장 프로그램 아이콘
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background.js             # 백그라운드 서비스 워커
│   ├── content.js                # 콘텐츠 스크립트
│   ├── api/                      # 외부 API 클라이언트 모듈
│   │   ├── notion.js
│   │   └── threads.js
│   ├── storage/                  # 로컬 스토리지 관리 모듈
│   │   └── storage.js
│   ├── ui/                       # UI 관련 파일
│   │   ├── options.html
│   │   ├── options.js
│   │   ├── popup.html
│   │   └── popup.js
│   └── shared/                   # 공통 유틸리티
│       └── utils.js
└── README.md
```

### Data Flow & Communication Patterns
- **클라이언트-서버 통신**: 모든 API 통신은 확장 프로그램 클라이언트에서 외부 서비스(Notion, Threads)의 REST API 엔드포인트로 직접 `fetch` API를 사용하여 HTTPS 요청/응답 패턴으로 이루어집니다. 별도의 중개 서버는 없습니다.
- **데이터베이스 상호작용**: 주 데이터베이스는 Notion이며, 상호작용은 Notion API를 통해서만 이루어집니다. 설정 데이터는 `chrome.storage.local` API를 통해 비동기적으로 저장 및 조회됩니다.
- **외부 서비스 통합**: Notion API의 경우, 초당 3회 요청 제한(Rate Limit)을 준수하기 위해 요청 큐와 지수 백오프(Exponential Backoff)를 적용한 재시도 로직을 API 클라이언트 모듈에 구현합니다.
- **실시간 통신**: 실시간 통신(WebSocket 등)은 필요하지 않습니다. 새 글 감지는 `MutationObserver` 또는 주기적인 API 폴링(Polling) 방식으로 구현합니다.
- **데이터 동기화**: 데이터 흐름은 Threads에서 Notion으로의 단방향(One-way) 동기화입니다. 백그라운드 서비스 워커가 전체 데이터 흐름을 조정하는 오케스트레이터(Orchestrator) 역할을 합니다.

## 4. Performance & Optimization Strategy
- **효율적인 게시글 감지**: CPU 사용량을 최소화하기 위해, 무분별한 DOM 폴링 대신 `MutationObserver`를 사용하여 DOM의 특정 변화를 감지하는 방식을 우선적으로 채택합니다.
- **비동기 처리**: 모든 I/O 작업(API 호출, 로컬 스토리지 접근)은 `async/await`를 사용하여 비동기적으로 처리함으로써, 확장 프로그램의 UI 및 백그라운드 프로세스가 멈추는 현상(Blocking)을 방지합니다.
- **요청 페이로드 최적화**: Threads 및 Notion API 호출 시, 필요한 데이터 필드만 명시적으로 요청하여 네트워크 트래픽과 응답 시간을 최소화합니다.
- **리소스 관리**: Manifest v3의 이벤트 기반 서비스 워커 모델을 적극 활용하여, 동기화 작업이 없을 때는 백그라운드 스크립트가 휴면 상태를 유지하도록 하여 메모리 점유율을 낮춥니다.

## 5. Implementation Roadmap & Milestones
### Phase 1: Foundation (MVP Implementation)
- **핵심 인프라**: Manifest v3 기반 프로젝트 구조 설정, 백그라운드 서비스 워커 및 기본 UI(옵션, 팝업) 페이지 구현.
- **필수 기능**: API 키 및 DB ID를 `chrome.storage.local`에 저장하는 기능, DOM 기반의 새 게시글 감지 PoC, 게시글 데이터 추출, Notion 페이지 생성 핵심 로직 개발.
- **기본 보안**: `chrome.storage.local`을 이용한 API 토큰의 안전한 저장.
- **개발 환경 설정**: 코드 번들링 없이 순수 JavaScript로 개발하여 개발 환경을 단순화하고, GitHub 리포지토리 설정.
- **예상 기간**: 3주

### Phase 2: Feature Enhancement
- **고급 기능**: 해시태그 기반 필터링 동기화, 기존 게시글 수정 시 Notion 페이지 업데이트 기능 구현.
- **성능 최적화**: Notion API 속도 제한에 대응하는 정교한 요청 큐 및 재시도 로직 구현, 게시글 감지 로직 안정화.
- **보안 강화**: 필요한 경우, 저장된 토큰에 대한 추가적인 클라이언트 사이드 암호화 로직 도입 검토.
- **모니터링 구현**: 동기화 성공/실패 로그를 로컬에 기록하여 사용자가 디버깅할 수 있도록 지원. `chart.js`를 활용한 게시물 통계 시각화 기능 추가.
- **예상 기간**: MVP 출시 후 4주

## 6. Risk Assessment & Mitigation Strategies
### Technical Risk Analysis
- **기술 리스크**: Threads 비공식 API 또는 DOM 구조 변경 시 동기화 기능이 중단될 수 있음.
  - **완화 전략**: Threads API 통신 및 DOM 파싱 로직을 별도의 모듈로 분리하여 변경에 쉽게 대응할 수 있도록 설계합니다. 주기적으로 API 변경 사항을 모니터링하고 신속한 핫픽스를 배포할 수 있는 프로세스를 마련합니다.
- **성능 리스크**: 비효율적인 DOM 감시 로직이 브라우저 성능을 저하시킬 수 있음. Notion API 속도 제한 초과로 동기화가 실패할 수 있음.
  - **완화 전략**: `MutationObserver`의 관찰 대상을 최소화하고, Notion API 클라이언트에 요청 큐와 지연 실행, 재시도 로직을 필수로 구현합니다.
- **보안 리스크**: `chrome.storage.local`에 저장된 API 토큰이 유출될 가능성.
  - **완화 전략**: 콘텐츠 스크립트에는 토큰 정보를 절대 전달하지 않고, 모든 API 통신은 보안 컨텍스트가 강화된 백그라운드 서비스 워커에서만 처리하도록 강제합니다.
- **통합 리스크**: Notion API의 정책 변경(Breaking Changes)으로 인해 기존 코드가 동작하지 않을 수 있음.
  - **완화 전략**: Notion API 공식 문서를 주기적으로 확인하고, API 클라이언트 모듈에 버전 정보를 명시하여 관리합니다.

### Project Delivery Risks
- **일정 리스크**: Threads의 게시글 감지 로직 구현이 예상보다 복잡하여 개발 일정이 지연될 수 있음.
  - **완화 전략**: 프로젝트 1주차에 게시글 감지 기술 검증(PoC)을 최우선으로 진행하여 기술적 불확실성을 조기에 해소합니다.
- **리소스 리스크**: 1인 개발 프로젝트로, 핵심 개발자의 부재 시 프로젝트가 중단될 위험이 있음.
  - **완화 전략**: 코드의 모듈화와 명확한 주석 작성을 통해 코드 가독성을 높이고, 주요 로직에 대한 문서를 작성하여 지식 공유를 용이하게 합니다.
- **품질 리스크**: 수동 테스트에만 의존할 경우, 기능 추가 시 예기치 않은 버그(Regression)가 발생할 수 있음.
  - **완화 전략**: 핵심 로직(API 클라이언트, 데이터 변환)에 대해 단위 테스트를 도입하는 것을 고려합니다.
- **배포 리스크**: 크롬 웹스토어의 심사 과정에서 예기치 않은 거절이나 지연이 발생할 수 있음.
  - **완화 전략**: 웹스토어 정책 가이드라인을 철저히 준수하고, 개인정보 처리 방침 등 필요한 문서를 사전에 충실히 준비합니다.