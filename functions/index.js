const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

// Firestore 데이터베이스 위치와 같아야 함 (서울 = asia-northeast3)
const REGION = 'asia-northeast3';
const DEAD = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'];

exports.notifyFogMessage = onDocumentCreated({ document: 'rooms/{roomId}/messages/{msgId}', region: REGION }, async event => {
  const msg = event.data && event.data.data();
  if (!msg) return;
  const { roomId } = event.params;
  const db = getFirestore();
  const room = (await db.doc(`rooms/${roomId}`).get()).data();
  if (!room) return;
  const sender = (await db.doc(`users/${msg.from}`).get()).data() || {};
  const body = `${sender.name || '친구'}님이 김 서린 메시지를 보냈어요`;

  for (const uid of room.members.filter(u => u !== msg.from)) {
    const pref = db.doc(`users/${uid}/private/push`);
    const tokens = ((await pref.get()).data() || {}).tokens || [];
    if (!tokens.length) continue;
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      data: { roomId, title: 'fog', body },
      webpush: { headers: { Urgency: 'high' } }
    });
    const dead = tokens.filter((_, i) => !res.responses[i].success && DEAD.includes(res.responses[i].error && res.responses[i].error.code));
    if (dead.length) await pref.update({ tokens: FieldValue.arrayRemove(...dead) });
  }
});
