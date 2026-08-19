import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { configJson } from "./configJson";
import { dbTemplate } from "./dbTemplate";

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
let liveDb: any = (() => {
  try {
    const saved = localStorage.getItem("gbfleet_db_local");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate structure contains key arrays
      if (parsed.users && parsed.companies) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Could not load local DB cache from localStorage:", e);
  }
  return JSON.parse(JSON.stringify(dbTemplate));
})();

// Helper to recursively extract base64 attachment files and save them to separate documents in Firestore,
// replacing the base64 content with lightweight references like "attachment_ref:attach_xxx".
// This completely bypasses the 1MB Firestore document limit for the main database state doc.
async function extractAndSaveAttachments(obj: any): Promise<void> {
  if (!obj || typeof obj !== "object") return;

  const keys = Object.keys(obj);
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.startsWith("data:") && val.includes(";base64,")) {
      const attachId = "attach_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
      try {
        const docRef = doc(firestore, "system_state", attachId);
        await setDoc(docRef, { base64: val });
        console.log(`[Attachment Sync] Extracted and saved attachment to separate doc: ${attachId}`);
        obj[key] = `attachment_ref:${attachId}`;
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

// Save in-memory DB back to localStorage and Firestore
// Promise Chaining Queue for sequential, direct, and reliable blocking writes to Firestore
let lastWritePromise: Promise<void> = Promise.resolve();

export async function persistDB() {
  // Chain the Firestore write sequentially to guarantee order and that the absolute latest data is saved.
  // Awaiting this promise blocks until the Firestore write has fully succeeded.
  lastWritePromise = lastWritePromise.then(async () => {
    try {
      // 1) Extract and save massive attachments to separate Firestore documents first
      await extractAndSaveAttachments(liveDb);

      // 2) Sanitize the database of any 'undefined' properties that Firestore rejects
      sanitizeForFirestore(liveDb);

      // 3) Save clean, tiny database locally immediately for 100% responsiveness
      try {
        localStorage.setItem("gbfleet_db_local", JSON.stringify(liveDb));
      } catch (e) {
        console.error("Failed to write DB to localStorage:", e);
      }

      // Notify reactive listeners across the app so all UI views update immediately
      notifyListeners();

      // 4) Persist clean, tiny database document to Firestore
      const docRef = doc(firestore, "system_state", "gbfleet_db");
      await setDoc(docRef, liveDb);
      console.log("[Firebase Client SDK] Direct write to Firestore successfully completed.");
    } catch (err: any) {
      console.error("[Firebase Client SDK] Error: Failed to persist directly to Firestore.", err.message);
    }
  });

  return lastWritePromise;
}

// Pull / fetch database from Firestore (triggers in background on boot and on demand)
export async function pullDB(forceFresh: boolean = false) {
  try {
    const docRef = doc(firestore, "system_state", "gbfleet_db");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const remoteData = snap.data();
      if (remoteData && remoteData.users && remoteData.companies) {
        // Enforce preserving demo or state rules
        let scrubbed = false;
        if (remoteData.companies && remoteData.companies.some((c: any) => c.id === "comp_1")) {
          remoteData.companies = remoteData.companies.filter((c: any) => c.id !== "comp_1");
          scrubbed = true;
        }
        if (remoteData.users && remoteData.users.some((u: any) => u.id === "user_1" || u.companyId === "comp_1")) {
          remoteData.users = remoteData.users.filter((u: any) => u.id !== "user_1" && u.companyId !== "comp_1");
          scrubbed = true;
        }
        const arrayKeys = ["trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes", "gas_stations", "expense_companies", "bills", "driver_payments", "driver_adjustments"];
        arrayKeys.forEach(key => {
          if (remoteData[key] && remoteData[key].some((item: any) => item.companyId === "comp_1" || item.id?.includes("init"))) {
            remoteData[key] = remoteData[key].filter((item: any) => item.companyId !== "comp_1" && !item.id?.includes("init"));
            scrubbed = true;
          }
        });

        // No merging of old local storage items is performed to prevent resurrection of deleted/modified records.
        // Firestore is the absolute source of truth. We only ensure that required array fields exist on the pulled data.
        const allKeys = ["trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes", "gas_stations", "expense_companies", "chat_logs", "bills", "driver_payments", "driver_adjustments"];
        allKeys.forEach(key => {
          if (!remoteData[key]) {
            remoteData[key] = [];
          }
        });

        liveDb = remoteData;
        try {
          localStorage.setItem("gbfleet_db_local", JSON.stringify(liveDb));
        } catch (e) {
          // ignore
        }
        console.log("[Firebase Client SDK] Successfully synced fresh Firestore data.");
        
        if (scrubbed) {
          await persistDB();
        }

        notifyListeners();
      }
    } else {
      console.log("[Firebase Client SDK] Remote gbfleet_db document does not exist. Initializing with local data.");
      await persistDB();
    }
  } catch (err: any) {
    console.warn("[Firebase Client SDK] Connection fallback: Failed to pull remote Firestore document on initialization.", err.message);
  }
}

// Attach Real-Time Firestore onSnapshot Listener
let snapshotUnsubscribe: (() => void) | null = null;
function initFirestoreLiveListener() {
  try {
    if (snapshotUnsubscribe) {
      snapshotUnsubscribe();
    }
    const docRef = doc(firestore, "system_state", "gbfleet_db");
    snapshotUnsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const remoteData = snap.data();
        if (remoteData && remoteData.users && remoteData.companies) {
          const allKeys = ["trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes", "gas_stations", "expense_companies", "chat_logs", "bills", "driver_payments", "driver_adjustments"];
          allKeys.forEach(key => {
            if (!remoteData[key]) {
              remoteData[key] = [];
            }
          });

          liveDb = remoteData;
          try {
            localStorage.setItem("gbfleet_db_local", JSON.stringify(liveDb));
          } catch (e) {
            // ignore
          }
          console.log("[Firebase Client SDK] Real-time live Firestore push received! Notifying subscribers.");
          notifyListeners();
        }
      }
    }, (error) => {
      console.warn("[Firebase Client SDK] Real-time snapshot listener error:", error.message);
    });
  } catch (err: any) {
    console.warn("[Firebase Client SDK] Failed to set up snapshot listener:", err.message);
  }
}

let initialPullPromise: Promise<void> | null = null;

export function ensureDbPulled() {
  if (!initialPullPromise) {
    initialPullPromise = pullDB();
    initFirestoreLiveListener();
  }
  return initialPullPromise;
}

// Kick off initial background sync & live listener
ensureDbPulled();

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
  // Ensure the database has been fully pulled/synced from Firestore on boot before executing any action.
  // This guarantees that we never use stale or empty cached data.
  await ensureDbPulled();

  const method = (options.method || "GET").toUpperCase();
  const headers = options.headers || {};
  const body = options.body ? JSON.parse(options.body) : {};

  // Normalize path by stripping query params
  const cleanPath = path.split("?")[0];

  const ctx = resolveContext(headers);

  // Helper helper to return JSON response mock
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

    // 2) POST /api/auth/login
    if (cleanPath === "/api/auth/login" && method === "POST") {
      const emailStr = String(body.email || "").toLowerCase().trim();
      const passwordStr = String(body.password || "");

      const user = liveDb.users.find((u: any) => u.email?.toLowerCase() === emailStr);
      if (!user) {
        return jsonResponse({ error: "E-mail ou senha incorretos." }, 401);
      }

      const correctPassword = String(user.password || "demo");
      if (correctPassword !== passwordStr) {
        return jsonResponse({ error: "E-mail ou senha incorretos." }, 401);
      }

      const company = liveDb.companies.find((c: any) => c.id === user.companyId) || { id: user.companyId, nome: "GBFleet Demo" };
      return jsonResponse({ success: true, user, company });
    }

    // Auth validation middleware logic
    if (cleanPath !== "/api/reset" && !ctx.user) {
      return jsonResponse({ error: "Sessão expirada. Faça login novamente." }, 401);
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

      await persistDB();
      return jsonResponse({ success: true, user: dbUser });
    }

    // 4) GET /api/data
    if (cleanPath === "/api/data" && method === "GET") {
      let isBlocked = false;
      let daysRemaining = 30;

      const currentCompany = ctx.currentCompany;
      if (currentCompany && ctx.user.role !== "superadmin") {
        const created = new Date(currentCompany.createdAt || new Date());
        const now = new Date();
        const elapsedDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        daysRemaining = Math.max(0, (currentCompany.trialDays || 30) - elapsedDays);

        if (currentCompany.status === "inativo" || (!currentCompany.pago && daysRemaining <= 0)) {
          isBlocked = true;
        }
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

          const created = new Date(c.createdAt || new Date());
          const now = new Date();
          const elapsedDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
          const daysRemaining = Math.max(0, (c.trialDays || 30) - elapsedDays);

          const limiteCaminhoes = c.limiteCaminhoes ?? 10;
          const valorPorCaminhao = c.valorPorCaminhao ?? 30;
          const valorMensalidade = c.valorMensalidade ?? (limiteCaminhoes * valorPorCaminhao);
          const dataVencimento = c.dataVencimento ?? new Date(created.getTime() + (c.trialDays || 30) * 86400000).toISOString().split('T')[0];

          return {
            ...c,
            limiteCaminhoes,
            valorPorCaminhao,
            valorMensalidade,
            dataVencimento,
            truckCount,
            driverCount,
            freightCount,
            userCount,
            balance: entries - egress,
            daysRemaining,
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

      const { nome, adminNome, adminEmail, adminPassword, plano, status, pago, trialDays, dataVencimento, limiteCaminhoes, valorPorCaminhao, valorMensalidade } = body;
      if (!nome || !adminEmail) {
        return jsonResponse({ error: "Nome da empresa e e-mail do admin são obrigatórios." }, 400);
      }

      const emailLower = adminEmail.toLowerCase().trim();
      const userExists = liveDb.users.some((u: any) => u.email?.toLowerCase() === emailLower);
      if (userExists) {
        return jsonResponse({ error: "E-mail de administrador já cadastrado no sistema." }, 400);
      }

      const createdDate = new Date();
      const defaultDueDate = new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const limiteCaminhoesNum = limiteCaminhoes !== undefined ? Number(limiteCaminhoes) : 10;
      const valorPorCaminhaoNum = valorPorCaminhao !== undefined ? Number(valorPorCaminhao) : 30;
      const valorMensalidadeNum = valorMensalidade !== undefined ? Number(valorMensalidade) : (limiteCaminhoesNum * valorPorCaminhaoNum);

      const newCompany = {
        id: "comp_" + Math.random().toString(36).substr(2, 9),
        nome: nome.trim(),
        plano: plano || "Enterprise",
        createdAt: createdDate.toISOString(),
        status: status || "ativo",
        pago: pago !== undefined ? pago : false,
        trialDays: trialDays ? Number(trialDays) : 30,
        supportCode: null,
        supportCodeCreatedAt: null,
        supportAuthorizedUntil: null,
        dataVencimento: dataVencimento || defaultDueDate,
        limiteCaminhoes: limiteCaminhoesNum,
        valorPorCaminhao: valorPorCaminhaoNum,
        valorMensalidade: valorMensalidadeNum
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

      await persistDB();
      return jsonResponse({ success: true, company: newCompany, admin: newAdmin });
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
      if (body.status !== undefined) comp.status = body.status;
      if (body.pago !== undefined) comp.pago = body.pago;
      if (body.trialDays !== undefined) {
        const val = Number(body.trialDays);
        comp.trialDays = isNaN(val) ? 30 : val;
      }
      if (body.createdAt !== undefined) comp.createdAt = body.createdAt;
      if (body.dataVencimento !== undefined) comp.dataVencimento = body.dataVencimento;
      
      // Robust handling of fleet limit and pricing variables with logging
      if (body.limiteCaminhoes !== undefined) {
        const parsedLim = Number(body.limiteCaminhoes);
        comp.limiteCaminhoes = isNaN(parsedLim) ? 10 : parsedLim;
      }
      if (body.valorPorCaminhao !== undefined) {
        const parsedVal = Number(body.valorPorCaminhao);
        comp.valorPorCaminhao = isNaN(parsedVal) ? 30 : parsedVal;
      }
      if (body.valorMensalidade !== undefined) {
        const parsedMensal = Number(body.valorMensalidade);
        comp.valorMensalidade = isNaN(parsedMensal) ? ((comp.limiteCaminhoes || 10) * (comp.valorPorCaminhao || 30)) : parsedMensal;
      }

      console.log(`[Firebase Client SDK] Updating company subscription: ${targetId}`, {
        nome: comp.nome,
        limiteCaminhoes: comp.limiteCaminhoes,
        valorPorCaminhao: comp.valorPorCaminhao,
        valorMensalidade: comp.valorMensalidade,
        dataVencimento: comp.dataVencimento
      });

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

      await persistDB();
      return jsonResponse({ success: true, company: comp });
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

    // 10) POST /api/support/generate
    if (cleanPath === "/api/support/generate" && method === "POST") {
      const activeComp = ctx.currentCompany;
      if (!activeComp) {
        return jsonResponse({ error: "Empresa não resolvida." }, 404);
      }

      const code = "GB-" + Math.floor(1000 + Math.random() * 9000);
      activeComp.supportCode = code;
      activeComp.supportCodeCreatedAt = new Date().toISOString();

      await persistDB();
      return jsonResponse({ success: true, supportCode: code });
    }

    // 11) POST /api/reset
    if (cleanPath === "/api/reset" && method === "POST") {
      // Restore initial data but preserve admin master
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

      const matchLog = liveDb.fuel_logs.find((f: any) => f.id === targetId);
      if (!matchLog) return jsonResponse({ error: "Abastecimento não encontrado." }, 404);

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

      // Filter out old diesel/arla automatic expense entries for this fuel log
      liveDb.expenses = liveDb.expenses.filter((e: any) => {
        const isFuelSync = e.fuelLogId === targetId || (e.documento === "Auto-Abastecimento" && e.truckId === oldLog.truckId && Number(e.valor) === Number(oldLog.valor) && e.data === oldLog.data);
        const isArlaSync = e.fuelLogId === targetId && (e.tipo?.includes("Arla") || e.documento === "Auto-Abastecimento-Arla");
        return !isFuelSync && !isArlaSync;
      });

      // Filter out old diesel/arla automatic cash flow entries for this fuel log
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => {
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

      const oldLogIndex = liveDb.fuel_logs.findIndex((f: any) => f.id === targetId);
      if (oldLogIndex === -1) {
        return jsonResponse({ error: "Abastecimento não encontrado." }, 404);
      }
      const oldLog = liveDb.fuel_logs[oldLogIndex];

      liveDb.fuel_logs.splice(oldLogIndex, 1);

      // Remove associated expense
      liveDb.expenses = liveDb.expenses.filter((e: any) => !(e.fuelLogId === targetId || (e.documento === "Auto-Abastecimento" && e.truckId === oldLog.truckId && Number(e.valor) === Number(oldLog.valor) && e.data === oldLog.data)));

      // Remove associated cash flow
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => !(c.fuelLogId === targetId || (c.tipo === "saida" && c.categoria?.includes("Diesel") && Number(c.valor) === Number(oldLog.valor) && c.data === oldLog.data && c.descricao?.includes(oldLog.truckId))));

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
      const idx = liveDb.expenses.findIndex((e: any) => e.id === targetId);
      if (idx === -1) {
        return jsonResponse({ error: "Despesa não encontrada." }, 404);
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
      const idx = liveDb.expenses.findIndex((e: any) => e.id === targetId);
      if (idx !== -1) {
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

        liveDb.expenses = liveDb.expenses.filter((e: any) => e.id !== targetId);
      }
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
      const matchItem = liveDb.cash_flow.find((c: any) => c.id === targetId);
      if (!matchItem) return jsonResponse({ error: "Item de caixa não encontrado." }, 404);

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
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => c.id !== targetId);
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
      const idx = liveDb.bills.findIndex((b: any) => b.id === targetId);

      if (idx === -1) {
        return jsonResponse({ error: "Conta a pagar não encontrada." }, 404);
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
        liveDb.expenses = liveDb.expenses.filter((e: any) => e.billId !== targetId);
        liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => c.billId !== targetId);
      }

      await persistDB();
      return jsonResponse({ success: true, bill: liveDb.bills[idx] });
    }

    if (cleanPath.startsWith("/api/bills/") && method === "DELETE") {
      if (!liveDb.bills) liveDb.bills = [];
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];

      liveDb.bills = liveDb.bills.filter((b: any) => b.id !== targetId);
      liveDb.expenses = liveDb.expenses.filter((e: any) => e.billId !== targetId);
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => c.billId !== targetId);

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
      liveDb.trucks = liveDb.trucks.filter((t: any) => t.id !== targetId);
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

      const matchFrt = liveDb.freights.find((f: any) => f.id === targetId);
      if (!matchFrt) return jsonResponse({ error: "Frete não encontrado." }, 404);

      matchFrt.status = body.status;
      await persistDB();
      return jsonResponse({ success: true, freight: matchFrt });
    }

    if (cleanPath.startsWith("/api/freights/") && !cleanPath.endsWith("/status") && method === "PUT") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];

      const matchFrt = liveDb.freights.find((f: any) => f.id === targetId);
      if (!matchFrt) return jsonResponse({ error: "Frete não encontrado." }, 404);

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
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => !c.id.includes(targetId));

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
      
      liveDb.fuel_logs = liveDb.fuel_logs.filter((l: any) => l.id !== fuelLogId);
      liveDb.expenses = liveDb.expenses.filter((e: any) => e.fuelLogId !== fuelLogId);
      liveDb.cash_flow = liveDb.cash_flow.filter((c: any) => c.fuelLogId !== fuelLogId && c.id !== "cash_fuel_" + fuelLogId && c.id !== "cash_arla_" + fuelLogId);

      if (Number(matchFrt.combustivel) > 0 || Number(body.valorArla) > 0) {
        const matchedStation = (liveDb.gas_stations || []).find((g: any) => g.id === (body.gasStationId || ""));
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

      liveDb.freights = liveDb.freights.filter((f: any) => f.id !== targetId);
      
      // Cascade delete fuel logs, expenses, and cash flows cleanly
      const fuelLogId = "fuel_freight_" + targetId;
      liveDb.fuel_logs = (liveDb.fuel_logs || []).filter((l: any) => l.id !== fuelLogId);
      liveDb.expenses = (liveDb.expenses || []).filter((e: any) => e.fuelLogId !== fuelLogId);
      liveDb.cash_flow = (liveDb.cash_flow || []).filter((c: any) => c.fuelLogId !== fuelLogId && c.id !== "cash_fuel_" + fuelLogId && !c.id.includes(targetId));

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

      const matchMaint = liveDb.maintenance_alerts.find((m: any) => m.id === targetId);
      if (!matchMaint) return jsonResponse({ error: "Manutenção não encontrada." }, 404);

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
      liveDb.maintenance_alerts = liveDb.maintenance_alerts.filter((m: any) => m.id !== targetId);
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

      const matchDrv = liveDb.drivers.find((d: any) => d.id === targetId);
      if (!matchDrv) return jsonResponse({ error: "Motorista não encontrado." }, 404);

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
      liveDb.drivers = liveDb.drivers.filter((d: any) => d.id !== targetId);
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

      const matchRt = liveDb.routes.find((r: any) => r.id === targetId);
      if (!matchRt) return jsonResponse({ error: "Rota não encontrada." }, 404);

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
      liveDb.routes = liveDb.routes.filter((r: any) => r.id !== targetId);
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
        const foundDriver = (liveDb.drivers || []).find((d: any) => d.id === newPay.driverId);
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
      liveDb.driver_payments = (liveDb.driver_payments || []).filter((p: any) => p.id !== targetId);
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
      liveDb.driver_adjustments = (liveDb.driver_adjustments || []).filter((a: any) => a.id !== targetId);
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
      const matchGas = liveDb.gas_stations.find((g: any) => g.id === targetId);
      if (!matchGas) return jsonResponse({ error: "Posto não encontrado." }, 404);

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
      liveDb.gas_stations = liveDb.gas_stations.filter((g: any) => g.id !== targetId);
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
      liveDb.expense_companies = liveDb.expense_companies.filter((ec: any) => ec.id !== targetId);
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
