import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { configJson } from "./configJson";
import { dbTemplate } from "./dbTemplate";
import { cacheAttachment } from "./fileCompressor";
import {
  setCachedUserProfile,
  setCachedTenant,
  invalidateTenantCache,
  sanitizeTenantPublicData
} from "./tenantService";

// Initialize Firebase Web SDK Client
const firebaseConfig = {
  apiKey: configJson.apiKey,
  authDomain: configJson.authDomain,
  projectId: configJson.projectId,
  storageBucket: configJson.storageBucket,
  messagingSenderId: configJson.messagingSenderId,
  appId: configJson.appId
};

const app = initializeApp(firebaseConfig);
const firestoreDbId = configJson.firestoreDatabaseId || "(default)";
export const firestore = getFirestore(app, firestoreDbId);

// Core reactive listeners
type SyncCallback = () => void;
const listeners = new Set<SyncCallback>();

export function onDBSync(callback: SyncCallback) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notifyListeners() {
  listeners.forEach(cb => {
    try {
      cb();
    } catch (err) {
      console.error("Error in DB Sync listener:", err);
    }
  });
}

// In-Memory Database State
// Fast-boot optimization: If no user is currently logged in (entering Login screen), load lightweight 2KB auth index first
// and hydrate the full local DB asynchronously after the Login screen has already rendered!
let liveDb: any = (() => {
  try {
    const hasLoggedInUser = !!localStorage.getItem("gbfleet_user");
    if (!hasLoggedInUser) {
      const authCacheStr = localStorage.getItem("gbfleet_auth_index_local");
      if (authCacheStr) {
        const authCache = JSON.parse(authCacheStr);
        if (Array.isArray(authCache?.users) && Array.isArray(authCache?.companies)) {
          const fastBootDb = { ...dbTemplate, users: authCache.users, companies: authCache.companies };
          // Hydrate full local cache asynchronously after Login UI finishes painting
          setTimeout(() => {
            try {
              const savedFull = localStorage.getItem("gbfleet_db_local");
              if (savedFull) {
                const parsedFull = JSON.parse(savedFull);
                if (parsedFull?.users && parsedFull?.companies) {
                  liveDb = parsedFull;
                }
              }
            } catch {}
          }, 150);
          return fastBootDb;
        }
      }
    }

    const saved = localStorage.getItem("gbfleet_db_local");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.users && parsed.companies) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Could not load local DB cache from localStorage:", e);
  }
  return JSON.parse(JSON.stringify(dbTemplate));
})();

// Tracks the local write identifier to completely eliminate self-echo cycles and duplicate reads
let lastLocalWriteId: string = liveDb?._writeId || "";

// Helper to recursively extract base64 attachment files and save them to separate documents in Firestore,
// replacing the base64 content with lightweight references like "attachment_ref:attach_xxx".
// Also immediately caches the attachment locally so the current user never incurs a Firestore read to view it.
async function extractAndSaveAttachments(obj: any): Promise<void> {
  if (!obj || typeof obj !== "object") return;

  const keys = Object.keys(obj);
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.startsWith("data:") && val.includes(";base64,")) {
      const attachId = "attach_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
      const refKey = `attachment_ref:${attachId}`;
      // Immediately cache locally in memory and sessionStorage
      cacheAttachment(refKey, val);
      try {
        const docRef = doc(firestore, "system_state", attachId);
        await setDoc(docRef, { base64: val });
        console.log(`[Attachment Sync] Extracted and saved attachment to separate doc: ${attachId}`);
        obj[key] = refKey;
      } catch (err: any) {
        console.error(`[Attachment Sync] Failed to save separate attachment ${attachId}:`, err.message);
        // Fallback: keep original so we don't lose the data
      }
    } else if (val && typeof val === "object") {
      await extractAndSaveAttachments(val);
    }
  }
}

// Helper to recursively sanitize objects for Firestore by converting or deleting undefined values
function sanitizeForFirestore(obj: any): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (obj[i] === undefined) {
        obj[i] = null;
      } else if (obj[i] && typeof obj[i] === "object") {
        sanitizeForFirestore(obj[i]);
      }
    }
  } else {
    const keys = Object.keys(obj);
    for (const key of keys) {
      const val = obj[key];
      if (val === undefined) {
        delete obj[key];
      } else if (val && typeof val === "object") {
        sanitizeForFirestore(val);
      }
    }
  }
}

// Debounced, coalesced writer for Firestore
// Merges rapid sequential writes into a single Firestore network operation while keeping UI 100% instant
let debounceWriteTimer: any = null;
let pendingWriteResolvers: Array<() => void> = [];
let isWritingToFirestore = false;

async function executeRemoteWrite(allowReset: boolean = false): Promise<void> {
  if (isWritingToFirestore) return;
  // Data-loss guard: Never allow an uninitialized/empty template state to overwrite Firestore unless explicit reset
  if (!allowReset && (!liveDb?.companies || (liveDb.companies.length <= 1 && (!liveDb.trucks || liveDb.trucks.length === 0)))) {
    console.warn("[Firebase Client SDK] Guard blocked writing empty template state to Firestore.");
    return;
  }
  isWritingToFirestore = true;

  const currentResolvers = [...pendingWriteResolvers];
  pendingWriteResolvers = [];

  try {
    // 0) Prevent chat_logs bloat from pushing gbfleet_db over 1MB
    if (Array.isArray(liveDb.chat_logs) && liveDb.chat_logs.length > 30) {
      liveDb.chat_logs = liveDb.chat_logs.slice(-30);
    }

    // 1) Extract and save massive attachments to separate Firestore documents first
    await extractAndSaveAttachments(liveDb);

    // 2) Sanitize the database of any 'undefined' properties that Firestore rejects
    sanitizeForFirestore(liveDb);

    // 2.5) Update 2KB fast auth index in background for <50ms logins
    try {
      const authIndexPayload = {
        users: liveDb.users || [],
        companies: liveDb.companies || [],
        updatedAt: Date.now()
      };
      localStorage.setItem("gbfleet_auth_index_local", JSON.stringify(authIndexPayload));
      setDoc(doc(firestore, "system_state", "gbfleet_auth_index"), authIndexPayload).catch(() => {});
    } catch {}

    // 3) Persist clean, tiny database document to Firestore with a 4s timeout race
    const docRef = doc(firestore, "system_state", "gbfleet_db");
    const writePromise = setDoc(docRef, liveDb);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore write timeout")), 4000));
    try {
      await Promise.race([writePromise, timeoutPromise]);
      console.log("[Firebase Client SDK] Consolidated write to Firestore successfully completed.");
    } catch (timeoutErr) {
      console.warn("[Firebase Client SDK] Firestore write timed out or offline, saved locally.", timeoutErr);
    }
  } catch (err: any) {
    console.error("[Firebase Client SDK] Error: Failed to persist directly to Firestore.", err.message);
  } finally {
    isWritingToFirestore = false;
    currentResolvers.forEach(resolve => {
      try {
        resolve();
      } catch (e) {
        // ignore
      }
    });
    if (pendingWriteResolvers.length > 0) {
      scheduleRemoteWrite();
    }
  }
}

function scheduleRemoteWrite(): Promise<void> {
  return new Promise((resolve) => {
    pendingWriteResolvers.push(resolve);
    if (debounceWriteTimer) {
      clearTimeout(debounceWriteTimer);
    }
    // 300ms debounce collapses multiple consecutive form edits/clicks into 1 write
    debounceWriteTimer = setTimeout(() => {
      debounceWriteTimer = null;
      executeRemoteWrite();
    }, 300);
  });
}

/**
 * Persists changes made to liveDb.
 * 1) Instantly updates local memory and localStorage (zero latency for user).
 * 2) Immediately notifies reactive components.
 * 3) Debounces remote Firestore write to prevent read/write storms.
 */
export async function persistDB(flushImmediately: boolean = false): Promise<void> {
  // Generate local write tracking ID to prevent self-echo loops in onSnapshot
  const writeId = "w_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
  liveDb._writeId = writeId;
  liveDb._writeTimestamp = Date.now();
  lastLocalWriteId = writeId;

  // Save clean database locally immediately for 100% responsiveness & offline resilience
  try {
    localStorage.setItem("gbfleet_db_local", JSON.stringify(liveDb));
  } catch (e) {
    console.error("Failed to write DB to localStorage:", e);
  }

  // Notify reactive listeners across the app so all UI views update instantly
  notifyListeners();

  if (flushImmediately) {
    if (debounceWriteTimer) {
      clearTimeout(debounceWriteTimer);
      debounceWriteTimer = null;
    }
    return new Promise((resolve) => {
      pendingWriteResolvers.push(resolve);
      executeRemoteWrite();
    });
  }

  return scheduleRemoteWrite();
}

// Unified initialization & real-time sync with single-read on boot (no duplicate getDoc)
let snapshotUnsubscribe: (() => void) | null = null;
let initialPullPromise: Promise<void> | null = null;
let resolveInitialPull: (() => void) | null = null;

function initFirestoreLiveListener() {
  try {
    if (snapshotUnsubscribe) {
      snapshotUnsubscribe();
    }
    const docRef = doc(firestore, "system_state", "gbfleet_db");
    snapshotUnsubscribe = onSnapshot(docRef, (snap) => {
      const finishInitial = () => {
        if (resolveInitialPull) {
          resolveInitialPull();
          resolveInitialPull = null;
        }
      };

      if (!snap.exists()) {
        if (!snap.metadata.fromCache) {
          console.warn("[Firebase Client SDK] Remote gbfleet_db not found on server.");
          finishInitial();
        }
        return;
      }

      // 1) Ignore optimistic local writes already reflected in memory
      if (snap.metadata.hasPendingWrites) {
        finishInitial();
        return;
      }

      const remoteData = snap.data();
      if (!remoteData || !remoteData.users || !remoteData.companies) {
        finishInitial();
        return;
      }

      // 2) Self-echo prevention: If this snapshot confirms our own write, do not trigger a reload loop!
      if (remoteData._writeId && remoteData._writeId === lastLocalWriteId) {
        finishInitial();
        return;
      }

      // 3) Timestamp regression prevention (except when local cache is an empty template and remote is populated)
      const isLocalEmptyTemplate = (!liveDb.companies || liveDb.companies.length <= 1) && (!liveDb.trucks || liveDb.trucks.length === 0);
      const isRemotePopulated = (remoteData.companies && remoteData.companies.length > 1) || (remoteData.trucks && remoteData.trucks.length > 0);
      if (!isLocalEmptyTemplate && !isRemotePopulated && remoteData._writeTimestamp && liveDb._writeTimestamp && remoteData._writeTimestamp < liveDb._writeTimestamp) {
        finishInitial();
        return;
      }

      // 4) External update from another tab, device or user
      const allKeys = ["trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes", "gas_stations", "expense_companies", "chat_logs", "bills", "driver_payments", "driver_adjustments"];
      allKeys.forEach(key => {
        if (!remoteData[key]) {
          remoteData[key] = [];
        }
      });

      if (Array.isArray(remoteData.chat_logs) && remoteData.chat_logs.length > 30) {
        remoteData.chat_logs = remoteData.chat_logs.slice(-30);
      }

      liveDb = remoteData;
      if (remoteData._writeId) {
        lastLocalWriteId = remoteData._writeId;
      }

      try {
        localStorage.setItem("gbfleet_db_local", JSON.stringify(liveDb));
        localStorage.setItem(
          "gbfleet_auth_index_local",
          JSON.stringify({
            users: liveDb.users || [],
            companies: liveDb.companies || [],
            updatedAt: Date.now()
          })
        );
      } catch (e) {
        // ignore
      }

      console.log("[Firebase Client SDK] Genuine remote Firestore update received. Notifying subscribers.");
      finishInitial();
      notifyListeners();
    }, (error) => {
      console.warn("[Firebase Client SDK] Real-time snapshot listener error:", error.message);
      if (resolveInitialPull) {
        resolveInitialPull();
        resolveInitialPull = null;
      }
    });
  } catch (err: any) {
    console.warn("[Firebase Client SDK] Failed to set up snapshot listener:", err.message);
    if (resolveInitialPull) {
      resolveInitialPull();
      resolveInitialPull = null;
    }
  }
}

export function ensureDbPulled(): Promise<void> {
  if (!initialPullPromise) {
    initialPullPromise = new Promise((resolve) => {
      resolveInitialPull = resolve;
      // Resilient fallback: If offline or slow connection, unlock app after 2.5s using local cached DB
      setTimeout(() => {
        if (resolveInitialPull) {
          console.log("[Firebase Client SDK] Boot timeout - continuing with local database state.");
          resolveInitialPull();
          resolveInitialPull = null;
        }
      }, 2500);

      initFirestoreLiveListener();
    });
  }
  return initialPullPromise;
}

// Fast 2KB Auth Index pull (~40ms) so Login never waits on downloading the 800KB operational database
async function pullFastAuthIndex(): Promise<void> {
  try {
    const authDocRef = doc(firestore, "system_state", "gbfleet_auth_index");
    const snap = await getDoc(authDocRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data?.users) && Array.isArray(data?.companies)) {
        liveDb.users = data.users;
        liveDb.companies = data.companies;
        try {
          localStorage.setItem("gbfleet_auth_index_local", JSON.stringify(data));
        } catch {}
        return;
      }
    }
  } catch {}
}

// Backward-compatible alias for explicit refresh
export async function pullDB(forceFresh: boolean = false) {
  if (forceFresh) {
    try {
      const docRef = doc(firestore, "system_state", "gbfleet_db");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const remoteData = snap.data();
        if (remoteData && remoteData.users && remoteData.companies) {
          liveDb = remoteData;
          localStorage.setItem("gbfleet_db_local", JSON.stringify(liveDb));
          notifyListeners();
        }
      }
    } catch (e) {
      console.warn("pullDB explicit fetch error:", e);
    }
  }
  return ensureDbPulled();
}

// Kick off initial background sync:
// If user is already logged in, start immediately; if on the Login screen, let the Login screen paint first (<50ms),
// pull the tiny 2KB auth index at 200ms, and defer the heavy DB sync to 900ms in the background!
if (typeof window !== "undefined" && localStorage.getItem("gbfleet_user")) {
  ensureDbPulled();
} else {
  setTimeout(() => {
    pullFastAuthIndex().catch(() => {});
  }, 200);
  setTimeout(() => {
    ensureDbPulled().catch(() => {});
  }, 900);
}

// Helper to resolve request context dynamically
function resolveContext(headers: Record<string, string>) {
  const userId = headers["x-user-id"];
  if (!userId) {
    return { user: null, companyId: null, currentCompany: null };
  }

  const user = liveDb.users.find((u: any) => u.id === userId);
  if (!user) {
    return { user: null, companyId: null, currentCompany: null };
  }

  let resolvedCompanyId = user.companyId;
  if (user.role === "superadmin") {
    const impersonatedId = headers["x-impersonate-company-id"];
    if (impersonatedId && impersonatedId !== "comp_superadmin") {
      resolvedCompanyId = impersonatedId;
    }
  }

  const currentCompany = liveDb.companies.find((c: any) => c.id === resolvedCompanyId);

  return { user, companyId: resolvedCompanyId, currentCompany };
}

// ----------------------------------------------------
// CLIENT ENDPOINT EMULATOR
// This intercepts /api requests in main.tsx and dispatches them here.
// Returns a Promise<Response> object replicating Express fetch behavior.
// ----------------------------------------------------
export async function emulateApiCall(path: string, options: any = {}): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const headers = options.headers || {};
  const body = options.body ? JSON.parse(options.body) : {};

  // Normalize path by stripping query params
  const cleanPath = path.split("?")[0];

  // Stale-While-Revalidate: Never block /api/auth/login waiting for the 800KB operational DB!
  const hasHydratedCache =
    Array.isArray(liveDb?.users) &&
    liveDb.users.length > 0 &&
    ((Array.isArray(liveDb?.companies) && liveDb.companies.length > 1) ||
      (Array.isArray(liveDb?.trucks) && liveDb.trucks.length > 0));

  if (cleanPath === "/api/auth/login" || hasHydratedCache) {
    ensureDbPulled().catch(() => {});
  } else {
    await ensureDbPulled();
  }

  const ctx = resolveContext(headers);

  // Helper to return JSON response mock
  const jsonResponse = (data: any, status: number = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    // 1) GET /api/health
    if (cleanPath === "/api/health") {
      return jsonResponse({
        status: "ok",
        clientSdkActive: true,
        databaseId: firestoreDbId,
        usersCount: liveDb.users.length,
        companiesCount: liveDb.companies.length
      });
    }

    // 1.5) GET /api/auth/me (Server/Client Superadmin & Role verification)
    if (cleanPath === "/api/auth/me" && method === "GET") {
      if (!ctx.user) {
        return jsonResponse({ authorized: false, isSaaSAdmin: false, role: "guest" }, 401);
      }
      const isSaaSAdmin = ctx.user.role === "superadmin" || ctx.user.role === "saas_admin";
      return jsonResponse({
        authorized: true,
        isSaaSAdmin,
        role: ctx.user.role || "admin",
        uid: ctx.user.id,
        tenantId: ctx.companyId
      });
    }

    // 2) POST /api/auth/login (Direct 2KB Auth Index lookup + Stale-While-Revalidate cache population)
    if (cleanPath === "/api/auth/login" && method === "POST") {
      const emailStr = String(body.email || "").toLowerCase().trim();
      const passwordStr = String(body.password || "");

      let user = liveDb.users.find((u: any) => u.email?.toLowerCase() === emailStr);
      // Step A: Try 2KB gbfleet_auth_index first (~40ms) instead of downloading 800KB!
      if (!user) {
        await pullFastAuthIndex();
        user = liveDb.users.find((u: any) => u.email?.toLowerCase() === emailStr);
      }
      // Step B: Only fall back to full pullDB if still not found
      if (!user) {
        await pullDB(true);
        user = liveDb.users.find((u: any) => u.email?.toLowerCase() === emailStr);
      }
      if (!user) {
        return jsonResponse({ error: "E-mail ou senha incorretos." }, 401);
      }

      if (user.ativo === false) {
        return jsonResponse({ error: "Conta de usuário desativada pelo administrador." }, 403);
      }

      const correctPassword = String(user.password || "demo");
      if (correctPassword !== passwordStr) {
        return jsonResponse({ error: "E-mail ou senha incorretos." }, 401);
      }

      const rawCompany = liveDb.companies.find((c: any) => c.id === user.companyId) || { id: user.companyId, nome: "GBFleet Demo" };
      const company = sanitizeTenantPublicData(rawCompany);

      // Immediately hydrate Stale-While-Revalidate caches (<50ms on subsequent reloads)
      setCachedUserProfile(user.id, user);
      if (company?.id) {
        setCachedTenant(company.id, company);
      }

      const tokenPayload = btoa(
        JSON.stringify({
          uid: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.companyId,
          iat: Date.now()
        })
      );
      const token = `gbf_${tokenPayload}`;
      try {
        localStorage.setItem("gbfleet_session_token", token);
      } catch (e) {}

      return jsonResponse({ success: true, user, company, token });
    }

    // Auth validation middleware logic (Note: /api/reset is NO LONGER exempted from authentication!)
    if (!ctx.user) {
      return jsonResponse({ error: "Sessão expirada. Faça login novamente." }, 401);
    }

    // Multi-Tenant Zero-Trust Guard: Block cross-tenant body/query tampering for non-superadmin users
    const requestedTenantId = body?.tenantId || body?.companyId;
    if (
      requestedTenantId &&
      ctx.user &&
      ctx.user.role !== "superadmin" &&
      ctx.user.role !== "saas_admin" &&
      requestedTenantId !== ctx.companyId
    ) {
      return jsonResponse(
        { error: "Acesso negado (403 Forbidden): Violação de isolamento Multi-Tenant detectada." },
        403
      );
    }

    // 3) PUT /api/auth/profile
    if (cleanPath === "/api/auth/profile" && method === "PUT") {
      const dbUser = liveDb.users.find((u: any) => u.id === ctx.user.id);
      if (!dbUser) {
        return jsonResponse({ error: "Usuário não encontrado." }, 404);
      }

      if (body.nome) dbUser.nome = body.nome.trim();
      if (body.email) {
        const emailTrim = body.email.toLowerCase().trim();
        const existing = liveDb.users.find((u: any) => u.email?.toLowerCase() === emailTrim && u.id !== ctx.user.id);
        if (existing) {
          return jsonResponse({ error: "Este e-mail já está sendo usado por outro colega de empresa." }, 400);
        }
        dbUser.email = emailTrim;
      }
      if (body.password) {
        dbUser.password = body.password.trim();
      }

      let dbCompany = liveDb.companies.find((c: any) => c.id === dbUser.companyId);
      if (dbCompany) {
        if (body.logoUrl !== undefined) dbCompany.logoUrl = body.logoUrl;
        if (body.logoSize !== undefined) {
          const parsedSize = Number(body.logoSize);
          dbCompany.logoSize = !isNaN(parsedSize) && parsedSize >= 24 && parsedSize <= 160 ? parsedSize : 56;
        }
        invalidateTenantCache(dbCompany.id);
        setCachedTenant(dbCompany.id, sanitizeTenantPublicData(dbCompany));
      }

      setCachedUserProfile(dbUser.id, dbUser);
      await persistDB();
      return jsonResponse({ success: true, user: dbUser, company: dbCompany });
    }


    const getBrazilTodayIsoClient = (): string => {
      try {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(new Date());
      } catch {
        const brTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
        return brTime.toISOString().split("T")[0];
      }
    };

    // Helper to compute normalized licensing and billing fields for any company (tenant)
    const computeCompanyLicenseState = (c: any, mainUser?: any) => {
      const created = new Date(c.createdAt || new Date());
      const now = new Date();
      const trialDays = c.trialDays !== undefined ? Number(c.trialDays) : 30;
      const elapsedDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      const defaultDueDate = new Date(created.getTime() + trialDays * 86400000).toISOString().split("T")[0];

      const trialEndDate = c.trialEndDate || defaultDueDate;
      const planExpiresAt = c.planExpiresAt || c.dataVencimento || trialEndDate;
      const dataVencimento = planExpiresAt;
      const gracePeriodDays = c.gracePeriodDays !== undefined ? Number(c.gracePeriodDays) : 0;
      const dueDateDay =
        c.dueDateDay !== undefined
          ? Number(c.dueDateDay)
          : Number((planExpiresAt || "").split("-")[2]) || 10;

      const limiteCaminhoes = c.limiteCaminhoes ?? 10;
      const valorPorCaminhao = c.valorPorCaminhao ?? 30;
      const calculatedFee = limiteCaminhoes * valorPorCaminhao;
      const planPrice =
        c.planPrice !== undefined
          ? Number(c.planPrice)
          : c.monthlyFeeOverride !== undefined
          ? Number(c.monthlyFeeOverride)
          : c.valorMensalidade !== undefined
          ? Number(c.valorMensalidade)
          : calculatedFee;
      const monthlyFeeOverride = c.monthlyFeeOverride !== undefined ? Number(c.monthlyFeeOverride) : planPrice;
      const valorMensalidade = planPrice;

      const promoEnabled = Boolean(c.promoEnabled);
      const promoFirstPaymentAmount = c.promoFirstPaymentAmount !== undefined ? Number(c.promoFirstPaymentAmount) : 0;
      const effectiveChargeAmount =
        promoEnabled && promoFirstPaymentAmount > 0
          ? promoFirstPaymentAmount
          : planPrice > 0
          ? planPrice
          : 149.9;

      const planName =
        c.planName ||
        (c.plano === "Basic"
          ? "Plano Frota Essencial"
          : c.plano === "Pro"
          ? "Plano Transportadora Pro"
          : c.plano
          ? `Plano ${c.plano}`
          : "Plano Transportadora Pro");

      const isActive = c.isActive !== undefined ? Boolean(c.isActive) : c.status !== "inativo";

      // Calculate exact expiration vs today and grace period cutoff (end of day 23:59:59 in Brazil timezone -03:00)
      const todayIso = getBrazilTodayIsoClient();
      const todayStart = new Date(`${todayIso}T00:00:00-03:00`);
      const expStart = new Date(`${planExpiresAt}T00:00:00-03:00`);
      const daysUntilExpiration = isNaN(expStart.getTime())
        ? Math.max(0, trialDays - elapsedDays)
        : Math.round((expStart.getTime() - todayStart.getTime()) / 86400000);

      const cutoffDate = new Date(`${planExpiresAt}T23:59:59-03:00`);
      const cutoffTimestamp =
        !isNaN(cutoffDate.getTime()) && gracePeriodDays > 0
          ? cutoffDate.getTime() + gracePeriodDays * 86400000
          : cutoffDate.getTime();
      const isPastGracePeriod = !isNaN(cutoffTimestamp) ? now.getTime() > cutoffTimestamp : false;

      const rawPlanStatus: "active" | "trial" | "suspended" | "canceled" =
        c.planStatus || (!isActive ? "suspended" : c.pago ? "active" : "trial");

      const isManuallySuspended =
        !isActive ||
        c.status === "inativo" ||
        rawPlanStatus === "suspended" ||
        rawPlanStatus === "canceled";

      const isBlocked = isManuallySuspended || isPastGracePeriod;
      const isExpiringWarning = !isBlocked && daysUntilExpiration <= 5;

      let licenseBadge: "active" | "trial" | "expiring" | "expired" | "suspended" = "active";
      if (isManuallySuspended) {
        licenseBadge = "suspended";
      } else if (isPastGracePeriod) {
        licenseBadge = "expired";
      } else if (daysUntilExpiration <= 5) {
        licenseBadge = "expiring";
      } else if (rawPlanStatus === "trial" || !c.pago) {
        licenseBadge = "trial";
      }

      return {
        ...c,
        planName,
        planStatus: rawPlanStatus,
        isActive,
        status: isActive ? "ativo" : "inativo",
        planExpiresAt,
        dataVencimento,
        trialDays,
        trialEndDate,
        dueDateDay,
        limiteCaminhoes,
        valorPorCaminhao,
        planPrice,
        monthlyFeeOverride,
        valorMensalidade,
        promoEnabled,
        promoFirstPaymentAmount,
        effectiveChargeAmount,
        gracePeriodDays,
        cnpjCpf: c.cnpjCpf || "",
        ownerName: c.ownerName || mainUser?.nome || c.nome || "",
        ownerEmail: c.ownerEmail || mainUser?.email || "",
        ownerPhone: c.ownerPhone || "",
        daysRemaining: Math.max(0, daysUntilExpiration),
        daysUntilExpiration,
        isPastGracePeriod,
        isBlocked,
        isExpiringWarning,
        licenseBadge
      };
    };

    const computeNext30Days = (currentExpiresAt?: string): string => {
      const todayIso = getBrazilTodayIsoClient();
      const today = new Date(`${todayIso}T12:00:00-03:00`);
      let baseDate = today;
      if (currentExpiresAt && /^\d{4}-\d{2}-\d{2}$/.test(currentExpiresAt)) {
        const parsed = new Date(`${currentExpiresAt}T12:00:00-03:00`);
        if (!isNaN(parsed.getTime()) && parsed.getTime() > today.getTime()) {
          baseDate = parsed;
        }
      }
      const nextDate = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      try {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(nextDate);
      } catch {
        return nextDate.toISOString().split("T")[0];
      }
    };

    // 3.5) POST /api/saas/payment/confirm-unlock (Zero-Trust: Verifies paymentId on backend MP API first!)
    if (cleanPath === "/api/saas/payment/confirm-unlock" && method === "POST") {
      const targetTenantId = body.tenantId || ctx.companyId;
      const paymentId = String(body.paymentId || "").trim();
      if (!paymentId || !/^\d+$/.test(paymentId)) {
        return jsonResponse(
          { error: "Desbloqueio bloqueado (403 Forbidden): ID de pagamento numérico válido é obrigatório." },
          403
        );
      }

      const comp = (liveDb.companies || []).find((c: any) => c.id === targetTenantId);
      if (!comp) {
        return jsonResponse({ error: "Empresa não encontrada para desbloqueio." }, 404);
      }

      // Verify on the server-side Mercado Pago endpoint before allowing local unlock
      let serverNewExpiresAt = body.newExpiresAt || "";
      try {
        const checkRes = await fetch(`/api/saas/payment/check-status/${encodeURIComponent(paymentId)}`);
        if (!checkRes.ok) {
          return jsonResponse(
            { error: "Desbloqueio bloqueado: Pagamento não confirmado na API oficial do Mercado Pago." },
            403
          );
        }
        const checkData = await checkRes.json();
        if (checkData.status !== "approved" || checkData.tenantId !== targetTenantId) {
          return jsonResponse(
            { error: "Desbloqueio bloqueado: O pagamento informado ainda não consta como aprovado." },
            403
          );
        }
        if (checkData.newExpiresAt) {
          serverNewExpiresAt = checkData.newExpiresAt;
        }
      } catch {
        return jsonResponse(
          { error: "Falha ao validar autenticidade do pagamento junto ao servidor." },
          502
        );
      }

      // Always apply the unlocked state in local memory even if server check-status already set lastApprovedPaymentId
      const nextExp =
        serverNewExpiresAt ||
        (comp.lastApprovedPaymentId === paymentId && comp.planExpiresAt
          ? comp.planExpiresAt
          : computeNext30Days(comp.planExpiresAt || comp.dataVencimento));

      comp.planExpiresAt = nextExp;
      comp.dataVencimento = nextExp;
      comp.planStatus = "active";
      comp.isActive = true;
      comp.status = "ativo";
      comp.pago = true;
      if (comp.promoEnabled) {
        comp.promoEnabled = false;
      }
      comp.lastApprovedPaymentId = paymentId;
      comp.lastPaymentAt = new Date().toISOString();

      invalidateTenantCache(comp.id);
      await persistDB(true);

      const mainUser = (liveDb.users || []).find((u: any) => u.companyId === comp.id && u.role === "admin");
      const updatedState = computeCompanyLicenseState(sanitizeTenantPublicData(comp), mainUser);
      setCachedTenant(comp.id, updatedState);
      try {
        localStorage.setItem("gbfleet_company", JSON.stringify(updatedState));
      } catch {}
      return jsonResponse({
        success: true,
        company: updatedState,
        newExpiresAt: nextExp
      });
    }



    // 4) GET /api/data
    if (cleanPath === "/api/data" && method === "GET") {
      const rawCompany = ctx.currentCompany;
      const mainAdmin = rawCompany
        ? (liveDb.users || []).find((u: any) => u.companyId === rawCompany.id && u.role === "admin")
        : null;
      const currentCompany = rawCompany ? computeCompanyLicenseState(rawCompany, mainAdmin) : null;

      let isBlocked = false;
      let daysRemaining = currentCompany?.daysRemaining ?? 30;

      if (currentCompany && ctx.user.role !== "superadmin") {
        isBlocked = currentCompany.isBlocked;
      }

      if (isBlocked) {
        return jsonResponse({
          blocked: true,
          currentUser: ctx.user,
          company: currentCompany,
          daysRemaining,
          trucks: [],
          drivers: [],
          fuel_logs: [],
          expenses: [],
          cash_flow: [],
          freights: [],
          maintenance_alerts: [],
          routes: [],
          categories_entrada: [],
          categories_saida: [],
          chat_logs: []
        });
      }

      const targetCompId = ctx.companyId;
      const filteredTrucks = (liveDb.trucks || []).filter((t: any) => t.companyId === targetCompId);
      const filteredDrivers = (liveDb.drivers || []).filter((d: any) => d.companyId === targetCompId);
      const filteredFuelLogs = (liveDb.fuel_logs || []).filter((f: any) => f.companyId === targetCompId);
      const filteredExpenses = (liveDb.expenses || []).filter((e: any) => e.companyId === targetCompId);
      const filteredCashFlow = (liveDb.cash_flow || []).filter((c: any) => c.companyId === targetCompId);
      const filteredFreights = (liveDb.freights || []).filter((f: any) => f.companyId === targetCompId);
      const filteredMaintenanceAlerts = (liveDb.maintenance_alerts || []).filter((m: any) => m.companyId === targetCompId);
      const filteredRoutes = (liveDb.routes || []).filter((r: any) => r.companyId === targetCompId);
      const filteredGasStations = (liveDb.gas_stations || []).filter((g: any) => g.companyId === targetCompId);
      const filteredExpenseCompanies = (liveDb.expense_companies || []).filter((ec: any) => ec.companyId === targetCompId);
      const filteredDriverPayments = (liveDb.driver_payments || []).filter((dp: any) => dp.companyId === targetCompId);
      const filteredDriverAdjustments = (liveDb.driver_adjustments || []).filter((da: any) => da.companyId === targetCompId);

      const categoriesEntrada = currentCompany?.categories_entrada || liveDb.categories_entrada || [];
      let categoriesSaida = (currentCompany?.categories_saida || liveDb.categories_saida || []).filter((c: string) => c !== "Diesel (Abastecimento)");
      if (!categoriesSaida.includes("Diesel S10 (Abastecimento)")) categoriesSaida.unshift("Diesel S10 (Abastecimento)");
      if (!categoriesSaida.includes("Diesel S500 (Abastecimento)")) categoriesSaida.splice(1, 0, "Diesel S500 (Abastecimento)");

      // Sanitize legacy "Diesel (Abastecimento)" entries in cash_flow and expenses
      const sanitizedCashFlow = filteredCashFlow.map((c: any) => {
        if (c.categoria === "Diesel (Abastecimento)") {
          return { ...c, categoria: c.descricao?.includes("S500") ? "Diesel S500 (Abastecimento)" : "Diesel S10 (Abastecimento)" };
        }
        return c;
      });

      const sanitizedExpenses = filteredExpenses.map((e: any) => {
        if (e.tipo === "Diesel (Abastecimento)") {
          return { ...e, tipo: e.descritivo?.includes("S500") || e.obs?.includes("S500") ? "Diesel S500 (Abastecimento)" : "Diesel S10 (Abastecimento)" };
        }
        return e;
      });

      return jsonResponse({
        currentUser: ctx.user,
        company: currentCompany,
        companies: ctx.user.role === "superadmin" ? liveDb.companies.filter((c: any) => c.id !== "comp_superadmin") : undefined,
        trucks: filteredTrucks,
        drivers: filteredDrivers,
        fuel_logs: filteredFuelLogs,
        expenses: sanitizedExpenses,
        cash_flow: sanitizedCashFlow,
        freights: filteredFreights,
        maintenance_alerts: filteredMaintenanceAlerts,
        routes: filteredRoutes,
        gas_stations: filteredGasStations,
        expense_companies: filteredExpenseCompanies,
        driver_payments: filteredDriverPayments,
        driver_adjustments: filteredDriverAdjustments,
        categories_entrada: categoriesEntrada,
        categories_saida: categoriesSaida,
        chat_logs: (liveDb.chat_logs || []).filter((cl: any) => cl.companyId === targetCompId)
      });
    }

    // 5) GET /api/superadmin/companies
    if (cleanPath === "/api/superadmin/companies" && method === "GET") {
      if (ctx.user.role !== "superadmin") {
        return jsonResponse({ error: "Não autorizado." }, 403);
      }
      const list = (liveDb.companies || [])
        .filter((c: any) => c.id !== "comp_superadmin")
        .map((c: any) => {
          const truckCount = (liveDb.trucks || []).filter((t: any) => t.companyId === c.id).length;
          const driverCount = (liveDb.drivers || []).filter((d: any) => d.companyId === c.id).length;
          const freightCount = (liveDb.freights || []).filter((f: any) => f.companyId === c.id).length;
          const userCount = (liveDb.users || []).filter((u: any) => u.companyId === c.id).length;
          const mainUser = (liveDb.users || []).find((u: any) => u.companyId === c.id && u.role === "admin");

          const entries = (liveDb.cash_flow || [])
            .filter((cf: any) => cf.companyId === c.id && cf.tipo === "entrada")
            .reduce((sum: number, cf: any) => sum + (Number(cf.valor) || 0), 0);
          const egress = (liveDb.cash_flow || [])
            .filter((cf: any) => cf.companyId === c.id && cf.tipo === "saida")
            .reduce((sum: number, cf: any) => sum + (Number(cf.valor) || 0), 0);

          const normalized = computeCompanyLicenseState(c, mainUser);

          return {
            ...normalized,
            truckCount,
            driverCount,
            freightCount,
            userCount,
            balance: entries - egress,
            adminUser: mainUser ? {
              id: mainUser.id,
              nome: mainUser.nome,
              email: mainUser.email
            } : null
          };
        });

      return jsonResponse(list);
    }

    // 6) POST /api/superadmin/companies
    if (cleanPath === "/api/superadmin/companies" && method === "POST") {
      if (ctx.user.role !== "superadmin") {
        return jsonResponse({ error: "Não autorizado." }, 403);
      }

      const {
        nome,
        adminNome,
        adminEmail,
        adminPassword,
        plano,
        planName,
        planStatus,
        isActive,
        planExpiresAt,
        status,
        pago,
        trialDays,
        trialEndDate,
        dueDateDay,
        monthlyFeeOverride,
        planPrice,
        promoEnabled,
        promoFirstPaymentAmount,
        gracePeriodDays,
        cnpjCpf,
        ownerName,
        ownerEmail,
        ownerPhone,
        dataVencimento,
        limiteCaminhoes,
        valorPorCaminhao,
        valorMensalidade
      } = body;
      if (!nome || !adminEmail) {
        return jsonResponse({ error: "Nome da empresa e e-mail do admin são obrigatórios." }, 400);
      }

      const emailLower = adminEmail.toLowerCase().trim();
      const userExists = liveDb.users.some((u: any) => u.email?.toLowerCase() === emailLower);
      if (userExists) {
        return jsonResponse({ error: "E-mail de administrador já cadastrado no sistema." }, 400);
      }

      const createdDate = new Date();
      const trialDaysNum = trialDays !== undefined ? Number(trialDays) : 30;
      const defaultDueDate = new Date(createdDate.getTime() + trialDaysNum * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const limiteCaminhoesNum = limiteCaminhoes !== undefined ? Number(limiteCaminhoes) : 10;
      const valorPorCaminhaoNum = valorPorCaminhao !== undefined ? Number(valorPorCaminhao) : 30;
      const valorMensalidadeNum =
        planPrice !== undefined ? Number(planPrice) :
        monthlyFeeOverride !== undefined ? Number(monthlyFeeOverride) :
        valorMensalidade !== undefined ? Number(valorMensalidade) :
        (limiteCaminhoesNum * valorPorCaminhaoNum);

      const effectiveDueDate = planExpiresAt || dataVencimento || defaultDueDate;
      const activeBool = isActive !== undefined ? Boolean(isActive) : (status !== "inativo");
      const resolvedStatus = planStatus || (pago ? "active" : "trial");

      const newCompany = {
        id: "comp_" + Math.random().toString(36).substr(2, 9),
        nome: nome.trim(),
        plano: plano || "Pro",
        planName: planName || (plano ? `Plano ${plano}` : "Plano Transportadora Pro"),
        planStatus: resolvedStatus,
        isActive: activeBool,
        createdAt: createdDate.toISOString(),
        status: activeBool ? "ativo" : "inativo",
        pago: pago !== undefined ? Boolean(pago) : resolvedStatus === "active",
        trialDays: trialDaysNum,
        trialEndDate: trialEndDate || defaultDueDate,
        planExpiresAt: effectiveDueDate,
        dataVencimento: effectiveDueDate,
        dueDateDay: dueDateDay !== undefined ? Number(dueDateDay) : (Number(effectiveDueDate.split("-")[2]) || 10),
        monthlyFeeOverride: valorMensalidadeNum,
        planPrice: valorMensalidadeNum,
        valorMensalidade: valorMensalidadeNum,
        promoEnabled: Boolean(promoEnabled),
        promoFirstPaymentAmount: promoFirstPaymentAmount !== undefined ? Number(promoFirstPaymentAmount) : 0,
        gracePeriodDays: gracePeriodDays !== undefined ? Number(gracePeriodDays) : 0,
        cnpjCpf: cnpjCpf ? String(cnpjCpf).trim() : "",
        ownerName: ownerName ? String(ownerName).trim() : (adminNome ? adminNome.trim() : nome.trim()),
        ownerEmail: ownerEmail ? String(ownerEmail).toLowerCase().trim() : emailLower,
        ownerPhone: ownerPhone ? String(ownerPhone).trim() : "",
        supportCode: null,
        supportCodeCreatedAt: null,
        supportAuthorizedUntil: null,
        limiteCaminhoes: limiteCaminhoesNum,
        valorPorCaminhao: valorPorCaminhaoNum
      };

      const newAdmin = {
        id: "usr_" + Math.random().toString(36).substr(2, 9),
        companyId: newCompany.id,
        role: "admin",
        nome: adminNome ? adminNome.trim() : "Administrador",
        email: emailLower,
        password: adminPassword ? adminPassword.trim() : "demo"
      };

      liveDb.companies.push(newCompany);
      liveDb.users.push(newAdmin);

      await persistDB(true);
      return jsonResponse({ success: true, company: computeCompanyLicenseState(newCompany, newAdmin), admin: newAdmin });
    }

    // 6.5) POST /api/superadmin/companies/:id/renew (+30 Days Manual Renewal)
    if (cleanPath.endsWith("/renew") && cleanPath.startsWith("/api/superadmin/companies/") && method === "POST") {
      if (ctx.user.role !== "superadmin") {
        return jsonResponse({ error: "Não autorizado." }, 403);
      }
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 2];
      const comp = (liveDb.companies || []).find((c: any) => c.id === targetId);
      if (!comp) {
        return jsonResponse({ error: "Empresa não encontrada." }, 404);
      }

      const nextExp = computeNext30Days(comp.planExpiresAt || comp.dataVencimento);
      comp.planExpiresAt = nextExp;
      comp.dataVencimento = nextExp;
      comp.planStatus = "active";
      comp.isActive = true;
      comp.status = "ativo";
      comp.pago = true;
      comp.lastPaymentAt = new Date().toISOString();

      await persistDB(true);
      const mainUser = (liveDb.users || []).find((u: any) => u.companyId === comp.id && u.role === "admin");
      const renewedComp = computeCompanyLicenseState(sanitizeTenantPublicData(comp), mainUser);
      invalidateTenantCache(comp.id);
      setCachedTenant(comp.id, renewedComp);
      return jsonResponse({
        success: true,
        company: renewedComp,
        newExpiresAt: nextExp
      });
    }

    // 6.6) POST /api/superadmin/companies/:id/toggle-status (Quick Manual Block / Unblock)
    if (cleanPath.endsWith("/toggle-status") && cleanPath.startsWith("/api/superadmin/companies/") && method === "POST") {
      if (ctx.user.role !== "superadmin") {
        return jsonResponse({ error: "Não autorizado." }, 403);
      }
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 2];
      const comp = (liveDb.companies || []).find((c: any) => c.id === targetId);
      if (!comp) {
        return jsonResponse({ error: "Empresa não encontrada." }, 404);
      }

      const mainUser = (liveDb.users || []).find((u: any) => u.companyId === comp.id && u.role === "admin");
      const currentState = computeCompanyLicenseState(comp, mainUser);

      if (currentState.isBlocked) {
        // Unblock company
        comp.isActive = true;
        comp.status = "ativo";
        comp.planStatus = "active";
        comp.pago = true;
        // If it was blocked due to past expiration date, advance expiration by +30 days so it unlocks cleanly
        if (currentState.isPastGracePeriod) {
          const nextExp = computeNext30Days(comp.planExpiresAt || comp.dataVencimento);
          comp.planExpiresAt = nextExp;
          comp.dataVencimento = nextExp;
        }
      } else {
        // Block / Suspend company manually
        comp.isActive = false;
        comp.status = "inativo";
        comp.planStatus = "suspended";
      }

      await persistDB(true);
      const toggledComp = computeCompanyLicenseState(sanitizeTenantPublicData(comp), mainUser);
      invalidateTenantCache(comp.id);
      setCachedTenant(comp.id, toggledComp);
      return jsonResponse({
        success: true,
        company: toggledComp
      });
    }


    // 7) PUT /api/superadmin/companies/:id
    if (cleanPath.startsWith("/api/superadmin/companies/") && method === "PUT") {
      if (ctx.user.role !== "superadmin") {
        return jsonResponse({ error: "Não autorizado." }, 403);
      }

      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];

      const comp = liveDb.companies.find((c: any) => c.id === targetId);
      if (!comp) {
        return jsonResponse({ error: "Empresa não encontrada." }, 404);
      }

      if (body.nome !== undefined) comp.nome = body.nome.trim();
      if (body.plano !== undefined) comp.plano = body.plano;
      if (body.planName !== undefined) comp.planName = body.planName.trim();
      if (body.status !== undefined) {
        comp.status = body.status;
        comp.isActive = body.status === "ativo";
      }
      if (body.isActive !== undefined) {
        comp.isActive = Boolean(body.isActive);
        comp.status = Boolean(body.isActive) ? "ativo" : "inativo";
      }
      if (body.planStatus !== undefined) {
        comp.planStatus = body.planStatus;
        if (body.planStatus === "suspended" || body.planStatus === "canceled") {
          comp.isActive = false;
          comp.status = "inativo";
        } else if (body.isActive === undefined && body.status === undefined) {
          comp.isActive = true;
          comp.status = "ativo";
        }
      }
      if (body.pago !== undefined) comp.pago = Boolean(body.pago);
      if (body.trialDays !== undefined) {
        const val = Number(body.trialDays);
        comp.trialDays = isNaN(val) ? 30 : val;
      }
      if (body.trialEndDate !== undefined) comp.trialEndDate = body.trialEndDate;
      if (body.createdAt !== undefined) comp.createdAt = body.createdAt;
      if (body.dataVencimento !== undefined) {
        comp.dataVencimento = body.dataVencimento;
        comp.planExpiresAt = body.dataVencimento;
      }
      if (body.planExpiresAt !== undefined) {
        comp.planExpiresAt = body.planExpiresAt;
        comp.dataVencimento = body.planExpiresAt;
      }
      if (body.dueDateDay !== undefined) comp.dueDateDay = Number(body.dueDateDay) || 10;
      if (body.gracePeriodDays !== undefined) comp.gracePeriodDays = Number(body.gracePeriodDays) || 0;
      if (body.promoEnabled !== undefined) comp.promoEnabled = Boolean(body.promoEnabled);
      if (body.promoFirstPaymentAmount !== undefined) comp.promoFirstPaymentAmount = Number(body.promoFirstPaymentAmount) || 0;
      if (body.cnpjCpf !== undefined) comp.cnpjCpf = String(body.cnpjCpf).trim();
      if (body.ownerName !== undefined) comp.ownerName = String(body.ownerName).trim();
      if (body.ownerEmail !== undefined) comp.ownerEmail = String(body.ownerEmail).toLowerCase().trim();
      if (body.ownerPhone !== undefined) comp.ownerPhone = String(body.ownerPhone).trim();
      
      if (body.limiteCaminhoes !== undefined) {
        const parsedLim = Number(body.limiteCaminhoes);
        comp.limiteCaminhoes = isNaN(parsedLim) ? 10 : parsedLim;
      }
      if (body.valorPorCaminhao !== undefined) {
        const parsedVal = Number(body.valorPorCaminhao);
        comp.valorPorCaminhao = isNaN(parsedVal) ? 30 : parsedVal;
      }

      const rawFee =
        body.planPrice !== undefined
          ? Number(body.planPrice)
          : body.monthlyFeeOverride !== undefined
          ? Number(body.monthlyFeeOverride)
          : body.valorMensalidade !== undefined
          ? Number(body.valorMensalidade)
          : undefined;
      if (rawFee !== undefined && !isNaN(rawFee)) {
        comp.valorMensalidade = rawFee;
        comp.planPrice = rawFee;
        comp.monthlyFeeOverride = rawFee;
      }

      // Associated Admin user edit (dados cadastrais e redefinição de senha)
      const companyAdmin = liveDb.users.find((u: any) => u.companyId === targetId && u.role === "admin");
      if (companyAdmin) {
        if (body.adminNome !== undefined && body.adminNome.trim() !== "") {
          companyAdmin.nome = body.adminNome.trim();
        }
        if (body.adminEmail !== undefined && body.adminEmail.trim() !== "") {
          const emailClean = body.adminEmail.toLowerCase().trim();
          if (emailClean !== companyAdmin.email?.toLowerCase().trim()) {
            const emailExists = liveDb.users.some((u: any) => u.email?.toLowerCase() === emailClean && u.id !== companyAdmin.id);
            if (emailExists) {
              return jsonResponse({ error: "O e-mail fornecido já está em uso por outro usuário." }, 400);
            }
            companyAdmin.email = emailClean;
          }
        }
        if (body.adminPassword !== undefined && body.adminPassword.trim() !== "") {
          companyAdmin.password = body.adminPassword.trim();
        }
      }

      await persistDB(true);
      const updatedComp = computeCompanyLicenseState(sanitizeTenantPublicData(comp), companyAdmin);
      invalidateTenantCache(comp.id);
      setCachedTenant(comp.id, updatedComp);
      return jsonResponse({ success: true, company: updatedComp });
    }


    // 8) DELETE /api/superadmin/companies/:id
    if (cleanPath.startsWith("/api/superadmin/companies/") && method === "DELETE") {
      if (ctx.user.role !== "superadmin") {
        return jsonResponse({ error: "Não autorizado." }, 403);
      }

      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];

      liveDb.companies = liveDb.companies.filter((c: any) => c.id !== targetId);
      liveDb.users = liveDb.users.filter((u: any) => u.companyId !== targetId);
      
      // Cascade delete rest data
      const subKeys = ["trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes", "gas_stations", "expense_companies", "chat_logs"];
      subKeys.forEach(k => {
        if (liveDb[k]) {
          liveDb[k] = liveDb[k].filter((item: any) => item.companyId !== targetId);
        }
      });

      await persistDB();
      return jsonResponse({ success: true });
    }

    // 9) POST /api/superadmin/verify-support-code
    if (cleanPath === "/api/superadmin/verify-support-code" && method === "POST") {
      if (ctx.user.role !== "superadmin") {
        return jsonResponse({ error: "Não autorizado." }, 403);
      }

      const { companyId, code } = body;
      const comp = liveDb.companies.find((c: any) => c.id === companyId);
      if (!comp) {
        return jsonResponse({ error: "Empresa não cadastrada." }, 404);
      }

      if (!comp.supportCode || comp.supportCode !== code) {
        return jsonResponse({ error: "Código de autorização inválido." }, 400);
      }

      // Authorize for 1 hour
      const authUntil = new Date();
      authUntil.setHours(authUntil.getHours() + 1);
      comp.supportAuthorizedUntil = authUntil.toISOString();

      await persistDB();
      return jsonResponse({ success: true, authorizedUntil: comp.supportAuthorizedUntil });
    }

    // 10) POST /api/support/generate (Alphanumeric 6-char code with 15-min expiration)
    if (cleanPath === "/api/support/generate" && method === "POST") {
      const activeComp = ctx.currentCompany;
      if (!activeComp) {
        return jsonResponse({ error: "Empresa não resolvida." }, 404);
      }

      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let randomPart = "";
      for (let i = 0; i < 6; i++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const code = "GB-" + randomPart;
      activeComp.supportCode = code;
      activeComp.supportCodeCreatedAt = new Date().toISOString();
      activeComp.supportAuthorizedUntil = null;

      await persistDB();
      return jsonResponse({ success: true, supportCode: code });
    }

    // 11) POST /api/reset (Strictly locked to Superadmin with explicit confirmation)
    if (cleanPath === "/api/reset" && method === "POST") {
      if (!ctx.user || (ctx.user.role !== "superadmin" && ctx.user.role !== "saas_admin")) {
        return jsonResponse(
          { error: "Acesso negado (403 Forbidden): Apenas o Superadmin pode executar reset de ambiente." },
          403
        );
      }
      if (body.confirmReset !== "RESET_CONFIRMED_BY_SUPERADMIN") {
        return jsonResponse(
          { error: "Confirmação de segurança obrigatória (confirmReset) ausente." },
          400
        );
      }
      const baseObj = JSON.parse(JSON.stringify(dbTemplate));
      const superadmin = liveDb.users.find((u: any) => u.role === "superadmin");
      if (superadmin) {
        baseObj.users = baseObj.users.filter((u: any) => u.role !== "superadmin");
        baseObj.users.push(superadmin);
      }
      liveDb = baseObj;
      await persistDB();
      return jsonResponse({ success: true });
    }


    // 12) POST /api/fuel_logs
    if (cleanPath === "/api/fuel_logs" && method === "POST") {
      const logId = "fuel_" + Math.random().toString(36).substr(2, 9);
      const newLog = {
        id: logId,
        companyId: ctx.companyId,
        truckId: body.truckId,
        driverId: body.driverId || "",
        gasStationId: body.gasStationId || "",
        litros: body.litros ? Number(body.litros) : 0,
        valor: body.valor ? Number(body.valor) : 0,
        km: Number(body.km),
        data: body.data || new Date().toISOString().split("T")[0],
        comprovante: body.comprovante || "",
        tipoDiesel: body.tipoDiesel || "S10",
        litrosArla: body.litrosArla ? Number(body.litrosArla) : undefined,
        valorArla: body.valorArla ? Number(body.valorArla) : undefined
      };

      liveDb.fuel_logs.push(newLog);

      // Trigger automatic operation expense
      if (newLog.valor > 0) {
        const rawExpense = {
          id: "exp_" + Math.random().toString(36).substr(2, 9),
          fuelLogId: logId,
          companyId: ctx.companyId,
          truckId: body.truckId,
          tipo: `Diesel ${body.tipoDiesel || "S10"} (Abastecimento)`,
          valor: Number(body.valor),
          data: body.data || new Date().toISOString().split("T")[0],
          documento: "Auto-Abastecimento",
          descritivo: `Abastecimento automático via painel / chat (${body.litros} Litros de Diesel ${body.tipoDiesel || "S10"})`
        };
        liveDb.expenses.push(rawExpense);

        // Trigger auto flow cash
        const rawCash = {
          id: "cash_" + Math.random().toString(36).substr(2, 9),
          fuelLogId: logId,
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: `Diesel ${body.tipoDiesel || "S10"} (Abastecimento)`,
          valor: Number(body.valor),
          data: body.data || new Date().toISOString().split("T")[0],
          descricao: `Combustível Placa ${body.truckId} (${body.tipoDiesel || "S10"})`
        };
        liveDb.cash_flow.push(rawCash);
      }

      // Trigger Arla expense and cash flow if valorArla is set
      if (body.valorArla && Number(body.valorArla) > 0) {
        const rawExpenseArla = {
          id: "exp_" + Math.random().toString(36).substr(2, 9),
          fuelLogId: logId,
          companyId: ctx.companyId,
          truckId: body.truckId,
          tipo: `Arla 32 (Abastecimento)`,
          valor: Number(body.valorArla),
          data: body.data || new Date().toISOString().split("T")[0],
          documento: "Auto-Abastecimento-Arla",
          descritivo: `Abastecimento automático via painel / chat (${body.litrosArla || 0} Litros de Arla 32)`
        };
        liveDb.expenses.push(rawExpenseArla);

        const rawCashArla = {
          id: "cash_arla_" + logId,
          fuelLogId: logId,
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Arla 32 (Abastecimento)",
          valor: Number(body.valorArla),
          data: body.data || new Date().toISOString().split("T")[0],
          descricao: `Arla Placa ${body.truckId} (${body.litrosArla || 0}L)`
        };
        liveDb.cash_flow.push(rawCashArla);
      }

      await persistDB();
      return jsonResponse({ success: true, fuelLog: newLog });
    }

    if (cleanPath.startsWith("/api/fuel_logs/") && method === "PUT") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];

      const matchLog = liveDb.fuel_logs.find((f: any) => f.id === targetId && f.companyId === ctx.companyId);
      if (!matchLog) return jsonResponse({ error: "Abastecimento não encontrado ou acesso negado." }, 404);

      const oldLog = { ...matchLog };

      matchLog.truckId = body.truckId;
      matchLog.driverId = body.driverId || "";
      matchLog.gasStationId = body.gasStationId || "";
      matchLog.litros = body.litros ? Number(body.litros) : 0;
      matchLog.valor = body.valor ? Number(body.valor) : 0;
      matchLog.km = Number(body.km);
      matchLog.data = body.data || new Date().toISOString().split("T")[0];
      matchLog.comprovante = body.comprovante || "";
      matchLog.tipoDiesel = body.tipoDiesel || "S10";
      matchLog.litrosArla = body.litrosArla ? Number(body.litrosArla) : undefined;
      matchLog.valorArla = body.valorArla ? Number(body.valorArla) : undefined;

      // Filter out old diesel/arla automatic expense entries for this fuel log (scoped to ctx.companyId)
      liveDb.expenses = liveDb.expenses.filter((e: any) => {
        if (e.companyId !== ctx.companyId) return true;
        const isFuelSync = e.fuelLogId === targetId || (e.documento === "Auto-Abastecimento" && e.truckId === oldLog.truckId && Number(e.valor) === Number(oldLog.valor) && e.data === oldLog.data);
        const isArlaSync = e.fuelLogId === targetId && (e.tipo?.includes("Arla") || e.documento === "Auto-Abastecimento-Arla");
        return !isFuelSync && !isArlaSync;
      });

      // Filter out old diesel/arla automatic cash flow entries for this fuel log (scoped to ctx.companyId)
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => {
        if (c.companyId !== ctx.companyId) return true;
        const isFuelSync = c.fuelLogId === targetId || c.id === `cash_fuel_${targetId}` || (c.tipo === "saida" && c.categoria?.includes("Diesel") && Number(c.valor) === Number(oldLog.valor) && c.data === oldLog.data && c.descricao?.includes(oldLog.truckId));
        const isArlaSync = c.fuelLogId === targetId || c.id === `cash_arla_${targetId}` || (c.tipo === "saida" && c.categoria?.includes("Arla") && Number(c.valor) === Number(oldLog.valorArla) && c.data === oldLog.data && c.descricao?.includes(oldLog.truckId));
        return !isFuelSync && !isArlaSync;
      });

      // Insert new Diesel expense entry if valor > 0
      if (matchLog.valor > 0) {
        const rawExpense = {
          id: "exp_" + Math.random().toString(36).substr(2, 9),
          fuelLogId: targetId,
          companyId: ctx.companyId,
          truckId: body.truckId,
          tipo: `Diesel ${body.tipoDiesel || "S10"} (Abastecimento)`,
          valor: Number(body.valor),
          data: body.data || new Date().toISOString().split("T")[0],
          documento: "Auto-Abastecimento",
          descritivo: `Abastecimento automático via painel / chat (${body.litros} Litros de Diesel ${body.tipoDiesel || "S10"})`
        };
        liveDb.expenses.push(rawExpense);

        // Insert new Diesel cash flow entry
        const rawCash = {
          id: "cash_" + Math.random().toString(36).substr(2, 9),
          fuelLogId: targetId,
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: `Diesel ${body.tipoDiesel || "S10"} (Abastecimento)`,
          valor: Number(body.valor),
          data: body.data || new Date().toISOString().split("T")[0],
          descricao: `Combustível Placa ${body.truckId} (${body.tipoDiesel || "S10"})`
        };
        liveDb.cash_flow.push(rawCash);
      }

      // Insert new Arla expense and cash flow if applicable
      if (body.valorArla && Number(body.valorArla) > 0) {
        const rawExpenseArla = {
          id: "exp_" + Math.random().toString(36).substr(2, 9),
          fuelLogId: targetId,
          companyId: ctx.companyId,
          truckId: body.truckId,
          tipo: `Arla 32 (Abastecimento)`,
          valor: Number(body.valorArla),
          data: body.data || new Date().toISOString().split("T")[0],
          documento: "Auto-Abastecimento-Arla",
          descritivo: `Abastecimento automático via painel / chat (${body.litrosArla || 0} Litros de Arla 32)`
        };
        liveDb.expenses.push(rawExpenseArla);

        const rawCashArla = {
          id: "cash_arla_" + targetId,
          fuelLogId: targetId,
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Arla 32 (Abastecimento)",
          valor: Number(body.valorArla),
          data: body.data || new Date().toISOString().split("T")[0],
          descricao: `Arla Placa ${body.truckId} (${body.litrosArla || 0}L)`
        };
        liveDb.cash_flow.push(rawCashArla);
      }

      await persistDB();
      return jsonResponse({ success: true, fuelLog: matchLog });
    }

    if (cleanPath.startsWith("/api/fuel_logs/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];

      const oldLogIndex = liveDb.fuel_logs.findIndex((f: any) => f.id === targetId && f.companyId === ctx.companyId);
      if (oldLogIndex === -1) {
        return jsonResponse({ error: "Abastecimento não encontrado ou acesso negado." }, 404);
      }
      const oldLog = liveDb.fuel_logs[oldLogIndex];

      liveDb.fuel_logs.splice(oldLogIndex, 1);

      // Remove associated expense (scoped to ctx.companyId)
      liveDb.expenses = liveDb.expenses.filter((e: any) => e.companyId !== ctx.companyId || !(e.fuelLogId === targetId || (e.documento === "Auto-Abastecimento" && e.truckId === oldLog.truckId && Number(e.valor) === Number(oldLog.valor) && e.data === oldLog.data)));

      // Remove associated cash flow (scoped to ctx.companyId)
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => c.companyId !== ctx.companyId || !(c.fuelLogId === targetId || (c.tipo === "saida" && c.categoria?.includes("Diesel") && Number(c.valor) === Number(oldLog.valor) && c.data === oldLog.data && c.descricao?.includes(oldLog.truckId))));

      await persistDB();
      return jsonResponse({ success: true });
    }

    // 13) POST, PUT & DELETE /api/expenses
    if (cleanPath === "/api/expenses" && method === "POST") {
      const newExp = {
        id: "exp_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        truckId: body.truckId,
        tipo: body.tipo,
        valor: Number(body.valor),
        data: body.data || new Date().toISOString().split("T")[0],
        km: body.km ? Number(body.km) : undefined,
        obs: body.obs || "",
        comprovante: body.comprovante || "",
        empresaDespesa: body.empresaDespesa || "",
        expenseCompanyId: body.expenseCompanyId || "",
        documento: body.documento || "",
        descritivo: body.descritivo || ""
      };
      liveDb.expenses.push(newExp);

      const newCash = {
        id: "cash_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        tipo: "saida",
        categoria: body.tipo,
        valor: Number(body.valor),
        data: body.data || new Date().toISOString().split("T")[0],
        descricao: `Despesa ${body.tipo} - Placa ${body.truckId}`
      };
      liveDb.cash_flow.push(newCash);

      await persistDB();
      return jsonResponse({ success: true, expense: newExp });
    }

    if (cleanPath.startsWith("/api/expenses/") && method === "PUT") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const idx = liveDb.expenses.findIndex((e: any) => e.id === targetId && e.companyId === ctx.companyId);
      if (idx === -1) {
        return jsonResponse({ error: "Despesa não encontrada ou acesso negado." }, 404);
      }

      const oldExpense = { ...liveDb.expenses[idx] };

      // Remove matching old cash flow entry
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => {
        const isMatch = c.companyId === ctx.companyId &&
          (c.descricao === `Despesa ${oldExpense.tipo} - Placa ${oldExpense.truckId}` ||
           c.descricao === `Despesa: ${oldExpense.tipo} - ${oldExpense.truckId}`) &&
          c.valor === oldExpense.valor &&
          c.data === oldExpense.data;
        return !isMatch;
      });

      liveDb.expenses[idx] = {
        ...liveDb.expenses[idx],
        ...body,
        id: targetId,
        companyId: ctx.companyId,
        valor: body.valor !== undefined ? Number(body.valor) : liveDb.expenses[idx].valor,
        km: body.km !== undefined ? (body.km ? Number(body.km) : undefined) : liveDb.expenses[idx].km
      };

      const updatedExpense = liveDb.expenses[idx];

      // Add updated cash flow entry
      const newCash = {
        id: "cash_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        tipo: "saida",
        categoria: updatedExpense.tipo,
        valor: updatedExpense.valor,
        data: updatedExpense.data || new Date().toISOString().split("T")[0],
        descricao: `Despesa ${updatedExpense.tipo} - Placa ${updatedExpense.truckId}`
      };
      liveDb.cash_flow.push(newCash);

      await persistDB();
      return jsonResponse({ success: true, expense: liveDb.expenses[idx] });
    }

    if (cleanPath.startsWith("/api/expenses/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const idx = liveDb.expenses.findIndex((e: any) => e.id === targetId && e.companyId === ctx.companyId);
      if (idx === -1) {
        return jsonResponse({ error: "Despesa não encontrada ou acesso negado." }, 404);
      }
      const oldExpense = liveDb.expenses[idx];
      
      // Remove matching cash flow entry
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => {
        const isMatch = c.companyId === ctx.companyId &&
          (c.descricao === `Despesa ${oldExpense.tipo} - Placa ${oldExpense.truckId}` ||
           c.descricao === `Despesa: ${oldExpense.tipo} - ${oldExpense.truckId}`) &&
          c.valor === oldExpense.valor &&
          c.data === oldExpense.data;
        return !isMatch;
      });

      liveDb.expenses = liveDb.expenses.filter((e: any) => !(e.id === targetId && e.companyId === ctx.companyId));
      await persistDB();
      return jsonResponse({ success: true });
    }

    // 14) POST, PUT, DELETE /api/cash_flow
    if (cleanPath === "/api/cash_flow" && method === "POST") {
      const newCash = {
        id: "cash_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        tipo: body.tipo,
        categoria: body.categoria,
        valor: Number(body.valor),
        data: body.data || new Date().toISOString().split("T")[0],
        descricao: body.descricao || ""
      };
      liveDb.cash_flow.push(newCash);
      await persistDB();
      return jsonResponse({ success: true, cashFlow: newCash });
    }

    if (cleanPath.startsWith("/api/cash_flow/") && method === "PUT") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const matchItem = liveDb.cash_flow.find((c: any) => c.id === targetId && c.companyId === ctx.companyId);
      if (!matchItem) return jsonResponse({ error: "Item de caixa não encontrado ou acesso negado." }, 404);

      if (body.tipo !== undefined) matchItem.tipo = body.tipo;
      if (body.categoria !== undefined) matchItem.categoria = body.categoria;
      if (body.valor !== undefined) matchItem.valor = Number(body.valor);
      if (body.data !== undefined) matchItem.data = body.data;
      if (body.descricao !== undefined) matchItem.descricao = body.descricao;

      await persistDB();
      return jsonResponse({ success: true, cashFlow: matchItem });
    }

    if (cleanPath.startsWith("/api/cash_flow/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const exists = liveDb.cash_flow.some((c: any) => c.id === targetId && c.companyId === ctx.companyId);
      if (!exists) return jsonResponse({ error: "Item de caixa não encontrado ou acesso negado." }, 404);
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => !(c.id === targetId && c.companyId === ctx.companyId));
      await persistDB();
      return jsonResponse({ success: true });
    }


    // 14.5) POST, PUT, DELETE /api/bills
    if (cleanPath === "/api/bills" && method === "POST") {
      if (!liveDb.bills) liveDb.bills = [];
      const recorrencia = body.recorrencia || 'unico';
      const createdBills: any[] = [];

      function addTime(dateStr: string, index: number, type: 'week' | 'month'): string {
        const date = new Date(dateStr + "T12:00:00");
        if (type === 'month') {
          date.setMonth(date.getMonth() + index);
        } else {
          date.setDate(date.getDate() + (index * 7));
        }
        return date.toISOString().split('T')[0];
      }

      if (recorrencia === 'unico') {
        const bill = {
          id: "bill_" + Math.random().toString(36).substr(2, 9),
          companyId: ctx.companyId,
          descricao: body.descricao,
          valorTotal: Number(body.valorTotal),
          valorParcela: Number(body.valorTotal),
          recorrencia: 'unico',
          status: 'Pendente',
          vencimento: body.vencimento || new Date().toISOString().split("T")[0],
          truckId: body.truckId || '',
          categoria: body.categoria,
          observacao: body.observacao || '',
          parcelas: 1,
          parcelaAtual: 1,
          createdAt: new Date().toISOString()
        };
        liveDb.bills.push(bill);
        createdBills.push(bill);
      } else if (recorrencia === 'parcelado_mes' || recorrencia === 'parcelado_semana') {
        const numParcelas = Number(body.parcelas) || 1;
        const groupId = "group_" + Math.random().toString(36).substr(2, 9);
        const freqType = recorrencia === 'parcelado_mes' ? 'month' : 'week';

        for (let i = 1; i <= numParcelas; i++) {
          const bill = {
            id: "bill_" + Math.random().toString(36).substr(2, 9),
            companyId: ctx.companyId,
            groupId,
            descricao: `${body.descricao} (${i}/${numParcelas})`,
            valorTotal: Number(body.valorTotal),
            valorParcela: Number(body.valorParcela),
            recorrencia,
            status: 'Pendente',
            vencimento: addTime(body.vencimento || new Date().toISOString().split("T")[0], i - 1, freqType),
            truckId: body.truckId || '',
            categoria: body.categoria,
            observacao: body.observacao || '',
            parcelas: numParcelas,
            parcelaAtual: i,
            createdAt: new Date().toISOString()
          };
          liveDb.bills.push(bill);
          createdBills.push(bill);
        }
      }

      await persistDB();
      return jsonResponse({ success: true, bills: createdBills });
    }

    if (cleanPath.startsWith("/api/bills/") && method === "PUT") {
      if (!liveDb.bills) liveDb.bills = [];
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const idx = liveDb.bills.findIndex((b: any) => b.id === targetId && b.companyId === ctx.companyId);

      if (idx === -1) {
        return jsonResponse({ error: "Conta a pagar não encontrada ou acesso negado." }, 404);
      }

      const oldBill = { ...liveDb.bills[idx] };
      liveDb.bills[idx] = {
        ...liveDb.bills[idx],
        ...body,
        id: targetId,
        companyId: ctx.companyId,
        valorTotal: body.valorTotal !== undefined ? Number(body.valorTotal) : liveDb.bills[idx].valorTotal,
        valorParcela: body.valorParcela !== undefined ? Number(body.valorParcela) : liveDb.bills[idx].valorParcela
      };

      const newBill = liveDb.bills[idx];

      // Sync to expenses and cashflow if marked as Paid
      if (newBill.status === "Pago" && oldBill.status !== "Pago") {
        // Create matching expense and cashflow entries
        const pagData = body.pagamentoData || new Date().toISOString().split("T")[0];
        const newExp = {
          id: "exp_" + Math.random().toString(36).substr(2, 9),
          billId: targetId,
          companyId: ctx.companyId,
          truckId: newBill.truckId || '',
          tipo: newBill.categoria,
          valor: Number(newBill.valorParcela),
          data: pagData,
          km: undefined,
          obs: `Pago Ref. Conta: ${newBill.descricao}. Obs: ${newBill.observacao || ""}`,
          comprovante: "",
          empresaDespesa: "",
          expenseCompanyId: "",
          documento: "Auto-ContaPagar",
          descritivo: `Pagamento automático de Conta a Pagar: ${newBill.descricao}`
        };
        liveDb.expenses.push(newExp);

        const newCash = {
          id: "cash_" + Math.random().toString(36).substr(2, 9),
          billId: targetId,
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: newBill.categoria,
          valor: Number(newBill.valorParcela),
          data: pagData,
          descricao: `Pagamento de Conta: ${newBill.descricao} - Placa ${newBill.truckId || "N/A"}`
        };
        liveDb.cash_flow.push(newCash);
      }

      // Revert from Paid to Pendente
      if (newBill.status === "Pendente" && oldBill.status === "Pago") {
        liveDb.expenses = liveDb.expenses.filter((e: any) => !(e.billId === targetId && e.companyId === ctx.companyId));
        liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => !(c.billId === targetId && c.companyId === ctx.companyId));
      }

      await persistDB();
      return jsonResponse({ success: true, bill: liveDb.bills[idx] });
    }

    if (cleanPath.startsWith("/api/bills/") && method === "DELETE") {
      if (!liveDb.bills) liveDb.bills = [];
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const exists = liveDb.bills.some((b: any) => b.id === targetId && b.companyId === ctx.companyId);
      if (!exists) return jsonResponse({ error: "Conta a pagar não encontrada ou acesso negado." }, 404);

      liveDb.bills = liveDb.bills.filter((b: any) => !(b.id === targetId && b.companyId === ctx.companyId));
      liveDb.expenses = liveDb.expenses.filter((e: any) => !(e.billId === targetId && e.companyId === ctx.companyId));
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => !(c.billId === targetId && c.companyId === ctx.companyId));

      await persistDB();
      return jsonResponse({ success: true });
    }

    // 15) POST /api/chat_logs
    if (cleanPath === "/api/chat_logs" && method === "POST") {
      const newChat = {
        id: "chat_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        timestamp: new Date().toISOString(),
        mensagem: body.mensagem,
        resposta: body.resposta,
        acaoGerada: body.acaoGerada || "NONE",
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.nome
      };
      if (!liveDb.chat_logs) liveDb.chat_logs = [];
      liveDb.chat_logs.push(newChat);
      await persistDB();
      return jsonResponse({ success: true });
    }

    // 16) POST & DELETE /api/trucks
    if (cleanPath === "/api/trucks" && method === "POST") {
      const company = (liveDb.companies || []).find((c: any) => c.id === ctx.companyId);
      const companyTrucks = (liveDb.trucks || []).filter((t: any) => t.companyId === ctx.companyId);
      const limite = company?.limiteCaminhoes ?? 10;

      if (limite > 0 && companyTrucks.length >= limite) {
        return jsonResponse({ 
          error: `Limite de frotas ativadas atingido (${companyTrucks.length}/${limite} caminhões). Entre em contato com o suporte/SaaS para expandir seu plano.` 
        }, 400);
      }

      const placaStr = String(body.placa || "").toUpperCase().trim();
      const existing = (liveDb.trucks || []).find((t: any) => t.placa === placaStr && t.companyId === ctx.companyId);
      if (existing) {
        return jsonResponse({ error: "Veículo com esta placa já cadastrado!" }, 400);
      }

      const newTruck = {
        id: "truck_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        placa: placaStr,
        modelo: body.modelo,
        combustivel: body.combustivel || "Diesel",
        ano: body.ano || new Date().getFullYear(),
        tipo: body.tipo || "Traçado",
        cidade: body.cidade || "São Paulo - SP",
        mediaIdeal: Number(body.mediaIdeal || 2.5),
        status: body.status || "Ativo",
        dataCadastro: new Date().toISOString().split("T")[0]
      };
      liveDb.trucks.push(newTruck);
      await persistDB();
      return jsonResponse({ success: true, truck: newTruck });
    }

    if (cleanPath.startsWith("/api/trucks/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const exists = liveDb.trucks.some((t: any) => t.id === targetId && t.companyId === ctx.companyId);
      if (!exists) return jsonResponse({ error: "Veículo não encontrado ou acesso negado." }, 404);
      liveDb.trucks = liveDb.trucks.filter((t: any) => !(t.id === targetId && t.companyId === ctx.companyId));
      await persistDB();
      return jsonResponse({ success: true });
    }


    // 17) POST & PUT /api/freights
    if (cleanPath === "/api/freights" && method === "POST") {
      const isNumericMotorista = typeof body.motorista === "number" || (!isNaN(Number(body.motorista)) && String(body.motorista).trim() !== "");
      const motoristaCost = isNumericMotorista ? Number(body.motorista) : Number(body.comissao || 0);
      const motoristaIdOrName = body.driverId || (!isNumericMotorista ? String(body.motorista || "") : "");

      // Find driver name for logging/reference
      let driverName = "Não especificado";
      if (motoristaIdOrName) {
        const foundDriver = (liveDb.drivers || []).find((d: any) => d.id === motoristaIdOrName || d.nome === motoristaIdOrName);
        if (foundDriver) {
          driverName = foundDriver.nome;
        } else {
          driverName = motoristaIdOrName;
        }
      }

      const orderNumber = body.numeroOrdem || "OS-" + Math.floor(100000 + Math.random() * 900000);
      const dateVal = body.data || body.dataSaida || new Date().toISOString().split("T")[0];

      const newFreight = {
        id: "frt_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        numeroOrdem: orderNumber,
        origem: body.origem,
        destino: body.destino,
        
        // Support both schemas: caminhao (string placa) and truckId (string placa or ID)
        caminhao: body.caminhao || body.truckId || "Não especificado",
        truckId: body.truckId || body.caminhao || "Não especificado",
        
        driverId: body.driverId || (!isNumericMotorista ? body.motorista : ""),
        
        valorDiaria: Number(body.valorDiaria || 0),
        valorAlmoco: Number(body.valorAlmoco || 0),
        
        status: body.status || "Em Trânsito",
        valorBruto: Number(body.valorBruto || 0),
        pedagio: Number(body.pedagio || 0),
        
        // comissao is the driver's travel fee/motorista expense
        comissao: motoristaCost,
        motorista: motoristaCost, // In Freights.tsx, freight.motorista is a number representing driver cost
        
        combustivel: Number(body.combustivel || body.dieselPrevisto || 0),
        dieselPrevisto: Number(body.dieselPrevisto || body.combustivel || 0),
        valorArla: Number(body.valorArla || 0),
        litrosArla: Number(body.litrosArla || 0),
        
        outrasDespesas: Number(body.outrasDespesas || body.outrosCustos || 0),
        outrosCustos: Number(body.outrosCustos || body.outrasDespesas || 0),
        
        resultadoLiquido: Number(body.resultadoLiquido || 0),
        distanciaKm: Number(body.distanciaKm || 0),
        kmAbastecimento: Number(body.kmAbastecimento || 0),
        tipoViagem: body.tipoViagem || "ida",
        tipoCalculo: body.tipoCalculo || "fixo",
        pesoTotalKg: Number(body.pesoTotalKg || 0),
        valorPorKg: Number(body.valorPorKg || 0),
        quantidadeCabecas: Number(body.quantidadeCabecas || 0),
        valorPorCabeca: Number(body.valorPorCabeca || 0),
        
        data: dateVal,
        dataSaida: dateVal,

        // Premium travel notes
        localAbastecimento: body.localAbastecimento || "",
        gasStationId: body.gasStationId || "",
        tipoDiesel: body.tipoDiesel || "S10",
        fotoAbastecimento: body.fotoAbastecimento || "",
        localPedagio: body.localPedagio || "",
        localMotorista: body.localMotorista || "",
        outrosDetalhes: body.outrosDetalhes || "",
        fotoComprovanteGeral: body.fotoComprovanteGeral || ""
      };
      liveDb.freights.push(newFreight);
      
      // Seed operational cash entries dynamically
      const entryCash = {
        id: "cash_freight_in_" + newFreight.id,
        companyId: ctx.companyId,
        tipo: "entrada",
        categoria: "Faturamento de Frete",
        valor: Number(newFreight.valorBruto),
        data: dateVal,
        descricao: `Receita Frete ${newFreight.numeroOrdem} (${body.origem} -> ${body.destino})`
      };
      liveDb.cash_flow.push(entryCash);

      if (Number(newFreight.pedagio) > 0) {
        liveDb.cash_flow.push({
          id: "cash_freight_out_toll_" + newFreight.id,
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Pedágios",
          valor: Number(newFreight.pedagio),
          data: dateVal,
          descricao: `Custo Pedágio OS ${newFreight.numeroOrdem}`
        });
      }

      const totalDriverFreightCost = motoristaCost + Number(body.valorDiaria || 0) + Number(body.valorAlmoco || 0);
      if (totalDriverFreightCost > 0) {
        liveDb.cash_flow.push({
          id: "cash_freight_out_driver_" + newFreight.id,
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Motorista (Diária/Comissão)",
          valor: totalDriverFreightCost,
          data: dateVal,
          descricao: `Custo Motorista (${driverName}) [D+A+C] - OS ${newFreight.numeroOrdem}`
        });
      }

      // Synchronize associated Fuel Log, Expense, and Cash Flow cleanly and without duplication
      const fuelLogId = "fuel_freight_" + newFreight.id;
      if (!liveDb.fuel_logs) liveDb.fuel_logs = [];
      if (!liveDb.expenses) liveDb.expenses = [];
      
      liveDb.fuel_logs = liveDb.fuel_logs.filter((l: any) => l.id !== fuelLogId);
      liveDb.expenses = liveDb.expenses.filter((e: any) => e.fuelLogId !== fuelLogId);
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => c.fuelLogId !== fuelLogId && c.id !== "cash_fuel_" + fuelLogId && c.id !== "cash_arla_" + fuelLogId);

      if (Number(newFreight.combustivel) > 0 || Number(body.valorArla) > 0) {
        const matchedStation = (liveDb.gas_stations || []).find((g: any) => g.id === (body.gasStationId || ""));
        const priceDiesel = matchedStation?.precoDiesel || 6.20;
        const estimatedLiters = Number((Number(newFreight.combustivel) / priceDiesel).toFixed(2));

        const newFuelLog = {
          id: fuelLogId,
          companyId: ctx.companyId,
          truckId: newFreight.truckId,
          driverId: newFreight.driverId,
          gasStationId: body.gasStationId || "",
          data: dateVal,
          km: Number(newFreight.kmAbastecimento || 0),
          valor: Number(newFreight.combustivel || 0),
          litros: estimatedLiters,
          tipoDiesel: body.tipoDiesel || "S10",
          litrosArla: Number(body.litrosArla || 0),
          valorArla: Number(body.valorArla || 0),
          comprovante: newFreight.fotoAbastecimento || "",
          freightId: newFreight.id
        };
        liveDb.fuel_logs.push(newFuelLog);

        if (Number(newFreight.combustivel) > 0) {
          liveDb.expenses.push({
            id: "exp_fuel_" + newFreight.id,
            fuelLogId: fuelLogId,
            companyId: ctx.companyId,
            truckId: newFreight.truckId,
            tipo: `Diesel ${body.tipoDiesel || "S10"} (Abastecimento)`,
            valor: Number(newFreight.combustivel),
            data: dateVal,
            documento: "Auto-Abastecimento",
            descritivo: `Abastecimento automático via Frete OS ${orderNumber}`
          });

          liveDb.cash_flow.push({
            id: "cash_fuel_" + fuelLogId,
            fuelLogId: fuelLogId,
            companyId: ctx.companyId,
            tipo: "saida",
            categoria: `Diesel ${body.tipoDiesel || "S10"} (Abastecimento)`,
            valor: Number(newFreight.combustivel),
            data: dateVal,
            descricao: `Combustível OS ${orderNumber} - Placa ${newFreight.truckId}`
          });
        }

        if (Number(body.valorArla) > 0) {
          liveDb.expenses.push({
            id: "exp_arla_" + fuelLogId,
            fuelLogId: fuelLogId,
            companyId: ctx.companyId,
            truckId: newFreight.truckId,
            tipo: "Arla 32 (Abastecimento)",
            valor: Number(body.valorArla),
            data: dateVal,
            documento: "Auto-Abastecimento-Arla",
            descritivo: `Abastecimento automático de Arla via Frete OS ${orderNumber} (${body.litrosArla || 0} Litros de Arla 32)`
          });

          liveDb.cash_flow.push({
            id: "cash_arla_" + fuelLogId,
            fuelLogId: fuelLogId,
            companyId: ctx.companyId,
            tipo: "saida",
            categoria: "Arla 32 (Abastecimento)",
            valor: Number(body.valorArla),
            data: dateVal,
            descricao: `Arla OS ${orderNumber} - Placa ${newFreight.truckId} (${body.litrosArla || 0}L)`
          });
        }
      }

      await persistDB();
      return jsonResponse({ success: true, freight: newFreight });
    }

    if (cleanPath.startsWith("/api/freights/") && cleanPath.endsWith("/status") && method === "PUT") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 2]; // id before "/status"

      const matchFrt = liveDb.freights.find((f: any) => f.id === targetId && f.companyId === ctx.companyId);
      if (!matchFrt) return jsonResponse({ error: "Frete não encontrado ou acesso negado." }, 404);

      matchFrt.status = body.status;
      await persistDB();
      return jsonResponse({ success: true, freight: matchFrt });
    }

    if (cleanPath.startsWith("/api/freights/") && !cleanPath.endsWith("/status") && method === "PUT") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];

      const matchFrt = liveDb.freights.find((f: any) => f.id === targetId && f.companyId === ctx.companyId);
      if (!matchFrt) return jsonResponse({ error: "Frete não encontrado ou acesso negado." }, 404);

      const isNumericMotorista = typeof body.motorista === "number" || (!isNaN(Number(body.motorista)) && String(body.motorista).trim() !== "");
      const motoristaCost = isNumericMotorista ? Number(body.motorista) : Number(body.comissao || 0);
      const motoristaIdOrName = body.driverId || (!isNumericMotorista ? String(body.motorista || "") : "");

      // Find driver name for logging/reference
      let driverName = "Não especificado";
      if (motoristaIdOrName) {
        const foundDriver = (liveDb.drivers || []).find((d: any) => (d.id === motoristaIdOrName || d.nome === motoristaIdOrName) && d.companyId === ctx.companyId);
        if (foundDriver) {
          driverName = foundDriver.nome;
        } else {
          driverName = motoristaIdOrName;
        }
      }

      const dateVal = body.data || body.dataSaida || new Date().toISOString().split("T")[0];

      // Update freight properties
      matchFrt.origem = body.origem;
      matchFrt.destino = body.destino;
      matchFrt.caminhao = body.caminhao || body.truckId || "Não especificado";
      matchFrt.truckId = body.truckId || body.caminhao || "Não especificado";
      matchFrt.driverId = body.driverId || (!isNumericMotorista ? body.motorista : "");
      matchFrt.status = body.status || matchFrt.status || "Em Trânsito";
      matchFrt.valorBruto = Number(body.valorBruto || 0);
      matchFrt.pedagio = Number(body.pedagio || 0);
      matchFrt.comissao = motoristaCost;
      matchFrt.motorista = motoristaCost;
      matchFrt.valorDiaria = Number(body.valorDiaria !== undefined ? body.valorDiaria : matchFrt.valorDiaria || 0);
      matchFrt.valorAlmoco = Number(body.valorAlmoco !== undefined ? body.valorAlmoco : matchFrt.valorAlmoco || 0);
      matchFrt.combustivel = Number(body.combustivel || body.dieselPrevisto || 0);
      matchFrt.dieselPrevisto = Number(body.dieselPrevisto || body.combustivel || 0);
      matchFrt.valorArla = Number(body.valorArla || 0);
      matchFrt.litrosArla = Number(body.litrosArla || 0);
      matchFrt.outrasDespesas = Number(body.outrasDespesas || body.outrosCustos || 0);
      matchFrt.outrosCustos = Number(body.outrosCustos || body.outrasDespesas || 0);
      matchFrt.resultadoLiquido = Number(body.resultadoLiquido || 0);
      matchFrt.distanciaKm = Number(body.distanciaKm || 0);
      matchFrt.kmAbastecimento = Number(body.kmAbastecimento || 0);
      matchFrt.tipoViagem = body.tipoViagem || matchFrt.tipoViagem || "ida";
      matchFrt.tipoCalculo = body.tipoCalculo || matchFrt.tipoCalculo || "fixo";
      matchFrt.pesoTotalKg = Number(body.pesoTotalKg !== undefined ? body.pesoTotalKg : matchFrt.pesoTotalKg || 0);
      matchFrt.valorPorKg = Number(body.valorPorKg !== undefined ? body.valorPorKg : matchFrt.valorPorKg || 0);
      matchFrt.quantidadeCabecas = Number(body.quantidadeCabecas !== undefined ? body.quantidadeCabecas : matchFrt.quantidadeCabecas || 0);
      matchFrt.valorPorCabeca = Number(body.valorPorCabeca !== undefined ? body.valorPorCabeca : matchFrt.valorPorCabeca || 0);
      matchFrt.data = dateVal;
      matchFrt.dataSaida = dateVal;
      matchFrt.localAbastecimento = body.localAbastecimento || "";
      matchFrt.gasStationId = body.gasStationId || "";
      matchFrt.tipoDiesel = body.tipoDiesel || "S10";
      matchFrt.fotoAbastecimento = body.fotoAbastecimento || "";
      matchFrt.localPedagio = body.localPedagio || "";
      matchFrt.localMotorista = body.localMotorista || "";
      matchFrt.outrosDetalhes = body.outrosDetalhes || "";
      matchFrt.fotoComprovanteGeral = body.fotoComprovanteGeral || "";

      // Remove existing related cash entries first to re-add/update cleanly
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => !(c.companyId === ctx.companyId && c.id.includes(targetId)));

      // Re-seed updated cash entries
      const entryCash = {
        id: "cash_freight_in_" + targetId,
        companyId: ctx.companyId,
        tipo: "entrada",
        categoria: "Faturamento de Frete",
        valor: Number(matchFrt.valorBruto),
        data: dateVal,
        descricao: `Receita Frete ${matchFrt.numeroOrdem} (${body.origem} -> ${body.destino})`
      };
      liveDb.cash_flow.push(entryCash);

      if (Number(matchFrt.pedagio) > 0) {
        liveDb.cash_flow.push({
          id: "cash_freight_out_toll_" + targetId,
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Pedágios",
          valor: Number(matchFrt.pedagio),
          data: dateVal,
          descricao: `Custo Pedágio OS ${matchFrt.numeroOrdem}`
        });
      }

      const totalDriverFreightCost = motoristaCost + Number(body.valorDiaria || 0) + Number(body.valorAlmoco || 0);
      if (totalDriverFreightCost > 0) {
        liveDb.cash_flow.push({
          id: "cash_freight_out_driver_" + targetId,
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Motorista (Diária/Comissão)",
          valor: totalDriverFreightCost,
          data: dateVal,
          descricao: `Custo Motorista (${driverName}) [D+A+C] - OS ${matchFrt.numeroOrdem}`
        });
      }

      // Synchronize associated Fuel Log, Expense, and Cash Flow cleanly and without duplication
      const fuelLogId = "fuel_freight_" + targetId;
      if (!liveDb.fuel_logs) liveDb.fuel_logs = [];
      if (!liveDb.expenses) liveDb.expenses = [];
      
      liveDb.fuel_logs = liveDb.fuel_logs.filter((l: any) => !(l.companyId === ctx.companyId && l.id === fuelLogId));
      liveDb.expenses = liveDb.expenses.filter((e: any) => !(e.companyId === ctx.companyId && e.fuelLogId === fuelLogId));
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => !(c.companyId === ctx.companyId && (c.fuelLogId === fuelLogId || c.id === "cash_fuel_" + fuelLogId || c.id === "cash_arla_" + fuelLogId)));

      if (Number(matchFrt.combustivel) > 0 || Number(body.valorArla) > 0) {
        const matchedStation = (liveDb.gas_stations || []).find((g: any) => g.id === (body.gasStationId || "") && g.companyId === ctx.companyId);
        const priceDiesel = matchedStation?.precoDiesel || 6.20;
        const estimatedLiters = Number((Number(matchFrt.combustivel) / priceDiesel).toFixed(2));

        const newFuelLog = {
          id: fuelLogId,
          companyId: ctx.companyId,
          truckId: matchFrt.truckId,
          driverId: matchFrt.driverId,
          gasStationId: body.gasStationId || "",
          data: dateVal,
          km: Number(matchFrt.kmAbastecimento || 0),
          valor: Number(matchFrt.combustivel || 0),
          litros: estimatedLiters,
          tipoDiesel: body.tipoDiesel || "S10",
          litrosArla: Number(body.litrosArla || 0),
          valorArla: Number(body.valorArla || 0),
          comprovante: matchFrt.fotoAbastecimento || "",
          freightId: matchFrt.id
        };
        liveDb.fuel_logs.push(newFuelLog);

        if (Number(matchFrt.combustivel) > 0) {
          liveDb.expenses.push({
            id: "exp_fuel_" + matchFrt.id,
            fuelLogId: fuelLogId,
            companyId: ctx.companyId,
            truckId: matchFrt.truckId,
            tipo: `Diesel ${body.tipoDiesel || "S10"} (Abastecimento)`,
            valor: Number(matchFrt.combustivel),
            data: dateVal,
            documento: "Auto-Abastecimento",
            descritivo: `Abastecimento automático via Frete OS ${matchFrt.numeroOrdem}`
          });

          liveDb.cash_flow.push({
            id: "cash_fuel_" + fuelLogId,
            fuelLogId: fuelLogId,
            companyId: ctx.companyId,
            tipo: "saida",
            categoria: `Diesel ${body.tipoDiesel || "S10"} (Abastecimento)`,
            valor: Number(matchFrt.combustivel),
            data: dateVal,
            descricao: `Combustível OS ${matchFrt.numeroOrdem} - Placa ${matchFrt.truckId}`
          });
        }

        if (Number(body.valorArla) > 0) {
          liveDb.expenses.push({
            id: "exp_arla_" + fuelLogId,
            fuelLogId: fuelLogId,
            companyId: ctx.companyId,
            truckId: matchFrt.truckId,
            tipo: "Arla 32 (Abastecimento)",
            valor: Number(body.valorArla),
            data: dateVal,
            documento: "Auto-Abastecimento-Arla",
            descritivo: `Abastecimento automático de Arla via Frete OS ${matchFrt.numeroOrdem} (${body.litrosArla || 0} Litros de Arla 32)`
          });

          liveDb.cash_flow.push({
            id: "cash_arla_" + fuelLogId,
            fuelLogId: fuelLogId,
            companyId: ctx.companyId,
            tipo: "saida",
            categoria: "Arla 32 (Abastecimento)",
            valor: Number(body.valorArla),
            data: dateVal,
            descricao: `Arla OS ${matchFrt.numeroOrdem} - Placa ${matchFrt.truckId} (${body.litrosArla || 0}L)`
          });
        }
      }

      await persistDB();
      return jsonResponse({ success: true, freight: matchFrt });
    }

    if (cleanPath.startsWith("/api/freights/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const exists = liveDb.freights.some((f: any) => f.id === targetId && f.companyId === ctx.companyId);
      if (!exists) return jsonResponse({ error: "Frete não encontrado ou acesso negado." }, 404);

      liveDb.freights = liveDb.freights.filter((f: any) => !(f.id === targetId && f.companyId === ctx.companyId));
      
      // Cascade delete fuel logs, expenses, and cash flows cleanly (scoped to ctx.companyId)
      const fuelLogId = "fuel_freight_" + targetId;
      liveDb.fuel_logs = (liveDb.fuel_logs || []).filter((l: any) => !(l.companyId === ctx.companyId && l.id === fuelLogId));
      liveDb.expenses = (liveDb.expenses || []).filter((e: any) => !(e.companyId === ctx.companyId && e.fuelLogId === fuelLogId));
      liveDb.cash_flow = (liveDb.cash_flow || []).filter((c: any) => !(c.companyId === ctx.companyId && (c.fuelLogId === fuelLogId || c.id === "cash_fuel_" + fuelLogId || c.id.includes(targetId))));

      await persistDB();
      return jsonResponse({ success: true });
    }

    // 18) POST, POST complete, DELETE /api/maintenance_alerts
    if (cleanPath === "/api/maintenance_alerts" && method === "POST") {
      const tipo = body.tipo || body.item || "Inspeção Geral";
      const prioridade = body.prioridade || body.urgencia || "media";
      const tipoLimite = body.tipoLimite || (body.dataLimite ? "data" : "km");
      const limiteKm = body.limiteKm !== undefined ? Number(body.limiteKm) : 0;
      const limiteData = body.limiteData || body.dataLimite || "";
      const dataLimite = body.dataLimite || body.limiteData || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const descricao = body.descricao || `Revisão periódica de ${tipo}`;

      const newMaint = {
        id: "maint_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        truckId: body.truckId,
        tipo,
        item: tipo,
        prioridade,
        urgencia: prioridade,
        tipoLimite,
        limiteKm,
        limiteData,
        dataLimite,
        descricao,
        status: "Pendente",
        dataIdentificada: new Date().toISOString().split("T")[0]
      };
      liveDb.maintenance_alerts.push(newMaint);
      await persistDB();
      return jsonResponse({ success: true, alert: newMaint });
    }

    if (cleanPath.startsWith("/api/maintenance_alerts/") && cleanPath.endsWith("/complete") && method === "POST") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 2];

      const matchMaint = liveDb.maintenance_alerts.find((m: any) => m.id === targetId && m.companyId === ctx.companyId);
      if (!matchMaint) return jsonResponse({ error: "Manutenção não encontrada ou acesso negado." }, 404);

      const finalCost = Number(body.custo || body.custoFinal || 0);
      const completionDate = body.dataRealizada || new Date().toISOString().split("T")[0];
      const meioPagamento = body.meioPagamento || "Pix";
      const oficina = body.oficina || body.local || "";
      const observacao = body.observacao || "";

      matchMaint.status = "Realizado";
      matchMaint.custo = finalCost;
      matchMaint.dataRealizada = completionDate;
      matchMaint.resolvedAt = completionDate;
      matchMaint.meioPagamento = meioPagamento;
      matchMaint.oficina = oficina;
      matchMaint.observacao = observacao;

      // Automatically register real-world cost
      if (finalCost > 0) {
        liveDb.expenses.push({
          id: "exp_" + Math.random().toString(36).substr(2, 9),
          companyId: ctx.companyId,
          truckId: matchMaint.truckId,
          tipo: "Manutenção",
          valor: finalCost,
          data: completionDate,
          documento: "Auto-Manutenção " + matchMaint.id.toUpperCase(),
          descritivo: `Peça/Revisão concluída de: ${matchMaint.item}${oficina ? ` na oficina ${oficina}` : ''}.${observacao ? ` Obs: ${observacao}` : ''}`
        });

        liveDb.cash_flow.push({
          id: "cash_" + Math.random().toString(36).substr(2, 9),
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Manutenção e Peças",
          valor: finalCost,
          data: completionDate,
          meioPagamento: meioPagamento,
          descricao: `Despesa Manutenção - Placa ${matchMaint.truckId} (${matchMaint.item}${oficina ? ` @ ${oficina}` : ''})`
        });
      }

      await persistDB();
      return jsonResponse({ success: true, alert: matchMaint });
    }

    if (cleanPath.startsWith("/api/maintenance_alerts/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const exists = liveDb.maintenance_alerts.some((m: any) => m.id === targetId && m.companyId === ctx.companyId);
      if (!exists) return jsonResponse({ error: "Manutenção não encontrada ou acesso negado." }, 404);
      liveDb.maintenance_alerts = liveDb.maintenance_alerts.filter((m: any) => !(m.id === targetId && m.companyId === ctx.companyId));
      await persistDB();
      return jsonResponse({ success: true });
    }

    // 19) POST, PUT, DELETE /api/drivers
    if (cleanPath === "/api/drivers" && method === "POST") {
      const cpfStr = String(body.cpf || "").trim();
      const existing = liveDb.drivers.find((d: any) => d.cpf === cpfStr && d.companyId === ctx.companyId);
      if (existing) {
        return jsonResponse({ error: "Motorista com este CPF já cadastrado." }, 400);
      }

      const newDriver = {
        id: "drv_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        nome: body.nome,
        cpf: cpfStr,
        cnh: body.cnh || "",
        categoriaCnh: body.categoriaCnh || "D",
        vencimentoCnh: body.vencimentoCnh,
        telefone: body.telefone || "",
        status: body.status || "Ativo",
        salarioFixo: Number(body.salarioFixo || 0),
        diariaPadrao: Number(body.diariaPadrao || 0),
        almocoPadrao: Number(body.almocoPadrao || 0),
        tipoRemuneracao: body.tipoRemuneracao || "Fixo + Variável"
      };
      liveDb.drivers.push(newDriver);
      await persistDB();
      return jsonResponse({ success: true, driver: newDriver });
    }

    if (cleanPath.startsWith("/api/drivers/") && method === "PUT") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];

      const matchDrv = liveDb.drivers.find((d: any) => d.id === targetId && d.companyId === ctx.companyId);
      if (!matchDrv) return jsonResponse({ error: "Motorista não encontrado ou acesso negado." }, 404);

      if (body.nome !== undefined) matchDrv.nome = body.nome;
      if (body.cpf !== undefined) matchDrv.cpf = body.cpf;
      if (body.cnh !== undefined) matchDrv.cnh = body.cnh;
      if (body.categoriaCnh !== undefined) matchDrv.categoriaCnh = body.categoriaCnh;
      if (body.vencimentoCnh !== undefined) matchDrv.vencimentoCnh = body.vencimentoCnh;
      if (body.telefone !== undefined) matchDrv.telefone = body.telefone;
      if (body.status !== undefined) matchDrv.status = body.status;
      if (body.salarioFixo !== undefined) matchDrv.salarioFixo = Number(body.salarioFixo);
      if (body.diariaPadrao !== undefined) matchDrv.diariaPadrao = Number(body.diariaPadrao);
      if (body.almocoPadrao !== undefined) matchDrv.almocoPadrao = Number(body.almocoPadrao);
      if (body.tipoRemuneracao !== undefined) matchDrv.tipoRemuneracao = body.tipoRemuneracao;

      await persistDB();
      return jsonResponse({ success: true, driver: matchDrv });
    }

    if (cleanPath.startsWith("/api/drivers/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const exists = liveDb.drivers.some((d: any) => d.id === targetId && d.companyId === ctx.companyId);
      if (!exists) return jsonResponse({ error: "Motorista não encontrado ou acesso negado." }, 404);
      liveDb.drivers = liveDb.drivers.filter((d: any) => !(d.id === targetId && d.companyId === ctx.companyId));
      await persistDB();
      return jsonResponse({ success: true });
    }

    // 20) POST, PUT, DELETE /api/routes
    if (cleanPath === "/api/routes" && method === "POST") {
      const newRoute = {
        id: "route_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        nome: body.nome,
        origem: body.origem,
        destino: body.destino,
        pedagios: Number(body.pedagios || 0),
        distanciaKm: Number(body.distanciaKm || 0),
        tempoEstimado: body.tempoEstimado || "1 dia"
      };
      liveDb.routes.push(newRoute);
      await persistDB();
      return jsonResponse({ success: true, route: newRoute });
    }

    if (cleanPath.startsWith("/api/routes/") && method === "PUT") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];

      const matchRt = liveDb.routes.find((r: any) => r.id === targetId && r.companyId === ctx.companyId);
      if (!matchRt) return jsonResponse({ error: "Rota não encontrada ou acesso negado." }, 404);

      if (body.nome !== undefined) matchRt.nome = body.nome;
      if (body.origem !== undefined) matchRt.origem = body.origem;
      if (body.destino !== undefined) matchRt.destino = body.destino;
      if (body.pedagios !== undefined) matchRt.pedagios = Number(body.pedagios);
      if (body.distanciaKm !== undefined) matchRt.distanciaKm = Number(body.distanciaKm);
      if (body.tempoEstimado !== undefined) matchRt.tempoEstimado = body.tempoEstimado;

      await persistDB();
      return jsonResponse({ success: true, route: matchRt });
    }

    if (cleanPath.startsWith("/api/routes/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const exists = liveDb.routes.some((r: any) => r.id === targetId && r.companyId === ctx.companyId);
      if (!exists) return jsonResponse({ error: "Rota não encontrada ou acesso negado." }, 404);
      liveDb.routes = liveDb.routes.filter((r: any) => !(r.id === targetId && r.companyId === ctx.companyId));
      await persistDB();
      return jsonResponse({ success: true });
    }

    // 20.1) POST, PUT, DELETE /api/driver_payments
    if (cleanPath === "/api/driver_payments" && method === "POST") {
      const newPay = {
        id: "pay_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        driverId: body.driverId,
        data: body.data || new Date().toISOString().split("T")[0],
        referenciaMesAno: body.referenciaMesAno || new Date().toISOString().slice(0, 7), // "YYYY-MM"
        valorSalario: Number(body.valorSalario || 0),
        valorDiarias: Number(body.valorDiarias || 0),
        valorAlmoco: Number(body.valorAlmoco || 0),
        valorComissoes: Number(body.valorComissoes || 0),
        valorAjustes: Number(body.valorAjustes || 0),
        valorTotalPago: Number(body.valorTotalPago || 0),
        meioPagamento: body.meioPagamento || "Pix",
        observacao: body.observacao || ""
      };
      if (!liveDb.driver_payments) liveDb.driver_payments = [];
      liveDb.driver_payments.push(newPay);

      // Register matching Expense in the central system
      if (newPay.valorTotalPago > 0) {
        const foundDriver = (liveDb.drivers || []).find((d: any) => d.id === newPay.driverId && d.companyId === ctx.companyId);
        const drvName = foundDriver ? foundDriver.nome : "Motorista";

        liveDb.expenses.push({
          id: "exp_" + Math.random().toString(36).substr(2, 9),
          companyId: ctx.companyId,
          tipo: "Salários e Pró-Labore",
          valor: newPay.valorTotalPago,
          data: newPay.data,
          documento: `Recibo Fechamento ${newPay.referenciaMesAno}`,
          descritivo: `Fechamento financeiro de motorista (${drvName}) para o período ${newPay.referenciaMesAno}. Refeição, diárias, comissão e adiantamentos.`
        });

        liveDb.cash_flow.push({
          id: "cash_" + Math.random().toString(36).substr(2, 9),
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Salários, Pró-Labore e Comissões",
          valor: newPay.valorTotalPago,
          data: newPay.data,
          meioPagamento: newPay.meioPagamento,
          descricao: `Fechamento motorista ${drvName} - Período ${newPay.referenciaMesAno}`
        });
      }

      await persistDB();
      return jsonResponse({ success: true, payment: newPay });
    }

    if (cleanPath.startsWith("/api/driver_payments/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const exists = (liveDb.driver_payments || []).some((p: any) => p.id === targetId && p.companyId === ctx.companyId);
      if (!exists) return jsonResponse({ error: "Pagamento não encontrado ou acesso negado." }, 404);
      liveDb.driver_payments = (liveDb.driver_payments || []).filter((p: any) => !(p.id === targetId && p.companyId === ctx.companyId));
      await persistDB();
      return jsonResponse({ success: true });
    }

    // 20.2) POST, PUT, DELETE /api/driver_adjustments
    if (cleanPath === "/api/driver_adjustments" && method === "POST") {
      const newAdj = {
        id: "adj_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        driverId: body.driverId,
        data: body.data || new Date().toISOString().split("T")[0],
        tipo: body.tipo || "Vale", // "Vale" (Adiantamento), "Desconto", "Bônus"
        valor: Number(body.valor || 0),
        descricao: body.descricao || "",
        referenciaMesAno: body.referenciaMesAno || new Date().toISOString().slice(0, 7)
      };
      if (!liveDb.driver_adjustments) liveDb.driver_adjustments = [];
      liveDb.driver_adjustments.push(newAdj);
      await persistDB();
      return jsonResponse({ success: true, adjustment: newAdj });
    }

    if (cleanPath.startsWith("/api/driver_adjustments/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      const exists = (liveDb.driver_adjustments || []).some((a: any) => a.id === targetId && a.companyId === ctx.companyId);
      if (!exists) return jsonResponse({ error: "Ajuste não encontrado ou acesso negado." }, 404);
      liveDb.driver_adjustments = (liveDb.driver_adjustments || []).filter((a: any) => !(a.id === targetId && a.companyId === ctx.companyId));
      await persistDB();
      return jsonResponse({ success: true });
    }

    // 21) POST, PUT, DELETE /api/categories
    if (cleanPath === "/api/categories" && method === "POST") {
      const activeComp = ctx.currentCompany;
      if (!activeComp) return jsonResponse({ error: "Empresa não ativa." }, 404);

      if (body.tipo === "entrada") {
        if (!activeComp.categories_entrada) activeComp.categories_entrada = [...liveDb.categories_entrada];
        if (!activeComp.categories_entrada.includes(body.nome)) {
          activeComp.categories_entrada.push(body.nome);
        }
      } else {
        if (!activeComp.categories_saida) activeComp.categories_saida = [...liveDb.categories_saida];
        if (!activeComp.categories_saida.includes(body.nome)) {
          activeComp.categories_saida.push(body.nome);
        }
      }

      await persistDB();
      return jsonResponse({ success: true });
    }

    if (cleanPath === "/api/categories" && method === "PUT") {
      const activeComp = ctx.currentCompany;
      if (!activeComp) return jsonResponse({ error: "Empresa não ativa." }, 404);

      const { oldNome, newNome, tipo } = body;
      if (tipo === "entrada") {
        if (!activeComp.categories_entrada) activeComp.categories_entrada = [...liveDb.categories_entrada];
        const idx = activeComp.categories_entrada.indexOf(oldNome);
        if (idx !== -1) {
          activeComp.categories_entrada[idx] = newNome;
          // Cascade rename in cash flow
          liveDb.cash_flow.forEach((c: any) => {
            if (c.companyId === ctx.companyId && c.tipo === "entrada" && c.categoria === oldNome) {
              c.categoria = newNome;
            }
          });
        }
      } else {
        if (!activeComp.categories_saida) activeComp.categories_saida = [...liveDb.categories_saida];
        const idx = activeComp.categories_saida.indexOf(oldNome);
        if (idx !== -1) {
          activeComp.categories_saida[idx] = newNome;
          // Cascade rename in cash flow and expenses
          liveDb.cash_flow.forEach((c: any) => {
            if (c.companyId === ctx.companyId && c.tipo === "saida" && c.categoria === oldNome) {
              c.categoria = newNome;
            }
          });
          liveDb.expenses.forEach((e: any) => {
            if (e.companyId === ctx.companyId && e.tipo === oldNome) {
              e.tipo = newNome;
            }
          });
        }
      }

      await persistDB();
      return jsonResponse({ success: true });
    }

    if (cleanPath === "/api/categories" && method === "DELETE") {
      const activeComp = ctx.currentCompany;
      if (!activeComp) return jsonResponse({ error: "Empresa não ativa." }, 404);

      const { nome, tipo } = body;
      if (tipo === "entrada") {
        if (!activeComp.categories_entrada) activeComp.categories_entrada = [...liveDb.categories_entrada];
        activeComp.categories_entrada = activeComp.categories_entrada.filter((c: string) => c !== nome);
      } else {
        if (!activeComp.categories_saida) activeComp.categories_saida = [...liveDb.categories_saida];
        activeComp.categories_saida = activeComp.categories_saida.filter((c: string) => c !== nome);
      }

      await persistDB();
      return jsonResponse({ success: true });
    }

    // 21) POST, PUT, DELETE /api/gas_stations
    if (cleanPath === "/api/gas_stations" && method === "POST") {
      const newStation = {
        id: "gas_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        nome: body.nome || "",
        cnpj: body.cnpj || "",
        cidade: body.cidade || "",
        uf: body.uf || "",
        precoDiesel: body.precoDiesel ? Number(body.precoDiesel) : 0,
        status: body.status || "Ativo"
      };
      if (!liveDb.gas_stations) liveDb.gas_stations = [];
      liveDb.gas_stations.push(newStation);
      await persistDB();
      return jsonResponse({ success: true, gas_station: newStation });
    }

    if (cleanPath.startsWith("/api/gas_stations/") && method === "PUT") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];

      if (!liveDb.gas_stations) liveDb.gas_stations = [];
      const matchGas = liveDb.gas_stations.find((g: any) => g.id === targetId && g.companyId === ctx.companyId);
      if (!matchGas) return jsonResponse({ error: "Posto não encontrado ou acesso negado." }, 404);

      if (body.nome !== undefined) matchGas.nome = body.nome;
      if (body.cnpj !== undefined) matchGas.cnpj = body.cnpj;
      if (body.cidade !== undefined) matchGas.cidade = body.cidade;
      if (body.uf !== undefined) matchGas.uf = body.uf;
      if (body.precoDiesel !== undefined) matchGas.precoDiesel = Number(body.precoDiesel);
      if (body.status !== undefined) matchGas.status = body.status;

      await persistDB();
      return jsonResponse({ success: true, gas_station: matchGas });
    }

    // Cascade delete or simple delete for gas station
    if (cleanPath.startsWith("/api/gas_stations/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      if (!liveDb.gas_stations) liveDb.gas_stations = [];
      const exists = liveDb.gas_stations.some((g: any) => g.id === targetId && g.companyId === ctx.companyId);
      if (!exists) return jsonResponse({ error: "Posto não encontrado ou acesso negado." }, 404);
      liveDb.gas_stations = liveDb.gas_stations.filter((g: any) => !(g.id === targetId && g.companyId === ctx.companyId));
      await persistDB();
      return jsonResponse({ success: true });
    }

    // 22) POST, PUT, DELETE /api/expense_companies
    if (cleanPath === "/api/expense_companies" && method === "POST") {
      const newExpCompany = {
        ...body,
        id: `exp_comp_${Date.now()}`,
        companyId: ctx.companyId
      };
      if (!liveDb.expense_companies) liveDb.expense_companies = [];
      liveDb.expense_companies.push(newExpCompany);
      await persistDB();
      return jsonResponse(newExpCompany);
    }

    if (cleanPath.startsWith("/api/expense_companies/") && method === "PUT") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      if (!liveDb.expense_companies) liveDb.expense_companies = [];
      const matchEC = liveDb.expense_companies.find((ec: any) => ec.id === targetId);
      if (!matchEC) {
        return jsonResponse({ error: "Empresa de despesa não encontrada" }, 404);
      }
      if (matchEC.companyId !== ctx.companyId) {
        return jsonResponse({ error: "Não autorizado." }, 403);
      }

      if (body.nome !== undefined) matchEC.nome = body.nome;
      if (body.cnpj !== undefined) matchEC.cnpj = body.cnpj;
      if (body.cidade !== undefined) matchEC.cidade = body.cidade;
      if (body.uf !== undefined) matchEC.uf = body.uf;

      await persistDB();
      return jsonResponse(matchEC);
    }

    if (cleanPath.startsWith("/api/expense_companies/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      if (!liveDb.expense_companies) liveDb.expense_companies = [];
      const exists = liveDb.expense_companies.some((ec: any) => ec.id === targetId && ec.companyId === ctx.companyId);
      if (!exists) return jsonResponse({ error: "Empresa de despesa não encontrada ou acesso negado." }, 404);
      liveDb.expense_companies = liveDb.expense_companies.filter((ec: any) => !(ec.id === targetId && ec.companyId === ctx.companyId));
      await persistDB();
      return jsonResponse({ success: true });
    }

    // fallback
    return jsonResponse({ error: `Not Found: ${method} ${cleanPath}` }, 404);
  } catch (err: any) {
    console.error(`Error emulating API route ${cleanPath}:`, err);
    return jsonResponse({ error: "Erro interno ao processar a requisição client-side.", message: err.message }, 500);
  }
}

