const MERCADOPAGO_ACCESS_TOKEN =
  process.env.MERCADOPAGO_ACCESS_TOKEN ||
  "APP_USR-8095889170603631-092923-59bc02bdb3dedbba22bc6ce75430395f-313512785";

const DEFAULT_FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0831890855";
const DEFAULT_FIRESTORE_DB_ID =
  process.env.FIREBASE_DATABASE_ID || "ai-studio-2021bb5c-0c47-4834-b43b-47bc171dd353";
const DEFAULT_FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "";

const getBrazilTodayIso = (): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    const brTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
    return brTime.toISOString().split("T")[0];
  }
};

const computeNext30DaysExpiration = (currentExpiresAt?: string): string => {
  const todayIso = getBrazilTodayIso();
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
      day: "2-digit",
    }).format(nextDate);
  } catch {
    return nextDate.toISOString().split("T")[0];
  }
};

const toFirestoreValue = (val: any): any => {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === "object") {
    const fields: Record<string, any> = {};
    for (const k of Object.keys(val)) {
      if (val[k] !== undefined) {
        fields[k] = toFirestoreValue(val[k]);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
};

const fromFirestoreValue = (field: any): any => {
  if (!field || typeof field !== "object") return null;
  if ("nullValue" in field) return null;
  if ("booleanValue" in field) return Boolean(field.booleanValue);
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("stringValue" in field) return String(field.stringValue);
  if ("arrayValue" in field) {
    const vals = field.arrayValue?.values;
    return Array.isArray(vals) ? vals.map(fromFirestoreValue) : [];
  }
  if ("mapValue" in field) {
    const f = field.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const k of Object.keys(f)) {
      out[k] = fromFirestoreValue(f[k]);
    }
    return out;
  }
  return null;
};

const unlockTenantInFirestore = async (
  tenantId: string,
  paymentId: string,
  paidAmount?: number
): Promise<{ unlocked: boolean; alreadyProcessed?: boolean; newExpiresAt?: string }> => {
  let resultUnlocked = false;
  let newExpiresAt = "";

  const applyUnlockToCompany = (comp: any) => {
    if (comp.lastApprovedPaymentId && String(comp.lastApprovedPaymentId) === String(paymentId)) {
      newExpiresAt = comp.planExpiresAt || comp.dataVencimento || computeNext30DaysExpiration();
      comp.planStatus = "active";
      comp.isActive = true;
      comp.status = "ativo";
      comp.pago = true;
      return false;
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

  try {
    const projId = DEFAULT_FIREBASE_PROJECT_ID;
    const dbId = DEFAULT_FIRESTORE_DB_ID;
    const apiKey = DEFAULT_FIREBASE_API_KEY;
    const keyQuery = apiKey ? `?key=${apiKey}` : "";
    const keySuffix = apiKey ? `&key=${apiKey}` : "";

    const docUrl = `https://firestore.googleapis.com/v1/projects/${projId}/databases/${dbId}/documents/system_state/gbfleet_db`;
    const getRes = await fetch(`${docUrl}${keyQuery}`);
    if (getRes.ok) {
      const docJson: any = await getRes.json();
      const companiesField = docJson?.fields?.companies;
      if (companiesField) {
        const companiesArr: any[] = fromFirestoreValue(companiesField) || [];
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
                  _writeTimestamp: toFirestoreValue(Date.now()),
                },
              };

              const patchRes = await fetch(`${docUrl}?${patchParams.toString()}${keySuffix}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patchBody),
              });
              if (patchRes.ok) {
                resultUnlocked = true;
              }

              // Sync fast 2KB auth index as well
              try {
                const idxUrl = `https://firestore.googleapis.com/v1/projects/${projId}/databases/${dbId}/documents/system_state/gbfleet_auth_index`;
                const idxPatchParams = new URLSearchParams();
                idxPatchParams.append("updateMask.fieldPaths", "companies");
                idxPatchParams.append("updateMask.fieldPaths", "updatedAt");
                await fetch(`${idxUrl}?${idxPatchParams.toString()}${keySuffix}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    fields: {
                      companies: toFirestoreValue(companiesArr),
                      updatedAt: toFirestoreValue(Date.now()),
                    },
                  }),
                });
              } catch {}
            } else {
              resultUnlocked = true;
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.warn("[Vercel MP Unlock Warning]:", err?.message);
  }

  return { unlocked: resultUnlocked, newExpiresAt };
};

const parseRequestBody = async (req: any): Promise<any> => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on?.("data", (chunk: any) => {
      raw += chunk;
    });
    req.on?.("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on?.("error", () => resolve({}));
  });
};

export default async function handler(req: any, res: any) {
  const origin = req.headers?.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-user-id, x-impersonate-company-id, Authorization"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const rawUrl = String(req.url || "");
  const urlObj = new URL(rawUrl, "https://localhost");
  const rewrittenSubpath =
    (req.query && req.query.__path) || urlObj.searchParams.get("__path") || "";
  const cleanPath = rewrittenSubpath
    ? `/api/${String(rewrittenSubpath).replace(/^\/+/, "")}`.split("?")[0]
    : rawUrl.split("?")[0];
  const method = String(req.method || "GET").toUpperCase();

  try {
    // 1) POST /api/saas/payment/create-charge
    if (cleanPath.endsWith("/api/saas/payment/create-charge") && method === "POST") {
      const body = await parseRequestBody(req);
      const { tenantId, tenantName, ownerEmail, ownerCpfCnpj, planName, amount } = body || {};

      if (!tenantId) {
        return res.status(400).json({ error: "Identificador da empresa (tenantId) é obrigatório." });
      }

      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: "Valor da cobrança inválido." });
      }

      const FALLBACK_VALID_CPF = "39053344705";
      const rawDoc = String(ownerCpfCnpj || "").replace(/\D/g, "");
      const hasValidLength = rawDoc.length === 11 || rawDoc.length === 14;
      const isAllSameDigits = /^(\d)\1+$/.test(rawDoc);
      const cleanDoc = hasValidLength && !isAllSameDigits ? rawDoc : FALLBACK_VALID_CPF;
      const docType = cleanDoc.length === 14 ? "CNPJ" : "CPF";

      const cleanTenantAlnum =
        String(tenantId).replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "empresa";
      const fallbackEmail = `financeiro.${cleanTenantAlnum}@gbfleet.com.br`;
      const rawEmailCandidate = String(ownerEmail || "").trim().toLowerCase();
      const strictEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]{2,})+$/;
      const cleanEmail =
        strictEmailRegex.test(rawEmailCandidate) && !rawEmailCandidate.endsWith(".local")
          ? rawEmailCandidate
          : fallbackEmail;

      const proto = String(req.headers?.["x-forwarded-proto"] || "https")
        .split(",")[0]
        .trim();
      const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "")
        .split(",")[0]
        .trim();
      const baseOrigin = host ? `${proto}://${host}` : "";
      const isPublicHttps =
        baseOrigin.startsWith("https://") &&
        !baseOrigin.includes("localhost") &&
        !baseOrigin.includes("127.0.0.1");

      const cleanFirstName =
        String(tenantName || "Cliente GBFleet")
          .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
          .trim()
          .slice(0, 60) || "Cliente";

      const buildMpPayload = (
        identificationType: string,
        identificationNumber: string,
        payerEmail: string,
        payerFirstName: string
      ) => {
        const payload: any = {
          transaction_amount: Number(numericAmount.toFixed(2)),
          description: `Assinatura SaaS Gestão de Caminhões - ${planName || "Plano Frota"} (${tenantName || tenantId})`,
          payment_method_id: "pix",
          payer: {
            email: payerEmail,
            first_name: payerFirstName,
            last_name: "Frota",
            identification: {
              type: identificationType,
              number: identificationNumber,
            },
          },
          external_reference: `truck_saas:${tenantId}`,
        };

        if (isPublicHttps) {
          payload.notification_url = `${baseOrigin}/api/webhooks/mercadopago`;
        }
        return payload;
      };

      const sendMpCreateRequest = async (
        idType: string,
        idNumber: string,
        payerEmail: string,
        payerFirstName: string
      ) => {
        const randomStr = Math.random().toString(36).substring(2, 10);
        const idempotencyKey = `mp_truck_${tenantId}_${Date.now()}_${randomStr}`;
        return fetch("https://api.mercadopago.com/v1/payments", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(buildMpPayload(idType, idNumber, payerEmail, payerFirstName)),
        });
      };

      let mpRes = await sendMpCreateRequest(docType, cleanDoc, cleanEmail, cleanFirstName);
      let mpData: any = await mpRes.json().catch(() => ({}));

      if (!mpRes.ok) {
        const safeRetryEmail = `pagamentos.${cleanTenantAlnum}.${Date.now().toString().slice(-4)}@gbfleet.com.br`;
        mpRes = await sendMpCreateRequest("CPF", FALLBACK_VALID_CPF, safeRetryEmail, "Cliente");
        mpData = await mpRes.json().catch(() => ({}));
      }

      if (!mpRes.ok) {
        return res.status(mpRes.status || 400).json({
          error: mpData?.message || "Falha ao gerar cobrança PIX no Mercado Pago.",
        });
      }

      const txData = mpData?.point_of_interaction?.transaction_data || {};
      return res.status(200).json({
        paymentId: String(mpData.id),
        status: mpData.status,
        statusDetail: mpData.status_detail,
        qrCode: txData.qr_code || "",
        qrCodeBase64: txData.qr_code_base64 || "",
        ticketUrl: txData.ticket_url || "",
        expiresAt: mpData.date_of_expiration || null,
        amount: mpData.transaction_amount,
        externalReference: mpData.external_reference,
      });
    }

    // 2) GET /api/saas/payment/check-status/:paymentId
    if (cleanPath.includes("/api/saas/payment/check-status/") && method === "GET") {
      const parts = cleanPath.split("/");
      const paymentId = String(parts[parts.length - 1] || "").trim();
      if (!paymentId || !/^\d+$/.test(paymentId)) {
        return res.status(400).json({ error: "paymentId numérico válido é obrigatório." });
      }

      const mpRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      const mpData: any = await mpRes.json().catch(() => ({}));
      if (!mpRes.ok) {
        return res.status(mpRes.status || 400).json({
          error: mpData?.message || "Não foi possível consultar o status do pagamento.",
        });
      }

      const extRef = String(mpData.external_reference || "");
      const isTruckSaas = extRef.startsWith("truck_saas:");
      const tenantId = isTruckSaas ? extRef.replace("truck_saas:", "") : null;

      let unlockResult: any = null;
      if (isTruckSaas && tenantId && mpData.status === "approved") {
        unlockResult = await unlockTenantInFirestore(
          tenantId,
          String(mpData.id),
          mpData.transaction_amount
        );
      }

      return res.status(200).json({
        id: String(mpData.id),
        status: mpData.status,
        status_detail: mpData.status_detail,
        external_reference: extRef,
        tenantId,
        isTruckSaas,
        transaction_amount: mpData.transaction_amount,
        date_approved: mpData.date_approved,
        unlocked: unlockResult?.unlocked || false,
        newExpiresAt: unlockResult?.newExpiresAt || null,
      });
    }

    // 2.5) GET /api/saas/payment/reconcile/:tenantId
    if (cleanPath.includes("/api/saas/payment/reconcile/") && method === "GET") {
      const parts = cleanPath.split("/");
      const tenantId = String(parts[parts.length - 1] || "").trim();
      if (!tenantId) {
        return res.status(400).json({ error: "tenantId é obrigatório." });
      }

      const extRef = `truck_saas:${tenantId}`;
      const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(extRef)}&status=approved&sort=date_approved&criteria=desc&limit=3`;
      const mpRes = await fetch(searchUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      });

      if (!mpRes.ok) {
        return res.status(200).json({ reconciled: false, status: "none" });
      }

      const searchData: any = await mpRes.json().catch(() => ({}));
      const results: any[] = Array.isArray(searchData?.results) ? searchData.results : [];
      const latestApproved = results.find(
        (p: any) => p && p.status === "approved" && String(p.external_reference) === extRef
      );

      if (!latestApproved) {
        return res.status(200).json({ reconciled: false, status: "none" });
      }

      const approvedAtMs = latestApproved.date_approved
        ? new Date(latestApproved.date_approved).getTime()
        : Date.now();
      if (Date.now() - approvedAtMs > 7 * 24 * 60 * 60 * 1000) {
        return res.status(200).json({ reconciled: false, status: "expired_window" });
      }

      const unlockResult = await unlockTenantInFirestore(
        tenantId,
        String(latestApproved.id),
        latestApproved.transaction_amount
      );

      return res.status(200).json({
        reconciled: Boolean(unlockResult.unlocked && !unlockResult.alreadyProcessed),
        alreadyProcessed: Boolean(unlockResult.alreadyProcessed),
        status: "approved",
        paymentId: String(latestApproved.id),
        amount: latestApproved.transaction_amount,
        date_approved: latestApproved.date_approved,
        newExpiresAt: unlockResult.newExpiresAt || null,
      });
    }

    // 3) POST /api/saas/payment/confirm-unlock
    if (cleanPath.endsWith("/api/saas/payment/confirm-unlock") && method === "POST") {
      const body = await parseRequestBody(req);
      const { tenantId, paymentId } = body || {};
      if (!tenantId || !paymentId || !/^\d+$/.test(String(paymentId).trim())) {
        return res.status(403).json({
          error: "Desbloqueio negado: ID de pagamento inválido.",
        });
      }

      const mpRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId).trim())}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!mpRes.ok) {
        return res.status(403).json({
          error: "Pagamento não encontrado na API oficial do Mercado Pago.",
        });
      }

      const mpData: any = await mpRes.json().catch(() => ({}));
      const expectedRef = `truck_saas:${tenantId}`;
      if (mpData.status !== "approved" || mpData.external_reference !== expectedRef) {
        return res.status(403).json({
          error: "Pagamento ainda não consta como aprovado no Mercado Pago.",
        });
      }

      const result = await unlockTenantInFirestore(
        String(tenantId),
        String(mpData.id),
        mpData.transaction_amount
      );
      return res.status(200).json({
        success: true,
        unlocked: result.unlocked,
        newExpiresAt: result.newExpiresAt,
      });
    }

    // 4) POST /api/webhooks/mercadopago & /api/webhooks
    if (
      (cleanPath.endsWith("/api/webhooks/mercadopago") || cleanPath.endsWith("/api/webhooks")) &&
      method === "POST"
    ) {
      const body = await parseRequestBody(req);
      const urlObj = new URL(rawUrl, "https://localhost");
      const paymentId =
        body?.data?.id ||
        body?.id ||
        urlObj.searchParams.get("data.id") ||
        urlObj.searchParams.get("id");

      if (!paymentId || !/^\d+$/.test(String(paymentId).trim())) {
        return res.status(200).json({ received: true, ignored: true });
      }

      const mpRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId).trim())}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!mpRes.ok) {
        return res.status(200).json({ received: true });
      }

      const mpData: any = await mpRes.json().catch(() => ({}));
      const extRef = String(mpData.external_reference || "");
      if (!extRef.startsWith("truck_saas:")) {
        return res.status(200).json({ received: true, ignored: true });
      }

      const tenantId = extRef.replace("truck_saas:", "");
      if (mpData.status === "approved" && tenantId) {
        const unlockRes = await unlockTenantInFirestore(
          tenantId,
          String(mpData.id),
          mpData.transaction_amount
        );
        return res.status(200).json({
          received: true,
          unlocked: unlockRes.unlocked,
          tenantId,
          newExpiresAt: unlockRes.newExpiresAt,
        });
      }

      return res.status(200).json({ received: true, status: mpData.status });
    }

    // 5) GET /api/health
    if (cleanPath.endsWith("/api/health")) {
      return res.status(200).json({ status: "ok", serverless: true });
    }

    return res.status(404).json({ error: "Endpoint não encontrado na função Serverless." });
  } catch (err: any) {
    console.error("[Vercel API Error]:", err);
    return res.status(500).json({ error: err?.message || "Erro interno na função Serverless." });
  }
}

