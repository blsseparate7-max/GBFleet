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

// Interceptor Global de Requisições (Fetch) reconstruído de forma limpa
const originalFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  // Pega a URL da chamada atual
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  
  // SE for uma rota de API (/api/) E NÃO for a rota de login (/api/auth/login)
  const isApiCall = url && (url.includes('/api/')) && !url.includes('/api/auth/login');

  if (isApiCall) {
    const userStr = safeStorage.getItem('gbfleet_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const impersonateId = safeStorage.getItem('gbfleet_impersonate');

    if (user && user.id) {
      // Cria uma cópia segura das opções da requisição
      const newInit = init ? { ...init } : {};
      
      // Usa o sistema nativo do navegador para manusear cabeçalhos sem dar erro de texto
      const headers = newInit.headers instanceof Headers 
        ? newInit.headers 
        : new Headers(newInit.headers || {});

      // Injeta as credenciais de segurança com segurança
      headers.set('x-user-id', String(user.id));
      if (impersonateId) {
        headers.set('x-impersonate-company-id', String(impersonateId));
      }

      newInit.headers = headers;
      return originalFetch(input, newInit);
    }
  }

  // Se for a rota de login ou qualquer outra coisa, deixa passar direto sem mexer em nada
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);