// ... KEEP YOUR _reg, _r, _g FUNCTIONS AND FIREBASE INIT ...
const _reg = [];
function _r(val){ const i = _reg.length; _reg.push(val); return i; }
function _g(i){ return _reg[i]; }

// ... FIREBASE CONFIG HERE ...
const firebaseConfig = { /* Your Config */ };
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let me = {};
let allUsers = {};

// ... KEEP AUTH LISTENERS ...

// --- FIX: FUNCTIONAL COVER PHOTO UPLOAD ---
async function uploadBanner(inp) {
    const file = inp.files[0];
    if (!file) return;
    toast('Updating cover photo... ✨');
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            // Upload to Cloudinary (using your existing logic)
            const formData = new FormData();
            formData.append('file', e.target.result);
            formData.append('upload_preset', 'kezz_media');
            const res = await fetch('https://api.cloudinary.com/v1_1/dyspuqa0s/image/upload', {method:'POST', body:formData});
            const data = await res.json();
            const url = data.secure_url;

            // Save to Firestore
            await db.collection('profiles').doc(me.uid).update({ bannerImage: url });
            
            // Update UI
            document.getElementById('bannerImg').src = url;
            document.getElementById('bannerImg').style.display = 'block';
            document.getElementById('profileBanner').style.background = 'none';
            toast('Cover updated! ✓');
        } catch (err) { toast('Upload failed.'); }
    };
    reader.readAsDataURL(file);
}

// --- ADDED: GLOBAL MENTIONS SYSTEM ---
function handleMentionInput(inp, type) {
    const val = inp.value;
    const lastAt = val.lastIndexOf('@');
    const dropdown = document.getElementById('mention' + type.charAt(0).toUpperCase() + type.slice(1));
    
    if (lastAt === -1) { if(dropdown) dropdown.classList.remove('show'); return; }

    const query = val.slice(lastAt + 1).toLowerCase();
    const matches = Object.values(allUsers).filter(u => 
        (u.handle && u.handle.toLowerCase().includes(query)) || 
        (u.name && u.name.toLowerCase().includes(query))
    ).slice(0, 5);

    if (matches.length > 0 && dropdown) {
        dropdown.classList.add('show');
        dropdown.innerHTML = '';
        matches.forEach(u => {
            const div = document.createElement('div');
            div.className = 'mention-item';
            div.innerHTML = `<img src="${u.avatar || ''}" class="mention-av" onerror="this.src='https://via.placeholder.com/25'"> <span>@${u.handle}</span>`;
            div.onclick = () => {
                inp.value = val.substring(0, lastAt) + '@' + u.handle + ' ';
                dropdown.classList.remove('show');
                inp.focus();
            };
            dropdown.appendChild(div);
        });
    } else { if(dropdown) dropdown.classList.remove('show'); }
}

// --- ADDED: STORIES & VIEWERS LOGIC ---
async function loadStories() {
    const row = document.getElementById('storiesRow');
    
    // 1. ADD PERMANENT DUMMY STORY
    const dummy = document.createElement('div');
    dummy.className = 'story-item';
    dummy.innerHTML = `<div class="story-ring unseen"><div class="story-avatar" style="background:var(--pink); color:white;">K</div></div><div class="story-name">Kez Official</div>`;
    dummy.onclick = () => openStoryViewer([{
        uid: 'system', userName: 'Kez Media', type: 'text', text: 'Welcome! 🌸', bgColor: 'var(--pink)', seenBy: []
    }], 0);
    row.appendChild(dummy);

    // ... Load your existing Stories from Firestore ...
    const snap = await db.collection('stories').get();
    snap.forEach(doc => {
        const s = { id: doc.id, ...doc.data() };
        // ... Render Story items ...
    });
}

function openStoryViewer(stories, idx, storyId) {
    const s = stories[idx];
    document.getElementById('storyViewer').style.display = 'flex';
    // ... Your original Slide Media Logic ...

    // VIEWERS LOGIC: Track viewing
    if (s.uid !== me.uid && storyId && s.uid !== 'system') {
        db.collection('stories').doc(storyId).update({
            seenBy: firebase.firestore.FieldValue.arrayUnion(me.uid)
        });
    }

    // SHOW VIEWERS BUTTON IF IT'S MY STORY
    const btn = document.getElementById('svViewersBtn');
    if (s.uid === me.uid) {
        btn.style.display = 'block';
        updateViewerList(s.seenBy || []);
    } else {
        btn.style.display = 'none';
    }
}

function updateViewerList(uids) {
    const list = document.getElementById('svViewerList');
    list.innerHTML = '<h3>Who viewed your story</h3>';
    uids.forEach(uid => {
        const user = allUsers[uid];
        if (user) {
            list.innerHTML += `<div class="mention-item"><img src="${user.avatar || ''}" class="mention-av"> <span>${user.name}</span></div>`;
        }
    });
}

function toggleStoryViewers() { document.getElementById('svViewerList').classList.toggle('open'); }
function closeStoryViewer() { 
    document.getElementById('storyViewer').style.display = 'none'; 
    document.getElementById('svViewerList').classList.remove('open'); 
}

// ... REST OF YOUR 5,000+ LINE CODE (DMs, Posts, Presence, etc.) ...