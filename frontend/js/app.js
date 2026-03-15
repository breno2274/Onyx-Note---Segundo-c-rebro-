/**
 * Segundo Cérebro - Application Logic
 * Router SPA, gestão de estado, e interações
 */

// --- State ---
let currentUser = null;
let searchCount = parseInt(localStorage.getItem('searchCount') || '0');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initApp();
    setupUploadZone();
    setupKeyboardShortcuts();
});

// --- Theme Management ---
function initTheme() {
    const isLight = localStorage.getItem('onyxTheme') === 'light';
    if (isLight) {
        document.documentElement.classList.add('light-theme');
    }
}

function toggleTheme() {
    const isLight = document.documentElement.classList.toggle('light-theme');
    localStorage.setItem('onyxTheme', isLight ? 'light' : 'dark');
}

// --- Password Visibility ---
function togglePasswordVisibility(inputId, btnElement) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        btnElement.textContent = '🙈';
    } else {
        input.type = 'password';
        btnElement.textContent = '👁️';
    }
}

function initApp() {
    // Verificar se existe um token (vindo do Login do Google)
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
        window.history.replaceState({}, document.title, "/"); // Limpa a URL
        showToast('Login com Google efetuado com sucesso! 🎉', 'success');
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

    // Bind real-time password requirements UI
    const regPwd = document.getElementById('register-password');
    if (regPwd) {
        regPwd.addEventListener('input', (e) => checkPasswordRequirements(e.target.value, ''));
    }
    const resetPwd = document.getElementById('reset-password');
    if (resetPwd) {
        resetPwd.addEventListener('input', (e) => checkPasswordRequirements(e.target.value, 'reset-'));
    }
}

// --- View Management ---
function showAuth() {
    document.getElementById('auth-view').classList.add('active');
    document.getElementById('dashboard-view').classList.remove('active');
}

function showDashboard() {
    document.getElementById('auth-view').classList.remove('active');
    document.getElementById('dashboard-view').classList.add('active');
    loadProfile();
    loadDocuments();
    loadNotes();
}

// --- Auth Tab Switch ---
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`${tab}-form`).classList.add('active');
}

// --- Auth Handlers ---
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
        showToast(`Bem-vindo, ${username}! 🎉`, 'success');
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
    const termsCheck = document.getElementById('terms-checkbox').checked;

    if (!email || !password) {
        showToast('Preencha todos os campos!', 'error');
        return;
    }

    if (!termsCheck) {
        showToast('É necessário aceitar os Termos de Uso e Privacidade.', 'error');
        return;
    }

    if (!checkPasswordRequirements(password, '')) {
        showToast('A senha não cumpre os requisitos mínimos de segurança!', 'error');
        return;
    }

    btn.classList.add('loading');

    try {
        await api.register(email, password);
        showToast('Conta criada com sucesso! Fazendo login... 🚀', 'success');
        // Auto-login after register
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
    // Clear forms
    document.querySelectorAll('input').forEach(i => i.value = '');
    showAuth();
    showToast('Sessão terminada. Até breve! 👋', 'info');
}

// --- Profile ---
async function loadProfile() {
    try {
        const data = await api.getProfile();
        currentUser = data.usuario;
        document.getElementById('user-name').textContent = currentUser;
        document.getElementById('user-avatar').textContent = currentUser.charAt(0).toUpperCase();
        document.getElementById('welcome-name').textContent = currentUser;
    } catch (err) {
        console.error('Erro ao carregar perfil:', err);
    }
}

// --- Dashboard Tab Switch ---
function switchDashboardTab(tab) {
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.dashboard-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');

    // Load data for the tab
    if (tab === 'documents') {
        loadDocuments();
    } else if (tab === 'notes') {
        loadNotes();
    }
}

// --- Upload ---
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

async function handleFileUpload(file) {
    if (!file) return;

    // Qualquer arquivo é aceito agora, o backend trata com MarkItDown.

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
        progressText.textContent = `✅ ${result.mensagem} (${result.total_chunks} chunks)`;

        showToast(`Documento "${file.name}" enviado com sucesso! 📄`, 'success');

        // Refresh documents
        loadDocuments();
        updateDocCount();

        // Hide progress after 3s
        setTimeout(() => {
            progress.style.display = 'none';
            progressFill.style.width = '0%';
        }, 3000);
    } catch (err) {
        progressFill.style.width = '0%';
        progressText.textContent = `❌ Erro: ${err.message}`;
        showToast(`Erro ao enviar: ${err.message}`, 'error');

        setTimeout(() => {
            progress.style.display = 'none';
        }, 4000);
    }

    // Reset file inputs
    document.getElementById('file-input').value = '';
    const docsInput = document.getElementById('file-input-docs');
    if (docsInput) docsInput.value = '';
}

// --- Documents ---
async function loadDocuments() {
    const container = document.getElementById('documents-list');
    const emptyState = document.getElementById('empty-docs');

    try {
        const data = await api.getDocuments();
        const docs = data.documentos || [];

        // Update stat
        document.getElementById('stat-docs').textContent = docs.length;

        if (docs.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.style.display = 'grid';

        const imagesToLoad = [];
        container.innerHTML = docs.map((doc, i) => {
            const isImage = doc.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            if (isImage) imagesToLoad.push(doc.doc_id);

            return `
            <div class="doc-card" style="animation-delay: ${i * 0.1}s">
                ${isImage
                    ? `<img id="img-thumb-${doc.doc_id}" class="doc-icon-thumb" src="/favicon.ico" alt="Thumbnail" />`
                    : `<div class="doc-icon">${doc.has_text === false ? '🖼️' : '📄'}</div>`
                }
                <div class="doc-name">${escapeHtml(doc.filename)}</div>
                <div class="doc-meta">ID: ${doc.doc_id.substring(0, 8)}...</div>
                <div class="doc-actions">
                    <button class="btn btn-ghost btn-sm" onclick="previewFileUI('${doc.doc_id}', '${escapeHtml(doc.filename)}')" title="Abrir ficheiro">
                        👁️
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="renameDocumentUI('${doc.doc_id}', '${escapeHtml(doc.filename)}')" title="Renomear ficheiro">
                        ✎
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="downloadFileUI('${doc.doc_id}', '${escapeHtml(doc.filename)}')" title="Baixar">
                        ⬇️
                    </button>
                    ${doc.has_text !== false ? `<button class="btn btn-ghost btn-sm" onclick="searchInDoc('${escapeHtml(doc.filename)}')">
                        🔍 Pesquisar
                    </button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteDocument('${doc.doc_id}', '${escapeHtml(doc.filename)}')">
                        🗑️ Apagar
                    </button>
                </div>
            </div>
        `;
        }).join('');

        // Carregar as thumbnails após inserir no DOM
        imagesToLoad.forEach(id => {
            loadImageThumbnail(id, `img-thumb-${id}`);
        });

    } catch (err) {
        container.innerHTML = `
            <div class="empty-state glass-card" style="grid-column: 1 / -1;">
                <div class="empty-icon">⚠️</div>
                <h3>Erro ao carregar documentos</h3>
                <p>${err.message}</p>
                <button class="btn btn-primary" onclick="loadDocuments()">Tentar novamente</button>
            </div>
        `;
    }
}

async function deleteDocument(docId, filename) {
    if (!confirm(`Tem certeza que quer apagar "${filename}"?`)) return;

    try {
        await api.deleteDocument(docId);
        showToast(`Documento "${filename}" apagado! 🗑️`, 'success');
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
        showToast(`Documento renomeado para "${newName}"! ✎`, 'success');
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
    switchDashboardTab('search');
    const input = document.getElementById('main-search-input');
    input.value = '';
    input.placeholder = `Pesquisar em "${filename}"...`;
    input.focus();
}

async function updateDocCount() {
    try {
        const data = await api.getDocuments();
        document.getElementById('stat-docs').textContent = (data.documentos || []).length;
    } catch (e) { /* silent */ }
}

// --- Notes ---
let currentNoteId = null;
let noteSaveTimeout = null;

async function loadNotes() {
    const container = document.getElementById('notes-list');

    try {
        const data = await api.getNotes();
        const notes = data.notas || [];

        // Update stat
        document.getElementById('stat-notes').textContent = notes.length;

        if (notes.length === 0) {
            container.innerHTML = `
                <div style="padding: 1rem; text-align: center; color: var(--text-tertiary);">
                    Nenhuma anotação ainda.
                </div>
            `;
            return;
        }

        container.innerHTML = notes.map(note => `
            <div class="note-card ${currentNoteId === note.id ? 'active' : ''}" onclick="openNote(${note.id})">
                <div class="note-card-title">${escapeHtml(note.title || 'Sem título')}</div>
                <div class="note-card-date">${new Date(note.updated_at).toLocaleDateString()}</div>
            </div>
        `).join('');

        // Cache notes for opening
        window.cachedNotes = notes;
    } catch (err) {
        container.innerHTML = `<div style="color: var(--danger); padding: 1rem;">Erro: ${err.message}</div>`;
    }
}

function createNewNote() {
    currentNoteId = null;
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';

    document.getElementById('empty-note-state').style.display = 'none';
    document.getElementById('note-editor-container').style.display = 'flex';
    document.getElementById('note-title').focus();

    // Create immediately so it has an ID
    saveNote(true);
}

function openNote(id) {
    currentNoteId = id;
    const note = window.cachedNotes?.find(n => n.id === id);
    if (!note) return;

    document.getElementById('note-title').value = note.title;
    document.getElementById('note-content').value = note.content;

    document.getElementById('empty-note-state').style.display = 'none';
    document.getElementById('note-editor-container').style.display = 'flex';

    // Update active state in list
    loadNotes();
}

function handleNoteInput() {
    const indicator = document.getElementById('autosave-indicator');
    indicator.textContent = 'Salvando...';
    indicator.className = 'autosave-indicator saving';

    clearTimeout(noteSaveTimeout);
    noteSaveTimeout = setTimeout(() => saveNote(false), 1000); // 1s debounce
}

async function saveNote(isNew = false) {
    const title = document.getElementById('note-title').value.trim() || 'Nova Anotação';
    const content = document.getElementById('note-content').value;
    const indicator = document.getElementById('autosave-indicator');

    indicator.textContent = 'Salvando...';
    indicator.className = 'autosave-indicator saving';

    try {
        if (!currentNoteId || isNew) {
            const result = await api.createNote(title, content);
            currentNoteId = result.nota.id;
        } else {
            await api.updateNote(currentNoteId, title, content);
        }

        indicator.textContent = '✓ Salvo automaticamente';
        indicator.className = 'autosave-indicator saved';

        // Reload list to update titles/dates
        loadNotes();
    } catch (err) {
        indicator.textContent = '❌ Erro ao salvar';
        indicator.className = 'autosave-indicator saving';
    }
}

async function handleDeleteCurrentNote() {
    if (!currentNoteId) return;
    if (!confirm('Tem a certeza que quer apagar esta anotação?')) return;

    try {
        await api.deleteNote(currentNoteId);
        showToast('Anotação apagada com sucesso! 🗑️', 'success');

        currentNoteId = null;
        document.getElementById('empty-note-state').style.display = 'flex';
        document.getElementById('note-editor-container').style.display = 'none';

        loadNotes();
    } catch (err) {
        showToast('Erro ao apagar: ' + err.message, 'error');
    }
}

// --- Search ---
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
        document.getElementById('stat-searches').textContent = searchCount;

        if (!data.resultados || data.resultados.length === 0) {
            container.innerHTML = `
                <div class="result-card">
                    <p class="result-text" style="text-align:center;">
                        Nenhum resultado encontrado para "<strong>${escapeHtml(query)}</strong>". 
                        Tente enviar mais documentos ou reformular a pergunta.
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.resultados.map((r, i) => `
            <div class="result-card" style="animation-delay: ${i * 0.1}s">
                <div class="result-header">
                    <span class="result-filename">${r.source === 'nota' ? '📝' : '📄'} ${escapeHtml(r.filename)}</span>
                    <span class="result-score">${Math.round(r.relevancia * 100)}% relevante</span>
                </div>
                <p class="result-text">${escapeHtml(r.texto)}</p>
            </div>
        `).join('');

    } catch (err) {
        container.innerHTML = `
            <div class="result-card">
                <p class="result-text" style="color: var(--danger);">
                    ❌ Erro na pesquisa: ${err.message}
                </p>
            </div>
        `;
    }
}

// --- Keyboard Shortcuts ---
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Enter in search inputs
        if (e.key === 'Enter') {
            if (document.activeElement.id === 'quick-search-input') {
                handleQuickSearch();
            } else if (document.activeElement.id === 'main-search-input') {
                handleMainSearch();
            }
        }
    });
}

// --- Toast System ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- Utils ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Modals & Authentication Helpers ---
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
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
        showToast(res.mensagem || 'Link de recuperação enviado (verifique logs)!', 'success');
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
