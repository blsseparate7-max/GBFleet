import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global Fetch Interceptor to seamlessly handle multi-tenant authentication and Superadmin impersonation headers
const originalFetch = window.fetch;
const customFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  // Match relative path "/api/..." OR absolute path containing "/api/..."
  const isApiCall = url && (url.startsWith('/api/') || url.includes('/api/')) && !url.includes('/api/auth/login');

  if (isApiCall) {
    const userStr = localStorage.getItem('gbfleet_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const impersonateId = localStorage.getItem('gbfleet_impersonate');

    if (user && user.id) {
      // Safely clone init options to prevent mutating a read-only options parameter
      const newInit = init ? { ...init } : {};
      const headersRecord: Record<string, string> = {};

      // Copy existing headers safely to our plain record object
      if (newInit.headers) {
        if (newInit.headers instanceof Headers) {
          try {
            newInit.headers.forEach((value, name) => {
              headersRecord[name] = value;
            });
          } catch (e) {
            // Fallback for cross-realm / sandbox Headers object serialization
          }
        } else if (Array.isArray(newInit.headers)) {
          newInit.headers.forEach(([name, value]) => {
            if (name) {
              headersRecord[name] = String(value);
            }
          });
        } else if (typeof newInit.headers === 'object') {
          Object.entries(newInit.headers).forEach(([name, value]) => {
            if (name && value !== undefined && value !== null) {
              headersRecord[name] = String(value);
            }
          });
        }
      }

      // Add our multi-tenant credentials safely as plain strings
      headersRecord['x-user-id'] = String(user.id);
      if (impersonateId) {
        headersRecord['x-impersonate-company-id'] = String(impersonateId);
      }

      newInit.headers = headersRecord;
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
