import express from "express";
import path from "path";
import fs from "fs";
import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
let firestoreDb: any = null;
let firestoreDatabaseId: string | undefined = undefined;
try {
  let projectId = process.env.FIREBASE_PROJECT_ID;
  firestoreDatabaseId = process.env.FIREBASE_DATABASE_ID;

  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
    if (config.projectId) {
      projectId = config.projectId;
      firestoreDatabaseId = config.firestoreDatabaseId;
    }
  }

  if (projectId) {
    let canInitialize = true;

    // Em ambiente Vercel Serverless, se não houver FIREBASE_SERVICE_ACCOUNT nas variáveis de ambiente,
    // não temos credenciais para acessar o Firestore externo. Nesse caso, pulamos para evitar crash ADC/timeouts.
    if (isVercel && !process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.warn("[Firebase] Ambiente Vercel sem FIREBASE_SERVICE_ACCOUNT detectado. Desativando Firestore remoto para evitar erros ADC ou travamentos.");
      canInitialize = false;
    }

    if (canInitialize) {
      const appConfig: any = { projectId };
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
              // Limpa quebras reais que podem desformatar o JSON no Vercel
              const sanitized = saStr.replace(/[\r\n]+/g, " ");
              serviceAccount = JSON.parse(sanitized);
            } catch (jsonErr2: any) {
              console.error("[Firebase Error] Falha de parse JSON absoluta na conta de serviço:", jsonErr2.message);
              throw jsonErr2;
            }
          }

          // Trata a chave privada substituindo os caracteres '\n' por quebras de linha reais APÓS o parsing JSON com sucesso
          if (serviceAccount && serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
          }
          
          appConfig.credential = cert(serviceAccount);
          credentialLoaded = true;

          // Crucial: O ID do projeto na credencial deve reescrever o ID do config padrão para evitar erros de mismatch de autenticação
          if (serviceAccount.project_id) {
            appConfig.projectId = serviceAccount.project_id;
            console.log(`[Firebase] ID do Projeto atualizado da conta de serviço para evitar incompatibilidade: ${appConfig.projectId}`);
          }

          console.log("[Firebase] Carregada conta de serviço via FIREBASE_SERVICE_ACCOUNT para autenticação.");
        } catch (saErr: any) {
          console.error("[Firebase] Ignorando FIREBASE_SERVICE_ACCOUNT devido a um erro de parsing/leitura:", saErr.message);
        }
      }

      // Se no ambiente Vercel não conseguimos carregar as credenciais explicitamente,
      // cancelamos a inicialização para evitar que o SDK tente buscar credenciais implícitas (ADC)
      // do Google Cloud Metadata Service, o que causaria um timeout eterno (travando as requisições com 500).
      if (isVercel && !credentialLoaded) {
        console.warn("[Firebase] Erro de parsing ou credenciais vazias na Vercel. Desativando Firestore remoto preventivamente para evitar congelamentos de timeout ADC / erro 500.");
        firestoreDb = null;
      } else {
        const appInstance = getApps().length === 0
          ? initializeApp(appConfig)
          : getApp();
          
        try {
          if (firestoreDatabaseId && firestoreDatabaseId !== "(default)") {
            firestoreDb = getFirestore(appInstance, firestoreDatabaseId);
          } else {
            firestoreDb = getFirestore(appInstance);
          }
          console.log(`[Firebase] Conectado ao Firestore com sucesso! (DatabaseId: ${firestoreDatabaseId || "(default)"})`);
        } catch (dbErr: any) {
          console.warn(`[Firebase] Falha ao obter banco com ID personalizado '${firestoreDatabaseId}', tentando banco padrão:`, dbErr.message);
          try {
            firestoreDb = getFirestore(appInstance);
          } catch (stdDbErr: any) {
            console.error("[Firebase] Falha total ao conectar ao Firestore padrão:", stdDbErr.message);
            firestoreDb = null;
          }
        }
      }
    }
  }
} catch (err: any) {
  console.error("[Firebase] Falha crítica ao inicializar o Firebase Admin SDK:", err.message);
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
    "Diesel (Abastecimento)",
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
  chat_logs: []
});

// Middleware to ensure Database is Synced from Firebase before serving any requests
// Middleware to ensure Database is Synced from Firebase before serving any requests
let lastSyncTime = 0;
const SYNC_TTL_MS = 5000; // 5 segundos de cache local no servidor
let activeSyncPromise: Promise<void> | null = null;

const ensureDBSynced = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const now = Date.now();

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

  // Se o Firestore estiver ativo e o cache expirou, inicia sincronização
  if (firestoreDb && (now - lastSyncTime > SYNC_TTL_MS)) {
    if (!activeSyncPromise) {
      activeSyncPromise = (async () => {
        try {
          console.log("[Firebase] Cache expirado ou primeira execução. Sincronizando com Firestore remoto...");
          const docRef = firestoreDb.collection("system_state").doc("gbfleet_db");

          const safePromise = <T>(p: Promise<T>): Promise<T> => {
            p.catch((err) => console.log("[Firestore Background] Operação preventiva de rejeição:", err.message));
            return p;
          };

          // Timeout de 2.5s para não travar respostas da API
          const docSnap = await Promise.race([
            safePromise(docRef.get()),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout de 2.5s ao obter dados do Firestore")), 2500))
          ]) as any;

          if (docSnap.exists) {
            let remoteData = docSnap.data();
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
              const arrayKeys = ["trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes"];
              arrayKeys.forEach(key => {
                if (remoteData[key] && remoteData[key].some((item: any) => item.companyId === "comp_1" || item.id?.includes("init"))) {
                  remoteData[key] = remoteData[key].filter((item: any) => item.companyId !== "comp_1" && !item.id?.includes("init"));
                  scrubbed = true;
                }
              });

              if (scrubbed) {
                console.log("[Firebase] Expurgo de dados de demonstração efetuado no Firestore!");
                await Promise.race([
                  safePromise(docRef.set(remoteData)),
                  new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout ao salvar dados expurgados")), 2500))
                ]);
              }

              fs.writeFileSync(DB_FILE, JSON.stringify(remoteData, null, 2));
              console.log("[Firebase] Sincronização concluída. Cache local /tmp/db.json atualizado.");
              lastSyncTime = Date.now();
            }
          } else {
            // Se o documento no Firestore não existir, criamos a partir do local
            const localData = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
            await Promise.race([
              safePromise(docRef.set(localData)),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout ao salvar dados iniciais no Firestore")), 2500))
            ]);
            console.log("[Firebase] Documento criado no Firestore.");
            lastSyncTime = Date.now();
          }
        } catch (err: any) {
          console.error("[Firebase] Erro ou timeout na sincronização do Firestore:", err.message);
          
          // Se for erro de banco de dados não encontrado (mismatch de databaseId), tentamos fazer fallback para o banco padrão "(default)"
          if (firestoreDb && firestoreDatabaseId && firestoreDatabaseId !== "(default)" && 
              (err.message?.toLowerCase().includes("database") || err.message?.toLowerCase().includes("not_found") || err.message?.toLowerCase().includes("not found"))) {
            console.warn("[Firebase] Detectada possível incompatibilidade de ID de banco de dados. Tentando fallback para banco de dados '(default)'...");
            try {
              firestoreDatabaseId = "(default)";
              firestoreDb = getFirestore(getApps()[0]);
              // Tenta sincronizar de novo immediatamente com o novo firestoreDb
              const retryDocRef = firestoreDb.collection("system_state").doc("gbfleet_db");
              const retrySnap = await retryDocRef.get();
              if (retrySnap.exists) {
                const remoteData = retrySnap.data();
                if (remoteData) {
                  fs.writeFileSync(DB_FILE, JSON.stringify(remoteData, null, 2));
                  console.log("[Firebase Fallback] Recuperado com sucesso usando o banco '(default)'.");
                  lastSyncTime = Date.now();
                }
              }
            } catch (fallbackErr: any) {
              console.error("[Firebase Fallback] Falha no fallback ao conectar com banco padrão:", fallbackErr.message);
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
      await activeSyncPromise;
    }
  }

  next();
};

app.use(ensureDBSynced);

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

    const keys = ["companies", "users", "trucks", "drivers", "fuel_logs", "expenses", "cash_flow", "freights", "maintenance_alerts", "routes", "chat_logs"];
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
        "Diesel (Abastecimento)",
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
    if (firestoreDb) {
      lastWritePromise = firestoreDb.collection("system_state").doc("gbfleet_db").set(data)
        .then(() => {
          console.log("[Firebase] Banco de dados salvo com sucesso no Firestore remoto.");
        })
        .catch((err: any) => {
          console.error("[Firebase] Erro ao persistir dados no Firestore:", err.message);
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

  // API Authentication and Multi-tenant Context Middleware
  app.use((req, res, next) => {
    // Skip verification for login or reset demo or non-API routes
    if (req.path === "/api/auth/login" || req.path === "/api/auth/register" || req.path === "/api/reset" || !req.path.startsWith("/api/")) {
      return next();
    }

    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }

    const db = readDB();
    const user = db.users.find((u: any) => u.id === userId);
    if (!user) {
      return res.status(401).json({ error: "Usuário inválido ou excluído." });
    }

    (req as any).user = user;

    // Support Context Switching / Impersonation for Superadmin users
    if (user.role === "superadmin") {
      const impersonatedCompId = req.headers["x-impersonate-company-id"] as string;
      if (impersonatedCompId && impersonatedCompId !== "comp_superadmin") {
        // Enforce support code authorization if changing tenant (unless it is comp_1 for demo/debugging/previews)
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
      (req as any).companyId = user.companyId;
    }

    next();
  });

  // Health and general diagnostics endpoint for Vercel & server checkups
  app.get("/api/health", (req, res) => {
    try {
      const dbExists = fs.existsSync(DB_FILE);
      let dbSize = 0;
      let dbSample = "";
      if (dbExists) {
        const stat = fs.statSync(DB_FILE);
        dbSize = stat.size;
        const text = fs.readFileSync(DB_FILE, "utf-8");
        dbSample = text.substring(0, 150);
      }
      res.json({
        status: "ok",
        env: {
          VERCEL: process.env.VERCEL,
          isVercel,
          DB_FILE,
          dbExists,
          dbSize,
          dbSample
        },
        firebase: {
          projectId: process.env.FIREBASE_PROJECT_ID || "not set",
          hasConfigJson: fs.existsSync(path.join(process.cwd(), "firebase-applet-config.json")),
          initialized: !!firestoreDb
        }
      });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message, stack: e.stack });
    }
  });

  // Login Endpoint (No signup, direct login only as per user instructions)
  app.post("/api/auth/login", (req, res) => {
    try {
      const db = readDB();
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
      }

      const emailStr = String(email).toLowerCase().trim();
      const passwordStr = String(password);

      const user = db.users.find((u: any) => u.email?.toLowerCase() === emailStr);
      if (!user) {
        return res.status(401).json({ error: "E-mail ou senha incorretos." });
      }

      const correctPassword = String(user.password || "demo");
      if (correctPassword !== passwordStr) {
        return res.status(401).json({ error: "E-mail ou senha incorretos." });
      }

      const company = db.companies.find((c: any) => c.id === user.companyId) || { id: user.companyId, nome: "GBFleet Demo" };
      res.json({ success: true, user, company });
    } catch (routeErr: any) {
      console.error("[Login Route Error] Falha ao processar o login:", routeErr);
      res.status(500).json({
        error: "Erro interno do servidor ao tentar processar o login.",
        message: routeErr.message,
        stack: routeErr.stack
      });
    }
  });

  // Registration Endpoint (SaaS tenant signup)
  app.post("/api/auth/register", (req, res) => {
    try {
      const db = readDB();
      const { nome, email, companyName, password } = req.body;

      if (!nome || !email || !companyName || !password) {
        return res.status(400).json({ error: "Todos os campos (Nome, E-mail, Empresa e Senha) são obrigatórios para cadastro." });
      }

      const emailStr = String(email).toLowerCase().trim();
      const passwordStr = String(password);
      const companyNameStr = String(companyName).trim();
      const nomeStr = String(nome).trim();

      // Check if user already exists
      const userExists = db.users.some((u: any) => u.email?.toLowerCase() === emailStr);
      if (userExists) {
        return res.status(400).json({ error: "Este endereço de e-mail já está cadastrado por outro usuário." });
      }

      // Create unique IDs
      const companyId = `comp_${Date.now()}`;
      const userId = `user_${Date.now()}`;

      // Create new tenant/company
      const company = {
        id: companyId,
        nome: companyNameStr,
        plano: "Pro (Grátis 30d)",
        status: "ativo",
        pago: true, // Auto active during trial
        trialDays: 30,
        createdAt: new Date().toISOString(),
        supportCode: null,
        supportCodeCreatedAt: null,
        supportAuthorizedUntil: null
      };

      // Create new user (Role admin)
      const user = {
        id: userId,
        companyId: companyId,
        nome: nomeStr,
        email: emailStr,
        password: passwordStr,
        role: "admin"
      };

      // Push to DB
      db.companies.push(company);
      db.users.push(user);

      // Persist changes
      writeDB(db);

      res.json({ success: true, user, company });
    } catch (routeErr: any) {
      console.error("[Register Route Error] Falha ao cadastrar nova empresa/usuário:", routeErr);
      res.status(500).json({
        error: "Erro interno do servidor ao tentar processar o cadastro.",
        message: routeErr.message,
        stack: routeErr.stack
      });
    }
  });

  // Update Profile Endpoint
  app.put("/api/auth/profile", (req, res) => {
    const db = readDB();
    const userContext = (req as any).user;
    if (!userContext) {
      return res.status(401).json({ error: "Sessão expirada." });
    }

    const { nome, email, password } = req.body;
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

    writeDB(db);
    res.json({ success: true, user: dbUser });
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

    // Resolve custom tenant isolated categories or fallback to general default
    const categoriesEntrada = currentCompany?.categories_entrada || db.categories_entrada || [
      "Faturamento de Frete",
      "Aporte de Capital",
      "Estadia de Viagem",
      "Reembolso de Despesas",
      "Outros Recebíveis"
    ];

    const categoriesSaida = currentCompany?.categories_saida || db.categories_saida || [
      "Diesel (Abastecimento)",
      "Pedágios",
      "Manutenção e Peças",
      "Motorista (Diária/Comissão)",
      "Pneus",
      "Seguros & Rastreamento",
      "Administrativo & Escritório",
      "Impostos/Licenciamento",
      "Outras Despesas"
    ];

    res.json({
      currentUser: user,
      company: currentCompany,
      companies: user.role === "superadmin" ? db.companies.filter((c: any) => c.id !== "comp_superadmin") : undefined,
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

    const { nome, plano, adminNome, adminEmail, adminPassword } = req.body;
    if (!nome || !adminNome || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }

    const db = readDB();

    if (db.users.some((u: any) => u.email?.toLowerCase() === adminEmail.toLowerCase().trim())) {
      return res.status(400).json({ error: "Este e-mail já está cadastrado no sistema." });
    }

    const newCompanyId = `comp_${Date.now()}`;
    const newCompany = {
      id: newCompanyId,
      nome,
      plano: plano || "Pro",
      createdAt: new Date().toISOString(),
      status: "ativo",
      pago: false,
      trialDays: 30,
      supportCode: null,
      supportCodeCreatedAt: null,
      supportAuthorizedUntil: null,
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
    const { plano, nome, status, pago, trialDays, createdAt, adminNome, adminEmail, adminPassword } = req.body;

    const db = readDB();
    const idx = db.companies.findIndex((c: any) => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Empresa não encontrada." });
    }

    if (plano !== undefined) db.companies[idx].plano = plano;
    if (nome !== undefined) db.companies[idx].nome = nome;
    if (status !== undefined) db.companies[idx].status = status;
    if (pago !== undefined) db.companies[idx].pago = !!pago;
    if (trialDays !== undefined) db.companies[idx].trialDays = Number(trialDays);
    if (createdAt !== undefined) db.companies[idx].createdAt = createdAt;

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

  app.post("/api/reset", (req, res) => {
    const initialData = getInitialData();
    writeDB(initialData);
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
    
    // Also add to cash flow as 'saida'
    db.cash_flow.push({
      id: `cash_${Date.now()}`,
      companyId: companyId,
      tipo: 'saida',
      valor: parseFloat(newLog.valor || 0),
      data: newLog.data,
      descricao: `Abastecimento: ${newLog.truckId} (${newLog.litros}L)`
    });

    writeDB(db);
    res.json(newLog);
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

  app.post("/api/trucks", (req, res) => {
    const db = readDB();
    const companyId = (req as any).companyId;
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
      if (fuelLogsForTruck.length > 0) {
        const sortedLogs = [...fuelLogsForTruck].sort((a: any, b: any) => b.km - a.km);
        latestKm = sortedLogs[0].km + Math.floor(Math.random() * 350) + 150;
      }

      db.fuel_logs.push({
        id: `fuel_sync_${freight.id}`,
        companyId: freight.companyId,
        truckId: freight.truckId,
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
      outrasDespesas: parseFloat(req.body.outrasDespesas || 0)
    };
    db.freights.push(newFreight);

    syncFreightData(db, newFreight);

    writeDB(db);
    res.json(newFreight);
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

  // Global Error Handling Middleware to surface the exact stack trace of 500 errors to the client
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled Server Error:", err);
    res.status(500).json({
      error: err.message || "Erro interno do servidor.",
      stack: err.stack,
      hint: "Consulte o console do servidor para obter mais informações."
    });
  });

export default app;
