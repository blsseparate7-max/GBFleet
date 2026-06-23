import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { emulateApiCall } from './lib/firebaseClientDb';

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
  let url = "";
  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else if (input && typeof input === 'object' && 'url' in input) {
    url = (input as any).url;
  }

  // Intercept any API routes and route them directly to our client-side Firebase Web SDK emulator!
  const isApiCall = url && url.includes('/api/');

  if (isApiCall) {
    const apiIndex = url.indexOf('/api/');
    const apiPath = url.slice(apiIndex);

    const newInit = init ? { ...init } : {};
    const headersObj: Record<string, string> = {};

    if (newInit.headers) {
      if (typeof (newInit.headers as any).forEach === 'function') {
        try {
          (newInit.headers as any).forEach((value: string, name: string) => {
            if (name) {
              headersObj[name.toLowerCase()] = value;
            }
          });
        } catch (e) {
          // fallback
        }
      } else if (Array.isArray(newInit.headers)) {
        newInit.headers.forEach((item) => {
          if (Array.isArray(item) && item.length >= 2) {
            const name = String(item[0]);
            const value = String(item[1]);
            if (name) {
              headersObj[name.toLowerCase()] = value;
            }
          }
        });
      } else if (typeof newInit.headers === 'object') {
        try {
          Object.entries(newInit.headers).forEach(([name, value]) => {
            if (name && value !== undefined && value !== null) {
              headersObj[name.toLowerCase()] = String(value);
            }
          });
        } catch (e) {
          // fallback
        }
      }
    }

    const userStr = safeStorage.getItem('gbfleet_user');
    let user: any = null;
    try {
      user = userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      // ignore
    }
    const impersonateId = safeStorage.getItem('gbfleet_impersonate');

    if (user && user.id) {
      headersObj['x-user-id'] = String(user.id);
    }
    if (impersonateId) {
      headersObj['x-impersonate-company-id'] = String(impersonateId);
    }

    newInit.headers = headersObj;

    return emulateApiCall(apiPath, newInit);
  }

  return originalFetch(input, init);
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