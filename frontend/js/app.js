let currentUser = null;
let searchCount = parseInt(localStorage.getItem('searchCount') || '0');

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initApp();
    setupUploadZone();
    setupKeyboardShortcuts();
});

function initTheme() {
    if (localStorage.getItem('onyxTheme') === 'light') {
        document.documentElement.classList.add('light-theme');
    }
}

function toggleTheme() {
    const isLight = document.documentElement.classList.toggle('light-theme');
    localStorage.setItem('onyxTheme', isLight ? 'light' : 'dark');
}

function togglePasswordVisibility(inputId, btnElement) {
    const input = document.getElementById(inputId);
    const eyeOpen = '<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3.5"/></svg>';
    const eyeClosed = '<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3.5 3.5 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    
    if (input.type === 'password') {
        input.type = 'text';
        btnElement.innerHTML = eyeClosed;
    } else {
        input.type = 'password';
        btnElement.innerHTML = eyeOpen;
    }
}

function initApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');
    const resetToken = urlParams.get('reset_token');

    if (resetToken) {
        document.getElementById('reset-token').value = resetToken;
        openModal('reset-password-modal');
        window.history.replaceState({}, document.title, "/");
    }

    if (token) {
        localStorage.setItem('token', token);
        if (typeof api !== 'undefined') api.token = token;
        window.history.replaceState({}, document.title, "/");
        showToast('Login com Google efetuado com sucesso!', 'success');
    }

    if (error) {
        window.history.replaceState({}, document.title, "/");
        showToast('Erro ao entrar com Google. Tente novamente.', 'error');
    }

    if (api.isAuthenticated()) {
        showDashboard();
    } else {
        showAuth();
    }

    const regPwd = document.getElementById('register-password');
    if (regPwd) {
        regPwd.addEventListener('input', (e) => checkPasswordRequirements(e.target.value, ''));
    }
    const resetPwd = document.getElementById('reset-password');
    if (resetPwd) {
        resetPwd.addEventListener('input', (e) => checkPasswordRequirements(e.target.value, 'reset-'));
    }
}

function showAuth() {
    document.getElementById('auth-view').classList.add('active');
    document.getElementById('dashboard-view').classList.remove('active');
}

function showDashboard() {
    document.getElementById('auth-view').classList.remove('active');
    document.getElementById('dashboard-view').classList.add('active');
    loadProfile();
    navigateZettel('dashboard');
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`${tab}-form`).classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
        showToast('Preencha todos os campos!', 'error');
        return;
    }

    btn.classList.add('loading');
    try {
        await api.login(username, password);
        showToast(`Bem-vindo, ${username}!`, 'success');
        showDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.classList.remove('loading');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    const email = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;

    if (!email || !password) {
        showToast('Preencha todos os campos!', 'error');
        return;
    }

    if (!checkPasswordRequirements(password, '')) {
        showToast('A senha não cumpre os requisitos mínimos de segurança!', 'error');
        return;
    }

    btn.classList.add('loading');
    try {
        await api.register(email, password);
        showToast('Conta criada com sucesso! Fazendo login...', 'success');
        await api.login(email, password);
        showDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.classList.remove('loading');
    }
}

function handleLogout() {
    api.logout();
    currentUser = null;
    document.querySelectorAll('input').forEach(i => i.value = '');
    showAuth();
    showToast('Sessão terminada. Até breve!', 'info');
}

async function loadProfile() {
    try {
        const data = await api.getProfile();
        currentUser = data.usuario;
        document.getElementById('user-name').textContent = currentUser;
        document.getElementById('user-avatar').textContent = currentUser.charAt(0).toUpperCase();
    } catch (err) {
        console.error('Erro ao carregar perfil:', err);
    }
}

function toggleZettelSidebar() {
    const layout = document.getElementById('zettel-layout');
    if (layout) {
        layout.classList.toggle('sidebar-collapsed');
    }
}

function navigateZettel(viewName) {
    document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
        const isTarget = item.getAttribute('data-view') === viewName;
        item.classList.toggle('active', isTarget);
    });

    document.querySelectorAll('.zettel-view').forEach(v => v.classList.remove('active'));

    if (viewName === 'dashboard') {
        document.getElementById('view-dashboard').classList.add('active');
        loadNotesAndRenderDashboard();
    } else if (viewName === 'search') {
        document.getElementById('view-search').classList.add('active');
        const input = document.getElementById('main-search-input');
        if (input) setTimeout(() => input.focus(), 100);
    } else if (viewName === 'editor') {
        document.getElementById('view-editor').classList.add('active');
    } else if (viewName === 'databases') {
        document.getElementById('view-databases').classList.add('active');
        loadDocuments();
    } else {
        document.getElementById('view-generic').classList.add('active');
        setupGenericView(viewName);
    }
}

function setupUploadZone() {
    const zone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');

    if (!zone || !fileInput) return;

    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFileUpload(e.target.files[0]);
    });
}

function triggerFileUpload() {
    document.getElementById('file-input').click();
}

function triggerDocsUpload() {
    const docsInput = document.getElementById('file-input-docs');
    if (docsInput) docsInput.click();
    else triggerFileUpload();
}

async function handleFileUpload(file) {
    if (!file) return;

    const progress = document.getElementById('upload-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    progress.style.display = 'block';
    progressFill.style.width = '30%';
    progressText.textContent = `Enviando "${file.name}"...`;

    try {
        progressFill.style.width = '60%';
        progressText.textContent = 'Processando arquivo...';

        const result = await api.uploadFile(file);

        progressFill.style.width = '100%';
        progressText.textContent = `${result.mensagem} (${result.total_chunks} chunks)`;

        showToast(`Documento "${file.name}" enviado com sucesso!`, 'success');
        loadDocuments();
        updateDocCount();

        setTimeout(() => {
            progress.style.display = 'none';
            progressFill.style.width = '0%';
        }, 3000);
    } catch (err) {
        progressFill.style.width = '0%';
        progressText.textContent = `Erro: ${err.message}`;
        showToast(`Erro ao enviar: ${err.message}`, 'error');

        setTimeout(() => {
            progress.style.display = 'none';
        }, 4000);
    }

    document.getElementById('file-input').value = '';
    const docsInput = document.getElementById('file-input-docs');
    if (docsInput) docsInput.value = '';
}

async function loadDocuments() {
    const container = document.getElementById('documents-list');
    const emptyState = document.getElementById('empty-docs');

    try {
        const data = await api.getDocuments();
        const docs = data.documentos || [];

        const statDocs = document.getElementById('stat-docs');
        if (statDocs) statDocs.textContent = docs.length;

        if (docs.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.style.display = 'grid';

        const imagesToLoad = [];
        const svgImage = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
        const svgDoc = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';
        const svgEye = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        const svgEdit = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
        const svgDownload = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
        const svgSearch = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        const svgTrash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

        container.innerHTML = docs.map((doc, i) => {
            const isImage = doc.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            if (isImage) imagesToLoad.push(doc.doc_id);

            return `
            <div class="doc-card" style="animation-delay: ${i * 0.1}s">
                ${isImage
                    ? `<img id="img-thumb-${doc.doc_id}" class="doc-icon-thumb" src="/favicon.ico" alt="Thumbnail" />`
                    : `<div class="doc-icon">${doc.has_text === false ? svgImage : svgDoc}</div>`
                }
                <div class="doc-name">${escapeHtml(doc.filename)}</div>
                <div class="doc-meta">ID: ${doc.doc_id.substring(0, 8)}...</div>
                <div class="doc-actions">
                    <button class="btn btn-ghost btn-sm" onclick="previewFileUI('${doc.doc_id}', '${escapeHtml(doc.filename)}')" title="Abrir ficheiro">
                        ${svgEye}
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="renameDocumentUI('${doc.doc_id}', '${escapeHtml(doc.filename)}')" title="Renomear ficheiro">
                        ${svgEdit}
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="downloadFileUI('${doc.doc_id}', '${escapeHtml(doc.filename)}')" title="Baixar">
                        ${svgDownload}
                    </button>
                    ${doc.has_text !== false ? `<button class="btn btn-ghost btn-sm" onclick="searchInDoc('${escapeHtml(doc.filename)}')">
                        ${svgSearch} Pesquisar
                    </button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteDocument('${doc.doc_id}', '${escapeHtml(doc.filename)}')">
                        ${svgTrash} Apagar
                    </button>
                </div>
            </div>
        `;
        }).join('');

        imagesToLoad.forEach(id => {
            loadImageThumbnail(id, `img-thumb-${id}`);
        });

    } catch (err) {
        container.innerHTML = `
            <div class="empty-state glass-card" style="grid-column: 1 / -1;">
                <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
                <h3>Erro ao carregar documentos</h3>
                <p>${escapeHtml(err.message)}</p>
                <button class="btn btn-primary" onclick="loadDocuments()">Tentar novamente</button>
            </div>
        `;
    }
}

async function deleteDocument(docId, filename) {
    if (!confirm(`Tem certeza que quer apagar "${filename}"?`)) return;

    try {
        await api.deleteDocument(docId);
        showToast(`Documento "${filename}" apagado!`, 'success');
        loadDocuments();
    } catch (err) {
        showToast(`Erro ao apagar: ${err.message}`, 'error');
    }
}

async function downloadFileUI(docId, filename) {
    try {
        await api.downloadFile(docId, filename);
        showToast(`Download de "${filename}" iniciado!`, 'success');
    } catch (err) {
        showToast(`Erro ao baixar: ${err.message}`, 'error');
    }
}

async function previewFileUI(docId, filename) {
    try {
        await api.previewFile(docId);
        showToast(`Abrindo "${filename}"...`, 'success');
    } catch (err) {
        showToast(`Erro ao abrir: ${err.message}`, 'error');
    }
}

async function renameDocumentUI(docId, oldName) {
    const newName = window.prompt("Insira o novo nome para o arquivo:", oldName);
    if (!newName || newName === oldName) return;

    try {
        await api.renameDocument(docId, newName);
        showToast(`Documento renomeado para "${newName}"!`, 'success');
        loadDocuments();
    } catch (err) {
        showToast(`Erro ao renomear: ${err.message}`, 'error');
    }
}

async function loadImageThumbnail(docId, imgElementId) {
    try {
        const url = `${API_BASE}/download/${docId}`;
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${api.token}` } });
        if (response.ok) {
            const blob = await response.blob();
            const objectUrl = window.URL.createObjectURL(blob);
            const imgEl = document.getElementById(imgElementId);
            if (imgEl) {
                imgEl.src = objectUrl;
            }
        }
    } catch (e) {
        console.error("Falha ao carregar thumbnail:", e);
    }
}

function searchInDoc(filename) {
    navigateZettel('search');
    const input = document.getElementById('main-search-input');
    if (input) {
        input.value = '';
        input.placeholder = `Pesquisar em "${filename}"...`;
        input.focus();
    }
}

async function updateDocCount() {
    try {
        const data = await api.getDocuments();
        const statDocs = document.getElementById('stat-docs');
        if (statDocs) statDocs.textContent = (data.documentos || []).length;
    } catch (e) { }
}

let currentNoteId = null;
let noteSaveTimeout = null;
let currentDashboardFilter = 'Recente';

async function loadNotesAndRenderDashboard() {
    try {
        const data = await api.getNotes();
        window.cachedNotes = data.notas || [];
    } catch (err) {
        window.cachedNotes = window.cachedNotes || [];
    }

    if (!window.cachedNotes || window.cachedNotes.length === 0) {
        window.cachedNotes = [
            { id: 'sample-1', title: 'Literatura sobre Sistemas Complexos', content: 'Crescimento acelerado sem estrutura...', category: 'Literatura', updated_at: new Date().toISOString() },
            { id: 'sample-2', title: 'Permanente: Arquitetura de Software', content: 'Dificuldade na retenção de talentos...', category: 'Permanente', updated_at: new Date().toISOString() },
            { id: 'sample-3', title: 'Permanente: Princípios de Design Minimalista', content: 'Mudança no comportamento do consumidor...', category: 'Permanente', updated_at: new Date().toISOString() },
            { id: 'sample-4', title: 'Permanente: Gestão Conhecimento Zettelkasten', content: 'Dependência excessiva de um único canal...', category: 'Permanente', updated_at: new Date().toISOString() },
            { id: 'sample-5', title: 'Pensamento: Reflexões sobre IA', content: 'Managing multiple projects at the same time...', category: 'Pensamento', updated_at: new Date().toISOString() },
            { id: 'sample-6', title: 'Pensamento: Organização Pessoal', content: 'Managing multiple projects at the same time...', category: 'Pensamento', updated_at: new Date().toISOString() }
        ];
    }

    renderDashboardNotes(currentDashboardFilter);
    renderNotebooksGrid();
    renderTimelineEvents();
}

function filterDashboardNotes(category, btnElement) {
    currentDashboardFilter = category;
    if (btnElement) {
        btnElement.parentElement.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    }
    renderDashboardNotes(category);
}

function renderDashboardNotes(filterCategory = 'Recente') {
    const container = document.getElementById('dashboard-notes-list');
    if (!container) return;

    let notes = window.cachedNotes || [];
    if (filterCategory === 'Inbox') {
        notes = notes.filter(n => n.category === 'Pensamento' || n.category === 'Nota Passageira');
    } else if (filterCategory === 'Favoritos') {
        notes = notes.filter(n => n.category === 'Permanente' || n.category === 'Nota Permanente');
    } else if (filterCategory === 'Tópicos') {
        notes = notes.filter(n => n.category === 'Literatura' || n.category === 'Nota de Leitura');
    }

    if (notes.length === 0) {
        container.innerHTML = '<div style="padding: 1rem; color: var(--text-tertiary); text-align: center;">Nenhuma nota nesta categoria.</div>';
        return;
    }

    container.innerHTML = notes.map(note => {
        const cat = note.category || (note.title.toLowerCase().includes('literatura') ? 'Literatura' : (note.title.toLowerCase().includes('pensamento') ? 'Pensamento' : 'Permanente'));
        let iconSvg = '<svg class="note-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
        if (cat.includes('Literatura') || cat.includes('Leitura')) {
            iconSvg = '<svg class="note-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
        } else if (cat.includes('Pensamento') || cat.includes('Passageira')) {
            iconSvg = '<svg class="note-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
        }

        return `
            <div class="note-row" onclick="openNote('${note.id}')">
                <div class="note-row-left">
                    ${iconSvg}
                    <span class="note-row-title">${escapeHtml(note.title)}</span>
                </div>
                <span class="tag-badge">${escapeHtml(cat)}</span>
            </div>
        `;
    }).join('');
}

function renderNotebooksGrid() {
    const container = document.getElementById('dashboard-notebooks-grid');
    if (!container) return;

    const notebooks = [
        { title: 'Caderno de Projetos', count: '2 Notes' },
        { title: 'Caderno de Leitura', count: '3 Notes' },
        { title: 'Caderno de Ideias', count: '1 Notes' }
    ];

    container.innerHTML = notebooks.map(nb => `
        <div class="notebook-card" onclick="navigateZettel('cadernos')">
            <div class="notebook-card-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                <span>${escapeHtml(nb.title)}</span>
            </div>
            <span class="notebook-card-count">${nb.count}</span>
        </div>
    `).join('');
}

function renderTimelineEvents() {
    const container = document.getElementById('timeline-events-list');
    if (!container) return;

    const notes = window.cachedNotes || [];
    container.innerHTML = notes.slice(0, 4).map(n => `
        <div class="note-row" onclick="openNote('${n.id}')">
            <div class="note-row-left">
                <svg class="note-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="15" height="15"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span class="note-row-title">${escapeHtml(n.title)}</span>
            </div>
            <span class="tag-badge">${new Date(n.updated_at || Date.now()).toLocaleDateString()}</span>
        </div>
    `).join('');
}

function setupGenericView(viewName) {
    const titleEl = document.getElementById('generic-page-title');
    const iconEl = document.getElementById('generic-hero-icon');
    const container = document.getElementById('generic-content-container');
    const subtabLabel = document.getElementById('generic-subtab-label');

    const viewConfigs = {
        'recente': {
            title: 'Recente',
            icon: '<svg class="pencil-giant-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="44" height="44"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 16 14"/></svg>',
            mode: 'list'
        },
        'inbox': {
            title: 'Inbox',
            icon: '<svg class="pencil-giant-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="44" height="44"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
            mode: 'gallery'
        },
        'para-revisar': {
            title: 'Para Revisar',
            icon: '<svg class="pencil-giant-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="44" height="44"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
            mode: 'gallery'
        },
        'favoritos': {
            title: 'Favoritos',
            icon: '<svg class="pencil-giant-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="44" height="44"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
            mode: 'gallery'
        },
        'cadernos': {
            title: 'Cadernos',
            icon: '<svg class="pencil-giant-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="44" height="44"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
            mode: 'gallery'
        },
        'topicos': {
            title: 'Tópicos',
            icon: '<svg class="pencil-giant-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="44" height="44"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
            mode: 'list'
        },
        'timeline': {
            title: 'Timeline',
            icon: '<svg class="pencil-giant-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="44" height="44"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
            mode: 'list'
        },
        'todas-notas': {
            title: 'Todas as Notas',
            icon: '<svg class="pencil-giant-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="44" height="44"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
            mode: 'list'
        }
    };

    const cfg = viewConfigs[viewName] || { title: viewName, icon: '<svg class="pencil-giant-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="44" height="44"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>', mode: 'list' };

    titleEl.textContent = cfg.title;
    iconEl.innerHTML = cfg.icon;
    subtabLabel.innerHTML = cfg.mode === 'gallery'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Galeria'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg> Lista';

    const notes = window.cachedNotes || [];

    if (cfg.mode === 'gallery') {
        container.className = 'gallery-cards-grid';
        container.innerHTML = notes.map(note => {
            const cat = note.category || 'Permanente';
            return `
                <div class="gallery-card" onclick="openNote('${note.id}')">
                    <div class="gallery-card-body">
                        <div class="gallery-card-title">${escapeHtml(note.title)}</div>
                        <div class="gallery-card-snippet">${escapeHtml(note.content || 'Sem conteúdo')}</div>
                    </div>
                    <div class="gallery-card-footer">
                        <span class="tag-badge">${escapeHtml(cat)}</span>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        container.className = 'notes-list-view';
        container.innerHTML = notes.map(note => {
            const cat = note.category || 'Permanente';
            return `
                <div class="note-row" onclick="openNote('${note.id}')">
                    <div class="note-row-left">
                        <svg class="note-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span class="note-row-title">${escapeHtml(note.title)}</span>
                    </div>
                    <span class="tag-badge">${escapeHtml(cat)}</span>
                </div>
            `;
        }).join('');
    }
}

function quickCreateNote(typeCategory) {
    createNewNote(typeCategory);
}

function createNewNote(category = 'Nota Passageira') {
    currentNoteId = null;
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
    const catSelect = document.getElementById('note-category-select');
    if (catSelect) catSelect.value = category;

    navigateZettel('editor');
    document.getElementById('note-title').focus();
    saveNote(true);
}

function openNote(id) {
    const note = window.cachedNotes?.find(n => String(n.id) === String(id));
    if (!note) return;

    currentNoteId = note.id;
    document.getElementById('note-title').value = note.title;
    document.getElementById('note-content').value = note.content || '';
    const catSelect = document.getElementById('note-category-select');
    if (catSelect) catSelect.value = note.category || 'Nota Permanente';

    navigateZettel('editor');
}

function handleNoteInput() {
    const indicator = document.getElementById('autosave-indicator');
    if (indicator) {
        indicator.textContent = 'Salvando...';
        indicator.className = 'autosave-indicator saving';
    }

    clearTimeout(noteSaveTimeout);
    noteSaveTimeout = setTimeout(() => saveNote(false), 1000);
}

async function saveNote(isNew = false) {
    const title = document.getElementById('note-title').value.trim() || 'Nova Anotação';
    const content = document.getElementById('note-content').value;
    const catSelect = document.getElementById('note-category-select');
    const category = catSelect ? catSelect.value : 'Nota Passageira';
    const indicator = document.getElementById('autosave-indicator');

    if (indicator) {
        indicator.textContent = 'Salvando...';
        indicator.className = 'autosave-indicator saving';
    }

    try {
        if (!currentNoteId || isNew || String(currentNoteId).startsWith('sample')) {
            const result = await api.createNote(title, content);
            currentNoteId = result.nota ? result.nota.id : result.doc_id;
        } else {
            await api.updateNote(currentNoteId, title, content);
        }

        if (indicator) {
            indicator.textContent = '✓ Salvo automaticamente';
            indicator.className = 'autosave-indicator saved';
        }

        const existing = window.cachedNotes?.find(n => String(n.id) === String(currentNoteId));
        if (existing) {
            existing.title = title;
            existing.content = content;
            existing.category = category;
        } else {
            window.cachedNotes = window.cachedNotes || [];
            window.cachedNotes.unshift({ id: currentNoteId, title, content, category, updated_at: new Date().toISOString() });
        }
    } catch (err) {
        if (indicator) {
            indicator.textContent = 'Erro ao salvar';
            indicator.className = 'autosave-indicator saving';
        }
    }
}

async function handleDeleteCurrentNote() {
    if (!currentNoteId) return;
    if (!confirm('Tem a certeza que quer apagar esta anotação?')) return;

    try {
        if (!String(currentNoteId).startsWith('sample')) {
            await api.deleteNote(currentNoteId);
        }
        showToast('Anotação apagada com sucesso!', 'success');

        window.cachedNotes = (window.cachedNotes || []).filter(n => String(n.id) !== String(currentNoteId));
        currentNoteId = null;
        navigateZettel('dashboard');
    } catch (err) {
        showToast('Erro ao apagar: ' + err.message, 'error');
    }
}

async function handleQuickSearch() {
    const input = document.getElementById('quick-search-input');
    const query = input.value.trim();
    if (!query) {
        showToast('Escreva uma pergunta para pesquisar!', 'error');
        return;
    }
    await performSearch(query, 'quick-search-results');
}

async function handleMainSearch() {
    const input = document.getElementById('main-search-input');
    const btn = document.getElementById('main-search-btn');
    const query = input.value.trim();
    if (!query) {
        showToast('Escreva uma pergunta para pesquisar!', 'error');
        return;
    }
    btn.classList.add('loading');
    await performSearch(query, 'main-search-results');
    btn.classList.remove('loading');
}

async function performSearch(query, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Pesquisando no seu Onyx Note...</p>
        </div>
    `;

    try {
        const data = await api.search(query);
        searchCount++;
        localStorage.setItem('searchCount', searchCount.toString());
        const statElem = document.getElementById('stat-searches');
        if (statElem) statElem.textContent = searchCount;

        if (!data.resultados || data.resultados.length === 0) {
            container.innerHTML = `
                <div class="result-card">
                    <p class="result-text" style="text-align:center;">
                        Nenhum resultado encontrado para "<strong>${escapeHtml(query)}</strong>". 
                        Tente criar mais anotações ou reformular a pesquisa.
                    </p>
                </div>
            `;
            return;
        }

        const noteIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" style="vertical-align:middle;margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
        const docIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" style="vertical-align:middle;margin-right:4px;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';

        container.innerHTML = data.resultados.map((r, i) => `
            <div class="result-card" style="animation-delay: ${i * 0.1}s">
                <div class="result-header">
                    <span class="result-filename">${r.source === 'nota' ? noteIcon : docIcon} ${escapeHtml(r.filename)}</span>
                    <span class="result-score">${Math.round(r.relevancia * 100)}% relevante</span>
                </div>
                <p class="result-text">${escapeHtml(r.texto)}</p>
            </div>
        `).join('');

    } catch (err) {
        container.innerHTML = `
            <div class="result-card">
                <p class="result-text" style="color: var(--danger);">
                    Erro na pesquisa: ${escapeHtml(err.message)}
                </p>
            </div>
        `;
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (document.activeElement.id === 'quick-search-input') {
                handleQuickSearch();
            } else if (document.activeElement.id === 'main-search-input') {
                handleMainSearch();
            }
        }
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || ''}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function checkPasswordRequirements(password, prefix) {
    const isLengthValid = password.length >= 8;
    const isUpperValid = /[A-Z]/.test(password);
    const isNumberValid = /\d/.test(password);

    const lenEl = document.getElementById(`req-${prefix}length`);
    const upEl = document.getElementById(`req-${prefix}uppercase`);
    const numEl = document.getElementById(`req-${prefix}number`);

    if (lenEl) lenEl.className = isLengthValid ? 'valid' : 'invalid';
    if (upEl) upEl.className = isUpperValid ? 'valid' : 'invalid';
    if (numEl) numEl.className = isNumberValid ? 'valid' : 'invalid';

    return isLengthValid && isUpperValid && isNumberValid;
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const btn = document.getElementById('forgot-btn');
    const email = document.getElementById('forgot-email').value.trim();

    if (!email) {
        showToast('Preencha o e-mail!', 'error');
        return;
    }

    btn.classList.add('loading');
    try {
        const res = await api.forgotPassword(email);
        showToast(res.mensagem || 'Link de recuperação enviado!', 'success');
        closeModal('forgot-password-modal');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.classList.remove('loading');
    }
}

async function handleResetPassword(e) {
    e.preventDefault();
    const btn = document.getElementById('reset-btn');
    const token = document.getElementById('reset-token').value;
    const newPassword = document.getElementById('reset-password').value;

    if (!newPassword || !checkPasswordRequirements(newPassword, 'reset-')) {
        showToast('A senha não cumpre os requisitos mínimos de segurança!', 'error');
        return;
    }

    btn.classList.add('loading');
    try {
        const res = await api.resetPassword(token, newPassword);
        showToast(res.mensagem || 'Senha redefinida com sucesso!', 'success');
        closeModal('reset-password-modal');
        window.history.replaceState({}, document.title, "/");
        showAuth();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.classList.remove('loading');
    }
}
