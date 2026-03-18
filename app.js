// ── UID REGISTRY — safe data passing without JSON in onclick ──
const _reg = [];
function _r(val){ const i = _reg.length; _reg.push(val); return i; }
function _g(i){ return _reg[i]; }

// ── FIREBASE INIT ─────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCxDRIL9XOeA7d-yqXF84tndWPZY8JxLSY",
  authDomain: "kezz-media.firebaseapp.com",
  projectId: "kezz-media",
  storageBucket: "kezz-media.firebasestorage.app",
  messagingSenderId: "307892917050",
  appId: "1:307892917050:web:5b318f4039affaa26b3603"
};
firebase.initializeApp(firebaseConfig);
const db      = firebase.firestore();
const storage = firebase.storage();
const auth    = firebase.auth();

// Enable Firestore offline persistence so posts survive page refreshes
db.enablePersistence({synchronizeTabs:true}).catch(()=>{});

// ── FIREBASE HELPERS ──────────────────────────────────
const postsCol   = () => db.collection('posts');
const profileDoc = (uid) => db.collection('profiles').doc(uid);

// Upload image: try Cloudinary first, fall back to Firebase Storage, fall back to base64
async function uploadToStorage(base64, path) {
  // Try Cloudinary
  try {
    const blob = await fetch(base64).then(r => r.blob());
    const form = new FormData();
    form.append('file', blob);
    form.append('upload_preset', 'kezz_media');
    const res  = await fetch('https://api.cloudinary.com/v1_1/dyspuqa0s/image/upload', {method:'POST', body:form});
    const data = await res.json();
    if(data.secure_url) return data.secure_url;
  } catch(e) {}
  // Try Firebase Storage
  try {
    const ref  = storage.ref(path);
    const snap = await ref.putString(base64, 'data_url');
    return await snap.ref.getDownloadURL();
  } catch(e) {}
  // Final fallback: return base64 directly (works offline)
  return base64;
}

// ── DUMMY SEED POSTS (fixed IDs so they never duplicate) ──
const DUMMY_POST_IDS = ['dummy_1','dummy_2','dummy_3'];

async function seedDummyPosts() {
  try {
    const doc = await postsCol().doc('dummy_1').get();
    if(!doc.exists) {
      const batch = db.batch();
      SAMPLE_POSTS.forEach((p, i) => {
        const ts = firebase.firestore.Timestamp.fromMillis(Date.now() - (i+1)*3600000);
        batch.set(postsCol().doc(DUMMY_POST_IDS[i]), {
          ...p,
          id: DUMMY_POST_IDS[i],
          uid: 'system',
          createdAt: ts
        });
      });
      await batch.commit();
    }
  } catch(e) {
    console.warn('Could not seed dummy posts:', e.message);
  }
}

function startPostsListener() {
  showSkeletons('feed',4);
  postsCol().orderBy('createdAt','desc').onSnapshot(snap => {
    posts = snap.docs.map(d => {
      const data = d.data();
      const likedBy = Array.isArray(data.likedBy) ? data.likedBy : [];
      data.liked = likedBy.includes(me.uid);
      data.likedBy = likedBy;
      if(!data.comments) data.comments=[];
      return data;
    });
    renderFeed();
    renderExploreFeed();
    if(currentView==='profile')  refreshProfile();
    if(currentView==='settings') refreshAdmin();
    // Detect orphan comment handles (e.g. old usernames after a name change)
    // Run once after first posts load; allUsers should be ready by then
    if(!window._orphanCheckDone && Object.keys(allUsers).length){
      window._orphanCheckDone = true;
      setTimeout(checkOrphanCommentHandles, 1500);
    }
  }, err => {
    console.warn('Firestore listener error:', err.code, err.message);
    if(err.code === 'permission-denied') {
      toast('⚠️ Firebase rules blocking access — see instructions below');
    } else {
      toast('⚠️ Could not reach database: ' + err.message);
    }
  });
}

async function savePostToFirestore(p) {
  await postsCol().doc(String(p.id)).set({
    ...p,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}
async function updatePostField(id, updates) {
  try { await postsCol().doc(String(id)).update(updates); } catch(e) {}
}
async function deletePostFromFirestore(id) {
  await postsCol().doc(String(id)).delete();
}
async function loadProfile(uid) {
  if(!uid) return;
  try {
    // Race profile load against a 5s timeout so init() never hangs on bad network
    const profilePromise = profileDoc(uid).get();
    const timeoutPromise = new Promise(function(res){ setTimeout(res, 5000); });
    const doc = await Promise.race([profilePromise, timeoutPromise]);
    if(doc && doc.exists) Object.assign(me, doc.data());
  } catch(e) { /* offline, use defaults */ }
}
async function saveProfileToFirestore() {
  if(!me.uid) return;
  try { await profileDoc(me.uid).set(me); } catch(e) {}
}

// ── STATE ────────────────────────────────────────────
const USERS = [
  {name:'Alex Rivera', handle:'alex_r',  color:'linear-gradient(135deg,#a78bfa,#7c3aed)', initial:'A', followers:2100},
  {name:'Mia Chen',    handle:'mia.chen',color:'linear-gradient(135deg,#f9a8d4,#e879a3)', initial:'M', followers:8400},
  {name:'Kai Tanaka',  handle:'kai_t',   color:'linear-gradient(135deg,#6ee7f7,#2dd4bf)', initial:'K', followers:1300},
  {name:'Sofia Reyes', handle:'sofi_r',  color:'linear-gradient(135deg,#86efac,#22c55e)', initial:'S', followers:5700},
  {name:"Liam O'Brien",handle:'liam.ob', color:'linear-gradient(135deg,#fde68a,#f59e0b)', initial:'L', followers:980},
];

let me = {};

const SAMPLE_POSTS = [
  {id:'dummy_1', uid:'system', user:USERS[1], images:['https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80'], image:'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80', caption:'Sunday mornings are made for slow coffee and slower scrolling ✨', likes:142, liked:false, comments:[{user:USERS[0],text:"Honestly same ☕"},{user:USERS[3],text:"Can I join? 🙋‍♀️"}], saved:false, time:'2h ago', showComments:true},
  {id:'dummy_2', uid:'system', user:USERS[3], images:['https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80','https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80'], image:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', caption:'Golden hour never misses 🌅 #sunset #photography', likes:389, liked:false, comments:[{user:USERS[2],text:"This is stunning!"}], saved:false, time:'5h ago', showComments:false},
  {id:'dummy_3', uid:'system', user:USERS[0], images:['https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&q=80'], image:'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&q=80', caption:'New project just dropped — been working on this for months!', likes:54, liked:false, comments:[], saved:false, time:'11h ago', showComments:false},
];

let posts = []; // filled by Firestore onSnapshot listener
let uploadImages = []; // array of base64 strings
let toastTimer, currentConvo = null;

const CONVOS = [
  {id:1, user:USERS[1], unread:true,  messages:[{from:'them',text:"Hey! Loved your latest post 😍", time:'2:14 PM'},{from:'me',text:"Thank you so much!! 💖",time:'2:16 PM'},{from:'them',text:"When are you posting next?",time:'2:17 PM'}]},
  {id:2, user:USERS[0], unread:true,  messages:[{from:'them',text:"Can we collab sometime?",time:'Yesterday'},{from:'me',text:"Yes for sure! Let's plan it",time:'Yesterday'}]},
  {id:3, user:USERS[2], unread:false, messages:[{from:'them',text:"Your feed is so aesthetic 🌸",time:'Monday'},{from:'me',text:"Aww that means so much!",time:'Monday'}]},
  {id:4, user:USERS[3], unread:false, messages:[{from:'them',text:"Following you now!",time:'Last week'}]},
  {id:5, user:USERS[4], unread:false, messages:[{from:'them',text:"Love the vibes here ✨",time:'Last week'}]},
];

// ── NOTIFICATIONS (Firestore-backed) ─────────────────
let notifUnsubscribe = null;
async function sendNotification(toUid, type, fromUser, extra){
  // type: 'like'|'comment'|'follow'|'message'
  if(!toUid || toUid===me.uid || toUid==='system') return;
  try{
    await db.collection('notifications').add({
      toUid, type,
      fromUid: me.uid,
      fromName: me.name||me.handle,
      fromHandle: me.handle,
      fromColor: me.color,
      fromInitial: me.initial,
      fromAvatar: me.avatar||null,
      extra: extra||'',
      read: false,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
  }catch(e){}
}
function watchNotifications(){
  if(!me.uid) return;
  if(notifUnsubscribe){ notifUnsubscribe(); notifUnsubscribe=null; }

  // Track IDs we've already seen so we only popup truly new ones
  var _seenNotifIds = new Set();
  var _firstNotifLoad = true;

  notifUnsubscribe = db.collection('notifications')
    .where('toUid','==',me.uid)
    .onSnapshot(function(snap){
      // Sort newest first client-side
      const sorted = snap.docs.slice().sort(function(a,b){
        const da=a.data(), db_=b.data();
        const ta=da.ts?(da.ts.toMillis?da.ts.toMillis():da.ts.seconds?da.ts.seconds*1000:0):0;
        const tb=db_.ts?(db_.ts.toMillis?db_.ts.toMillis():db_.ts.seconds?db_.ts.seconds*1000:0):0;
        return tb-ta;
      });

      // Find truly NEW notifications (not in our seen set, unread, not from self)
      const brandNew = snap.docChanges().filter(function(change){
        if(change.type !== 'added') return false;
        const n = change.doc.data();
        // On first load, seed seen IDs but don't popup (these are old notifs)
        if(_firstNotifLoad){ _seenNotifIds.add(change.doc.id); return false; }
        if(_seenNotifIds.has(change.doc.id)) return false;
        if(n.read) return false;
        if(n.fromUid === me.uid) return false;
        _seenNotifIds.add(change.doc.id);
        return true;
      });

      _firstNotifLoad = false;

      // Show popup for each new notification
      brandNew.forEach(function(change){
        showNotifPopup(change.doc.id, change.doc.data());
      });

      // Update all badges
      const count = sorted.filter(function(d){return !d.data().read;}).length;
      ['notifBadge','mnNotifBadge','mobNotifBadge','mobTopNotifBadge'].forEach(function(id){
        const el=document.getElementById(id);
        if(!el) return;
        el.textContent=count;
        if(id==='notifBadge') el.classList.toggle('hidden',!count);
        else el.style.display=count?'':'none';
      });
      // Refresh notifs view if open
      const nv=document.getElementById('view-notifs');
      if(nv && nv.classList.contains('active')) renderNotifs(sorted);
    }, function(err){ console.warn('notif listener:', err.message); });
}

// Show a sliding popup card for an incoming notification
function showNotifPopup(nid, n){
  const icons  = {like:'❤️', comment:'💬', follow:'👤', message:'✉️'};
  const texts  = {like:'liked your post', comment:'commented on your post',
                  follow:'started following you', message:'sent you a message'};
  const container = document.getElementById('notifPopup');
  if(!container) return;

  const item = document.createElement('div');
  item.className = 'notif-popup-item';
  item.innerHTML =
    '<div class="notif-popup-av" style="background:'+(n.fromColor||'var(--pink)')+';">'
      +(n.fromAvatar
        ? '<img src="'+n.fromAvatar+'" alt="">'
        : esc(n.fromInitial||'?'))
    +'</div>'
    +'<div class="notif-popup-icon">'+(icons[n.type]||'🔔')+'</div>'
    +'<div class="notif-popup-body">'
      +'<strong>'+esc(n.fromName||n.fromHandle||'Someone')+'</strong> '
      +'<span>'+(texts[n.type]||n.type)+'</span>'
      +(n.extra ? '<em>'+esc(n.extra.slice(0,50))+'</em>' : '')
    +'</div>'
    +'<button class="notif-popup-close" title="Dismiss">×</button>';

  // Click popup body → go to notifications
  item.addEventListener('click', function(e){
    if(e.target.classList.contains('notif-popup-close')) return;
    goTo('notifs');
    db.collection('notifications').doc(nid).update({read:true}).catch(()=>{});
    dismissPopup(item);
  });

  // Click × → just dismiss
  item.querySelector('.notif-popup-close').addEventListener('click', function(e){
    e.stopPropagation();
    dismissPopup(item);
  });

  container.appendChild(item);
  // Trigger slide-in on next frame
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ item.classList.add('show'); });
  });

  // Auto-dismiss after 5 seconds
  var autoTimer = setTimeout(function(){ dismissPopup(item); }, 5000);
  item._autoTimer = autoTimer;
}

function dismissPopup(item){
  clearTimeout(item._autoTimer);
  item.classList.remove('show');
  item.classList.add('hide');
  setTimeout(function(){ if(item.parentNode) item.parentNode.removeChild(item); }, 400);
}
function renderNotifs(docs){
  const list=document.getElementById('notifList');
  if(!list) return;
  list.innerHTML='';
  // If called without docs, fetch them
  if(!docs){
    db.collection('notifications').where('toUid','==',me.uid).limit(50).get().then(function(snap){
      const sorted=snap.docs.slice().sort(function(a,b){
        const ta=a.data().ts?(a.data().ts.toMillis?a.data().ts.toMillis():0):0;
        const tb=b.data().ts?(b.data().ts.toMillis?b.data().ts.toMillis():0):0;
        return tb-ta;
      });
      renderNotifs(sorted);
    });
    return;
  }
  if(!docs.length){
    list.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3);font-size:14px;">No notifications yet 🌸</div>';
    return;
  }
  const icons={like:'❤️',comment:'💬',follow:'👤',message:'✉️',mention:'@'};
  const texts={like:'liked your post',comment:'commented on your post',follow:'started following you',message:'sent you a message',mention:'mentioned you'};
  docs.forEach(d=>{
    const n=d.data(); const nid=d.id;
    const div=document.createElement('div');
    div.className='notif-item'+(n.read?'':' unread');
    div.innerHTML=
      '<div class="notif-av" style="background:'+(n.fromColor||'var(--pink)')+';color:white;">'
        +(n.fromAvatar?'<img src="'+n.fromAvatar+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">':esc(n.fromInitial||'?'))
      +'</div>'
      +'<div class="notif-icon">'+(icons[n.type]||'🔔')+'</div>'
      +'<div class="notif-text"><strong>'+esc(n.fromName||n.fromHandle||'Someone')+'</strong> '+(texts[n.type]||n.type)+(n.extra?' — <em>'+esc(n.extra.slice(0,40))+'</em>':'')+'</div>'
      +'<div class="notif-time" title="'+fullDate(n.ts)+'">'+timeAgo(n.ts)+'</div>';
    div.addEventListener('click',function(){
      if(!n.read) db.collection('notifications').doc(nid).update({read:true}).catch(()=>{});
      div.classList.remove('unread');
    });
    list.appendChild(div);
  });
  // update unread count label
  const unread=docs.filter(d=>!d.data().read).length;
  const uc=document.getElementById('unreadCount');
  if(uc) uc.textContent=unread?unread+' unread':'All caught up ✓';
}
function markAllRead(){
  db.collection('notifications').where('toUid','==',me.uid).where('read','==',false).get().then(snap=>{
    const batch=db.batch();
    snap.docs.forEach(d=>batch.update(d.ref,{read:true}));
    return batch.commit();
  }).then(()=>{
    toast('All notifications marked as read ✓');
    renderNotifs([]);
  }).catch(()=>toast('Could not mark as read'));
}
function updateNotifBadges(){}// now handled by watchNotifications


const COLORS = [
  'linear-gradient(135deg,#e2688a,#f0a0b8)',
  'linear-gradient(135deg,#a78bfa,#7c3aed)',
  'linear-gradient(135deg,#f9a8d4,#e879a3)',
  'linear-gradient(135deg,#6ee7f7,#2dd4bf)',
  'linear-gradient(135deg,#86efac,#22c55e)',
  'linear-gradient(135deg,#fde68a,#f59e0b)',
  'linear-gradient(135deg,#f97316,#ef4444)',
  'linear-gradient(135deg,#60a5fa,#2563eb)',
];

const BANNER_COLORS = [
  'linear-gradient(135deg,#f4a8c0,#e2688a,#c93f6e)',
  'linear-gradient(135deg,#c9b8ff,#a78bfa,#7c3aed)',
  'linear-gradient(135deg,#99f6e4,#2dd4bf,#0d9488)',
  'linear-gradient(135deg,#fde68a,#f59e0b,#d97706)',
  'linear-gradient(135deg,#bfdbfe,#60a5fa,#2563eb)',
  'linear-gradient(135deg,#fbcfe8,#f472b6,#db2777)',
];

// ── THEME ─────────────────────────────────────────────
let isDark = localStorage.getItem('kez_theme')==='dark';
const MOON='<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const SUN='<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
function applyTheme(){
  document.documentElement.setAttribute('data-theme',isDark?'dark':'light');
  document.getElementById('themeIcon').innerHTML=isDark?MOON:SUN;
  const dt=document.getElementById('darkToggle');if(dt)dt.checked=isDark;
}
function toggleTheme(){
  isDark=!isDark;
  localStorage.setItem('kez_theme',isDark?'dark':'light');
  applyTheme();
  // Keep browser tab/status bar color in sync with theme
  var tc = document.querySelector('meta[name=theme-color]');
  if(tc) tc.content = isDark ? '#1c1118' : '#e2688a';
}
applyTheme();

// ── NAVIGATION ────────────────────────────────────────
let currentView='home';
let previousView = 'home';
function goTo(view){
  previousView = currentView || 'home';
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.menu-item').forEach(m=>m.classList.remove('active'));
  const viewEl = document.getElementById('view-'+view);
  if(!viewEl){ console.warn('No view:', view); return; }
  viewEl.classList.add('active');
  const mn = document.getElementById('mn-'+view);
  if(mn) mn.classList.add('active');
  currentView = view;
  const layout = document.querySelector('.layout');
  if(view==='profile'||view==='other-profile'){ layout.classList.add('profile-mode'); }
  else{ layout.classList.remove('profile-mode'); }
  if(view==='profile') refreshProfile();
  if(view==='other-profile') loadOtherProfile(currentOtherProfileUid);
  if(view==='notifs') renderNotifs();
  if(view==='search') searchPageUsers(document.getElementById('searchPageInput')?.value||'');
  if(view==='admin') refreshAdminDashboard();
  if(view==='messages') loadDMConvos();
  if(view==='settings') refreshSettings();
  window.scrollTo({top:0,behavior:'smooth'});
}

function goSettings(section){goTo('settings');setTimeout(()=>switchSettingsNav(section),50);}

// ── INIT ──────────────────────────────────────────────
async function init(){
  await loadProfile(me.uid);
  if(me.banned){ auth.signOut(); toast('Your account has been suspended.'); return; }
  applyTheme();
  applyUserProfile();
  loadStories();
  renderSuggested();
  renderTrending();
  renderColorSwatches();
  renderBannerSwatches();
  renderProfileThemeGrid();
  // Restore saved profile theme and layout
  if(me.profileTheme !== undefined) applyProfileTheme(me.profileTheme);
  if(me.profileLayout) setProfileLayout(me.profileLayout);
  updateNotifBadges();
  updateMsgBadges();
  // Wait for allUsers to be populated BEFORE starting the posts listener.
  // This guarantees buildCard always reads live names/handles/avatars
  // from allUsers on first render, never the stale p.user from Firestore.
  await watchUsersAndWait();
  loadDMConvos();
  watchNotifications();
  startPresence();
  watchPresence();
  await seedDummyPosts();
  await seedDummyStories();
  startPostsListener();
}

// ── USER PROFILE ──────────────────────────────────────
function applyUserProfile(){
  me.initial = me.name ? me.name.trim()[0].toUpperCase() : 'Y';
  // nav + create avatars
  ['navAvatar','createAvatar'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    if(me.avatar){el.innerHTML=`<img src="${me.avatar}" alt="">`;el.style.background='none';}
    else{el.textContent=me.initial;el.style.background=me.color;}
  });
  // profile avatar
  const pa=document.getElementById('profileAv');
  const pai=document.getElementById('profileAvInitial');
  if(pa&&pai){
    if(me.avatar){pai.innerHTML=`<img src="${me.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;pa.style.background='none';}
    else{pai.textContent=me.initial;pa.style.background=me.color;}
    const overlay=pa.querySelector('.profile-av-overlay');if(overlay)pa.appendChild(overlay);
  }
  // banner
  const banner=document.getElementById('profileBanner');
  const bi=document.getElementById('bannerImg');
  if(banner&&bi){
    if(me.bannerImage){bi.src=me.bannerImage;bi.style.display='block';banner.style.background='none';}
    else{bi.style.display='none';banner.style.background=me.bannerColor||'linear-gradient(135deg,#f4a8c0,#e2688a,#c93f6e)';}
  }
  // sidebar
  const sa=document.getElementById('sidebarProfileAv');if(sa){sa.style.background=me.color;sa.textContent=me.initial;}
  const sbn=document.getElementById('sidebarName');if(sbn)sbn.textContent=me.name||'You';
  // profile text
  const pn=document.getElementById('profileName');if(pn)pn.textContent=me.name||'Your Name';
  const ph=document.getElementById('profileHandle');if(ph)ph.textContent='@'+(me.handle||'you');
  const pb=document.getElementById('profileBio');if(pb)pb.textContent=me.bio||'✨ Welcome to my Kez Media profile!';
  // edit fields
  const en=document.getElementById('editName');if(en)en.value=me.name||'';
  const eh=document.getElementById('editHandle');if(eh)eh.value=me.handle||'';
  const eb=document.getElementById('editBio');if(eb)eb.value=me.bio||'';
}

function saveProfile(){
  const n=document.getElementById('editName').value.trim();
  const h=document.getElementById('editHandle').value.trim().replace('@','');
  const b=document.getElementById('editBio').value.trim();
  if(!n){toast('Name cannot be empty');return;}
  // Capture OLD handle BEFORE we overwrite me.handle — needed to find old comments
  const oldHandle = me.handle;
  const newHandle = h||'you';
  // Auto-track handle history so future migrations can always find old comments
  if(oldHandle && oldHandle !== newHandle){
    if(!Array.isArray(me.previousHandles)) me.previousHandles = [];
    if(!me.previousHandles.includes(oldHandle)) me.previousHandles.push(oldHandle);
  }
  me.name=n; me.handle=newHandle; me.bio=b;
  me.initial = n.charAt(0).toUpperCase();
  saveProfileToFirestore();
  applyUserProfile();
  refreshProfile();
  // Update all past posts AND comments in Firestore with new name/handle
  updateMyPostsAuthorInfo(oldHandle);
  toast('Profile saved! ✓');
}

async function updateMyPostsAuthorInfo(oldHandle){
  // The full user object we want everywhere — now includes uid so future lookups work
  const updatedUser = {
    uid:     me.uid,
    name:    me.name,
    handle:  me.handle,
    initial: me.initial,
    color:   me.color,
    avatar:  me.avatar || null
  };

  // ── 1. Update local posts array instantly ──────────────
  posts.forEach(function(p){
    // Update post author
    if(p.uid === me.uid && p.user) Object.assign(p.user, updatedUser);
    // Update every comment in every post that belongs to me
    // Match by uid (new comments) OR by old handle (old comments without uid)
    if(p.comments && p.comments.length){
      p.comments.forEach(function(c){
        if(!c.user) return;
        const isMine = c.user.uid === me.uid ||
                       (oldHandle && c.user.handle === oldHandle);
        if(isMine) Object.assign(c.user, updatedUser);
      });
    }
  });
  renderFeed();
  renderExploreFeed();

  // ── 2. Firestore: update post.user on own posts ────────
  try{
    const snap = await postsCol().where('uid','==',me.uid).get();
    if(!snap.empty){
      const docs = snap.docs;
      for(let i=0; i<docs.length; i+=400){
        const batch = db.batch();
        docs.slice(i,i+400).forEach(function(d){
          batch.update(d.ref, {user: updatedUser});
        });
        await batch.commit();
      }
    }
  } catch(e){}

  // ── 3. Firestore: update comments across ALL posts ─────
  // Use the already-loaded posts array to avoid a full collection scan
  try{
    const postsWithMyComments = posts.filter(function(p){
      return p.comments && p.comments.some(function(c){
        if(!c.user) return false;
        return c.user.uid === me.uid ||
               (oldHandle && c.user.handle === oldHandle);
      });
    });

    if(postsWithMyComments.length){
      for(let i=0; i<postsWithMyComments.length; i+=400){
        const batch = db.batch();
        postsWithMyComments.slice(i,i+400).forEach(function(p){
          const newComments = p.comments.map(function(c){
            if(!c.user) return c;
            const isMine = c.user.uid === me.uid ||
                           (oldHandle && c.user.handle === oldHandle);
            if(!isMine) return c;
            return Object.assign({}, c, {user: Object.assign({}, c.user, updatedUser)});
          });
          batch.update(postsCol().doc(String(p.id)), {comments: newComments});
        });
        await batch.commit();
      }
      toast('Profile + all comments updated ✓');
    } else {
      toast('Profile + posts updated ✓');
    }
  } catch(e){ toast('Profile updated ✓'); }
}

function uploadAvatar(inp){
  const f=inp.files[0];if(!f)return;
  toast('Uploading photo...');
  const r=new FileReader();
  r.onload=async e=>{
    try{
      const url=await uploadToStorage(e.target.result,`avatars/me_${Date.now()}`);
      me.avatar=url;
    }catch(err){
      me.avatar=e.target.result; // fallback to base64
    }
    saveProfileToFirestore();applyUserProfile();
    updateMyPostsAuthorInfo();
    toast('Profile photo updated! ✓');
  };
  r.readAsDataURL(f);
}

// ── STORIES ───────────────────────────────────────────
function renderStories(){
  const row=document.getElementById('storiesRow');
  while(row.children.length>1)row.removeChild(row.lastChild);
  USERS.forEach((u,i)=>{
    const d=document.createElement('div');d.className='story-item';
    d.innerHTML=`<div class="story-ring ${i>1?'seen':''}"><div class="story-avatar" style="background:${u.color};color:white;">${u.initial}</div></div><div class="story-name">${u.name.split(' ')[0]}</div>`;
    d.onclick=()=>toast(`${u.name}'s story`);row.appendChild(d);
  });
}

// ── FEED ──────────────────────────────────────────────
function showSkeletons(containerId,count){
  count=count||3;
  var el=document.getElementById(containerId);
  if(!el)return;
  var h='';
  for(var i=0;i<count;i++){
    h+='<div class="skel-card"><div class="skel-header"><div class="skel-av skeleton"></div><div style="flex:1"><div class="skel-line skeleton" style="width:40%"></div><div class="skel-line skeleton" style="width:25%;margin-top:4px"></div></div></div><div class="skel-img skeleton"></div><div class="skel-line skeleton" style="width:70%"></div><div class="skel-line skeleton" style="width:50%"></div></div>';
  }
  el.innerHTML=h;
}

function linkifyCaption(txt){
  if(!txt) return '';
  var escaped = esc(txt);
  // Hashtags: #word → clickable pink span
  escaped = escaped.replace(/(#)(\w+)/g, function(match, hash, tag){
    return '<span class="hashtag" onclick="showHashtag(this.dataset.tag)" data-tag="' + tag + '">' + hash + tag + '</span>';
  });
  // Mentions: @handle → clickable blue span
  escaped = escaped.replace(/(@)(\w+)/g, function(match, at, handle){
    return '<span class="mention" onclick="viewProfileByHandle(this.dataset.handle)" data-handle="' + handle + '">' + at + handle + '</span>';
  });
  return escaped;
}
function viewProfileByHandle(handle){
  var u=Object.values(allUsers).find(function(x){return x.handle===handle;});
  if(u) viewProfile(u.uid||u.id);
}
function showHashtag(tag){
  var tagged=posts.filter(function(p){return p.caption&&p.caption.toLowerCase().indexOf('#'+tag.toLowerCase())>-1;});
  document.getElementById('hashtagTitle').textContent='#'+tag;
  document.getElementById('hashtagCount').textContent=tagged.length+' post'+(tagged.length!==1?'s':'');
  var feed=document.getElementById('hashtagFeed');
  feed.innerHTML='';
  if(!tagged.length){feed.innerHTML='<div class="empty">No posts with #'+esc(tag)+'</div>';return;}
  tagged.forEach(function(p,i){feed.appendChild(buildCard(p,i));});
  goTo('hashtag');
}

function renderFeed(){
  const feed=document.getElementById('feed');feed.innerHTML='';
  if(!posts.length){feed.innerHTML='<div class="empty"><svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><p>No posts yet!</p></div>';return;}
  // newest first — Firestore already orders desc, so no reverse needed
  posts.forEach((p,i)=>feed.appendChild(buildCard(p,i)));
}
function renderExploreFeed(){
  const ef=document.getElementById('exploreFeed');ef.innerHTML='';
  posts.forEach((p,i)=>ef.appendChild(buildCard(p,i)));
}

function buildCard(p,i){
  const pid=String(p.id);
  const card=document.createElement('div');
  card.className='post-card';
  card.id='pc-'+pid;
  card.style.animationDelay=(i*.05)+'s';
  const own=(p.uid&&p.uid===me.uid)||isAdmin();
  const imgs=p.images||(p.image?[p.image]:[]);
  // Always prefer live profile data (allUsers) over stale post.user
  // This ensures name/handle changes show immediately on all posts
  const liveUser = (p.uid && allUsers[p.uid]) ? allUsers[p.uid] : (p.user || {});
  const userHandle=esc(liveUser.handle||'');
  const userColor=liveUser.color||'var(--pink)';
  const userInitial=esc(liveUser.initial||(liveUser.name?liveUser.name.charAt(0):'?'));
  const userAvatar=liveUser.avatar||'';

  let mediaHTML='';
  if(p.isStatus){
    mediaHTML='<div class="status-body"><p class="status-text">'+esc(p.caption||'')+'</p>'+(p.mood?'<div class="status-mood-tag">'+esc(p.mood)+'</div>':'')+'</div>';
  } else if(imgs.length===1){
    mediaHTML='<div class="carousel-wrap"><img class="card-img-click" data-src="'+encodeURIComponent(imgs[0])+'" style="width:100%;max-height:520px;object-fit:cover;display:block;cursor:pointer;" src="'+imgs[0]+'" alt="post"></div>';
  } else if(imgs.length>1){
    let slides='',dots='';
    imgs.forEach(function(src,si){slides+='<div class="carousel-slide"><img class="card-img-click" data-src="'+encodeURIComponent(src)+'" src="'+src+'" alt="post"></div>';});
    imgs.forEach(function(_,di){dots+='<span class="carousel-dot '+(di===0?'active':'')+'" data-slide="'+di+'"></span>';});
    mediaHTML='<div class="carousel-wrap" id="car-'+pid+'" data-pid="'+pid+'" data-count="'+imgs.length+'" data-idx="0">'
      +'<div class="carousel-track" id="ct-'+pid+'">'+slides+'</div>'
      +'<button class="carousel-btn carousel-prev" data-dir="-1" data-car="car-'+pid+'">&#8249;</button>'
      +'<button class="carousel-btn carousel-next" data-dir="1" data-car="car-'+pid+'">&#8250;</button>'
      +'<div class="carousel-dots" id="cd-'+pid+'">'+dots+'</div>'
      +'<div class="multi-badge">'+imgs.length+'</div>'
      +'</div>';
    setTimeout(function(){startFeedAutoSlide(pid,imgs.length);},600+i*80);
  }

  const pinnedBadge=p.pinned?'<div class="pinned-badge">📌 Pinned</div>':''; const captionRow=(!p.isStatus&&p.caption)?'<div class="post-content"><div class="post-caption"><span class="uname">@'+userHandle+'</span>'+linkifyCaption(p.caption)+'</div></div>':'';
  const commentList=(p.showComments?p.comments:p.comments.slice(-1)).map(commentHTML).join('');
  const viewAll=p.comments.length>2&&!p.showComments?'<div class="view-all" data-pid="'+pid+'">View all '+p.comments.length+' comments</div>':'';

  card.innerHTML=
    '<div class="post-header">'
      +'<div class="post-avatar card-open-profile" data-uid="'+(p.uid||'')+'" style="background:'+userColor+';cursor:pointer;">'+(userAvatar?'<img src="'+userAvatar+'" alt="">':userInitial)+'</div>'
      +'<div class="post-meta">'
        +'<div class="post-username card-open-profile" data-uid="'+(p.uid||'')+'" style="cursor:pointer;">@'+userHandle+'</div>'
        +'<div class="post-time" title="'+fullDate(p.createdAt||0)+'">'+timeAgo(p.createdAt||0)+(p.isStatus?' &middot; <span style="color:var(--pink);font-size:11px;">status</span>':'')+'</div>'
      +'</div>'
      +'<button class="post-more" data-menu="pm-'+pid+'">'
        +'<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>'
      +'</button>'
      +'<div class="post-menu" id="pm-'+pid+'">'
        +(own?'<div class="pm-item" data-editpost="'+pid+'">✏️ Edit Caption</div><div class="pm-item" data-pinpost="'+pid+'">'+(p.pinned?'📌 Unpin Post':'📌 Pin to Top')+'</div><div class="pm-item danger" data-delete="'+pid+'">🗑 Delete</div>':'')
        +(!own?'<div class="pm-item card-dm" data-uid="'+(p.uid||'')+'" data-name="'+esc((p.user&&p.user.name)||userHandle||'User')+'">💬 Message</div>':'')
        +'<div class="pm-item" data-action="copylink">🔗 Copy link</div>'
        +'<div class="pm-item" data-action="report">🚩 Report</div>'
      +'</div>'
    +'</div>'
    +mediaHTML
    +'<div class="post-actions">'
      +'<button class="act '+(p.liked?'liked':'')+'" data-like="'+pid+'">'
        +'<svg width="17" height="17" fill="'+(p.liked?'var(--pink)':'none')+'" stroke="'+(p.liked?'var(--pink)':'currentColor')+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
        +'<span class="lc">'+p.likes+'</span>'
      +'</button>'
      +'<button class="act" data-lightbox="'+pid+'">'
        +'<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
        +'<span class="cc">'+p.comments.length+'</span>'
      +'</button>'
      +'<button class="act" data-action="share">'
        +'<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
      +'</button>'
      +'<button class="act act-right '+(p.saved?'liked':'')+'" data-save="'+pid+'">'
        +'<svg width="17" height="17" fill="'+(p.saved?'var(--pink)':'none')+'" stroke="'+(p.saved?'var(--pink)':'currentColor')+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
      +'</button>'
    +'</div>'
    +(pinnedBadge?'<div style="padding:0 14px 4px;">'+pinnedBadge+'</div>':'')
    +captionRow
    +'<div class="comments-wrap" id="cw-'+pid+'">'
      +viewAll
      +'<div id="cl-'+pid+'">'+commentList+'</div>'
      +'<div class="c-input-row">'
        +'<div class="c-avatar" style="background:'+me.color+';color:white;">'+me.initial+'</div>'
        +'<input class="c-input" id="ci-'+pid+'" placeholder="Add a comment...">'
        +'<button class="chat-send" data-comment="'+pid+'"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>'
      +'</div>'
    +'</div>';

  // Attach all event listeners via JS — no inline onclick with dynamic strings needed
  card.querySelectorAll('.card-open-profile').forEach(function(el){
    el.addEventListener('click',function(){viewProfile(el.dataset.uid);});
  });
  card.querySelectorAll('[data-like]').forEach(function(el){
    el.addEventListener('click',function(){doLike(el.dataset.like);});
  });
  card.querySelectorAll('[data-save]').forEach(function(el){
    el.addEventListener('click',function(){doSave(el.dataset.save);});
  });
  card.querySelectorAll('[data-lightbox]').forEach(function(el){
    el.addEventListener('click',function(){openLightbox(el.dataset.lightbox);});
  });
  card.querySelectorAll('[data-comment]').forEach(function(el){
    el.addEventListener('click',function(){addComment(el.dataset.comment);});
  });
  var inp=card.querySelector('.c-input');
  if(inp){
    inp.addEventListener('keydown',function(e){if(e.key==='Enter')addComment(pid);});
    inp.addEventListener('input',function(){handleMentionInput(inp,pid);});
  }
  // Wrap in relative div for mention dropdown
  if(inp&&!inp.parentElement.classList.contains('c-input-wrap')){
    var wrap2=document.createElement('div');wrap2.className='c-input-wrap';
    inp.parentNode.insertBefore(wrap2,inp);wrap2.appendChild(inp);
  }
  card.querySelectorAll('[data-delete]').forEach(function(el){
    el.addEventListener('click',function(){deletePost(el.dataset.delete);});
  });
  card.querySelectorAll('[data-editpost]').forEach(function(el){
    el.addEventListener('click',function(){openEditPost(el.dataset.editpost);});
  });
  card.querySelectorAll('[data-pinpost]').forEach(function(el){
    el.addEventListener('click',function(){togglePin(el.dataset.pinpost);});
  });
  card.querySelectorAll('.card-dm').forEach(function(el){
    el.addEventListener('click',function(){openDMFromPost(el.dataset.uid,el.dataset.name);closeMenus();});
  });
  card.querySelectorAll('[data-action]').forEach(function(el){
    el.addEventListener('click',function(){
      if(el.dataset.action==='copylink')toast('Link copied!');
      else if(el.dataset.action==='report') reportPost(el.closest('[id^="pc-"]') ? el.closest('[id^="pc-"]').id.replace('pc-','') : '');
      else if(el.dataset.action==='share')toast('Post shared!');
      closeMenus();
    });
  });
  card.querySelectorAll('[data-menu]').forEach(function(el){
    el.addEventListener('click',function(e){toggleMenu(e,el.dataset.menu);});
  });
  card.querySelectorAll('[data-delete]').forEach(function(el){
    el.addEventListener('click',function(){deletePost(el.dataset.delete);});
  });
  card.querySelectorAll('.view-all').forEach(function(el){
    el.addEventListener('click',function(){toggleComments(el.dataset.pid);});
  });
  card.querySelectorAll('.card-img-click').forEach(function(el){
    el.addEventListener('click',function(){expandImg(decodeURIComponent(el.dataset.src));});
  });
  card.querySelectorAll('[data-slide]').forEach(function(el){
    el.addEventListener('click',function(){goSlide('car-'+pid,parseInt(el.dataset.slide));});
  });
  card.querySelectorAll('[data-car]').forEach(function(el){
    el.addEventListener('click',function(){shiftSlide(el.dataset.car,parseInt(el.dataset.dir));});
  });
  var wrap=card.querySelector('.carousel-wrap[data-pid]');
  if(wrap){
    wrap.addEventListener('mouseenter',function(){stopFeedAutoSlide(pid);});
    wrap.addEventListener('mouseleave',function(){startFeedAutoSlide(pid,imgs.length);});
  }

  return card;
}

function commentHTML(c){
  var u = c.user || {};
  var uid = u.uid || '';

  // 1. Try by uid first (fastest, most reliable)
  var live = (uid && allUsers[uid]) ? allUsers[uid] : null;

  // 2. No uid? Reverse-lookup by handle across allUsers
  //    Covers display-name changes where handle stayed the same
  if(!live && u.handle){
    var lh = u.handle.toLowerCase();
    var found = Object.values(allUsers).find(function(a){
      return a.handle && a.handle.toLowerCase() === lh;
    });
    if(found){ live = found; uid = found.uid || uid; }
  }

  // 3. Resolve final display values — live wins over stale stored values
  var handle  = live ? (live.handle  || u.handle  || '') : (u.handle  || '');
  var color   = live ? (live.color   || u.color   || 'var(--pink)') : (u.color || 'var(--pink)');
  var initial = live ? (live.initial || (live.name ? live.name.charAt(0) : '') || u.initial || '?') : (u.initial || '?');
  var avatar  = live ? (live.avatar  || u.avatar  || '') : (u.avatar  || '');
  var avHtml  = avatar
    ? '<img src="'+avatar+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">'
    : initial;
  var iU = uid ? _r(uid) : -1;
  var clickAttr = uid ? ' style="cursor:pointer;" onclick="viewProfile(_g('+iU+'))"' : '';
  return '<div class="comment">'
    +'<div class="c-avatar" style="background:'+color+';color:white;'+(uid?'cursor:pointer;':'')+'"'
      +(uid?' onclick="viewProfile(_g('+iU+'))"':'')+'>'+avHtml+'</div>'
    +'<div class="c-bubble">'
      +'<div class="c-user"'+clickAttr+'>@'+esc(handle)+'</div>'
      +'<div class="c-text">'+esc(c.text)+'</div>'
    +'</div>'
  +'</div>';
}

// ── INTERACTIONS ──────────────────────────────────────
function doLike(id){
  id=String(id);
  const p=posts.find(x=>String(x.id)===id);if(!p)return;
  // Floating heart animation
  if(!p.liked){
    const btn=document.querySelector('#pc-'+id+' [data-like]');
    if(btn){
      const rect=btn.getBoundingClientRect();
      const heart=document.createElement('div');
      heart.className='floating-heart';
      heart.textContent='❤️';
      heart.style.left=(rect.left+rect.width/2-12)+'px';
      heart.style.top=(rect.top)+'px';
      document.body.appendChild(heart);
      setTimeout(()=>heart.remove(),800);
      btn.classList.add('like-pop-anim');
      setTimeout(()=>btn.classList.remove('like-pop-anim'),500);
    }
  }
  // ONE like per account — stored as array of UIDs in Firestore
  const likedBy = Array.isArray(p.likedBy) ? p.likedBy : [];
  const alreadyLiked = likedBy.includes(me.uid);
  if(alreadyLiked){
    // unlike
    p.liked=false; p.likes=Math.max(0,p.likes-1);
    p.likedBy=likedBy.filter(u=>u!==me.uid);
    postsCol().doc(id).update({
      likes: firebase.firestore.FieldValue.increment(-1),
      likedBy: p.likedBy
    }).catch(()=>{});
  } else {
    // like
    p.liked=true; p.likes=p.likes+1;
    p.likedBy=[...likedBy, me.uid];
    postsCol().doc(id).update({
      likes: firebase.firestore.FieldValue.increment(1),
      likedBy: p.likedBy
    }).catch(()=>{});
    if(p.uid && p.uid!==me.uid) sendNotification(p.uid,'like',me,'');
  }
  // update UI
  document.querySelectorAll('#pc-'+id).forEach(function(card){
    const btn=card.querySelector('[data-like]');
    if(!btn) return;
    btn.className='act '+(p.liked?'liked':'');
    btn.innerHTML='<svg width="17" height="17" fill="'+(p.liked?'var(--pink)':'none')+'" stroke="'+(p.liked?'var(--pink)':'currentColor')+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span class="lc">'+p.likes+'</span>';
  });
}
function doSave(id){
  id=String(id);
  const p=posts.find(x=>String(x.id)===id);if(!p)return;
  p.saved=!p.saved;
  document.querySelectorAll(`#pc-${id}`).forEach(card=>{
    const btn=card.querySelector('.act-right');
    btn.className=`act act-right ${p.saved?'liked':''}`;
    btn.innerHTML=`<svg width="17" height="17" fill="${p.saved?'var(--pink)':'none'}" stroke="${p.saved?'var(--pink)':'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  });
  // saves are local-per-user, store in their profile
  if(!me.savedPosts) me.savedPosts=[];
  if(p.saved){ if(!me.savedPosts.includes(id)) me.savedPosts.push(id); }
  else { me.savedPosts=me.savedPosts.filter(x=>x!==id); }
  saveProfileToFirestore();
  toast(p.saved?'Post saved 🌸':'Post unsaved');
}
function toggleComments(id){
  id=String(id);
  const p=posts.find(x=>String(x.id)===id);if(!p)return;
  p.showComments=!p.showComments;
  document.querySelectorAll(`[id^="cl-${id}"]`).forEach(cl=>{
    cl.innerHTML=(p.showComments?p.comments:p.comments.slice(-1)).map(commentHTML).join('');
    const va=cl.parentElement.querySelector('.view-all');
    if(va)va.textContent=p.showComments?'Hide comments':`View all ${p.comments.length} comments`;
  });
}
function addComment(id){
  id=String(id);
  const inp=document.getElementById(`ci-${id}`);
  const txt=inp.value.trim();if(!txt)return;
  const p=posts.find(x=>String(x.id)===id);if(!p)return;
  const c={user:{uid:me.uid,name:me.name,handle:me.handle,color:me.color,initial:me.initial,avatar:me.avatar||null},text:txt};
  p.comments.push(c);p.showComments=true;inp.value='';
  const cl=document.getElementById(`cl-${id}`);
  if(cl){const d=document.createElement('div');d.innerHTML=commentHTML(c);cl.appendChild(d.firstChild);}
  document.querySelectorAll(`#pc-${id}`).forEach(card=>{const cc=card.querySelectorAll('.act')[1];if(cc)cc.querySelector('.cc').textContent=p.comments.length;});
  updatePostField(id,{comments:p.comments,showComments:true});
  // notify post owner
  if(p.uid && p.uid!==me.uid) sendNotification(p.uid,'comment',me,txt.slice(0,60));
}
function reportPost(id){
  id=String(id);
  var p=posts.find(function(x){return String(x.id)===id;});if(!p)return;
  var count=(p.reportCount||0)+1;
  p.reported=true; p.reportCount=count;
  updatePostField(id,{reported:true,reportCount:count});
  toast('Post reported to admin 🚩');
  closeMenus();
}
function deletePost(id){
  id=String(id);
  closeMenus();
  document.querySelectorAll(`#pc-${id}`).forEach(card=>{card.style.cssText='opacity:0;transform:scale(.96);transition:all .28s ease;';});
  setTimeout(()=>deletePostFromFirestore(id),300);
  toast('Post deleted');
}
function toggleMenu(e,mid){e.stopPropagation();closeMenus();document.getElementById(mid).classList.add('open');}
function closeMenus(){document.querySelectorAll('.post-menu.open').forEach(m=>m.classList.remove('open'));}
document.addEventListener('click',closeMenus);

// ── PROFILE PAGE ──────────────────────────────────────
function refreshProfile(){
  applyUserProfile();
  const myPosts=posts.filter(p=>p.uid===me.uid);
  document.getElementById('statPosts').textContent=myPosts.length;
  renderPostGrid();renderSavedGrid();renderStatusList();
}
function renderPostGrid(){
  const grid=document.getElementById('grid');grid.innerHTML='';
  // Apply saved layout class
  grid.className='post-grid' + (_profileLayout&&_profileLayout!=='grid'?' layout-'+_profileLayout:'');
  var myPosts=posts.filter(p=>p.uid===me.uid && !p.isStatus);
  // Pinned post first
  myPosts.sort(function(a,b){
    if(a.pinned&&!b.pinned) return -1;
    if(!a.pinned&&b.pinned) return 1;
    return 0;
  });
  if(!myPosts.length){grid.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3);font-size:14px;grid-column:1/-1;">No photo posts yet. Share your first photo!</div>';return;}
  myPosts.slice().reverse().forEach(p=>{
    const imgs=p.images||(p.image?[p.image]:[]);
    const firstImg=imgs[0]||null;
    const item=document.createElement('div');item.className='grid-item';
    const multiIcon=imgs.length>1?`<div class="grid-multi-icon"><svg width="12" height="12" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="2" y="7" width="15" height="15" rx="2"/><path d="M17 2H22V17"/></svg></div>`:'';
    item.innerHTML=firstImg
      ?`<img src="${firstImg}" alt="">${multiIcon}<div class="grid-overlay"><svg width="15" height="15" fill="white" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>${p.likes}</span><svg width="15" height="15" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${p.comments.length}</span></div>`
      :`<div class="grid-item-placeholder"><svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
    item.onclick=()=>openLightbox(p.id);
    grid.appendChild(item);
  });
}
function renderStatusList(){
  const list=document.getElementById('statusList');if(!list)return;
  list.innerHTML='';
  const myStatus=posts.filter(p=>p.uid===me.uid && p.isStatus);
  if(!myStatus.length){list.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3);font-size:14px;">No status posts yet. Share what\'s on your mind!</div>';return;}
  myStatus.slice().reverse().forEach((p,i)=>{
    const d=document.createElement('div');d.className='status-list-item';d.style.animationDelay=`${i*.04}s`;
    d.innerHTML=`
      <div class="status-list-text">${esc(p.caption)}</div>
      ${p.mood?`<div class="status-mood-tag" style="margin-bottom:8px;">${esc(p.mood)}</div>`:''}
      <div class="status-list-meta">
        <span>${p.time}</span>
        <span>♥ ${p.likes}</span>
        <span>💬 ${p.comments.length}</span>
      </div>`;
    d.onclick=()=>openLightbox(p.id);
    list.appendChild(d);
  });
}
function renderSavedGrid(){
  const grid=document.getElementById('savedGrid');grid.innerHTML='';
  const saved=posts.filter(p=>p.saved);
  if(!saved.length){grid.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3);font-size:14px;grid-column:1/-1;">Nothing saved yet.</div>';return;}
  saved.forEach(p=>{
    const imgs=p.images||(p.image?[p.image]:[]);
    const item=document.createElement('div');item.className='grid-item';
    if(p.isStatus){
      // status posts in saved: show as text tile
      item.style.cssText='aspect-ratio:1;background:var(--bg2);border-left:3px solid var(--pink);display:flex;align-items:center;padding:12px;cursor:pointer;';
      item.innerHTML=`<span style="font-size:13px;color:var(--text);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;">${esc(p.caption)}</span>`;
    } else {
      item.innerHTML=imgs[0]?`<img src="${imgs[0]}" alt=""><div class="grid-overlay"><svg width="15" height="15" fill="white" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>${p.likes}</span></div>`:`<div class="grid-item-placeholder"><svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
    }
    item.onclick=()=>openLightbox(p.id);
    grid.appendChild(item);
  });
}
function switchTab(el,tabId){
  document.querySelectorAll('.ptab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('grid').style.display=tabId==='grid'?'grid':'none';
  document.getElementById('status-tab').style.display=tabId==='status-tab'?'block':'none';
  document.getElementById('saved-tab').style.display=tabId==='saved-tab'?'block':'none';
}
function showFollowModal(type){
  document.getElementById('followModalTitle').textContent=type==='followers'?'Followers':type==='following'?'Following':'Posts';
  const list=document.getElementById('followList');list.innerHTML='';
  const users=type==='posts'?[]:USERS;
  if(type==='posts'){posts.filter(p=>p.user.handle===me.handle).forEach(p=>{const d=document.createElement('div');d.className='follow-item';d.innerHTML=`<div style="font-size:13px;color:var(--text)">${p.caption.substring(0,60)}...</div>`;list.appendChild(d);});
  } else {
    users.forEach(u=>{const d=document.createElement('div');d.className='follow-item';d.innerHTML=`<div class="sug-avatar" style="background:${u.color};color:white;">${u.initial}</div><div class="sug-info"><div class="sug-name">${u.name}</div><div class="sug-sub">@${u.handle}</div></div>`;list.appendChild(d);});
  }
  document.getElementById('followOverlay').classList.add('open');
}

// ── NOTIFICATIONS ─────────────────────────────────────
function _buildNotifItem(n,icon,delay){
  const d=document.createElement('div');d.className=`notif-item ${n.unread?'unread':''}`;
  d.style.animationDelay=delay+'ms';
  d.innerHTML=`<div class="notif-av" style="background:${n.user.color};color:white;font-size:14px;font-weight:700;">${n.user.initial}</div><div class="notif-icon">${icon[n.type]}</div><div class="notif-text"><strong>${n.user.name}</strong> ${n.text}</div><div class="notif-time">${n.time}</div>`;
  d.onclick=()=>{n.unread=false;d.classList.remove('unread');updateNotifBadges();renderNotifs();};
  return d;
}

// ── MESSAGES ──────────────────────────────────────────
// renderConvos replaced by loadDMConvos

function openConvo(id){
  currentConvo=id;
  const c=CONVOS.find(x=>x.id===id);if(!c)return;
  c.unread=false;updateMsgBadges();renderConvos();
  const area=document.getElementById('chatArea');
  area.innerHTML=`
    <div class="chat-header">
      <div class="chat-header-av" style="background:${c.user.color}">${c.user.initial}</div>
      <div><div class="chat-header-name">${c.user.name}</div><div class="chat-header-status">Active now</div></div>
    </div>
    <div class="chat-msgs" id="chatMsgs">${c.messages.map(m=>chatMsgHTML(m,c.user)).join('')}</div>
    <div class="chat-input-row">
      <input class="chat-input" id="chatInput" placeholder="Message ${c.user.name.split(' ')[0]}..." onkeydown="if(event.key==='Enter')sendMsg(${id})">
      <button class="chat-send" onclick="sendMsg(${id})"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
    </div>`;
  scrollChat();
}
function chatMsgHTML(m,user){
  const mine=m.from==='me';
  const av=mine?`<div class="chat-msg-av" style="background:${me.color}">${me.initial}</div>`:`<div class="chat-msg-av" style="background:${user.color}">${user.initial}</div>`;
  return `<div class="chat-msg ${mine?'mine':''}">
    ${!mine?av:''}
    <div><div class="chat-bubble">${esc(m.text)}</div><div class="chat-time">${m.time}</div></div>
    ${mine?av:''}
  </div>`;
}
function sendMsg(id){
  const inp=document.getElementById('chatInput');
  const txt=inp.value.trim();if(!txt)return;
  const c=CONVOS.find(x=>x.id===id);if(!c)return;
  const now=new Date();const time=now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const msg={from:'me',text:txt,time};
  c.messages.push(msg);inp.value='';
  const msgs=document.getElementById('chatMsgs');
  if(msgs){const d=document.createElement('div');d.innerHTML=chatMsgHTML(msg,c.user);msgs.appendChild(d.firstChild);}
  scrollChat();
  // show typing indicator
  if(msgs){
    const t=document.createElement('div');t.id='typingInd';t.className='chat-msg';
    t.innerHTML=`<div class="chat-msg-av" style="background:${c.user.color}">${c.user.initial}</div><div class="chat-bubble" style="background:var(--bg3);padding:10px 16px;"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
    msgs.appendChild(t);scrollChat();
  }
  setTimeout(()=>{
    const replies=["That sounds great! 💕","Haha yes!! 😂","Love it ✨","Omg same!!","Can't wait! 🎉","You're so right 🌸","Absolutely!! 💖","Tell me more! 👀","No way!! 😲","Yessss 🙌","So cute omg 🥹","I was just thinking about that!"];
    const rep={from:'them',text:replies[Math.floor(Math.random()*replies.length)],time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};
    c.messages.push(rep);
    const ti=document.getElementById('typingInd');if(ti)ti.remove();
    const msgs=document.getElementById('chatMsgs');
    if(msgs){const d=document.createElement('div');d.innerHTML=chatMsgHTML(rep,c.user);msgs.appendChild(d.firstChild);}
    scrollChat();
  },1200+Math.random()*900);
}
function scrollChat(){const m=document.getElementById('chatMsgs');if(m)m.scrollTop=m.scrollHeight;}
function filterConvos(v){renderConvos(v);}
function updateMsgBadges(){
  const c=CONVOS.filter(x=>x.unread).length;
  document.getElementById('msgBadge').classList.toggle('hidden',!c);
  document.getElementById('msgBadge').textContent=c;
  document.getElementById('mnMsgBadge').style.display=c?'':'none';
  document.getElementById('mnMsgBadge').textContent=c;
}

// ── SETTINGS ─────────────────────────────────────────
function refreshSettings(){
  document.getElementById('editName').value=me.name||'';
  document.getElementById('editHandle').value=me.handle||'';
  document.getElementById('editBio').value=me.bio||'';
  document.getElementById('darkToggle').checked=isDark;
  refreshAdmin();
}
function switchSettingsNav(sec){
  document.querySelectorAll('.settings-nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.settings-section').forEach(s=>s.classList.remove('active'));
  document.getElementById('sn-'+sec).classList.add('active');
  document.getElementById('ss-'+sec).classList.add('active');
  if(sec==='appearance'){ setTimeout(_updateInstallUI,50); setTimeout(renderProfileThemeGrid,80); }
  if(sec==='admin'){ setTimeout(loadAdminFeedback,100); setTimeout(renderAdminAnalytics,150); }
}
function refreshAdmin(){
  renderAdminAnalytics();
  const tl=document.getElementById('adminTotalLikes');if(tl)tl.textContent=posts.reduce((a,p)=>a+p.likes,0);
  const apl=document.getElementById('adminPostList');if(!apl)return;
  apl.innerHTML='';
  if(!posts.length){apl.innerHTML='<p style="color:var(--text3);font-size:13px;">No posts on the platform yet.</p>';return;}
  posts.slice().reverse().forEach(p=>{
    const d=document.createElement('div');d.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);';
    d.innerHTML=`<div class="sug-avatar" style="background:${p.user.color};color:white;font-size:12px;font-weight:700;width:32px;height:32px;">${p.user.initial}</div><div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:600;">@${p.user.handle}</div><div style="font-size:12px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.caption||'[no caption]'}</div></div><div style="font-size:12px;color:var(--text3);">♥ ${p.likes}</div><button onclick="deletePost(${p.id});refreshAdmin();" style="background:none;border:none;cursor:pointer;color:#e05577;font-size:12px;padding:4px 8px;border-radius:6px;" onmouseover="this.style.background='rgba(224,85,119,.1)'" onmouseout="this.style.background='none'">Delete</button>`;
    apl.appendChild(d);
  });
}
function clearAllPosts(){
  if(!confirm('Delete ALL your posts? This cannot be undone.'))return;
  const mine=posts.filter(p=>p.uid===me.uid);
  mine.forEach(p=>deletePostFromFirestore(p.id));
  toast('All your posts deleted');
}

// ── COLOR SWATCHES ────────────────────────────────────
function renderColorSwatches(){
  const container=document.getElementById('colorSwatches');if(!container)return;
  COLORS.forEach((c,i)=>{
    const s=document.createElement('div');s.className=`swatch ${me.color===c?'selected':''}`;s.style.background=c;
    s.onclick=()=>{me.color=c;document.querySelectorAll('#colorSwatches .swatch').forEach(x=>x.classList.remove('selected'));s.classList.add('selected');saveProfileToFirestore();applyUserProfile();toast('Color updated!');};
    container.appendChild(s);
  });
}
function renderBannerSwatches(){
  const container=document.getElementById('bannerSwatches');if(!container)return;
  BANNER_COLORS.forEach(c=>{
    const s=document.createElement('div');s.className=`swatch ${me.bannerColor===c?'selected':''}`;s.style.background=c;s.style.width='48px';s.style.height='28px';s.style.borderRadius='8px';
    s.onclick=()=>{me.bannerColor=c;document.querySelectorAll('#bannerSwatches .swatch').forEach(x=>x.classList.remove('selected'));s.classList.add('selected');document.getElementById('profileBanner').style.background=c;saveProfileToFirestore();toast('Banner updated!');};
    container.appendChild(s);
  });
}

// ── SIDEBAR ───────────────────────────────────────────
function renderSuggested(){
  const list=document.getElementById('sugList');
  USERS.slice(0,4).forEach(u=>{
    const d=document.createElement('div');d.className='sug-user';
    d.innerHTML=`<div class="sug-avatar" style="background:${u.color};color:white;">${u.initial}</div><div class="sug-info"><div class="sug-name">${u.name}</div><div class="sug-sub">${(u.followers/1000).toFixed(1)}k followers</div></div><button class="follow-btn" onclick="this.classList.toggle('on');toast(this.classList.contains('on')?'Following ${u.name}':'Unfollowed ${u.name}')">Follow</button>`;
    list.appendChild(d);
  });
}
function renderTrending(){
  const c=document.getElementById('trendTags');
  ['#photography','#aesthetic','#travel','#art','#food','#fashion','#nature','#minimal'].forEach(t=>{
    const s=document.createElement('span');s.className='tag';s.textContent=t;s.onclick=()=>toast(`Searching ${t}`);c.appendChild(s);
  });
}

// ── POST MODAL ────────────────────────────────────────
let postMode='status'; // 'status' | 'photo'
let selectedMood='';
let feedAutoTimers={};

function switchPostType(mode){
  postMode=mode;
  document.getElementById('ptt-status').classList.toggle('active',mode==='status');
  document.getElementById('ptt-photo').classList.toggle('active',mode==='photo');
  document.getElementById('statusPanel').style.display=mode==='status'?'block':'none';
  document.getElementById('photoPanel').style.display=mode==='photo'?'block':'none';
}
function updateStatusChar(){
  const v=document.getElementById('statusInput').value.length;
  const el=document.getElementById('statusChar');
  el.textContent=280-v;
  el.style.color=v>250?'var(--pink)':'var(--text3)';
}
function toggleMood(el,mood){
  document.querySelectorAll('.mood-chip').forEach(c=>c.classList.remove('sel'));
  if(selectedMood===mood){selectedMood='';return;}
  el.classList.add('sel');selectedMood=mood;
}

function openModal(){
  document.getElementById('overlay').classList.add('open');
  uploadImages=[];selectedMood='';postMode='status';
  document.getElementById('fileInput').value='';
  document.getElementById('uploadPreviews').innerHTML='';
  document.getElementById('captionInput').value='';
  document.getElementById('statusInput').value='';
  document.getElementById('statusChar').textContent='280';
  document.getElementById('uploadZone').style.display='block';
  document.getElementById('uploadPrompt').style.display='block';
  document.querySelectorAll('.mood-chip').forEach(c=>c.classList.remove('sel'));
  switchPostType('status');
  // Hook mention dropdown to caption input
  var cap = document.getElementById('captionInput');
  if(cap && !cap._mentionHooked){
    cap._mentionHooked = true;
    var capWrap = cap.parentElement;
    if(!capWrap.classList.contains('c-input-wrap')){
      var ww = document.createElement('div');
      ww.className = 'c-input-wrap';
      ww.style.position = 'relative';
      cap.parentNode.insertBefore(ww, cap);
      ww.appendChild(cap);
    }
    cap.addEventListener('input', function(){ handleMentionInput(cap, 'new'); });
  }
  var stat = document.getElementById('statusInput');
  if(stat && !stat._mentionHooked){
    stat._mentionHooked = true;
    stat.addEventListener('input', function(){ handleMentionInput(stat, 'new'); });
  }
}
function closeModal(){document.getElementById('overlay').classList.remove('open');}
function overlayClick(e){if(e.target===document.getElementById('overlay'))closeModal();}

function handleFiles(inp){
  const files=Array.from(inp.files);
  files.forEach(f=>{
    const r=new FileReader();
    r.onload=e=>{
      uploadImages.push(e.target.result);
      renderUploadPreviews();
      document.getElementById('uploadZone').style.display='none';
    };
    r.readAsDataURL(f);
  });
}
function renderUploadPreviews(){
  const wrap=document.getElementById('uploadPreviews');
  wrap.innerHTML='';
  uploadImages.forEach((src,i)=>{
    const w=document.createElement('div');w.className='upload-thumb-wrap';
    w.innerHTML=`<img class="upload-thumb" src="${src}"><button class="remove-thumb" onclick="removeUploadImg(${i})">✕</button>`;
    wrap.appendChild(w);
  });
  if(uploadImages.length<10){
    const add=document.createElement('div');add.className='add-more-btn';
    add.innerHTML='<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    add.onclick=()=>document.getElementById('fileInput').click();
    wrap.appendChild(add);
  }
}
function removeUploadImg(i){uploadImages.splice(i,1);if(!uploadImages.length)document.getElementById('uploadZone').style.display='block';renderUploadPreviews();}

function handleDrag(e,t){e.preventDefault();document.getElementById('uploadZone').classList.toggle('drag',t==='over');}
function handleDrop(e){
  e.preventDefault();document.getElementById('uploadZone').classList.remove('drag');
  const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
  if(!files.length)return;
  const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));
  document.getElementById('fileInput').files=dt.files;
  handleFiles(document.getElementById('fileInput'));
}

async function submitPost(){
  const uid = me.uid || 'anon';
  const postId = 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  if(postMode==='status'){
    const txt=document.getElementById('statusInput').value.trim();
    if(!txt){toast('Write something first!');return;}
    const p={id:postId, uid, user:{...me}, images:[], image:null, caption:txt, mood:selectedMood, isStatus:true, likes:0, liked:false, comments:[], saved:false, time:'Just now', createdAt:Date.now(), showComments:true};
    closeModal();
    toast('Posting... ✨');
    await savePostToFirestore(p);
    toast('Status shared! ✨');
  } else {
    const cap=document.getElementById('captionInput').value.trim();
    if(!uploadImages.length){toast('Add a photo first');return;}
    closeModal();
    toast('Uploading photo... 🌸');
    let imageUrls=[];
    for(let i=0;i<uploadImages.length;i++){
      const url = await uploadToStorage(uploadImages[i], `posts/${uid}/${Date.now()}_${i}`);
      imageUrls.push(url);
    }
    const p={id:postId, uid, user:{...me}, images:imageUrls, image:imageUrls[0]||null, caption:cap||'', likes:0, liked:false, comments:[], saved:false, time:'Just now', createdAt:Date.now(), showComments:false};
    await savePostToFirestore(p);
    toast('Post shared! 🌸');
  }
  uploadImages=[];
}

// ── FEED AUTO-SLIDE (carousel in feed auto-advances) ─────
function startFeedAutoSlide(postId,count){
  if(feedAutoTimers[postId])return; // already running
  feedAutoTimers[postId]=setInterval(()=>{
    shiftSlide('car-'+postId,1);
  },3500);
}
function stopFeedAutoSlide(postId){
  clearInterval(feedAutoTimers[postId]);
  delete feedAutoTimers[postId];
}

// ── CAROUSEL ─────────────────────────────────────────
function shiftSlide(wrapId,dir){
  const wrap=document.getElementById(wrapId);if(!wrap)return;
  // support both feed carousels (ct-{id}) and lightbox (ct{wrapId})
  const trackId='ct-'+wrapId.replace('car-','');
  const track=document.getElementById(trackId)||document.getElementById('ct'+wrapId);
  if(!track)return;
  const slides=track.querySelectorAll('.carousel-slide');
  let idx=parseInt(wrap.dataset.idx||0)+dir;
  if(idx<0)idx=slides.length-1;
  if(idx>=slides.length)idx=0;
  wrap.dataset.idx=idx;
  track.style.transform=`translateX(-${idx*100}%)`;
  const dotContainerId=wrapId.replace('car-','');
  const dots=document.querySelectorAll(`#cd-${dotContainerId} .carousel-dot`);
  dots.forEach((d,i)=>d.classList.toggle('active',i===idx));
}
function goSlide(wrapId,idx){
  const wrap=document.getElementById(wrapId);if(!wrap)return;
  const trackId='ct-'+wrapId.replace('car-','');
  const track=document.getElementById(trackId)||document.getElementById('ct'+wrapId);
  if(!track)return;
  wrap.dataset.idx=idx;
  track.style.transform=`translateX(-${idx*100}%)`;
  const dotContainerId=wrapId.replace('car-','');
  const dots=document.querySelectorAll(`#cd-${dotContainerId} .carousel-dot`);
  dots.forEach((d,i)=>d.classList.toggle('active',i===idx));
}

// ── LIGHTBOX ─────────────────────────────────────────
let lbAutoTimer = null;

function openLightbox(pid){
  pid=String(pid);
  const p=posts.find(x=>String(x.id)===pid);if(!p)return;
  const imgs=p.images||(p.image?[p.image]:[]);
  const inner=document.getElementById('lightboxInner');
  // Use registry for all string IDs in onclick attrs
  const iPid=_r(pid);
  const iUid=_r(String(p.uid||''));
  let imgSide='';
  if(imgs.length===0){
    if(p.isStatus){
      imgSide=`<div class="lightbox-img-side" style="background:var(--bg2);display:flex;align-items:center;justify-content:center;padding:40px 36px;"><div><div style="width:36px;height:3px;background:var(--pink);border-radius:2px;margin-bottom:20px;"></div><div style="font-size:${(p.caption||'').length>120?'16px':(p.caption||'').length>60?'19px':'22px'};line-height:1.7;color:var(--text);word-break:break-word;">${esc(p.caption||'')}</div>${p.mood?`<div style="margin-top:16px;display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--text3);background:var(--bg3);padding:4px 12px;border-radius:20px;border:1px solid var(--border);">${esc(p.mood)}</div>`:''}</div></div>`;
    } else {
      imgSide=`<div class="lightbox-img-side" style="background:var(--bg3);display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:48px;">🖼️</div>`;
    }
  } else if(imgs.length===1){
    imgSide=`<div class="lightbox-img-side"><img src="${imgs[0]}" alt="" style="width:100%;height:100%;object-fit:contain;"></div>`;
  } else {
    const slides=imgs.map(src=>`<div class="carousel-slide" style="min-width:100%;"><img src="${src}" style="width:100%;max-height:90vh;object-fit:contain;display:block;"></div>`).join('');
    const dots=imgs.map((_,di)=>`<span class="carousel-dot ${di===0?'active':''}" onclick="goSlide('lbcar',${di})"></span>`).join('');
    imgSide=`<div class="lightbox-img-side" style="overflow:hidden;"><div id="lbcar" data-idx="0" style="position:relative;height:100%;overflow:hidden;"><div class="carousel-track" id="ctlbcar" style="display:flex;height:100%;">${slides}</div><button class="carousel-btn carousel-prev" onclick="shiftSlide('lbcar',-1)">&#8249;</button><button class="carousel-btn carousel-next" onclick="shiftSlide('lbcar',1)">&#8250;</button><div class="carousel-dots" style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:5px;">${dots}</div></div></div>`;
  }
  inner.innerHTML=
    imgSide
    +'<div class="lightbox-info-side">'
      +'<div class="lb-header">'
        +(()=>{
          var lbLive = (p.uid && allUsers[p.uid]) ? allUsers[p.uid] : (p.user||{});
          var lbColor = lbLive.color||'var(--pink)';
          var lbAvatar = lbLive.avatar||'';
          var lbInitial = lbLive.initial||(lbLive.name?lbLive.name.charAt(0):'')||'?';
          var lbHandle = lbLive.handle||'';
          return '<div class="post-avatar card-open-profile-lb" data-uid="'+(p.uid||'')+'" style="background:'+lbColor+';width:34px;height:34px;font-size:13px;cursor:pointer;">'+(lbAvatar?'<img src="'+lbAvatar+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">':esc(lbInitial))+'</div>'
            +'<div class="card-open-profile-lb" data-uid="'+(p.uid||'')+'" style="cursor:pointer;">'
              +'<div style="font-size:13.5px;font-weight:600;">@'+esc(lbHandle)+'</div>'
              +'<div style="font-size:11.5px;color:var(--text3);" title="'+fullDate(p.createdAt||0)+'">'+timeAgo(p.createdAt||0)+'</div>'
            +'</div>';
        })()
        +'<button class="lb-close" onclick="closeLightbox()"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
      +'</div>'
      +((()=>{
        var lbLive2 = (p.uid && allUsers[p.uid]) ? allUsers[p.uid] : (p.user||{});
        return p.caption?'<div class="lb-caption"><span style="font-weight:600;margin-right:6px;">@'+esc(lbLive2.handle||'')+'</span>'+esc(p.caption)+'</div>':'';
      })())
      +'<div class="lb-comments" id="lbComments">'+(p.comments||[]).map(function(c){return '<div class="comment" style="margin-bottom:10px;">'+commentHTML(c)+'</div>';}).join('')+'</div>'
      +'<div class="lb-actions">'
        +'<button class="act '+(p.liked?'liked':'')+'" id="lbLikeBtn"><svg width="17" height="17" fill="'+(p.liked?'var(--pink)':'none')+'" stroke="'+(p.liked?'var(--pink)':'currentColor')+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span id="lbLikeCount">'+p.likes+'</span></button>'
        +'<button class="act"><svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>'
        +'<button class="act act-right '+(p.saved?'liked':'')+'"><svg width="17" height="17" fill="'+(p.saved?'var(--pink)':'none')+'" stroke="'+(p.saved?'var(--pink)':'currentColor')+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>'
      +'</div>'
      +'<div class="lb-comment-input">'
        +'<div class="c-avatar" style="background:'+me.color+';color:white;">'+me.initial+'</div>'
        +'<input class="c-input" id="lbCommentInput" placeholder="Add a comment...">'
        +'<button class="chat-send"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>'
      +'</div>'
    +'</div>';
  document.getElementById('lightbox').classList.add('open');
  clearInterval(lbAutoTimer);
  if(imgs.length>1){ lbAutoTimer=setInterval(()=>shiftSlide('lbcar',1),3000); }
  // Attach lightbox event listeners safely
  var lbLikeBtn=document.getElementById('lbLikeBtn');
  var lbSaveBtn=inner.querySelector('.act-right');
  var lbCommentBtn=inner.querySelector('.c-send');
  var lbCommentInp=document.getElementById('lbCommentInput');
  var lbShareBtn=inner.querySelectorAll('.act')[1];
  if(lbLikeBtn) lbLikeBtn.addEventListener('click',function(){doLike(pid);updateLbLike(pid);});
  if(lbSaveBtn) lbSaveBtn.addEventListener('click',function(){doSave(pid);});
  if(lbShareBtn) lbShareBtn.addEventListener('click',function(){toast('Shared!');});
  if(lbCommentBtn) lbCommentBtn.addEventListener('click',function(){addLbComment(pid);});
  if(lbCommentInp) lbCommentInp.addEventListener('keydown',function(e){if(e.key==='Enter')addLbComment(pid);});
  inner.querySelectorAll('.card-open-profile-lb').forEach(function(el){
    el.addEventListener('click',function(){closeLightbox();viewProfile(el.dataset.uid);});
  });
}
function closeLightbox(){document.getElementById('lightbox').classList.remove('open');clearInterval(lbAutoTimer);}
function addLbComment(pid){
  pid=String(pid);
  const inp=document.getElementById('lbCommentInput');
  const txt=inp.value.trim();if(!txt)return;
  const p=posts.find(x=>String(x.id)===pid);if(!p)return;
  const c={user:{uid:me.uid,name:me.name,handle:me.handle,color:me.color,initial:me.initial,avatar:me.avatar||null},text:txt};
  p.comments.push(c);p.showComments=true;inp.value='';
  const lbc=document.getElementById('lbComments');
  if(lbc){const d=document.createElement('div');d.innerHTML=commentHTML(c);lbc.appendChild(d.firstChild);lbc.scrollTop=lbc.scrollHeight;}
  const cl=document.getElementById(`cl-${pid}`);
  if(cl){const d=document.createElement('div');d.innerHTML=commentHTML(c);cl.appendChild(d.firstChild);}
  updatePostField(pid,{comments:p.comments,showComments:true});
}
function updateLbLike(pid){
  pid=String(pid);
  const p=posts.find(x=>String(x.id)===pid);if(!p)return;
  const btn=document.getElementById('lbLikeBtn');const cnt=document.getElementById('lbLikeCount');
  if(btn){btn.className=`act ${p.liked?'liked':''}`;btn.querySelector('svg').setAttribute('fill',p.liked?'var(--pink)':'none');btn.querySelector('svg').setAttribute('stroke',p.liked?'var(--pink)':'currentColor');}
  if(cnt)cnt.textContent=p.likes;
}


// ── TIME AGO ──────────────────────────────────────────
function timeAgo(ts){
  if(!ts) return '';
  const now=Date.now();
  // ts can be Firestore Timestamp, millis number, or Date
  let ms;
  if(ts && typeof ts.toMillis === 'function') ms=ts.toMillis();
  else if(ts && ts.seconds) ms=ts.seconds*1000;
  else if(typeof ts==='number') ms=ts;
  else ms=new Date(ts).getTime();
  const diff=now-ms;
  const s=Math.floor(diff/1000);
  const m=Math.floor(s/60);
  const h=Math.floor(m/60);
  const d=Math.floor(h/24);
  const wk=Math.floor(d/7);
  const mo=Math.floor(d/30);
  const yr=Math.floor(d/365);
  if(s<5) return 'just now';
  if(s<60) return s+'s ago';
  if(m<60) return m+'m ago';
  if(h<24) return h+'h ago';
  if(d===1) return 'yesterday';
  if(d<7) return d+' days ago';
  if(wk<5) return wk+'w ago';
  if(mo<12) return mo+'mo ago';
  return yr+'y ago';
}
function fullDate(ts){
  if(!ts) return '';
  let ms;
  if(ts && typeof ts.toMillis === 'function') ms=ts.toMillis();
  else if(ts && ts.seconds) ms=ts.seconds*1000;
  else if(typeof ts==='number') ms=ts;
  else ms=new Date(ts).getTime();
  return new Date(ms).toLocaleString([],{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

// ── USER SEARCH ───────────────────────────────────────
let allUsers = {}; // uid -> profile object, populated from Firestore

// ── REPAIR OLD COMMENTS (user-triggered from Settings) ──────────
// Takes comma-separated old usernames, finds all comments by those handles,
// and rewrites them with the current uid + current name/handle.
async function repairOldComments(){
  const btn = document.getElementById('repairCommentsBtn');
  const status = document.getElementById('repairStatus');
  const inp = document.getElementById('oldHandlesInput');
  const raw = (inp ? inp.value : '').trim();
  if(!raw){ toast('Enter at least one old username'); return; }

  // Parse and clean the handles the user typed
  const oldHandles = raw.split(',')
    .map(function(h){ return h.trim().replace(/^@/,'').toLowerCase(); })
    .filter(Boolean);
  if(!oldHandles.length){ toast('No valid usernames found'); return; }

  if(btn){ btn.disabled = true; btn.textContent = 'Repairing...'; }
  if(status){ status.style.display = 'block'; status.textContent = 'Scanning posts...'; }

  // Save these as known previous handles so the auto-migration knows them too
  if(!Array.isArray(me.previousHandles)) me.previousHandles = [];
  oldHandles.forEach(function(h){
    if(!me.previousHandles.includes(h)) me.previousHandles.push(h);
  });
  saveProfileToFirestore();

  const updatedUser = {
    uid:     me.uid,
    name:    me.name,
    handle:  me.handle,
    initial: me.initial,
    color:   me.color,
    avatar:  me.avatar || null
  };

  // Find every post that has a comment with one of the old handles (or my uid already)
  const postsToFix = posts.filter(function(p){
    return p.comments && p.comments.some(function(c){
      if(!c.user) return false;
      if(c.user.uid === me.uid) return true; // already mine, check if stale
      return oldHandles.includes((c.user.handle||'').toLowerCase());
    });
  });

  if(!postsToFix.length){
    if(status) status.textContent = 'No comments found with those old usernames.';
    if(btn){ btn.disabled = false; btn.textContent = 'Repair My Comments'; }
    return;
  }

  // Update locally
  postsToFix.forEach(function(p){
    p.comments.forEach(function(c){
      if(!c.user) return;
      const mine = c.user.uid === me.uid ||
                   oldHandles.includes((c.user.handle||'').toLowerCase());
      if(mine) Object.assign(c.user, updatedUser);
    });
  });
  renderFeed();
  renderExploreFeed();

  if(status) status.textContent = 'Saving to server... ('+postsToFix.length+' posts)';

  // Batch write to Firestore
  try{
    for(let i=0; i<postsToFix.length; i+=400){
      const batch = db.batch();
      postsToFix.slice(i,i+400).forEach(function(p){
        batch.update(postsCol().doc(String(p.id)), {comments: p.comments});
      });
      await batch.commit();
    }
    if(status) status.textContent = 'Done! Updated '+postsToFix.length+' post(s). Your old comments now show @'+me.handle+'.';
    toast('Old comments repaired! ✓');
  } catch(e){
    if(status) status.textContent = 'Saved locally but could not reach server. Try again when online.';
  }
  if(btn){ btn.disabled = false; btn.textContent = 'Repair My Comments'; }
}

// ── ORPHAN HANDLE DETECTION ─────────────────────────────────────
// Runs after posts + allUsers are loaded. Finds comment handles that
// don't match any known user — shows a one-tap banner asking the logged-in
// user if any of those handles are theirs (e.g. after a username change).
const _orphanDismissKey = 'orphanDismissed_v1';
let _orphanDismissed = [];
try{ _orphanDismissed = JSON.parse(localStorage.getItem(_orphanDismissKey)||'[]'); }catch(e){}

async function checkOrphanCommentHandles(){
  const banner = document.getElementById('orphanBanner');

  // Build set of all known handles (lowercase)
  const knownHandles = new Set();
  Object.values(allUsers).forEach(function(u){
    if(u.handle) knownHandles.add(u.handle.toLowerCase());
    if(Array.isArray(u.previousHandles)){
      u.previousHandles.forEach(function(h){ if(h) knownHandles.add(h.toLowerCase()); });
    }
  });
  if(me.handle) knownHandles.add(me.handle.toLowerCase());
  if(Array.isArray(me.previousHandles)){
    me.previousHandles.forEach(function(h){ if(h) knownHandles.add(h.toLowerCase()); });
  }

  // Scan all posts for comment handles not in knownHandles
  const orphanSet = new Set();
  posts.forEach(function(p){
    if(!p.comments) return;
    p.comments.forEach(function(c){
      if(!c.user || c.user.uid) return;
      var h = (c.user.handle||'').toLowerCase();
      if(h && !knownHandles.has(h)) orphanSet.add(c.user.handle);
    });
  });

  const allOrphans = Array.from(orphanSet);
  if(!allOrphans.length){ if(banner) banner.classList.remove('show'); return; }

  // ── ADMIN: auto-repair silently without any banner ──────────────────────
  // Admin confirmed all orphan handles belong to them (they changed username)
  if(isAdmin()){
    var updatedUser = { uid:me.uid, name:me.name, handle:me.handle,
                        initial:me.initial, color:me.color, avatar:me.avatar||null };
    var checked = allOrphans.map(function(h){ return h.toLowerCase(); });

    // Save to previousHandles so future sessions skip this
    if(!Array.isArray(me.previousHandles)) me.previousHandles = [];
    checked.forEach(function(h){ if(!me.previousHandles.includes(h)) me.previousHandles.push(h); });
    saveProfileToFirestore();

    var postsToFix = posts.filter(function(p){
      return p.comments && p.comments.some(function(c){
        return c.user && !c.user.uid && checked.includes((c.user.handle||'').toLowerCase());
      });
    });
    postsToFix.forEach(function(p){
      p.comments.forEach(function(c){
        if(!c.user || c.user.uid) return;
        if(checked.includes((c.user.handle||'').toLowerCase()))
          Object.assign(c.user, updatedUser);
      });
    });
    if(postsToFix.length){
      renderFeed(); renderExploreFeed();
      try{
        for(var i=0; i<postsToFix.length; i+=400){
          var batch = db.batch();
          postsToFix.slice(i,i+400).forEach(function(p){
            batch.update(postsCol().doc(String(p.id)), {comments: p.comments});
          });
          await batch.commit();
        }
        toast('Your old comments updated to @'+me.handle+' ✓');
      }catch(e){}
    }
    return; // done — no banner needed
  }

  // ── NON-ADMIN: show the "is this you?" banner ───────────────────────────
  if(!banner) return;
  const toShow = allOrphans.filter(function(h){
    return !_orphanDismissed.includes(h.toLowerCase());
  });
  if(!toShow.length){ banner.classList.remove('show'); banner.innerHTML=''; return; }

  var checkboxes = toShow.map(function(h){
    return '<label class="orphan-tag">'
      +'<input type="checkbox" value="'+esc(h)+'" checked> @'+esc(h)
      +'</label>';
  }).join('');

  banner.innerHTML =
    '<div class="orphan-icon">🔧</div>'
    +'<div class="orphan-body">'
      +'<div class="orphan-title">Unrecognized username'+(toShow.length>1?'s':'')+' in comments</div>'
      +'<div class="orphan-sub">Found comments under a username that no longer exists. If this was your old username, tap <strong>Yes</strong> to update them to @'+esc(me.handle)+'.</div>'
      +'<div class="orphan-handles">'+checkboxes+'</div>'
      +'<div class="orphan-btns">'
        +'<button class="orphan-btn-yes" id="orphanYesBtn">Yes, that is me</button>'
        +'<button class="orphan-btn-no" id="orphanNoBtn">Not mine</button>'
      +'</div>'
    +'</div>';

  banner.classList.add('show');

  document.getElementById('orphanYesBtn').addEventListener('click', async function(){
    var checked2 = Array.from(banner.querySelectorAll('input[type=checkbox]:checked'))
      .map(function(cb){ return cb.value.toLowerCase(); });
    if(!checked2.length){ toast('Select at least one username'); return; }
    this.disabled = true; this.textContent = 'Updating...';
    if(!Array.isArray(me.previousHandles)) me.previousHandles = [];
    checked2.forEach(function(h){ if(!me.previousHandles.includes(h)) me.previousHandles.push(h); });
    saveProfileToFirestore();
    var updatedUser2 = { uid:me.uid, name:me.name, handle:me.handle,
                         initial:me.initial, color:me.color, avatar:me.avatar||null };
    var postsToFix2 = posts.filter(function(p){
      return p.comments && p.comments.some(function(c){
        return c.user && !c.user.uid && checked2.includes((c.user.handle||'').toLowerCase());
      });
    });
    postsToFix2.forEach(function(p){
      p.comments.forEach(function(c){
        if(!c.user || c.user.uid) return;
        if(checked2.includes((c.user.handle||'').toLowerCase()))
          Object.assign(c.user, updatedUser2);
      });
    });
    renderFeed(); renderExploreFeed();
    try{
      for(var i=0; i<postsToFix2.length; i+=400){
        var batch2 = db.batch();
        postsToFix2.slice(i,i+400).forEach(function(p2){
          batch2.update(postsCol().doc(String(p2.id)), {comments: p2.comments});
        });
        await batch2.commit();
      }
    }catch(e){}
    banner.classList.remove('show'); banner.innerHTML='';
    toast('Comments updated to @'+me.handle+' ✓');
  });

  // NO — dismiss
  document.getElementById('orphanNoBtn').addEventListener('click', function(){
    toShow.forEach(function(h){
      var hl = h.toLowerCase();
      if(!_orphanDismissed.includes(hl)) _orphanDismissed.push(hl);
    });    try{ localStorage.setItem(_orphanDismissKey, JSON.stringify(_orphanDismissed)); }catch(e){}
    banner.classList.remove('show'); banner.innerHTML='';
  });
}

let _commentMigrationDone = false;

// One-time startup: add uid to old comments that have no uid
// by matching comment.user.handle against current allUsers profiles.
// This fixes old comments for any user whose handle hasn't changed yet,
// and primes them so that future handle changes propagate correctly.
async function migrateCommentUids(){
  if(_commentMigrationDone) return;
  _commentMigrationDone = true;

  // Build reverse map: handle -> uid from allUsers
  const handleToUid = {};
  Object.values(allUsers).forEach(function(u){
    if(u.uid && u.handle) handleToUid[u.handle.toLowerCase()] = u.uid;
    // Also map any previousHandles stored on their profile
    if(u.uid && Array.isArray(u.previousHandles)){
      u.previousHandles.forEach(function(h){ if(h) handleToUid[h.toLowerCase()] = u.uid; });
    }
  });
  // Always include the current user's own previousHandles even if allUsers isn't synced yet
  if(me.uid && Array.isArray(me.previousHandles)){
    me.previousHandles.forEach(function(h){ if(h) handleToUid[h.toLowerCase()] = me.uid; });
  }

  // Find posts that have comments missing uid where we can resolve the handle
  const postsToFix = posts.filter(function(p){
    return p.comments && p.comments.some(function(c){
      return c.user && !c.user.uid && c.user.handle &&
             handleToUid[c.user.handle.toLowerCase()];
    });
  });

  if(!postsToFix.length) return;

  // Update locally first
  postsToFix.forEach(function(p){
    p.comments.forEach(function(c){
      if(!c.user || c.user.uid) return;
      const uid = c.user.handle && handleToUid[c.user.handle.toLowerCase()];
      if(!uid) return;
      const live = allUsers[uid];
      c.user = Object.assign({}, c.user, {uid},
        live ? {name:live.name, handle:live.handle,
                color:live.color, initial:live.initial,
                avatar:live.avatar||null} : {}
      );
    });
  });
  // Re-render so comments show updated names immediately
  renderFeed();
  renderExploreFeed();

  // Persist to Firestore in background
  try{
    for(let i=0; i<postsToFix.length; i+=400){
      const batch = db.batch();
      postsToFix.slice(i,i+400).forEach(function(p){
        batch.update(postsCol().doc(String(p.id)), {comments: p.comments});
      });
      await batch.commit();
    }
  } catch(e){}
}

// watchUsersAndWait: starts the profiles listener AND returns a promise
// that resolves once allUsers has been populated for the first time.
// init() awaits this so startPostsListener always has live profile data.
let _watchUsersResolve = null;
const _watchUsersReady = new Promise(function(res){ _watchUsersResolve = res; });

function watchUsersAndWait(){
  watchUsers();
  return _watchUsersReady;
}

function watchUsers(){
  let _firstSnap = true;

  // SAFETY: If Firestore profiles listener never fires (bad rules, offline, etc.)
  // resolve the gate after 6 seconds so init() can continue instead of hanging forever
  var _usersTimeout = setTimeout(function(){
    if(_watchUsersResolve){
      console.warn('watchUsers: timed out waiting for profiles snapshot - continuing anyway');
      _watchUsersResolve(); _watchUsersResolve = null;
    }
  }, 6000);

  db.collection('profiles').onSnapshot(function(snap){
    clearTimeout(_usersTimeout);
    var changed = false;
    snap.docs.forEach(function(d){
      var prev = allUsers[d.id];
      var next = {uid:d.id, ...d.data()};
      if(!prev || prev.name!==next.name || prev.handle!==next.handle || prev.avatar!==next.avatar){
        changed = true;
      }
      allUsers[d.id] = next;
    });

    // First snapshot: resolve the init() gate so posts listener can start
    if(_firstSnap){
      _firstSnap = false;
      if(_watchUsersResolve){ _watchUsersResolve(); _watchUsersResolve = null; }
      // Trigger comment uid migration after posts also have a moment to load
      setTimeout(function(){ migrateCommentUids(); }, 3000);
    }

    // Any subsequent change: re-render feed with updated names/avatars
    if(changed && posts && posts.length){
      renderFeed();
      renderExploreFeed();
    }

    renderFriendsInSidebar();
  }, function(err){
    // Error handler: Firestore denied the read or network failed
    // Resolve the gate so init() doesn't hang forever
    console.warn('watchUsers: profiles listener error:', err.message);
    clearTimeout(_usersTimeout);
    if(_watchUsersResolve){ _watchUsersResolve(); _watchUsersResolve = null; }
  });
}

async function searchUsers(q){
  const drop=document.getElementById('searchDropdown');
  q=q.trim().toLowerCase();
  if(!q){drop.classList.remove('open');return;}
  drop.classList.add('open');
  // Search from allUsers + post authors we know about
  const seen=new Set();
  const results=[];
  // from loaded profiles
  Object.values(allUsers).forEach(u=>{
    if(u.uid===me.uid)return;
    const name=(u.name||'').toLowerCase();
    const handle=(u.handle||'').toLowerCase();
    if((name.includes(q)||handle.includes(q)) && !seen.has(u.uid)){
      seen.add(u.uid);results.push(u);
    }
  });
  // also search post authors not yet in allUsers
  posts.forEach(p=>{
    if(!p.uid||p.uid===me.uid||p.uid==='system'||seen.has(p.uid))return;
    const name=(p.user.name||'').toLowerCase();
    const handle=(p.user.handle||'').toLowerCase();
    if(name.includes(q)||handle.includes(q)){
      seen.add(p.uid);
      results.push({uid:p.uid,...p.user});
    }
  });
  if(!results.length){
    drop.innerHTML=`<div class="search-empty">No users found for "@${q}"</div>`;return;
  }
  drop.innerHTML=results.slice(0,8).map(u=>{
    const iU=_r(String(u.uid||''));
    return `<div class="search-result" onclick="closeSearch();viewProfile(_g(${iU}))">
      <div class="search-result-av" style="background:${u.color||'var(--pink)'}">
        ${u.avatar?`<img src="${u.avatar}" alt="">`:(u.initial||(u.name?u.name.charAt(0):'')||'?')}
      </div>
      <div>
        <div class="search-result-name">${esc(u.name||u.handle||'User')}</div>
        <div class="search-result-handle">@${esc(u.handle||'')}</div>
      </div>
    </div>`;
  }).join('');
}

function closeSearch(){
  document.getElementById('searchDropdown').classList.remove('open');
}

// ── VIEW OTHER USER PROFILE ───────────────────────────
async function viewProfile(uid){
  if(!uid || uid==='system') return;
  if(uid === me.uid){ goTo('profile'); return; }

  // Navigate to the dedicated other-profile view
  currentOtherProfileUid = uid;
  goTo('other-profile');
}

let currentOtherProfileUid = null;
let otherProfilePostsTab = 'posts'; // 'posts' | 'grid'

async function loadOtherProfile(uid){
  if(!uid) return;
  const container = document.getElementById('otherProfileContent');
  if(!container) return;

  // Step 1 — assemble profile from local caches (instant, no network needed)
  let prof = {uid, name:'User', handle:'user', color:'var(--pink)', initial:'U', followersCount:0, following:[]};
  if(allUsers[uid]) Object.assign(prof, allUsers[uid]);
  const postByUser = posts.find(function(p){ return p.uid===uid && p.user; });
  if(postByUser && postByUser.user && (!prof.handle || prof.handle==='user')){
    Object.assign(prof, postByUser.user, {uid});
  }

  // Step 2 — render right away with local data (never shows "loading" stuck)
  _drawOtherProfile(uid, prof);

  // Step 3 — fetch Firestore profile in background and refresh if richer data found
  try{
    const doc = await db.collection('profiles').doc(uid).get();
    if(doc.exists){
      Object.assign(prof, {uid}, doc.data());
      _drawOtherProfile(uid, prof);
    }
  } catch(e){}
}

function _drawOtherProfile(uid, prof){
  try{
    var container = document.getElementById('otherProfileContent');
    if(!container) return;

    var isFollowing = Array.isArray(me.following) && me.following.includes(uid);
    var isOnline    = getPresenceStatus(uid) === 'online';
    var userPosts   = posts.filter(function(p){ return p.uid===uid; });
    var feedPosts   = userPosts.filter(function(p){ return !p.isStatus; });
    var iUid        = _r(uid);
    var profName    = prof.name || prof.handle || 'User';
    var iName       = _r(String(profName));
    var initial     = prof.initial || (prof.name ? prof.name.charAt(0) : '?');
    var bannerBg    = prof.bannerColor || 'linear-gradient(135deg,#f4a8c0,#e2688a)';
    var avBg        = prof.color || 'var(--pink)';
    var followersCount = prof.followersCount || 0;
    var followingCount = (prof.following && prof.following.length) ? prof.following.length : 0;

    var avHtml = prof.avatar
      ? '<img src="'+prof.avatar+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : '<span>'+initial+'</span>';

    // Use CSS classes only (no inline styles) so media queries work on mobile
    var html =
      '<div class="profile-card">'
        +'<div class="opu-banner" style="background:'+bannerBg+';">'
          +(prof.bannerImage ? '<img src="'+prof.bannerImage+'" alt="">' : '')
          +'<button class="opu-back" id="opuBackBtn">'
            +'<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>'
          +'</button>'
        +'</div>'
        +'<div class="opu-top">'
          +'<div class="opu-av" style="background:'+avBg+';">'
            +avHtml
            +(isOnline ? '<div class="opu-online-dot"></div>' : '')
          +'</div>'
          +'<div class="opu-name">'
            +esc(profName)
            +(prof.isAdmin ? '<span class="opu-admin-badge"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Admin</span>' : '')
            +(isOnline ? '<span class="opu-online-badge">● Active now</span>' : '')
          +'</div>'
          +'<div class="opu-handle">@'+esc(prof.handle||'user')+'</div>'
          +(prof.bio ? '<div class="opu-bio">'+esc(prof.bio)+'</div>' : '')
          +'<div class="opu-actions">'
            +'<button id="opuFollowBtn" class="opu-follow-btn'+(isFollowing?' following':'')+'">'
              +(isFollowing?'Following':'Follow')
            +'</button>'
            +'<button id="opuMsgBtn" class="opu-msg-btn">'
              +'<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Message'
            +'</button>'
          +'</div>'
          +'<div class="opu-stats">'
            +'<div class="opu-stat"><div class="opu-stat-n">'+feedPosts.length+'</div><div class="opu-stat-l">Posts</div></div>'
            +'<div class="opu-stat" id="opuFollowersStat"><div class="opu-stat-n">'+followersCount+'</div><div class="opu-stat-l">Followers</div></div>'
            +'<div class="opu-stat"><div class="opu-stat-n">'+followingCount+'</div><div class="opu-stat-l">Following</div></div>'
          +'</div>'
        +'</div>'
      +'</div>'
      +'<div class="opu-feed-tabs">'
        +'<div id="opuTabPosts" class="opu-feed-tab'+(otherProfilePostsTab==='posts'?' active':'')+'">📋 Posts</div>'
        +'<div id="opuTabGrid" class="opu-feed-tab'+(otherProfilePostsTab==='grid'?' active':'')+'">⊞ Grid</div>'
      +'</div>'
      +'<div id="opuFeedContent"></div>';

    container.innerHTML = html;

    // wire buttons
    document.getElementById('opuBackBtn').onclick = function(){ goTo(previousView||'home'); };

    document.getElementById('opuFollowBtn').onclick = function(){
      toggleFollowUserOpu(uid, profName);
    };

    document.getElementById('opuMsgBtn').onclick = function(){
      openDMFromPost(_g(iUid), _g(iName));
    };

    document.getElementById('opuTabPosts').onclick = function(){
      otherProfilePostsTab='posts';
      this.style.color='var(--pink)'; this.style.borderBottom='2px solid var(--pink)';
      var g=document.getElementById('opuTabGrid');
      if(g){g.style.color='var(--text3)';g.style.borderBottom='2px solid transparent';}
      renderOtherProfileFeed(userPosts);
    };

    document.getElementById('opuTabGrid').onclick = function(){
      otherProfilePostsTab='grid';
      this.style.color='var(--pink)'; this.style.borderBottom='2px solid var(--pink)';
      var p=document.getElementById('opuTabPosts');
      if(p){p.style.color='var(--text3)';p.style.borderBottom='2px solid transparent';}
      renderOtherProfileGrid(feedPosts);
    };

    // render initial tab
    if(otherProfilePostsTab==='grid'){
      renderOtherProfileGrid(feedPosts);
    } else {
      renderOtherProfileFeed(userPosts);
    }

  } catch(err){
    console.error('_drawOtherProfile error:', err);
    var c = document.getElementById('otherProfileContent');
    if(c) c.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);">Could not load profile. <button onclick="loadOtherProfile(currentOtherProfileUid)" style="color:var(--pink);background:none;border:none;cursor:pointer;font-family:Jost,sans-serif;font-size:14px;">Tap to retry</button></div>';
  }
}

function renderOtherProfileFeed(userPosts){
  const fc = document.getElementById('opuFeedContent');
  if(!fc) return;
  if(!userPosts || !userPosts.length){
    fc.innerHTML = '<div class="opu-empty">No posts yet 🌸</div>';
    return;
  }
  fc.innerHTML = '';
  userPosts.forEach(function(p, i){
    const card = buildCard(p, i);
    fc.appendChild(card);
  });
}

function renderOtherProfileGrid(feedPosts){
  const fc = document.getElementById('opuFeedContent');
  if(!fc) return;
  if(!feedPosts || !feedPosts.length){
    fc.innerHTML = '<div class="opu-empty">No posts yet 🌸</div>';
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'opu-grid';
  feedPosts.forEach(function(p){
    const imgs = p.images||(p.image?[p.image]:[]);
    const img = imgs[0]||null;
    const iPid = _r(String(p.id));
    const item = document.createElement('div');
    item.className = 'opu-grid-item';
    item.innerHTML = img
      ? '<img src="'+img+'" alt=""><div class="opu-grid-overlay"><span>❤️ '+p.likes+'</span><span>💬 '+p.comments.length+'</span></div>'
      : '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:28px;">'+(p.isStatus?'💬':'🖼️')+'</div>';
    item.addEventListener('click', function(){ openLightbox(_g(iPid)); });
    grid.appendChild(item);
  });
  fc.innerHTML = '';
  fc.appendChild(grid);
}

function toggleFollowUserOpu(uid, name){
  if(!me.following) me.following=[];
  const btn = document.getElementById('opuFollowBtn');
  const idx = me.following.indexOf(uid);
  if(idx > -1){
    me.following.splice(idx, 1);
    if(btn){ btn.textContent='Follow'; btn.classList.remove('following'); }
    toast('Unfollowed '+name);
    db.collection('profiles').doc(uid).update({followersCount:firebase.firestore.FieldValue.increment(-1)}).catch(()=>{});
  } else {
    me.following.push(uid);
    if(btn){ btn.textContent='Following'; btn.classList.add('following'); }
    toast('Following '+name+'! 🌸');
    db.collection('profiles').doc(uid).update({followersCount:firebase.firestore.FieldValue.increment(1)}).catch(()=>{});
    sendNotification(uid,'follow',me,'');
  }
  // Update the followers count shown
  const statEls = document.querySelectorAll('.opu-stat-n');
  if(statEls[1]){
    const cur = parseInt(statEls[1].textContent)||0;
    statEls[1].textContent = me.following.includes(uid) ? cur+1 : Math.max(0,cur-1);
  }
  saveProfileToFirestore();
  renderFriendsInSidebar();
}

function closeUserProfile(){
  document.getElementById('userProfileOverlay').classList.remove('open');
}

function toggleFollowUser(uid,name){
  if(!me.following) me.following=[];
  const btn=document.getElementById('upmFollowBtn');
  const idx=me.following.indexOf(uid);
  if(idx>-1){
    me.following.splice(idx,1);
    if(btn){btn.textContent='Follow';btn.classList.remove('following');}
    toast('Unfollowed '+name);
    db.collection('profiles').doc(uid).update({followersCount:firebase.firestore.FieldValue.increment(-1)}).catch(()=>{});
  } else {
    me.following.push(uid);
    if(btn){btn.textContent='Following';btn.classList.add('following');}
    toast('Following '+name+'! 🌸');
    db.collection('profiles').doc(uid).update({followersCount:firebase.firestore.FieldValue.increment(1)}).catch(()=>{});
    sendNotification(uid,'follow',me,'');
  }
  saveProfileToFirestore();
}

// ── REAL DM SYSTEM (Firestore) ────────────────────────
let activeDMUid=null;
let dmUnsubscribe=null;

function getDMConvoId(uid1,uid2){
  return [uid1,uid2].sort().join('_');
}

async function openDMFromPost(otherUid,otherName){
  if(!otherUid||otherUid==='system'){toast('Cannot message this user');return;}
  if(otherUid===me.uid){toast('You cannot message yourself');return;}
  goTo('messages');
  setTimeout(()=>openDMWith(otherUid,otherName),150);
}

async function openDMWith(otherUid,otherName){
  activeDMUid=otherUid;
  if(dmUnsubscribe) dmUnsubscribe();

  // get other user profile
  let otherProf={uid:otherUid,name:otherName||'User',handle:'user',color:'var(--pink)',initial:'U'};
  try{
    const d=await db.collection('profiles').doc(otherUid).get();
    if(d.exists) otherProf={uid:otherUid,...d.data()};
  }catch(e){}
  // fallback from posts
  const postByThem=posts.find(p=>p.uid===otherUid);
  if(postByThem&&postByThem.user&&(!otherProf.handle||otherProf.handle==='user'))
    Object.assign(otherProf,postByThem.user,{uid:otherUid});

  const convoId=getDMConvoId(me.uid,otherUid);

  // Build last-active label for the DM header
  function dmPresenceLabel(uid){
    const p = onlineFriends[uid];
    if(!p) return '<span style="color:#94a3b8;">● Offline</span>';
    if(p.online) return '<span style="color:#22c55e;">● Active now</span>';
    if(p.lastSeen){
      const ms = p.lastSeen.toMillis ? p.lastSeen.toMillis() : (p.lastSeen.seconds ? p.lastSeen.seconds*1000 : 0);
      if(ms) return '<span style="color:var(--text3);">Last active '+timeAgo(ms)+'</span>';
    }
    return '<span style="color:#94a3b8;">● Offline</span>';
  }

  const chatArea=document.getElementById('chatArea');
  chatArea.innerHTML=`
    <div class="chat-header">
      <button class="msg-back-btn" onclick="closeChatMobile()" title="Back">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="post-avatar" style="background:${otherProf.color||'var(--pink)'};width:36px;height:36px;font-size:13px;cursor:pointer;position:relative;" onclick="viewProfile(_g(${_r(otherUid)}))">
        ${otherProf.avatar?`<img src="${otherProf.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`:esc(otherProf.initial||(otherProf.name?otherProf.name.charAt(0):'')||'U')}
        ${(onlineFriends[otherUid]&&onlineFriends[otherUid].online)?'<div style="position:absolute;bottom:1px;right:1px;width:10px;height:10px;background:#22c55e;border-radius:50%;border:2px solid var(--card);"></div>':''}
      </div>
      <div style="cursor:pointer;flex:1;" onclick="viewProfile(_g(${_r(otherUid)}))">
        <div style="font-size:14px;font-weight:600;">${esc(otherProf.name||'User')}</div>
        <div style="font-size:11px;">${dmPresenceLabel(otherUid)}</div>
      </div>
    </div>
    <div class="chat-msgs" id="chatMsgs"></div>
    <div class="chat-input-row">
      <input class="chat-input" id="dmInput" placeholder="Send a message..." onkeydown="if(event.key==='Enter')sendDM(_g(${_r(convoId)}))">
      <button class="chat-send" onclick="sendDM(_g(${_r(convoId)}))"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
    </div>`;

  // Real-time message listener (no orderBy to avoid Firestore index requirement)
  dmUnsubscribe = db.collection('dms').doc(convoId).collection('messages')
    .onSnapshot(async function(snap){
      var msgs = document.getElementById('chatMsgs');
      if(!msgs) return;
      // Sort by ts client-side
      var sorted = snap.docs.slice().sort(function(a,b){
        var ta=a.data().ts?(a.data().ts.toMillis?a.data().ts.toMillis():a.data().ts.seconds?a.data().ts.seconds*1000:0):0;
        var tb=b.data().ts?(b.data().ts.toMillis?b.data().ts.toMillis():b.data().ts.seconds?b.data().ts.seconds*1000:0):0;
        return ta-tb;
      });
      msgs.innerHTML='';
      var lastDateLabel = '';
      sorted.forEach(function(d){
        var m = d.data();
        if(!m.text) return;
        var mine = m.from === me.uid;

        // Compute timestamp info
        var tsMs = m.ts ? (m.ts.toMillis ? m.ts.toMillis() : m.ts.seconds ? m.ts.seconds*1000 : 0) : 0;
        var timeStr = '';
        var dateLabel = '';
        if(tsMs){
          var d2 = new Date(tsMs);
          timeStr = d2.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
          // date separator: "Today", "Yesterday", or "Mar 10"
          var now = new Date();
          var msgDay = d2.toDateString();
          var today = now.toDateString();
          var yesterday = new Date(now-86400000).toDateString();
          if(msgDay === today) dateLabel = 'Today';
          else if(msgDay === yesterday) dateLabel = 'Yesterday';
          else dateLabel = d2.toLocaleDateString([],{month:'short',day:'numeric',year: d2.getFullYear()!==now.getFullYear()?'numeric':undefined});
        }

        // Insert date separator when date changes
        if(dateLabel && dateLabel !== lastDateLabel){
          lastDateLabel = dateLabel;
          var sep = document.createElement('div');
          sep.style.cssText='text-align:center;font-size:11px;color:var(--text3);margin:8px 0 4px;';
          sep.textContent = dateLabel;
          msgs.appendChild(sep);
        }

        var div = document.createElement('div');
        div.className = 'chat-msg ' + (mine ? 'mine' : 'theirs');
        div.innerHTML = '<div class="chat-bubble">'+esc(m.text)+'</div>'
          + (timeStr ? '<div class="chat-time" style="font-size:10px;color:var(--text3);margin-top:2px;'+(mine?'text-align:right;':'')+'">'+timeStr+'</div>' : '');
        msgs.appendChild(div);
      });

      // Show "Seen" under last MY message if recipient has read it
      try {
        var convoDoc = await db.collection('dms').doc(convoId).get();
        if(convoDoc.exists) {
          var cdata = convoDoc.data();
          var theirSeenTs = cdata['lastSeen_'+otherUid];
          if(theirSeenTs) {
            // find last .mine div and add seen label
            var mineDivs = msgs.querySelectorAll('.chat-msg.mine');
            if(mineDivs.length) {
              var lastMine = mineDivs[mineDivs.length-1];
              if(!lastMine.querySelector('.chat-seen')) {
                var seen = document.createElement('div');
                seen.className = 'chat-seen';
                seen.textContent = '✓✓ Seen';
                lastMine.appendChild(seen);
              }
            }
          }
        }
      } catch(e){}

      msgs.scrollTop = msgs.scrollHeight;
    }, function(err){ console.warn('DM msg listener:', err.message); });

  // Mark convo as read by me (for read receipts)
  db.collection('dms').doc(convoId).update({
    ['lastSeen_'+me.uid]: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function(){});

  // On mobile: slide chat panel open
  var chatEl = document.getElementById('chatArea');
  if(chatEl && window.innerWidth <= 700){ chatEl.classList.add('open'); }

  // mark convo as active in sidebar
  renderDMConvoList(otherUid);
  // save convo metadata so it shows in sidebar
  const meta={participants:[me.uid,otherUid],lastMsg:'',lastTs:firebase.firestore.FieldValue.serverTimestamp(),
    [`name_${me.uid}`]:otherProf.name||'User',
    [`avatar_${me.uid}`]:otherProf.avatar||null,
    [`color_${me.uid}`]:otherProf.color||'var(--pink)',
    [`initial_${me.uid}`]:otherProf.initial||(otherProf.name?otherProf.name.charAt(0):'')||'U',
    [`handle_${me.uid}`]:otherProf.handle||'user',
    [`name_${otherUid}`]:me.name,
    [`avatar_${otherUid}`]:me.avatar||null,
    [`color_${otherUid}`]:me.color,
    [`initial_${otherUid}`]:me.initial,
    [`handle_${otherUid}`]:me.handle
  };
  db.collection('dms').doc(convoId).set(meta,{merge:true}).catch(()=>{});
}

async function sendDM(convoId){
  const inp=document.getElementById('dmInput');
  const txt=inp.value.trim();if(!txt)return;
  inp.value='';
  await db.collection('dms').doc(convoId).collection('messages').add({
    from:me.uid,text:txt,ts:firebase.firestore.FieldValue.serverTimestamp()
  });
  db.collection('dms').doc(convoId).update({lastMsg:txt,lastTs:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
  // notify recipient
  if(activeDMUid && activeDMUid!==me.uid) sendNotification(activeDMUid,'message',me,txt.slice(0,60));
}

// Load DM conversations list from Firestore
let dmConvoUnsubscribe = null;
function loadDMConvos(){
  if(dmConvoUnsubscribe){ dmConvoUnsubscribe(); dmConvoUnsubscribe=null; }
  function renderConvos(snap){
    const list=document.getElementById('convoList'); if(!list)return;
    list.innerHTML='';
    if(!snap.docs || !snap.docs.length){
      list.innerHTML='<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;">No conversations yet.<br>Find someone to message! 💬</div>';
      return;
    }
    snap.docs.forEach(function(d){
      const c=d.data();
      if(!c.participants || !Array.isArray(c.participants)) return;
      const otherUid=c.participants.find(function(u){return u!==me.uid;});
      if(!otherUid) return;
      // Use OTHER person's display info (what THEY see of you vs what you see of them)
      // name_X means "the name of the OTHER person as seen by user X"
      const name=c['name_'+me.uid]||allUsers[otherUid]&&allUsers[otherUid].name||'User';
      const color=c['color_'+me.uid]||allUsers[otherUid]&&allUsers[otherUid].color||'var(--pink)';
      const initial=c['initial_'+me.uid]||(name?name.charAt(0):'U');
      const avatar=c['avatar_'+me.uid]||allUsers[otherUid]&&allUsers[otherUid].avatar||null;
      const lastMsg=c.lastMsg||'Say hello! 👋';
      const lastTs = c.lastTs ? (c.lastTs.toMillis ? c.lastTs.toMillis() : c.lastTs.seconds ? c.lastTs.seconds*1000 : 0) : 0;
      const lastTime = lastTs ? timeAgo(lastTs) : '';
      const iU=_r(otherUid); const iN=_r(name);
      const div=document.createElement('div');
      div.className='msg-conv'+(activeDMUid===otherUid?' active':'');
      div.innerHTML=
        '<div class="msg-conv-av-wrap"><div class="msg-conv-av" style="background:'+color+';color:white;">'
          +(avatar?'<img src="'+avatar+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">':esc(initial))
        +'</div></div>'
        +'<div class="msg-conv-info" style="flex:1;min-width:0;">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;">'
            +'<div class="msg-conv-name">'+esc(name)+'</div>'
            +(lastTime?'<div style="font-size:10.5px;color:var(--text3);flex-shrink:0;margin-left:6px;">'+lastTime+'</div>':'')
          +'</div>'
          +'<div style="display:flex;justify-content:space-between;align-items:center;">'
            +'<div class="msg-conv-last" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(lastMsg.slice(0,40))+'</div>'
            +(function(){
              var pres = onlineFriends[otherUid];
              if(pres && pres.online)
                return '<div style="font-size:10px;color:#22c55e;flex-shrink:0;white-space:nowrap;margin-left:6px;">● active now</div>';
              if(pres && pres.lastSeen){
                var lsMs = pres.lastSeen.toMillis ? pres.lastSeen.toMillis() : (pres.lastSeen.seconds ? pres.lastSeen.seconds*1000 : 0);
                if(lsMs) return '<div style="font-size:10px;color:var(--text3);flex-shrink:0;white-space:nowrap;margin-left:6px;">'+timeAgo(lsMs)+'</div>';
              }
              return '';
            })()
          +'</div>'
        +'</div>';
      div.addEventListener('click', function(){
        openDMWith(_g(iU), _g(iN));
        // Mobile: open chat panel
        const ca=document.getElementById('chatArea');
        if(ca && window.innerWidth<=700){ ca.classList.add('open'); }
      });
      list.appendChild(div);
    });
  }

  // No orderBy - avoids Firestore composite index requirement
  // Sort client-side instead
  dmConvoUnsubscribe = db.collection('dms')
    .where('participants','array-contains',me.uid)
    .onSnapshot(function(snap){
      // sort newest first
      var sorted = {docs: snap.docs.slice().sort(function(a,b){
        var ad=a.data(), bd=b.data();
        var ta=ad.lastTs?(ad.lastTs.toMillis?ad.lastTs.toMillis():ad.lastTs.seconds?ad.lastTs.seconds*1000:0):0;
        var tb=bd.lastTs?(bd.lastTs.toMillis?bd.lastTs.toMillis():bd.lastTs.seconds?bd.lastTs.seconds*1000:0):0;
        return tb-ta;
      })};
      renderConvos(sorted);
    }, function(err){ console.warn('DM listener error:', err.message); });
}

function renderDMConvoList(activeUid){
  document.querySelectorAll('.msg-conv').forEach(el=>{
    el.classList.remove('active');
  });
}

// (chat CSS is in <style> tag above)


function uploadBanner(inp){
  const f=inp.files[0];if(!f)return;
  // Reset input so same file can be re-selected
  toast('Uploading cover photo... ⏳');
  const r=new FileReader();
  r.onload=async function(e){
    let url = e.target.result; // base64 fallback
    try{
      url = await uploadToStorage(e.target.result, 'banners/'+me.uid+'_'+Date.now());
    }catch(err){ console.warn('Banner upload fallback to base64'); }
    me.bannerImage = url;
    me.bannerColor = '';
    await saveProfileToFirestore();
    // Update all banner UI
    const bi=document.getElementById('bannerImg');
    if(bi){ bi.src=url; bi.style.display='block'; bi.style.opacity='1'; }
    const pb=document.getElementById('profileBanner');
    if(pb){
      pb.style.backgroundImage='url("'+url+'")';
      pb.style.backgroundSize='cover';
      pb.style.backgroundPosition='center';
      pb.style.background='url("'+url+'") center/cover no-repeat';
    }
    // Reset the file input so it fires again next time
    inp.value='';
    toast('Cover photo updated ✓ 🌸');
  };
  r.readAsDataURL(f);
}

// ── STORIES ───────────────────────────────────────────
const STORY_BG_COLORS=['linear-gradient(135deg,#e2688a,#f0a0b8)','linear-gradient(135deg,#667eea,#764ba2)','linear-gradient(135deg,#f093fb,#f5576c)','linear-gradient(135deg,#4facfe,#00f2fe)','linear-gradient(135deg,#43e97b,#38f9d7)','linear-gradient(135deg,#fa709a,#fee140)','linear-gradient(135deg,#30cfd0,#330867)','linear-gradient(135deg,#f7971e,#ffd200)'];
let _storyType='photo';
let _storyFileData=null;
let _storyBgColor=STORY_BG_COLORS[0];
let _svStories=[];
let _svIdx=0;
let _svTimer=null;
let _svCurrentUid=null;

function openStoryModal(){
  _storyFileData=null;_storyType='photo';
  document.getElementById('smPreview').innerHTML='<span style="color:var(--text3);font-size:13px;">Tap to select photo</span>';
  document.getElementById('storyModal').classList.add('open');
  // Build bg swatches
  var sw=document.getElementById('smBgColors');
  if(!sw.children.length){
    STORY_BG_COLORS.forEach(function(c,i){
      var s=document.createElement('div');s.className='sm-bg-swatch'+(i===0?' on':'');
      s.style.background=c;
      s.onclick=function(){_storyBgColor=c;document.querySelectorAll('.sm-bg-swatch').forEach(x=>x.classList.remove('on'));s.classList.add('on');updateTextStoryPreview();};
      sw.appendChild(s);
    });
  }
}
function closeStoryModal(){ document.getElementById('storyModal').classList.remove('open'); }
function setStoryType(t){
  _storyType=t;
  document.getElementById('smOptPhoto').classList.toggle('on',t==='photo');
  document.getElementById('smOptText').classList.toggle('on',t==='text');
  document.getElementById('smPhotoArea').style.display=t==='photo'?'':'none';
  document.getElementById('smTextArea').style.display=t==='text'?'':'none';
  if(t==='text') updateTextStoryPreview();
  else document.getElementById('smPreview').innerHTML='<span style="color:var(--text3);font-size:13px;">Tap to select photo</span>';
}
function updateTextStoryPreview(){
  var txt=document.getElementById('smTextInput').value||'Your story...';
  var prev=document.getElementById('smPreview');
  prev.style.background=_storyBgColor;
  prev.innerHTML='<div class="sm-text-bg"><div style="color:white;font-size:20px;font-weight:700;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.3);">'+esc(txt)+'</div></div>';
}
function handleStoryFile(inp){
  var f=inp.files[0];if(!f)return;
  var r=new FileReader();
  r.onload=function(e){
    _storyFileData=e.target.result;
    var prev=document.getElementById('smPreview');
    if(f.type.startsWith('video/')){
      prev.innerHTML='<video src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover;" muted loop autoplay></video>';
    } else {
      prev.innerHTML='<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover;">';
    }
    prev.style.background='none';
  };
  r.readAsDataURL(f);
}
async function publishStory(){
  if(_storyType==='photo'&&!_storyFileData){toast('Please select a photo first');return;}
  if(_storyType==='text'&&!document.getElementById('smTextInput').value.trim()){toast('Write something first');return;}
  toast('Uploading story...');
  var storyData={
    uid: me.uid, userName: me.name, userHandle: me.handle, userColor: me.color, userInitial: me.initial, userAvatar: me.avatar||null,
    type: _storyType, text: _storyType==='text'?(document.getElementById('smTextInput').value.trim()):'',
    bgColor: _storyType==='text'?_storyBgColor:'',
    mediaUrl: '', caption: '', seen: [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now()+24*60*60*1000).toISOString()
  };
  if(_storyType==='photo'&&_storyFileData){
    try{
      var url=await uploadToStorage(_storyFileData,'stories/'+me.uid+'/'+Date.now());
      storyData.mediaUrl=url;
    }catch(e){}
  }
  await db.collection('stories').add(storyData);
  closeStoryModal();
  toast('Story shared! 🌸 Disappears in 24h');
  loadStories();
}

async function loadStories(){
  try{
  var row=document.getElementById('storiesRow');
  // Remove old story items except the "add" item
  Array.from(row.children).forEach(function(c){ if(!c.querySelector('.add-ring')) c.remove(); });
  var now=new Date();
  var snap=await db.collection('stories').where('expiresAt','>',now.toISOString()).get().catch(()=>({docs:[]}));
  // Group by uid
  var byUser={};
  snap.docs.forEach(function(d){
    var s={id:d.id,...d.data()};
    if(!byUser[s.uid]) byUser[s.uid]={uid:s.uid,stories:[],user:s};
    byUser[s.uid].stories.push(s);
  });
  // My story first
  var myEntry=byUser[me.uid];
  var others=Object.values(byUser).filter(function(u){return u.uid!==me.uid;});
  var ordered=(myEntry?[myEntry]:[]).concat(others);
  ordered.forEach(function(entry){
    var u=entry.user;
    var isMine=entry.uid===me.uid;
    var seenAll=entry.stories.every(function(s){return s.seen&&s.seen.includes(me.uid);});
    var d=document.createElement('div');d.className='story-item';
    var ringClass=seenAll?'story-ring seen':(isMine?'story-ring my-ring':'story-ring unseen');
    var avHTML=u.userAvatar?('<img src="'+esc(u.userAvatar)+'" alt="">'):esc(u.userInitial||'?');
    d.innerHTML='<div class="'+ringClass+'"><div class="story-avatar" style="background:'+esc(u.userColor||'var(--pink)')+';color:white;">'+avHTML+'</div></div>'
      +'<div class="story-name">'+esc((u.userName||'?').split(' ')[0])+'</div>';
    d.onclick=function(){openStoryViewer(entry.stories,0);};
    row.appendChild(d);
  });
  }catch(e){ console.warn('loadStories error:',e); }
}

function openStoryViewer(stories,startIdx){
  _svStories=stories; _svIdx=startIdx;
  document.getElementById('storyViewer').classList.add('open');
  renderStorySlide();
}
function closeStoryViewer(){
  clearTimeout(_svTimer);
  document.getElementById('storyViewer').classList.remove('open');
}
// Story reactions config
var STORY_REACTIONS = ['❤️','😍','😂','😮','😢','🔥'];

function renderStorySlide(){
  clearTimeout(_svTimer);
  var s=_svStories[_svIdx];if(!s)return closeStoryViewer();
  var isMine=s.uid===me.uid;

  // Mark as seen (record uid + name for viewers panel)
  if(!isMine){
    var seenArr=Array.isArray(s.seen)?s.seen:[];
    if(!seenArr.includes(me.uid)){
      var seenInfo={uid:me.uid,name:me.name||me.handle,handle:me.handle,color:me.color,initial:me.initial,avatar:me.avatar||null};
      db.collection('stories').doc(s.id).update({
        seen:firebase.firestore.FieldValue.arrayUnion(me.uid),
        seenBy:firebase.firestore.FieldValue.arrayUnion(JSON.stringify(seenInfo))
      }).catch(()=>{});
    }
  }

  // Header
  var avEl=document.getElementById('svAv');
  avEl.style.background=s.userColor||'var(--pink)';
  avEl.innerHTML=s.userAvatar?('<img src="'+esc(s.userAvatar)+'" alt="">'):esc(s.userInitial||'?');
  document.getElementById('svName').textContent=s.userName||'';
  document.getElementById('svTime').textContent=timeAgo(s.createdAt)+' · '+(_svIdx+1)+' of '+_svStories.length;

  // Media
  var media=document.getElementById('svMedia');
  var tapPrev='<div class="sv-tap-prev" onclick="storyNav(-1)"></div>';
  var tapNext='<div class="sv-tap-next" onclick="storyNav(1)"></div>';
  if(s.type==='text'){
    media.innerHTML=tapPrev+'<div class="sv-text-story" style="background:'+esc(s.bgColor||'linear-gradient(135deg,#e2688a,#f0a0b8)')+';width:100%;height:100%;display:flex;align-items:center;justify-content:center;">'+esc(s.text)+'</div>'+tapNext;
  } else if(s.mediaUrl){
    var isVid=s.mediaUrl.includes('.mp4')||s.mediaUrl.includes('video');
    media.innerHTML=tapPrev+(isVid?'<video src="'+esc(s.mediaUrl)+'" style="max-width:100%;max-height:85vh;object-fit:contain;" autoplay muted loop></video>':'<img src="'+esc(s.mediaUrl)+'" style="max-width:100%;max-height:85vh;object-fit:contain;">')+tapNext;
  }

  // Archive button for own stories
  if(isMine){
    var archBtn=document.createElement('button');archBtn.className='sv-view-archive';archBtn.textContent='📚 Your Archive';
    archBtn.onclick=function(){closeStoryViewer();openStoryArchive();};
    media.appendChild(archBtn);
  }

  // ── VIEWERS BUTTON (owner only) ──────────────────────
  var existingVBtn=media.querySelector('.sv-viewers-btn');
  if(existingVBtn)existingVBtn.remove();
  if(isMine){
    var seenCount=(s.seen&&s.seen.length)||0;
    var vBtn=document.createElement('button');
    vBtn.className='sv-viewers-btn';
    vBtn.innerHTML='👁 '+seenCount+' viewer'+(seenCount!==1?'s':'');
    vBtn.onclick=function(e){e.stopPropagation();openStoryViewers(s);};
    media.appendChild(vBtn);
  }

  // ── VIEWERS PANEL (hidden by default) ───────────────
  var existingPanel=media.querySelector('#storyViewersPanel');
  if(existingPanel)existingPanel.remove();
  var vPanel=document.createElement('div');
  vPanel.id='storyViewersPanel';
  vPanel.innerHTML='<div class="sv-viewers-handle"></div><div class="sv-viewers-title">👁 Viewers</div><div id="svViewersList"></div>';
  media.appendChild(vPanel);

  // ── REACTIONS BAR (non-owner only) ──────────────────
  var existingBar=media.querySelector('.sv-reactions-bar');
  if(existingBar)existingBar.remove();
  if(!isMine){
    var bar=document.createElement('div');bar.className='sv-reactions-bar';
    var myReaction=(s.reactions&&s.reactions[me.uid])||null;
    STORY_REACTIONS.forEach(function(emoji){
      var counts=s.reactionCounts||{};
      var count=counts[emoji]||0;
      var wrap=document.createElement('div');wrap.className='sv-react-wrap';
      var btn=document.createElement('button');
      btn.className='sv-react-btn'+(myReaction===emoji?' reacted':'');
      btn.textContent=emoji;
      btn.title=count>0?(count+' reaction'+(count>1?'s':'')):'';
      if(count>0){
        var badge=document.createElement('span');badge.className='sv-react-count';badge.textContent=count;
        wrap.appendChild(badge);
      }
      btn.onclick=function(e){
        e.stopPropagation();
        reactToStory(s,emoji);
      };
      wrap.appendChild(btn);
      bar.appendChild(wrap);
    });
    media.appendChild(bar);
  }

  // Caption
  var cap=document.getElementById('svCaption');
  if(s.caption){cap.style.display='';cap.textContent=s.caption;}else{cap.style.display='none';}

  // Progress bars
  var pb=document.getElementById('svProgressBar');pb.innerHTML='';
  _svStories.forEach(function(st,i){
    var seg=document.createElement('div');seg.className='sv-seg';
    var fill=document.createElement('div');fill.className='sv-seg-fill';
    if(i<_svIdx) fill.style.width='100%';
    seg.appendChild(fill);pb.appendChild(seg);
  });
  // Animate current segment (5s per story)
  var dur=5000;
  var fillEl=pb.children[_svIdx]&&pb.children[_svIdx].firstChild;
  if(fillEl){
    fillEl.style.transition='width '+dur+'ms linear';
    setTimeout(()=>fillEl.style.width='100%',50);
  }
  _svTimer=setTimeout(()=>storyNav(1),dur);
}

// ── OPEN VIEWERS LIST PANEL ───────────────────────────
function openStoryViewers(s){
  var panel=document.getElementById('storyViewersPanel');
  if(!panel)return;
  panel.classList.add('open');
  var list=document.getElementById('svViewersList');
  if(!list)return;
  // Parse seenBy array
  var seenBy=[];
  if(Array.isArray(s.seenBy)){
    s.seenBy.forEach(function(raw){
      try{ seenBy.push(typeof raw==='string'?JSON.parse(raw):raw); }catch(e){}
    });
  }
  // Deduplicate by uid
  var seen={}; seenBy=seenBy.filter(function(x){ if(seen[x.uid])return false; seen[x.uid]=true; return true; });
  if(!seenBy.length){
    list.innerHTML='<div style="color:rgba(255,255,255,.5);font-size:13px;padding:10px 0;">No viewers yet 👀</div>';
    return;
  }
  var reactions=s.reactions||{};
  list.innerHTML='';
  seenBy.forEach(function(viewer){
    var row=document.createElement('div');row.className='sv-viewer-row';
    var avBg=viewer.color||'var(--pink)';
    row.innerHTML=
      '<div class="sv-viewer-av" style="background:'+esc(avBg)+';">'
        +(viewer.avatar?'<img src="'+esc(viewer.avatar)+'" alt="">':esc(viewer.initial||'?'))
      +'</div>'
      +'<div class="sv-viewer-name">'+esc(viewer.name||viewer.handle||'User')+'<br><span style="font-size:10.5px;opacity:.6;font-weight:400;">@'+esc(viewer.handle||'')+'</span></div>'
      +(reactions[viewer.uid]?'<div class="sv-viewer-reaction">'+reactions[viewer.uid]+'</div>':'');
    list.appendChild(row);
  });
  // Close panel when tapping outside it
  panel.addEventListener('click',function(e){e.stopPropagation();},{once:false});
}

// ── REACT TO A STORY ─────────────────────────────────
async function reactToStory(s, emoji){
  var myPrev=(s.reactions&&s.reactions[me.uid])||null;
  var newReaction=myPrev===emoji?null:emoji;  // toggle off if same

  // Update local story data
  if(!s.reactions) s.reactions={};
  if(!s.reactionCounts) s.reactionCounts={};

  // Remove old reaction count
  if(myPrev){
    s.reactionCounts[myPrev]=Math.max(0,(s.reactionCounts[myPrev]||1)-1);
    if(s.reactionCounts[myPrev]===0) delete s.reactionCounts[myPrev];
  }
  // Apply new reaction
  if(newReaction){
    s.reactions[me.uid]=newReaction;
    s.reactionCounts[newReaction]=(s.reactionCounts[newReaction]||0)+1;
  } else {
    delete s.reactions[me.uid];
  }

  // Re-render reactions bar with updated counts
  renderStorySlide();

  // Persist to Firestore
  try{
    var update={};
    update['reactions.'+me.uid] = newReaction || firebase.firestore.FieldValue.delete();
    if(myPrev) update['reactionCounts.'+myPrev]=firebase.firestore.FieldValue.increment(-1);
    if(newReaction) update['reactionCounts.'+newReaction]=firebase.firestore.FieldValue.increment(1);
    await db.collection('stories').doc(s.id).update(update);
    // Notify story owner
    if(newReaction && s.uid!==me.uid){
      sendNotification(s.uid,'like',{name:me.name,handle:me.handle},newReaction+' reacted to your story');
    }
  }catch(e){}
}
function storyNav(dir){
  _svIdx+=dir;
  if(_svIdx<0) return closeStoryViewer();
  if(_svIdx>=_svStories.length) return closeStoryViewer();
  renderStorySlide();
}

async function openStoryArchive(){
  document.getElementById('storyArchive').classList.add('open');
  var grid=document.getElementById('archiveGrid');
  grid.innerHTML='<div style="color:var(--text3);font-size:13px;grid-column:1/-1;padding:20px;">Loading...</div>';
  var snap=await db.collection('stories').where('uid','==',me.uid).get().catch(()=>({docs:[]}));
  var stories=snap.docs.map(d=>({id:d.id,...d.data()}));
  stories.sort(function(a,b){
    var ta=a.createdAt?(a.createdAt.toMillis?a.createdAt.toMillis():a.createdAt.seconds*1000):0;
    var tb=b.createdAt?(b.createdAt.toMillis?b.createdAt.toMillis():b.createdAt.seconds*1000):0;
    return tb-ta;
  });
  var now=new Date().toISOString();
  if(!stories.length){grid.innerHTML='<div style="color:var(--text3);font-size:13px;grid-column:1/-1;padding:20px;text-align:center;">You haven\'t posted any stories yet.</div>';return;}
  grid.innerHTML='';
  stories.forEach(function(s){
    var expired=s.expiresAt&&s.expiresAt<now;
    var item=document.createElement('div');item.className='sa-item';
    if(s.type==='text'){
      item.style.background=s.bgColor||'linear-gradient(135deg,#e2688a,#f0a0b8)';
      item.innerHTML='<div class="sa-item-text">'+esc(s.text)+'</div>';
    } else if(s.mediaUrl){
      item.innerHTML='<img src="'+esc(s.mediaUrl)+'" alt="">';
    }
    item.innerHTML+='<div class="sa-item-date">'+(expired?'Expired · ':'Active · ')+timeAgo(s.createdAt)+'</div>';
    item.onclick=function(){closeStoryArchive();openStoryViewer([s],0);};
    grid.appendChild(item);
  });
}
function closeStoryArchive(){ document.getElementById('storyArchive').classList.remove('open'); }

// ── POST EDITING ───────────────────────────────────────
var _editPostId=null;
function openEditPost(id){
  _editPostId=String(id);
  var p=posts.find(function(x){return String(x.id)===_editPostId;});
  if(!p)return;
  document.getElementById('epmText').value=p.caption||'';
  document.getElementById('editPostModal').classList.add('open');
}
function closeEditPost(){ document.getElementById('editPostModal').classList.remove('open'); }
async function saveEditPost(){
  if(!_editPostId)return;
  var txt=document.getElementById('epmText').value.trim();
  var p=posts.find(function(x){return String(x.id)===_editPostId;});
  if(!p)return;
  p.caption=txt;
  await updatePostField(_editPostId,{caption:txt});
  closeEditPost();
  renderFeed();renderExploreFeed();
  toast('Caption updated ✓');
}

// ── PINNED POST ────────────────────────────────────────
async function togglePin(id){
  id=String(id);
  var p=posts.find(function(x){return String(x.id)===id;});if(!p)return;
  // Unpin any other pinned post first
  if(!p.pinned){
    posts.filter(function(x){return x.uid===me.uid&&x.pinned&&String(x.id)!==id;}).forEach(function(x){
      x.pinned=false;updatePostField(String(x.id),{pinned:false});
    });
  }
  p.pinned=!p.pinned;
  await updatePostField(id,{pinned:p.pinned});
  renderFeed();refreshProfile();
  toast(p.pinned?'Post pinned 📌':'Post unpinned');
}

// ── MENTION DROPDOWN ───────────────────────────────────
var _mentionDropdown=null;
var _mentionPostId=null;
function handleMentionInput(inp,pid){
  var val=inp.value;
  var atIdx=val.lastIndexOf('@');
  if(atIdx===-1||val[atIdx-1]===' '||atIdx===val.length-1){
    hideMentionDropdown();return;
  }
  var query=val.slice(atIdx+1).toLowerCase();
  var matches=Object.values(allUsers).filter(function(u){
    return u.handle&&u.handle.toLowerCase().startsWith(query)&&u.uid!==me.uid;
  }).slice(0,5);
  if(!matches.length){hideMentionDropdown();return;}
  showMentionDropdown(inp,matches,atIdx,pid);
}
function showMentionDropdown(inp,users,atIdx,pid){
  hideMentionDropdown();
  var wrap=inp.closest('.c-input-wrap')||inp.parentElement;
  if(!wrap.style.position) wrap.style.position='relative';
  var dd=document.createElement('div');dd.className='mention-dropdown';
  users.forEach(function(u){
    var item=document.createElement('div');item.className='mention-item';
    var avImg=u.avatar?('<img src="'+esc(u.avatar)+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'):esc(u.initial||'?');
    item.innerHTML='<div class="mention-av" style="background:'+esc(u.color||'var(--pink)')+'">'+avImg+'</div><div><strong>'+esc(u.name||u.handle)+'</strong><div style="font-size:11px;color:var(--text3);">@'+esc(u.handle)+'</div></div>';
    item.onmousedown=function(e){
      e.preventDefault();
      var val=inp.value;var atIdx2=val.lastIndexOf('@');
      inp.value=val.slice(0,atIdx2)+'@'+u.handle+' ';
      hideMentionDropdown();inp.focus();
    };
    dd.appendChild(item);
  });
  wrap.appendChild(dd);_mentionDropdown=dd;_mentionPostId=pid;
}
function hideMentionDropdown(){
  if(_mentionDropdown){_mentionDropdown.remove();_mentionDropdown=null;}
}
document.addEventListener('click',function(e){
  if(_mentionDropdown&&!_mentionDropdown.contains(e.target))hideMentionDropdown();
});

// ── READ RECEIPTS ON DMs ───────────────────────────────
function markDMSeen(convoId){
  if(!convoId||!me.uid)return;
  db.collection('dms').doc(convoId).update({['lastSeen_'+me.uid]:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
}
function getDMSeenStatus(msg,convoId,otherUid){
  // Returns 'Seen' if the other person has seen past this message's timestamp
  return ''; // Simplified — real read receipts need per-message seen tracking
}

// ── INLINE BANNER COLOR PICKER ────────────────────────
function toggleBannerColorPicker(e){
  e.stopPropagation();
  const picker = document.getElementById('bannerColorPicker');
  if(!picker) return;
  const isOpen = picker.style.display !== 'none';
  if(isOpen){ picker.style.display='none'; return; }
  // Build swatches
  const sw = document.getElementById('inlineBannerSwatches');
  if(sw && !sw.children.length){
    BANNER_COLORS.forEach(function(c){
      const s = document.createElement('div');
      s.style.cssText='width:36px;height:24px;border-radius:8px;cursor:pointer;background:'+c
        +';border:2px solid '+(me.bannerColor===c?'var(--pink)':'transparent')+';transition:border .15s;';
      s.onclick = function(ev){
        ev.stopPropagation();
        me.bannerColor = c; me.bannerImage = '';
        saveProfileToFirestore();
        const pb = document.getElementById('profileBanner');
        if(pb){ pb.style.background=c; pb.style.backgroundSize='cover'; }
        const bi = document.getElementById('bannerImg');
        if(bi){ bi.src=''; bi.style.display='none'; }
        sw.querySelectorAll('div').forEach(function(x){ x.style.borderColor='transparent'; });
        s.style.borderColor='var(--pink)';
        toast('Banner color updated ✓');
        picker.style.display='none';
      };
      sw.appendChild(s);
    });
  }
  picker.style.display = 'block';
  // Close when clicking outside
  setTimeout(function(){
    document.addEventListener('click', function closePicker(ev){
      if(!picker.contains(ev.target)){ picker.style.display='none'; }
      document.removeEventListener('click', closePicker);
    });
  }, 0);
}

// ── FEEDBACK / SUGGEST / REPORT ───────────────────────
let _fbType = 'idea';
function openFeedbackModal(){
  document.getElementById('feedbackModal').style.display='flex';
  document.getElementById('fbText').value='';
  setFbType('idea');
}
function closeFeedbackModal(){
  document.getElementById('feedbackModal').style.display='none';
}
function setFbType(t){
  _fbType = t;
  ['idea','bug','report'].forEach(function(x){
    const btn = document.getElementById('fbType'+x.charAt(0).toUpperCase()+x.slice(1));
    if(btn){
      btn.style.background = x===t ? 'var(--pink)' : 'none';
      btn.style.color = x===t ? 'white' : 'var(--text)';
      btn.style.border = x===t ? 'none' : '1px solid var(--border)';
    }
  });
}
async function submitFeedback(){
  const txt = (document.getElementById('fbText').value||'').trim();
  if(!txt){ toast('Please write something first'); return; }
  try{
    await db.collection('feedback').add({
      type: _fbType,
      text: txt,
      fromUid: me.uid||'',
      fromName: me.name||me.handle||'User',
      fromHandle: me.handle||'',
      read: false,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeFeedbackModal();
    toast('Sent! Thanks for your feedback 💌');
  }catch(e){
    console.error('Feedback error:',e);
    toast('Error: ' + (e.code||e.message||'unknown') + ' — check Firestore rules allow writes');
  }
}

// ── PROFILE THEMES ────────────────────────────────────
const PROFILE_THEMES = [
  {name:'Rose',     pink:'#e2688a', soft:'#f0a0b8', pale:'rgba(226,104,138,.13)', bg:'linear-gradient(145deg,#fff0f6,#fde8f2,#fdf3f8)'},
  {name:'Violet',   pink:'#8b5cf6', soft:'#a78bfa', pale:'rgba(139,92,246,.13)',  bg:'linear-gradient(145deg,#f5f0ff,#ede8fe,#f8f5ff)'},
  {name:'Coral',    pink:'#f97316', soft:'#fb923c', pale:'rgba(249,115,22,.13)',   bg:'linear-gradient(145deg,#fff7f0,#fee8d8,#fff5ee)'},
  {name:'Ocean',    pink:'#0ea5e9', soft:'#38bdf8', pale:'rgba(14,165,233,.13)',   bg:'linear-gradient(145deg,#f0f9ff,#e0f2fe,#f5fbff)'},
  {name:'Mint',     pink:'#10b981', soft:'#34d399', pale:'rgba(16,185,129,.13)',   bg:'linear-gradient(145deg,#f0fdf4,#dcfce7,#f5fdf8)'},
  {name:'Gold',     pink:'#f59e0b', soft:'#fbbf24', pale:'rgba(245,158,11,.13)',   bg:'linear-gradient(145deg,#fffbf0,#fef3c7,#fffdf5)'},
  {name:'Cherry',   pink:'#e11d48', soft:'#fb7185', pale:'rgba(225,29,72,.13)',    bg:'linear-gradient(145deg,#fff0f3,#ffe4e9,#fff5f7)'},
  {name:'Slate',    pink:'#64748b', soft:'#94a3b8', pale:'rgba(100,116,139,.13)',  bg:'linear-gradient(145deg,#f8fafc,#f1f5f9,#fafcff)'},
];
let _currentThemeIdx = 0;

function renderProfileThemeGrid(){
  var grid = document.getElementById('profileThemeGrid');
  if(!grid) return;
  grid.innerHTML = '';
  PROFILE_THEMES.forEach(function(t, i){
    var s = document.createElement('div');
    s.className = 'profile-theme-swatch' + (i===_currentThemeIdx?' on':'');
    s.style.background = t.bg;
    s.style.border = '2.5px solid ' + (i===_currentThemeIdx?t.pink:'transparent');
    s.title = t.name;
    s.onclick = function(){ applyProfileTheme(i); };
    // Mini preview dot
    s.innerHTML = '<div style="position:absolute;bottom:6px;right:6px;width:12px;height:12px;border-radius:50%;background:'+t.pink+'"></div>';
    grid.appendChild(s);
  });
}

function applyProfileTheme(idx){
  _currentThemeIdx = idx;
  var t = PROFILE_THEMES[idx];
  var root = document.documentElement;
  var isDark = document.documentElement.dataset.theme === 'dark';
  root.style.setProperty('--pink', t.pink);
  root.style.setProperty('--pink-soft', t.soft);
  root.style.setProperty('--pink-pale', t.pale);
  root.style.setProperty('--pink-glow', t.pale.replace('.13)','.18)'));
  if(!isDark){
    // update body bg inline for light mode
    document.body.style.background = t.bg;
    document.body.style.backgroundAttachment = 'fixed';
  }
  // persist
  me.profileTheme = idx;
  saveProfileToFirestore();
  renderProfileThemeGrid();
  toast('Theme: ' + t.name + ' 🎨');
}

// ── PROFILE GRID LAYOUT ────────────────────────────────
var _profileLayout = 'grid';
function setProfileLayout(layout){
  _profileLayout = layout;
  ['grid','list','magazine'].forEach(function(l){
    var btn = document.getElementById('layout-'+l);
    if(btn) btn.classList.toggle('on', l===layout);
  });
  var grid = document.getElementById('grid');
  if(grid){
    grid.classList.remove('layout-list','layout-magazine');
    if(layout!=='grid') grid.classList.add('layout-'+layout);
  }
  me.profileLayout = layout;
  saveProfileToFirestore();
  toast('Layout: ' + layout.charAt(0).toUpperCase()+layout.slice(1));
}

// ── SEARCH — USERS + POSTS + HASHTAGS ────────────────────
var _searchTab = 'users';
function setSearchTab(tab){
  _searchTab = tab;
  ['users','posts','tags'].forEach(function(t){
    var el = document.getElementById('stab-'+t);
    if(el) el.classList.toggle('on', t===tab);
  });
  var inp = document.getElementById('searchPageInput');
  if(inp && inp.value.trim()) searchPageAll(inp.value);
  else {
    var res = document.getElementById('searchPageResults');
    if(res) res.innerHTML = '<div class="search-empty">Type to search ' + tab + '...</div>';
  }
}

function searchPageAll(q){
  q = q.trim().toLowerCase();
  var res = document.getElementById('searchPageResults');
  if(!res) return;
  if(!q){ res.innerHTML=''; return; }
  if(_searchTab === 'users'){
    searchPageUsers(q);
  } else if(_searchTab === 'posts'){
    var matched = posts.filter(function(p){
      return p.caption && p.caption.toLowerCase().indexOf(q) > -1;
    });
    if(!matched.length){ res.innerHTML='<div class="search-empty">No posts matching "'+esc(q)+'"</div>'; return; }
    res.innerHTML = '';
    matched.slice(0,20).forEach(function(p,i){ res.appendChild(buildCard(p,i)); });
  } else if(_searchTab === 'tags'){
    // Find all hashtags matching query
    var tagQ = q.replace(/^#/,'');
    var tagCounts = {};
    posts.forEach(function(p){
      if(!p.caption) return;
      var tags = p.caption.match(/#(\w+)/g) || [];
      tags.forEach(function(t){
        var tag = t.slice(1).toLowerCase();
        if(tag.indexOf(tagQ) > -1) tagCounts[tag] = (tagCounts[tag]||0) + 1;
      });
    });
    var tagList = Object.entries(tagCounts).sort(function(a,b){return b[1]-a[1];});
    if(!tagList.length){ res.innerHTML='<div class="search-empty">No tags matching "#'+esc(tagQ)+'"</div>'; return; }
    res.innerHTML = '';
    tagList.slice(0,20).forEach(function(entry){
      var tag=entry[0], count=entry[1];
      var d = document.createElement('div');
      d.className = 'search-result';
      d.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;';
      d.innerHTML = '<div style="width:42px;height:42px;border-radius:50%;background:var(--pink-pale);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">#</div>'
        + '<div><div style="font-weight:700;color:var(--pink)">#'+esc(tag)+'</div><div style="font-size:12px;color:var(--text3)">'+count+' post'+(count!==1?'s':'')+'</div></div>';
      d.onclick = function(){ showHashtag(tag); };
      res.appendChild(d);
    });
  }
}

function searchAll(q){
  // Nav bar search — shows user dropdown
  searchUsers(q);
}

// ── ADMIN: USER MANAGEMENT (ban/suspend) ─────────────────
async function loadAdminUsers(){
  var list = document.getElementById('adminUserList');
  if(!list || !isAdmin()) return;
  list.innerHTML = '<div style="color:var(--text3);font-size:13px;">Loading...</div>';
  var snap = await db.collection('profiles').get().catch(function(){ return {docs:[]}; });
  if(!snap.docs.length){ list.innerHTML='<div style="color:var(--text3);font-size:13px;">No users found.</div>'; return; }
  list.innerHTML = '';
  snap.docs.forEach(function(d){
    var u = d.data();
    var uid = d.id;
    if(uid === me.uid) return; // skip self
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);';
    var avBg = u.color||'var(--pink)';
    var avHTML = u.avatar ? '<img src="'+esc(u.avatar)+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : esc(u.initial||'?');
    var isBanned = u.banned === true;
    row.innerHTML = '<div class="admin-user-av" style="background:'+esc(avBg)+';min-width:36px;">'+avHTML+'</div>'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="font-weight:600;font-size:13px;">'+esc(u.name||'Unknown')+'</div>'
        + '<div style="font-size:12px;color:var(--text3);">@'+esc(u.handle||uid)+(isBanned?' · <span style="color:#e05577">Banned</span>':'')+'</div>'
      + '</div>'
      + '<button class="'+(isBanned?'unban-btn':'ban-btn')+'" onclick="toggleBanUser(\''+uid+'\','+isBanned+')">'+(isBanned?'Unban':'Ban')+'</button>';
    list.appendChild(row);
  });
}

async function toggleBanUser(uid, currentlyBanned){
  if(!isAdmin()) return;
  var newVal = !currentlyBanned;
  await db.collection('profiles').doc(uid).update({banned: newVal}).catch(function(e){ toast('Error: '+e.message); return; });
  toast(newVal ? 'User banned 🚫' : 'User unbanned ✅');
  loadAdminUsers();
}

// ── ADMIN: POST MODERATION QUEUE ─────────────────────────
async function loadAdminModeration(){
  var list = document.getElementById('adminModerationList');
  if(!list || !isAdmin()) return;
  // Posts that have been reported (have a 'reported' flag or report count)
  var reported = posts.filter(function(p){ return p.reported || (p.reportCount && p.reportCount > 0); });
  if(!reported.length){
    list.innerHTML = '<div style="color:var(--text3);font-size:13px;">✅ No flagged posts.</div>';
    return;
  }
  list.innerHTML = '';
  reported.forEach(function(p){
    var d = document.createElement('div');
    d.style.cssText = 'padding:12px 0;border-bottom:1px solid var(--border);';
    var thumb = (p.images&&p.images[0]) ? '<img src="'+esc(p.images[0])+'" style="width:48px;height:48px;object-fit:cover;border-radius:8px;flex-shrink:0;">' : '';
    d.innerHTML = '<div style="display:flex;align-items:center;gap:10px;">'
      + (thumb||'<div style="width:48px;height:48px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;">📝</div>')
      + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:12.5px;font-weight:600;">@'+(p.user&&p.user.handle?esc(p.user.handle):esc(p.uid))+'</div>'
        + '<div style="font-size:12px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc((p.caption||'').slice(0,60))+'</div>'
        + '<div style="font-size:11px;color:#e05577;margin-top:2px;">⚠️ Reported '+(p.reportCount||1)+' time'+(p.reportCount>1?'s':'')+'</div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;">'
        + '<button onclick="adminApprovePost(\''+String(p.id)+'\')" style="padding:4px 10px;border-radius:8px;border:1px solid #22c55e;background:none;color:#22c55e;font-size:12px;cursor:pointer;">Keep</button>'
        + '<button onclick="deletePost(\''+String(p.id)+'\')" style="padding:4px 10px;border-radius:8px;border:none;background:#e05577;color:white;font-size:12px;cursor:pointer;">Delete</button>'
      + '</div>'
      + '</div>';
    list.appendChild(d);
  });
}

function adminApprovePost(id){
  updatePostField(String(id), {reported:false, reportCount:0});
  toast('Post cleared ✅');
  loadAdminModeration();
}

// ── ADMIN: ANALYTICS CHART ────────────────────────────────
function renderAdminAnalytics(){
  if(!isAdmin()) return;
  // Stats
  var totalLikes = posts.reduce(function(s,p){return s+(p.likes||0);},0);
  var today = new Date().toDateString();
  var todayPosts = posts.filter(function(p){
    if(!p.createdAt) return false;
    var d = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt.seconds*1000);
    return d.toDateString()===today;
  }).length;
  var el = document.getElementById('adminTotalPosts'); if(el) el.textContent=posts.length;
  var el2 = document.getElementById('adminTotalUsers'); if(el2) el2.textContent=Object.keys(allUsers).length;
  var el3 = document.getElementById('adminTotalLikes'); if(el3) el3.textContent=totalLikes;
  var el4 = document.getElementById('adminTodayPosts'); if(el4) el4.textContent=todayPosts;
  // 7-day chart
  var chart = document.getElementById('adminActivityChart');
  if(!chart) return;
  chart.innerHTML = '';
  var days = [];
  for(var i=6;i>=0;i--){
    var d=new Date(); d.setDate(d.getDate()-i);
    days.push({label:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()], date:d.toDateString(), count:0});
  }
  posts.forEach(function(p){
    if(!p.createdAt) return;
    var d = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt.seconds*1000);
    var ds = d.toDateString();
    var day = days.find(function(x){return x.date===ds;});
    if(day) day.count++;
  });
  var max = Math.max(1, Math.max.apply(null,days.map(function(d){return d.count;})));
  days.forEach(function(day){
    var col = document.createElement('div');
    col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;';
    var pct = Math.round(day.count/max*100);
    col.innerHTML = '<div style="font-size:10px;font-weight:700;color:var(--pink)">'+day.count+'</div>'
      + '<div style="flex:1;width:100%;display:flex;align-items:flex-end;">'
        + '<div style="width:100%;background:linear-gradient(180deg,var(--pink),var(--pink-soft));border-radius:4px 4px 0 0;height:'+pct+'%;min-height:'+(day.count?4:2)+'px;transition:height .4s ease;"></div>'
      + '</div>'
      + '<div style="font-size:9.5px;color:var(--text3)">'+day.label+'</div>';
    chart.appendChild(col);
  });
  loadAdminUsers();
  loadAdminModeration();
}

// ── ADMIN: LOAD FEEDBACK INBOX ────────────────────────
async function loadAdminFeedback(){
  const list = document.getElementById('adminFeedbackList');
  const badge = document.getElementById('fbUnreadBadge');
  if(!list || !isAdmin()) return;
  list.innerHTML = '<div style="color:var(--text3);font-size:13px;">Loading...</div>';
  try{
    const snap = await db.collection('feedback').get();
    const items = snap.docs.slice().sort(function(a,b){
      const ta=a.data().ts?(a.data().ts.toMillis?a.data().ts.toMillis():0):0;
      const tb=b.data().ts?(b.data().ts.toMillis?b.data().ts.toMillis():0):0;
      return tb-ta;
    });
    const unread = items.filter(function(d){ return !d.data().read; }).length;
    if(badge){ badge.textContent=unread; badge.style.display=unread?'':'none'; }
    if(!items.length){
      list.innerHTML='<div style="color:var(--text3);font-size:13px;padding:8px 0;">No feedback yet.</div>';
      return;
    }
    const icons = {idea:'💡',bug:'🐛',report:'🚩'};
    list.innerHTML='';
    items.forEach(function(d){
      const n=d.data();
      const div=document.createElement('div');
      div.style.cssText='padding:12px;border-radius:12px;background:var(--bg2);margin-bottom:10px;border:1px solid var(--border);'+(n.read?'':'border-left:3px solid var(--pink);');
      div.innerHTML=
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'
          +'<div style="font-size:12.5px;font-weight:700;color:var(--text);">'+(icons[n.type]||'📝')+' '+(n.type||'feedback').charAt(0).toUpperCase()+(n.type||'feedback').slice(1)
            +' <span style="font-weight:400;color:var(--text2);">from @'+esc(n.fromHandle||n.fromName||'user')+'</span></div>'
          +'<div style="font-size:11px;color:var(--text3);">'+timeAgo(n.ts)+'</div>'
        +'</div>'
        +'<div style="font-size:13px;color:var(--text);line-height:1.5;">'+esc(n.text)+'</div>';
      if(!n.read){
        div.addEventListener('click',function(){
          db.collection('feedback').doc(d.id).update({read:true}).catch(()=>{});
          div.style.borderLeft='1px solid var(--border)';
        });
      }
      list.appendChild(div);
    });
  }catch(e){
    list.innerHTML='<div style="color:var(--text3);font-size:13px;">Could not load feedback.</div>';
  }
}

// ── UTILS ─────────────────────────────────────────────
function expandImg(src){document.getElementById('imgExpSrc').src=src;document.getElementById('imgExp').classList.add('open');}
// refresh all post times every 60s
setInterval(function(){
  document.querySelectorAll('.post-time').forEach(function(el){
    // find closest post card and re-render time
    var card=el.closest('.post-card');
    if(!card) return;
    var pid=card.id.replace('pc-','');
    var p=posts.find(function(x){return String(x.id)===pid;});
    if(p&&p.createdAt) el.textContent=timeAgo(p.createdAt)+(p.isStatus?' · status':'');
  });
},60000);

function toast(msg){const el=document.getElementById('toastEl');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
// Legacy stubs (no longer used for posts — kept for any remaining calls)
function savePosts(){}
function saveJSON(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function loadJSON(k,def){try{const v=localStorage.getItem(k);return v?JSON.parse(v):def;}catch(e){return def;}}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── ADMIN ─────────────────────────────────────────────
const ADMIN_EMAILS = ['keshamaebangcoyo9@gmail.com'];
function isAdmin(){ return !!(auth.currentUser && ADMIN_EMAILS.includes(auth.currentUser.email)); }

// ── AUTH FUNCTIONS ────────────────────────────────────
let _authMode = 'in';
function authTab(m){
  _authMode = m;
  document.getElementById('t-in').classList.toggle('on', m==='in');
  document.getElementById('t-up').classList.toggle('on', m==='up');
  document.getElementById('aBtn').textContent = m==='in' ? 'Sign In' : 'Create Account';
  document.getElementById('aName').style.display = m==='up' ? 'block' : 'none';
  document.getElementById('authErr').className = 'ac-err';
}
function showAuthErr(msg){
  const e = document.getElementById('authErr');
  e.textContent = msg;
  e.className = 'ac-err on';
}
async function authSubmit(){
  const email = document.getElementById('aEmail').value.trim();
  const pass  = document.getElementById('aPass').value;
  if(!email || !pass){ showAuthErr('Please fill in your email and password'); return; }
  const btn = document.getElementById('aBtn');
  btn.disabled = true;
  btn.textContent = 'Please wait...';
  try{
    if(_authMode === 'in'){
      await auth.signInWithEmailAndPassword(email, pass);
    } else {
      const name = document.getElementById('aName').value.trim() || 'Kez User';
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      await cred.user.updateProfile({displayName: name});
    }
  } catch(err){
    const msgs = {
      'auth/user-not-found':     'No account found with this email',
      'auth/wrong-password':     'Incorrect password',
      'auth/invalid-credential': 'Incorrect email or password',
      'auth/email-already-in-use':'This email is already registered',
      'auth/weak-password':      'Password must be at least 6 characters',
      'auth/invalid-email':      'Please enter a valid email'
    };
    showAuthErr(msgs[err.code] || err.message);
    btn.disabled = false;
    btn.textContent = _authMode === 'in' ? 'Sign In' : 'Create Account';
  }
}
async function authGoogle(){
  try{
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch(err){
    if(err.code === 'auth/popup-blocked'){
      await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
    } else {
      showAuthErr('Google sign-in failed — try email instead');
    }
  }
}
function doSignOut(){ if(confirm('Sign out of Kez Media?')) auth.signOut(); }

// ── AUTH / SPLASH ────────────────────────────────────
// BULLETPROOF APPROACH:
// Splash runs on a pure 2.2s CSS timer — it never waits for Firebase.
// Firebase auth runs in parallel. By the time splash finishes,
// either the app is ready (show it) or we show login.
// If Firebase is slow/offline the splash still disappears at 2.2s
// and shows the login screen. User is NEVER stuck.

var _appReady  = false;
var _splashGone = false;

function _hideSplash(){
  if(_splashGone) return;
  _splashGone = true;
  var s = document.getElementById('splashScreen');
  if(s){ s.classList.add('fade-out'); setTimeout(function(){ s.style.display='none'; },500); }
}

// After 2.2s: hide splash and show whatever is ready
setTimeout(function(){
  _hideSplash();
  if(!_appReady){
    // App not ready yet — show login as safe fallback
    document.getElementById('authOverlay').style.display = 'flex';
  }
}, 2200);

// Emergency fallback: if still stuck after 10s, force show login
setTimeout(function(){
  if(!_appReady){
    console.warn('Emergency: app still not ready after 10s, showing login');
    _hideSplash();
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('authOverlay').style.visibility = 'visible';
    document.getElementById('authOverlay').style.opacity = '1';
  }
}, 10000);

async function runAppInit(user){
  try {
    me = {
      name:        user.displayName || 'Kez User',
      handle:      (user.displayName||'user').toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''),
      color:       'linear-gradient(135deg,#e2688a,#f0a0b8)',
      initial:     (user.displayName||'K')[0].toUpperCase(),
      bio:         '✨ Welcome to my Kez Media profile!',
      bannerColor: 'linear-gradient(135deg,#f4a8c0,#e2688a,#c93f6e)',
      uid:         user.uid,
      email:       user.email
    };
    // Show the app immediately after basic setup - don't wait for everything to load
    _appReady = true;
    document.getElementById('authOverlay').style.display = 'none';
    _hideSplash();
    await init();
    // Re-hide in case something showed it again
    document.getElementById('authOverlay').style.display = 'none';
    var admin = isAdmin();
    var badge = document.querySelector('.admin-badge');
    if(badge) badge.style.display = admin ? 'inline-flex' : 'none';
    var adminNav = document.getElementById('sn-admin');
    if(adminNav) adminNav.style.display = admin ? 'flex' : 'none';
    var adminSideNav = document.getElementById('mn-admin');
    if(adminSideNav) adminSideNav.style.display = admin ? 'flex' : 'none';
    var sub = document.getElementById('settingsSubtitle');
    if(sub) sub.textContent = admin ? 'Manage your account — you have full admin access' : 'Manage your account and preferences';
    if(admin){
      db.collection('profiles').doc(user.uid).set({isAdmin:true},{merge:true}).catch(function(){});
    }
  } catch(err){
    console.error('App init error:', err);
    // Crash = show login, never leave user stuck
    _hideSplash();
    document.getElementById('authOverlay').style.display = 'flex';
  }
}

auth.onAuthStateChanged(function(user){
  if(user){
    // Logged in — start app immediately (runs alongside splash timer)
    runAppInit(user);
  } else {
    // User signed out — always show login screen immediately
    _appReady = false;
    _splashGone = false;
    var overlay = document.getElementById('authOverlay');
    if(overlay){
      overlay.style.display = 'flex';
      overlay.style.visibility = 'visible';
      overlay.style.opacity = '1';
    }
    // Clear any lingering auth error
    var errEl = document.getElementById('authErr');
    if(errEl) errEl.className = 'ac-err';
    // Hide splash if somehow still showing
    _hideSplash();
    // Reset inputs
    var emailEl = document.getElementById('aEmail');
    var passEl  = document.getElementById('aPass');
    if(emailEl) emailEl.value = '';
    if(passEl)  passEl.value  = '';
  }
});

// ═══════════════════════════════════════════════════
// PRESENCE SYSTEM — tracks who's online in real time
// ═══════════════════════════════════════════════════
let presenceInterval = null;
let onlineFriends = {}; // uid -> {online, lastSeen}

function startPresence(){
  if(!me.uid) return;
  const ref = db.collection('presence').doc(me.uid);
  // Write online immediately
  ref.set({online:true, lastSeen:firebase.firestore.FieldValue.serverTimestamp(), name:me.name||me.handle, handle:me.handle, color:me.color, initial:me.initial, avatar:me.avatar||null}).catch(()=>{});
  // Heartbeat every 30s
  presenceInterval = setInterval(function(){
    ref.update({online:true, lastSeen:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
  }, 30000);
  // Mark offline on page hide/unload
  window.addEventListener('beforeunload', function(){
    ref.update({online:false, lastSeen:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
  });
  document.addEventListener('visibilitychange', function(){
    if(document.hidden){
      ref.update({online:false, lastSeen:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
    } else {
      ref.update({online:true, lastSeen:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
    }
  });
}

function watchPresence(){
  // Watch presence for ALL users — updates right sidebar friends list
  db.collection('presence').onSnapshot(function(snap){
    onlineFriends = {};
    snap.docs.forEach(function(d){
      if(d.id !== me.uid) onlineFriends[d.id] = d.data();
    });
    renderFriendsInSidebar();
    // Also update online dots on people cards if visible
    document.querySelectorAll('[data-presence-uid]').forEach(function(el){
      const uid = el.dataset.presenceUid;
      const p = onlineFriends[uid];
      el.style.display = (p && p.online) ? '' : 'none';
    });
  }, function(){});
}

function getPresenceStatus(uid){
  const p = onlineFriends[uid];
  if(!p) return 'offline';
  if(p.online) return 'online';
  // Check if seen in last 5 min = away
  if(p.lastSeen){
    const ms = p.lastSeen.toMillis ? p.lastSeen.toMillis() : (p.lastSeen.seconds ? p.lastSeen.seconds*1000 : 0);
    if(Date.now() - ms < 5*60*1000) return 'away';
  }
  return 'offline';
}

function renderFriendsInSidebar(){
  const container = document.getElementById('sidebarFriends');
  if(!container) return;
  // Show followed users that you follow (friends = mutual or following)
  const following = me.following || [];
  if(!following.length){
    container.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px 0;">Follow people to see them here</div>';
    return;
  }
  container.innerHTML = '';
  following.slice(0, 15).forEach(function(uid){
    const prof = allUsers[uid] || onlineFriends[uid];
    if(!prof) return;
    const status = getPresenceStatus(uid);
    const dotClass = status === 'online' ? 'dot-online' : status === 'away' ? 'dot-away' : 'dot-offline';
    const statusText = status === 'online' ? 'Active now' : status === 'away' ? 'Away' : 'Offline';
    const iU = _r(uid);
    const row = document.createElement('div');
    row.className = 'friend-row';
    row.innerHTML =
      '<div class="friend-av" style="background:'+(prof.color||'var(--pink)')+';">'
        +(prof.avatar ? '<img src="'+prof.avatar+'" alt="">' : esc(prof.initial||'?'))
        +'<div class="friend-av-dot '+dotClass+'"></div>'
      +'</div>'
      +'<div>'
        +'<div class="friend-name">'+esc(prof.name||prof.handle||'User')+'</div>'
        +'<div class="friend-status">'+statusText+'</div>'
      +'</div>'
      +'<button style="background:none;border:none;cursor:pointer;color:var(--pink);font-size:16px;padding:2px 4px;" title="Message">💬</button>';
    row.querySelector('.friend-av').addEventListener('click', function(){ viewProfile(_g(iU)); });
    row.querySelector('.friend-name').addEventListener('click', function(){ viewProfile(_g(iU)); });
    row.querySelector('button').addEventListener('click', function(e){
      e.stopPropagation();
      openDMFromPost(_g(iU), prof.name||prof.handle||'User');
    });
    container.appendChild(row);
  });
}


// ═══════════════════════════════════════════════════
// SEARCH PAGE — find anyone on the server
// ═══════════════════════════════════════════════════
function searchPageUsers(q){
  const results = document.getElementById('searchPageResults');
  if(!results) return;
  q = (q||'').trim().toLowerCase();
  // Collect all known users
  const seen = new Set();
  const allU = [];
  Object.values(allUsers).forEach(function(u){
    if(u.uid && u.uid !== me.uid && !seen.has(u.uid)){
      seen.add(u.uid); allU.push(u);
    }
  });
  posts.forEach(function(p){
    if(!p.uid || p.uid===me.uid || p.uid==='system' || seen.has(p.uid)) return;
    seen.add(p.uid); allU.push({uid:p.uid, ...p.user});
  });
  const filtered = q
    ? allU.filter(function(u){ return (u.name||'').toLowerCase().includes(q)||(u.handle||'').toLowerCase().includes(q); })
    : allU;
  if(!filtered.length){
    results.innerHTML = '<div class="search-empty">'+(q ? 'No users found for <strong>'+esc(q)+'</strong>' : 'No other users on Kez Media yet 🌸')+'</div>';
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'people-grid';
  filtered.slice(0,40).forEach(function(u){
    const iU = _r(String(u.uid));
    const iN = _r(String(u.name||u.handle||'User'));
    const isFollowing = (me.following||[]).includes(u.uid);
    const presStatus = getPresenceStatus(u.uid);
    const card = document.createElement('div');
    card.className = 'people-card';
    card.innerHTML =
      '<div class="people-card-av" style="background:'+(u.color||'var(--pink)')+';">'
        +(u.avatar ? '<img src="'+u.avatar+'" alt="">' : esc(u.initial||(u.name?u.name.charAt(0):'')||'?'))
        +(presStatus==='online' ? '<div class="pc-online" data-presence-uid="'+u.uid+'"></div>' : '')
      +'</div>'
      +'<div class="people-card-name">'+esc(u.name||u.handle||'User')+'</div>'
      +'<div class="people-card-handle">@'+esc(u.handle||'')+'</div>'
      +'<div class="people-card-actions">'
        +'<button class="pc-btn pc-btn-follow'+(isFollowing?' following':'')+'">'+( isFollowing?'Following':'Follow')+'</button>'
        +'<button class="pc-btn pc-btn-msg">💬</button>'
      +'</div>';
    // click avatar/name → view profile
    card.querySelector('.people-card-av').addEventListener('click', function(){ viewProfile(_g(iU)); });
    card.querySelector('.people-card-name').addEventListener('click', function(){ viewProfile(_g(iU)); });
    // follow button
    card.querySelector('.pc-btn-follow').addEventListener('click', function(e){
      e.stopPropagation();
      toggleFollowUser(_g(iU), _g(iN));
      setTimeout(function(){ searchPageUsers(document.getElementById('searchPageInput').value); }, 400);
    });
    // message button
    card.querySelector('.pc-btn-msg').addEventListener('click', function(e){
      e.stopPropagation();
      openDMFromPost(_g(iU), _g(iN));
    });
    grid.appendChild(card);
  });
  results.innerHTML = '';
  results.appendChild(grid);
}

// ═══════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════
let adminTab = 'users';
async function refreshAdminDashboard(){
  if(!isAdmin()) return;
  const dash = document.getElementById('adminDashboard');
  if(!dash) return;
  // Stats
  const totalPosts = posts.length;
  const totalLikes = posts.reduce(function(a,p){ return a+p.likes; }, 0);
  const totalUsers = Object.keys(allUsers).length || '…';
  const onlineCount = Object.values(onlineFriends).filter(function(p){ return p.online; }).length;

  dash.innerHTML =
    '<div class="admin-stat-grid">'
      +'<div class="admin-stat-card"><div class="admin-stat-n">'+totalUsers+'</div><div class="admin-stat-l">👤 Users</div></div>'
      +'<div class="admin-stat-card"><div class="admin-stat-n">'+totalPosts+'</div><div class="admin-stat-l">📸 Posts</div></div>'
      +'<div class="admin-stat-card"><div class="admin-stat-n">'+totalLikes+'</div><div class="admin-stat-l">❤️ Total Likes</div></div>'
      +'<div class="admin-stat-card"><div class="admin-stat-n" style="-webkit-text-fill-color:#22c55e;">'+onlineCount+'</div><div class="admin-stat-l">🟢 Online Now</div></div>'
    +'</div>'
    +'<div class="admin-tabs">'
      +'<button class="admin-tab'+(adminTab==='users'?' active':'')+'" id="atab-users">👤 All Users</button>'
      +'<button class="admin-tab'+(adminTab==='posts'?' active':'')+'" id="atab-posts">📸 All Posts</button>'
      +'<button class="admin-tab'+(adminTab==='notifs'?' active':'')+'" id="atab-notifs">🔔 Notifications</button>'
    +'</div>'
    +'<div id="adminTabContent"></div>';

  dash.querySelector('#atab-users').addEventListener('click', function(){ adminTab='users'; refreshAdminDashboard(); });
  dash.querySelector('#atab-posts').addEventListener('click', function(){ adminTab='posts'; refreshAdminDashboard(); });
  dash.querySelector('#atab-notifs').addEventListener('click', function(){ adminTab='notifs'; refreshAdminDashboard(); });

  const tc = document.getElementById('adminTabContent');

  if(adminTab === 'users'){
    const sec = document.createElement('div'); sec.className='admin-section';
    sec.innerHTML = '<div class="admin-section-title">👤 Registered Users</div><div id="adminUserList"><div style="padding:20px;text-align:center;color:var(--text3);">Loading from Firestore…</div></div>';
    tc.appendChild(sec);
    try{
      const snap = await db.collection('profiles').get();
      const ul = document.getElementById('adminUserList'); if(!ul) return;
      if(snap.empty){ ul.innerHTML='<div style="padding:20px;text-align:center;color:var(--text3);">No profiles yet</div>'; return; }
      ul.innerHTML = '';
      snap.docs.forEach(function(d){
        const u = d.data();
        const iU = _r(String(d.id));
        const iN = _r(String(u.name||u.handle||'User'));
        const status = getPresenceStatus(d.id);
        const dotColor = status==='online'?'#22c55e': status==='away'?'#f59e0b':'#94a3b8';
        const row = document.createElement('div'); row.className='admin-user-row';
        row.innerHTML =
          '<div class="admin-user-av" style="background:'+(u.color||'var(--pink)')+';">'+(u.avatar?'<img src="'+u.avatar+'" alt="">':esc(u.initial||'?'))+'</div>'
          +'<div style="flex:1;min-width:0;">'
            +'<div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;">'
              +'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+dotColor+';"></span>'
              +esc(u.name||'User')+(d.id===me.uid?' <span style="color:var(--pink);font-size:10px;">(You)</span>':'')
            +'</div>'
            +'<div style="font-size:11px;color:var(--text3);">@'+esc(u.handle||'')+' · '+esc(u.email||'')+'</div>'
          +'</div>'
          +'<div style="font-size:11px;color:var(--text3);margin-right:8px;">'+(u.followersCount||0)+' followers</div>'
          +(d.id!==me.uid
            ? '<button class="admin-msg-btn">Message</button>'
            : '');
        if(d.id !== me.uid){
          row.querySelector('.admin-msg-btn').addEventListener('click', function(){
            openDMFromPost(_g(iU), _g(iN));
          });
        }
        ul.appendChild(row);
      });
    } catch(e){
      const ul = document.getElementById('adminUserList');
      if(ul) ul.innerHTML='<div style="padding:16px;color:#e05577;">⚠️ Could not load users — check Firestore rules allow read for authenticated users</div>';
    }
  } else if(adminTab === 'posts'){
    const sec = document.createElement('div'); sec.className='admin-section';
    sec.innerHTML = '<div class="admin-section-title">📸 All Posts ('+posts.length+')</div><div id="adminPostListFull"></div><button id="clearAllPostsBtn" style="margin-top:14px;background:#e05577;color:white;border:none;border-radius:10px;padding:9px 20px;font-size:13px;font-family:Jost,sans-serif;font-weight:600;cursor:pointer;">🗑 Clear ALL Posts</button>';
    tc.appendChild(sec);
    sec.querySelector('#clearAllPostsBtn').addEventListener('click', clearAllPosts);
    const apl = document.getElementById('adminPostListFull'); if(!apl) return;
    if(!posts.length){ apl.innerHTML='<div style="padding:20px;text-align:center;color:var(--text3);">No posts</div>'; return; }
    posts.slice(0,60).forEach(function(p){
      const iPid = _r(String(p.id));
      const imgs = p.images||(p.image?[p.image]:[]);
      const row = document.createElement('div'); row.className='admin-post-row';
      row.innerHTML =
        (imgs[0]
          ? '<img class="admin-post-thumb" src="'+imgs[0]+'" alt="">'
          : '<div class="admin-post-thumb" style="font-size:18px;">'+(p.isStatus?'💬':'🖼️')+'</div>')
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-size:12px;font-weight:600;">@'+esc(p.user&&p.user.handle||'')+'</div>'
          +'<div style="font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc((p.caption||'').slice(0,60))+'</div>'
          +'<div style="font-size:11px;color:var(--text3);">'+timeAgo(p.createdAt||0)+' · ❤️ '+p.likes+' 💬 '+p.comments.length+'</div>'
        +'</div>'
        +'<button class="admin-del-btn">Delete</button>';
      row.querySelector('.admin-del-btn').addEventListener('click', function(){ deletePost(_g(iPid)); row.remove(); });
      apl.appendChild(row);
    });
  } else if(adminTab === 'notifs'){
    const sec = document.createElement('div'); sec.className='admin-section';
    sec.innerHTML = '<div class="admin-section-title">🔔 Recent Notifications (all users)</div><div id="adminNotifList"><div style="padding:20px;text-align:center;color:var(--text3);">Loading…</div></div>';
    tc.appendChild(sec);
    try{
      const snap = await db.collection('notifications').limit(40).get();
      const nl = document.getElementById('adminNotifList'); if(!nl) return;
      if(snap.empty){ nl.innerHTML='<div style="padding:20px;text-align:center;color:var(--text3);">No notifications yet</div>'; return; }
      nl.innerHTML='';
      const icons={like:'❤️',comment:'💬',follow:'👤',message:'✉️'};
      const texts={like:'liked a post',comment:'commented',follow:'followed someone',message:'sent a DM'};
      snap.docs.forEach(function(d){
        const n=d.data();
        const row=document.createElement('div');
        row.style.cssText='padding:9px 0;border-bottom:1px solid var(--border);font-size:12.5px;display:flex;align-items:center;gap:10px;';
        row.innerHTML='<span>'+(icons[n.type]||'🔔')+'</span>'
          +'<div style="flex:1;"><strong>'+esc(n.fromName||'?')+'</strong> '+(texts[n.type]||n.type)+(n.extra?' — '+esc(n.extra.slice(0,40)):'')+'<br><span style="color:var(--text3);font-size:10.5px;">to @'+esc(n.toUid.slice(0,8))+'… · '+timeAgo(n.ts)+'</span></div>'
          +(n.read?'':'<span style="width:7px;height:7px;border-radius:50%;background:var(--pink);display:inline-block;"></span>');
        nl.appendChild(row);
      });
    } catch(e){
      const nl=document.getElementById('adminNotifList');
      if(nl) nl.innerHTML='<div style="padding:16px;color:#e05577;">⚠️ Could not load — check Firestore rules</div>';
    }
  }
}


// ── MOBILE NAV ──────────────────────────────────────
function updateMobNav(view){
  document.querySelectorAll('.mob-nav-item').forEach(function(el){
    el.classList.remove('active');
  });
  var el = document.getElementById('mob-'+view);
  if(el) el.classList.add('active');
}
function closeChatMobile(){
  var ca = document.getElementById('chatArea');
  if(ca) ca.classList.remove('open');
  activeDMUid = null;
  if(dmUnsubscribe){ dmUnsubscribe(); dmUnsubscribe=null; }
}



// ── PWA SERVICE WORKER & INSTALL ──────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    // Service worker disabled for now
    // navigator.serviceWorker.register('/sw.js')
    //   .then(function(reg){ console.log('SW registered:', reg.scope); })
    //   .catch(function(err){ console.warn('SW registration failed:', err); });
  });
}

// PWA Install logic
let _pwaInstallPrompt = null;
const _isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const _isInStandaloneMode = window.navigator.standalone === true
  || window.matchMedia('(display-mode: standalone)').matches;

// Android Chrome: capture install prompt
window.addEventListener('beforeinstallprompt', function(e){
  e.preventDefault();
  _pwaInstallPrompt = e;
  _updateInstallUI();
});

// Called whenever the Install App card in Settings is visible
function _updateInstallUI(){
  var android  = document.getElementById('installAndroid');
  var ios      = document.getElementById('installIOS');
  var done     = document.getElementById('installDone');
  var def      = document.getElementById('installDefault');
  if(!done) return; // settings not open yet
  [android, ios, done, def].forEach(function(el){ if(el) el.style.display='none'; });
  if(_isInStandaloneMode){
    // Already installed
    if(done) done.style.display='block';
  } else if(_isIOS){
    // iPhone/iPad: always show Safari instructions
    if(ios) ios.style.display='block';
  } else if(_pwaInstallPrompt){
    // Android Chrome with install prompt ready: show one-tap button
    if(android) android.style.display='block';
  } else {
    // Android or other: show manual steps
    if(def) def.style.display='block';
  }
}

// Patch goTo / switchSettingsNav so install UI refreshes when settings opens
var _origSwitchNav = null;
window.addEventListener('DOMContentLoaded', function(){
  _updateInstallUI();
});

function triggerInstall(){
  if(!_pwaInstallPrompt) return;
  _pwaInstallPrompt.prompt();
  _pwaInstallPrompt.userChoice.then(function(r){
    _pwaInstallPrompt = null;
    _updateInstallUI();
  });
}

function dismissInstallBanner(){
  var b = document.getElementById('pwaInstallBanner');
  if(b) b.remove();
}

window.addEventListener('appinstalled', function(){
  dismissInstallBanner();
  _pwaInstallPrompt = null;
  _updateInstallUI();
});

// ══════════════════════════════════════════════════════
//  INLINE EDIT PROFILE MODAL (profile page shortcut)
// ══════════════════════════════════════════════════════
function openProfileEditModal(){
  var modal = document.getElementById('profileEditModal');
  if(!modal) return;
  // Pre-fill with current values
  document.getElementById('peModalName').value   = me.name   || '';
  document.getElementById('peModalHandle').value = me.handle || '';
  document.getElementById('peModalBio').value    = me.bio    || '';
  modal.style.display = 'flex';
  setTimeout(function(){ modal.querySelector('div').style.transform = 'scale(1)'; }, 10);
}
function closeProfileEditModal(){
  var modal = document.getElementById('profileEditModal');
  if(modal) modal.style.display = 'none';
}
async function saveProfileEditModal(){
  var newName   = document.getElementById('peModalName').value.trim();
  var newHandle = document.getElementById('peModalHandle').value.trim().replace(/^@/,'').replace(/\s+/g,'').toLowerCase();
  var newBio    = document.getElementById('peModalBio').value.trim();
  if(!newName){ toast('Display name cannot be empty'); return; }
  if(!newHandle){ toast('Username cannot be empty'); return; }
  me.name   = newName;
  me.handle = newHandle;
  me.bio    = newBio;
  me.initial= newName.charAt(0).toUpperCase();
  await saveProfileToFirestore();
  refreshProfileUI();
  closeProfileEditModal();
  toast('Profile updated ✓');
}

// ══════════════════════════════════════════════════════
//  DUMMY PERMANENT STORIES (visible to everyone)
// ══════════════════════════════════════════════════════
var DUMMY_STORY_IDS = ['dummy_story_1','dummy_story_2'];

async function seedDummyStories(){
  try {
    var snap = await db.collection('stories').doc('dummy_story_1').get();
    if(snap.exists) return; // already seeded

    var far = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10).toISOString(); // 10 years from now
    var batch = db.batch();

    batch.set(db.collection('stories').doc('dummy_story_1'), {
      uid: 'kez_system',
      userName: 'Kez Media',
      userHandle: 'kezmedia',
      userInitial: 'K',
      userColor: 'linear-gradient(135deg,#e2688a,#f0a0b8)',
      userAvatar: null,
      type: 'text',
      text: '✨ Welcome to Kez Media! Share your story with the world 🌸',
      bgColor: 'linear-gradient(135deg,#e2688a,#f0a0b8)',
      createdAt: new Date().toISOString(),
      expiresAt: far,
      seen: [],
      seenBy: [],
      reactions: {},
      reactionCounts: {}
    });

    batch.set(db.collection('stories').doc('dummy_story_2'), {
      uid: 'kez_system',
      userName: 'Kez Media',
      userHandle: 'kezmedia',
      userInitial: 'K',
      userColor: 'linear-gradient(135deg,#e2688a,#f0a0b8)',
      userAvatar: null,
      type: 'text',
      text: '💖 Tip: Mention friends with @username in your posts and comments!',
      bgColor: 'linear-gradient(135deg,#667eea,#764ba2)',
      createdAt: new Date(Date.now() - 60000).toISOString(),
      expiresAt: far,
      seen: [],
      seenBy: [],
      reactions: {},
      reactionCounts: {}
    });

    await batch.commit();
  } catch(e){
    console.warn('Could not seed dummy stories:', e.message);
  }
}

// ══════════════════════════════════════════════════════
//  STORY VIEWERS — who viewed your story (enhance panel)
// ══════════════════════════════════════════════════════
// (Already implemented in openStoryViewers — just ensuring it's called correctly)
// The viewers button is shown on your own stories via renderStorySlide()

