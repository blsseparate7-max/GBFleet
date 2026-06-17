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
      // Se a aba privada bloquear o localStorage, vai buscar aos Cookies (partilhado entre abas)
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
      // Se falhar, guarda num Cookie seguro para que todas as abas possam aceder
      document.cookie = `${key}=${encodeURIComponent(value)}; path=/; SameSite=Strict; Secure`;
    }
  }
};

// Global Fetch Interceptor to seamlessly handle multi-tenant authentication and Superadmin impersonation headers
const originalFetch = window.fetch;
const customFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  
  // Mantém a lógica original exata de validação de rotas do seu projeto
  const isApiCall = url && (url.startsWith('/api/') || url.includes('/api/')) && !url.includes('/api/auth/login');

  if (isApiCall) {
    // Usa o safeStorage seguro (com suporte a Cookies para abas privadas)
    const userStr = safeStorage.getItem('gbfleet_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const impersonateId = safeStorage.getItem('gbfleet_impersonate');

    if (user && user.id) {
      const newInit = init ? { ...init } : {};

      // --- CAMINHO 1: Refatoração Segura utilizando a API nativa Headers ---
      // Instancia ou copia de forma robusta um objeto Headers nativo do navegador para evitar erros de texto
      const headers = newInit.headers instanceof Headers 
        ? newInit.headers 
        : new Headers(newInit.headers || {});

      // Define os dados de multi-tenant usando a interface segura do navegador
      headers.set('x-user-id', String(user.id));
      if (impersonateId) {
        headers.set('x-impersonate-company-id', String(impersonateId));
      }

      newInit.headers = headers;
      return originalFetch(input, newInit);
    }
  }
  return originalFetch(input, init);
};

try {
  // Try defining a getter, which bypasses read-only/writable restrictions on many sandbox wrappers
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    enumerable: true,
    get: () => customFetch
  });
} catch (e) {
  try {
    // Attempt standard value definition
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: customFetch
    });
  } catch (err) {
    try {
      // Direct write as a last-resort fallback
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