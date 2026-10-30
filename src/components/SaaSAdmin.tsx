import React, { useState, useEffect } from "react";
import { 
  Building, 
  Plus, 
  Trash2, 
  ShieldAlert, 
  Check, 
  ExternalLink, 
  Users, 
  Truck, 
  X,
  CreditCard,
  CircleCheck,
  Loader2,
  QrCode,
  Copy,
  RefreshCw,
  Lock,
  Unlock,
  CalendarPlus,
  MessageCircle,
  Sparkles,
  Clock,
  AlertTriangle
} from "lucide-react";
import { cn } from "../lib/utils";
import { showToast } from "./ui/Toast";

interface CompanyMeta {
  id: string;
  nome: string;
  plano: string;
  planName?: string;
  planStatus?: "active" | "trial" | "suspended" | "canceled";
  isActive?: boolean;
  planExpiresAt?: string;
  createdAt: string;
  truckCount: number;
  driverCount: number;
  freightCount: number;
  userCount: number;
  balance: number;
  status: string;
  pago: boolean;
  trialDays: number;
  trialEndDate?: string;
  dueDateDay?: number;
  gracePeriodDays?: number;
  daysRemaining: number;
  daysUntilExpiration?: number;
  isPastGracePeriod?: boolean;
  isBlocked?: boolean;
  isExpiringWarning?: boolean;
  licenseBadge?: "active" | "trial" | "expiring" | "expired" | "suspended";
  supportCode: string | null;
  dataVencimento?: string;
  limiteCaminhoes?: number;
  valorPorCaminhao?: number;
  valorMensalidade?: number;
  planPrice?: number;
  monthlyFeeOverride?: number;
  promoEnabled?: boolean;
  promoFirstPaymentAmount?: number;
  effectiveChargeAmount?: number;
  cnpjCpf?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  adminUser?: {
    id: string;
    nome: string;
    email: string;
  } | null;
}

interface PixChargeData {
  paymentId: string;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expiresAt: string | null;
  amount: number;
  externalReference: string;
}

interface SaaSAdminProps {
  currentUserId: string;
  onImpersonate: (companyId: string) => void;
  activeImpersonatedId: string | null;
}

export default function SaaSAdmin({ currentUserId, onImpersonate, activeImpersonatedId }: SaaSAdminProps) {
  const [companies, setCompanies] = useState<CompanyMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create Company Modal State
  const [isSaving, setIsSaving] = useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [nome, setNome] = useState("");
  const [plano, setPlano] = useState("Pro");
  const [planName, setPlanName] = useState("Plano Transportadora Pro");
  const [planStatus, setPlanStatus] = useState<"active" | "trial" | "suspended" | "canceled">("trial");
  const [trialDays, setTrialDays] = useState<string>("15");
  const [planExpiresAt, setPlanExpiresAt] = useState<string>(() => {
    return new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0];
  });
  const [dueDateDay, setDueDateDay] = useState<string>("10");
  const [gracePeriodDays, setGracePeriodDays] = useState<string>("0");
  const [limiteCaminhoes, setLimiteCaminhoes] = useState<string>("10");
  const [valorPorCaminhao, setValorPorCaminhao] = useState<string>("30");
  const [planPrice, setPlanPrice] = useState<string>("300");
  const [promoEnabled, setPromoEnabled] = useState<boolean>(false);
  const [promoFirstPaymentAmount, setPromoFirstPaymentAmount] = useState<string>("");
  const [cnpjCpf, setCnpjCpf] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [adminNome, setAdminNome] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit Subscription Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyMeta | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editPlano, setEditPlano] = useState("Pro");
  const [editPlanName, setEditPlanName] = useState("Plano Transportadora Pro");
  const [editPlanStatus, setEditPlanStatus] = useState<"active" | "trial" | "suspended" | "canceled">("active");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editPago, setEditPago] = useState(false);
  const [editTrialDays, setEditTrialDays] = useState<string>("30");
  const [editTrialEndDate, setEditTrialEndDate] = useState("");
  const [editCreatedAt, setEditCreatedAt] = useState("");
  const [editPlanExpiresAt, setEditPlanExpiresAt] = useState("");
  const [editDueDateDay, setEditDueDateDay] = useState<string>("10");
  const [editGracePeriodDays, setEditGracePeriodDays] = useState<string>("0");
  const [editLimiteCaminhoes, setEditLimiteCaminhoes] = useState<string>("10");
  const [editValorPorCaminhao, setEditValorPorCaminhao] = useState<string>("30");
  const [editPlanPrice, setEditPlanPrice] = useState<string>("300");
  const [editPromoEnabled, setEditPromoEnabled] = useState(false);
  const [editPromoFirstPaymentAmount, setEditPromoFirstPaymentAmount] = useState<string>("");
  const [editCnpjCpf, setEditCnpjCpf] = useState("");
  const [editOwnerName, setEditOwnerName] = useState("");
  const [editOwnerEmail, setEditOwnerEmail] = useState("");
  const [editOwnerPhone, setEditOwnerPhone] = useState("");
  const [editAdminNome, setEditAdminNome] = useState("");
  const [editAdminEmail, setEditAdminEmail] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");

  // Mercado Pago PIX Modal State
  const [pixModalCompany, setPixModalCompany] = useState<CompanyMeta | null>(null);
  const [pixCharge, setPixCharge] = useState<PixChargeData | null>(null);
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [isCheckingPixStatus, setIsCheckingPixStatus] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [pixCustomAmount, setPixCustomAmount] = useState<string>("");

  const fetchCompanies = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/companies", {
        headers: {
          "x-user-id": currentUserId,
        },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Falha ao carregar empresas");
      }
      const data = await res.json();
      setCompanies(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Não foi possível carregar as empresas.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [currentUserId]);

  // Poll Mercado Pago payment status when PIX modal is open and pending
  useEffect(() => {
    if (!pixModalCompany || !pixCharge || pixCharge.status === "approved") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/saas/payment/check-status/${pixCharge.paymentId}`);
        if (!res.ok) return;
        const statusData = await res.json();
        if (statusData.status === "approved") {
          setPixCharge((prev) => (prev ? { ...prev, status: "approved" } : null));
          // Confirm unlock on client Firestore DB as well
          await fetch("/api/saas/payment/confirm-unlock", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": currentUserId,
            },
            body: JSON.stringify({
              tenantId: pixModalCompany.id,
              paymentId: pixCharge.paymentId,
              amount: pixCharge.amount,
            }),
          });
          showToast(`✓ Pagamento PIX de "${pixModalCompany.nome}" aprovado! Licença renovada por +30 dias.`, "success");
          fetchCompanies();
        }
      } catch (e) {
        // silent background poll
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [pixModalCompany, pixCharge, currentUserId]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !adminNome || !adminEmail || !adminPassword) {
      showToast("Preencha todos os campos obrigatórios da nova empresa.", "error");
      return;
    }

    if (isSaving) return;
    setIsSaving(true);

    try {
      const limNum = Number(limiteCaminhoes) || 10;
      const valCamNum = Number(valorPorCaminhao) || 30;
      const priceNum = Number(planPrice) || limNum * valCamNum;
      const trialNum = Number(trialDays) || 15;

      const res = await fetch("/api/superadmin/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUserId,
        },
        body: JSON.stringify({
          nome,
          plano,
          planName: planName || `Plano ${plano}`,
          planStatus,
          isActive: planStatus !== "suspended" && planStatus !== "canceled",
          pago: planStatus === "active",
          trialDays: trialNum,
          trialEndDate: planExpiresAt,
          planExpiresAt,
          dataVencimento: planExpiresAt,
          dueDateDay: Number(dueDateDay) || 10,
          gracePeriodDays: Number(gracePeriodDays) || 0,
          limiteCaminhoes: limNum,
          valorPorCaminhao: valCamNum,
          planPrice: priceNum,
          monthlyFeeOverride: priceNum,
          valorMensalidade: priceNum,
          promoEnabled,
          promoFirstPaymentAmount: Number(promoFirstPaymentAmount) || 0,
          cnpjCpf,
          ownerName: adminNome,
          ownerEmail: adminEmail,
          ownerPhone,
          adminNome,
          adminEmail,
          adminPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao cadastrar empresa.");
      }

      showToast("✓ Empresa e licenciamento configurados com sucesso!", "success");
      setSuccessMsg("Empresa, plano e licenciamento cadastrados com sucesso!");
      setNome("");
      setAdminNome("");
      setAdminEmail("");
      setAdminPassword("");
      setCnpjCpf("");
      setOwnerPhone("");
      setPromoEnabled(false);
      setPromoFirstPaymentAmount("");
      fetchCompanies();
      setTimeout(() => setSuccessMsg(null), 4000);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Erro ao criar empresa.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleCompanyStatus = async (company: CompanyMeta) => {
    if (actionLoadingId) return;
    setActionLoadingId(`toggle_${company.id}`);
    try {
      const res = await fetch(`/api/superadmin/companies/${company.id}/toggle-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUserId,
        },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Falha ao alterar status da empresa.");
      }
      const data = await res.json();
      const updated: CompanyMeta = data.company;
      showToast(
        updated.isBlocked
          ? `Empresa "${company.nome}" bloqueada/suspensa com sucesso.`
          : `✓ Empresa "${company.nome}" desbloqueada e liberada!`,
        updated.isBlocked ? "info" : "success"
      );
      if (selectedCompany && selectedCompany.id === company.id) {
        populateEditModalState(updated);
      }
      fetchCompanies();
    } catch (err: any) {
      showToast(err.message || "Erro ao bloquear/desbloquear empresa.", "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRenew30DaysManual = async (company: CompanyMeta) => {
    if (actionLoadingId) return;
    setActionLoadingId(`renew_${company.id}`);
    try {
      const res = await fetch(`/api/superadmin/companies/${company.id}/renew`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUserId,
        },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Falha ao renovar assinatura.");
      }
      const data = await res.json();
      const updated: CompanyMeta = data.company;
      const formattedDate = data.newExpiresAt
        ? new Date(data.newExpiresAt + "T12:00:00").toLocaleDateString("pt-BR")
        : "";
      showToast(`✓ Licença de "${company.nome}" renovada por +30 dias (Novo venc: ${formattedDate})!`, "success");
      if (selectedCompany && selectedCompany.id === company.id) {
        populateEditModalState(updated);
      }
      fetchCompanies();
    } catch (err: any) {
      showToast(err.message || "Erro ao renovar +30 dias.", "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenPixModal = async (company: CompanyMeta, customAmt?: number) => {
    setPixModalCompany(company);
    setPixCharge(null);
    setPixCopied(false);

    const defaultAmount =
      customAmt !== undefined
        ? customAmt
        : company.promoEnabled && (company.promoFirstPaymentAmount || 0) > 0
        ? Number(company.promoFirstPaymentAmount)
        : Number(company.planPrice || company.monthlyFeeOverride || company.valorMensalidade || 149.9);

    setPixCustomAmount(String(defaultAmount));
    await generatePixChargeForCompany(company, defaultAmount);
  };

  const generatePixChargeForCompany = async (company: CompanyMeta, amountToCharge: number) => {
    if (isNaN(amountToCharge) || amountToCharge <= 0) {
      showToast("Informe um valor válido maior que zero para gerar o PIX.", "error");
      return;
    }
    setIsGeneratingPix(true);
    setPixCopied(false);
    try {
      const cleanId = String(company.id || "empresa").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const rawEmail = String(company.ownerEmail || company.adminUser?.email || "").trim().toLowerCase();
      const validEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]{2,})+$/;
      const safeOwnerEmail = validEmailRegex.test(rawEmail)
        ? rawEmail
        : `financeiro.${cleanId}@gbfleet.com.br`;

      const res = await fetch("/api/saas/payment/create-charge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId: company.id,
          tenantName: company.nome,
          ownerEmail: safeOwnerEmail,
          ownerCpfCnpj: company.cnpjCpf || "",
          planName: company.planName || `Plano ${company.plano || "Pro"}`,
          amount: amountToCharge,
        }),
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error("Servidor de pagamento indisponível no momento. Tente novamente em instantes.");
      }

      if (!res.ok || !data.qrCode) {
        throw new Error(data.error || "Falha ao gerar cobrança PIX no Mercado Pago.");
      }

      setPixCharge(data);
      showToast("✓ Cobrança PIX gerada com sucesso via Mercado Pago!", "success");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Erro ao comunicar com o Mercado Pago.", "error");
    } finally {
      setIsGeneratingPix(false);
    }
  };

  // Automatic 5-second polling while PIX modal is open in SaaSAdmin
  useEffect(() => {
    if (!isPixModalOpen || !pixCharge || pixCharge.status === "approved" || !pixModalCompany) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/saas/payment/check-status/${pixCharge.paymentId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "approved") {
          setPixCharge((prev) => (prev ? { ...prev, status: "approved" } : null));
          await fetch("/api/saas/payment/confirm-unlock", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": currentUserId,
            },
            body: JSON.stringify({
              tenantId: pixModalCompany.id,
              paymentId: pixCharge.paymentId,
              amount: pixCharge.amount,
              newExpiresAt: data.newExpiresAt,
            }),
          });
          showToast(`✓ Pagamento confirmado! "${pixModalCompany.nome}" renovada por +30 dias!`, "success");
          fetchCompanies();
        }
      } catch {
        // silent background check
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isPixModalOpen, pixCharge, pixModalCompany?.id]);

  const handleManualCheckPixStatus = async () => {
    if (!pixCharge || !pixModalCompany) return;
    setIsCheckingPixStatus(true);
    try {
      const res = await fetch(`/api/saas/payment/check-status/${pixCharge.paymentId}`);
      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error("Não foi possível validar o status no servidor.");
      }
      if (!res.ok) {
        throw new Error(data.error || "Erro ao verificar status.");
      }
      if (data.status === "approved") {
        setPixCharge((prev) => (prev ? { ...prev, status: "approved" } : null));
        await fetch("/api/saas/payment/confirm-unlock", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": currentUserId,
          },
          body: JSON.stringify({
            tenantId: pixModalCompany.id,
            paymentId: pixCharge.paymentId,
            amount: pixCharge.amount,
            newExpiresAt: data.newExpiresAt,
          }),
        });
        showToast(`✓ Pagamento confirmado! "${pixModalCompany.nome}" renovada por +30 dias!`, "success");
        fetchCompanies();
      } else {
        showToast(`Status atual no Mercado Pago: ${data.status === "pending" ? "Aguardando pagamento" : data.status}`, "info");
      }
    } catch (err: any) {
      showToast(err.message || "Não foi possível consultar o pagamento.", "error");
    } finally {
      setIsCheckingPixStatus(false);
    }
  };

  const handleCopyPixCode = () => {
    if (!pixCharge?.qrCode) return;
    navigator.clipboard.writeText(pixCharge.qrCode);
    setPixCopied(true);
    showToast("✓ Código PIX Copia e Cola copiado!", "success");
    setTimeout(() => setPixCopied(false), 3000);
  };

  const handleSendPixWhatsApp = () => {
    if (!pixModalCompany || !pixCharge) return;
    const rawPhone = (pixModalCompany.ownerPhone || "").replace(/\D/g, "");
    const formattedPhone = rawPhone ? (rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`) : "";
    const vencStr = (pixModalCompany.planExpiresAt || pixModalCompany.dataVencimento)
      ? new Date((pixModalCompany.planExpiresAt || pixModalCompany.dataVencimento) + "T12:00:00").toLocaleDateString("pt-BR")
      : "Hoje";
    const amountFormatted = Number(pixCharge.amount).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const msg =
      `Olá *${pixModalCompany.ownerName || pixModalCompany.nome}*! 🚛\n\n` +
      `Segue a cobrança PIX referente à assinatura do sistema *GBFleet Gestão de Caminhões*:\n` +
      `📋 *Plano:* ${pixModalCompany.planName || `Plano ${pixModalCompany.plano}`}\n` +
      `📅 *Vencimento:* ${vencStr}\n` +
      `💰 *Valor:* R$ ${amountFormatted}\n\n` +
      `*PIX Copia e Cola (Mercado Pago):*\n` +
      `${pixCharge.qrCode}\n\n` +
      (pixCharge.ticketUrl ? `🔗 *Link com QR Code:* ${pixCharge.ticketUrl}\n\n` : "") +
      `✅ *A liberação e renovação por +30 dias é automática e instantânea após o pagamento!*`;

    const waUrl = formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  const handleDeleteCompany = async (companyId: string, name: string) => {
    if (!window.confirm(`AVISO CRÍTICO:\n\nTem certeza de que deseja EXCLUIR PERMANENTEMENTE a empresa "${name}"?\n\nIsso removerá instantaneamente todos os motoristas, caminhões, abastecimentos, fretes, lançamentos de caixa e contas de usuários a ela associadas sem possibilidade de reversão!`)) {
      return;
    }

    if (deletingCompanyId) return;
    setDeletingCompanyId(companyId);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "DELETE",
        headers: {
          "x-user-id": currentUserId,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao excluir");
      }

      showToast(`✓ Empresa "${name}" excluída com sucesso do banco!`, "success");
      if (activeImpersonatedId === companyId) {
        onImpersonate("");
      }

      fetchCompanies();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Erro ao excluir empresa.", "error");
    } finally {
      setDeletingCompanyId(null);
    }
  };

  const populateEditModalState = (company: CompanyMeta) => {
    setSelectedCompany(company);
    setEditNome(company.nome);
    setEditPlano(company.plano || "Pro");
    setEditPlanName(company.planName || `Plano ${company.plano || "Transportadora Pro"}`);

    const activeFlag = company.isActive !== undefined ? company.isActive : company.status !== "inativo";
    setEditIsActive(activeFlag);
    setEditPlanStatus(company.planStatus || (!activeFlag ? "suspended" : company.pago ? "active" : "trial"));
    setEditPago(!!company.pago);
    setEditTrialDays(String(company.trialDays !== undefined ? company.trialDays : 30));
    setEditCreatedAt(company.createdAt ? company.createdAt.substring(0, 10) : new Date().toISOString().substring(0, 10));

    const defaultDueDate =
      company.planExpiresAt ||
      company.dataVencimento ||
      (company.createdAt
        ? new Date(new Date(company.createdAt).getTime() + (company.trialDays || 30) * 86400000).toISOString().substring(0, 10)
        : new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10));

    setEditPlanExpiresAt(defaultDueDate);
    setEditTrialEndDate(company.trialEndDate || defaultDueDate);
    setEditDueDateDay(String(company.dueDateDay || Number(defaultDueDate.split("-")[2]) || 10));
    setEditGracePeriodDays(String(company.gracePeriodDays !== undefined ? company.gracePeriodDays : 0));

    const lim = company.limiteCaminhoes !== undefined ? company.limiteCaminhoes : 10;
    const valCam = company.valorPorCaminhao !== undefined ? company.valorPorCaminhao : 30;
    const valTot =
      company.planPrice !== undefined
        ? company.planPrice
        : company.monthlyFeeOverride !== undefined
        ? company.monthlyFeeOverride
        : company.valorMensalidade !== undefined
        ? company.valorMensalidade
        : lim * valCam;

    setEditLimiteCaminhoes(String(lim));
    setEditValorPorCaminhao(String(valCam));
    setEditPlanPrice(String(valTot));
    setEditPromoEnabled(Boolean(company.promoEnabled));
    setEditPromoFirstPaymentAmount(
      company.promoFirstPaymentAmount ? String(company.promoFirstPaymentAmount) : ""
    );

    setEditCnpjCpf(company.cnpjCpf || "");
    setEditOwnerName(company.ownerName || company.adminUser?.nome || company.nome || "");
    setEditOwnerEmail(company.ownerEmail || company.adminUser?.email || "");
    setEditOwnerPhone(company.ownerPhone || "");

    setEditAdminNome(company.adminUser?.nome || "");
    setEditAdminEmail(company.adminUser?.email || "");
    setEditAdminPassword("");
  };

  const handleOpenEditModal = (company: CompanyMeta) => {
    populateEditModalState(company);
    setIsEditModalOpen(true);
  };

  const handleUpdateCompanySubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    if (isSaving) return;
    setIsSaving(true);

    try {
      let isoCreatedAt = selectedCompany.createdAt;
      if (editCreatedAt) {
        isoCreatedAt = new Date(editCreatedAt + "T12:00:00.000Z").toISOString();
      }

      const limNum = Number(editLimiteCaminhoes) || 10;
      const valCamNum = Number(editValorPorCaminhao) || 0;
      const priceNum = Number(editPlanPrice) || 0;
      const activeBool = editPlanStatus === "suspended" || editPlanStatus === "canceled" ? false : editIsActive;

      const res = await fetch(`/api/superadmin/companies/${selectedCompany.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUserId,
        },
        body: JSON.stringify({
          nome: editNome,
          plano: editPlano,
          planName: editPlanName,
          planStatus: editPlanStatus,
          isActive: activeBool,
          status: activeBool ? "ativo" : "inativo",
          pago: editPago || editPlanStatus === "active",
          trialDays: Number(editTrialDays) || 0,
          trialEndDate: editTrialEndDate || editPlanExpiresAt,
          createdAt: isoCreatedAt,
          planExpiresAt: editPlanExpiresAt,
          dataVencimento: editPlanExpiresAt,
          dueDateDay: Number(editDueDateDay) || 10,
          gracePeriodDays: Number(editGracePeriodDays) || 0,
          limiteCaminhoes: limNum,
          valorPorCaminhao: valCamNum,
          planPrice: priceNum,
          monthlyFeeOverride: priceNum,
          valorMensalidade: priceNum,
          promoEnabled: editPromoEnabled,
          promoFirstPaymentAmount: Number(editPromoFirstPaymentAmount) || 0,
          cnpjCpf: editCnpjCpf,
          ownerName: editOwnerName,
          ownerEmail: editOwnerEmail,
          ownerPhone: editOwnerPhone,
          adminNome: editAdminNome,
          adminEmail: editAdminEmail,
          adminPassword: editAdminPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao atualizar assinatura.");
      }

      showToast(`✓ Licenciamento e cobrança de "${editNome}" salvos com sucesso!`, "success");
      setSuccessMsg(`Sucesso: Licenciamento, vencimento e faturamento de "${editNome}" atualizados!`);
      setIsEditModalOpen(false);
      setSelectedCompany(null);
      fetchCompanies();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Não foi possível atualizar os dados comerciais.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Aggregated System Metrics
  const totalCompanies = companies.length;
  const activeCompaniesCount = companies.filter((c) => !c.isBlocked).length;
  const blockedCompaniesCount = companies.filter((c) => c.isBlocked).length;
  const totalMonthlyRecurringRevenue = companies
    .filter((c) => !c.isBlocked)
    .reduce((sum, c) => sum + (Number(c.planPrice ?? c.valorMensalidade) || 0), 0);

  const renderLicenseStatusBadge = (company: CompanyMeta) => {
    const badge = company.licenseBadge;
    const days = company.daysUntilExpiration ?? company.daysRemaining ?? 0;

    if (badge === "suspended") {
      return (
        <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
          <Lock size={11} />
          Suspensa / Bloqueada
        </span>
      );
    }
    if (badge === "expired") {
      return (
        <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
          <ShieldAlert size={11} />
          Vencida ({Math.abs(days)}d atrás)
        </span>
      );
    }
    if (badge === "expiring") {
      return (
        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider animate-pulse">
          <AlertTriangle size={11} />
          {days === 0 ? "Vence Hoje!" : days < 0 ? `Tolerância (${Math.abs(days)}d)` : `Vencendo (${days}d)`}
        </span>
      );
    }
    if (badge === "trial" || company.planStatus === "trial") {
      return (
        <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
          <Clock size={11} />
          Trial ({Math.max(0, days)}d)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
        <Check size={11} />
        Ativa ({Math.max(0, days)}d)
      </span>
    );
  };

  return (
    <div className="space-y-8 font-sans text-slate-800">
      {/* Upper banner explaining the role */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 md:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="bg-white/20 text-white font-bold text-[10px] tracking-wider uppercase px-2.5 py-1 rounded-full border border-white/10">
            Portal SaaS • Faturamento PIX Mercado Pago
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Gestão de Empresas, Licenças e Cobrança PIX</h2>
          <p className="text-sm text-blue-100 max-w-2xl">
            Gerencie vencimentos, períodos de teste (trial), valores promocionais, bloqueio automático e gere cobranças PIX instantâneas via Mercado Pago com liberação automática.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-white hover:bg-slate-50 text-blue-600 px-6 py-4 rounded-2xl font-bold text-sm shadow-md transition-all self-start md:self-auto flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus size={18} />
          <span>Cadastrar Nova Empresa</span>
        </button>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-emerald-800 text-sm flex items-center gap-3">
          <CircleCheck className="text-emerald-500 shrink-0" size={20} />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Grid of System-wide Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Empresas Cadastradas</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Building size={18} />
            </div>
          </div>
          <h3 className="text-2xl font-extrabold text-slate-900">{totalCompanies}</h3>
          <p className="text-xs text-slate-500">{activeCompaniesCount} liberadas • {blockedCompaniesCount} bloqueadas</p>
        </div>

        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Receita Recorrente (MRR)</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CreditCard size={18} />
            </div>
          </div>
          <h3 className="text-2xl font-extrabold text-emerald-700">
            R$ {totalMonthlyRecurringRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-slate-500">Mensalidades de licenças ativas</p>
        </div>

        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Caminhões Monitorados</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Truck size={18} />
            </div>
          </div>
          <h3 className="text-2xl font-extrabold text-slate-900">
            {companies.reduce((sum, c) => sum + c.truckCount, 0)}
          </h3>
          <p className="text-xs text-slate-500">Frota consolidada nos clientes</p>
        </div>

        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Motoristas Ativos</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Users size={18} />
            </div>
          </div>
          <h3 className="text-2xl font-extrabold text-slate-900">
            {companies.reduce((sum, c) => sum + c.driverCount, 0)}
          </h3>
          <p className="text-xs text-slate-500">Cadastrados no SaaS</p>
        </div>
      </div>

      {/* Companies List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Empresas Licenciadas (Tenants)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Controle de status da licença, data de vencimento, mensalidade, renovação manual (+30d) e cobrança PIX Mercado Pago.
            </p>
          </div>
          {activeImpersonatedId && (
            <button
              onClick={() => onImpersonate("")}
              className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Encerrar Assistência Remota</span>
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 font-medium">Buscando empresas cadastradas...</div>
        ) : error ? (
          <div className="p-12 text-center text-rose-500 font-medium">{error}</div>
        ) : companies.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-3">
            <p className="font-bold">Nenhuma empresa cadastrada.</p>
            <p className="text-xs max-w-sm mx-auto text-slate-500">
              Cadastre a primeira transportadora no botão acima para gerenciar sua licença e cobrança via PIX!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-widest font-extrabold">
                  <th className="py-4 px-5">Empresa / Responsável</th>
                  <th className="py-4 px-5">Status da Licença</th>
                  <th className="py-4 px-5">Vencimento (planExpiresAt)</th>
                  <th className="py-4 px-5">Valor da Mensalidade</th>
                  <th className="py-4 px-5">Plano & Frota</th>
                  <th className="py-4 px-5 text-right">Ações Rápidas & Cobrança PIX</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {companies.map((company) => {
                  const isBeingImpersonated = activeImpersonatedId === company.id;
                  const limCam = company.limiteCaminhoes || 10;
                  const valMensal = Number(
                    company.planPrice ?? company.monthlyFeeOverride ?? company.valorMensalidade ?? 149.9
                  );
                  const expIso = company.planExpiresAt || company.dataVencimento || "";
                  const vencStr = expIso
                    ? new Date(expIso + "T12:00:00").toLocaleDateString("pt-BR")
                    : "A definir";

                  return (
                    <tr
                      key={company.id}
                      className={cn(
                        "hover:bg-slate-50/80 transition-colors",
                        isBeingImpersonated && "bg-blue-50/50 hover:bg-blue-50",
                        company.isBlocked && "bg-rose-50/20"
                      )}
                    >
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center font-bold font-mono shrink-0",
                              company.isBlocked
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-700"
                            )}
                          >
                            {company.nome.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 text-sm block">{company.nome}</span>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                              <span className="font-mono text-slate-400">ID: {company.id}</span>
                              {(company.ownerEmail || company.adminUser?.email) && (
                                <span>• {company.ownerEmail || company.adminUser?.email}</span>
                              )}
                              {company.ownerPhone && <span>• Tel: {company.ownerPhone}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-5">{renderLicenseStatusBadge(company)}</td>

                      <td className="py-4 px-5">
                        <div className="flex flex-col">
                          <span
                            className={cn(
                              "font-extrabold text-xs font-mono",
                              company.isPastGracePeriod
                                ? "text-rose-600"
                                : company.isExpiringWarning
                                ? "text-amber-700"
                                : "text-slate-800"
                            )}
                          >
                            {vencStr}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Dia fixo: {company.dueDateDay || 10} • Tolerância: {company.gracePeriodDays ?? 0}d
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-5">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-emerald-700 text-sm">
                            R$ {valMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} /mês
                          </span>
                          {company.promoEnabled && (company.promoFirstPaymentAmount || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded mt-0.5 w-fit">
                              <Sparkles size={10} />
                              Próx. fatura promo: R${" "}
                              {Number(company.promoFirstPaymentAmount).toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-5">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">
                            {company.planName || `Plano ${company.plano}`}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {company.truckCount} / {limCam} caminhões • {company.driverCount} mot.
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Botão Gerar Cobrança PIX / Link */}
                          <button
                            type="button"
                            onClick={() => handleOpenPixModal(company)}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                            title="Gerar QR Code PIX e Link de Pagamento via Mercado Pago"
                          >
                            <QrCode size={13} />
                            <span>PIX / Link</span>
                          </button>

                          {/* Botão Renovar +30 Dias (Manual) */}
                          <button
                            type="button"
                            disabled={actionLoadingId === `renew_${company.id}`}
                            onClick={() => handleRenew30DaysManual(company)}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[11px] rounded-xl transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title="Renovar +30 dias manualmente e ativar licença"
                          >
                            {actionLoadingId === `renew_${company.id}` ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <CalendarPlus size={13} />
                            )}
                            <span>+30 Dias</span>
                          </button>

                          {/* Botão Bloquear / Desbloquear Manual */}
                          <button
                            type="button"
                            disabled={actionLoadingId === `toggle_${company.id}`}
                            onClick={() => handleToggleCompanyStatus(company)}
                            className={cn(
                              "px-2.5 py-1.5 font-bold text-[11px] rounded-xl transition border flex items-center gap-1 cursor-pointer disabled:opacity-50",
                              company.isBlocked
                                ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300"
                                : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
                            )}
                            title={company.isBlocked ? "Desbloquear empresa manualmente" : "Bloquear empresa manualmente"}
                          >
                            {actionLoadingId === `toggle_${company.id}` ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : company.isBlocked ? (
                              <Unlock size={13} />
                            ) : (
                              <Lock size={13} />
                            )}
                            <span>{company.isBlocked ? "Desbloquear" : "Bloquear"}</span>
                          </button>

                          {/* Botão Editar Licença / Assinatura */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(company)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl transition border border-slate-200 flex items-center gap-1 cursor-pointer"
                            title="Editar vencimento, valor, trial, promoção e dados do responsável"
                          >
                            <span>Editar</span>
                          </button>

                          {/* Botão Impersonar / Suporte */}
                          <button
                            type="button"
                            onClick={() => onImpersonate(company.id)}
                            className={cn(
                              "px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition-all flex items-center gap-1 cursor-pointer",
                              isBeingImpersonated
                                ? "bg-blue-600 text-white shadow-sm"
                                : "bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600"
                            )}
                            title="Acessar painel da empresa em modo suporte"
                          >
                            <ExternalLink size={13} />
                            <span>{isBeingImpersonated ? "Suportando" : "Acessar"}</span>
                          </button>

                          {/* Excluir */}
                          <button
                            type="button"
                            onClick={() => handleDeleteCompany(company.id, company.nome)}
                            disabled={deletingCompanyId === company.id}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                            title="Excluir Empresa"
                          >
                            {deletingCompanyId === company.id ? (
                              <Loader2 size={14} className="animate-spin text-rose-600" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: CRIAR NOVA EMPRESA COM LICENCIAMENTO E COBRANÇA              */}
      {/* ===================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                  <Building className="text-white w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Cadastrar Nova Empresa (Tenant SaaS)</h3>
                  <p className="text-[11px] text-slate-500">Configure plano, vencimento, trial, mensalidade e dados para PIX.</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCompany} className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* 1. Dados da Empresa e Plano */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  1. Identificação da Empresa & Plano
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Razão Social / Nome Fantasia *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Transportadora Rota Sul Ltda"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">CNPJ ou CPF (Para PIX)</label>
                    <input
                      type="text"
                      placeholder="Somente números"
                      value={cnpjCpf}
                      onChange={(e) => setCnpjCpf(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Categoria do Plano</label>
                    <select
                      value={plano}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPlano(val);
                        setPlanName(
                          val === "Basic"
                            ? "Plano Frota Essencial"
                            : val === "Pro"
                            ? "Plano Transportadora Pro"
                            : "Plano Transportadora Enterprise"
                        );
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="Basic">Basic</option>
                      <option value="Pro">Pro</option>
                      <option value="Enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Nome Comercial do Plano (planName)</label>
                    <input
                      type="text"
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      placeholder="Ex: Plano Transportadora Pro"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Status Inicial (planStatus)</label>
                    <select
                      value={planStatus}
                      onChange={(e) => setPlanStatus(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="trial">Em Teste Grátis (Trial)</option>
                      <option value="active">Ativa (Paga)</option>
                      <option value="suspended">Suspensa / Bloqueada</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Licenciamento, Vencimento e Mensalidade */}
              <div className="p-4 bg-emerald-50/40 border border-emerald-200/70 rounded-2xl space-y-3.5">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-800">
                  2. Vencimento, Trial e Valor da Mensalidade
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Dias de Teste (Trial)</label>
                    <select
                      value={trialDays}
                      onChange={(e) => {
                        const d = e.target.value;
                        setTrialDays(d);
                        const nextExp = new Date(Date.now() + (Number(d) || 0) * 86400000)
                          .toISOString()
                          .split("T")[0];
                        setPlanExpiresAt(nextExp);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    >
                      <option value="0">Sem Trial (0 dias)</option>
                      <option value="7">7 Dias Grátis</option>
                      <option value="15">15 Dias Grátis</option>
                      <option value="30">30 Dias Grátis</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Vencimento (planExpiresAt)</label>
                    <input
                      type="date"
                      required
                      value={planExpiresAt}
                      onChange={(e) => setPlanExpiresAt(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Dia Fixo Venc. Mensal</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="Ex: 10"
                      value={dueDateDay}
                      onChange={(e) => setDueDateDay(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Dias de Tolerância</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      placeholder="0"
                      value={gracePeriodDays}
                      onChange={(e) => setGracePeriodDays(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-emerald-200/50">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Limite de Caminhões</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Ex: 10"
                      value={limiteCaminhoes}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLimiteCaminhoes(val);
                        setPlanPrice(String((Number(val) || 0) * (Number(valorPorCaminhao) || 0)));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Valor por Caminhão (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 30.00"
                      value={valorPorCaminhao}
                      onChange={(e) => {
                        const val = e.target.value;
                        setValorPorCaminhao(val);
                        setPlanPrice(String((Number(limiteCaminhoes) || 0) * (Number(val) || 0)));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-emerald-900 block">Mensalidade Final (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 149.90"
                      value={planPrice}
                      onChange={(e) => setPlanPrice(e.target.value)}
                      className="w-full bg-emerald-100/70 border border-emerald-300 rounded-xl px-3 py-2 text-xs font-black text-emerald-900 font-mono"
                    />
                  </div>
                </div>

                {/* Promoção de 1ª Mensalidade */}
                <div className="pt-2 border-t border-emerald-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={promoEnabled}
                      onChange={(e) => setPromoEnabled(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      Ativar valor promocional na próxima fatura (1º mês promocional)
                    </span>
                  </label>
                  {promoEnabled && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-800">Valor Promo (R$):</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Ex: 99.90"
                        value={promoFirstPaymentAmount}
                        onChange={(e) => setPromoFirstPaymentAmount(e.target.value)}
                        className="w-32 bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs font-black text-amber-900 font-mono"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Dados do Responsável e Credenciais de Acesso */}
              <div className="space-y-3 pt-1">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  3. Responsável & Acesso Master da Empresa
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Nome do Responsável / Gestor *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Carlos Oliveira"
                      value={adminNome}
                      onChange={(e) => setAdminNome(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">WhatsApp do Responsável (com DDD)</label>
                    <input
                      type="text"
                      placeholder="Ex: 11999999999"
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">E-mail de Login e Faturamento *</label>
                    <input
                      type="email"
                      required
                      placeholder="Ex: financeiro@rotasul.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Senha de Acesso *</label>
                    <input
                      type="password"
                      required
                      placeholder="Definir senha"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Cadastrar e Ativar Licença</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: EDITAR ASSINATURA, VENCIMENTO, TRIAL E FATURAMENTO           */}
      {/* ===================================================================== */}
      {isEditModalOpen && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 animate-fade-in max-h-[92vh] flex flex-col">
            <div className="p-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-200">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Licenciamento & Faturamento — {selectedCompany.nome}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Controle total sobre vencimento, mensalidade, promoção, bloqueio e emissão de PIX.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedCompany(null);
                }}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Barra de Ações Rápidas dentro do Modal */}
            <div className="px-6 py-3 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-500">Status Atual:</span>
                {renderLicenseStatusBadge(selectedCompany)}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleOpenPixModal(selectedCompany)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <QrCode size={14} />
                  <span>Gerar Cobrança PIX / Link</span>
                </button>
                <button
                  type="button"
                  disabled={actionLoadingId === `renew_${selectedCompany.id}`}
                  onClick={() => handleRenew30DaysManual(selectedCompany)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {actionLoadingId === `renew_${selectedCompany.id}` ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CalendarPlus size={14} />
                  )}
                  <span>Renovar +30 Dias (Manual)</span>
                </button>
                <button
                  type="button"
                  disabled={actionLoadingId === `toggle_${selectedCompany.id}`}
                  onClick={() => handleToggleCompanyStatus(selectedCompany)}
                  className={cn(
                    "px-3 py-1.5 font-bold text-xs rounded-xl transition border flex items-center gap-1.5 cursor-pointer disabled:opacity-50",
                    selectedCompany.isBlocked
                      ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
                      : "bg-rose-600 hover:bg-rose-700 text-white border-rose-700"
                  )}
                >
                  {selectedCompany.isBlocked ? <Unlock size={14} /> : <Lock size={14} />}
                  <span>{selectedCompany.isBlocked ? "Desbloquear Empresa" : "Bloquear Empresa"}</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleUpdateCompanySubscription} className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* 1. Empresa e Plano */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">Razão Social / Nome Fantasia</label>
                  <input
                    type="text"
                    required
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">Categoria do Plano</label>
                  <select
                    value={editPlano}
                    onChange={(e) => setEditPlano(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option value="Basic">Basic</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">Nome do Plano (planName)</label>
                  <input
                    type="text"
                    value={editPlanName}
                    onChange={(e) => setEditPlanName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                </div>
              </div>

              {/* 2. Status da Licença, Vencimento e Trial */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Licenciamento, Vencimento (planExpiresAt) e Tolerância
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Status da Licença (planStatus)</label>
                    <select
                      value={editPlanStatus}
                      onChange={(e) => {
                        const st = e.target.value as "active" | "trial" | "suspended" | "canceled";
                        setEditPlanStatus(st);
                        if (st === "suspended" || st === "canceled") {
                          setEditIsActive(false);
                        } else {
                          setEditIsActive(true);
                          if (st === "active") setEditPago(true);
                        }
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    >
                      <option value="active">Ativa (Liberada)</option>
                      <option value="trial">Trial (Período de Teste)</option>
                      <option value="suspended">Suspensa / Bloqueada</option>
                      <option value="canceled">Cancelada</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Data de Vencimento (planExpiresAt) *
                    </label>
                    <input
                      type="date"
                      required
                      value={editPlanExpiresAt}
                      onChange={(e) => setEditPlanExpiresAt(e.target.value)}
                      className="w-full bg-white border border-blue-300 rounded-xl px-3 py-2 text-xs font-black text-blue-900 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Dia Fixo Venc. Mensal</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={editDueDateDay}
                      onChange={(e) => setEditDueDateDay(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2 border-t border-slate-200/60">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Dias de Teste (trialDays)</label>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={editTrialDays}
                      onChange={(e) => setEditTrialDays(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Fim do Trial (trialEndDate)</label>
                    <input
                      type="date"
                      value={editTrialEndDate}
                      onChange={(e) => setEditTrialEndDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Dias de Tolerância (gracePeriodDays)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={editGracePeriodDays}
                      onChange={(e) => setEditGracePeriodDays(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Mensalidade e Valor Promocional */}
              <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-200/70 space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Truck size={14} className="text-emerald-600" />
                    Valor da Mensalidade & Promoção de 1ª Fatura
                  </span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Qtd. Caminhões Liberados</label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={editLimiteCaminhoes}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditLimiteCaminhoes(val);
                        setEditPlanPrice(String((Number(val) || 0) * (Number(editValorPorCaminhao) || 0)));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Valor por Caminhão (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editValorPorCaminhao}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditValorPorCaminhao(val);
                        setEditPlanPrice(String((Number(editLimiteCaminhoes) || 0) * (Number(val) || 0)));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-emerald-900 block">
                      Mensalidade (planPrice / Override R$)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editPlanPrice}
                      onChange={(e) => setEditPlanPrice(e.target.value)}
                      className="w-full bg-emerald-100/70 border border-emerald-300 rounded-xl px-3 py-2 text-xs font-black text-emerald-900 font-mono"
                    />
                  </div>
                </div>

                {/* Promoção de 1ª Mensalidade */}
                <div className="pt-3 border-t border-emerald-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editPromoEnabled}
                      onChange={(e) => setEditPromoEnabled(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      Ativar Valor Promocional na Próxima Fatura (1º Mês Promocional)
                    </span>
                  </label>
                  {editPromoEnabled && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-800">1ª Mensalidade (R$):</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Ex: 99.90"
                        value={editPromoFirstPaymentAmount}
                        onChange={(e) => setEditPromoFirstPaymentAmount(e.target.value)}
                        className="w-32 bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs font-black text-amber-900 font-mono"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Dados do Responsável (Para PIX Mercado Pago e WhatsApp) */}
              <div className="p-4 bg-blue-50/30 rounded-2xl border border-blue-100 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-blue-800">
                  Dados do Responsável para Emissão de PIX (Mercado Pago) & Login Master
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Nome do Responsável (ownerName)</label>
                    <input
                      type="text"
                      value={editOwnerName}
                      onChange={(e) => {
                        setEditOwnerName(e.target.value);
                        setEditAdminNome(e.target.value);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">CNPJ ou CPF (cnpjCpf)</label>
                    <input
                      type="text"
                      placeholder="Somente números"
                      value={editCnpjCpf}
                      onChange={(e) => setEditCnpjCpf(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">
                      E-mail do Responsável / Login (ownerEmail)
                    </label>
                    <input
                      type="email"
                      value={editAdminEmail}
                      onChange={(e) => {
                        setEditAdminEmail(e.target.value);
                        setEditOwnerEmail(e.target.value);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">WhatsApp (ownerPhone)</label>
                    <input
                      type="text"
                      placeholder="Ex: 11999999999"
                      value={editOwnerPhone}
                      onChange={(e) => setEditOwnerPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1 pt-1">
                  <label className="text-[11px] font-bold text-slate-600 block">Redefinir Senha de Acesso do Cliente</label>
                  <input
                    type="password"
                    placeholder="Deixe em branco para manter a senha atual"
                    value={editAdminPassword}
                    onChange={(e) => setEditAdminPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedCompany(null);
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar Alterações</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: COBRANÇA PIX MERCADO PAGO (QR CODE + COPIA E COLA + WHATSAPP) */}
      {/* ===================================================================== */}
      {pixModalCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 animate-fade-in">
            <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm">Cobrança PIX — Mercado Pago</h3>
                  <p className="text-[11px] text-emerald-100 truncate max-w-[230px]">
                    {pixModalCompany.nome} ({pixModalCompany.planName || `Plano ${pixModalCompany.plano}`})
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPixModalCompany(null);
                  setPixCharge(null);
                }}
                className="p-1.5 hover:bg-white/20 rounded-lg text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Ajuste rápido de valor caso queira regenerar */}
              <div className="flex items-end gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 block">
                    Valor da Cobrança PIX (R$)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={pixCustomAmount}
                    onChange={(e) => setPixCustomAmount(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-black text-emerald-800 font-mono"
                  />
                </div>
                <button
                  type="button"
                  disabled={isGeneratingPix}
                  onClick={() => generatePixChargeForCompany(pixModalCompany, Number(pixCustomAmount))}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={cn(isGeneratingPix && "animate-spin")} />
                  <span>Atualizar PIX</span>
                </button>
              </div>

              {isGeneratingPix ? (
                <div className="py-12 text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
                  <p className="text-xs font-bold text-slate-600">
                    Gerando QR Code PIX oficial na API do Mercado Pago...
                  </p>
                </div>
              ) : pixCharge ? (
                <div className="space-y-4">
                  {pixCharge.status === "approved" ? (
                    <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2">
                      <CircleCheck className="w-12 h-12 text-emerald-600 mx-auto" />
                      <h4 className="text-base font-extrabold text-emerald-900">Pagamento PIX Aprovado!</h4>
                      <p className="text-xs text-emerald-700">
                        A licença da empresa <strong>{pixModalCompany.nome}</strong> foi desbloqueada e renovada por +30 dias automaticamente.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* QR Code */}
                      {pixCharge.qrCodeBase64 && (
                        <div className="flex flex-col items-center justify-center bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                          <img
                            src={`data:image/png;base64,${pixCharge.qrCodeBase64}`}
                            alt="QR Code PIX Mercado Pago"
                            className="w-48 h-48 object-contain"
                          />
                          <span className="text-[11px] font-bold text-slate-500 mt-2">
                            Escaneie o QR Code ou copie o código abaixo
                          </span>
                        </div>
                      )}

                      {/* Copia e Cola */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-500 block">
                          Código PIX Copia e Cola
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={pixCharge.qrCode}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-mono text-slate-600 select-all"
                          />
                          <button
                            type="button"
                            onClick={handleCopyPixCode}
                            className={cn(
                              "px-3.5 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shrink-0",
                              pixCopied
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-900 hover:bg-slate-800 text-white"
                            )}
                          >
                            {pixCopied ? <Check size={14} /> : <Copy size={14} />}
                            <span>{pixCopied ? "Copiado!" : "Copiar"}</span>
                          </button>
                        </div>
                      </div>

                      {/* Ações: WhatsApp, Link Externo e Verificar Status */}
                      <div className="grid grid-cols-1 gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={handleSendPixWhatsApp}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                        >
                          <MessageCircle size={16} />
                          <span>Enviar PIX para o Dono no WhatsApp</span>
                        </button>

                        <div className="flex gap-2">
                          {pixCharge.ticketUrl && (
                            <a
                              href={pixCharge.ticketUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
                            >
                              <ExternalLink size={13} />
                              <span>Abrir Link Mercado Pago</span>
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={isCheckingPixStatus}
                            onClick={handleManualCheckPixStatus}
                            className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw size={13} className={cn(isCheckingPixStatus && "animate-spin")} />
                            <span>Verificar Pagamento</span>
                          </button>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1.5 pt-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        <span>Aguardando pagamento... O sistema verifica e libera automaticamente a cada 4s.</span>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  Clique em "Atualizar PIX" para gerar um novo QR Code.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
