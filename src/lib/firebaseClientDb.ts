import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
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

// Save in-memory DB back to localStorage and Firestore
let isSyncingToFirestore = false;
let pendingSyncPromise: Promise<void> | null = null;

export async function persistDB() {
  // Always save locally immediately for 100% responsiveness and offline safety
  try {
    localStorage.setItem("gbfleet_db_local", JSON.stringify(liveDb));
  } catch (e) {
    console.error("Failed to write DB to localStorage:", e);
  }

  // Sync to Firestore remotely (non-blocking for UI)
  if (isSyncingToFirestore) {
    return;
  }

  isSyncingToFirestore = true;
  pendingSyncPromise = (async () => {
    try {
      const docRef = doc(firestore, "system_state", "gbfleet_db");
      await setDoc(docRef, liveDb);
      console.log("[Firebase Client SDK] Sync down to Firestore successfully persisted.");
    } catch (err: any) {
      console.warn("[Firebase Client SDK] Warning: Failed to persist to remote Firestore. Using Local Storage.", err.message);
    } finally {
      isSyncingToFirestore = false;
      pendingSyncPromise = null;
    }
  })();

  return pendingSyncPromise;
}

// Pull / fetch database from Firestore (triggers in background on boot)
export async function pullDB() {
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
        const arrayKeys = ["trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes"];
        arrayKeys.forEach(key => {
          if (remoteData[key] && remoteData[key].some((item: any) => item.companyId === "comp_1" || item.id?.includes("init"))) {
            remoteData[key] = remoteData[key].filter((item: any) => item.companyId !== "comp_1" && !item.id?.includes("init"));
            scrubbed = true;
          }
        });

        // Merge Strategy: preserve newly created local companies, users, or other records that are not in remoteData yet
        const allKeys = ["companies", "users", "trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes", "chat_logs"];
        allKeys.forEach(key => {
          if (!remoteData[key]) {
            remoteData[key] = [];
          }
          if (liveDb && liveDb[key] && Array.isArray(liveDb[key])) {
            liveDb[key].forEach((localItem: any) => {
              if (localItem && localItem.id) {
                const existsRemote = remoteData[key].some((remoteItem: any) => remoteItem && remoteItem.id === localItem.id);
                if (!existsRemote) {
                  remoteData[key].push(localItem);
                  scrubbed = true;
                  console.log(`[Firebase Client DB Sync] Preserved local-only item in ${key}:`, localItem.id);
                }
              }
            });
          }
        });

        liveDb = remoteData;
        localStorage.setItem("gbfleet_db_local", JSON.stringify(liveDb));
        console.log("[Firebase Client SDK] Successfully synced remote Firestore data locally.");
        
        if (scrubbed) {
          await persistDB();
        }

        notifyListeners();
      }
    } else {
      console.log("[Firebase Client SDK] Remoto gbfleet_db document does not exist. Initializing with local data.");
      await persistDB();
    }
  } catch (err: any) {
    console.warn("[Firebase Client SDK] Connection fallback: Failed to pull remote Firestore document on initialization.", err.message);
  }
}

// Kick off initial background sync
pullDB();

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

      const categoriesEntrada = currentCompany?.categories_entrada || liveDb.categories_entrada || [];
      const categoriesSaida = currentCompany?.categories_saida || liveDb.categories_saida || [];

      return jsonResponse({
        currentUser: ctx.user,
        company: currentCompany,
        companies: ctx.user.role === "superadmin" ? liveDb.companies.filter((c: any) => c.id !== "comp_superadmin") : undefined,
        trucks: filteredTrucks,
        drivers: filteredDrivers,
        fuel_logs: filteredFuelLogs,
        expenses: filteredExpenses,
        cash_flow: filteredCashFlow,
        freights: filteredFreights,
        maintenance_alerts: filteredMaintenanceAlerts,
        routes: filteredRoutes,
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
      return jsonResponse(liveDb.companies.filter((c: any) => c.id !== "comp_superadmin"));
    }

    // 6) POST /api/superadmin/companies
    if (cleanPath === "/api/superadmin/companies" && method === "POST") {
      if (ctx.user.role !== "superadmin") {
        return jsonResponse({ error: "Não autorizado." }, 403);
      }

      const { nome, adminNome, adminEmail, adminPassword, plano, status, pago, trialDays } = body;
      if (!nome || !adminEmail) {
        return jsonResponse({ error: "Nome da empresa e e-mail do admin são obrigatórios." }, 400);
      }

      const emailLower = adminEmail.toLowerCase().trim();
      const userExists = liveDb.users.some((u: any) => u.email?.toLowerCase() === emailLower);
      if (userExists) {
        return jsonResponse({ error: "E-mail de administrador já cadastrado no sistema." }, 400);
      }

      const newCompany = {
        id: "comp_" + Math.random().toString(36).substr(2, 9),
        nome: nome.trim(),
        plano: plano || "Enterprise",
        createdAt: new Date().toISOString(),
        status: status || "ativo",
        pago: pago !== undefined ? pago : true,
        trialDays: trialDays ? Number(trialDays) : 30,
        supportCode: null,
        supportCodeCreatedAt: null,
        supportAuthorizedUntil: null
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
      if (body.trialDays !== undefined) comp.trialDays = Number(body.trialDays);

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
      const subKeys = ["trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes", "chat_logs"];
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
      const newLog = {
        id: "fuel_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        truckId: body.truckId,
        litros: Number(body.litros),
        valor: Number(body.valor),
        km: Number(body.km),
        data: body.data || new Date().toISOString().split("T")[0]
      };

      liveDb.fuel_logs.push(newLog);

      // Trigger automatic operation expense
      const rawExpense = {
        id: "exp_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        truckId: body.truckId,
        tipo: "Diesel (Abastecimento)",
        valor: Number(body.valor),
        data: body.data || new Date().toISOString().split("T")[0],
        documento: "Auto-Abastecimento",
        descritivo: `Abastecimento automático via painel / chat (${body.litros} Litros)`
      };
      liveDb.expenses.push(rawExpense);

      // Trigger auto flow cash
      const rawCash = {
        id: "cash_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        tipo: "saida",
        categoria: "Diesel (Abastecimento)",
        valor: Number(body.valor),
        data: body.data || new Date().toISOString().split("T")[0],
        descricao: `Combustível Placa ${body.truckId}`
      };
      liveDb.cash_flow.push(rawCash);

      await persistDB();
      return jsonResponse({ success: true, fuelLog: newLog });
    }

    // 13) POST & DELETE /api/expenses
    if (cleanPath === "/api/expenses" && method === "POST") {
      const newExp = {
        id: "exp_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        truckId: body.truckId,
        tipo: body.tipo,
        valor: Number(body.valor),
        data: body.data || new Date().toISOString().split("T")[0],
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

    if (cleanPath.startsWith("/api/expenses/") && method === "DELETE") {
      const parts = cleanPath.split("/");
      const targetId = parts[parts.length - 1];
      liveDb.expenses = liveDb.expenses.filter((e: any) => e.id !== targetId);
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
        
        status: body.status || "Em Trânsito",
        valorBruto: Number(body.valorBruto || 0),
        pedagio: Number(body.pedagio || 0),
        
        // comissao is the driver's travel fee/motorista expense
        comissao: motoristaCost,
        motorista: motoristaCost, // In Freights.tsx, freight.motorista is a number representing driver cost
        
        combustivel: Number(body.combustivel || body.dieselPrevisto || 0),
        dieselPrevisto: Number(body.dieselPrevisto || body.combustivel || 0),
        
        outrasDespesas: Number(body.outrasDespesas || body.outrosCustos || 0),
        outrosCustos: Number(body.outrosCustos || body.outrasDespesas || 0),
        
        resultadoLiquido: Number(body.resultadoLiquido || 0),
        distanciaKm: Number(body.distanciaKm || 0),
        
        data: dateVal,
        dataSaida: dateVal,

        // Premium travel notes
        localAbastecimento: body.localAbastecimento || "",
        fotoAbastecimento: body.fotoAbastecimento || "",
        localPedagio: body.localPedagio || "",
        localMotorista: body.localMotorista || "",
        outrosDetalhes: body.outrosDetalhes || "",
        fotoComprovanteGeral: body.fotoComprovanteGeral || ""
      };
      liveDb.freights.push(newFreight);
      
      // Seed operational cash entries dynamically
      const entryCash = {
        id: "cash_" + Math.random().toString(36).substr(2, 9),
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
          id: "cash_" + Math.random().toString(36).substr(2, 9),
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Pedágios",
          valor: Number(newFreight.pedagio),
          data: dateVal,
          descricao: `Custo Pedágio OS ${newFreight.numeroOrdem}`
        });
      }

      if (motoristaCost > 0) {
        liveDb.cash_flow.push({
          id: "cash_" + Math.random().toString(36).substr(2, 9),
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Motorista (Diária/Comissão)",
          valor: motoristaCost,
          data: dateVal,
          descricao: `Diária/Comissão Motorista (${driverName}) - OS ${newFreight.numeroOrdem}`
        });
      }

      if (Number(newFreight.combustivel) > 0) {
        liveDb.cash_flow.push({
          id: "cash_" + Math.random().toString(36).substr(2, 9),
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Diesel (Abastecimento)",
          valor: Number(newFreight.combustivel),
          data: dateVal,
          descricao: `Combustível Previsto OS ${newFreight.numeroOrdem}`
        });
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

    // 18) POST, POST complete, DELETE /api/maintenance_alerts
    if (cleanPath === "/api/maintenance_alerts" && method === "POST") {
      const newMaint = {
        id: "maint_" + Math.random().toString(36).substr(2, 9),
        companyId: ctx.companyId,
        truckId: body.truckId,
        item: body.item,
        urgencia: body.urgencia,
        dataLimite: body.dataLimite,
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

      matchMaint.status = "Concluído";
      matchMaint.resolvedAt = new Date().toISOString().split("T")[0];

      // Automatically register real-world cost
      const finalCost = Number(body.custoFinal || 0);
      if (finalCost > 0) {
        liveDb.expenses.push({
          id: "exp_" + Math.random().toString(36).substr(2, 9),
          companyId: ctx.companyId,
          truckId: matchMaint.truckId,
          tipo: "Manutenção e Peças",
          valor: finalCost,
          data: matchMaint.resolvedAt,
          documento: "Manutenção " + matchMaint.id.toUpperCase(),
          descritivo: `Peça/Revisão concluída de: ${matchMaint.item}`
        });

        liveDb.cash_flow.push({
          id: "cash_" + Math.random().toString(36).substr(2, 9),
          companyId: ctx.companyId,
          tipo: "saida",
          categoria: "Manutenção e Peças",
          valor: finalCost,
          data: matchMaint.resolvedAt,
          descricao: `Conclusão Manutenção - ${matchMaint.truckId} (${matchMaint.item})`
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
        status: body.status || "Ativo"
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

    // fallback
    return jsonResponse({ error: `Not Found: ${method} ${cleanPath}` }, 404);
  } catch (err: any) {
    console.error(`Error emulating API route ${cleanPath}:`, err);
    return jsonResponse({ error: "Erro interno ao processar a requisição client-side.", message: err.message }, 500);
  }
}
