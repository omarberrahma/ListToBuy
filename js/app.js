// ------------------------------------------------------------------
// 1. إعدادات ومفاتيح FIREBASE الحقيقية للمشروع
// ------------------------------------------------------------------
const realFirebaseConfig = {
    apiKey: "AIzaSyD-1-cHPypztySKjjszacr8wH0my17BVaY",
    authDomain: "tobuylist-48f07.firebaseapp.com",
    projectId: "tobuylist-48f07",
    storageBucket: "tobuylist-48f07.firebasestorage.app",
    messagingSenderId: "358300266390",
    appId: "1:358300266390:web:36f6f2347929d66f4f37b7"
};

// متغيرات عالمية ومعالجة الأعطال لضمان الاستقرار
let db = null;
let auth = null;
let appId = "tobuylist-48f07";
let items = [];
let currentUserId = null;
let currentActiveId = null;
let selectedCategory = "🛒 اخرى";
let currentPage = "auth";
let historyStack = [];

function initFirebase() {
    try {
        if (typeof firebase !== 'undefined') {
            if (!firebase.apps.length) {
                firebase.initializeApp(realFirebaseConfig);
            }
            db = firebase.firestore();
            auth = firebase.auth();

            // الاستماع لحالة تسجيل الدخول
            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    currentUserId = user.uid;
                    document.getElementById('user-name-display-home').innerText = `صوالح ${user.email ? user.email.split('@')[0] : 'المطور'}`;

                    // تحميل ومراقبة العناصر لهذا المستخدم المسجل
                    setupItemsListener();

                    if (currentPage === 'auth') {
                        navigateTo('home');
                    }
                } else {
                    currentUserId = null;
                    items = [];
                    renderApp();
                    navigateTo('auth');
                }
            });
        } else {
            console.log("Firebase SDK not loaded, using local storage.");
            loadLocalItems();
            navigateTo('home');
        }
    } catch(e) {
        console.error("Firebase startup issues handled:", e);
        loadLocalItems();
        navigateTo('home');
    }
}

// ------------------------------------------------------------------
// نظام التنقل (Routing)
// ------------------------------------------------------------------
function navigateTo(pageId, addToHistory = true) {
    if (addToHistory && currentPage !== pageId) {
        historyStack.push(currentPage);
        window.location.hash = pageId;
    }

    currentPage = pageId;

    // إخفاء كل الصفحات
    document.querySelectorAll('.page-section').forEach(p => p.classList.add('hidden'));

    // إظهار الصفحة المطلوبة
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }

    // التحكم في شريط التنقل السفلي
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    if (pageId === 'auth' || pageId === 'edit') {
        nav.classList.add('hidden');
    } else {
        nav.classList.remove('hidden');
    }

    // تحديث شكل أزرار التنقل
    updateNavButtons(pageId);

    // تنفيذ عمليات خاصة بالصفحة
    if (pageId === 'home') renderApp();
    if (pageId === 'archive') renderArchiveView();

    window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
    const pageId = window.location.hash.replace('#', '');
    if (pageId && pageId !== currentPage) {
        navigateTo(pageId, false);
    }
});

function updateNavButtons(activeId) {
    const navItems = ['home', 'archive', 'ai'];
    navItems.forEach(id => {
        const btn = document.getElementById(`nav-${id}`);
        if (btn) {
            if (id === activeId) {
                btn.classList.remove('text-slate-400');
                btn.classList.add('text-cyan-400');
            } else {
                btn.classList.remove('text-cyan-400');
                btn.classList.add('text-slate-400');
            }
        }
    });
}

function goBack() {
    if (historyStack.length > 0) {
        const prev = historyStack.pop();
        navigateTo(prev, false);
    } else {
        navigateTo('home');
    }
}

// ------------------------------------------------------------------
// نظام تخزين واسترجاع العناصر محلياً (مع عزل البيانات)
// ------------------------------------------------------------------
function getStorageKey() {
    return currentUserId ? `items_${currentUserId}` : 'items_guest';
}

function loadLocalItems() {
    const key = getStorageKey();
    const cached = localStorage.getItem(key);
    if (cached) {
        try {
            items = JSON.parse(cached);
        } catch(err) {
            items = [];
        }
    } else {
        items = [];
    }
    renderApp();
}

function saveLocalItems() {
    const key = getStorageKey();
    localStorage.setItem(key, JSON.stringify(items));
}

// ------------------------------------------------------------------
// مزامنة Firestore
// ------------------------------------------------------------------
let unsubsItems = null;
function setupItemsListener() {
    if (!db || !auth || !auth.currentUser) return;
    const uid = auth.currentUser.uid;

    if (unsubsItems) unsubsItems();

    const collectionRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items');

    unsubsItems = collectionRef.onSnapshot((snapshot) => {
        const fetched = [];
        snapshot.forEach(doc => {
            fetched.push(doc.data());
        });

        if (fetched.length > 0) {
            items = fetched;
            saveLocalItems();
            if (currentPage === 'home') renderApp();
            if (currentPage === 'archive') renderArchiveView();
        } else {
            // إذا كانت السحابة فارغة لهذا المستخدم
            // إذا كان هناك عناصر في الذاكرة (مثلاً من وضع الضيف قبل تسجيل الدخول)، نرفعها
            if (items.length > 0) {
                saveLocalItems();
                initUserDatabaseInCloud(uid);
            } else {
                // وإلا نحاول تحميل البيانات المحلية الخاصة بهذا المستخدم
                loadLocalItems();
                if (items.length > 0) {
                    initUserDatabaseInCloud(uid);
                }
            }
        }
    }, (error) => {
        console.error("Cloud listening failed:", error);
        loadLocalItems();
    });
}

async function initUserDatabaseInCloud(uid) {
    if (!db) return;
    const collectionRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items');
    const batch = db.batch();
    items.forEach(item => {
        const docRef = collectionRef.doc(item.id);
        batch.set(docRef, item);
    });
    try { await batch.commit(); } catch(e) {}
}

async function syncItemToCloud(item) {
    if (!db || !auth || !auth.currentUser) return;
    try {
        const uid = auth.currentUser.uid;
        const docRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items').doc(item.id);
        await docRef.set(item, { merge: true });
    } catch(e) {}
}

async function deleteItemInCloud(itemId) {
    if (!db || !auth || !auth.currentUser) return;
    try {
        const uid = auth.currentUser.uid;
        const docRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items').doc(itemId);
        await docRef.delete();
    } catch(e) {}
}

// ------------------------------------------------------------------
// عمليات التوثيق
// ------------------------------------------------------------------
async function loginUser() {
    playAudioTone(250, 'triangle', 0.05);
    const userInp = document.getElementById('username').value.trim().toLowerCase();
    const passInp = document.getElementById('password').value.trim();

    if (!userInp || !passInp) {
        showToast("الرجاء إدخال اسم المستخدم والكود السري!", "⚠️");
        return;
    }

    const email = `${userInp}@smartdzlist.com`;
    try {
        if (auth) {
            await auth.signInWithEmailAndPassword(email, passInp);
            showToast("تم الدخول بنجاح!", "🎉");
        }
    } catch(e) {
        showToast("خطأ في تسجيل الدخول. تأكد من البيانات.", "❌");
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
        showToast("الكود السري يجب أن يكون 6 خانات فأكثر.", "⚠️");
        return;
    }

    const email = `${userInp}@smartdzlist.com`;
    try {
        if (auth) {
            await auth.createUserWithEmailAndPassword(email, passInp);
            showToast("تم إنشاء الحساب بنجاح!", "✨");
        }
    } catch(e) {
        showToast("فشل إنشاء الحساب. قد يكون الاسم مستخدماً.", "❌");
    }
}

async function logoutUser() {
    playAudioTone(300, 'sine', 0.1);
    if (unsubsItems) unsubsItems();
    if (auth) {
        await auth.signOut();
        showToast("تم تسجيل الخروج.", "🚪");
    }
}

// ------------------------------------------------------------------
// إدارة الفئات (Categories)
// ------------------------------------------------------------------
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
// عرض القائمة (Home Page)
// ------------------------------------------------------------------
function renderApp() {
    const pendingList = document.getElementById('pending-list-container');
    const searchVal = document.getElementById('search-box').value.toLowerCase().trim();
    const filterVal = document.getElementById('category-filter').value;

    if (!pendingList) return;
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
                    <div class="flex flex-col gap-0.5" onclick="openEditPage('${item.id}')">
                        <span class="text-xs font-bold text-white">${item.name}</span>
                        <span class="text-[9px] text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/15 px-2 py-0.5 rounded-md w-fit">${item.category || '🛒 اخرى'}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button onclick="markItemAsBought('${item.id}')" class="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-[10px] px-3.5 py-2.5 rounded-xl transition-all">شريت ✅</button>
                        <button onclick="openEditPage('${item.id}')" class="bg-slate-800 text-slate-400 p-2.5 rounded-xl border border-slate-700">
                            ✏️
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

    if (pendingCount === 0) {
        pendingList.innerHTML = `<div class="text-center p-6 text-slate-500 text-[10px]">القائمة فارغة.</div>`;
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
// عرض الأرشيف (Archive Page)
// ------------------------------------------------------------------
function renderArchiveView() {
    const container = document.getElementById('archive-days-container');
    if (!container) return;
    container.innerHTML = '';

    const boughtItems = items.filter(i => i.bought);
    if (boughtItems.length === 0) {
        container.innerHTML = `<div class="text-center p-8 text-slate-500 text-[10px]">الأرشيف فارغ.</div>`;
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
            itemsHtml += `
                <div class="flex justify-between items-center bg-[#1c2541]/40 border border-slate-800 p-3 rounded-xl">
                    <div class="flex flex-col gap-0.5" onclick="openEditPage('${item.id}')">
                        <span class="text-xs font-bold text-slate-400 line-through">${item.name}</span>
                        <div class="flex items-center gap-1.5 text-[9px] text-slate-500 font-bold">
                            <span class="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">${item.price} دج</span>
                            <span>• ${item.category}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button onclick="restoreItemToPending('${item.id}')" class="text-slate-500 hover:text-slate-300 p-2">↩️</button>
                        <button onclick="openEditPage('${item.id}')" class="text-slate-500 p-2">✏️</button>
                    </div>
                </div>
            `;
        });

        dayWrapper.innerHTML = `
            <div class="flex justify-between items-center border-b border-slate-800 pb-1.5 px-1 mt-2">
                <span class="text-xs font-bold text-slate-300">${dayKey}</span>
                <span class="text-[9px] font-black text-emerald-400">${dayTotal} دج</span>
            </div>
            <div class="flex flex-col gap-1.5">${itemsHtml}</div>
        `;
        container.appendChild(dayWrapper);
    });
}

function formatDayKey(date) {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "اليوم";
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "أمس";
    return date.toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' });
}

// ------------------------------------------------------------------
// إضافة وتعديل العناصر
// ------------------------------------------------------------------
async function addNewItem(nameValue = null, categoryValue = null) {
    playAudioTone(400, 'triangle', 0.05);
    const inputField = document.getElementById('new-item-input');
    const name = nameValue || inputField.value.trim();
    const category = categoryValue || selectedCategory;

    if (!name) return;

    const newItem = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
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
    showToast(`تمت إضافة ${name}`, "✅");
}

function handleNewItemKeyPress(e) { if (e.key === 'Enter') addNewItem(); }

function openEditPage(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;

    document.getElementById('edit-item-id').value = item.id;
    document.getElementById('edit-item-name').value = item.name;
    document.getElementById('edit-item-category').value = item.category || '🛒 اخرى';
    document.getElementById('edit-item-price').value = item.price || 0;
    document.getElementById('edit-item-bought').checked = item.bought;

    navigateTo('edit');
}

async function saveItemChanges() {
    const id = document.getElementById('edit-item-id').value;
    const name = document.getElementById('edit-item-name').value.trim();
    const category = document.getElementById('edit-item-category').value;
    const price = parseFloat(document.getElementById('edit-item-price').value) || 0;
    const bought = document.getElementById('edit-item-bought').checked;

    if (!name) return;

    items = items.map(item => {
        if (item.id === id) {
            const updated = {
                ...item,
                name: name,
                category: category,
                price: price,
                bought: bought,
                time: (bought && !item.bought) ? Date.now() : item.time
            };
            syncItemToCloud(updated);
            return updated;
        }
        return item;
    });

    saveLocalItems();
    showToast("تم حفظ التعديلات", "✅");
    goBack();
}

async function deleteItemFromEdit() {
    const id = document.getElementById('edit-item-id').value;
    items = items.filter(i => i.id !== id);
    saveLocalItems();
    await deleteItemInCloud(id);
    showToast("تم الحذف", "🧹");
    goBack();
}

// ------------------------------------------------------------------
// عمليات الشراء السريع
// ------------------------------------------------------------------
function markItemAsBought(id) {
    currentActiveId = id;
    const item = items.find(i => i.id === id);
    document.getElementById('modal-title').innerText = `سعر ${item.name}؟`;
    document.getElementById('modal-price-input').value = '';
    document.getElementById('price-modal').classList.remove('hidden');
    document.getElementById('price-modal').classList.add('flex');
    document.getElementById('modal-price-input').focus();
}

function setQuickPrice(val) { document.getElementById('modal-price-input').value = val; }
function closeBuyModal() { document.getElementById('price-modal').classList.add('hidden'); }

async function confirmBuyAction() {
    const price = parseFloat(document.getElementById('modal-price-input').value) || 0;
    items = items.map(item => {
        if (item.id === currentActiveId) {
            const updated = { ...item, bought: true, price: price, time: Date.now() };
            syncItemToCloud(updated);
            return updated;
        }
        return item;
    });
    saveLocalItems();
    closeBuyModal();
    renderApp();
    confetti({ particleCount: 40, spread: 50, origin: { y: 0.8 } });
    showToast("بصحتك!", "🎉");
}

async function restoreItemToPending(id) {
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
}

// ------------------------------------------------------------------
// محرك مقترحات الذكاء الاصطناعي الذكي (Gemini)
// ------------------------------------------------------------------
async function getAISuggestions() {
    playAudioTone(400, 'sine', 0.05);
    const spinner = document.getElementById('ai-spinner');
    const container = document.getElementById('ai-suggestions-list');

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

    try {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const apiResult = await response.json();
            const textResponse = apiResult.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsed = JSON.parse(textResponse);

            container.innerHTML = '';
            parsed.forEach((sug) => {
                const sugCard = document.createElement('div');
                sugCard.className = "glass-card p-4 rounded-2xl flex flex-col gap-2 relative overflow-hidden";
                sugCard.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div class="flex flex-col">
                            <h5 class="text-xs font-black text-white">${sug.name}</h5>
                            <span class="text-[9px] text-purple-400 font-bold mt-1">${sug.category}</span>
                        </div>
                        <span class="text-xs font-black text-emerald-400 shrink-0">${sug.price} دج</span>
                    </div>
                    <p class="text-[10px] text-slate-400 leading-relaxed">${sug.reason || ''}</p>
                    <button onclick="addAISugDirect('${sug.name.replace(/'/g, "\\'")}', '${sug.category}')" class="w-full bg-slate-900 border border-slate-800 text-[10px] font-bold py-2 rounded-xl mt-1 text-slate-300 transition-all">
                        ➕ أضف للقائمة
                    </button>
                `;
                container.appendChild(sugCard);
            });
            showToast("تم تحديث مقترحات الذكاء الاصطناعي.", "🧠");
        } else {
            throw new Error();
        }
    } catch(e) {
        loadLocalAISuggestions();
    } finally {
        spinner.classList.add('hidden');
    }
}

function loadLocalAISuggestions() {
    const localSugs = [
        { name: "Pudding PBT Keycaps ✨", price: 2400, category: "💻 عمل ومكتب", reason: "كابات مخصصة للكلافي لتوزيع إضاءة RGB سينمائي مذهل." },
        { name: "ماوس باد مكتب XL مضادة للماء 🖱️", price: 1800, category: "💻 عمل ومكتب", reason: "مريحة جداً لمعصم اليد وتثبت حركة الماوس." },
        { name: "علبة قهوة مختصة ☕", price: 1200, category: "🥩 اغذية", reason: "نكهة فاخرة ومحفز رهيب لزيادة التركيز." }
    ];

    const container = document.getElementById('ai-suggestions-list');
    container.innerHTML = '';
    localSugs.forEach(sug => {
        const div = document.createElement('div');
        div.className = "glass-card p-4 rounded-2xl flex flex-col gap-2";
        div.innerHTML = `
            <div class="flex justify-between items-center">
                <div class="text-xs font-bold text-white">${sug.name}</div>
                <div class="text-xs font-bold text-emerald-400">${sug.price} دج</div>
            </div>
            <p class="text-[10px] text-slate-400">${sug.reason}</p>
            <button onclick="addAISugDirect('${sug.name}', '${sug.category}')" class="bg-slate-900 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded-lg mt-1">إضافة</button>
        `;
        container.appendChild(div);
    });
}

function addAISugDirect(name, cat) {
    addNewItem(name, cat);
    navigateTo('home');
}

// ------------------------------------------------------------------
// إعادة التهيئة
// ------------------------------------------------------------------
function openResetModal() { document.getElementById('reset-modal').classList.remove('hidden'); document.getElementById('reset-modal').classList.add('flex'); }
function closeResetModal() { document.getElementById('reset-modal').classList.add('hidden'); }
async function executeReset() {
    if (db && auth && auth.currentUser) {
        const uid = auth.currentUser.uid;
        const snapshot = await db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items').get();
        const batch = db.batch();
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
    items = [];
    saveLocalItems();
    closeResetModal();
    renderApp();
    renderArchiveView();
    showToast("تم مسح كل البيانات", "🧹");
}

// ------------------------------------------------------------------
// خدمات مساعدة
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

let audioCtx = null;
function playAudioTone(freq, type, duration) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq || 440, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

function bypassLoader() {
    document.getElementById('safety-loader').style.display = 'none';
    loadLocalItems();
    if (!currentUserId) navigateTo('home');
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('safety-loader').style.display = 'none';
    initFirebase();
});
