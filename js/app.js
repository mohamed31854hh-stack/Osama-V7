import { firebaseConfig, auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { 
    collection, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, 
    query, where, orderBy, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ============================================
// CONSTANTS
// ============================================
const OWNER_USERNAME = 'Osama';
const OWNER_EMAIL = 'osama@edulearn.admin';
const ADMIN_DOMAIN = 'admin.edu';
const STUDENT_DOMAIN = 'student.edu';
const MAX_FILE_SIZE = 800 * 1024;

const GRADES = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const YEARS = ['2024-2025', '2025-2026', '2026-2027'];
const SUBJECTS = ['Mathematics', 'Science', 'English', 'Arabic', 'History', 'Geography', 'Physics', 'Chemistry', 'Biology'];
const TERMS = ['First', 'Second', 'Third'];

let currentUser = null;
let currentUserData = null;
let studentsUnsub = null;
let adminsUnsub = null;
let contentUnsub = null;
window.allContentItems = [];
window.allStudents = [];
window.allAdmins = [];

// ============================================
// UTILITIES
// ============================================
function $(id) { return document.getElementById(id); }

function usernameToEmail(username, role = 'student') {
    const u = username.toLowerCase().trim();
    if (u === OWNER_USERNAME.toLowerCase()) return OWNER_EMAIL;
    if (role === 'admin') return `${u}@${ADMIN_DOMAIN}`;
    return `${u}@${STUDENT_DOMAIN}`;
}

function showToast(message, type = 'info') {
    const toast = $('toast');
    toast.textContent = message;
    toast.className = `glass-toast ${type}`;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 3500);
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getContentIcon(type) {
    switch(type) {
        case 'video': return 'fa-youtube';
        case 'link': return 'fa-external-link-alt';
        case 'pdf': return 'fa-file-pdf';
        case 'image': return 'fa-image';
        default: return 'fa-file';
    }
}

function getContentColor(type) {
    switch(type) {
        case 'video': return '#ff0000';
        case 'link': return '#10b981';
        case 'pdf': return '#dc2626';
        case 'image': return '#3b82f6';
        default: return '#64748b';
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getYouTubeEmbedUrl(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) return `https://www.youtube.com/embed/${match[2]}`;
    return url;
}

// ============================================
// NAVIGATION
// ============================================
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.layout').forEach(l => l.classList.remove('active'));
    const target = $(viewId);
    if (target) target.classList.add('active');
}

function showAdminSection(sectionId) {
    // BLOCK non-owners from admin management pages
    if ((sectionId === 'admin-admins' || sectionId === 'admin-add-admin') && 
        (!currentUserData || currentUserData.role !== 'owner')) {
        showToast('Access denied: Owner only', 'error');
        return;
    }
    document.querySelectorAll('#admin-main .content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const section = $(sectionId);
    if (section) section.classList.add('active');
    const link = document.querySelector(`.nav-link[data-target="${sectionId}"]`);
    if (link) link.classList.add('active');
    window.scrollTo(0, 0);
    closeMobileSidebar();
}

function showStudentView(viewId) {
    document.querySelectorAll('.stu-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.header-actions .btn').forEach(b => b.classList.remove('active'));
    const view = $(viewId);
    if (view) view.classList.add('active');
    if (viewId === 'student-view-materials') $('btn-student-home').classList.add('active');
    if (viewId === 'student-view-settings') $('btn-student-settings').classList.add('active');
    window.scrollTo(0, 0);
}

function toggleMobileSidebar() { $('admin-sidebar').classList.toggle('open'); }
function closeMobileSidebar() { $('admin-sidebar').classList.remove('open'); }
function toggleMobileFilters() { $('student-filters').classList.toggle('open'); }
function closeMobileFilters() { $('student-filters').classList.remove('open'); }

function openModal(modalId) {
    $('modal-overlay').classList.add('active');
    document.querySelectorAll('.glass-modal').forEach(m => m.classList.remove('active'));
    const modal = $(modalId);
    if (modal) modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeModals() {
    $('modal-overlay').classList.remove('active');
    document.querySelectorAll('.glass-modal').forEach(m => m.classList.remove('active'));
    document.body.style.overflow = '';
}

function toggleUploadType() {
    const type = $('up-type').value;
    $('upload-file-section').style.display = type === 'file' ? 'block' : 'none';
    $('upload-url-section').style.display = type !== 'file' ? 'block' : 'none';
    $('url-label').textContent = type === 'video' ? 'YouTube URL' : 'External Link URL';
    $('up-url').placeholder = type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://...';
}

// ============================================
// POPULATE SELECTS
// ============================================
function populateSelects() {
    const gradeOpts = GRADES.map(g => `<option value="${g}">Grade ${g}</option>`).join('');
    const yearOpts = YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    const subjectOpts = SUBJECTS.map(s => `<option value="${s}">${s}</option>`).join('');
    const termOpts = TERMS.map(t => `<option value="${t}">${t} Term</option>`).join('');

    const gradeSelects = ['new-stu-grade', 'up-grade', 'admin-default-grade', 'stu-filter-grade', 'admin-filter-grade'];
    const yearSelects = ['new-stu-year', 'up-year', 'admin-default-year', 'stu-filter-year', 'admin-filter-year'];
    const subjectSelects = ['up-subject', 'stu-filter-subject', 'admin-filter-subject'];
    const termSelects = ['stu-filter-term', 'admin-filter-term'];

    gradeSelects.forEach(id => { if ($(id)) $(id).innerHTML = '<option value="">Select Grade</option>' + gradeOpts; });
    yearSelects.forEach(id => { if ($(id)) $(id).innerHTML = '<option value="">Select Year</option>' + yearOpts; });
    subjectSelects.forEach(id => { if ($(id)) $(id).innerHTML = '<option value="">Select Subject</option>' + subjectOpts; });
    termSelects.forEach(id => { if ($(id)) $(id).innerHTML = '<option value="">Select Term</option>' + termOpts; });
}

// ============================================
// AUTH
// ============================================
async function handleLogin(e) {
    e.preventDefault();
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    const msg = $('login-message');

    if (!username || !password) {
        msg.textContent = 'Please enter username and password';
        msg.className = 'login-message error';
        return;
    }

    const isOwner = username.toLowerCase() === OWNER_USERNAME.toLowerCase();
    let email;

    if (isOwner) {
        email = OWNER_EMAIL;
    } else {
        email = `${username.toLowerCase()}@${ADMIN_DOMAIN}`;
    }

    try {
        msg.style.display = 'none';
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (!isOwner && error.code === 'auth/invalid-credential') {
            try {
                email = `${username.toLowerCase()}@${STUDENT_DOMAIN}`;
                await signInWithEmailAndPassword(auth, email, password);
                return;
            } catch (e2) {
                // Fall through to error display
            }
        }
        msg.style.display = 'block';
        msg.textContent = error.code === 'auth/user-not-found' ? 'Account not found.' : 
                         error.code === 'auth/wrong-password' ? 'Invalid password.' : 
                         error.code === 'auth/invalid-credential' ? 'Invalid credentials.' :
                         'Login failed: ' + error.message;
        msg.className = 'login-message error';
    }
}

async function handleLogout() {
    try { await signOut(auth); showToast('Logged out', 'success'); }
    catch (error) { showToast('Logout failed', 'error'); }
}

// ============================================
// ADMIN: DASHBOARD
// ============================================
function initAdmin() {
    showAdminSection('admin-dashboard');
    loadAdminStats();
    loadRecentStudents();
    loadRecentContent();
}

async function loadAdminStats() {
    try {
        const studentsSnap = await getDocs(collection(db, 'users'));
        let total = 0, pending = 0, active = 0;
        studentsSnap.forEach(doc => {
            const d = doc.data();
            if (d.role === 'student') {
                total++;
                if (d.status === 'pending') pending++;
                if (d.status === 'active') active++;
            }
        });
        $('dash-total-students').textContent = total;
        $('dash-pending-students').textContent = pending;
        $('dash-active-students').textContent = active;
        const contentSnap = await getDocs(collection(db, 'content'));
        $('dash-total-content').textContent = contentSnap.size;
    } catch (e) { console.error('Stats error:', e); }
}

async function loadRecentStudents() {
    const container = $('recent-students-list');
    try {
        const q = query(collection(db, 'users'), where('role', '==', 'student'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        if (snap.empty) { container.innerHTML = '<div class="empty-state">No students yet</div>'; return; }
        container.innerHTML = snap.docs.slice(0, 5).map(d => {
            const s = d.data();
            return `<div class="recent-item"><div class="student-avatar" style="width:32px;height:32px;font-size:12px;">${getInitials(s.displayName || 'S')}</div><div style="flex:1;"><div style="font-weight:600;font-size:13px;">${s.displayName || 'Unknown'}</div><div style="font-size:11px;color:var(--text-light);">Grade ${s.grade || '-'} &bull; ${s.status}</div></div><div class="meta">${formatDate(s.createdAt)}</div></div>`;
        }).join('');
    } catch (e) { container.innerHTML = '<div class="empty-state">Error</div>'; }
}

async function loadRecentContent() {
    const container = $('recent-content-list');
    try {
        const q = query(collection(db, 'content'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        if (snap.empty) { container.innerHTML = '<div class="empty-state">No content</div>'; return; }
        container.innerHTML = snap.docs.slice(0, 5).map(d => {
            const c = d.data();
            return `<div class="recent-item"><i class="fas ${getContentIcon(c.contentType)}"></i><div style="flex:1;"><div style="font-weight:600;font-size:13px;">${c.title}</div><div style="font-size:11px;color:var(--text-light);">${c.subject} &bull; ${c.term}</div></div><div class="meta">${formatDate(c.createdAt)}</div></div>`;
        }).join('');
    } catch (e) { container.innerHTML = '<div class="empty-state">Error</div>'; }
}

// ============================================
// ADMIN: STUDENTS
// ============================================
function initStudentsListener() {
    if (studentsUnsub) studentsUnsub();
    const q = query(collection(db, 'users'), where('role', '==', 'student'), orderBy('createdAt', 'desc'));
    studentsUnsub = onSnapshot(q, (snap) => {
        const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.allStudents = students;
        renderStudentsTable(students);
    }, (err) => { console.error(err); showToast('Error loading students', 'error'); });
}

function renderStudentsTable(students) {
    const tbody = $('students-table-body');
    const search = ($('student-search')?.value || '').toLowerCase();
    const statusFilter = $('student-status-filter')?.value || 'all';
    let filtered = students.filter(s => {
        const matchSearch = !search || (s.displayName || '').toLowerCase().includes(search) || (s.email || '').includes(search);
        const matchStatus = statusFilter === 'all' || s.status === statusFilter;
        return matchSearch && matchStatus;
    });
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-light);">No students</td></tr>`;
        return;
    }
    tbody.innerHTML = filtered.map(s => `
        <tr><td data-label="Student"><div class="student-cell"><div class="student-avatar">${getInitials(s.displayName || 'S')}</div><div class="student-info"><div class="name">${s.displayName || 'Unknown'}</div><div class="email">${s.email || ''}</div></div></div></td>
        <td data-label="Grade">Grade ${s.grade || '-'}</td>
        <td data-label="Year">${s.year || '-'}</td>
        <td data-label="Status"><span class="status-badge status-${s.status || 'pending'}">${s.status || 'pending'}</span></td>
        <td data-label="Joined">${formatDate(s.createdAt)}</td>
        <td data-label="Actions"><div class="action-btns">
            ${s.status !== 'active' ? `<button class="btn-icon-action approve" onclick="window.approveStudent('${s.uid}')" title="Approve"><i class="fas fa-check"></i></button>` : ''}
            ${s.status !== 'blocked' ? `<button class="btn-icon-action block" onclick="window.blockStudent('${s.uid}')" title="Block"><i class="fas fa-ban"></i></button>` : ''}
            <button class="btn-icon-action delete" onclick="window.deleteStudent('${s.uid}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div></td></tr>
    `).join('');
}

async function handleAddStudent(e) {
    e.preventDefault();
    const name = $('new-stu-name').value.trim();
    const username = $('new-stu-username').value.trim().toLowerCase();
    const password = $('new-stu-password').value;
    const grade = $('new-stu-grade').value;
    const year = $('new-stu-year').value;
    if (!name || !username || !password || !grade || !year) { showToast('Fill all fields', 'error'); return; }
    const email = `${username}@${STUDENT_DOMAIN}`;
    const btn = e.submitter; btn.disabled = true;
    try {
        const existing = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
        if (!existing.empty) { showToast('Username exists', 'error'); btn.disabled = false; return; }
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, displayName: name, returnSecureToken: false })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        const uid = data.localId;
        await setDoc(doc(db, 'users', uid), {
            uid, email, displayName: name, username, role: 'student', status: 'pending', grade, year,
            createdBy: currentUser.uid, createdAt: serverTimestamp()
        });
        showToast(`Student "${name}" created! Login: ${username} / ${password}`, 'success');
        $('form-add-student').reset();
        showAdminSection('admin-students');
        loadAdminStats();
    } catch (error) { showToast('Failed: ' + error.message, 'error'); }
    finally { btn.disabled = false; }
}

window.approveStudent = async (uid) => {
    try { await updateDoc(doc(db, 'users', uid), { status: 'active' }); showToast('Approved', 'success'); }
    catch (e) { showToast('Error', 'error'); }
};
window.blockStudent = async (uid) => {
    try { await updateDoc(doc(db, 'users', uid), { status: 'blocked' }); showToast('Blocked', 'success'); }
    catch (e) { showToast('Error', 'error'); }
};
window.deleteStudent = async (uid) => {
    if (!confirm('Delete this student?')) return;
    try { await deleteDoc(doc(db, 'users', uid)); showToast('Deleted', 'success'); loadAdminStats(); }
    catch (e) { showToast('Error', 'error'); }
};

// ============================================
// OWNER: ADMINS MANAGEMENT
// ============================================
function initAdminsListener() {
    // Only owner can view admin list
    if (!currentUserData || currentUserData.role !== 'owner') return;

    if (adminsUnsub) adminsUnsub();
    const q = query(collection(db, 'users'), where('role', 'in', ['admin', 'owner']), orderBy('createdAt', 'desc'));
    adminsUnsub = onSnapshot(q, (snap) => {
        const admins = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.allAdmins = admins;
        renderAdminsTable(admins);
    }, (err) => { console.error(err); showToast('Error loading admins', 'error'); });
}

function renderAdminsTable(admins) {
    const tbody = $('admins-table-body');
    if (!admins.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-light);">No admins found</td></tr>`;
        return;
    }
    tbody.innerHTML = admins.map(a => {
        const isOwner = a.role === 'owner';
        const avatarClass = isOwner ? 'admin-avatar' : 'student-avatar';
        const rowClass = isOwner ? 'owner-row' : '';
        return `
        <tr class="${rowClass}">
            <td data-label="Admin"><div class="student-cell"><div class="${avatarClass}">${getInitials(a.displayName || 'A')}</div><div class="student-info"><div class="name">${a.displayName || 'Unknown'}</div><div class="email">${a.email || ''}</div></div></div></td>
            <td data-label="Email">${a.email || '-'}</td>
            <td data-label="Role"><span class="status-badge ${isOwner ? 'status-active' : 'status-pending'}">${isOwner ? 'Owner' : 'Admin'}</span></td>
            <td data-label="Joined">${formatDate(a.createdAt)}</td>
            <td data-label="Actions"><div class="action-btns">
                ${isOwner ? '<span style="font-size:12px;color:var(--text-light);"><i class="fas fa-lock"></i> Protected</span>' : `<button class="btn-icon-action delete" onclick="window.deleteAdmin('${a.uid}')" title="Delete Admin"><i class="fas fa-trash"></i></button>`}
            </div></td>
        </tr>`;
    }).join('');
}

async function handleAddAdmin(e) {
    e.preventDefault();

    // Only owner can add admins
    if (!currentUserData || currentUserData.role !== 'owner') {
        showToast('Only the owner can add admins', 'error');
        return;
    }

    const name = $('new-admin-name').value.trim();
    const username = $('new-admin-username').value.trim().toLowerCase();
    const password = $('new-admin-password').value;
    if (!name || !username || !password) { showToast('Fill all fields', 'error'); return; }
    if (password.length < 6) { showToast('Password min 6 chars', 'error'); return; }

    const email = `${username}@${ADMIN_DOMAIN}`;
    const btn = e.submitter; btn.disabled = true;

    try {
        const existing = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
        if (!existing.empty) { showToast('Username exists', 'error'); btn.disabled = false; return; }

        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, displayName: name, returnSecureToken: false })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const uid = data.localId;
        await setDoc(doc(db, 'users', uid), {
            uid, email, displayName: name, username, role: 'admin', status: 'active',
            createdBy: currentUser.uid, createdAt: serverTimestamp()
        });

        showToast(`Admin "${name}" created! Login: ${username} / ${password}`, 'success');
        $('form-add-admin').reset();
        showAdminSection('admin-admins');
    } catch (error) { showToast('Failed: ' + error.message, 'error'); }
    finally { btn.disabled = false; }
}

window.deleteAdmin = async (uid) => {
    // Only owner can delete admins
    if (!currentUserData || currentUserData.role !== 'owner') {
        showToast('Only the owner can delete admins', 'error');
        return;
    }

    if (!confirm('Delete this admin permanently?')) return;
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists() && userDoc.data().role === 'owner') {
            showToast('Owner cannot be deleted!', 'error');
            return;
        }
        await deleteDoc(doc(db, 'users', uid));
        showToast('Admin deleted', 'success');
    } catch (e) { showToast('Error deleting admin', 'error'); }
};

// ============================================
// ADMIN: CONTENT
// ============================================
function initContentListener() {
    if (contentUnsub) contentUnsub();
    contentUnsub = onSnapshot(collection(db, 'content'), (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.allContentItems = items;
        renderAdminContent(items);
    });
}

function renderAdminContent(items) {
    const grade = $('admin-filter-grade')?.value || '';
    const year = $('admin-filter-year')?.value || '';
    const subject = $('admin-filter-subject')?.value || '';
    const term = $('admin-filter-term')?.value || '';
    let filtered = items;
    if (grade) filtered = filtered.filter(i => i.grade === grade);
    if (year) filtered = filtered.filter(i => i.year === year);
    if (subject) filtered = filtered.filter(i => i.subject === subject);
    if (term) filtered = filtered.filter(i => i.term === term);
    const grid = $('admin-content-grid');
    if (!filtered.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No content</div>'; return; }
    grid.innerHTML = filtered.map(item => {
        const icon = getContentIcon(item.contentType);
        const color = getContentColor(item.contentType);
        const previewClass = item.contentType === 'pdf' ? 'pdf-preview' : item.contentType === 'video' ? 'youtube-preview' : item.contentType === 'link' ? 'link-preview' : '';
        const thumb = item.contentType === 'image' && item.fileData ? `<img src="${item.fileData}" alt="">` : `<i class="fas ${icon}" style="color:${color}"></i>`;
        return `<div class="glass-card content-item" onclick="window.viewContent('${item.id}')"><div class="content-preview ${previewClass}">${thumb}</div><div class="content-body"><h4>${item.title}</h4><p>${item.description || 'No description'}</p></div><div class="content-tags"><span class="tag">Grade ${item.grade}</span><span class="tag">${item.subject}</span><span class="tag">${item.term}</span><span class="tag" style="background:${color}20;color:${color};">${item.contentType}</span></div><div class="content-actions"><button class="btn btn-glass btn-sm" onclick="event.stopPropagation(); window.deleteContent('${item.id}')"><i class="fas fa-trash"></i> Delete</button></div></div>`;
    }).join('');
}

async function handleUpload(e) {
    e.preventDefault();
    const title = $('up-title').value.trim();
    const description = $('up-desc').value.trim();
    const grade = $('up-grade').value;
    const year = $('up-year').value;
    const subject = $('up-subject').value;
    const term = $('up-term').value;
    const contentType = $('up-type').value;
    if (!title || !grade || !year || !subject || !term) { showToast('Fill all fields', 'error'); return; }
    const btn = e.submitter; btn.disabled = true;
    try {
        let fileData = '', fileName = '', fileType = '', externalUrl = '';
        if (contentType === 'file') {
            const fileInput = $('up-file');
            const file = fileInput.files[0];
            if (!file) { showToast('Select a file', 'error'); btn.disabled = false; return; }
            if (file.size > MAX_FILE_SIZE) { showToast(`File too large (${(file.size/1024).toFixed(0)}KB). Max: 800KB.`, 'error'); btn.disabled = false; return; }
            fileData = await fileToBase64(file); fileName = file.name; fileType = file.type;
        } else {
            externalUrl = $('up-url').value.trim();
            if (!externalUrl) { showToast('Enter a URL', 'error'); btn.disabled = false; return; }
            if (contentType === 'video') externalUrl = getYouTubeEmbedUrl(externalUrl);
        }
        await setDoc(doc(collection(db, 'content')), {
            title, description, grade, year, subject, term, contentType,
            fileData, fileName, fileType, externalUrl,
            uploadedBy: currentUser.uid, createdAt: serverTimestamp()
        });
        showToast('Content saved!', 'success');
        $('form-upload').reset();
        $('file-selected-name').textContent = '';
        toggleUploadType();
        showAdminSection('admin-content');
        loadAdminStats();
    } catch (error) { showToast('Error: ' + error.message, 'error'); }
    finally { btn.disabled = false; }
}

window.deleteContent = async (id) => {
    if (!confirm('Delete this content?')) return;
    try { await deleteDoc(doc(db, 'content', id)); showToast('Deleted', 'success'); loadAdminStats(); }
    catch (e) { showToast('Error', 'error'); }
};

// ============================================
// STUDENT
// ============================================
function initStudent() {
    showStudentView('student-view-materials');
    loadStudentContent();
}

function loadStudentContent() {
    if (contentUnsub) contentUnsub();
    contentUnsub = onSnapshot(collection(db, 'content'), (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.allContentItems = items;
        renderStudentContent(items);
    });
}

function renderStudentContent(items) {
    const grade = $('stu-filter-grade')?.value || '';
    const year = $('stu-filter-year')?.value || '';
    const subject = $('stu-filter-subject')?.value || '';
    const term = $('stu-filter-term')?.value || '';
    let filtered = items;
    if (grade) filtered = filtered.filter(i => i.grade === grade);
    if (year) filtered = filtered.filter(i => i.year === year);
    if (subject) filtered = filtered.filter(i => i.subject === subject);
    if (term) filtered = filtered.filter(i => i.term === term);
    const grid = $('student-content-grid');
    $('content-count-badge').textContent = `${filtered.length} items`;
    if (!filtered.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No materials</div>'; return; }
    grid.innerHTML = filtered.map(item => {
        const icon = getContentIcon(item.contentType);
        const color = getContentColor(item.contentType);
        const previewClass = item.contentType === 'pdf' ? 'pdf-preview' : item.contentType === 'video' ? 'youtube-preview' : item.contentType === 'link' ? 'link-preview' : '';
        const thumb = item.contentType === 'image' && item.fileData ? `<img src="${item.fileData}" alt="">` : `<i class="fas ${icon}" style="color:${color}"></i>`;
        return `<div class="glass-card content-item" onclick="window.viewContent('${item.id}')"><div class="content-preview ${previewClass}">${thumb}</div><div class="content-body"><h4>${item.title}</h4><p>${item.description || 'No description'}</p></div><div class="content-tags"><span class="tag">Grade ${item.grade}</span><span class="tag">${item.subject}</span><span class="tag">${item.term}</span><span class="tag" style="background:${color}20;color:${color};">${item.contentType}</span></div></div>`;
    }).join('');
}

// ============================================
// VIEW CONTENT MODAL
// ============================================
window.viewContent = async (id) => {
    try {
        const docSnap = await getDoc(doc(db, 'content', id));
        if (!docSnap.exists()) { showToast('Not found', 'error'); return; }
        const c = docSnap.data();
        $('view-content-title').textContent = c.title;
        $('view-content-desc').textContent = c.description || 'No description.';
        const mediaContainer = $('view-content-media');
        const downloadBtn = $('view-content-download');
        if (c.contentType === 'image' && c.fileData) {
            mediaContainer.innerHTML = `<img src="${c.fileData}" style="max-width:100%;max-height:400px;object-fit:contain;">`;
            downloadBtn.style.display = 'inline-flex'; downloadBtn.href = c.fileData; downloadBtn.download = c.fileName || 'image';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
        } else if (c.contentType === 'pdf' && c.fileData) {
            mediaContainer.innerHTML = `<embed src="${c.fileData}" type="application/pdf" style="width:100%;height:400px;">`;
            downloadBtn.style.display = 'inline-flex'; downloadBtn.href = c.fileData; downloadBtn.download = c.fileName || 'document.pdf';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download PDF';
        } else if (c.contentType === 'video') {
            mediaContainer.innerHTML = `<iframe src="${c.externalUrl}" frameborder="0" allowfullscreen style="width:100%;height:400px;"></iframe>`;
            downloadBtn.style.display = 'none';
        } else if (c.contentType === 'link') {
            mediaContainer.innerHTML = `<div style="text-align:center;padding:60px 20px;"><i class="fas fa-external-link-alt" style="font-size:64px;color:var(--success);"></i><p style="margin-top:20px;font-size:16px;">External Resource</p></div>`;
            downloadBtn.style.display = 'inline-flex'; downloadBtn.href = c.externalUrl; downloadBtn.target = '_blank';
            downloadBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> Open Link';
        } else { mediaContainer.innerHTML = '<div class="empty-state">No preview</div>'; downloadBtn.style.display = 'none'; }
        $('view-content-tags').innerHTML = `<span class="tag">Grade ${c.grade}</span><span class="tag">${c.year}</span><span class="tag">${c.subject}</span><span class="tag">${c.term}</span><span class="tag">${c.contentType}</span>`;
        openModal('modal-view-content');
    } catch (e) { showToast('Error loading', 'error'); }
};

// ============================================
// SETTINGS
// ============================================
async function loadAdminSettings() {
    if (!currentUserData) return;
    $('admin-setting-name').value = currentUserData.displayName || '';
    $('admin-setting-email').value = currentUserData.email || '';
    $('admin-default-grade').value = currentUserData.defaultGrade || '';
    $('admin-default-year').value = currentUserData.defaultYear || '';
}

async function handleAdminProfileUpdate(e) {
    e.preventDefault();
    const name = $('admin-setting-name').value.trim();
    if (!name) return;
    try { await updateDoc(doc(db, 'users', currentUser.uid), { displayName: name }); showToast('Updated', 'success'); }
    catch (e) { showToast('Failed', 'error'); }
}

async function handleAdminPasswordChange(e) {
    e.preventDefault();
    const newPass = $('admin-new-password').value;
    if (!newPass || newPass.length < 6) { showToast('Min 6 chars', 'error'); return; }
    try { await updatePassword(currentUser, newPass); $('admin-new-password').value = ''; showToast('Changed', 'success'); }
    catch (e) { showToast('Failed: ' + e.message, 'error'); }
}

async function loadStudentSettings() {
    if (!currentUserData) return;
    $('stu-setting-name').value = currentUserData.displayName || '';
    $('stu-setting-email').value = currentUserData.email || '';
    $('stu-setting-grade').value = 'Grade ' + (currentUserData.grade || '-');
}

async function handleStudentProfileUpdate(e) {
    e.preventDefault();
    const name = $('stu-setting-name').value.trim();
    if (!name) return;
    try { await updateDoc(doc(db, 'users', currentUser.uid), { displayName: name }); showToast('Updated', 'success'); }
    catch (e) { showToast('Failed', 'error'); }
}

async function handleStudentPasswordChange(e) {
    e.preventDefault();
    const newPass = $('stu-new-password').value;
    if (!newPass || newPass.length < 6) { showToast('Min 6 chars', 'error'); return; }
    try { await updatePassword(currentUser, newPass); $('stu-new-password').value = ''; showToast('Changed', 'success'); }
    catch (e) { showToast('Failed: ' + e.message, 'error'); }
}

// ============================================
// AUTH STATE
// ============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (userDoc.exists()) {
            currentUserData = userDoc.data();
            // FORCE OWNER ROLE for Osama — fix role if it was saved wrong
            if (user.email === OWNER_EMAIL && currentUserData.role !== 'owner') {
                currentUserData.role = 'owner';
                await updateDoc(doc(db, 'users', user.uid), { 
                    role: 'owner', 
                    displayName: 'Osama' 
                });
            }
        } else {
            // First login - create user doc
            if (user.email === OWNER_EMAIL) {
                currentUserData = { uid: user.uid, email: user.email, displayName: 'Osama', role: 'owner', createdAt: serverTimestamp() };
                await setDoc(doc(db, 'users', user.uid), currentUserData);
            } else {
                showToast('User not found', 'error');
                await signOut(auth); return;
            }
        }

        const role = currentUserData.role || 'student';

        // Update sidebar badge
        const badge = $('admin-role-badge');
        if (badge) {
            badge.textContent = role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Student';
            badge.className = 'role-badge ' + (role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : '');
        }

        // Show/hide Owner-only "Admins" nav link
        const adminsNav = $('nav-admins');
        if (adminsNav) {
            adminsNav.style.display = role === 'owner' ? 'flex' : 'none';
        }

        // Update display name
        $('admin-display-name').textContent = currentUserData.displayName || 'User';

        if (role === 'owner' || role === 'admin') {
            showView('admin-layout');
            initAdmin();
            initStudentsListener();
            initContentListener();
            loadAdminSettings();
            if (role === 'owner') initAdminsListener();
        } else {
            if (currentUserData.status === 'blocked') { showToast('Account blocked.', 'error'); await signOut(auth); return; }
            if (currentUserData.status === 'pending') { showToast('Pending approval.', 'info'); }
            showView('student-layout');
            initStudent();
            loadStudentSettings();
        }
    } else {
        currentUser = null; currentUserData = null;
        if (studentsUnsub) { studentsUnsub(); studentsUnsub = null; }
        if (adminsUnsub) { adminsUnsub(); adminsUnsub = null; }
        if (contentUnsub) { contentUnsub(); contentUnsub = null; }
        showView('login-view');
        $('login-form').reset();
        $('login-message').style.display = 'none';
    }
});

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    populateSelects();

    $('login-form').addEventListener('submit', handleLogin);

    // Admin nav
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showAdminSection(link.dataset.target);
            if (link.dataset.target === 'admin-dashboard') { loadAdminStats(); loadRecentStudents(); loadRecentContent(); }
        });
    });

    // Mobile sidebar
    $('mobile-menu-toggle').addEventListener('click', toggleMobileSidebar);
    $('mobile-close-sidebar').addEventListener('click', closeMobileSidebar);
    document.addEventListener('click', (e) => {
        const sidebar = $('admin-sidebar');
        const toggle = $('mobile-menu-toggle');
        if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !toggle.contains(e.target)) closeMobileSidebar();
    });

    // Logout
    $('btn-admin-logout').addEventListener('click', handleLogout);
    $('btn-student-logout').addEventListener('click', handleLogout);

    // Student nav
    $('btn-student-home').addEventListener('click', () => showStudentView('student-view-materials'));
    $('btn-student-settings').addEventListener('click', () => showStudentView('student-view-settings'));

    // Navigate to pages
    $('btn-go-add-student').addEventListener('click', () => showAdminSection('admin-add-student'));
    $('btn-go-add-content').addEventListener('click', () => showAdminSection('admin-add-content'));
    $('btn-go-add-admin').addEventListener('click', () => showAdminSection('admin-add-admin'));

    // Back buttons
    $('btn-back-from-add-student').addEventListener('click', () => showAdminSection('admin-students'));
    $('btn-cancel-add-student').addEventListener('click', () => showAdminSection('admin-students'));
    $('btn-back-from-add-content').addEventListener('click', () => showAdminSection('admin-content'));
    $('btn-cancel-add-content').addEventListener('click', () => showAdminSection('admin-content'));
    $('btn-back-from-add-admin').addEventListener('click', () => showAdminSection('admin-admins'));
    $('btn-cancel-add-admin').addEventListener('click', () => showAdminSection('admin-admins'));

    // Forms
    $('form-add-student').addEventListener('submit', handleAddStudent);
    $('form-upload').addEventListener('submit', handleUpload);
    $('form-add-admin').addEventListener('submit', handleAddAdmin);
    $('up-type').addEventListener('change', toggleUploadType);

    // File drop zone
    const dropZone = $('file-drop-zone');
    const fileInput = $('up-file');
    const fileNameDisplay = $('file-selected-name');
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length) { fileInput.files = files; fileNameDisplay.textContent = `Selected: ${files[0].name} (${(files[0].size/1024).toFixed(1)}KB)`; }
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) fileNameDisplay.textContent = `Selected: ${fileInput.files[0].name} (${(fileInput.files[0].size/1024).toFixed(1)}KB)`;
        });
    }

    // Modal close
    document.querySelectorAll('.btn-close-modal').forEach(btn => btn.addEventListener('click', closeModals));
    $('modal-overlay').addEventListener('click', (e) => { if (e.target === $('modal-overlay')) closeModals(); });

    // Filters - Admin
    $('btn-admin-clear-filters').addEventListener('click', () => {
        $('admin-filter-grade').value = ''; $('admin-filter-year').value = ''; $('admin-filter-subject').value = ''; $('admin-filter-term').value = '';
        renderAdminContent(window.allContentItems || []);
    });
    ['admin-filter-grade', 'admin-filter-year', 'admin-filter-subject', 'admin-filter-term'].forEach(id => {
        $(id)?.addEventListener('change', () => renderAdminContent(window.allContentItems || []));
    });

    // Filters - Student
    $('btn-stu-apply-filters').addEventListener('click', () => { renderStudentContent(window.allContentItems || []); closeMobileFilters(); });
    $('btn-stu-clear-filters').addEventListener('click', () => {
        $('stu-filter-grade').value = ''; $('stu-filter-year').value = ''; $('stu-filter-subject').value = ''; $('stu-filter-term').value = '';
        renderStudentContent(window.allContentItems || []);
    });

    // Mobile filter toggle
    $('mobile-filter-toggle').addEventListener('click', toggleMobileFilters);
    $('mobile-close-filters').addEventListener('click', closeMobileFilters);
    document.addEventListener('click', (e) => {
        const filters = $('student-filters');
        const toggle = $('mobile-filter-toggle');
        if (filters.classList.contains('open') && !filters.contains(e.target) && !toggle.contains(e.target)) closeMobileFilters();
    });

    // Search
    $('student-search')?.addEventListener('input', () => { if (window.allStudents) renderStudentsTable(window.allStudents); });
    $('student-status-filter')?.addEventListener('change', () => { if (window.allStudents) renderStudentsTable(window.allStudents); });

    // Settings
    $('admin-profile-form')?.addEventListener('submit', handleAdminProfileUpdate);
    $('admin-security-form')?.addEventListener('submit', handleAdminPasswordChange);
    $('student-profile-form')?.addEventListener('submit', handleStudentProfileUpdate);
    $('student-security-form')?.addEventListener('submit', handleStudentPasswordChange);
});
