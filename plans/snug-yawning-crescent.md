# Storage에 shares 필드 추가 계획

## 문제
노션에는 shares가 저장되지만, 대시보드에는 항상 0으로 표시됨.
원인: `storage.js`에서 shares 필드를 처리하지 않음.

## 수정 대상 파일
- `src/storage/storage.js`

## 수정 내용

### 1. addThreadPageMapping() 함수 (약 443줄)
기존:
```javascript
insights: insights || { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0 }
```

수정:
```javascript
insights: insights || { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 }
```

### 2. updateThreadInsights() 함수 (약 481-487줄)
기존:
```javascript
mappings[index].insights = {
  views: insights.views || 0,
  likes: insights.likes || 0,
  replies: insights.replies || 0,
  reposts: insights.reposts || 0,
  quotes: insights.quotes || 0
};
```

수정:
```javascript
mappings[index].insights = {
  views: insights.views || 0,
  likes: insights.likes || 0,
  replies: insights.replies || 0,
  reposts: insights.reposts || 0,
  quotes: insights.quotes || 0,
  shares: insights.shares || 0
};
```

## 수정 후 필요한 작업
- 확장 프로그램 새로고침
- `REFRESH_STATS` 실행하여 기존 데이터 백필
