# fog — 김 서린 메시지

친구와 1:1 또는 최대 8명까지 주고받는 메시지 앱(PWA)이에요.

- **보내기:** 실시간 카메라 위에 김을 서리게 하고, 손가락으로 글씨를 써서 바로 보내요. 쓰는 동안의 영상(최대 15초)이 함께 가요.
- **받기:** 메시지가 김에 덮여 도착해요. 문질러야 보이고, 손을 떼고 3초가 지나면 다시 김이 서려요.

## 1. Firebase 준비 (무료 사용량 안)

1. https://console.firebase.google.com 에서 새 프로젝트를 만들어요.
2. **요금제를 Blaze로 바꿔요.** 영상 저장(Storage)과 알림 함수(Functions)에 필요해요. 카드는 등록해야 하지만, 친구끼리 쓰는 정도면 무료 한도 안이에요. 예산 알림을 1,000원 정도로 걸어두면 안심이에요.
3. **Authentication**을 열고 로그인 방법에서 **익명**을 사용 설정해요.
4. **Firestore Database**를 만들어요. 위치는 `asia-northeast3 (서울)`로 해요.
5. **Storage**를 시작해요. 위치는 같은 곳으로 해요.
6. 프로젝트 설정 → 내 앱에서 **웹 앱(</>)**을 추가하고, 나온 설정값을 `public/firebase-config.js`에 붙여넣어요.
7. 프로젝트 설정 → 클라우드 메시징 → **웹 푸시 인증서**에서 키 쌍을 생성하고, `FIREBASE_VAPID_KEY`에 넣어요.

## 2. 배포

```bash
npm install -g firebase-tools
firebase login
cd fog-messenger
firebase use --add            # 위에서 만든 프로젝트 선택
cd functions && npm install && cd ..
firebase deploy
```

배포가 끝나면 나오는 `https://프로젝트.web.app` 주소로 접속해요.

## 3. 사용

- **설치:** iPhone은 Safari에서 공유 → **홈 화면에 추가**를 하고, 그 앱에서 「알림 켜기」를 눌러요. iOS 16.4 이상이 필요해요. Android는 Chrome에서 바로 알림을 켤 수 있어요.
- **초대:** 새 방을 만든 뒤 「초대」를 눌러 링크를 공유해요. 링크를 연 친구는 바로 참여해요.
- **김 서리게 하기:** 마이크에 입김을 불어요. 마이크가 없으면 「꾹 눌러 김」을 누르면 돼요.

## 참고

- 로그인은 익명이라 앱 데이터를 지우거나 기기를 바꾸면 새 사용자가 돼요. 나중에 구글이나 전화번호 로그인을 붙일 수 있어요.
- 함수 지역(`functions/index.js`의 `REGION`)은 Firestore 위치와 같아야 해요.
- 카메라는 https 환경에서만 동작해요. 배포 주소나 `firebase serve`(localhost)로 테스트하세요.
