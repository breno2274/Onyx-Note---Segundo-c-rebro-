/**
 * Segundo Cérebro - API Client
 * Comunicação com o API Gateway
 */

const API_BASE = '/api';

class SegundoCerebroAPI {
    constructor() {
        this.token = localStorage.getItem('token');
    }

    // --- Helper para fazer requests ---
    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const headers = options.headers || {};

        if (this.token && !options.noAuth) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        if (options.json) {
            headers['Content-Type'] = 'application/json';
        }

        const config = {
            method: options.method || 'GET',
            headers,
        };

        if (options.body) {
            config.body = options.body;
        } else if (options.json) {
            config.body = JSON.stringify(options.json);
        }

        const response = await fetch(url, config);

        if (response.status === 401) {
            this.logout();
            throw new Error('Sessão expirada. Faça login novamente.');
        }

        const data = await response.json();

        if (!response.ok) {
            const detail = data.detail || data.message || 'Erro desconhecido';
            const errorMsg = typeof detail === 'object' ? JSON.stringify(detail) : detail;
            throw new Error(errorMsg);
        }

        return data;
    }

    // --- Auth ---
    async register(username, password) {
        const data = await this.request('/register', {
            method: 'POST',
            json: { username, password },
            noAuth: true,
        });
        return data;
    }

    async login(username, password) {
        const data = await this.request('/login', {
            method: 'POST',
            json: { username, password },
            noAuth: true,
        });
        this.token = data.access_token;
        localStorage.setItem('token', this.token);
        return data;
    }

    logout() {
        this.token = null;
        localStorage.removeItem('token');
    }

    async forgotPassword(email) {
        return await this.request('/auth/forgot-password', {
            method: 'POST',
            json: { email },
            noAuth: true,
        });
    }

    async resetPassword(token, new_password) {
        return await this.request('/auth/reset-password', {
            method: 'POST',
            json: { token, new_password },
            noAuth: true,
        });
    }

    isAuthenticated() {
        return !!this.token;
    }

    // --- User ---
    async getProfile() {
        return await this.request('/users/me');
    }

    // --- Documents ---
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        return await this.request('/upload', {
            method: 'POST',
            body: formData,
        });
    }

    async search(query, nResults = 5) {
        return await this.request('/search', {
            method: 'POST',
            json: { query, n_results: nResults },
        });
    }

    async getDocuments() {
        return await this.request('/documents');
    }

    async deleteDocument(docId) {
        return await this.request(`/documents/${docId}`, {
            method: 'DELETE',
        });
    }

    async renameDocument(docId, newName) {
        return await this.request(`/documents/${docId}`, {
            method: 'PUT',
            json: { filename: newName }
        });
    }

    async downloadFile(docId, filename) {
        const url = `${API_BASE}/download/${docId}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`(${response.status}) ${errText}`);
        }
        const blob = await response.blob();

        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(a.href);
    }

    async previewFile(docId) {
        const url = `${API_BASE}/download/${docId}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`(${response.status}) ${errText}`);
        }
        const blob = await response.blob();

        const objectUrl = window.URL.createObjectURL(blob);
        window.open(objectUrl, '_blank');

        // Timeout para revogar a URL depois de abrir a nova tab
        setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
    }

    // --- Notes ---
    async createNote(title, content) {
        return await this.request('/notes', {
            method: 'POST',
            json: { title, content }
        });
    }

    async getNotes() {
        return await this.request('/notes');
    }

    async updateNote(noteId, title, content) {
        return await this.request(`/notes/${noteId}`, {
            method: 'PUT',
            json: { title, content }
        });
    }

    async deleteNote(noteId) {
        return await this.request(`/notes/${noteId}`, {
            method: 'DELETE'
        });
    }
}

// Instância global
const api = new SegundoCerebroAPI();
