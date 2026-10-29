// ============================================================================
// TENANT & PROFILE CACHE SERVICE (Stale-While-Revalidate + 5-Minute Memory TTL)
// ============================================================================

export interface TenantProfile {
  id: string;
  nome: string;
  plano?: string;
  planName?: string;
  planStatus?: "active" | "trial" | "suspended" | "canceled";
  isActive?: boolean;
  status?: string;
  pago?: boolean;
  planExpiresAt?: string;
  dataVencimento?: string;
  trialDays?: number;
  trialEndDate?: string;
  dueDateDay?: number;
  gracePeriodDays?: number;
  planPrice?: number;
  monthlyFeeOverride?: number;
  valorMensalidade?: number;
  promoEnabled?: boolean;
  promoFirstPaymentAmount?: number;
  effectiveChargeAmount?: number;
  limiteCaminhoes?: number;
  valorPorCaminhao?: number;
  cnpjCpf?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  logoUrl?: string;
  logoSize?: number;
  daysRemaining?: number;
  daysUntilExpiration?: number;
  isPastGracePeriod?: boolean;
  isBlocked?: boolean;
  isExpiringWarning?: boolean;
  licenseBadge?: "active" | "trial" | "expiring" | "expired" | "suspended";
  integrationsMeta?: Record<string, { hasKey: boolean; lastFour: string; isConfigured: boolean }>;
  [key: string]: any;
}

export interface CachedUserProfile {
  id: string;
  uid: string;
  nome: string;
  email: string;
  role: string;
  tipo?: string;
  companyId: string;
  tenantId: string;
  ativo: boolean;
  sessionToken?: string;
}

export const TENANT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

const tenantMemoryCache = new Map<string, { data: TenantProfile; timestamp: number }>();
const profileMemoryCache = new Map<string, { data: CachedUserProfile; timestamp: number }>();

const TENANT_STORAGE_PREFIX = "saas_cached_tenant_";
const PROFILE_STORAGE_PREFIX = "saas_cached_profile_";

// Forbidden sensitive fields that must NEVER be stored in public tenant documents or localStorage
const SENSITIVE_KEY_FIELDS = [
  "mercadopagoAccessToken",
  "MERCADOPAGO_ACCESS_TOKEN",
  "mpAccessToken",
  "apiKey",
  "secretKey",
  "webhookSecret",
  "privateKey",
  "accessToken"
];

/**
 * Strips any raw API keys/tokens from a tenant object and replaces them with
 * harmless metadata ({ hasKey: true, lastFour, isConfigured: true }).
 */
export function sanitizeTenantPublicData(raw: any): TenantProfile {
  if (!raw || typeof raw !== "object") {
    return { id: "unknown", nome: "Empresa" };
  }
  const clone: any = { ...raw };
  const integrationsMeta: Record<string, { hasKey: boolean; lastFour: string; isConfigured: boolean }> = {
    ...(clone.integrationsMeta || {})
  };

  for (const field of SENSITIVE_KEY_FIELDS) {
    if (clone[field] && typeof clone[field] === "string") {
      const val = String(clone[field]).trim();
      if (val.length > 0) {
        integrationsMeta[field] = {
          hasKey: true,
          lastFour: val.slice(-4),
          isConfigured: true
        };
      }
      delete clone[field];
    }
  }

  if (Object.keys(integrationsMeta).length > 0) {
    clone.integrationsMeta = integrationsMeta;
  }

  return clone as TenantProfile;
}

/**
 * Sanitizes a user profile before caching in localStorage (never stores plaintext password).
 */
export function sanitizeUserProfile(raw: any): CachedUserProfile {
  const id = String(raw?.id || raw?.uid || "");
  const companyId = String(raw?.companyId || raw?.tenantId || "");
  return {
    id,
    uid: id,
    nome: String(raw?.nome || "Usuário"),
    email: String(raw?.email || "").toLowerCase().trim(),
    role: String(raw?.role || raw?.tipo || "admin"),
    tipo: String(raw?.tipo || raw?.role || "admin"),
    companyId,
    tenantId: companyId,
    ativo: raw?.ativo !== false,
    ...(raw?.sessionToken ? { sessionToken: String(raw.sessionToken) } : {})
  };
}

/**
 * Retrieves tenant profile from O(1) Memory Map (if within 5-min TTL) or localStorage fallback.
 * Returns { data, isStale } for Stale-While-Revalidate hydration (< 5ms).
 */
export function getCachedTenant(tenantId: string): { data: TenantProfile | null; isStale: boolean } {
  if (!tenantId) return { data: null, isStale: true };

  const now = Date.now();
  const memEntry = tenantMemoryCache.get(tenantId);
  if (memEntry) {
    const isStale = now - memEntry.timestamp > TENANT_CACHE_TTL_MS;
    return { data: memEntry.data, isStale };
  }

  try {
    const rawStr = localStorage.getItem(`${TENANT_STORAGE_PREFIX}${tenantId}`);
    if (rawStr) {
      const parsed = JSON.parse(rawStr);
      if (parsed && parsed.data && parsed.data.id === tenantId) {
        const sanitized = sanitizeTenantPublicData(parsed.data);
        const ts = Number(parsed.timestamp) || 0;
        tenantMemoryCache.set(tenantId, { data: sanitized, timestamp: ts });
        return {
          data: sanitized,
          isStale: now - ts > TENANT_CACHE_TTL_MS
        };
      }
    }
  } catch (e) {
    // ignore storage parse error
  }

  return { data: null, isStale: true };
}

/**
 * Saves sanitized tenant profile into both O(1) Memory Map and localStorage (`saas_cached_tenant_${tenantId}`).
 */
export function setCachedTenant(tenantId: string, tenantData: any): TenantProfile {
  const sanitized = sanitizeTenantPublicData(tenantData);
  const now = Date.now();
  tenantMemoryCache.set(tenantId, { data: sanitized, timestamp: now });

  try {
    localStorage.setItem(
      `${TENANT_STORAGE_PREFIX}${tenantId}`,
      JSON.stringify({ data: sanitized, timestamp: now })
    );
  } catch (e) {
    // ignore quota errors
  }

  return sanitized;
}

/**
 * Invalidates the tenant cache when company settings are edited or a PIX license payment is confirmed.
 */
export function invalidateTenantCache(tenantId?: string): void {
  if (!tenantId) {
    tenantMemoryCache.clear();
    return;
  }
  tenantMemoryCache.delete(tenantId);
  try {
    localStorage.removeItem(`${TENANT_STORAGE_PREFIX}${tenantId}`);
  } catch (e) {
    // ignore
  }
}

/**
 * Retrieves cached user profile (`saas_cached_profile_${uid}`) for instant <50ms boot hydration.
 */
export function getCachedUserProfile(uid: string): CachedUserProfile | null {
  if (!uid) return null;
  const mem = profileMemoryCache.get(uid);
  if (mem) return mem.data;

  try {
    const raw = localStorage.getItem(`${PROFILE_STORAGE_PREFIX}${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      const profile = sanitizeUserProfile(parsed?.data || parsed);
      if (profile.id) {
        profileMemoryCache.set(uid, { data: profile, timestamp: Date.now() });
        return profile;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Saves sanitized user profile into memory and `localStorage` (`saas_cached_profile_${uid}`).
 */
export function setCachedUserProfile(uid: string, rawProfile: any): CachedUserProfile {
  const sanitized = sanitizeUserProfile(rawProfile);
  const now = Date.now();
  profileMemoryCache.set(uid, { data: sanitized, timestamp: now });
  try {
    localStorage.setItem(
      `${PROFILE_STORAGE_PREFIX}${uid}`,
      JSON.stringify({ data: sanitized, timestamp: now })
    );
  } catch (e) {
    // ignore
  }
  return sanitized;
}

export function clearCachedUserProfile(uid?: string): void {
  if (uid) {
    profileMemoryCache.delete(uid);
    try {
      localStorage.removeItem(`${PROFILE_STORAGE_PREFIX}${uid}`);
    } catch (e) {}
  } else {
    profileMemoryCache.clear();
  }
}
