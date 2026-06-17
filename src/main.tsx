import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// --- Proteção para funcionar em todas as abas (inclusive Privadas) ---
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      // Se a aba privada bloquear o localStorage, busca nos Cookies (compartilhado entre abas)
      const nameEQ = key + "=";
      const ca = document.cookie.split(';');
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
      }
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Se falhar, salva em Cookie seguro para todas as abas acessarem
      document.cookie = `${key}=${encodeURIComponent(value)}; path=/; SameSite=Strict; Secure`;
    }
  }
};

// Descobre a URL base do ambiente de forma dinâmica
const getBaseUrl = () => {
  // Tenta pegar do ambiente do Vite ou usa a própria URL atual do navegador
  const envUrl = (import.meta.env?.VITE_APP_URL || import.meta.env?.APP_URL);
  if (envUrl) return envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
  return window.location.origin; 
};

const baseUrl = getBaseUrl();

// Interceptor Global de Requisições (Fetch) Reconstruído e Blindado
const originalFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  
  // Se a rota for estritamente o login relativo, corrige a URL para o servidor correto
  if (url === '/api/auth/login' || url.endsWith('/api/auth/login')) {
    return originalFetch(`${baseUrl}/api/auth/login`, init);
  }

  // Verifica se é uma chamada de API
  const isApiCall = url && (url.includes('/api/'));

  if (isApiCall) {
    const userStr = safeStorage.getItem('gbfleet_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const impersonateId = safeStorage.getItem('gbfleet_impersonate');

    if (user && user.id) {
      const newInit = init ? { ...init } : {};
      
      // Usa a API nativa de Headers do navegador (Caminho 1 sugerido pela IA)
      const headers = newInit.headers instanceof Headers 
        ? newInit.headers 
        : new Headers(newInit.headers || {});

      headers.set('x-user-id', String(user.id));
      if (impersonateId) {
        headers.set('x-impersonate-company-id', String(impersonateId));
      }

      newInit.headers = headers;
      
      // Se a URL for relativa (ex: /api/veiculos), anexa a URL base correta do Cloud Run / Local
      if (url.startsWith('/api/')) {
        url = `${baseUrl}${url}`;
      }

      return originalFetch(url, newInit);
    }
  }

  // Para qualquer outra rota que já venha com HTTP completo, deixa passar normal
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);