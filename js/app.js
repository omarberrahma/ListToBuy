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

// متغيرات عالمية لضمان استقرار التطبيق
let db = null;
let auth = null;
let appId = "tobuylist-48f07";
let items = [];
let currentUserId = null;
let currentActiveId = null;
let selectedCategory = "🛒 اخرى";
let currentPage = "auth";
let historyStack = [];
let unsubsItems = null;

// ------------------------------------------------------------------
// تهيئة Firebase والتحقق من حالة المستخدم
// ------------------------------------------------------------------
function initFirebase() {
    try {
        // تنظيف بقايا الإصدارات القديمة لضمان بداية نظيفة
        if (localStorage.getItem('shopping_items_mobile_v3')) {
            localStorage.removeItem('shopping_items_mobile_v3');
        }

        if (typeof firebase !== 'undefined') {
            if (!firebase.apps.length) {
                firebase.initializeApp(realFirebaseConfig);
            }
            db = firebase.firestore();
            auth = firebase.auth();

            // مراقبة حالة تسجيل الدخول (User Isolation Start)
            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    currentUserId = user.uid;
                    document.getElementById('user-name-display-home').innerText = `صوالح ${user.email ? user.email.split('@')[0] : 'المطور'}`;

                    // تحميل قائمة المستخدم الخاصة برك
                    setupItemsListener();

                    if (currentPage === 'auth') {
                        navigateTo('home');
                    }
                } else {
                    // في حالة الخروج، تصفير البيانات والعودة لصفحة الدخول
                    currentUserId = null;
                    items = [];
                    if (unsubsItems) unsubsItems();
                    renderApp();
                    navigateTo('auth');
                }
            });
        } else {
            // وضع الضيف في حالة عدم توفر Firebase
            loadLocalItems();
            navigateTo('home');
        }
    } catch(e) {
        console.error("Firebase Init Error:", e);
        loadLocalItems();
    }
}

// ------------------------------------------------------------------
// نظام المزامنة والخصوصية (User Isolation Logic)
// ------------------------------------------------------------------

/**
 * الاستماع لتحديثات Firestore الخاصة بالمستخدم المسجل حالياً فقط
 */
function setupItemsListener() {
    if (!db || !auth || !auth.currentUser) return;
    const uid = auth.currentUser.uid;

    if (unsubsItems) unsubsItems();

    // المسار المصيري لضمان فصل البيانات: artifacts -> appId -> users -> uid -> items
    const collectionRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items');

    unsubsItems = collectionRef.onSnapshot((snapshot) => {
        const fetched = [];
        snapshot.forEach(doc => {
            fetched.push(doc.data());
        });

        if (fetched.length > 0) {
            items = fetched;
            saveLocalItems(); // حفظ نسخة محتياطية محلية معزولة
            if (currentPage === 'home') renderApp();
            if (currentPage === 'archive') renderArchiveView();
        } else {
            // إذا كانت قاعدة بيانات المستخدم في السحابة فارغة
            loadLocalItems(); // تحميل البيانات المحلية إذا وجدت
            if (items.length > 0) {
                initUserDatabaseInCloud(uid); // رفعها للسحابة لأول مرة لهذا المستخدم
            }
        }
    }, (error) => {
        console.error("Firestore Listener Error:", error);
        loadLocalItems();
    });
}

/**
 * تهيئة قاعدة بيانات المستخدم الجديد في السحابة
 */
async function initUserDatabaseInCloud(uid) {
    if (!db) return;
    const collectionRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items');
    const batch = db.batch();

    items.forEach(item => {
        const docRef = collectionRef.doc(item.id);
        batch.set(docRef, item);
    });

    try {
        await batch.commit();
    } catch(e) {
        console.error("Cloud Init Error:", e);
    }
}

/**
 * مزامنة غرض واحد مع مجلد المستخدم الخاص في السحابة
 */
async function syncItemToCloud(item) {
    if (!db || !auth || !auth.currentUser) return;
    try {
        const uid = auth.currentUser.uid;
        const docRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items').doc(item.id);
        await docRef.set(item, { merge: true });
    } catch(e) {
        console.error("Single Item Sync Error:", e);
    }
}

/**
 * حذف غرض من مجلد المستخدم الخاص في السحابة
 */
async function deleteItemInCloud(itemId) {
    if (!db || !auth || !auth.currentUser) return;
    try {
        const uid = auth.currentUser.uid;
        const docRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items').doc(itemId);
        await docRef.delete();
    } catch(e) {
        console.error("Item Delete Error:", e);
    }
}

// ------------------------------------------------------------------
// نظام التخزين المحلي المعزول (LocalStorage Isolation)
// ------------------------------------------------------------------

function getStorageKey() {
    // استعمال الـ uid في مفتاح التخزين لضمان عدم اختلاط البيانات محلياً
    return currentUserId ? `items_v4_${currentUserId}` : 'items_guest_v4';
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
// نظام التنقل (Routing System)
// ------------------------------------------------------------------
function navigateTo(pageId, addToHistory = true) {
    if (addToHistory && currentPage !== pageId) {
        historyStack.push(currentPage);
        window.location.hash = pageId;
    }

    currentPage = pageId;
    document.querySelectorAll('.page-section').forEach(p => p.classList.add('hidden'));

    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.remove('hidden');

    const nav = document.getElementById('bottom-nav');
    if (nav) {
        if (pageId === 'auth' || pageId === 'edit') {
            nav.classList.add('hidden');
        } else {
            nav.classList.remove('hidden');
        }
    }

    updateNavButtons(pageId);
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
// عمليات التوثيق (Auth Operations)
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
        showToast("خطأ في تسجيل الدخول. تأكد من بياناتك.", "❌");
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
        showToast("الكود السري لازم يكون فيه 6 خانات أو أكثر.", "⚠️");
        return;
    }

    const email = `${userInp}@smartdzlist.com`;
    try {
        if (auth) {
            await auth.createUserWithEmailAndPassword(email, passInp);
            showToast("تم إنشاء الحساب بنجاح!", "✨");
        }
    } catch(e) {
        showToast("فشل إنشاء الحساب. جرب اسم مستخدم آخر.", "❌");
    }
}

async function logoutUser() {
    playAudioTone(300, 'sine', 0.1);
    if (unsubsItems) unsubsItems();
    if (auth) {
        await auth.signOut();
        showToast("تم تسجيل الخروج بنجاح.", "🚪");
    }
}

// ------------------------------------------------------------------
// إدارة القائمة والأغراض (Items Management)
// ------------------------------------------------------------------
function setCategory(cat) {
    playAudioTone(350, 'triangle', 0.04);
    selectedCategory = cat;
    document.querySelectorAll('.cat-tag-btn').forEach(btn => {
        if (btn.innerText.includes(cat.split(' ')[1])) {
            btn.className = "cat-tag-btn bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold px-2.5 py-1.5 rounded-lg";
        } else {
            btn.className = "cat-tag-btn bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-bold px-2.5 py-1.5 rounded-lg";
        }
    });
}

function renderApp() {
    const pendingList = document.getElementById('pending-list-container');
    if (!pendingList) return;

    const searchVal = document.getElementById('search-box').value.toLowerCase().trim();
    const filterVal = document.getElementById('category-filter').value;

    pendingList.innerHTML = '';
    let totalSpent = 0, pendingCount = 0, boughtCount = 0;

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
                        <button onclick="openEditPage('${item.id}')" class="bg-slate-800 text-slate-400 p-2.5 rounded-xl border border-slate-700">✏️</button>
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
        pendingList.innerHTML = `<div class="text-center p-6 text-slate-500 text-[10px]">القائمة فارغة، أضف صوالحك الآن!</div>`;
    }

    document.getElementById('total-price').innerText = totalSpent.toLocaleString('ar-DZ') + ' دج';
    document.getElementById('pending-count').innerText = pendingCount + ' صوالح';
    document.getElementById('pending-badge').innerText = pendingCount;

    const totalCount = items.length;
    const progressPercent = totalCount > 0 ? Math.round((boughtCount / totalCount) * 100) : 0;
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.width = progressPercent + '%';
    const progressText = document.getElementById('progress-text');
    if (progressText) progressText.innerText = progressPercent + '%';
}

function renderArchiveView() {
    const container = document.getElementById('archive-days-container');
    if (!container) return;
    container.innerHTML = '';

    const boughtItems = items.filter(i => i.bought);
    if (boughtItems.length === 0) {
        container.innerHTML = `<div class="text-center p-8 text-slate-500 text-[10px]">لا يوجد أرشيف مشتريات بعد.</div>`;
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
        let dayTotal = 0, itemsHtml = '';

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
    showToast(`تمت إضافة: ${name}`, "✅");
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
            const updated = { ...item, name, category, price, bought, time: (bought && !item.bought) ? Date.now() : item.time };
            syncItemToCloud(updated);
            return updated;
        }
        return item;
    });

    saveLocalItems();
    showToast("تم الحفظ بنجاح", "✅");
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

function markItemAsBought(id) {
    currentActiveId = id;
    const item = items.find(i => i.id === id);
    document.getElementById('modal-title').innerText = `شحال لقيت سعر: ${item.name}؟`;
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
            const updated = { ...item, bought: true, price, time: Date.now() };
            syncItemToCloud(updated);
            return updated;
        }
        return item;
    });
    saveLocalItems();
    closeBuyModal();
    renderApp();
    if (typeof confetti === 'function') confetti({ particleCount: 40, spread: 50, origin: { y: 0.8 } });
    showToast("بصحتك الشريّة!", "🎉");
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
// محرك مقترحات الذكاء الاصطناعي (AI Engine)
// ------------------------------------------------------------------
async function getAISuggestions() {
    playAudioTone(400, 'sine', 0.05);
    const spinner = document.getElementById('ai-spinner');
    const container = document.getElementById('ai-suggestions-list');
    if (spinner) spinner.classList.remove('hidden');

    const aiPrompt = `أنت مساعد تسوق ذكي ومستشار Setup مخصص لمبرمجي الويب ومصممي الواجهات في الجزائر.
اقترح 5 أغراض قيمة لمكتبهم أو حياتهم اليومية مع الثمن التقريبي بالدج.
أجب حصراً بصيغة JSON كأنه مصفوفة كائنات: [{"name": "...", "price": 0, "category": "...", "reason": "..."}]`;

    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=`; // Gemini API

    try {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: aiPrompt }] }], generationConfig: { responseMimeType: "application/json" } })
        });

        if (response.ok) {
            const result = await response.json();
            const parsed = JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text);
            container.innerHTML = '';
            parsed.forEach(sug => {
                const card = document.createElement('div');
                card.className = "glass-card p-4 rounded-2xl flex flex-col gap-2 relative overflow-hidden";
                card.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div class="flex flex-col">
                            <h5 class="text-xs font-black text-white">${sug.name}</h5>
                            <span class="text-[9px] text-purple-400 font-bold mt-1">${sug.category}</span>
                        </div>
                        <span class="text-xs font-black text-emerald-400 shrink-0">${sug.price} دج</span>
                    </div>
                    <p class="text-[10px] text-slate-400 leading-relaxed">${sug.reason || ''}</p>
                    <button onclick="addAISugDirect('${sug.name.replace(/'/g, "\\'")}', '${sug.category}')" class="w-full bg-slate-900 border border-slate-800 text-[10px] font-bold py-2 rounded-xl mt-1 text-slate-300 transition-all">➕ أضف للقائمة</button>
                `;
                container.appendChild(card);
            });
            showToast("مقترحات ذكية جاهزة!", "🧠");
        } else { throw new Error(); }
    } catch(e) { loadLocalAISuggestions(); }
    finally { if (spinner) spinner.classList.add('hidden'); }
}

function loadLocalAISuggestions() {
    const localSugs = [
        { name: "Pudding PBT Keycaps ✨", price: 2400, category: "💻 عمل ومكتب", reason: "كابات مخصصة للكلافي لتوزيع إضاءة RGB مذهل." },
        { name: "ماوس باد مكتب XL مضادة للماء 🖱️", price: 1800, category: "💻 عمل ومكتب", reason: "مريحة جداً لمعصم اليد وتثبت حركة الماوس." },
        { name: "علبة قهوة مختصة ☕", price: 1200, category: "🥩 اغذية", reason: "نكهة فاخرة ومحفز رهيب لزيادة التركيز." }
    ];
    const container = document.getElementById('ai-suggestions-list');
    if (!container) return;
    container.innerHTML = '';
    localSugs.forEach(sug => {
        const div = document.createElement('div');
        div.className = "glass-card p-4 rounded-2xl flex flex-col gap-2";
        div.innerHTML = `
            <div class="flex justify-between items-center"><div class="text-xs font-bold text-white">${sug.name}</div><div class="text-xs font-bold text-emerald-400">${sug.price} دج</div></div>
            <p class="text-[10px] text-slate-400">${sug.reason}</p>
            <button onclick="addAISugDirect('${sug.name}', '${sug.category}')" class="bg-slate-900 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded-lg mt-1">إضافة</button>
        `;
        container.appendChild(div);
    });
}

function addAISugDirect(name, cat) { addNewItem(name, cat); navigateTo('home'); }

// ------------------------------------------------------------------
// إدارة البيانات الشاملة (Data Management)
// ------------------------------------------------------------------
function openResetModal() {
    const modal = document.getElementById('reset-modal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}
function closeResetModal() {
    const modal = document.getElementById('reset-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * إعادة تهيئة التطبيق ومسح بيانات المستخدم الحالي فقط لضمان الخصوصية
 */
async function executeReset() {
    if (db && auth && auth.currentUser) {
        const uid = auth.currentUser.uid;
        // استهداف مسار المستخدم الخاص بدقة
        const snapshot = await db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('items').get();
        const batch = db.batch();
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        localStorage.removeItem(`items_v4_${uid}`);
    } else {
        localStorage.removeItem('items_guest_v4');
    }

    items = [];
    closeResetModal();
    renderApp();
    renderArchiveView();
    showToast("تم تصفير بياناتك بنجاح.", "🧹");
}

// ------------------------------------------------------------------
// وظائف المساعدة (Utility Functions)
// ------------------------------------------------------------------
function showToast(message, icon = "✨") {
    const toast = document.getElementById('toast-notif');
    if (!toast) return;
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
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
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
    const loader = document.getElementById('safety-loader');
    if (loader) loader.style.display = 'none';
    loadLocalItems();
    if (!currentUserId) navigateTo('home');
}

window.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('safety-loader');
    if (loader) loader.style.display = 'none';
    initFirebase();
});
