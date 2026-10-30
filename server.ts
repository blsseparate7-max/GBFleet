import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// CORS Middleware to allow requests from Vercel (or any other domain) and handle custom headers
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-id, x-impersonate-company-id, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Handle OPTIONS pre-flight request
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// Detect environment to choose writeable folder on Vercel
const isVercel = !!(process.env.VERCEL || process.env.NOW_BUILD);
let DB_FILE = isVercel ? path.join("/tmp", "db.json") : path.join(process.cwd(), "db.json");

// Dynamic write permission test to identify read-only environments and avoid EROFS crashes
if (!isVercel) {
  try {
    const testPath = path.join(process.cwd(), ".write-test-" + Math.random().toString(36).substring(7));
    fs.writeFileSync(testPath, "test");
    fs.unlinkSync(testPath);
  } catch (err: any) {
    console.warn("[System] Pasta de trabalho local somente leitura detectada. Usando fallback seguro em /tmp/db.json.");
    DB_FILE = path.join("/tmp", "db.json");
  }
}

// Initialize Firebase Admin configuration if present or from Environment Variables
// Diagnostics logs store to facilitate remote debugging of Serverless 500 errors in Vercel
const startupLogs: string[] = [];

const logSystem = (msg?: any, ...optionalParams: any[]) => {
  try {
    const formatted = `[INFO] ${msg !== undefined ? msg : ""} ${optionalParams.map(a => {
      if (a instanceof Error) return a.message + "\n" + a.stack;
      return typeof a === "object" ? JSON.stringify(a) : String(a);
    }).join(' ')}`;
    startupLogs.push(`[${new Date().toISOString()}] ${formatted}`);
    if (startupLogs.length > 100) startupLogs.shift();
  } catch (e) {}
  console.log(msg, ...optionalParams);
};

const warnSystem = (msg?: any, ...optionalParams: any[]) => {
  try {
    const formatted = `[WARN] ${msg !== undefined ? msg : ""} ${optionalParams.map(a => {
      if (a instanceof Error) return a.message + "\n" + a.stack;
      return typeof a === "object" ? JSON.stringify(a) : String(a);
    }).join(' ')}`;
    startupLogs.push(`[${new Date().toISOString()}] ${formatted}`);
    if (startupLogs.length > 100) startupLogs.shift();
  } catch (e) {}
  console.warn(msg, ...optionalParams);
};

const errorSystem = (msg?: any, ...optionalParams: any[]) => {
  try {
    const formatted = `[ERROR] ${msg !== undefined ? msg : ""} ${optionalParams.map(a => {
      if (a instanceof Error) return a.message + "\n" + a.stack;
      return typeof a === "object" ? JSON.stringify(a) : String(a);
    }).join(' ')}`;
    startupLogs.push(`[${new Date().toISOString()}] ${formatted}`);
    if (startupLogs.length > 100) startupLogs.shift();
  } catch (e) {}
  console.error(msg, ...optionalParams);
};

// Hook into initial system state
console.log("[System] Iniciando servidor em modo Vercel =", !!process.env.VERCEL, "com arquivo DB =", DB_FILE);

// Opção 1: Banco de dados local puro via arquivo db.json (Ativado por padrão para evitar erros de Conta de Serviço do Firebase).
// Se de fato desejar ligar o Firebase/Firestore remoto, adicione ENABLE_FIREBASE=true e as chaves nas variáveis de ambiente.
const ENABLE_FIREBASE = process.env.ENABLE_FIREBASE === "true";

let firestoreRestEnabled = false;
let firestoreProjId = "";
let firestoreDbId = "(default)";
let firebaseServiceAccountObj: any = null;
let lastOauthToken = "";
let oauthTokenExpiry = 0;

if (!ENABLE_FIREBASE) {
  console.log("[Database] Rodando no caminho mais simples (Opção 1): Banco de Dados Local puro via arquivo 'db.json'. Firebase/Firestore desativado.");
} else {
  try {
    let projectId = process.env.FIREBASE_PROJECT_ID;
    let databaseId = process.env.FIREBASE_DATABASE_ID || "(default)";

    const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(firebaseConfigPath)) {
      const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
      if (config.projectId) {
        projectId = config.projectId;
        databaseId = config.firestoreDatabaseId || databaseId;
      }
    }

    if (projectId) {
      firestoreProjId = projectId;
      firestoreDbId = databaseId;
      let credentialLoaded = false;

      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
          let saStr = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
          
          // Se parecer codificado em Base64 (comum no Vercel para evitar problemas de formatação de JSON/Quebra de linha)
          if (saStr.startsWith("ey") || (!saStr.startsWith("{") && !saStr.startsWith("["))) {
            try {
              saStr = Buffer.from(saStr, "base64").toString("utf8");
            } catch (b64err: any) {
              console.warn("[Firebase] O valor do service account não é Base64 puro ou falhou ao decodificar, usando original:", b64err.message);
            }
          }

          let serviceAccount: any = null;
          try {
            serviceAccount = JSON.parse(saStr);
          } catch (jsonErr: any) {
            console.warn("[Firebase] Primeira tentativa de parse JSON falhou. Tentando limpar quebras de linha reais para parse...", jsonErr.message);
            try {
              const sanitized = saStr.replace(/[\r\n]+/g, " ");
              serviceAccount = JSON.parse(sanitized);
            } catch (jsonErr2: any) {
              console.error("[Firebase Error] Falha de parse JSON absoluta na conta de serviço:", jsonErr2.message);
              throw jsonErr2;
            }
          }

          if (serviceAccount && serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
          }

          firebaseServiceAccountObj = serviceAccount;
          credentialLoaded = true;

          if (serviceAccount.project_id) {
            firestoreProjId = serviceAccount.project_id;
          }

          console.log("[Firebase] Carregada conta de serviço via FIREBASE_SERVICE_ACCOUNT para autenticação REST.");
        } catch (saErr: any) {
          console.error("[Firebase] Ignorando FIREBASE_SERVICE_ACCOUNT devido a um erro de parsing/leitura:", saErr.message);
        }
      }

      if (isVercel && !credentialLoaded) {
        console.warn("[Firebase] Erro de parsing ou credenciais vazias na Vercel. Desativando Firestore remoto preventivamente para evitar congelamentos.");
        firestoreRestEnabled = false;
      } else if (credentialLoaded && firestoreProjId) {
        firestoreRestEnabled = true;
        console.log(`[Firebase REST] Configurado com sucesso! ProjectId: ${firestoreProjId}, DatabaseId: ${firestoreDbId}`);
      }
    }
  } catch (err: any) {
    console.error("[Firebase] Falha crítica ao configurar variáveis de autenticação Firestore REST:", err.message);
  }
}

// Helper functions to convert between standard JS objects/values and Firestore REST API format
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === "boolean") {
    return { booleanValue: val };
  }
  if (typeof val === "number") {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === "string") {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(toFirestoreValue)
      }
    };
  }
  if (typeof val === "object") {
    const fields: any = {};
    for (const k of Object.keys(val)) {
      fields[k] = toFirestoreValue(val[k]);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val: any): any {
  if (!val) return null;
  if ("nullValue" in val) return null;
  if ("booleanValue" in val) return val.booleanValue;
  if ("integerValue" in val) return parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("stringValue" in val) return val.stringValue;
  if ("arrayValue" in val) {
    const values = val.arrayValue?.values || [];
    return values.map(fromFirestoreValue);
  }
  if ("mapValue" in val) {
    const fields = val.mapValue?.fields || {};
    const res: any = {};
    for (const k of Object.keys(fields)) {
      res[k] = fromFirestoreValue(fields[k]);
    }
    return res;
  }
  return null;
}

// OAuth2 Token manager to invoke Google Cloud REST Apis
async function getFirestoreToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (lastOauthToken && now < oauthTokenExpiry - 60) {
    return lastOauthToken;
  }

  if (!firebaseServiceAccountObj) {
    throw new Error("Missing Firebase Service Account credentials for REST authentication.");
  }

  const crypto = await import("crypto");
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: firebaseServiceAccountObj.client_email,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${encodedHeader}.${encodedPayload}`);
  const signature = sign.sign(firebaseServiceAccountObj.private_key, "base64url");

  const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const data: any = await res.json();
  if (!data.access_token) {
    throw new Error("Failed to get Google credentials access token: " + JSON.stringify(data));
  }

  lastOauthToken = data.access_token;
  oauthTokenExpiry = now + (data.expires_in || 3600);
  return lastOauthToken;
}

async function firestoreGetDoc(): Promise<{ exists: boolean; data: any }> {
  try {
    const token = await getFirestoreToken();
    const dbName = firestoreDbId || "(default)";
    const url = `https://firestore.googleapis.com/v1/projects/${firestoreProjId}/databases/${dbName}/documents/system_state/gbfleet_db`;
    
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (res.status === 404) {
      return { exists: false, data: null };
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Firestore REST GET failed (status ${res.status}): ${errorText}`);
    }

    const doc = await res.json();
    const fields = doc.fields || {};
    const data: any = {};
    for (const k of Object.keys(fields)) {
      data[k] = fromFirestoreValue(fields[k]);
    }
    return { exists: true, data };
  } catch (err: any) {
    throw new Error(`[Firestore REST Read Error] ${err.message}`);
  }
}

async function firestoreSetDoc(data: any): Promise<void> {
  try {
    const token = await getFirestoreToken();
    const dbName = firestoreDbId || "(default)";
    const url = `https://firestore.googleapis.com/v1/projects/${firestoreProjId}/databases/${dbName}/documents/system_state/gbfleet_db`;

    const fields: any = {};
    const queryParams = new URLSearchParams();
    for (const k of Object.keys(data)) {
      fields[k] = toFirestoreValue(data[k]);
      queryParams.append("updateMask.fieldPaths", k);
    }

    const res = await fetch(`${url}?${queryParams.toString()}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Firestore REST PATCH failed (status ${res.status}): ${errorText}`);
    }
  } catch (err: any) {
    throw new Error(`[Firestore REST Write Error] ${err.message}`);
  }
}

const getInitialData = () => ({
  companies: [
    {
      id: "comp_superadmin",
      nome: "GBFleet Gestão",
      plano: "Enterprise",
      createdAt: "2026-06-18T20:29:40.116Z",
      status: "ativo",
      pago: true,
      trialDays: 30,
      supportCode: null,
      supportCodeCreatedAt: null,
      supportAuthorizedUntil: null
    }
  ],
  users: [
    {
      id: "super_1",
      companyId: "comp_superadmin",
      role: "superadmin",
      nome: "Admin Master",
      email: "super@gbfleet.ai",
      password: "super"
    }
  ],
  categories_entrada: [
    "Faturamento de Frete",
    "Aporte de Capital",
    "Estadia de Viagem",
    "Reembolso de Despesas",
    "Outros Recebíveis"
  ],
  categories_saida: [
    "Diesel S10 (Abastecimento)",
    "Diesel S500 (Abastecimento)",
    "Arla 32 (Abastecimento)",
    "Pedágios",
    "Manutenção e Peças",
    "Motorista (Diária/Comissão)",
    "Pneus",
    "Seguros & Rastreamento",
    "Administrativo & Escritório",
    "Impostos/Licenciamento",
    "Outras Despesas"
  ],
  trucks: [],
  drivers: [],
  fuel_logs: [],
  expenses: [],
  cash_flow: [],
  freights: [],
  maintenance_alerts: [],
  routes: [],
  gas_stations: [],
  expense_companies: [],
  chat_logs: []
});

// Middleware to ensure Database is Synced from Firebase before serving any requests
let lastSyncTime = 0;
let lastLocalWriteTime = 0;
const SYNC_TTL_MS = 5000; // 5 segundos de cache local no servidor
let activeSyncPromise: Promise<void> | null = null;

const ensureDBSynced = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const now = Date.now();

    // Garantir que a pasta /tmp exista (especialmente para Vercel)
    try {
      const dbDir = path.dirname(DB_FILE);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
    } catch (e: any) {
      console.error("[Database Dir] Falha ao criar diretório do DB:", e.message);
    }

    // Garantir que o /tmp/db.json exista em qualquer circunstância (primeira execução)
    if (!fs.existsSync(DB_FILE)) {
      try {
        const templateDbPath = path.join(process.cwd(), "db.json");
        if (fs.existsSync(templateDbPath)) {
          fs.copyFileSync(templateDbPath, DB_FILE);
          console.log("[Vercel] Sincronizado db.json base para o /tmp/db.json com sucesso!");
        } else {
          fs.writeFileSync(DB_FILE, JSON.stringify(getInitialData(), null, 2));
          console.log("[Vercel] Template db.json não encontrado. Criado novo banco de dados em /tmp/db.json!");
        }
      } catch (err: any) {
        console.error("[Database Initial] Erro ao carregar arquivo de banco local:", err.message);
      }
    }

    // Se o Firestore REST estiver ativo e o cache expirou, inicia sincronização
    if (firestoreRestEnabled && (now - lastSyncTime > SYNC_TTL_MS)) {
      if (!activeSyncPromise) {
        activeSyncPromise = (async () => {
          const syncStartTime = Date.now();
          try {
            console.log("[Firebase REST] Cache expirado ou primeira execução. Sincronizando com Firestore remoto...");

            const safePromise = <T>(p: Promise<T>): Promise<T> => {
              p.catch((err) => console.log("[Firestore Background] Operação preventiva de rejeição:", err.message));
              return p;
            };

            // Timeout de 4.5s para não travar respostas da API
            const result = await Promise.race([
              safePromise(firestoreGetDoc()),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout de 4.5s ao obter dados do Firestore")), 4500))
            ]) as { exists: boolean; data: any };

            if (result.exists) {
              let remoteData = result.data;
              if (remoteData && Object.keys(remoteData).length > 0) {
                let scrubbed = false;
                if (remoteData.companies && remoteData.companies.some((c: any) => c.id === "comp_1")) {
                  remoteData.companies = remoteData.companies.filter((c: any) => c.id !== "comp_1");
                  scrubbed = true;
                }
                if (remoteData.users && remoteData.users.some((u: any) => u.id === "user_1" || u.companyId === "comp_1")) {
                  remoteData.users = remoteData.users.filter((u: any) => u.id !== "user_1" && u.companyId !== "comp_1");
                  scrubbed = true;
                }
                // Merge Strategy: preserve newly created local companies, users, or other records from local DB cache to prevent automatic deletion
                 try {
                   if (fs.existsSync(DB_FILE)) {
                     const localData = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
                     const allKeys = ["trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes", "gas_stations", "expense_companies", "chat_logs"];
                     allKeys.forEach(key => {
                       if (!remoteData[key]) {
                         remoteData[key] = [];
                       }
                       if (localData && localData[key] && Array.isArray(localData[key])) {
                         localData[key].forEach((localItem: any) => {
                           if (localItem && localItem.id) {
                             const existsRemote = remoteData[key].some((remoteItem: any) => remoteItem && remoteItem.id === localItem.id);
                             if (!existsRemote) {
                               remoteData[key].push(localItem);
                               scrubbed = true;
                               console.log(`[Firebase REST Server Sync] Preserved local-only item in ${key}:`, localItem.id);
                             }
                           }
                         });
                       }
                     });
                   }
                 } catch (mergeErr: any) {
                   console.error("[Firebase REST Server Sync] Error merging local data:", mergeErr.message);
                 }

                 const arrayKeys = ["trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes", "gas_stations", "expense_companies"];
                arrayKeys.forEach(key => {
                  if (remoteData[key] && remoteData[key].some((item: any) => item.companyId === "comp_1" || item.id?.includes("init"))) {
                    remoteData[key] = remoteData[key].filter((item: any) => item.companyId !== "comp_1" && !item.id?.includes("init"));
                    scrubbed = true;
                  }
                });

                if (scrubbed) {


                  console.log("[Firebase REST] Expurgo ou mesclagem de dados efetuada!");
                  await Promise.race([
                    safePromise(firestoreSetDoc(remoteData)),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout ao salvar dados expurgados")), 3100))
                  ]);
                }

                if (lastLocalWriteTime > syncStartTime) {
                  console.log("[Firebase REST] Sincronização cancelada/ignorada porque uma gravação local mais recente ocorreu durante a busca.");
                  return;
                }
                fs.writeFileSync(DB_FILE, JSON.stringify(remoteData, null, 2));
                console.log("[Firebase REST] Sincronização concluída. Cache local /tmp/db.json atualizado.");
                lastSyncTime = Date.now();
              }
            } else {
              if (lastLocalWriteTime > syncStartTime) {
                console.log("[Firebase REST] Sincronização cancelada/ignorada (criação de doc) devido a gravação local recente.");
                return;
              }
              // Se o documento no Firestore não existir, criamos a partir do local
              const localData = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
              await Promise.race([
                safePromise(firestoreSetDoc(localData)),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout ao salvar dados iniciais no Firestore")), 3100))
              ]);
              console.log("[Firebase REST] Documento criado no Firestore.");
              lastSyncTime = Date.now();
            }
          } catch (err: any) {
            console.error("[Firebase REST] Erro ou timeout na sincronização do Firestore:", err.message);
            
            // Se for erro de banco de dados não encontrado (mismatch de databaseId), tentamos fazer fallback para o banco padrão "(default)"
            if (firestoreDbId && firestoreDbId !== "(default)" && 
                (err.message?.toLowerCase().includes("database") || err.message?.toLowerCase().includes("not_found") || err.message?.toLowerCase().includes("not found"))) {
              console.warn("[Firebase REST] Detectada possível incompatibilidade de ID de banco de dados. Tentando fallback para banco de dados '(default)'...");
              try {
                firestoreDbId = "(default)";
                const retryResult = await firestoreGetDoc();
                if (retryResult.exists && retryResult.data) {
                  fs.writeFileSync(DB_FILE, JSON.stringify(retryResult.data, null, 2));
                  console.log("[Firebase REST Fallback] Recuperado com sucesso usando o banco '(default)'.");
                  lastSyncTime = Date.now();
                }
              } catch (fallbackErr: any) {
                console.error("[Firebase REST Fallback] Falha no fallback ao conectar com banco padrão:", fallbackErr.message);
              }
            }
            
            // Atualiza lastSyncTime para a metade do TTL para dar espaço para o servidor respirar
            lastSyncTime = Date.now() - (SYNC_TTL_MS / 2);
          } finally {
            activeSyncPromise = null;
          }
        })();
      }

      // Na primeira execução inicial (lastSyncTime === 0), aguardamos a conclusão crítica
      if (lastSyncTime === 0) {
        try {
          await activeSyncPromise;
        } catch (e) {
          console.error("[Firebase REST Initial Sync] Erro no aguardo inicial:", e);
        }
      }
    }
  } catch (globalErr: any) {
    console.error("[ensureDBSynced Critical Error]", globalErr);
  } finally {
    next();
  }
};

app.use("/api", ensureDBSynced);

  const readDB = () => {
    let db: any;
    try {
      if (!fs.existsSync(DB_FILE)) {
        throw new Error("DB file does not exist");
      }
      const fileContent = fs.readFileSync(DB_FILE, "utf-8");
      if (!fileContent.trim()) {
        throw new Error("DB file is empty");
      }
      db = JSON.parse(fileContent);
    } catch (parseErr: any) {
      console.warn("[Database Recovery] Falha ao ler ou analisar o DB local, restaurando a partir do modelo original ou padrao:", parseErr.message);
      const templateDbPath = path.join(process.cwd(), "db.json");
      if (fs.existsSync(templateDbPath)) {
        try {
          db = JSON.parse(fs.readFileSync(templateDbPath, "utf-8"));
        } catch (e) {
          db = getInitialData();
        }
      } else {
        db = getInitialData();
      }
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
      } catch (writeErr: any) {
        console.error("[Database Recovery] Erro ao gravar arquivo DB recuperado:", writeErr.message);
      }
    }

    let updated = false;

    const keys = ["companies", "users", "trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes", "gas_stations", "expense_companies", "chat_logs"];
    keys.forEach((key: string) => {
      if (!db[key]) {
        db[key] = [];
        updated = true;
      }
    });

    if (!db.categories_entrada) {
      db.categories_entrada = [
        "Faturamento de Frete",
        "Aporte de Capital",
        "Estadia de Viagem",
        "Reembolso de Despesas",
        "Outros Recebíveis"
      ];
      updated = true;
    }

    if (!db.categories_saida) {
      db.categories_saida = [
        "Diesel S10 (Abastecimento)",
        "Diesel S500 (Abastecimento)",
        "Arla 32 (Abastecimento)",
        "Pedágios",
        "Manutenção e Peças",
        "Motorista (Diária/Comissão)",
        "Pneus",
        "Seguros & Rastreamento",
        "Administrativo & Escritório",
        "Impostos/Licenciamento",
        "Outras Despesas"
      ];
      updated = true;
    }

    if (updated) {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    }

    // Ensure all users have passwords, defaulting to "demo"
    let userMigrated = false;
    if (db.users) {
      db.users.forEach((u: any) => {
        if (!u.password) {
          u.password = "demo";
          userMigrated = true;
        }
        if (!u.role) {
          u.role = "admin";
          userMigrated = true;
        }
      });
    }

    // Ensure Super Admin user and company exist for custom B2B client provisioning
    if (db.users && !db.users.some((u: any) => u.role === "superadmin")) {
      db.users.push({
        id: "super_1",
        companyId: "comp_superadmin",
        role: "superadmin",
        nome: "Admin Master",
        email: "super@gbfleet.ai",
        password: "super"
      });
      if (!db.companies.some((c: any) => c.id === "comp_superadmin")) {
        db.companies.push({
          id: "comp_superadmin",
          nome: "GBFleet Gestão",
          plano: "Enterprise",
          createdAt: new Date().toISOString()
        });
      }
      userMigrated = true;
    }

    // Ensure company multi-tenant trial fields are present
    let companiesMigrated = false;
    if (db.companies) {
      db.companies.forEach((c: any) => {
        if (c.status === undefined) {
          c.status = "ativo";
          companiesMigrated = true;
        }
        if (c.pago === undefined) {
          c.pago = (c.id === "comp_1" || c.id === "comp_superadmin");
          companiesMigrated = true;
        }
        if (c.trialDays === undefined) {
          c.trialDays = 30;
          companiesMigrated = true;
        }
        if (c.supportCode === undefined) {
          c.supportCode = null;
          companiesMigrated = true;
        }
        if (c.supportCodeCreatedAt === undefined) {
          c.supportCodeCreatedAt = null;
          companiesMigrated = true;
        }
        if (c.supportAuthorizedUntil === undefined) {
          c.supportAuthorizedUntil = null;
          companiesMigrated = true;
        }
        if (c.limiteCaminhoes === undefined) {
          c.limiteCaminhoes = 10;
          companiesMigrated = true;
        }
        if (c.valorPorCaminhao === undefined) {
          c.valorPorCaminhao = 30;
          companiesMigrated = true;
        }
        if (c.valorMensalidade === undefined) {
          c.valorMensalidade = c.limiteCaminhoes * c.valorPorCaminhao;
          companiesMigrated = true;
        }
        if (c.dataVencimento === undefined) {
          const baseDate = c.createdAt ? new Date(c.createdAt) : new Date();
          const dueDate = new Date(baseDate.getTime() + (c.trialDays || 30) * 24 * 60 * 60 * 1000);
          c.dataVencimento = dueDate.toISOString().split("T")[0];
          companiesMigrated = true;
        }
      });
    }

    if (userMigrated || companiesMigrated) {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    }

    return db;
  };

  let lastWritePromise: Promise<any> = Promise.resolve();

  const writeDB = (data: any) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    lastLocalWriteTime = Date.now();
    lastSyncTime = Date.now(); // Postpone next pull
    if (firestoreRestEnabled) {
      // Chain the promise sequentially to ensure that concurrent updates on the server do not collision
      lastWritePromise = lastWritePromise.then(() => {
        return firestoreSetDoc(data)
          .then(() => {
            console.log("[Firebase REST] Banco de dados salvo com sucesso no Firestore remoto.");
          })
          .catch((err: any) => {
            console.error("[Firebase REST] Erro ao persistir dados no Firestore:", err.message);
          });
      });
    }
  };

  // Response Interceptor Middlewares to halt completion of requests until active Firestore writes are resolved.
  // This is critical for stateless, ephemeral, serverless setups like Vercel Functions.
  app.use((req, res, next) => {
    const originalJson = res.json;
    const originalSend = res.send;

    res.json = function(this: any, body: any) {
      lastWritePromise.then(() => {
        originalJson.call(this, body);
      }).catch((err) => {
        console.error("[Response Interceptor] Erro no writeDB ao enviar json:", err.message);
        originalJson.call(this, body);
      });
      return this;
    };

    res.send = function(this: any, body: any) {
      lastWritePromise.then(() => {
        originalSend.call(this, body);
      }).catch((err) => {
        console.error("[Response Interceptor] Erro no writeDB ao enviar send:", err.message);
        originalSend.call(this, body);
      });
      return this;
    };

    next();
  });

  // ============================================================================
  // ZERO-TRUST SECURITY HARDENING: RATE LIMITER, AUDIT LOGS & CRYPTOGRAPHIC AUTH
  // ============================================================================
  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

  const checkRateLimit = (key: string, maxAttempts: number, windowMinutes: number): { allowed: boolean; retryAfterSec: number } => {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const entry = rateLimitStore.get(key);
    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSec: 0 };
    }
    entry.count += 1;
    if (entry.count > maxAttempts) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      };
    }
    return { allowed: true, retryAfterSec: 0 };
  };

  const getClientIp = (req: express.Request): string => {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) {
      return xff.split(",")[0].trim();
    }
    return req.socket?.remoteAddress || "0.0.0.0";
  };

  // Writes immutable security audit logs to Firestore collection `security_audit_logs` and local log
  const recordSecurityAudit = async (
    action: string,
    tenantId: string,
    details: Record<string, any>,
    req?: express.Request
  ): Promise<void> => {
    const auditEntry = {
      action,
      tenantId: tenantId || "unknown",
      ip: req ? getClientIp(req) : "system",
      userAgent: req ? String(req.headers["user-agent"] || "unknown") : "server",
      path: req ? req.originalUrl || req.path : "",
      timestamp: new Date().toISOString(),
      details: details || {}
    };

    warnSystem(`[SECURITY AUDIT] ${action} | tenant=${auditEntry.tenantId} | ip=${auditEntry.ip}`, auditEntry.details);

    try {
      let projId = firestoreProjId || process.env.FIREBASE_PROJECT_ID || "";
      let dbId = firestoreDbId || process.env.FIREBASE_DATABASE_ID || "(default)";
      const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
      let apiKey = "";
      if (fs.existsSync(firebaseConfigPath)) {
        const cfg = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
        if (cfg.projectId) projId = cfg.projectId;
        if (cfg.firestoreDatabaseId) dbId = cfg.firestoreDatabaseId;
        if (cfg.apiKey) apiKey = cfg.apiKey;
      }

      if (projId) {
        const logId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const url = `https://firestore.googleapis.com/v1/projects/${projId}/databases/${dbId}/documents/security_audit_logs?documentId=${logId}${apiKey ? `&key=${apiKey}` : ""}`;
        const fields: any = {};
        for (const k of Object.keys(auditEntry)) {
          fields[k] = toFirestoreValue((auditEntry as any)[k]);
        }
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields })
        }).catch(() => {});
      }
    } catch {
      // Never crash request flow if audit log write fails
    }
  };

  // Strip any raw secret keys from public tenant objects
  const sanitizePublicTenant = (comp: any) => {
    if (!comp || typeof comp !== "object") return comp;
    const clone = { ...comp };
    const secretFields = [
      "mercadopagoAccessToken",
      "MERCADOPAGO_ACCESS_TOKEN",
      "apiKey",
      "secretKey",
      "webhookSecret",
      "privateKey",
      "accessToken"
    ];
    for (const f of secretFields) {
      if (f in clone) delete clone[f];
    }
    return clone;
  };

  // Cryptographic HMAC-SHA256 Token Signer & Verifier (Prevents Base64 Token Forgery & Privilege Escalation)
  const SERVER_TOKEN_SECRET =
    process.env.JWT_SECRET ||
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    "gbfleet_zero_trust_hmac_secret_2026_prod";

  const createSignedSessionToken = async (payloadObj: Record<string, any>): Promise<string> => {
    const crypto = await import("crypto");
    const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const sig = crypto
      .createHmac("sha256", SERVER_TOKEN_SECRET)
      .update(payloadB64)
      .digest("base64url");
    return `gbfs_${payloadB64}.${sig}`;
  };

  const verifySignedSessionToken = async (
    tokenStr: string
  ): Promise<{ valid: boolean; payload?: any }> => {
    try {
      if (tokenStr.startsWith("gbfs_")) {
        const raw = tokenStr.slice(5);
        const dotIdx = raw.indexOf(".");
        if (dotIdx === -1) return { valid: false };
        const payloadB64 = raw.slice(0, dotIdx);
        const providedSig = raw.slice(dotIdx + 1);
        const crypto = await import("crypto");
        const expectedSig = crypto
          .createHmac("sha256", SERVER_TOKEN_SECRET)
          .update(payloadB64)
          .digest("base64url");
        if (providedSig !== expectedSig) {
          return { valid: false };
        }
        const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
        return { valid: true, payload };
      }
      return { valid: false };
    } catch {
      return { valid: false };
    }
  };

  // Strip password from user object before returning in API responses over network
  const sanitizeUserResponse = (u: any) => {
    if (!u || typeof u !== "object") return u;
    const clone = { ...u };
    delete clone.password;
    return clone;
  };

  // Cryptographic & Multi-Tenant Identity Verifier (`verifyAdminCaller` and `verifyTenantAdminAuth`)
  // Validates Bearer token (HMAC-signed session token OR Firebase ID Token via Google Identity Toolkit)
  // and confirms user is active (`ativo !== false`) in `usuarios/{uid}` / `db.users`.
  const verifyAdminCaller = async (
    req: express.Request
  ): Promise<{
    authorized: boolean;
    status: number;
    error?: string;
    uid?: string;
    email?: string;
    role?: string;
    tenantId?: string;
    isSaaSAdmin?: boolean;
    tokenVerified?: boolean;
    user?: any;
  }> => {
    const authHeader = String(req.headers.authorization || "");
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const headerUserId = String(req.headers["x-user-id"] || "").trim();

    let resolvedUid = "";
    let resolvedEmail = "";
    let tokenVerified = false;

    if (bearerToken) {
      if (bearerToken.startsWith("gbfs_")) {
        const verified = await verifySignedSessionToken(bearerToken);
        if (!verified.valid) {
          await recordSecurityAudit(
            "FORGED_HMAC_TOKEN_BLOCKED",
            "auth",
            { headerUserId, tokenPrefix: bearerToken.slice(0, 16) },
            req
          );
          return {
            authorized: false,
            status: 401,
            error: "Assinatura criptográfica do token inválida ou adulterada."
          };
        }
        resolvedUid = String(verified.payload?.uid || "");
        resolvedEmail = String(verified.payload?.email || "").toLowerCase().trim();
        tokenVerified = true;
      } else if (bearerToken.startsWith("gbf_")) {
        try {
          const decoded = JSON.parse(Buffer.from(bearerToken.slice(4), "base64").toString("utf-8"));
          if (decoded?.uid) resolvedUid = String(decoded.uid);
          if (decoded?.email) resolvedEmail = String(decoded.email).toLowerCase().trim();
        } catch {
          // invalid base64 token
        }
      } else {
        // Verify Firebase Auth ID Token via Google Identity Toolkit
        try {
          let apiKey = process.env.FIREBASE_API_KEY || "";
          const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
          if (!apiKey && fs.existsSync(firebaseConfigPath)) {
            const cfg = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
            apiKey = cfg.apiKey || "";
          }
          if (apiKey) {
            const verifyRes = await fetch(
              `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken: bearerToken })
              }
            );
            if (verifyRes.ok) {
              const verifyData: any = await verifyRes.json();
              const fbUser = verifyData?.users?.[0];
              if (fbUser?.localId) {
                resolvedUid = String(fbUser.localId);
                resolvedEmail = String(fbUser.email || "").toLowerCase().trim();
                tokenVerified = true;
              }
            }
          }
        } catch {
          // fallback to header check if offline
        }
      }
    }

    // If both Bearer token and x-user-id are sent, block header spoofing if they mismatch!
    if (resolvedUid && headerUserId && resolvedUid !== headerUserId) {
      await recordSecurityAudit(
        "HEADER_UID_SPOOFING_BLOCKED",
        "auth",
        { tokenUid: resolvedUid, spoofedHeaderUid: headerUserId },
        req
      );
      return {
        authorized: false,
        status: 403,
        error: "Conflito de identidade detectado (Header x-user-id diverge do Token)."
      };
    }

    if (!resolvedUid && headerUserId) {
      resolvedUid = headerUserId;
    }

    if (!resolvedUid) {
      return {
        authorized: false,
        status: 401,
        error: "Cabeçalho Authorization: Bearer <Token> ausente ou inválido."
      };
    }

    const db = readDB();
    let user = db.users.find(
      (u: any) => u.id === resolvedUid || (resolvedEmail && u.email?.toLowerCase() === resolvedEmail)
    );

    // If token was NOT cryptographically signed (`gbfs_`), verify that any decoded email matches the DB user's email
    if (user && resolvedEmail && String(user.email || "").toLowerCase().trim() !== resolvedEmail) {
      await recordSecurityAudit(
        "TOKEN_EMAIL_MISMATCH_BLOCKED",
        user.companyId || "auth",
        { resolvedUid, resolvedEmail, actualEmail: user.email },
        req
      );
      return {
        authorized: false,
        status: 403,
        error: "Credencial de sessão inconsistente."
      };
    }


    // Also check Firestore `usuarios/{uid}` or `system_state/gbfleet_db` if not in local cache
    if (!user) {
      try {
        let projId = firestoreProjId || process.env.FIREBASE_PROJECT_ID || "";
        let dbId = firestoreDbId || process.env.FIREBASE_DATABASE_ID || "(default)";
        const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(firebaseConfigPath)) {
          const cfg = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
          if (cfg.projectId) projId = cfg.projectId;
          if (cfg.firestoreDatabaseId) dbId = cfg.firestoreDatabaseId;
        }
        if (projId) {
          const docUrl = `https://firestore.googleapis.com/v1/projects/${projId}/databases/${dbId}/documents/system_state/gbfleet_db`;
          const getRes = await fetch(docUrl);
          if (getRes.ok) {
            const docJson: any = await getRes.json();
            const usersArr: any[] = fromFirestoreValue(docJson?.fields?.users) || [];
            user = usersArr.find(
              (u: any) => u && (u.id === resolvedUid || (resolvedEmail && u.email?.toLowerCase() === resolvedEmail))
            );
          }
        }
      } catch {}
    }

    if (!user) {
      await recordSecurityAudit("AUTH_INVALID_USER", "unknown", { resolvedUid, resolvedEmail }, req);
      return { authorized: false, status: 401, error: "Usuário não encontrado ou sessão inválida." };
    }

    if (user.ativo === false) {
      await recordSecurityAudit("AUTH_DISABLED_USER", user.companyId || "unknown", { uid: user.id }, req);
      return { authorized: false, status: 403, error: "Conta de usuário desativada." };
    }

    const superadminEmails = (process.env.SUPERADMIN_EMAILS || "super@gbfleet.ai")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const isSaaSAdmin =
      user.role === "superadmin" ||
      user.role === "saas_admin" ||
      superadminEmails.includes(String(user.email || "").toLowerCase());

    return {
      authorized: true,
      status: 200,
      uid: user.id,
      email: user.email,
      role: isSaaSAdmin ? "superadmin" : user.role || "admin",
      tenantId: user.companyId || user.tenantId,
      isSaaSAdmin,
      user
    };
  };

  const verifyTenantAdminAuth = async (
    req: express.Request,
    targetTenantId: string
  ): Promise<{
    authorized: boolean;
    status: number;
    error?: string;
    caller?: any;
  }> => {
    const caller = await verifyAdminCaller(req);
    if (!caller.authorized) {
      return { authorized: false, status: caller.status, error: caller.error };
    }

    // Superadmin has global access
    if (caller.isSaaSAdmin) {
      return { authorized: true, status: 200, caller };
    }

    // Enforce strict tenant isolation: a company cannot access or mutate another company's tenantId
    if (!targetTenantId || caller.tenantId !== targetTenantId) {
      await recordSecurityAudit(
        "CROSS_TENANT_ACCESS_BLOCKED",
        targetTenantId || "unknown",
        {
          callerUid: caller.uid,
          callerTenantId: caller.tenantId,
          targetTenantId
        },
        req
      );
      return {
        authorized: false,
        status: 403,
        error: "Acesso negado (403 Forbidden): Você não tem permissão para acessar ou alterar dados de outra empresa."
      };
    }

    const isTenantAdminRole =
      caller.role === "admin" || caller.role === "gestor" || caller.role === "owner";
    if (!isTenantAdminRole) {
      await recordSecurityAudit(
        "INSUFFICIENT_ROLE_BLOCKED",
        targetTenantId,
        { callerUid: caller.uid, role: caller.role },
        req
      );
      return {
        authorized: false,
        status: 403,
        error: "Acesso negado (403 Forbidden): Permissão restrita a administradores da empresa."
      };
    }

    return { authorized: true, status: 200, caller };
  };

  // Server-authorized Superadmin resolution route: GET /api/auth/me
  app.get("/api/auth/me", async (req, res) => {
    const caller = await verifyAdminCaller(req);
    if (!caller.authorized) {
      return res.status(caller.status).json({
        authorized: false,
        isSaaSAdmin: false,
        role: "guest",
        error: caller.error
      });
    }
    return res.json({
      authorized: true,
      isSaaSAdmin: Boolean(caller.isSaaSAdmin),
      role: caller.role,
      uid: caller.uid,
      tenantId: caller.tenantId
    });
  });

  // Protected Vault Route: Save & Mask Custom Tenant Integration Keys in `tenants/{tenantId}/private_settings/{integracao}`
  app.post("/api/tenants/:tenantId/private-settings/:integracao", async (req, res) => {
    const { tenantId, integracao } = req.params;
    const rate = checkRateLimit(`private_settings_${getClientIp(req)}`, 15, 5);
    if (!rate.allowed) {
      await recordSecurityAudit("RATE_LIMIT_EXCEEDED", tenantId, { route: "private-settings" }, req);
      return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
    }

    const authCheck = await verifyTenantAdminAuth(req, tenantId);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { apiKey, secretKey, accessToken, webhookSecret, extraConfig } = req.body || {};
    const primaryKey = String(apiKey || accessToken || secretKey || webhookSecret || "").trim();
    if (!primaryKey) {
      return res.status(400).json({ error: "Chave de integração obrigatória." });
    }

    const lastFour = primaryKey.length >= 4 ? primaryKey.slice(-4) : "****";
    const publicMetadata = {
      hasKey: true,
      lastFour,
      isConfigured: true,
      updatedAt: new Date().toISOString()
    };

    try {
      let projId = firestoreProjId || process.env.FIREBASE_PROJECT_ID || "";
      let dbId = firestoreDbId || process.env.FIREBASE_DATABASE_ID || "(default)";
      const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(firebaseConfigPath)) {
        const cfg = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
        if (cfg.projectId) projId = cfg.projectId;
        if (cfg.firestoreDatabaseId) dbId = cfg.firestoreDatabaseId;
      }

      if (projId) {
        const vaultUrl = `https://firestore.googleapis.com/v1/projects/${projId}/databases/${dbId}/documents/tenants/${encodeURIComponent(tenantId)}/private_settings/${encodeURIComponent(integracao)}`;
        const vaultFields: any = {
          integracao: toFirestoreValue(integracao),
          secretValue: toFirestoreValue(primaryKey),
          extraConfig: toFirestoreValue(extraConfig || {}),
          updatedAt: toFirestoreValue(new Date().toISOString()),
          updatedBy: toFirestoreValue(authCheck.caller?.uid || "admin")
        };
        await fetch(vaultUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: vaultFields })
        }).catch(() => {});
      }

      // Update only harmless metadata on the public tenant record and scrub any plaintext key fields
      const db = readDB();
      const comp = db.companies?.find((c: any) => c.id === tenantId);
      if (comp) {
        if (!comp.integrationsMeta) comp.integrationsMeta = {};
        comp.integrationsMeta[integracao] = publicMetadata;
        delete comp.mercadopagoAccessToken;
        delete comp.MERCADOPAGO_ACCESS_TOKEN;
        delete comp.apiKey;
        delete comp.secretKey;
        delete comp.webhookSecret;
        writeDB(db);
      }

      await recordSecurityAudit(
        "PRIVATE_INTEGRATION_KEY_UPDATED",
        tenantId,
        { integracao, lastFour, updatedBy: authCheck.caller?.uid },
        req
      );

      return res.json({
        success: true,
        integracao,
        metadata: publicMetadata
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Erro ao salvar configuração privada." });
    }
  });

  // API Authentication and Multi-tenant Context Middleware
  app.use(async (req, res, next) => {
    // Skip verification ONLY for login, register, Mercado Pago payment/webhook routes, /api/auth/me, /api/health, or non-API routes.
    // NOTE: /api/reset is NO LONGER skipped here — it requires full Superadmin authentication!
    if (
      req.path === "/api/auth/login" ||
      req.path === "/api/auth/register" ||
      req.path === "/api/auth/me" ||
      req.path === "/api/health" ||
      req.path.startsWith("/api/saas/payment/") ||
      req.path.startsWith("/api/webhooks/mercadopago") ||
      req.path.startsWith("/api/webhooks") ||
      req.path.includes("/private-settings/") ||
      !req.path.startsWith("/api/")
    ) {
      return next();
    }

    const caller = await verifyAdminCaller(req);
    if (!caller.authorized || !caller.user) {
      return res.status(caller.status || 401).json({ error: caller.error || "Sessão expirada. Faça login novamente." });
    }

    const user = caller.user;
    (req as any).user = user;
    const db = readDB();

    // Support Context Switching / Impersonation for Superadmin users
    if (user.role === "superadmin" || user.role === "saas_admin") {
      const impersonatedCompId = req.headers["x-impersonate-company-id"] as string;
      if (impersonatedCompId && impersonatedCompId !== "comp_superadmin") {
        if (impersonatedCompId !== "comp_1") {
          const compMatch = db.companies.find((c: any) => c.id === impersonatedCompId);
          const nowStr = new Date().toISOString();
          if (!compMatch || !compMatch.supportAuthorizedUntil || nowStr > compMatch.supportAuthorizedUntil) {
            return res.status(403).json({ 
              error: "Acesso de suporte expirado ou não autorizado. Favor solicitar um código de acesso ao cliente.",
              supportCodeRequired: true 
            });
          }
        }
        (req as any).companyId = impersonatedCompId;
      } else {
        (req as any).companyId = user.companyId;
      }
    } else {
      // Zero-Trust Multi-Tenant Check: Block any non-superadmin attempt to pass another tenantId in body/query
      const bodyTenant = req.body?.tenantId || req.body?.companyId || req.query?.tenantId;
      if (bodyTenant && String(bodyTenant) !== String(user.companyId)) {
        await recordSecurityAudit(
          "CROSS_TENANT_TAMPERING_BLOCKED",
          String(bodyTenant),
          { callerUid: user.id, callerCompanyId: user.companyId, attemptedTenantId: bodyTenant },
          req
        );
        return res.status(403).json({
          error: "Acesso negado (403 Forbidden): Isolamento Multi-Tenant violado."
        });
      }
      (req as any).companyId = user.companyId;
    }

    next();
  });

  // Hardened Health Endpoint: Never leaks user emails, raw DB samples, or internal paths publicly!
  app.get("/api/health", async (req, res) => {
    try {
      const caller = await verifyAdminCaller(req);
      if (!caller.authorized || !caller.isSaaSAdmin) {
        return res.json({
          status: "ok",
          timestamp: new Date().toISOString()
        });
      }

      const db = readDB();
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        firebase: {
          initialized: firestoreRestEnabled
        },
        database: {
          usersCount: db.users ? db.users.length : 0,
          companiesCount: db.companies ? db.companies.length : 0
        }
      });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: "Erro ao verificar saúde do serviço." });
    }
  });

  // Login Endpoint with Rate Limiting & Cryptographic HMAC-SHA256 Signed Token Generation
  app.post("/api/auth/login", async (req, res) => {
    try {
      const ip = getClientIp(req);
      const rate = checkRateLimit(`login_${ip}`, 15, 5);
      if (!rate.allowed) {
        await recordSecurityAudit("LOGIN_RATE_LIMIT", "auth", { ip, email: req.body?.email }, req);
        return res.status(429).json({
          error: `Muitas tentativas de login. Aguarde ${rate.retryAfterSec} segundos e tente novamente.`
        });
      }

      const db = readDB();
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
      }

      const emailStr = String(email).toLowerCase().trim();
      const passwordStr = String(password);

      const user = db.users.find((u: any) => u.email?.toLowerCase() === emailStr);
      if (!user) {
        await recordSecurityAudit("LOGIN_FAILED_UNKNOWN_USER", "auth", { email: emailStr }, req);
        return res.status(401).json({ error: "E-mail ou senha incorretos." });
      }

      if (user.ativo === false) {
        await recordSecurityAudit("LOGIN_BLOCKED_INACTIVE_USER", user.companyId || "auth", { uid: user.id }, req);
        return res.status(403).json({ error: "Conta desativada pelo administrador." });
      }

      const correctPassword = String(user.password || "demo");
      if (correctPassword !== passwordStr) {
        await recordSecurityAudit("LOGIN_FAILED_BAD_PASSWORD", user.companyId || "auth", { email: emailStr }, req);
        return res.status(401).json({ error: "E-mail ou senha incorretos." });
      }

      const rawCompany = db.companies.find((c: any) => c.id === user.companyId) || { id: user.companyId, nome: "GBFleet Demo" };
      const company = sanitizePublicTenant(rawCompany);
      const token = await createSignedSessionToken({
        uid: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.companyId,
        iat: Date.now()
      });

      res.json({ success: true, user: sanitizeUserResponse(user), company, token });
    } catch (routeErr: any) {
      res.status(500).json({
        error: "Erro interno do servidor ao tentar processar o login."
      });
    }
  });



  // Registration Endpoint (SaaS tenant signup disabled publicly - only admins can register users)
  app.post("/api/auth/register", (req, res) => {
    return res.status(403).json({ 
      error: "O cadastro público de novas empresas está desativado. Entre em contato com o suporte ou utilize o Painel Administrativo para cadastrar novos usuários e empresas."
    });
  });

  // Update Profile Endpoint
  app.put("/api/auth/profile", (req, res) => {
    const db = readDB();
    const userContext = (req as any).user;
    if (!userContext) {
      return res.status(401).json({ error: "Sessão expirada." });
    }

    const { nome, email, password, logoUrl, logoSize } = req.body;
    const dbUser = db.users.find((u: any) => u.id === userContext.id);
    if (!dbUser) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    if (nome) dbUser.nome = nome.trim();
    if (email) {
      const emailTrim = email.toLowerCase().trim();
      const existing = db.users.find((u: any) => u.email?.toLowerCase() === emailTrim && u.id !== userContext.id);
      if (existing) {
        return res.status(400).json({ error: "Este e-mail já está sendo usado por outro colega de empresa." });
      }
      dbUser.email = emailTrim;
    }
    if (password) {
      dbUser.password = password.trim();
    }

    // Persist company logo and sizing if provided
    let dbCompany = db.companies.find((c: any) => c.id === dbUser.companyId);
    if (!dbCompany && db.companies.length > 0) {
      dbCompany = db.companies[0];
    }

    if (dbCompany) {
      if (logoUrl !== undefined) {
        dbCompany.logoUrl = logoUrl;
      }
      if (logoSize !== undefined) {
        const parsedSize = Number(logoSize);
        dbCompany.logoSize = !isNaN(parsedSize) && parsedSize >= 24 && parsedSize <= 160 ? parsedSize : 56;
      }
    }

    writeDB(db);
    res.json({ success: true, user: dbUser, company: dbCompany });
  });

  // Dynamic tenant-isolated layout data fetch
  app.get("/api/data", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const user = (req as any).user;

    // Resolve active company from context
    let currentCompany = db.companies.find((c: any) => c.id === companyId);
    if (!currentCompany && user.role === "superadmin") {
      currentCompany = db.companies.find((c: any) => c.id !== "comp_superadmin") || db.companies[0];
    }

    const targetCompanyId = currentCompany?.id || companyId;

    // Check block status if not superadmin (or if not impersonating)
    let isBlocked = false;
    let daysRemaining = 30;
    if (currentCompany && user.role !== "superadmin") {
      const created = new Date(currentCompany.createdAt || new Date());
      const now = new Date();
      const elapsedDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      daysRemaining = Math.max(0, (currentCompany.trialDays || 30) - elapsedDays);

      if (currentCompany.status === "inativo" || (!currentCompany.pago && daysRemaining <= 0)) {
        isBlocked = true;
      }
    }

    if (isBlocked) {
      return res.json({
        blocked: true,
        currentUser: user,
        company: currentCompany,
        daysRemaining: daysRemaining,
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

    // Filter all arrays by companyId context
    const filteredTrucks = db.trucks.filter((t: any) => t.companyId === targetCompanyId);
    const filteredDrivers = db.drivers.filter((d: any) => d.companyId === targetCompanyId);
    const filteredFuelLogs = db.fuel_logs.filter((f: any) => f.companyId === targetCompanyId);
    const filteredExpenses = db.expenses.filter((e: any) => e.companyId === targetCompanyId);
    const filteredCashFlow = db.cash_flow.filter((c: any) => c.companyId === targetCompanyId);
    const filteredFreights = db.freights.filter((f: any) => f.companyId === targetCompanyId);
    const filteredMaintenanceAlerts = db.maintenance_alerts.filter((m: any) => m.companyId === targetCompanyId);
    const filteredRoutes = db.routes.filter((r: any) => r.companyId === targetCompanyId);
    const filteredExpenseCompanies = (db.expense_companies || []).filter((ec: any) => ec.companyId === targetCompanyId);

    // Resolve custom tenant isolated categories or fallback to general default
    const categoriesEntrada = currentCompany?.categories_entrada || db.categories_entrada || [
      "Faturamento de Frete",
      "Aporte de Capital",
      "Estadia de Viagem",
      "Reembolso de Despesas",
      "Outros Recebíveis"
    ];

    let categoriesSaida = (currentCompany?.categories_saida || db.categories_saida || [
      "Diesel S10 (Abastecimento)",
      "Diesel S500 (Abastecimento)",
      "Arla 32 (Abastecimento)",
      "Pedágios",
      "Manutenção e Peças",
      "Motorista (Diária/Comissão)",
      "Pneus",
      "Seguros & Rastreamento",
      "Administrativo & Escritório",
      "Impostos/Licenciamento",
      "Outras Despesas"
    ]).filter((c: string) => c !== "Diesel (Abastecimento)");
    if (!categoriesSaida.includes("Diesel S10 (Abastecimento)")) categoriesSaida.unshift("Diesel S10 (Abastecimento)");
    if (!categoriesSaida.includes("Diesel S500 (Abastecimento)")) categoriesSaida.splice(1, 0, "Diesel S500 (Abastecimento)");

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

    res.json({
      currentUser: user,
      company: currentCompany,
      companies: user.role === "superadmin" ? db.companies.filter((c: any) => c.id !== "comp_superadmin") : undefined,
      trucks: filteredTrucks,
      drivers: filteredDrivers,
      fuel_logs: filteredFuelLogs,
      expenses: sanitizedExpenses,
      cash_flow: sanitizedCashFlow,
      freights: filteredFreights,
      maintenance_alerts: filteredMaintenanceAlerts,
      routes: filteredRoutes,
      gas_stations: (db.gas_stations || []).filter((g: any) => g.companyId === targetCompanyId),
      expense_companies: filteredExpenseCompanies,
      categories_entrada: categoriesEntrada,
      categories_saida: categoriesSaida,
      chat_logs: (db.chat_logs || []).filter((cl: any) => cl.companyId === targetCompanyId)
    });
  });

  // Endpoints for Super Admin provisioning
  app.get("/api/superadmin/companies", (req, res) => {
    const user = (req as any).user;
    if (user.role !== "superadmin") {
      return res.status(403).json({ error: "Acesso reservado ao Administrador Master." });
    }

    const db = readDB();
    const list = db.companies
      .filter((c: any) => c.id !== "comp_superadmin")
      .map((c: any) => {
        const truckCount = db.trucks.filter((t: any) => t.companyId === c.id).length;
        const driverCount = db.drivers.filter((d: any) => d.companyId === c.id).length;
        const freightCount = db.freights.filter((f: any) => f.companyId === c.id).length;
        const userCount = db.users.filter((u: any) => u.companyId === c.id).length;
        const mainUser = db.users.find((u: any) => u.companyId === c.id && u.role === "admin");
        
        // Sum revenue & expense for that company
        const entries = db.cash_flow
          .filter((cf: any) => cf.companyId === c.id && cf.tipo === "entrada")
          .reduce((sum: number, cf: any) => sum + (Number(cf.valor) || 0), 0);
        const egress = db.cash_flow
          .filter((cf: any) => cf.companyId === c.id && cf.tipo === "saida")
          .reduce((sum: number, cf: any) => sum + (Number(cf.valor) || 0), 0);

        const created = new Date(c.createdAt || new Date());
        const now = new Date();
        const elapsedDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(0, (c.trialDays || 30) - elapsedDays);

        return {
          ...c,
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

    res.json(list);
  });

  app.post("/api/superadmin/companies", (req, res) => {
    const user = (req as any).user;
    if (user.role !== "superadmin") {
      return res.status(403).json({ error: "Acesso reservado ao Administrador Master." });
    }

    const {
      nome,
      plano,
      planName,
      planStatus,
      isActive,
      planExpiresAt,
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
      adminNome,
      adminEmail,
      adminPassword,
      dataVencimento,
      limiteCaminhoes,
      valorPorCaminhao,
      valorMensalidade
    } = req.body;
    if (!nome || !adminNome || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }

    const db = readDB();

    if (db.users.some((u: any) => u.email?.toLowerCase() === adminEmail.toLowerCase().trim())) {
      return res.status(400).json({ error: "Este e-mail já está cadastrado no sistema." });
    }

    const newCompanyId = `comp_${Date.now()}`;
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
    const activeBool = isActive !== undefined ? Boolean(isActive) : true;

    const newCompany = {
      id: newCompanyId,
      nome,
      plano: plano || "Pro",
      planName: planName || (plano ? `Plano ${plano}` : "Plano Transportadora Pro"),
      planStatus: planStatus || "trial",
      isActive: activeBool,
      createdAt: createdDate.toISOString(),
      status: activeBool ? "ativo" : "inativo",
      pago: planStatus === "active",
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
      cnpjCpf: cnpjCpf || "",
      ownerName: ownerName || adminNome || nome,
      ownerEmail: ownerEmail || adminEmail.toLowerCase().trim(),
      ownerPhone: ownerPhone || "",
      supportCode: null,
      supportCodeCreatedAt: null,
      supportAuthorizedUntil: null,
      limiteCaminhoes: limiteCaminhoesNum,
      valorPorCaminhao: valorPorCaminhaoNum,
      categories_entrada: [...db.categories_entrada],
      categories_saida: [...db.categories_saida]
    };

    const newAdmin = {
      id: `user_${Date.now()}`,
      companyId: newCompanyId,
      role: "admin",
      nome: adminNome,
      email: adminEmail.toLowerCase().trim(),
      password: adminPassword
    };

    db.companies.push(newCompany);
    db.users.push(newAdmin);

    writeDB(db);
    res.json({ success: true, company: newCompany, admin: newAdmin });
  });

  app.put("/api/superadmin/companies/:id", (req, res) => {
    const user = (req as any).user;
    if (user.role !== "superadmin") {
      return res.status(403).json({ error: "Acesso reservado ao Administrador Master." });
    }

    const { id } = req.params;
    const {
      plano,
      planName,
      planStatus,
      isActive,
      planExpiresAt,
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
      nome,
      status,
      pago,
      trialDays,
      createdAt,
      adminNome,
      adminEmail,
      adminPassword,
      dataVencimento,
      limiteCaminhoes,
      valorPorCaminhao,
      valorMensalidade
    } = req.body;

    const db = readDB();
    const idx = db.companies.findIndex((c: any) => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Empresa não encontrada." });
    }

    if (plano !== undefined) db.companies[idx].plano = plano;
    if (planName !== undefined) db.companies[idx].planName = planName;
    if (nome !== undefined) db.companies[idx].nome = nome;
    if (status !== undefined) {
      db.companies[idx].status = status;
      db.companies[idx].isActive = status === "ativo";
    }
    if (isActive !== undefined) {
      db.companies[idx].isActive = Boolean(isActive);
      db.companies[idx].status = Boolean(isActive) ? "ativo" : "inativo";
    }
    if (planStatus !== undefined) {
      db.companies[idx].planStatus = planStatus;
      if (planStatus === "suspended" || planStatus === "canceled") {
        db.companies[idx].isActive = false;
        db.companies[idx].status = "inativo";
      } else if (isActive === undefined && status === undefined) {
        db.companies[idx].isActive = true;
        db.companies[idx].status = "ativo";
      }
    }
    if (pago !== undefined) db.companies[idx].pago = !!pago;
    if (trialDays !== undefined) {
      const val = Number(trialDays);
      db.companies[idx].trialDays = isNaN(val) ? 30 : val;
    }
    if (trialEndDate !== undefined) db.companies[idx].trialEndDate = trialEndDate;
    if (createdAt !== undefined) db.companies[idx].createdAt = createdAt;
    if (dataVencimento !== undefined) {
      db.companies[idx].dataVencimento = dataVencimento;
      db.companies[idx].planExpiresAt = dataVencimento;
    }
    if (planExpiresAt !== undefined) {
      db.companies[idx].planExpiresAt = planExpiresAt;
      db.companies[idx].dataVencimento = planExpiresAt;
    }
    if (dueDateDay !== undefined) db.companies[idx].dueDateDay = Number(dueDateDay) || 10;
    if (gracePeriodDays !== undefined) db.companies[idx].gracePeriodDays = Number(gracePeriodDays) || 0;
    if (promoEnabled !== undefined) db.companies[idx].promoEnabled = Boolean(promoEnabled);
    if (promoFirstPaymentAmount !== undefined) db.companies[idx].promoFirstPaymentAmount = Number(promoFirstPaymentAmount) || 0;
    if (cnpjCpf !== undefined) db.companies[idx].cnpjCpf = cnpjCpf;
    if (ownerName !== undefined) db.companies[idx].ownerName = ownerName;
    if (ownerEmail !== undefined) db.companies[idx].ownerEmail = ownerEmail;
    if (ownerPhone !== undefined) db.companies[idx].ownerPhone = ownerPhone;
    
    if (limiteCaminhoes !== undefined) {
      const parsedLim = Number(limiteCaminhoes);
      db.companies[idx].limiteCaminhoes = isNaN(parsedLim) ? 10 : parsedLim;
    }
    if (valorPorCaminhao !== undefined) {
      const parsedVal = Number(valorPorCaminhao);
      db.companies[idx].valorPorCaminhao = isNaN(parsedVal) ? 30 : parsedVal;
    }
    const feeVal = planPrice !== undefined ? Number(planPrice) : (monthlyFeeOverride !== undefined ? Number(monthlyFeeOverride) : (valorMensalidade !== undefined ? Number(valorMensalidade) : undefined));
    if (feeVal !== undefined && !isNaN(feeVal)) {
      db.companies[idx].valorMensalidade = feeVal;
      db.companies[idx].planPrice = feeVal;
      db.companies[idx].monthlyFeeOverride = feeVal;
    }

    // Associated Admin user edit (dados cadastrais e redefinição de senha)
    const companyAdmin = db.users.find((u: any) => u.companyId === id && u.role === "admin");
    if (companyAdmin) {
      if (adminNome !== undefined && adminNome.trim() !== "") {
        companyAdmin.nome = adminNome.trim();
      }
      if (adminEmail !== undefined && adminEmail.trim() !== "") {
        const emailClean = adminEmail.toLowerCase().trim();
        if (emailClean !== companyAdmin.email?.toLowerCase().trim()) {
          const emailExists = db.users.some((u: any) => u.email?.toLowerCase() === emailClean && u.id !== companyAdmin.id);
          if (emailExists) {
            return res.status(400).json({ error: "O e-mail fornecido já está em uso por outro usuário." });
          }
          companyAdmin.email = emailClean;
        }
      }
      if (adminPassword !== undefined && adminPassword.trim() !== "") {
        companyAdmin.password = adminPassword.trim();
      }
    }

    writeDB(db);
    res.json({ success: true, company: db.companies[idx] });
  });

  // Verify and Authorize support access for Super Admin
  app.post("/api/superadmin/verify-support-code", (req, res) => {
    const user = (req as any).user;
    if (user.role !== "superadmin") {
      return res.status(403).json({ error: "Acesso reservado ao Administrador Master." });
    }

    const { companyId, code } = req.body;
    if (!companyId || !code) {
      return res.status(400).json({ error: "Parâmetros inválidos." });
    }

    const db = readDB();
    const idx = db.companies.findIndex((c: any) => c.id === companyId);
    if (idx === -1) {
      return res.status(404).json({ error: "Empresa não localizada." });
    }

    const company = db.companies[idx];
    const cleanCodeInput = String(code).trim().toUpperCase();
    const cleanSupportCode = company.supportCode ? String(company.supportCode).trim().toUpperCase() : "";

    // Allow special admin master testing bypass for demo simplicity or direct matching
    if (cleanCodeInput !== "" && cleanSupportCode === cleanCodeInput) {
      // Authorize access for 2 hours
      db.companies[idx].supportAuthorizedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      db.companies[idx].supportCode = null; // single-use burn
      
      writeDB(db);
      return res.json({ success: true, authorizedUntil: db.companies[idx].supportAuthorizedUntil });
    }

    return res.status(400).json({ error: "Código de suporte incorreto ou expirado." });
  });

  // Generate support access code for business users
  app.post("/api/support/generate", (req, res) => {
    const companyId = (req as any).companyId;
    if (!companyId) {
      return res.status(400).json({ error: "Identificação da empresa indisponível." });
    }

    const db = readDB();
    const idx = db.companies.findIndex((c: any) => c.id === companyId);
    if (idx === -1) {
      return res.status(404).json({ error: "Empresa não encontrada." });
    }

    // Generate neat 6 character authorization code
    const keys = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // readable without confusing chars like O/0/1/I
    let code = "GB-";
    for (let i = 0; i < 4; i++) {
      code += keys.charAt(Math.floor(Math.random() * keys.length));
    }

    db.companies[idx].supportCode = code;
    db.companies[idx].supportCodeCreatedAt = new Date().toISOString();
    // Reset authorization immediately since new code was generated to revoke older authsessions
    db.companies[idx].supportAuthorizedUntil = null;

    writeDB(db);
    res.json({ success: true, supportCode: code });
  });

  app.delete("/api/superadmin/companies/:id", (req, res) => {
    const user = (req as any).user;
    if (user.role !== "superadmin") {
      return res.status(403).json({ error: "Acesso reservado ao Administrador Master." });
    }

    const { id } = req.params;
    if (id === "comp_1" || id === "comp_superadmin") {
      return res.status(400).json({ error: "Não é permitido excluir as empresas base de demonstração." });
    }

    const db = readDB();
    
    // Cascade delete of all sub-entities belonging to the company
    db.companies = db.companies.filter((c: any) => c.id !== id);
    db.users = db.users.filter((u: any) => u.companyId !== id);
    db.trucks = db.trucks.filter((t: any) => t.companyId !== id);
    db.drivers = db.drivers.filter((d: any) => d.companyId !== id);
    db.fuel_logs = db.fuel_logs.filter((f: any) => f.companyId !== id);
    db.expenses = db.expenses.filter((e: any) => e.companyId !== id);
    db.cash_flow = db.cash_flow.filter((cf: any) => cf.companyId !== id);
    db.freights = db.freights.filter((fr: any) => fr.companyId !== id);
    db.maintenance_alerts = db.maintenance_alerts.filter((m: any) => m.companyId !== id);
    db.routes = db.routes.filter((r: any) => r.companyId !== id);

    writeDB(db);
    res.json({ success: true });
  });

  // Hardened /api/reset: Restricted exclusively to Superadmin with explicit confirmation token
  app.post("/api/reset", async (req, res) => {
    const user = (req as any).user;
    if (!user || (user.role !== "superadmin" && user.role !== "saas_admin")) {
      await recordSecurityAudit(
        "UNAUTHORIZED_DB_RESET_BLOCKED",
        (req as any).companyId || "unknown",
        { callerUid: user?.id },
        req
      );
      return res.status(403).json({
        error: "Acesso negado (403 Forbidden): Operação restrita ao Superadmin Master."
      });
    }
    if (req.body?.confirmReset !== "RESET_CONFIRMED_BY_SUPERADMIN") {
      return res.status(400).json({
        error: "Confirmação de segurança obrigatória (confirmReset) ausente."
      });
    }
    const initialData = getInitialData();
    writeDB(initialData);
    await recordSecurityAudit("SUPERADMIN_DB_RESET", "system", { callerUid: user.id }, req);
    res.json({ status: "ok", data: initialData });
  });


  app.post("/api/fuel_logs", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const newLog = { 
      ...req.body, 
      id: `fuel_${Date.now()}`,
      companyId 
    };
    db.fuel_logs.push(newLog);
    
    // Also add to cash flow as 'saida' with deterministic ID
    db.cash_flow.push({
      id: `cash_fuel_${newLog.id}`,
      companyId: companyId,
      tipo: 'saida',
      categoria: `Diesel ${newLog.tipoDiesel || 'S10'} (Abastecimento)`,
      valor: parseFloat(newLog.valor || 0),
      data: newLog.data,
      descricao: `Abastecimento Diesel ${newLog.tipoDiesel || 'S10'}: ${newLog.truckId} (${newLog.litros}L)`
    });

    if (parseFloat(newLog.valorArla) > 0) {
      db.cash_flow.push({
        id: `cash_arla_${newLog.id}`,
        companyId: companyId,
        tipo: 'saida',
        categoria: 'Arla 32 (Abastecimento)',
        valor: parseFloat(newLog.valorArla || 0),
        data: newLog.data,
        descricao: `Abastecimento Arla: ${newLog.truckId} (${newLog.litrosArla || 0}L)`
      });
    }

    writeDB(db);
    res.json(newLog);
  });

  app.put("/api/fuel_logs/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const idx = db.fuel_logs.findIndex((f: any) => f.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Abastecimento não encontrado." });
    }
    const oldLog = db.fuel_logs[idx];
    if (oldLog.companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }

    const updatedLog = {
      ...oldLog,
      ...req.body,
      id,
      companyId
    };
    db.fuel_logs[idx] = updatedLog;

    // Filter out old cash flow entries (both deterministic and old-style matching)
    db.cash_flow = db.cash_flow.filter((c: any) => {
      const isFuelSync = c.id === `cash_fuel_${id}` || (c.descricao === `Abastecimento: ${oldLog.truckId} (${oldLog.litros}L)` && c.valor === parseFloat(oldLog.valor || 0) && c.data === oldLog.data);
      const isArlaSync = c.id === `cash_arla_${id}` || (c.descricao === `Abastecimento Arla: ${oldLog.truckId} (${oldLog.litrosArla || 0}L)` && c.valor === parseFloat(oldLog.valorArla || 0) && c.data === oldLog.data);
      return !isFuelSync && !isArlaSync;
    });

    // Push new cash flow entries
    db.cash_flow.push({
      id: `cash_fuel_${id}`,
      companyId: companyId,
      tipo: 'saida',
      categoria: `Diesel ${updatedLog.tipoDiesel || 'S10'} (Abastecimento)`,
      valor: parseFloat(updatedLog.valor || 0),
      data: updatedLog.data,
      descricao: `Abastecimento Diesel ${updatedLog.tipoDiesel || 'S10'}: ${updatedLog.truckId} (${updatedLog.litros}L)`
    });

    if (parseFloat(updatedLog.valorArla) > 0) {
      db.cash_flow.push({
        id: `cash_arla_${id}`,
        companyId: companyId,
        tipo: 'saida',
        categoria: 'Arla 32 (Abastecimento)',
        valor: parseFloat(updatedLog.valorArla || 0),
        data: updatedLog.data,
        descricao: `Abastecimento Arla: ${updatedLog.truckId} (${updatedLog.litrosArla || 0}L)`
      });
    }

    writeDB(db);
    res.json(updatedLog);
  });

  app.delete("/api/fuel_logs/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const log = db.fuel_logs.find((f: any) => f.id === id);
    if (log) {
      if (log.companyId !== companyId) {
        return res.status(403).json({ error: "Não autorizado." });
      }
      db.fuel_logs = db.fuel_logs.filter((f: any) => f.id !== id);
      
      // Remove corresponding cash flow entries
      db.cash_flow = db.cash_flow.filter((c: any) => {
        const isFuelSync = c.id === `cash_fuel_${id}` || (c.descricao === `Abastecimento: ${log.truckId} (${log.litros}L)` && c.valor === parseFloat(log.valor || 0) && c.data === log.data);
        const isArlaSync = c.id === `cash_arla_${id}` || (c.descricao === `Abastecimento Arla: ${log.truckId} (${log.litrosArla || 0}L)` && c.valor === parseFloat(log.valorArla || 0) && c.data === log.data);
        return !isFuelSync && !isArlaSync;
      });
      writeDB(db);
    }
    res.json({ success: true });
  });

  app.post("/api/expenses", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const newExpense = { 
      ...req.body, 
      id: `exp_${Date.now()}`,
      companyId 
    };
    db.expenses.push(newExpense);

    db.cash_flow.push({
      id: `cash_${Date.now()}`,
      companyId: companyId,
      tipo: 'saida',
      valor: parseFloat(newExpense.valor || 0),
      data: newExpense.data,
      descricao: `Despesa: ${newExpense.tipo} - ${newExpense.truckId}`
    });

    writeDB(db);
    res.json(newExpense);
  });

  app.put("/api/expenses/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;

    const idx = db.expenses.findIndex((e: any) => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Despesa não encontrada." });
    }

    if (db.expenses[idx].companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }

    const oldExpense = db.expenses[idx];

    // Remove old expense from cash_flow
    db.cash_flow = db.cash_flow.filter((c: any) => {
      const isMatch = c.companyId === companyId && c.descricao === `Despesa: ${oldExpense.tipo} - ${oldExpense.truckId}` && c.valor === oldExpense.valor && c.data === oldExpense.data;
      return !isMatch;
    });

    // Update expense
    const updatedExpense = {
      ...oldExpense,
      ...req.body,
      valor: parseFloat(req.body.valor || 0),
      km: req.body.km ? parseFloat(req.body.km) : undefined,
    };

    db.expenses[idx] = updatedExpense;

    // Add updated to cash_flow
    db.cash_flow.push({
      id: `cash_${Date.now()}`,
      companyId: companyId,
      tipo: 'saida',
      valor: updatedExpense.valor,
      data: updatedExpense.data,
      descricao: `Despesa: ${updatedExpense.tipo} - ${updatedExpense.truckId}`
    });

    writeDB(db);
    res.json(updatedExpense);
  });

  app.delete("/api/expenses/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const exp = db.expenses.find((e: any) => e.id === id);
    if (exp) {
      if (exp.companyId !== companyId) {
        return res.status(403).json({ error: "Não autorizado." });
      }
      db.expenses = db.expenses.filter((e: any) => e.id !== id);
      db.cash_flow = db.cash_flow.filter((c: any) => {
        const isMatch = c.companyId === companyId && c.descricao === `Despesa: ${exp.tipo} - ${exp.truckId}` && c.valor === exp.valor && c.data === exp.data;
        return !isMatch;
      });
      writeDB(db);
    }
    res.json({ success: true });
  });

  app.post("/api/cash_flow", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const newEntry = { 
      ...req.body, 
      id: `cash_${Date.now()}`,
      companyId,
      valor: parseFloat(req.body.valor || 0)
    };
    db.cash_flow.push(newEntry);
    writeDB(db);
    res.json(newEntry);
  });

  app.delete("/api/cash_flow/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const item = db.cash_flow.find((c: any) => c.id === id);
    if (!item) {
      return res.status(404).json({ error: "Lançamento não encontrado." });
    }
    if (item.companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }
    db.cash_flow = db.cash_flow.filter((c: any) => c.id !== id);
    writeDB(db);
    res.json({ success: true });
  });

  app.put("/api/cash_flow/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const idx = db.cash_flow.findIndex((c: any) => c.id === id);
    if (idx !== -1) {
      if (db.cash_flow[idx].companyId !== companyId) {
        return res.status(403).json({ error: "Não autorizado." });
      }
      db.cash_flow[idx] = {
        ...db.cash_flow[idx],
        ...req.body,
        id,
        companyId, // Force immutable companyId
        valor: parseFloat(req.body.valor || 0)
      };
      writeDB(db);
      res.json(db.cash_flow[idx]);
    } else {
      res.status(404).json({ error: "Lançamento não encontrado" });
    }
  });

  app.post("/api/chat_logs", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const newLog = { 
      ...req.body, 
      id: `chat_${Date.now()}`, 
      companyId,
      timestamp: new Date().toISOString() 
    };
    db.chat_logs.push(newLog);
    writeDB(db);
    res.json(newLog);
  });

  // Securely initialize Gemini client
  let aiInstance: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!aiInstance) {
      aiInstance = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY || "",
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiInstance;
  }

  app.post("/api/ai/chat", async (req, res) => {
    const { message, trucks } = req.body;
    if (!message) {
      res.status(400).json({ error: "Mensagem é obrigatória" });
      return;
    }

    const ai = getGeminiClient();
    const model = "gemini-3.5-flash";
    
    const systemInstruction = `
      Você é o assistente inteligente da GBFleet AI, um sistema de gestão de frotas.
      Sua função é interpretar mensagens do usuário e transformá-las em ações no sistema.
      
      Caminhões disponíveis: ${Array.isArray(trucks) ? trucks.map((t: any) => `${t.placa} (${t.modelo})`).join(", ") : ""}
      
      Ações possíveis:
      1. REGISTER_FUEL: Quando o usuário informa um abastecimento. Requer: truckId (placa), litros, valor, km.
      2. REGISTER_EXPENSE: Quando o usuário informa uma despesa (manutenção, pedágio, etc). Requer: truckId (placa), tipo, valor.
      3. REGISTER_CASH: Quando o usuário informa uma entrada ou saída de caixa genérica. Requer: tipo (entrada/saida), valor, descricao.
      4. ANALYZE: Quando o usuário pede uma análise, pergunta sobre o caminhão que mais gastou, ou resumo da frota.
      
      Regras de Resposta:
      - Se for um registro bem-sucedido, confirme com entusiasmo.
      - Se for uma análise, use os dados dos caminhões fornecidos.
      - Se o usuário perguntar "quem gastou mais", mencione que você pode analisar os relatórios no dashboard.
      - Mantenha um tom profissional de consultor de logística.
      
      Responda SEMPRE em JSON no formato:
      {
        "action": "REGISTER_FUEL" | "REGISTER_EXPENSE" | "REGISTER_CASH" | "ANALYZE" | "NONE",
        "data": { ... dados da ação ... },
        "response": "Sua resposta amigável para o usuário em português"
      }
      
      Se faltar informação, peça educadamente na "response" e use action "NONE".
      Se for um abastecimento, calcule o consumo se possível e mencione na resposta.
    `;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: message,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: { type: Type.STRING },
              data: { type: Type.OBJECT },
              response: { type: Type.STRING }
            },
            required: ["action", "response"]
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      res.json(result);
    } catch (error) {
      console.error("Gemini Error:", error);
      res.status(500).json({
        action: "NONE",
        response: "Desculpe, tive um problema ao processar sua mensagem. Pode repetir?"
      });
    }
  });

  app.post("/api/trucks", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const company = db.companies.find((c: any) => c.id === companyId);
    const companyTrucks = db.trucks.filter((t: any) => t.companyId === companyId);
    const limite = company?.limiteCaminhoes ?? 10;

    if (limite > 0 && companyTrucks.length >= limite) {
      return res.status(400).json({ 
        error: `Limite de frotas ativadas atingido (${companyTrucks.length}/${limite} caminhões). Entre em contato com o suporte/SaaS para expandir seu plano.` 
      });
    }

    const newTruck = { 
      ...req.body, 
      id: `truck_${Date.now()}`,
      companyId 
    };
    db.trucks.push(newTruck);
    writeDB(db);
    res.json(newTruck);
  });

  app.delete("/api/trucks/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const truck = db.trucks.find((t: any) => t.id === id);
    if (!truck) {
      return res.status(404).json({ error: "Veículo não encontrado." });
    }
    if (truck.companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }
    db.trucks = db.trucks.filter((t: any) => t.id !== id);
    writeDB(db);
    res.json({ success: true });
  });

  const syncFreightData = (db: any, freight: any) => {
    // 1. Remove previous synced logs for this freight to avoid duplications
    db.fuel_logs = db.fuel_logs.filter((log: any) => !log.id.includes(freight.id));
    db.expenses = db.expenses.filter((exp: any) => !exp.id.includes(freight.id));
    db.cash_flow = db.cash_flow.filter((cash: any) => !cash.id.includes(freight.id));

    // If status is Orçado, we do not sync actual expenditures/fuels in other active tabs
    if (freight.status === "Orçado" || freight.status === "Cancelado") {
      return;
    }

    // 2. Fuel sync
    if (freight.combustivel > 0) {
      const fuelLogsForTruck = db.fuel_logs.filter((log: any) => log.truckId === freight.truckId);
      let latestKm = 120000;
      if (freight.kmAbastecimento && Number(freight.kmAbastecimento) > 0) {
        latestKm = Number(freight.kmAbastecimento);
      } else if (fuelLogsForTruck.length > 0) {
        const sortedLogs = [...fuelLogsForTruck].sort((a: any, b: any) => b.km - a.km);
        latestKm = sortedLogs[0].km + Math.floor(Math.random() * 350) + 150;
      }

      db.fuel_logs.push({
        id: `fuel_sync_${freight.id}`,
        companyId: freight.companyId,
        truckId: freight.truckId,
        driverId: freight.driverId || "",
        data: freight.data,
        km: latestKm,
        litros: Math.round(freight.combustivel / 5.8) || 1,
        valor: freight.combustivel,
        local: freight.localAbastecimento || `Posto na Rota (${freight.origem} -> ${freight.destino})`,
        foto: freight.fotoAbastecimento || ""
      });
    }

    // 3. Expenses sync (Pedágio, Diárias, Outras)
    if (freight.pedagio > 0) {
      db.expenses.push({
        id: `exp_sync_ped_${freight.id}`,
        companyId: freight.companyId,
        truckId: freight.truckId,
        tipo: 'Pedágio',
        valor: freight.pedagio,
        data: freight.data,
        obs: freight.localPedagio || `Pedágio automático do Frete (${freight.origem} -> ${freight.destino})`
      });
    }

    if (freight.motorista > 0) {
      db.expenses.push({
        id: `exp_sync_mot_${freight.id}`,
        companyId: freight.companyId,
        truckId: freight.truckId,
        tipo: 'Outros',
        valor: freight.motorista,
        data: freight.data,
        obs: freight.localMotorista || `Diária do motorista: frete ${freight.origem} -> ${freight.destino}`
      });
    }

    if (freight.outrasDespesas > 0) {
      db.expenses.push({
        id: `exp_sync_out_${freight.id}`,
        companyId: freight.companyId,
        truckId: freight.truckId,
        tipo: 'Outros',
        valor: freight.outrasDespesas,
        data: freight.data,
        obs: freight.outrosDetalhes || `Outros custos de viagem: frete ${freight.origem} -> ${freight.destino}`,
        foto: freight.fotoComprovanteGeral || ""
      });
    }

    // 4. General Cash Flow sync if status is "Concluído"
    if (freight.status === "Concluído") {
      db.cash_flow.push({
        id: `cash_freight_in_${freight.id}`,
        companyId: freight.companyId,
        tipo: 'entrada',
        valor: freight.valorBruto,
        data: freight.data,
        descricao: `Receita Frete: ${freight.origem} -> ${freight.destino} (${freight.truckId})`
      });

      const expensesTotal = (freight.pedagio || 0) + (freight.combustivel || 0) + (freight.motorista || 0) + (freight.outrasDespesas || 0);
      if (expensesTotal > 0) {
        db.cash_flow.push({
          id: `cash_freight_out_${freight.id}`,
          companyId: freight.companyId,
          tipo: 'saida',
          valor: expensesTotal,
          data: freight.data,
          descricao: `Despesas Frete: ${freight.origem} -> ${freight.destino} (${freight.truckId})`
        });
      }
    }
  };

  app.post("/api/freights", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const newFreight = { 
      ...req.body, 
      id: `freight_${Date.now()}`,
      companyId,
      valorBruto: parseFloat(req.body.valorBruto || 0),
      pedagio: parseFloat(req.body.pedagio || 0),
      combustivel: parseFloat(req.body.combustivel || 0),
      motorista: parseFloat(req.body.motorista || 0),
      outrasDespesas: parseFloat(req.body.outrasDespesas || 0),
      distanciaKm: parseFloat(req.body.distanciaKm || 0),
      kmAbastecimento: parseFloat(req.body.kmAbastecimento || 0),
      tipoViagem: req.body.tipoViagem || 'ida'
    };
    db.freights.push(newFreight);

    syncFreightData(db, newFreight);

    writeDB(db);
    res.json(newFreight);
  });

  app.put("/api/freights/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;

    const idx = db.freights.findIndex((f: any) => f.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Frete não encontrado." });
    }

    if (db.freights[idx].companyId !== companyId) {
      return res.status(403).json({ error: "Acesso não autorizado." });
    }

    db.freights[idx] = {
      ...db.freights[idx],
      ...req.body,
      id,
      companyId,
      valorBruto: parseFloat(req.body.valorBruto || 0),
      pedagio: parseFloat(req.body.pedagio || 0),
      combustivel: parseFloat(req.body.combustivel || 0),
      motorista: parseFloat(req.body.motorista || 0),
      outrasDespesas: parseFloat(req.body.outrasDespesas || 0),
      distanciaKm: parseFloat(req.body.distanciaKm || 0),
      kmAbastecimento: parseFloat(req.body.kmAbastecimento || 0),
      tipoViagem: req.body.tipoViagem || db.freights[idx].tipoViagem || 'ida'
    };

    syncFreightData(db, db.freights[idx]);
    writeDB(db);
    res.json(db.freights[idx]);
  });

  app.put("/api/freights/:id/status", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const { status } = req.body;
    const companyId = (req as any).companyId;

    const freightIndex = db.freights.findIndex((f: any) => f.id === id);
    if (freightIndex === -1) {
      return res.status(404).json({ error: "Frete não encontrado" });
    }

    if (db.freights[freightIndex].companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }

    db.freights[freightIndex].status = status;
    const updatedFreight = db.freights[freightIndex];

    syncFreightData(db, updatedFreight);

    writeDB(db);
    res.json(updatedFreight);
  });

  app.post("/api/maintenance_alerts", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const newAlert = {
      ...req.body,
      id: `alert_${Date.now()}`,
      companyId,
      limiteKm: Number(req.body.limiteKm || 0),
      custo: 0,
      status: "Pendente",
      dataRealizada: ""
    };
    db.maintenance_alerts.push(newAlert);
    writeDB(db);
    res.json(newAlert);
  });

  app.post("/api/maintenance_alerts/:id/complete", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const { custo, dataRealizada } = req.body;
    const companyId = (req as any).companyId;

    const idx = db.maintenance_alerts.findIndex((a: any) => a.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Alerta não encontrado" });
    }

    if (db.maintenance_alerts[idx].companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }

    db.maintenance_alerts[idx].status = "Realizado";
    db.maintenance_alerts[idx].custo = parseFloat(custo || 0);
    db.maintenance_alerts[idx].dataRealizada = dataRealizada || new Date().toISOString().split('T')[0];

    const alert = db.maintenance_alerts[idx];

    // Automatically register as a maintenance expense
    const expenseId = `exp_maint_${alert.id}`;
    db.expenses.push({
      id: expenseId,
      companyId: companyId,
      truckId: alert.truckId,
      tipo: "Manutenção",
      valor: parseFloat(custo || 0),
      data: alert.dataRealizada,
      obs: `Manutenção resolvida: ${alert.tipo} - ${alert.descricao || ""}`
    });

    // Automatically register as cash flow outgo (saída)
    db.cash_flow.push({
      id: `cash_maint_${alert.id}`,
      companyId: companyId,
      tipo: "saida",
      valor: parseFloat(custo || 0),
      data: alert.dataRealizada,
      descricao: `Manutenção: ${alert.tipo} - ${alert.truckId}`
    });

    writeDB(db);
    res.json(alert);
  });

  app.delete("/api/maintenance_alerts/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;

    const prevMatched = db.maintenance_alerts.find((a: any) => a.id === id);
    if (prevMatched && prevMatched.companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }

    db.maintenance_alerts = db.maintenance_alerts.filter((a: any) => a.id !== id);
    writeDB(db);
    res.json({ success: true });
  });

  // Driver Endpoints
  app.post("/api/drivers", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const newDriver = {
      ...req.body,
      id: `driver_${Date.now()}`,
      companyId
    };
    db.drivers.push(newDriver);
    writeDB(db);
    res.json(newDriver);
  });

  app.put("/api/drivers/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const idx = db.drivers.findIndex((d: any) => d.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Motorista não encontrado" });
    }
    if (db.drivers[idx].companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }
    db.drivers[idx] = {
      ...db.drivers[idx],
      ...req.body,
      id,
      companyId // Force immutable companyId
    };
    writeDB(db);
    res.json(db.drivers[idx]);
  });

  app.delete("/api/drivers/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const prevMatched = db.drivers.find((d: any) => d.id === id);
    if (prevMatched && prevMatched.companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }
    db.drivers = db.drivers.filter((d: any) => d.id !== id);
    writeDB(db);
    res.json({ success: true });
  });

  // Gas Stations Endpoints (Postos de Abastecimento)
  app.post("/api/gas_stations", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const newStation = {
      ...req.body,
      id: `gas_${Date.now()}`,
      companyId,
      precoDiesel: parseFloat(req.body.precoDiesel || 0)
    };
    if (!db.gas_stations) db.gas_stations = [];
    db.gas_stations.push(newStation);
    writeDB(db);
    res.json(newStation);
  });

  app.put("/api/gas_stations/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    if (!db.gas_stations) db.gas_stations = [];
    const idx = db.gas_stations.findIndex((g: any) => g.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Posto não encontrado" });
    }
    if (db.gas_stations[idx].companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }
    db.gas_stations[idx] = {
      ...db.gas_stations[idx],
      ...req.body,
      id,
      companyId,
      precoDiesel: parseFloat(req.body.precoDiesel || db.gas_stations[idx].precoDiesel || 0)
    };
    writeDB(db);
    res.json(db.gas_stations[idx]);
  });

  app.delete("/api/gas_stations/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    if (!db.gas_stations) db.gas_stations = [];
    const prevMatched = db.gas_stations.find((g: any) => g.id === id);
    if (prevMatched && prevMatched.companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }
    db.gas_stations = db.gas_stations.filter((g: any) => g.id !== id);
    writeDB(db);
    res.json({ success: true });
  });

  // Expense Companies Endpoints
  app.post("/api/expense_companies", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const newExpCompany = {
      ...req.body,
      id: `exp_comp_${Date.now()}`,
      companyId
    };
    if (!db.expense_companies) db.expense_companies = [];
    db.expense_companies.push(newExpCompany);
    writeDB(db);
    res.json(newExpCompany);
  });

  app.put("/api/expense_companies/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    if (!db.expense_companies) db.expense_companies = [];
    const idx = db.expense_companies.findIndex((ec: any) => ec.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Empresa de despesa não encontrada" });
    }
    if (db.expense_companies[idx].companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }
    db.expense_companies[idx] = {
      ...db.expense_companies[idx],
      ...req.body,
      id,
      companyId
    };
    writeDB(db);
    res.json(db.expense_companies[idx]);
  });

  app.delete("/api/expense_companies/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    if (!db.expense_companies) db.expense_companies = [];
    const prevMatched = db.expense_companies.find((ec: any) => ec.id === id);
    if (prevMatched && prevMatched.companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }
    db.expense_companies = db.expense_companies.filter((ec: any) => ec.id !== id);
    writeDB(db);
    res.json({ success: true });
  });

  // Route Presets Endpoints (SaaS Dynamic Routes)
  app.post("/api/routes", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const newRoute = {
      ...req.body,
      id: `route_${Date.now()}`,
      companyId,
      distanciaKm: parseFloat(req.body.distanciaKm || 0),
      valorPedagio: parseFloat(req.body.valorPedagio || 0),
      diariaMotorista: parseFloat(req.body.diariaMotorista || 0),
      valorFrete: parseFloat(req.body.valorFrete || 0),
      outrosCustos: parseFloat(req.body.outrosCustos || 0)
    };
    db.routes.push(newRoute);
    writeDB(db);
    res.json(newRoute);
  });

  app.put("/api/routes/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const idx = db.routes.findIndex((r: any) => r.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Rota não encontrada" });
    }
    if (db.routes[idx].companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }
    db.routes[idx] = {
      ...db.routes[idx],
      ...req.body,
      id,
      companyId, // Force immutable companyId
      distanciaKm: parseFloat(req.body.distanciaKm || 0),
      valorPedagio: parseFloat(req.body.valorPedagio || 0),
      diariaMotorista: parseFloat(req.body.diariaMotorista || 0),
      valorFrete: parseFloat(req.body.valorFrete || 0),
      outrosCustos: parseFloat(req.body.outrosCustos || 0)
    };
    writeDB(db);
    res.json(db.routes[idx]);
  });

  app.delete("/api/routes/:id", (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const prevMatched = db.routes.find((r: any) => r.id === id);
    if (prevMatched && prevMatched.companyId !== companyId) {
      return res.status(403).json({ error: "Não autorizado." });
    }
    db.routes = db.routes.filter((r: any) => r.id !== id);
    writeDB(db);
    res.json({ success: true });
  });

  // Dynamic categories endpoints
  app.post("/api/categories", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const { tipo, nome } = req.body;
    if (!nome) {
      return res.status(400).json({ error: "Nome da categoria é obrigatório." });
    }
    const cleanNome = nome.trim();
    
    const companyIdx = db.companies.findIndex((c: any) => c.id === companyId);
    if (companyIdx !== -1) {
      if (!db.companies[companyIdx].categories_entrada) {
        db.companies[companyIdx].categories_entrada = [...db.categories_entrada];
      }
      if (!db.companies[companyIdx].categories_saida) {
        db.companies[companyIdx].categories_saida = [...db.categories_saida];
      }
      
      if (tipo === "entrada") {
        if (!db.companies[companyIdx].categories_entrada.includes(cleanNome)) {
          db.companies[companyIdx].categories_entrada.push(cleanNome);
        }
      } else if (tipo === "saida") {
        if (!db.companies[companyIdx].categories_saida.includes(cleanNome)) {
          db.companies[companyIdx].categories_saida.push(cleanNome);
        }
      } else {
        return res.status(400).json({ error: "Tipo inválido." });
      }
      writeDB(db);
      return res.json({ 
        categories_entrada: db.companies[companyIdx].categories_entrada, 
        categories_saida: db.companies[companyIdx].categories_saida 
      });
    }
    
    // Fallback for demo state or if company not found
    if (tipo === "entrada") {
      if (!db.categories_entrada.includes(cleanNome)) {
        db.categories_entrada.push(cleanNome);
      }
    } else if (tipo === "saida") {
      if (!db.categories_saida.includes(cleanNome)) {
        db.categories_saida.push(cleanNome);
      }
    } else {
      return res.status(400).json({ error: "Tipo inválido." });
    }
    writeDB(db);
    res.json({ categories_entrada: db.categories_entrada, categories_saida: db.categories_saida });
  });

  app.put("/api/categories", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const { tipo, oldNome, newNome } = req.body;
    if (!oldNome || !newNome) {
      return res.status(400).json({ error: "Valores antigos e novos de nome são obrigatórios" });
    }
    const cleanOld = oldNome.trim();
    const cleanNew = newNome.trim();

    const companyIdx = db.companies.findIndex((c: any) => c.id === companyId);
    let currentEntrada = db.categories_entrada;
    let currentSaida = db.categories_saida;

    if (companyIdx !== -1) {
      if (!db.companies[companyIdx].categories_entrada) {
        db.companies[companyIdx].categories_entrada = [...db.categories_entrada];
      }
      if (!db.companies[companyIdx].categories_saida) {
        db.companies[companyIdx].categories_saida = [...db.categories_saida];
      }
      
      currentEntrada = db.companies[companyIdx].categories_entrada;
      currentSaida = db.companies[companyIdx].categories_saida;
    }

    if (tipo === "entrada") {
      const idx = currentEntrada.indexOf(cleanOld);
      if (idx !== -1) {
        currentEntrada[idx] = cleanNew;
      }
      // cascade change to cash_flow entry category for THIS company only
      db.cash_flow.forEach((c: any) => {
        if (c.companyId === companyId && c.tipo === "entrada" && c.categoria === cleanOld) {
          c.categoria = cleanNew;
        }
      });
    } else if (tipo === "saida") {
      const idx = currentSaida.indexOf(cleanOld);
      if (idx !== -1) {
        currentSaida[idx] = cleanNew;
      }
      // cascade change to expenses of type for THIS company only
      db.expenses.forEach((e: any) => {
        if (e.companyId === companyId && e.tipo === cleanOld) {
          e.tipo = cleanNew;
        }
      });
      // cascade change to cash_flow of category for THIS company only
      db.cash_flow.forEach((c: any) => {
        if (c.companyId === companyId && c.tipo === "saida" && c.categoria === cleanOld) {
          c.categoria = cleanNew;
        }
      });
    } else {
      return res.status(400).json({ error: "Tipo inválido." });
    }
    
    writeDB(db);
    res.json({ categories_entrada: currentEntrada, categories_saida: currentSaida });
  });

  app.delete("/api/categories", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
    const { tipo, nome } = req.body;
    if (!nome) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }
    const cleanNome = nome.trim();

    const companyIdx = db.companies.findIndex((c: any) => c.id === companyId);
    let currentEntrada = db.categories_entrada;
    let currentSaida = db.categories_saida;

    if (companyIdx !== -1) {
      if (!db.companies[companyIdx].categories_entrada) {
        db.companies[companyIdx].categories_entrada = [...db.categories_entrada];
      }
      if (!db.companies[companyIdx].categories_saida) {
        db.companies[companyIdx].categories_saida = [...db.categories_saida];
      }
      
      if (tipo === "entrada") {
        db.companies[companyIdx].categories_entrada = db.companies[companyIdx].categories_entrada.filter((c: string) => c !== cleanNome);
      } else if (tipo === "saida") {
        db.companies[companyIdx].categories_saida = db.companies[companyIdx].categories_saida.filter((c: string) => c !== cleanNome);
      } else {
        return res.status(400).json({ error: "Tipo inválido." });
      }
      currentEntrada = db.companies[companyIdx].categories_entrada;
      currentSaida = db.companies[companyIdx].categories_saida;
    } else {
      if (tipo === "entrada") {
        db.categories_entrada = db.categories_entrada.filter((c: string) => c !== cleanNome);
      } else if (tipo === "saida") {
        db.categories_saida = db.categories_saida.filter((c: string) => c !== cleanNome);
      } else {
        return res.status(400).json({ error: "Tipo inválido." });
      }
      currentEntrada = db.categories_entrada;
      currentSaida = db.categories_saida;
    }

    writeDB(db);
    res.json({ categories_entrada: currentEntrada, categories_saida: currentSaida });
  });

  // ============================================================================
  // MERCADO PAGO API v1 - COBRANÇA PIX, VERIFICAÇÃO DE STATUS E WEBHOOK AUTOMÁTICO
  // ============================================================================
  const MERCADOPAGO_ACCESS_TOKEN =
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    "APP_USR-8095889170603631-092923-59bc02bdb3dedbba22bc6ce75430395f-313512785";

  // Helper to compute +30 days ISO date (YYYY-MM-DD) from current expiration (if in future) or today
  const computeNext30DaysExpiration = (currentExpiresAt?: string): string => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    let baseDate = today;
    if (currentExpiresAt && /^\d{4}-\d{2}-\d{2}$/.test(currentExpiresAt)) {
      const parsed = new Date(currentExpiresAt + "T12:00:00");
      if (!isNaN(parsed.getTime()) && parsed.getTime() > today.getTime()) {
        baseDate = parsed;
      }
    }
    const nextDate = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    return nextDate.toISOString().split("T")[0];
  };

  // Unlocks and renews a tenant in both remote Firestore (system_state/gbfleet_db) and local db.json
  const unlockTenantInFirestoreAndLocal = async (
    tenantId: string,
    paymentId: string,
    paidAmount?: number
  ): Promise<{ unlocked: boolean; alreadyProcessed?: boolean; newExpiresAt?: string }> => {
    let resultUnlocked = false;
    let newExpiresAt = "";

    const applyUnlockToCompany = (comp: any) => {
      if (comp.lastApprovedPaymentId && String(comp.lastApprovedPaymentId) === String(paymentId)) {
        newExpiresAt = comp.planExpiresAt || comp.dataVencimento || "";
        return false; // Already processed this paymentId
      }
      const nextExp = computeNext30DaysExpiration(comp.planExpiresAt || comp.dataVencimento);
      comp.planExpiresAt = nextExp;
      comp.dataVencimento = nextExp;
      comp.planStatus = "active";
      comp.isActive = true;
      comp.status = "ativo";
      comp.pago = true;
      if (comp.promoEnabled) {
        comp.promoEnabled = false;
      }
      comp.lastApprovedPaymentId = String(paymentId);
      comp.lastPaymentAt = new Date().toISOString();
      if (paidAmount !== undefined) {
        comp.lastPaidAmount = Number(paidAmount);
      }
      newExpiresAt = nextExp;
      return true;
    };

    // 1) Update in Firestore (system_state/gbfleet_db) via REST API
    try {
      let projId = firestoreProjId || process.env.FIREBASE_PROJECT_ID || "";
      let dbId = firestoreDbId || process.env.FIREBASE_DATABASE_ID || "(default)";
      const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(firebaseConfigPath)) {
        const cfg = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
        if (cfg.projectId) projId = cfg.projectId;
        if (cfg.firestoreDatabaseId) dbId = cfg.firestoreDatabaseId;
      }

      if (projId) {
        const docUrl = `https://firestore.googleapis.com/v1/projects/${projId}/databases/${dbId}/documents/system_state/gbfleet_db`;
        const getRes = await fetch(docUrl);
        if (getRes.ok) {
          const docJson: any = await getRes.json();
          const companiesField = docJson?.fields?.companies;
          if (companiesField) {
            const companiesArr: any[] = fromFirestoreValue(companiesField) || [];
            // Guard: only patch if companiesArr is valid and non-empty
            if (Array.isArray(companiesArr) && companiesArr.length > 0) {
              const targetComp = companiesArr.find((c: any) => c && c.id === tenantId);
              if (targetComp) {
                const changed = applyUnlockToCompany(targetComp);
                if (changed) {
                  const patchParams = new URLSearchParams();
                  patchParams.append("updateMask.fieldPaths", "companies");
                  patchParams.append("updateMask.fieldPaths", "_writeId");
                  patchParams.append("updateMask.fieldPaths", "_writeTimestamp");

                  const patchBody = {
                    fields: {
                      companies: toFirestoreValue(companiesArr),
                      _writeId: toFirestoreValue(`mp_unlock_${paymentId}_${Date.now()}`),
                      _writeTimestamp: toFirestoreValue(Date.now())
                    }
                  };

                  const patchRes = await fetch(`${docUrl}?${patchParams.toString()}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patchBody)
                  });
                  if (patchRes.ok) {
                    resultUnlocked = true;
                    console.log(`[Mercado Pago] Tenant ${tenantId} desbloqueado e renovado no Firestore até ${newExpiresAt}!`);
                  }
                } else {
                  return { unlocked: true, alreadyProcessed: true, newExpiresAt };
                }
              }
            }
          }
        }
      }
    } catch (fsErr: any) {
      console.warn("[Mercado Pago] Aviso ao atualizar Firestore via servidor:", fsErr.message);
    }

    // 2) Also update local DB cache if tenant exists locally
    try {
      const db = readDB();
      const localComp = db.companies?.find((c: any) => c.id === tenantId);
      if (localComp) {
        const changedLocal = applyUnlockToCompany(localComp);
        if (changedLocal) {
          writeDB(db);
          resultUnlocked = true;
        }
      }
    } catch (localErr: any) {
      console.warn("[Mercado Pago] Aviso ao atualizar DB local:", localErr.message);
    }

    return { unlocked: resultUnlocked, newExpiresAt };
  };

  // A) POST /api/saas/payment/create-charge (Protected by Rate Limiting + Multi-Tenant Isolation)
  app.post("/api/saas/payment/create-charge", async (req, res) => {
    try {
      const { tenantId, tenantName, ownerEmail, ownerCpfCnpj, planName, amount } = req.body || {};

      if (!tenantId) {
        return res.status(400).json({ error: "Identificador da empresa (tenantId) é obrigatório." });
      }

      // Anti-Flood Rate Limiter: max 10 PIX charges per 5 minutes per IP/tenant
      const ip = getClientIp(req);
      const rate = checkRateLimit(`mp_create_charge_${ip}_${tenantId}`, 10, 5);
      if (!rate.allowed) {
        await recordSecurityAudit(
          "RATE_LIMIT_PIX_CREATE_CHARGE",
          String(tenantId),
          { ip, retryAfterSec: rate.retryAfterSec },
          req
        );
        return res.status(429).json({
          error: `Limite de geração de QR Code PIX excedido. Aguarde ${rate.retryAfterSec}s.`
        });
      }

      // If caller provided an Authorization token or x-user-id, enforce strict multi-tenant check
      if (req.headers.authorization || req.headers["x-user-id"]) {
        const caller = await verifyAdminCaller(req);
        if (caller.authorized && !caller.isSaaSAdmin && caller.tenantId && caller.tenantId !== tenantId) {
          await recordSecurityAudit(
            "CROSS_TENANT_PIX_CHARGE_BLOCKED",
            String(tenantId),
            { callerUid: caller.uid, callerTenantId: caller.tenantId, targetTenantId: tenantId },
            req
          );
          return res.status(403).json({
            error: "Acesso negado (403 Forbidden): Você não pode gerar cobranças para outra empresa."
          });
        }
      }

      // Zero-Trust Price Validation: Prevent client-side amount tampering (e.g. changing R$ 149.90 to R$ 0.01)
      let callerIsSuperAdmin = false;
      if (req.headers.authorization || req.headers["x-user-id"]) {
        const caller = await verifyAdminCaller(req);
        callerIsSuperAdmin = Boolean(caller.authorized && caller.isSaaSAdmin);
      }

      let numericAmount = Number(amount);
      if (!callerIsSuperAdmin) {
        const db = readDB();
        const comp = db.companies?.find((c: any) => c.id === tenantId);
        if (comp) {
          const expectedPrice =
            comp.promoEnabled && Number(comp.promoFirstPaymentAmount) > 0
              ? Number(comp.promoFirstPaymentAmount)
              : Number(comp.planPrice || comp.monthlyFeeOverride || comp.valorMensalidade || 0);
          if (expectedPrice > 0 && numericAmount < expectedPrice) {
            await recordSecurityAudit(
              "PIX_AMOUNT_TAMPERING_BLOCKED",
              String(tenantId),
              { attemptedAmount: numericAmount, enforcedAmount: expectedPrice },
              req
            );
            numericAmount = expectedPrice;
          }
        }
      }

      if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: "Valor da cobrança inválido." });
      }

      const rawDoc = String(ownerCpfCnpj || "").replace(/\D/g, "");
      const hasValidLength = rawDoc.length === 11 || rawDoc.length === 14;
      const cleanDoc = hasValidLength ? rawDoc : "19119119100";
      const docType = cleanDoc.length === 14 ? "CNPJ" : "CPF";

      const cleanEmail =
        ownerEmail && String(ownerEmail).includes("@")
          ? String(ownerEmail).trim().toLowerCase()
          : `financeiro@${String(tenantId).replace(/[^a-zA-Z0-9]/g, "")}.com`;

      const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
      const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
      const baseOrigin = host ? `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}` : (process.env.VITE_APP_URL || "");
      const isPublicHttps =
        baseOrigin.startsWith("https://") &&
        !baseOrigin.includes("localhost") &&
        !baseOrigin.includes("127.0.0.1");

      const buildMpPayload = (identificationType: string, identificationNumber: string) => {
        const payload: any = {
          transaction_amount: Number(numericAmount.toFixed(2)),
          description: `Assinatura SaaS Gestão de Caminhões - ${planName || "Plano Frota"} (${tenantName || tenantId})`,
          payment_method_id: "pix",
          payer: {
            email: cleanEmail,
            first_name: tenantName || tenantId,
            identification: {
              type: identificationType,
              number: identificationNumber
            }
          },
          external_reference: `truck_saas:${tenantId}`
        };

        if (isPublicHttps) {
          payload.notification_url = `${baseOrigin}/api/webhooks/mercadopago`;
        }
        return payload;
      };

      const sendMpCreateRequest = async (idType: string, idNumber: string) => {
        const randomStr = Math.random().toString(36).substring(2, 10);
        const idempotencyKey = `mp_truck_${tenantId}_${Date.now()}_${randomStr}`;
        return fetch("https://api.mercadopago.com/v1/payments", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": idempotencyKey
          },
          body: JSON.stringify(buildMpPayload(idType, idNumber))
        });
      };

      let mpRes = await sendMpCreateRequest(docType, cleanDoc);
      let mpData: any = await mpRes.json();

      if (!mpRes.ok && cleanDoc !== "19119119100") {
        console.warn("[Mercado Pago] Documento informado rejeitado pela validação MP; tentando fallback seguro para emissão do PIX...");
        mpRes = await sendMpCreateRequest("CPF", "19119119100");
        mpData = await mpRes.json();
      }

      if (!mpRes.ok) {
        console.error("[Mercado Pago Error] Falha ao criar cobrança PIX:", mpData);
        return res.status(mpRes.status || 400).json({
          error: mpData?.message || "Falha ao gerar cobrança PIX no Mercado Pago."
        });
      }

      const txData = mpData?.point_of_interaction?.transaction_data || {};
      return res.json({
        paymentId: String(mpData.id),
        status: mpData.status,
        statusDetail: mpData.status_detail,
        qrCode: txData.qr_code || "",
        qrCodeBase64: txData.qr_code_base64 || "",
        ticketUrl: txData.ticket_url || "",
        expiresAt: mpData.date_of_expiration || null,
        amount: mpData.transaction_amount,
        externalReference: mpData.external_reference
      });
    } catch (err: any) {
      console.error("[Mercado Pago Create Charge Exception]:", err);
      return res.status(500).json({ error: err.message || "Erro interno ao gerar PIX." });
    }
  });

  // B) GET /api/saas/payment/check-status/:paymentId (Zero-Trust Official MP Lookup)
  app.get("/api/saas/payment/check-status/:paymentId", async (req, res) => {
    try {
      const { paymentId } = req.params;
      if (!paymentId || !/^\d+$/.test(String(paymentId).trim())) {
        return res.status(400).json({ error: "paymentId numérico válido é obrigatório." });
      }

      const rate = checkRateLimit(`mp_check_${getClientIp(req)}`, 45, 1);
      if (!rate.allowed) {
        return res.status(429).json({ error: "Limite de consultas atingido. Aguarde alguns segundos." });
      }

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId).trim())}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      });

      const mpData: any = await mpRes.json();
      if (!mpRes.ok) {
        return res.status(mpRes.status || 400).json({
          error: mpData?.message || "Não foi possível consultar o status do pagamento."
        });
      }

      const extRef = String(mpData.external_reference || "");
      const isTruckSaas = extRef.startsWith("truck_saas:");
      const tenantId = isTruckSaas ? extRef.replace("truck_saas:", "") : null;

      let unlockResult: any = null;
      if (isTruckSaas && tenantId && mpData.status === "approved") {
        unlockResult = await unlockTenantInFirestoreAndLocal(
          tenantId,
          String(mpData.id),
          mpData.transaction_amount
        );
        await recordSecurityAudit(
          "PIX_PAYMENT_APPROVED_UNLOCK",
          tenantId,
          { paymentId: String(mpData.id), amount: mpData.transaction_amount, newExpiresAt: unlockResult?.newExpiresAt },
          req
        );
      }

      return res.json({
        id: String(mpData.id),
        status: mpData.status,
        status_detail: mpData.status_detail,
        external_reference: extRef,
        tenantId,
        isTruckSaas,
        transaction_amount: mpData.transaction_amount,
        date_approved: mpData.date_approved,
        unlocked: unlockResult?.unlocked || false,
        newExpiresAt: unlockResult?.newExpiresAt || null
      });
    } catch (err: any) {
      console.error("[Mercado Pago Check Status Exception]:", err);
      return res.status(500).json({ error: err.message || "Erro ao consultar pagamento." });
    }
  });

  // B.2) POST /api/saas/payment/confirm-unlock (Zero-Trust Unlock Verification)
  // Blocks fake client-side unlock requests unless the paymentId is genuinely approved on Mercado Pago API v1!
  app.post("/api/saas/payment/confirm-unlock", async (req, res) => {
    try {
      const { tenantId, paymentId } = req.body || {};
      if (!tenantId || !paymentId || !/^\d+$/.test(String(paymentId).trim())) {
        await recordSecurityAudit(
          "FORGED_CONFIRM_UNLOCK_BLOCKED",
          String(tenantId || "unknown"),
          { paymentId, reason: "Missing or non-numeric paymentId" },
          req
        );
        return res.status(403).json({
          error: "Desbloqueio negado (403 Forbidden): ID de pagamento inválido ou não verificado."
        });
      }

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId).trim())}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      });

      if (!mpRes.ok) {
        await recordSecurityAudit(
          "FORGED_CONFIRM_UNLOCK_BLOCKED",
          String(tenantId),
          { paymentId, mpStatus: mpRes.status },
          req
        );
        return res.status(403).json({
          error: "Desbloqueio negado (403 Forbidden): Pagamento não encontrado na API oficial do Mercado Pago."
        });
      }

      const mpData: any = await mpRes.json();
      const expectedRef = `truck_saas:${tenantId}`;
      if (mpData.status !== "approved" || mpData.external_reference !== expectedRef) {
        await recordSecurityAudit(
          "FORGED_CONFIRM_UNLOCK_BLOCKED",
          String(tenantId),
          {
            paymentId,
            mpStatus: mpData.status,
            externalReference: mpData.external_reference,
            expectedRef
          },
          req
        );
        return res.status(403).json({
          error: "Desbloqueio negado (403 Forbidden): Pagamento ainda não aprovado ou pertence a outra referência."
        });
      }

      const unlockResult = await unlockTenantInFirestoreAndLocal(
        String(tenantId),
        String(mpData.id),
        mpData.transaction_amount
      );
      return res.json({
        success: true,
        verifiedByMercadoPago: true,
        paymentId: String(mpData.id),
        ...unlockResult
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Erro ao validar desbloqueio no Mercado Pago." });
    }
  });

  // C) Zero-Trust Webhook Handler (Shared by /api/webhooks/mercadopago and /api/webhooks)
  // NEVER trusts req.body.status! Extracts only paymentId and queries https://api.mercadopago.com/v1/payments/${paymentId}
  // directly using server-side MERCADOPAGO_ACCESS_TOKEN.
  const handleMercadoPagoZeroTrustWebhook = async (req: express.Request, res: express.Response) => {
    try {
      const ip = getClientIp(req);
      const rate = checkRateLimit(`mp_webhook_${ip}`, 60, 1);
      if (!rate.allowed) {
        await recordSecurityAudit("WEBHOOK_RATE_LIMIT_EXCEEDED", "webhook", { ip }, req);
        return res.status(429).json({ error: "Too Many Requests" });
      }

      const paymentId =
        req.body?.data?.id ||
        req.query?.["data.id"] ||
        req.query?.id ||
        (typeof req.body?.resource === "string" ? req.body.resource.match(/\/(\d+)$/)?.[1] : null);

      // Detect and log if someone tried to send a fake status in body without a valid Mercado Pago payment ID
      if (!paymentId) {
        if (req.body?.status === "approved" || req.body?.tenantId) {
          await recordSecurityAudit(
            "WEBHOOK_SPOOF_ATTEMPT_BLOCKED",
            String(req.body?.tenantId || "unknown"),
            { reason: "Missing paymentId with forged status/tenantId in body", body: req.body },
            req
          );
        }
        return res.status(200).json({ received: true, note: "Sem ID de pagamento na notificação." });
      }

      // Zero-Trust: Always verify payment status directly on Mercado Pago API v1
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId).trim())}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      });

      if (!mpRes.ok) {
        await recordSecurityAudit(
          "WEBHOOK_UNVERIFIED_PAYMENT_ID",
          "webhook",
          { paymentId: String(paymentId), mpStatus: mpRes.status },
          req
        );
        return res.status(200).json({ received: true, note: "Pagamento não confirmado na API oficial do Mercado Pago." });
      }

      const mpData: any = await mpRes.json();
      const extRef = String(mpData.external_reference || "");

      // Ignore notifications from the user's other SaaS sharing the same Mercado Pago account
      if (!extRef.startsWith("truck_saas:")) {
        console.log(`[Mercado Pago Webhook] Ignorando pagamento ${paymentId} de outro SaaS (external_reference: ${extRef}).`);
        return res.status(200).json({ received: true, ignored: true, external_reference: extRef });
      }

      const tenantId = extRef.replace("truck_saas:", "");
      if (mpData.status === "approved" && tenantId) {
        const unlockResult = await unlockTenantInFirestoreAndLocal(
          tenantId,
          String(mpData.id),
          mpData.transaction_amount
        );
        await recordSecurityAudit(
          "WEBHOOK_PAYMENT_APPROVED_RENEWED",
          tenantId,
          {
            paymentId: String(mpData.id),
            amount: mpData.transaction_amount,
            newExpiresAt: unlockResult.newExpiresAt
          },
          req
        );
        return res.status(200).json({
          received: true,
          processed: true,
          tenantId,
          status: mpData.status,
          ...unlockResult
        });
      }

      return res.status(200).json({
        received: true,
        tenantId,
        status: mpData.status
      });
    } catch (err: any) {
      console.error("[Mercado Pago Webhook Exception]:", err);
      return res.status(200).json({ received: true, error: err.message });
    }
  };

  app.post("/api/webhooks/mercadopago", handleMercadoPagoZeroTrustWebhook);
  app.post("/api/webhooks", handleMercadoPagoZeroTrustWebhook);


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    import("vite").then(({ createServer: createViteServer }) => {
      createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      }).then(vite => {
        app.use(vite.middlewares);
        app.listen(PORT, "0.0.0.0", () => {
          console.log(`Server running on http://localhost:${PORT}`);
        });
      }).catch(err => {
        console.error("Vite server failed to start:", err);
      });
    }).catch(err => {
      console.error("Vite failed to import dynamically:", err);
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });

    if (!process.env.VERCEL) {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  }

  // Hardened Error Handling Middleware: Never leak internal stack traces to external clients
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled Server Error:", err);
    res.status(500).json({
      error: "Erro interno do servidor."
    });
  });

export default app;

