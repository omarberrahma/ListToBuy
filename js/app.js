// ------------------------------------------------------------------
// متغيرات عالمية ومعالجة الأعطال لضمان الاستقرار
// ------------------------------------------------------------------
let db = null;
let auth = null;
let appId = "dz-shopping-app-v3";
let items = [];
let currentUserId = null;
let currentActiveId = null;
let selectedCategory = "🛒 اخرى";
let currentTab = "shopping";

// تكوين Tailwind CSS
if (typeof tailwind !== 'undefined') {
    tailwind.config = {
        theme: {
            extend: {
                colors: {
                    navy: {
                        900: '#0b132b',
                        800: '#1c2541',
                        700: '#3a506b',
                        light: '#5bc0be'
                    }
                }
            }
        }
    };
}

// تهيئة Firebase بشكل متوافق وآمن
function initFirebase() {
    try {
        let firebaseConfig = null;

        // التحقق مما إذا كان هناك تكوين Firebase مخزن أو مقدم
        if (typeof __firebase_config !== 'undefined' && __firebase_config) {
            firebaseConfig = JSON.parse(__firebase_config);
        }

        if (firebaseConfig && typeof firebase !== 'undefined') {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            auth = firebase.auth();

            // الاستماع لحالة تسجيل الدخول
            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    currentUserId = user.uid;
                    updateSyncStatus(true);
                    document.getElementById('auth-inputs-container').classList.add('hidden');
                    document.getElementById('user-info-container').classList.remove('hidden');
                    document.getElementById('user-avatar').innerText = (user.email ? user.email.charAt(0).toUpperCase() : 'M');
                    document.getElementById('user-name-display').innerText = user.email ? user.email.split('@')[0] : 'مطور ويب';

                    // تحميل ومراقبة العناصر لهذا المستخدم المسجل
                    setupItemsListener();
                } else {
                    currentUserId = null;
                    updateSyncStatus(false);
                    document.getElementById('auth-inputs-container').classList.remove('hidden');
                    document.getElementById('user-info-container').classList.add('hidden');

                    // تحميل العناصر من التخزين المحلي
                    loadLocalItems();
                }
            });
        } else {
            // لا توجد بيئة Firebase، تحميل البيانات محلياً
            console.log("Firebase config not found, using local storage.");
            loadLocalItems();
        }
    } catch(e) {
        console.error("Firebase startup issues handled:", e);
        loadLocalItems();
    }
}

function updateSyncStatus(isSynced) {
    const status = document.getElementById('sync-status');
    if (isSynced) {
        status.innerText = "سحابي متزامن 🌐";
        status.className = "text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md";
    } else {
        status.innerText = "حفظ محلي فقط 💾";
        status.className = "text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md";
    }
}

// ------------------------------------------------------------------
// نظام تخزين واسترجاع العناصر محلياً
// ------------------------------------------------------------------
function loadLocalItems() {
    const cached = localStorage.getItem('shopping_items_mobile_v3');
    if (cached) {
        try {
            items = JSON.parse(cached);
        } catch(err) {
            items = getDefaultStarterItems();
        }
    } else {
        items = getDefaultStarterItems();
    }
    renderApp();
}

function saveLocalItems() {
    localStorage.setItem('shopping_items_mobile_v3', JSON.stringify(items));
}

function getDefaultStarterItems() {
    return [
        { id: "1", name: 'كلافي ميكانيكية MSI GK310 🔌', category: '💻 عمل ومكتب', bought: true, price: 8700, time: Date.now() },
        { id: "2", name: 'ستيك 🥩', category: '🥩 اغذية', bought: false, price: 0, time: 0 },
        { id: "3", name: 'بريكة 🔥', category: '🛒 اخرى', bought: false, price: 0, time: 0 },
        { id: "4", name: 'مراية 🪞', category: '🛒 اخرى', bought: false, price: 0, time: 0 },
        { id: "5", name: 'ساكادو ليّا أنا 🎒', category: '👕 ملابس', bought: false, price: 0, time: 0 },
        { id: "6", name: 'ساكادو لولدي 🎒', category: '👕 ملابس', bought: false, price: 0, time: 0 }
    ];
}

// ------------------------------------------------------------------
// مزامنة Firestore (الامتثال للقواعد 1، 2، 3)
// ------------------------------------------------------------------
let unsubsItems = null;
function setupItemsListener() {
    if (!db || !auth || !auth.currentUser) return;
    const uid = auth.currentUser.uid;

    if (unsubsItems) unsubsItems();

    // المسار: /artifacts/{appId}/users/{userId}/{collectionName}
    const collectionRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items');

    // استرجاع سريع، مرتب في الذاكرة
    unsubsItems = collectionRef.onSnapshot((snapshot) => {
        const fetched = [];
        snapshot.forEach(doc => {
            fetched.push(doc.data());
        });

        if (fetched.length > 0) {
            items = fetched;
            saveLocalItems();
            renderApp();
        } else {
            // تهيئة قاعدة البيانات لهذا المستخدم في السحابة
            initUserDatabaseInCloud(uid);
        }
    }, (error) => {
        console.error("Cloud listening failed, keeping local active:", error);
        loadLocalItems();
    });
}

async function initUserDatabaseInCloud(uid) {
    if (!db) return;
    const collectionRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items');
    const batch = db.batch();

    const toInitialize = items.length > 0 ? items : getDefaultStarterItems();

    toInitialize.forEach(item => {
        const docRef = collectionRef.doc();
        batch.set(docRef, {
            ...item,
            id: docRef.id
        });
    });

    try {
        await batch.commit();
    } catch(e) {
        console.error("Batch write failed", e);
    }
}

async function syncItemToCloud(item) {
    if (!db || !auth || !auth.currentUser) return;
    try {
        const uid = auth.currentUser.uid;
        const docRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items').doc(item.id);
        await docRef.set(item, { merge: true });
    } catch(e) {
        console.error("Single item cloud update issue:", e);
    }
}

async function deleteItemInCloud(itemId) {
    if (!db || !auth || !auth.currentUser) return;
    try {
        const uid = auth.currentUser.uid;
        const docRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items').doc(itemId);
        await docRef.delete();
    } catch(e) {
        console.error("Cloud delete issue:", e);
    }
}

// ------------------------------------------------------------------
// عمليات التوثيق (تسجيل الدخول / إنشاء حساب)
// ------------------------------------------------------------------
async function loginUser() {
    playAudioTone(250, 'triangle', 0.05);
    const userInp = document.getElementById('username').value.trim().toLowerCase();
    const passInp = document.getElementById('password').value.trim();

    if (!userInp || !passInp) {
        showToast("الرجاء إدخال اسم المستخدم والكود السري!", "⚠️");
        return;
    }
    if (passInp.length < 6) {
        showToast("الكود السري يجب أن يكون من 6 أرقام أو حروف على الأقل!", "⚠️");
        return;
    }

    const email = `${userInp}@smartdzlist.com`;
    try {
        if (auth) {
            await auth.signInWithEmailAndPassword(email, passInp);
            showToast("تم الدخول والاتصال السحابي بنجاح!", "🎉");
        }
    } catch(e) {
        showToast("خطأ! تفقد معلومات الحساب أو جرب إنشاء حساب جديد.", "❌");
    }
}

async function registerUser() {
    playAudioTone(250, 'triangle', 0.05);
    const userInp = document.getElementById('username').value.trim().toLowerCase();
    const passInp = document.getElementById('password').value.trim();

    if (!userInp || !passInp) {
        showToast("الرجاء إدخال اسم المستخدم والكود السري!", "⚠️");
        return;
    }
    if (passInp.length < 6) {
        showToast("الكود السري يجب أن يكون من 6 خانات على الأقل!", "⚠️");
        return;
    }

    const email = `${userInp}@smartdzlist.com`;
    try {
        if (auth) {
            await auth.createUserWithEmailAndPassword(email, passInp);
            showToast("مبروك! تم إنشاء حسابك ومزامنته سحابياً.", "✨");
        }
    } catch(e) {
        if (e.code === 'auth/email-already-in-use') {
            showToast("اسم المستخدم محجوز! جرب اسماً آخر.", "❌");
        } else {
            showToast("فشل إنشاء الحساب السحابي.", "❌");
        }
    }
}

async function logoutUser() {
    playAudioTone(300, 'sine', 0.1);
    if (unsubsItems) unsubsItems();
    if (auth) {
        await auth.signOut();
        currentUserId = null;
        showToast("تم تسجيل الخروج. العودة للحفظ المحلي.", "🚪");
    }
}

// ------------------------------------------------------------------
// واجهات المستخدم والتحكم في التبويبات
// ------------------------------------------------------------------
function switchTab(tabId) {
    playAudioTone(400, 'sine', 0.05);
    currentTab = tabId;
    const tabs = ['shopping', 'archive', 'ai'];
    tabs.forEach(t => {
        const panel = document.getElementById(`tab-${t}-panel`);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (t === tabId) {
            panel.classList.remove('hidden');
            btn.className = "flex-1 text-xs py-2.5 rounded-xl font-bold transition-all bg-cyan-500/20 text-white border border-cyan-500/25";
        } else {
            panel.classList.add('hidden');
            btn.className = "flex-1 text-xs py-2.5 rounded-xl font-bold transition-all text-slate-400 hover:text-white border border-transparent";
        }
    });

    if (tabId === 'archive') {
        renderArchiveView();
    }
}

function setCategory(cat) {
    playAudioTone(350, 'triangle', 0.04);
    selectedCategory = cat;
    const btns = document.querySelectorAll('.cat-tag-btn');
    btns.forEach(btn => {
        if (btn.innerText.includes(cat.split(' ')[1])) {
            btn.className = "cat-tag-btn bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold px-2.5 py-1.5 rounded-lg";
        } else {
            btn.className = "cat-tag-btn bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-bold px-2.5 py-1.5 rounded-lg";
        }
    });
}

// ------------------------------------------------------------------
// منطق القائمة ومعالجة البيانات (تحديث العرض)
// ------------------------------------------------------------------
function renderApp() {
    const pendingList = document.getElementById('pending-list-container');
    const searchVal = document.getElementById('search-box').value.toLowerCase().trim();
    const filterVal = document.getElementById('category-filter').value;

    pendingList.innerHTML = '';

    let totalSpent = 0;
    let pendingCount = 0;
    let boughtCount = 0;

    items.forEach(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchVal);
        const matchesFilter = filterVal === 'all' || item.category === filterVal;

        if (!item.bought) {
            pendingCount++;
            if (matchesSearch && matchesFilter) {
                const card = document.createElement('div');
                card.className = "flex justify-between items-center bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl";
                card.innerHTML = `
                    <div class="flex flex-col gap-0.5">
                        <span class="text-xs font-bold text-white">${item.name}</span>
                        <span class="text-[9px] text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/15 px-2 py-0.5 rounded-md w-fit">${item.category || '🛒 اخرى'}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button onclick="markItemAsBought('${item.id}')" class="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-[10px] px-3.5 py-2.5 rounded-xl transition-all">شريت ✅</button>
                        <button onclick="deleteItem('${item.id}')" class="text-rose-400 hover:bg-rose-500/10 p-2.5 rounded-xl border border-transparent hover:border-rose-500/15 transition-all">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                `;
                pendingList.appendChild(card);
            }
        } else {
            boughtCount++;
            totalSpent += item.price;
        }
    });

    if (pendingList.children.length === 0) {
        pendingList.innerHTML = `
            <div class="text-center p-6 bg-slate-900/20 border border-slate-800/60 rounded-2xl">
                <p class="text-[10px] text-slate-500">لا يوجد أغراض في قائمة المشتريات.</p>
            </div>
        `;
    }

    document.getElementById('total-price').innerText = totalSpent.toLocaleString('ar-DZ') + ' دج';
    document.getElementById('pending-count').innerText = pendingCount + ' صوالح';
    document.getElementById('pending-badge').innerText = pendingCount;

    const totalCount = items.length;
    const progressPercent = totalCount > 0 ? Math.round((boughtCount / totalCount) * 100) : 0;
    document.getElementById('progress-bar').style.width = progressPercent + '%';
    document.getElementById('progress-text').innerText = progressPercent + '%';
}

// ------------------------------------------------------------------
// نظام الأرشيف اليومي (مجمع حسب التاريخ والوقت)
// ------------------------------------------------------------------
function renderArchiveView() {
    const container = document.getElementById('archive-days-container');
    container.innerHTML = '';

    const boughtItems = items.filter(i => i.bought);
    if (boughtItems.length === 0) {
        container.innerHTML = `
            <div class="text-center p-8 bg-slate-950/40 border border-slate-800 rounded-2xl">
                <span class="text-3xl block">📦</span>
                <p class="text-[10px] text-slate-500 font-bold mt-2">لا توجد أغراض تم شراؤها وأرشفتها حتى الآن.</p>
            </div>
        `;
        return;
    }

    boughtItems.sort((a, b) => (b.time || 0) - (a.time || 0));

    const groups = {};
    boughtItems.forEach(item => {
        const date = new Date(item.time || Date.now());
        const groupKey = formatDayKey(date);
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(item);
    });

    Object.keys(groups).forEach(dayKey => {
        const dayWrapper = document.createElement('div');
        dayWrapper.className = "flex flex-col gap-2";

        let dayTotal = 0;
        let itemsHtml = '';

        groups[dayKey].forEach(item => {
            dayTotal += item.price;
            const dateObj = new Date(item.time || Date.now());
            const timeStr = dateObj.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });

            itemsHtml += `
                <div class="flex justify-between items-center bg-[#1c2541]/40 border border-slate-800 p-3 rounded-xl">
                    <div class="flex flex-col gap-0.5">
                        <span class="text-xs font-bold text-slate-400 line-through">${item.name}</span>
                        <div class="flex items-center gap-1.5 text-[9px] text-slate-500 font-bold">
                            <span class="text-emerald-400 bg-emerald-500/10 border border-emerald-400/20 px-1.5 py-0.5 rounded">${item.price} دج</span>
                            <span>🕒 ${timeStr}</span>
                            <span>• ${item.category || 'أخرى'}</span>
                        </div>
                    </div>
                    <button onclick="restoreItemToPending('${item.id}')" class="text-slate-500 hover:text-slate-300 p-2 rounded-xl transition-all" title="إرجاع للمشتريات">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                    </button>
                </div>
            `;
        });

        dayWrapper.innerHTML = `
            <div class="flex justify-between items-center border-b border-slate-800 pb-1.5 px-1 mt-2">
                <span class="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    ${dayKey}
                </span>
                <span class="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-md">المصروف اليومي: ${dayTotal} دج</span>
            </div>
            <div class="flex flex-col gap-1.5">
                ${itemsHtml}
            </div>
        `;

        container.appendChild(dayWrapper);
    });
}

function formatDayKey(date) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return "اليوم - " + date.toLocaleDateString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'short' });
    } else if (date.toDateString() === yesterday.toDateString()) {
        return "أمس - " + date.toLocaleDateString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'short' });
    } else {
        return date.toLocaleDateString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    }
}

// ------------------------------------------------------------------
// إدارة العناصر والعمليات
// ------------------------------------------------------------------
async function addNewItem(nameValue = null, categoryValue = null) {
    playAudioTone(400, 'triangle', 0.05);
    const inputField = document.getElementById('new-item-input');
    const name = nameValue || inputField.value.trim();
    const category = categoryValue || selectedCategory;

    if (!name) {
        showToast("الرجاء كتابة اسم الغرض أولاً!", "⚠️");
        return;
    }

    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const newItem = {
        id: newId,
        name: name,
        category: category,
        bought: false,
        price: 0,
        time: 0
    };

    items.push(newItem);
    saveLocalItems();
    renderApp();

    await syncItemToCloud(newItem);

    if (!nameValue) inputField.value = '';
    showToast(`تم إدراج "${name}" بنجاح!`, "✅");
}

function handleNewItemKeyPress(e) {
    if (e.key === 'Enter') {
        addNewItem();
    }
}

function markItemAsBought(id) {
    playAudioTone(400, 'sine', 0.04);
    currentActiveId = id;
    const item = items.find(i => i.id === id);

    document.getElementById('modal-title').innerText = `شحال لقيت سعر: ${item.name}؟`;
    document.getElementById('modal-price-input').value = '';

    const modal = document.getElementById('price-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    setTimeout(() => {
        document.getElementById('modal-price-input').focus();
    }, 100);
}

function setQuickPrice(val) {
    playAudioTone(350, 'sine', 0.03);
    document.getElementById('modal-price-input').value = val;
}

function closeBuyModal() {
    playAudioTone(300, 'sine', 0.03);
    const modal = document.getElementById('price-modal');
    modal.classList.remove('flex');
    modal.classList.add('hidden');
    currentActiveId = null;
}

async function confirmBuyAction() {
    const valInput = document.getElementById('modal-price-input').value;
    const price = parseFloat(valInput) || 0;

    const timeStamp = Date.now();

    items = items.map(item => {
        if (item.id === currentActiveId) {
            const updated = { ...item, bought: true, price: price, time: timeStamp };
            syncItemToCloud(updated);
            return updated;
        }
        return item;
    });

    saveLocalItems();
    closeBuyModal();
    renderApp();

    playChimeSoundSequence();

    confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.85 }
    });

    showToast("بصحتك الشريّة! ربي يباركلك فيها.", "🎉");
}

async function restoreItemToPending(id) {
    playAudioTone(350, 'sine', 0.05);
    items = items.map(item => {
        if (item.id === id) {
            const updated = { ...item, bought: false, price: 0, time: 0 };
            syncItemToCloud(updated);
            return updated;
        }
        return item;
    });
    saveLocalItems();
    renderArchiveView();
    renderApp();
    showToast("تم إلغاء شراء الغرض وإرجاعه للقائمة.", "↩️");
}

async function deleteItem(id) {
    playAudioTone(300, 'sawtooth', 0.04);
    const item = items.find(i => i.id === id);
    items = items.filter(i => i.id !== id);
    saveLocalItems();
    renderApp();

    await deleteItemInCloud(id);

    showToast(`تم حذف: ${item ? item.name : 'الغرض'}`, "🧹");
}

function openResetModal() {
    playAudioTone(250, 'sawtooth', 0.1);
    const modal = document.getElementById('reset-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeResetModal() {
    playAudioTone(300, 'sine', 0.03);
    const modal = document.getElementById('reset-modal');
    modal.classList.remove('flex');
    modal.classList.add('hidden');
}

async function executeReset() {
    playAudioTone(300, 'sine', 0.05);

    if (db && auth && auth.currentUser) {
        const uid = auth.currentUser.uid;
        const collectionRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items');
        const snapshot = await collectionRef.get();
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }

    items = [];
    saveLocalItems();
    closeResetModal();
    renderApp();
    showToast("تم تصفير القائمة وإعادة التهيئة الكاملة.", "🧹");
}

// ------------------------------------------------------------------
// محرك مقترحات الذكاء الاصطناعي الذكي
// ------------------------------------------------------------------
async function getAISuggestions() {
    playAudioTone(400, 'sine', 0.05);
    const btn = document.getElementById('ai-gen-btn');
    const spinner = document.getElementById('ai-spinner');
    const container = document.getElementById('ai-suggestions-list');

    btn.disabled = true;
    spinner.classList.remove('hidden');

    const aiPrompt = `أنت مساعد تسوق ذكي ومستشار Setup مخصص لمبرمجي الويب ومصممي الواجهات (UI/UX) في الجزائر.
اقترح 5 أغراض قيمة ومفيدة لإنتاجيتهم وجودة عملهم (أدوات كروت شاشات، كابلات جودة، إضاءة مكتبية، كابات كيبورد، قهوة جزائرية ممتازة للتركيز، سويتشر، هاد باون، إلخ) مع إبراز ثمنها التقريبي بالدينار الجزائري (دج).
يجب أن ترجع الإجابة حصراً بصيغة JSON على شكل مصفوفة كائنات كما في هذا المثال، دون أي نصوص تمهيدية أو ختامية أو علامات ماركداون:
[
  {"name": "حامل شاشة معدني هيدروليكي", "price": 4500, "category": "💻 عمل ومكتب", "reason": "لرفع الشاشة وتحسين راحة الرقبة للمبرمج."},
  {"name": "بن لافازا إسبراسو 1كغ", "price": 1800, "category": "🥩 اغذية", "reason": "سر المبرمجين الجزائريين في ليالي البرمجة الطويلة."}
]`;

    const apiKey = ""; // مفتاح API فارغ للبيئات التي تدمجه تلقائياً
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: aiPrompt }] }],
        generationConfig: { responseMimeType: "application/json" }
    };

    let attempts = 3;
    let success = false;
    let apiResult = null;

    while (attempts > 0 && !success) {
        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                apiResult = await response.json();
                success = true;
            } else {
                throw new Error();
            }
        } catch(e) {
            attempts--;
            if (attempts > 0) {
                await new Promise(res => setTimeout(res, 1000));
            }
        }
    }

    if (success && apiResult) {
        try {
            const textResponse = apiResult.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsed = JSON.parse(textResponse);

            container.innerHTML = '';
            parsed.forEach((sug, i) => {
                const sugCard = document.createElement('div');
                sugCard.className = "bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-col gap-2 relative overflow-hidden";
                sugCard.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div class="flex flex-col">
                            <h5 class="text-xs font-black text-white">${sug.name}</h5>
                            <span class="text-[9px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full w-fit mt-1 font-bold">${sug.category}</span>
                        </div>
                        <span class="text-xs font-black text-emerald-400 shrink-0">${sug.price} دج</span>
                    </div>
                    <p class="text-[10px] text-slate-400 leading-relaxed">${sug.reason}</p>
                    <button onclick="addAISugDirect('${sug.name.replace(/'/g, "\\'")}', '${sug.category}')" class="w-full bg-slate-950 border border-slate-800 hover:border-cyan-500/30 text-[10px] font-bold py-2 rounded-xl mt-1 text-slate-300 transition-all flex items-center justify-center gap-1.5">
                        <span>➕</span> أضف لقائمة مشترياتي
                    </button>
                `;
                container.appendChild(sugCard);
            });
            showToast("توليد ناجح! تم تحديث مقترحات الذكاء الاصطناعي.", "🧠");
            playChimeSoundSequence();
        } catch(e) {
            console.error("Parse fail, falling back", e);
            loadLocalAISuggestions();
        }
    } else {
        loadLocalAISuggestions();
    }

    btn.disabled = false;
    spinner.classList.add('hidden');
}

function loadLocalAISuggestions() {
    const localSugs = [
        { name: "Pudding PBT Keycaps ✨", price: 2400, category: "💻 عمل ومكتب", reason: "كابات مخصصة للكلافي لتوزيع إضاءة RGB سينمائي مذهل." },
        { name: "ماوس باد مكتب XL مضادة للماء 🖱️", price: 1800, category: "💻 عمل ومكتب", reason: "مريحة جداً لمعصم اليد وتثبت حركة الماوس أثناء كود الـ CSS والديزاين." },
        { name: "علبة قهوة Ben Rahim المختصة ☕", price: 1200, category: "🥩 اغذية", reason: "نكهة فاخرة ومحفز رهيب لزيادة التركيز وتجاوز الـ Bugs." },
        { name: "شريط إضاءة LED ذكي خلف المكتب 💡", price: 1500, category: "💻 عمل ومكتب", reason: "يخلق بيئة إضاءة محيطية مريحة للعين في الغرف المظلمة." },
        { name: "شاحن Baseus سريع 100W كابل متين 🔌", price: 3200, category: "💻 عمل ومكتب", reason: "لشحن اللابتوب والهاتف معاً في لمح البصر بجودة وموثوقية عالية." }
    ];

    const container = document.getElementById('ai-suggestions-list');
    container.innerHTML = '';
    localSugs.forEach(sug => {
        const sugCard = document.createElement('div');
        sugCard.className = "bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-col gap-2 relative overflow-hidden";
        sugCard.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex flex-col">
                    <h5 class="text-xs font-black text-white">${sug.name}</h5>
                    <span class="text-[9px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full w-fit mt-1 font-bold">${sug.category}</span>
                </div>
                <span class="text-xs font-black text-emerald-400 shrink-0">${sug.price} دج</span>
            </div>
            <p class="text-[10px] text-slate-400 leading-relaxed">${sug.reason}</p>
            <button onclick="addAISugDirect('${sug.name.replace(/'/g, "\\'")}', '${sug.category}')" class="w-full bg-slate-950 border border-slate-800 hover:border-cyan-500/30 text-[10px] font-bold py-2 rounded-xl mt-1 text-slate-300 transition-all flex items-center justify-center gap-1.5">
                <span>➕</span> أضف لقائمة مشترياتي
            </button>
        `;
        container.appendChild(sugCard);
    });
    showToast("تم توليد اقتراحات ذكية مخصصة للديزاينر مأخوذة محلياً 🧠", "✨");
}

function addAISugDirect(name, cat) {
    addNewItem(name, cat);
    switchTab('shopping');
}

// ------------------------------------------------------------------
// نظام المشاركة والنسخ للحافظة
// ------------------------------------------------------------------
function shareShoppingSummary() {
    playAudioTone(450, 'sine', 0.05);
    let total = 0;
    let shareText = "🛒 *ملخص قائمة مشترياتي الذكية PRO* 🇩🇿\n\n";

    const pending = items.filter(i => !i.bought);
    if (pending.length > 0) {
        shareText += "📌 *صوالح مازال ما شريتهمش:*\n";
        pending.forEach(i => shareText += `• ${i.name} (${i.category})\n`);
    } else {
        shareText += "📌 *صوالح مازال ما شريتهمش:* تم شراء واقتناء كل الأغراض! 🎉\n";
    }

    const bought = items.filter(i => i.bought);
    if (bought.length > 0) {
        shareText += "\n✅ *مشترياتي المؤرشفة اليومية:*\n";
        const grouped = {};
        bought.forEach(i => {
            const date = new Date(i.time || Date.now());
            const dKey = date.toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' });
            if (!grouped[dKey]) grouped[dKey] = [];
            grouped[dKey].push(i);
        });

        Object.keys(grouped).forEach(day => {
            shareText += `*🗓️ يوم ${day}:*\n`;
            grouped[day].forEach(i => {
                shareText += `  - ${i.name} (${i.price} دج)\n`;
                total += i.price;
            });
        });
    } else {
        shareText += "\n(لم يتم شراء أي صوالح بعد)\n";
    }

    shareText += `\n💰 *المجموع الإجمالي المصروف:* ${total} دج\n`;
    shareText += "🛠️ _تمت المزامنة والأرشفة سحابياً عبر تطبيقي المطور_";

    const helperArea = document.createElement("textarea");
    helperArea.value = shareText;
    helperArea.style.top = "0";
    helperArea.style.left = "0";
    helperArea.style.position = "fixed";
    document.body.appendChild(helperArea);
    helperArea.focus();
    helperArea.select();

    let result = false;
    try {
        result = document.execCommand('copy');
    } catch(e) {
        result = false;
    }
    document.body.removeChild(helperArea);

    if (result) {
        showToast("📋 تم نسخ ملخص المشتريات بالكامل! ارسله الآن لأصدقائك.", "✅");
    } else {
        showToast("⚠️ المتصفح منع النسخ التلقائي في الهاتف.", "❌");
    }
}

// ------------------------------------------------------------------
// تركيب الأصوات (Audio Feedback)
// ------------------------------------------------------------------
let audioContextInstance = null;
function playAudioTone(freq, type, duration) {
    try {
        if (!audioContextInstance) {
            audioContextInstance = new (window.AudioContext || window.webkitAudioContext)();
        }
        const osc = audioContextInstance.createOscillator();
        const gain = audioContextInstance.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq || 440, audioContextInstance.currentTime);
        gain.gain.setValueAtTime(0.06, audioContextInstance.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContextInstance.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioContextInstance.destination);
        osc.start();
        osc.stop(audioContextInstance.currentTime + duration);
    } catch (e) {}
}

function playChimeSoundSequence() {
    playAudioTone(523.25, 'sine', 0.15); // C5
    setTimeout(() => {
        playAudioTone(659.25, 'sine', 0.15); // E5
        setTimeout(() => {
            playAudioTone(783.99, 'sine', 0.25); // G5
        }, 80);
    }, 80);
}

// ------------------------------------------------------------------
// نظام التنبيهات (Toasts) وواجهة التحميل
// ------------------------------------------------------------------
function showToast(message, icon = "✨") {
    const toast = document.getElementById('toast-notif');
    document.getElementById('toast-icon').innerText = icon;
    document.getElementById('toast-msg').innerText = message;

    toast.classList.remove('-translate-y-24', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.add('-translate-y-24', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3000);
}

function bypassLoader() {
    document.getElementById('safety-loader').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    loadLocalItems();
}

// ------------------------------------------------------------------
// انطلاق التطبيق
// ------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('safety-loader').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';

    initFirebase();
});
