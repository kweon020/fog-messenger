// ───────── helpers ─────────
const $ = id => document.getElementById(id);
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
let toastT = 0;
function toast(m, ms = 3000) {
  const t = $('toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
// errors are shown, never swallowed
addEventListener('error', e => toast('오류: ' + e.message, 6000));
addEventListener('unhandledrejection', e => toast('오류: ' + ((e.reason && e.reason.message) || e.reason), 6000));
function show(id) { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; }
const fmt = ms => ms ? new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '방금';
const IN_APP = navigator.userAgent.includes('FogApp');
const MAX_MEMBERS = 8, REC_MS = 4000;
const me = { uid: null, name: '' };
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }

// ───────── fog engine (same layers as fog.html) ─────────
const BLUR = 18, BRIGHT = 1.18, TINT = 'rgba(242,238,231,0.62)', FOG_START = 0.55;
const BLOBS = 12, BLOB_ALPHA = 0.36, BLOB_SOFT = 0.60, REACH = 0.43, SPREAD_X = 1.45;
const TRIG = 0.0025, FULL = 0.003, FLOOR_DOWN = 0.05, FLOOR_UP = 0.0008, KEY_QUIET = 300, TREMOR = 0.0006;
const WIPE_ALPHA = 0.34, WIPE_MAX = 40, WIPE_JUMP = 0.3, VIEW_WIPE_R = 30, REFOG_DELAY = 3000, REFOG_RATE = 0.006;

function mk() { const c = document.createElement('canvas'); return [c, c.getContext('2d')]; }
function resizeKeep(c, W, H) {
  if (c.width === W && c.height === H) return;
  const [t, tx] = mk(); t.width = c.width; t.height = c.height; tx.drawImage(c, 0, 0);
  c.width = W; c.height = H; c.getContext('2d').drawImage(t, 0, 0, W, H);
}
function cover(video, w, h) {
  const vw = video.videoWidth || 720, vh = video.videoHeight || 1280, s = Math.max(w / vw, h / vh);
  return { dw: vw * s, dh: vh * s, ox: (w - vw * s) / 2, oy: (h - vh * s) / 2 };
}
function drawMirrored(x, video, w, h, pad) {
  const m = cover(video, w + 2 * pad, h + 2 * pad);
  x.save(); x.translate(w, 0); x.scale(-1, 1);
  x.drawImage(video, m.ox - pad, m.oy - pad, m.dw, m.dh);
  x.restore();
}
class Stage {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    [this.smC, this.smX] = mk(); [this.frC, this.frX] = mk();
    this.W = 0; this.H = 0; this.dpr = 1;
  }
  layout() { // 9:16 stage fitted to the screen, so every phone sees the same frame
    const vw = innerWidth, vh = innerHeight;
    let w = vw, h = vw * 16 / 9; if (h > vh) { h = vh; w = vh * 9 / 16; }
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    const W = Math.round(w * this.dpr), H = Math.round(h * this.dpr);
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    this.cv.width = W; this.cv.height = H; this.frC.width = W; this.frC.height = H;
    this.smC.width = Math.max(1, Math.round(W / 4)); this.smC.height = Math.max(1, Math.round(H / 4));
  }
  render(video, fog) {
    const { W, H, dpr } = this, b = BLUR * dpr / 4, ready = video.readyState >= 2;
    if (ready) {
      this.smX.filter = `blur(${b}px) brightness(${BRIGHT})`;
      this.smX.clearRect(0, 0, this.smC.width, this.smC.height);
      drawMirrored(this.smX, video, this.smC.width, this.smC.height, b * 2);
      this.smX.filter = 'none';
    }
    const f = this.frX;
    f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, W, H);
    f.drawImage(this.smC, 0, 0, W, H);
    f.fillStyle = TINT; f.fillRect(0, 0, W, H);
    f.globalCompositeOperation = 'destination-in'; f.drawImage(fog, 0, 0, W, H);
    f.globalCompositeOperation = 'source-over';
    const c = this.ctx;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (ready) drawMirrored(c, video, W, H, 0);
    c.drawImage(this.frC, 0, 0);
  }
  point(e) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * this.dpr, y: (e.clientY - r.top) * this.dpr }; }
}
function softDisc(x, X, Y, r, a) {
  const g = x.createRadialGradient(X, Y, 0, X, Y, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1 - BLOB_SOFT, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(X, Y, r, 0, Math.PI * 2); x.fill();
}
function wipeStamp(x, p, r) {
  x.globalCompositeOperation = 'destination-out';
  const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, `rgba(0,0,0,${WIPE_ALPHA})`); g.addColorStop(0.6, `rgba(0,0,0,${WIPE_ALPHA * 0.75})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, r, 0, Math.PI * 2); x.fill();
  x.globalCompositeOperation = 'source-over';
}

// ───────── stand-in camera: used when no camera is available, and for the demo bot ─────────
function synthStream(skin) {
  const [c, x] = mk(); c.width = 360; c.height = 640;
  let on = true; const t0 = performance.now();
  function draw(now) {
    if (!on) return;
    requestAnimationFrame(draw);
    const t = (now - t0) / 1000;
    x.fillStyle = '#c9d3d8'; x.fillRect(0, 0, 360, 640);
    x.strokeStyle = 'rgba(110,130,140,.45)'; x.lineWidth = 2;
    for (let i = 0; i <= 360; i += 45) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 640); x.stroke(); }
    for (let j = 0; j <= 640; j += 45) { x.beginPath(); x.moveTo(0, j); x.lineTo(360, j); x.stroke(); }
    const lx = 180 + Math.sin(t * 0.7) * 90, g = x.createRadialGradient(lx, 120, 10, lx, 120, 280);
    g.addColorStop(0, 'rgba(255,228,186,.95)'); g.addColorStop(1, 'rgba(255,228,186,0)');
    x.fillStyle = g; x.fillRect(0, 0, 360, 640);
    const hx = 180 + Math.sin(t * 1.3) * 16, hy = 300 + Math.sin(t * 2.1) * 9;
    x.fillStyle = '#3d4a5c'; x.beginPath(); x.ellipse(hx, hy + 230, 150, 110, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = skin; x.beginPath(); x.ellipse(hx, hy, 70, 88, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2b2522'; x.beginPath(); x.ellipse(hx, hy - 52, 76, 46, 0, Math.PI, Math.PI * 2); x.fill();
    const blink = (t % 3.2) < 0.12 ? 0.2 : 1;
    x.beginPath(); x.ellipse(hx - 24, hy - 5, 6, 7 * blink, 0, 0, Math.PI * 2); x.ellipse(hx + 24, hy - 5, 6, 7 * blink, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#2b2522'; x.lineWidth = 4; x.beginPath(); x.arc(hx, hy + 26, 20, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
  }
  requestAnimationFrame(draw);
  const s = c.captureStream(30);
  s.stopSynth = () => { on = false; for (const tr of s.getTracks()) tr.stop(); };
  return s;
}
function textMask(text) { // a fogged mirror with words wiped out of it
  const [m, x] = mk(); m.width = 270; m.height = 480;
  x.fillStyle = 'rgba(255,255,255,0.62)'; x.fillRect(0, 0, 270, 480);
  for (let i = 0; i < 26; i++) softDisc(x, 135 + (Math.random() - 0.5) * 230, 300 + (Math.random() - 0.5) * 160, 30 + Math.random() * 40, 0.3);
  x.globalCompositeOperation = 'destination-out';
  x.save(); x.translate(135, 150); x.rotate(-0.08);
  x.font = 'bold 40px "Apple SD Gothic Neo","Noto Sans KR",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 5; x.lineJoin = 'round'; x.strokeStyle = '#000'; x.fillStyle = '#000';
  x.strokeText(text, 0, 0); x.fillText(text, 0, 0);
  x.restore();
  return m.toDataURL('image/png');
}

// ───────── data: Firebase, or a local demo when Firebase isn't set up ─────────
const cfg = self.FIREBASE_CONFIG;
const DEMO = !cfg || !cfg.apiKey || cfg.apiKey.startsWith('YOUR');

async function firebaseApi() {
  const B = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [{ initializeApp }, A, F, S, M] = await Promise.all([
    import(B + 'firebase-app.js'), import(B + 'firebase-auth.js'), import(B + 'firebase-firestore.js'),
    import(B + 'firebase-storage.js'), import(B + 'firebase-messaging.js')
  ]);
  const app = initializeApp(cfg), auth = A.getAuth(app), db = F.getFirestore(app), storage = S.getStorage(app);
  const { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp, arrayUnion, arrayRemove } = F;
  const ms = ts => (ts && ts.toMillis ? ts.toMillis() : null);
  const swReg = ('serviceWorker' in navigator && !IN_APP) ? navigator.serviceWorker.register('firebase-messaging-sw.js') : null;
  let pushListening = false;
  return {
    demo: false,
    login: () => new Promise(res => A.onAuthStateChanged(auth, u => { if (u) res(u.uid); else A.signInAnonymously(auth); })),
    async getName(uid) { const d = await getDoc(doc(db, 'users', uid)); return (d.exists() && d.data().name) || ''; },
    setName: n => setDoc(doc(db, 'users', me.uid), { name: n }, { merge: true }),
    watchRooms: (cb, err) => onSnapshot(query(collection(db, 'rooms'), where('members', 'array-contains', me.uid)),
      s => cb(s.docs.map(d => ({ id: d.id, members: d.data().members, lastAt: ms(d.data().lastAt) }))), err),
    async createRoom() {
      const r = doc(collection(db, 'rooms'));
      await setDoc(r, { owner: me.uid, members: [me.uid], createdAt: serverTimestamp(), lastAt: serverTimestamp() });
      return r.id;
    },
    async joinRoom(id) {
      const r = doc(db, 'rooms', id), s = await getDoc(r);
      if (!s.exists()) return 'missing';
      const m = s.data().members || [];
      if (m.includes(me.uid)) return 'ok';
      if (m.length >= MAX_MEMBERS) return 'full';
      await updateDoc(r, { members: arrayUnion(me.uid) });
      return 'ok';
    },
    leaveRoom: id => updateDoc(doc(db, 'rooms', id), { members: arrayRemove(me.uid) }),
    watchRoom: (id, cb, err) => onSnapshot(doc(db, 'rooms', id), s => cb(s.exists() ? { id, members: s.data().members, lastAt: ms(s.data().lastAt) } : null), err),
    watchMessages: (id, cb, err) => onSnapshot(query(collection(db, 'rooms', id, 'messages'), orderBy('createdAt', 'desc'), limit(50)),
      s => cb(s.docs.map(d => ({ id: d.id, from: d.data().from, at: ms(d.data().createdAt), mask: d.data().mask, video: d.data().video })).reverse()), err),
    async send(roomId, blob, mask) {
      const mref = doc(collection(db, 'rooms', roomId, 'messages'));
      const type = (blob.type || 'video/webm').split(';')[0];
      const path = `rooms/${roomId}/${mref.id}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      await S.uploadBytes(S.ref(storage, path), blob, { contentType: type });
      const video = await S.getDownloadURL(S.ref(storage, path));
      await setDoc(mref, { from: me.uid, createdAt: serverTimestamp(), video, mask });
      await updateDoc(doc(db, 'rooms', roomId), { lastAt: serverTimestamp(), lastFrom: me.uid });
    },
    inviteUrl: id => `${self.FOG_PUBLIC_URL || location.origin + location.pathname.replace(/[^/]*$/, '')}?join=${id}`,
    async push(ask) {
      const ok = 'Notification' in window && swReg && await M.isSupported();
      if (!ok) {
        if (ask) toast(IN_APP ? '앱 알림은 다음 버전에서 지원돼요. 지금은 웹(홈 화면 추가)에서 켤 수 있어요'
          : /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone ? 'iPhone은 Safari 공유 → 「홈 화면에 추가」 후, 그 앱에서 알림을 켜주세요'
          : '이 브라우저는 푸시 알림을 지원하지 않아요', 7000);
        return false;
      }
      if (ask) { if (await Notification.requestPermission() !== 'granted') { toast('알림 권한이 꺼져 있어요'); return false; } }
      else if (Notification.permission !== 'granted') return false;
      const messaging = M.getMessaging(app);
      const token = await M.getToken(messaging, { vapidKey: self.FIREBASE_VAPID_KEY, serviceWorkerRegistration: await swReg });
      await setDoc(doc(db, 'users', me.uid, 'private', 'push'), { tokens: arrayUnion(token) }, { merge: true });
      if (!pushListening) {
        pushListening = true;
        M.onMessage(messaging, p => { const d = p.data || {}; if (d.roomId !== curRoom) toast(d.body || '새 메시지가 왔어요'); });
      }
      return true;
    }
  };
}

function demoApi() {
  const BOT = 'bot', REPLIES = ['잘 받았어!', 'ㅋㅋ 귀엽다', '김 서렸네 ✦', '나도 보낼게', '보고 싶다'];
  const rooms = new Map(), msgs = new Map(), L = { rooms: new Set(), room: new Map(), msgs: new Map() };
  const sub = (map, id, f) => { if (!map.has(id)) map.set(id, new Set()); map.get(id).add(f); return () => map.get(id).delete(f); };
  const emitRooms = () => { const a = [...rooms.values()]; for (const f of L.rooms) f(a); };
  const emit = id => {
    for (const f of (L.room.get(id) || [])) f(rooms.get(id) || null);
    for (const f of (L.msgs.get(id) || [])) f([...(msgs.get(id) || [])]);
    emitRooms();
  };
  const add = (id, m) => { msgs.get(id).push(m); rooms.get(id).lastAt = m.at; emit(id); };
  const botSay = (id, text) => add(id, { id: 'm' + Math.random(), from: BOT, at: Date.now(), mask: textMask(text), video: 'synth:bot' });
  const newRoom = () => {
    const id = 'demo' + (rooms.size + 1);
    rooms.set(id, { id, members: [me.uid, BOT], lastAt: Date.now() }); msgs.set(id, []);
    setTimeout(() => botSay(id, '안녕 ✦'), 1200);
    return id;
  };
  return {
    demo: true,
    async login() { return 'me'; },
    async getName(uid) { return uid === BOT ? '안개봇' : uid === me.uid ? (store('fogName') || '') : '친구'; },
    async setName(n) { store('fogName', n); },
    watchRooms(cb) { L.rooms.add(cb); if (!rooms.size) newRoom(); cb([...rooms.values()]); return () => L.rooms.delete(cb); },
    async createRoom() { return newRoom(); },
    async joinRoom() { return 'missing'; },
    async leaveRoom(id) { rooms.delete(id); emit(id); },
    watchRoom(id, cb) { const u = sub(L.room, id, cb); cb(rooms.get(id) || null); return u; },
    watchMessages(id, cb) { const u = sub(L.msgs, id, cb); cb([...(msgs.get(id) || [])]); return u; },
    async send(id, blob, mask) {
      add(id, { id: 'm' + Math.random(), from: me.uid, at: Date.now(), mask, video: URL.createObjectURL(blob) });
      setTimeout(() => { if (rooms.has(id)) botSay(id, REPLIES[Math.floor(Math.random() * REPLIES.length)]); }, 2500);
    },
    inviteUrl: null,
    async push(ask) { if (ask) toast('데모 모드에서는 알림이 꺼져 있어요'); return false; }
  };
}

let api = null;
const names = new Map();
const getName = uid => { if (!names.has(uid)) names.set(uid, api.getName(uid).then(n => n || '친구')); return names.get(uid); };

// ───────── boot / name ─────────
const params = new URLSearchParams(location.search);
const pending = { join: params.get('join'), room: params.get('room') };
(async () => {
  api = DEMO ? demoApi() : await firebaseApi();
  if (!DEMO && location.search) history.replaceState(null, '', location.pathname);
  $('demoTag').hidden = !DEMO;
  me.uid = await api.login();
  me.name = await api.getName(me.uid);
  if (me.name) afterLogin();
  else { show('s-name'); if (DEMO) $('nameHint').textContent = '데모 모드 · 안개봇과 주고받아 볼 수 있어요'; }
})();
$('nameGo').onclick = async () => {
  const n = $('nameInput').value.trim();
  if (!n) { toast('닉네임을 입력해 주세요'); return; }
  $('nameGo').disabled = true;
  await api.setName(n);
  me.name = n; names.set(me.uid, Promise.resolve(n));
  afterLogin();
};
$('nameInput').onkeydown = e => { if (e.key === 'Enter') $('nameGo').click(); };

async function afterLogin() {
  unsubRooms = api.watchRooms(renderRooms, e => toast('방 목록 오류: ' + e.message, 6000));
  if (await api.push(false)) markPushOn();
  if (pending.join) {
    const id = pending.join; pending.join = null;
    const r = await api.joinRoom(id);
    if (r === 'ok') { openRoom(id); return; }
    toast(r === 'full' ? `방이 가득 찼어요 (최대 ${MAX_MEMBERS}명)` : '초대 링크가 올바르지 않아요', 5000);
  }
  if (pending.room) { const id = pending.room; pending.room = null; openRoom(id); return; }
  show('s-rooms');
  if (DEMO) toast('데모 모드예요 · 안개봇이 메시지를 보냈어요', 4000);
}
function markPushOn() { $('pushBtn').textContent = '알림 켜짐'; $('pushBtn').disabled = true; }
$('pushBtn').onclick = async () => { if (await api.push(true)) markPushOn(); };

// ───────── rooms ─────────
let unsubRooms = null;
async function roomTitle(r) {
  const others = r.members.filter(u => u !== me.uid);
  if (!others.length) return '나만 있는 방 · 친구를 초대해 보세요';
  return (await Promise.all(others.map(getName))).join(', ');
}
function renderRooms(list) {
  const rs = [...list].sort((a, b) => (b.lastAt || Date.now()) - (a.lastAt || Date.now()));
  const ul = $('roomList'); ul.textContent = '';
  $('roomsEmpty').hidden = rs.length > 0;
  for (const r of rs) {
    const li = el('li', 'row'), t = el('div', 'title'), s = el('small', 'muted');
    t.textContent = '…';
    s.textContent = `${r.members.length}/${MAX_MEMBERS}명 · ${fmt(r.lastAt)}`;
    roomTitle(r).then(x => { t.textContent = x; });
    li.append(t, s); li.onclick = () => openRoom(r.id);
    ul.append(li);
  }
}
$('newRoom').onclick = async () => {
  const id = await api.createRoom();
  openRoom(id);
  if (!api.demo) invite(id);
};
async function invite(id) {
  if (!api.inviteUrl) { toast('데모 모드에서는 초대할 수 없어요 · Firebase를 연결하면 친구를 초대할 수 있어요', 5000); return; }
  const url = api.inviteUrl(id), text = '김 서린 메시지 방에 초대할게요 ✦';
  if (window.FogAndroid) { window.FogAndroid.share(`${text}\n${url}`); return; }
  if (navigator.share) {
    try { await navigator.share({ title: 'fog', text, url }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  await navigator.clipboard.writeText(url);
  toast('초대 링크를 복사했어요');
}

// ───────── one room ─────────
let curRoom = null, unsubs = [], leaveArmed = 0;
function closeRoomWatch() { for (const u of unsubs) u(); unsubs = []; curRoom = null; }
function openRoom(id) {
  closeRoomWatch();
  curRoom = id; leaveArmed = 0; $('leaveBtn').textContent = '나가기';
  $('roomTitle').textContent = '…'; $('roomCount').textContent = ''; $('msgList').textContent = '';
  show('s-room');
  unsubs.push(api.watchRoom(id, r => {
    if (!r || !r.members.includes(me.uid)) { closeRoomWatch(); show('s-rooms'); return; }
    roomTitle(r).then(t => { $('roomTitle').textContent = t; });
    $('roomCount').textContent = `${r.members.length}/${MAX_MEMBERS}명`;
    $('inviteBtn').disabled = r.members.length >= MAX_MEMBERS;
  }, e => toast('방 오류: ' + e.message, 6000)));
  unsubs.push(api.watchMessages(id, list => {
    const ul = $('msgList'); ul.textContent = '';
    for (const m of list) {
      const li = el('li', 'msg' + (m.from === me.uid ? ' mine' : '')), th = el('div', 'thumb'), img = el('img'), cap = el('small');
      img.src = m.mask; img.alt = ''; th.append(img);
      cap.textContent = fmt(m.at);
      if (m.from !== me.uid) getName(m.from).then(n => { cap.textContent = `${n} · ${fmt(m.at)}`; });
      li.append(th, cap); li.onclick = () => openView(m);
      ul.append(li);
    }
    ul.scrollTop = ul.scrollHeight;
  }, e => toast('메시지 오류: ' + e.message, 6000)));
}
$('roomBack').onclick = () => { closeRoomWatch(); show('s-rooms'); };
$('inviteBtn').onclick = () => invite(curRoom);
$('leaveBtn').onclick = async () => { // tap twice, no blocking dialogs
  if (Date.now() - leaveArmed > 3000) { leaveArmed = Date.now(); $('leaveBtn').textContent = '한 번 더 누르면 나가요'; setTimeout(() => { $('leaveBtn').textContent = '나가기'; }, 3000); return; }
  const id = curRoom; closeRoomWatch();
  await api.leaveRoom(id);
  show('s-rooms');
};

// ───────── compose: record 4s, write on the fog, send ─────────
const cStage = new Stage($('cCanvas'));
const [cFog, cFogX] = mk();
const camVideo = $('camVideo'), clipVideo = $('clipVideo');
let cOn = false, camStream = null, clipBlob = null, clipURL = null, recorder = null;
let holding = false, drawing = false, lastPt = null, lastMid = null, brushR = 15, cFrame = 0, usingSynth = false;
const MIMES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

// breath (mic)
let lastKey = -1e9;
const breath = { actx: null, an: null, buf: null, floor: -1, stream: null };
async function startMic() {
  breath.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
  await breath.actx.resume();
  const src = breath.actx.createMediaStreamSource(breath.stream);
  breath.an = breath.actx.createAnalyser(); breath.an.fftSize = 1024;
  breath.buf = new Float32Array(breath.an.fftSize); breath.floor = -1;
  src.connect(breath.an);
}
function stopMic() {
  if (breath.stream) for (const t of breath.stream.getTracks()) t.stop();
  if (breath.actx) breath.actx.close();
  breath.actx = breath.an = breath.stream = null;
}
function breathStrength(now) {
  if (!breath.an) return 0;
  breath.an.getFloatTimeDomainData(breath.buf);
  let s = 0; for (let i = 0; i < breath.buf.length; i++) s += breath.buf[i] * breath.buf[i];
  const lv = Math.sqrt(s / breath.buf.length);
  if (breath.floor < 0) breath.floor = lv;
  breath.floor += (lv - breath.floor) * (lv < breath.floor ? FLOOR_DOWN : FLOOR_UP);
  if (now - lastKey < KEY_QUIET) return 0;
  const over = lv - breath.floor - TRIG;
  return over > 0 ? Math.min(1, over / (FULL - TRIG)) : 0;
}

function resetComposeFog() {
  cFogX.globalCompositeOperation = 'source-over';
  cFogX.clearRect(0, 0, cFog.width, cFog.height);
  cFogX.fillStyle = `rgba(255,255,255,${FOG_START})`; cFogX.fillRect(0, 0, cFog.width, cFog.height);
}
function composeUI() {
  $('recBtn').hidden = true; $('retakeBtn').hidden = false; $('sendBtn').hidden = false;
  $('retakeBtn').textContent = '지우기';
  $('cHint').textContent = '● 실시간 · 입김으로 김을 서리게 하고, 손가락으로 써서 보내세요';
}
async function startCam() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30 } }, audio: false });
    usingSynth = false;
  } catch (e) {
    camStream = synthStream('#e8c4a2'); usingSynth = true;
    toast(e.name === 'NotAllowedError' ? '카메라 권한이 없어 연습용 화면으로 진행해요' : '카메라를 쓸 수 없어 연습용 화면으로 진행해요', 4500);
  }
  camVideo.srcObject = camStream;
  await camVideo.play();
}
function stopCam() {
  if (camStream) { if (camStream.stopSynth) camStream.stopSynth(); else for (const t of camStream.getTracks()) t.stop(); }
  camStream = null; camVideo.srcObject = null;
}

$('composeBtn').onclick = async () => {
  breath.actx = new (window.AudioContext || window.webkitAudioContext)(); // created inside the tap
  show('s-compose');
  cStage.layout(); resizeKeep(cFog, cStage.W, cStage.H); resetComposeFog();
  composeUI(); prevBlob = null; $('sendBtn').disabled = false; $('sendBtn').textContent = '보내기';
  cOn = true; requestAnimationFrame(cLoop);
  await startCam();
  startSeg();
  try { await startMic(); }
  catch (e) { $('cHint').textContent = '마이크를 쓸 수 없어요 — 「꾹 눌러 김」으로 김을 서리게 하세요'; }
};
function closeCompose() {
  cOn = false; drawing = false; holding = false;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null; prevBlob = null;
  stopCam(); stopMic();
  clipVideo.pause(); clipVideo.removeAttribute('src'); clipVideo.load();
  if (clipURL) URL.revokeObjectURL(clipURL);
  clipURL = null; clipBlob = null;
  show(curRoom ? 's-room' : 's-rooms');
}
$('cClose').onclick = closeCompose;

function breathe(s) {
  const W = cFog.width, H = cFog.height, short = Math.min(W, H), R = REACH * short * (0.55 + 0.45 * s);
  const cx = W / 2, cy = H * 0.58 + 0.05 * short;
  cFogX.globalCompositeOperation = 'source-over';
  for (let i = 0; i < BLOBS; i++) {
    const a = Math.random() * Math.PI * 2, d = R * (Math.random() + Math.random()) * 0.5;
    const r = short * (0.07 + 0.09 * Math.random()) * (0.7 + 0.5 * s);
    softDisc(cFogX, cx + Math.cos(a) * d, cy + Math.sin(a) * d / SPREAD_X, r, BLOB_ALPHA * s);
  }
}
function cLoop(now) {
  if (!cOn) return;
  requestAnimationFrame(cLoop);
  cFrame++;
  const s = Math.max(breathStrength(now), holding ? 1 : 0);
  if (!drawing && s > 0 && cFrame % 2 === 0) breathe(s);
  if (recorder && !rolling && now - segStart > MAX_SEG) rollSeg();
  cStage.render(camVideo, cFog);
}

// finger drawing = subtracting from the fog
function eraseDot(p) {
  cFogX.globalCompositeOperation = 'destination-out'; cFogX.fillStyle = '#000';
  cFogX.beginPath(); cFogX.arc(p.x, p.y, brushR * cStage.dpr, 0, Math.PI * 2); cFogX.fill();
  cFogX.globalCompositeOperation = 'source-over';
}
function strokeTo(p) {
  if (Math.hypot(p.x - lastPt.x, p.y - lastPt.y) < TREMOR * cFog.width) return;
  const mid = { x: (lastPt.x + p.x) / 2, y: (lastPt.y + p.y) / 2 };
  cFogX.globalCompositeOperation = 'destination-out';
  cFogX.lineCap = 'round'; cFogX.lineJoin = 'round'; cFogX.lineWidth = 2 * brushR * cStage.dpr; cFogX.strokeStyle = '#000';
  cFogX.beginPath(); cFogX.moveTo(lastMid.x, lastMid.y); cFogX.quadraticCurveTo(lastPt.x, lastPt.y, mid.x, mid.y); cFogX.stroke();
  cFogX.globalCompositeOperation = 'source-over';
  lastMid = mid; lastPt = p;
}
const cCanvas = $('cCanvas');
cCanvas.addEventListener('pointerdown', e => {
  if (!cOn) return;
  cCanvas.setPointerCapture(e.pointerId);
  drawing = true; lastPt = lastMid = cStage.point(e); eraseDot(lastPt);
});
cCanvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) strokeTo(cStage.point(ev));
});
for (const t of ['pointerup', 'pointercancel']) cCanvas.addEventListener(t, () => { drawing = false; });
$('brush').oninput = e => { brushR = +e.target.value; };

const fh = $('fogHold');
fh.addEventListener('pointerdown', e => { e.preventDefault(); holding = true; });
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) fh.addEventListener(t, () => { holding = false; });
fh.addEventListener('contextmenu', e => e.preventDefault());

// live recording: always rolling while the screen is open; send takes what was just recorded
const MAX_SEG = 15000, MIN_SEG = 2000;
let segStart = 0, prevBlob = null, rolling = false;
function startSeg() {
  if (!window.MediaRecorder) { toast('이 브라우저는 영상 녹화를 지원하지 않아요'); $('sendBtn').disabled = true; return; }
  const mime = MIMES.find(m => MediaRecorder.isTypeSupported(m));
  const opts = { videoBitsPerSecond: 1200000 }; if (mime) opts.mimeType = mime;
  const r = new MediaRecorder(camStream, opts), chunks = [];
  r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  r.done = new Promise(res => { r.onstop = () => res(new Blob(chunks, { type: r.mimeType || mime || 'video/webm' })); });
  r.start();
  recorder = r; segStart = performance.now();
}
function stopRec(r) { if (r.state !== 'inactive') r.stop(); return r.done; }
async function rollSeg() { // past 15s: keep the finished piece in case send comes right after the restart
  rolling = true;
  const old = recorder; startSeg();
  prevBlob = await stopRec(old);
  rolling = false;
}
$('retakeBtn').onclick = () => { resetComposeFog(); };
function makeMask() { // the fog itself travels with the message as a small PNG
  const [m, mx] = mk(); m.width = 270; m.height = 480;
  mx.drawImage(cFog, 0, 0, 270, 480);
  return m.toDataURL('image/png');
}
$('sendBtn').onclick = async () => {
  if (!recorder || !curRoom) return;
  const btn = $('sendBtn'); btn.disabled = true; btn.textContent = '보내는 중…';
  try {
    const mask = makeMask(), room = curRoom, r = recorder, short = performance.now() - segStart < MIN_SEG;
    recorder = null;
    let blob = await stopRec(r);
    if (short && prevBlob) blob = prevBlob;
    await api.send(room, blob, mask);
    closeCompose();
    toast('보냈어요 ✦');
  } catch (e) {
    btn.disabled = false; btn.textContent = '보내기';
    throw e;
  }
};

// ───────── view: arrives fogged, wipe to read, fogs back ─────────
const vStage = new Stage($('vCanvas'));
const [vSend, vSendX] = mk(), [vArr, vArrX] = mk(), [vComb, vCombX] = mk();
const viewVideo = $('viewVideo');
let vOn = false, vImg = null, vSynth = null, touching = false, lastTouch = 0, wLast = null, wAcc = 0;

function vSizes() {
  vStage.layout();
  for (const c of [vSend, vArr, vComb]) resizeKeep(c, vStage.W, vStage.H);
  if (vImg) { vSendX.clearRect(0, 0, vSend.width, vSend.height); vSendX.drawImage(vImg, 0, 0, vSend.width, vSend.height); }
}
async function openView(m) {
  show('s-view');
  $('vHint').style.opacity = '1';
  vImg = null; vSizes();
  vArrX.globalCompositeOperation = 'source-over';
  vArrX.clearRect(0, 0, vArr.width, vArr.height);
  vArrX.fillStyle = 'rgba(255,255,255,0.92)'; vArrX.fillRect(0, 0, vArr.width, vArr.height);
  vSendX.clearRect(0, 0, vSend.width, vSend.height);
  vOn = true; lastTouch = performance.now();
  requestAnimationFrame(vLoop);
  const img = new Image(); img.src = m.mask; await img.decode();
  vImg = img; vSizes();
  if (m.video.startsWith('synth:')) { vSynth = synthStream('#c99a78'); viewVideo.srcObject = vSynth; }
  else viewVideo.src = m.video;
  await viewVideo.play();
}
function closeView() {
  vOn = false; touching = false;
  viewVideo.pause();
  if (vSynth) { vSynth.stopSynth(); vSynth = null; viewVideo.srcObject = null; }
  viewVideo.removeAttribute('src'); viewVideo.load();
  show(curRoom ? 's-room' : 's-rooms');
}
$('vClose').onclick = closeView;
function vLoop(now) {
  if (!vOn) return;
  requestAnimationFrame(vLoop);
  if (!touching && now - lastTouch > REFOG_DELAY) { // the mirror fogs back up
    vArrX.fillStyle = `rgba(255,255,255,${REFOG_RATE})`; vArrX.fillRect(0, 0, vArr.width, vArr.height);
  }
  vCombX.clearRect(0, 0, vComb.width, vComb.height);
  vCombX.drawImage(vSend, 0, 0); vCombX.drawImage(vArr, 0, 0);
  vStage.render(viewVideo, vComb);
}
function wipeTo(cur) { // per distance, capped, jump-guarded
  const r = VIEW_WIPE_R * vStage.dpr;
  const dx = cur.x - wLast.x, dy = cur.y - wLast.y, d = Math.hypot(dx, dy);
  if (d === 0) return;
  if (d > WIPE_JUMP * vArr.width) { wipeStamp(vArrX, cur, r); wLast = cur; wAcc = 0; return; }
  const step = r / 2, ux = dx / d, uy = dy / d;
  let px = wLast.x, py = wLast.y, remain = d, n = 0;
  while (wAcc + remain >= step && n < WIPE_MAX) {
    const need = step - wAcc;
    px += ux * need; py += uy * need; remain -= need; wAcc = 0;
    wipeStamp(vArrX, { x: px, y: py }, r); n++;
  }
  wAcc = n >= WIPE_MAX ? 0 : wAcc + remain;
  wLast = cur;
}
const vCanvas = $('vCanvas');
vCanvas.addEventListener('pointerdown', e => {
  if (!vOn) return;
  vCanvas.setPointerCapture(e.pointerId);
  touching = true; lastTouch = performance.now(); $('vHint').style.opacity = '0';
  wLast = vStage.point(e); wAcc = 0; wipeStamp(vArrX, wLast, VIEW_WIPE_R * vStage.dpr);
});
vCanvas.addEventListener('pointermove', e => {
  if (!touching) return;
  lastTouch = performance.now();
  for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) wipeTo(vStage.point(ev));
});
for (const t of ['pointerup', 'pointercancel']) vCanvas.addEventListener(t, () => { touching = false; lastTouch = performance.now(); });

// ───────── global ─────────
addEventListener('resize', () => {
  if (cOn) { cStage.layout(); resizeKeep(cFog, cStage.W, cStage.H); }
  if (vOn) vSizes();
});
addEventListener('keydown', e => {
  lastKey = performance.now();
  if (cOn && e.code === 'Space') { e.preventDefault(); holding = true; }
});
addEventListener('keyup', e => { if (e.code === 'Space') holding = false; });
// Android back button (called by the app shell); true = handled
window.fogBack = () => {
  if (cOn) { closeCompose(); return true; }
  if (vOn) { closeView(); return true; }
  if (curRoom) { closeRoomWatch(); show('s-rooms'); return true; }
  return false;
};
