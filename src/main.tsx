import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// --- CAMINHO 2: Invólucro Seguro com Fallback em Cookies (Funciona em todas as abas e abas privadas) ---
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      // Se a aba privada bloquear o localStorage, procura nos Cookies (partilhado entre abas)
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
      // Se falhar (aba privada), guarda num Cookie seguro para que todas as abas possam aceder
      document.cookie = `${key}=${encodeURIComponent(value)}; path=/; SameSite=Strict; Secure`;
    }
  }
};

// Deteta de forma segura o endereço do backend vindo do .env do Vite
const getBackendUrl = () => {
  let envUrl = (import.meta as any).env?.VITE_APP_URL;
  if (envUrl && typeof envUrl === 'string') {
    // Remove aspas simples/duplas e espaçosextras da variável de ambiente
    envUrl = envUrl.replace(/^["']|["']$/g, '').trim();
    
    // Se estivermos rodando no ambiente de visualização do AI Studio (Cloud Run) ou localhost,
    // usamos rotas relativas ("") para que o app chame o próprio contêiner correto e ativo,
    // evitando bloqueios de CORS e sandbox por parte de navegadores como Safari.
    const currentHost = window.location.hostname;
    if (currentHost && (
      currentHost.includes('run.app') || 
      currentHost.includes('localhost') || 
      currentHost.includes('127.0.0.1') || 
      currentHost.includes('aistudio.google') ||
      currentHost.includes('googleusercontent')
    )) {
      return "";
    }
    
    return envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
  }
  
  // Se não encontrar o .env (como na Vercel), usa a própria origem atual como fallback relativo ou absoluto
  try {
    if (window.location.origin && window.location.origin !== "null" && !window.location.origin.startsWith('null')) {
      return window.location.origin;
    }
  } catch (e) {
    // Ignore e retorna vazio para usar rotas relativas seguras
  }
  return "";
};

const baseUrl = getBackendUrl();

// Global Fetch Interceptor
const originalFetch = window.fetch;
const customFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  
  // Se a rota for relativa (ex: /api/auth/login), anexa a URL correta do servidor se houver baseUrl absoluta
  if (url.startsWith('/api/')) {
    if (baseUrl && baseUrl !== "null") {
      url = `${baseUrl}${url}`;
    }
  }

  // Mantém a lógica original de validação de rotas do seu projeto (ignora o login na injeção de headers)
  const isApiCall = url && (url.includes('/api/')) && !url.includes('/api/auth/login');

  if (isApiCall) {
    const userStr = safeStorage.getItem('gbfleet_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const impersonateId = safeStorage.getItem('gbfleet_impersonate');

    if (user && user.id) {
      const newInit = init ? { ...init } : {};

      // --- CAMINHO 1: Refatoração Segura utilizando a API nativa Headers ---
      const headers = newInit.headers instanceof Headers 
        ? newInit.headers 
        : new Headers(newInit.headers || {});

      // Injeta as credenciais com segurança
      headers.set('x-user-id', String(user.id));
      if (impersonateId) {
        headers.set('x-impersonate-company-id', String(impersonateId));
      }

      newInit.headers = headers;
      return originalFetch(url, newInit);
    }
  }
  return originalFetch(url, init);
};

try {
  // Use Object.defineProperty with getter to bypass read-only/getter-only restrictions
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    enumerable: true,
    get: () => customFetch,
    set: () => {} // Prevent errors if something tries to write to window.fetch
  });
} catch (e) {
  try {
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: customFetch
    });
  } catch (err) {
    try {
      (window as any).fetch = customFetch;
    } catch (lastErr) {
      console.error("Critical: Multi-tenant request interceptor could not be attached:", lastErr);
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);