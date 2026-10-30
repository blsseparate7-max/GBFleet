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

// Usa sempre rotas relativas na mesma origem ativa (seja no AI Studio, localhost ou Vercel)
// para evitar que o navegador na Vercel tente chamar o container privado run.app e sofra bloqueio de CORS.
const getBackendUrl = () => {
  return "";
};

const baseUrl = getBackendUrl();

// Global Fetch Interceptor
const originalFetch = window.fetch.bind(window);
const customFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  let url = "";
  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else if (input && typeof input === 'object' && 'url' in input) {
    url = (input as any).url;
  }

  // Never intercept external Firebase / Google Cloud / Mercado Pago SDK requests
  if (
    url.includes('googleapis.com') ||
    url.includes('firebaseio.com') ||
    url.includes('gstatic.com') ||
    url.includes('mercadopago.com')
  ) {
    return originalFetch(input, init);
  }

  // Helper to attach auth headers to both server-side and client-side calls
  const buildAuthHeaders = (rawHeaders?: HeadersInit): Record<string, string> => {
    const headersObj: Record<string, string> = {};
    if (rawHeaders) {
      if (typeof (rawHeaders as any).forEach === 'function') {
        try {
          (rawHeaders as any).forEach((value: string, name: string) => {
            if (name) headersObj[name.toLowerCase()] = value;
          });
        } catch (e) {}
      } else if (Array.isArray(rawHeaders)) {
        rawHeaders.forEach((item) => {
          if (Array.isArray(item) && item.length >= 2) {
            headersObj[String(item[0]).toLowerCase()] = String(item[1]);
          }
        });
      } else if (typeof rawHeaders === 'object') {
        try {
          Object.entries(rawHeaders).forEach(([name, value]) => {
            if (name && value !== undefined && value !== null) {
              headersObj[name.toLowerCase()] = String(value);
            }
          });
        } catch (e) {}
      }
    }

    const userStr = safeStorage.getItem('gbfleet_user');
    let user: any = null;
    try {
      user = userStr ? JSON.parse(userStr) : null;
    } catch (e) {}

    const impersonateId = safeStorage.getItem('gbfleet_impersonate');
    const sessionToken = safeStorage.getItem('gbfleet_session_token');

    if (user && user.id) {
      headersObj['x-user-id'] = String(user.id);
    }
    if (impersonateId) {
      headersObj['x-impersonate-company-id'] = String(impersonateId);
    }
    if (!headersObj['authorization']) {
      if (sessionToken) {
        headersObj['authorization'] = `Bearer ${sessionToken}`;
      } else if (user && user.id) {
        const fallbackToken = btoa(
          JSON.stringify({
            uid: user.id,
            email: user.email || '',
            role: user.role || 'admin',
            tenantId: user.companyId || user.tenantId || ''
          })
        );
        headersObj['authorization'] = `Bearer gbf_${fallbackToken}`;
      }
    }

    return headersObj;
  };

  // Intercept any API routes and route them directly to our client-side Firebase Web SDK emulator!
  // Exception: Mercado Pago API v1 routes, Zero-Trust Webhooks, Server Superadmin verification (/api/auth/me),
  // and Private Settings Vault (/api/tenants/*/private-settings/*) execute on the backend / Vercel Serverless.
  const isServerSideProtectedCall =
    url &&
    (url.includes('/api/saas/payment/create-charge') ||
     url.includes('/api/saas/payment/check-status/') ||
     url.includes('/api/webhooks/mercadopago') ||
     url.includes('/api/webhooks') ||
     url.includes('/api/auth/me') ||
     url.includes('/private-settings/'));

  if (isServerSideProtectedCall) {
    const serverInit = init ? { ...init } : {};
    serverInit.headers = buildAuthHeaders(serverInit.headers);
    const targetInput =
      typeof input === 'string' && input.startsWith('/') && baseUrl
        ? `${baseUrl}${input}`
        : input;
    try {
      let response = await originalFetch(targetInput, serverInit);
      const contentType = response.headers.get('content-type') || '';

      // If Vercel rewrite wasn't applied and returned an HTML fallback or 404, call /api/index directly
      if (
        (!response.ok || !contentType.includes('application/json')) &&
        (url.includes('/api/saas/payment/create-charge') || url.includes('/api/saas/payment/check-status/'))
      ) {
        const apiIndex = url.indexOf('/api/');
        const subPath = apiIndex !== -1 ? url.slice(apiIndex + 5) : url;
        const directServerlessUrl = `/api/index?__path=${encodeURIComponent(subPath)}`;
        const retryRes = await originalFetch(directServerlessUrl, serverInit);
        const retryType = retryRes.headers.get('content-type') || '';
        if (retryRes.ok && retryType.includes('application/json')) {
          return retryRes;
        }
      }

      if (response.ok || response.status === 401 || response.status === 403 || response.status === 429) {
        return response;
      }
      // Fallback for /api/auth/me if running in offline/static preview
      if (url.includes('/api/auth/me')) {
        const apiIndex = url.indexOf('/api/');
        const apiPath = url.slice(apiIndex);
        return emulateApiCall(apiPath, serverInit);
      }
      return response;
    } catch (netErr) {
      if (url.includes('/api/auth/me') || url.includes('/private-settings/')) {
        const apiIndex = url.indexOf('/api/');
        const apiPath = url.slice(apiIndex);
        return emulateApiCall(apiPath, serverInit);
      }
      throw netErr;
    }
  }

  const isApiCall = url && url.includes('/api/');

  if (isApiCall) {
    const apiIndex = url.indexOf('/api/');
    const apiPath = url.slice(apiIndex);

    const newInit = init ? { ...init } : {};
    newInit.headers = buildAuthHeaders(newInit.headers);

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