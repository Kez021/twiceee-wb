// --- FIREBASE INIT ---
const firebaseConfig = {
    apiKey: "AIzaSyCxDRIL9XOeA7d-yqXF84tndWPZY8JxLSY",
    authDomain: "kezz-media.firebaseapp.com",
    projectId: "kezz-media",
    storageBucket: "kezz-media.firebasestorage.app",
    messagingSenderId: "307892917050",
    appId: "1:307892917050:web:5b318f4039affaa26b3603"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let me = {};
let allUsers = {};

// --- AUTH & INIT ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const doc = await db.collection('profiles').doc(user.uid).get();
        me = { uid: user.uid, ...doc.data() };
        document.getElementById('authOverlay').style.display = 'none';
        initApp();
    } else {
        document.getElementById('authOverlay').style.display = 'flex';
    }
});

async function initApp() {
    await watchUsers();
    loadStories();
    applyTheme();
    updateUI();
    setTimeout(() => {
        document.getElementById('splashScreen').style.opacity = '0';
        setTimeout(() => document.getElementById('splashScreen').style.display = 'none', 500);
    }, 2000);
}

// --- GLOBAL MENTIONS SYSTEM ---
function handleMentionInput(inp, type) {
    const val = inp.value;
    const lastAt = val.lastIndexOf('@');
    const dropdown = document.getElementById('mention' + type.charAt(0).toUpperCase() + type.slice(1));
    
    if (lastAt === -1) { dropdown.classList.remove('show'); return; }

    const query = val.slice(lastAt + 1).toLowerCase();
    const matches = Object.values(allUsers).filter(u => 
        u.handle.toLowerCase().includes(query) || u.name.toLowerCase().includes(query)
    ).slice(0, 5);

    if (matches.length > 0) {
        dropdown.classList.add('show');
        dropdown.innerHTML = '';
        matches.forEach(u => {
            const div = document.createElement('div');
            div.className = 'mention-item';
            div.innerHTML = `<img src="${u.avatar || ''}" class="mention-av" onerror="this.src='https://via.placeholder.com/28'"> <span>@${u.handle}</span>`;
            div.onclick = () => {
                inp.value = val.substring(0, lastAt) + '@' + u.handle + ' ';
                dropdown.classList.remove('show');
                inp.focus();
            };
            dropdown.appendChild(div);
        });
    } else { dropdown.classList.remove('show'); }
}

// --- FUNCTIONAL COVER UPLOAD ---
async function uploadBanner(inp) {
    const file = inp.files[0];
    if (!file) return;
    toast('Updating cover photo... ✨');
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const formData = new FormData();
            formData.append('file', e.target.result);
            formData.append('upload_preset', 'kezz_media');
            const res = await fetch('https://api.cloudinary.com/v1_1/dyspuqa0s/image/upload', {method:'POST', body:formData});
            const data = await res.json();
            const url = data.secure_url;

            await db.collection('profiles').doc(me.uid).update({ bannerImage: url });
            document.getElementById('bannerImg').src = url;
            document.getElementById('bannerImg').style.display = 'block';
            document.getElementById('profileBanner').style.background = 'none';
            toast('Cover photo updated! ✓');
        } catch (err) { toast('Upload failed.'); }
    };
    reader.readAsDataURL(file);
}

// --- STORIES & VIEWERS ---
async function loadStories() {
    const row = document.getElementById('storiesRow');
    // Permanent Dummy Story
    const dummy = document.createElement('div');
    dummy.className = 'story-item';
    dummy.innerHTML = `<div class="story-ring unseen"><div class="story-avatar">K</div></div><div class="story-name">Kez Official</div>`;
    dummy.onclick = () => openStoryViewer([{
        uid: 'system', userName: 'Kez Official', type: 'text', text: 'Welcome to Kez Media! 🌸', bgColor: 'var(--pink)', seenBy: []
    }], 0);
    row.appendChild(dummy);

    const snap = await db.collection('stories').get();
    snap.forEach(doc => {
        const s = { id: doc.id, ...doc.data() };
        const d = document.createElement('div');
        d.className = 'story-item';
        d.innerHTML = `<div class="story-ring"><div class="story-avatar"><img src="${s.userAvatar || ''}"></div></div><div class="story-name">${s.userName}</div>`;
        d.onclick = () => openStoryViewer([s], 0, s.id);
        row.appendChild(d);
    });
}

function openStoryViewer(stories, idx, storyId) {
    const s = stories[idx];
    document.getElementById('storyViewer').style.display = 'flex';
    document.getElementById('svName').textContent = s.userName;
    document.getElementById('svMedia').innerHTML = s.type === 'text' 
        ? `<div style="background:${s.bgColor}; height:100%; display:flex; align-items:center; justify-content:center; color:white; font-size:24px; padding:20px; text-align:center;">${s.text}</div>`
        : `<img src="${s.mediaUrl}" style="width:100%; height:100%; object-fit:contain">`;

    if (s.uid !== me.uid && storyId && s.uid !== 'system') {
        db.collection('stories').doc(storyId).update({ seenBy: firebase.firestore.FieldValue.arrayUnion(me.uid) });
    }

    const btn = document.getElementById('svViewersBtn');
    if (s.uid === me.uid) {
        btn.style.display = 'block';
        updateViewerList(s.seenBy || []);
    } else { btn.style.display = 'none'; }
}

function updateViewerList(uids) {
    const list = document.getElementById('svViewerList');
    list.innerHTML = '<h3>Story Viewers</h3>';
    uids.forEach(uid => {
        const user = allUsers[uid];
        if (user) list.innerHTML += `<div class="mention-item"><img src="${user.avatar || ''}" class="mention-av"> <span>${user.name}</span></div>`;
    });
}

function toggleStoryViewers() { document.getElementById('svViewerList').classList.toggle('open'); }
function closeStoryViewer() { document.getElementById('storyViewer').style.display = 'none'; document.getElementById('svViewerList').classList.remove('open'); }
function goTo(view) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.getElementById('view-' + view).classList.add('active'); }
function toggleTheme() { const target = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', target); localStorage.setItem('theme', target); applyTheme(); }
function applyTheme() { const saved = localStorage.getItem('theme') || 'light'; document.documentElement.setAttribute('data-theme', saved); document.getElementById('themeIcon').textContent = saved === 'light' ? '🌙' : '☀️'; }
function updateUI() { document.getElementById('profileName').textContent = me.name || 'User'; document.getElementById('profileHandle').textContent = '@' + (me.handle || 'user'); if (me.bannerImage) { document.getElementById('bannerImg').src = me.bannerImage; document.getElementById('bannerImg').style.display = 'block'; document.getElementById('profileBanner').style.background = 'none'; } }
async function watchUsers() { db.collection('profiles').onSnapshot(snap => { snap.forEach(doc => allUsers[doc.id] = doc.data()); }); }
function toast(msg) { const t = document.getElementById('toastEl'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }
function openModal() { document.getElementById('overlay').classList.add('open'); }
function closeModal() { document.getElementById('overlay').classList.remove('open'); }
