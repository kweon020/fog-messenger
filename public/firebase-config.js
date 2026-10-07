// Firebase 콘솔 → 프로젝트 설정 → 일반 → 내 앱(웹)의 설정값을 붙여넣으세요
self.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
// 프로젝트 설정 → 클라우드 메시징 → 웹 푸시 인증서 → 키 쌍
self.FIREBASE_VAPID_KEY = "YOUR_VAPID_KEY";
// 배포한 웹 주소 (앱에서 보낸 초대 링크가 이 주소로 열려요)
self.FOG_PUBLIC_URL = "https://YOUR_PROJECT.web.app";
