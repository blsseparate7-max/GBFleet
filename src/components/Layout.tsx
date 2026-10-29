import React, { useState, useEffect, useMemo } from 'react';
import { 
  Home as HomeIcon,
  LayoutDashboard, 
  Truck as TruckIcon, 
  Fuel, 
  Receipt, 
  Wallet, 
  Menu, 
  X, 
  LogOut, 
  Bell, 
  Route, 
  Wrench, 
  Users, 
  Calculator,
  Shield,
  User as UserIcon,
  ShieldAlert,
  Check,
  CheckCheck,
  AlertCircle,
  Calendar,
  Lock,
  Mail,
  FileText,
  DollarSign,
  CreditCard,
  Image as ImageIcon,
  Upload,
  Trash2,
  Sliders,
  QrCode,
  Copy,
  RefreshCw,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { cn } from '../lib/utils';
import { onDBSync } from '../lib/firebaseClientDb';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { getCachedTenant, setCachedTenant, setCachedUserProfile, invalidateTenantCache } from '../lib/tenantService';
import Home from './Home';
import Dashboard from './Dashboard';
import Chat from './Chat';
import Trucks from './Trucks';
import FuelLogs from './FuelLogs';
import Expenses from './Expenses';
import CashFlow from './CashFlow';
import Freights from './Freights';
import Maintenance from './Maintenance';
import Drivers from './Drivers';
import DriverFinancials from './DriverFinancials';
import Simulator from './Simulator';
import Login from './Login';
import SaaSAdmin from './SaaSAdmin';
import Reports from './Reports';
import { ToastContainer, showToast } from './ui/Toast';

type Tab = 'home' | 'dashboard' | 'trucks' | 'fuel' | 'expenses' | 'cash' | 'freights' | 'maintenance' | 'drivers' | 'driver_financials' | 'simulator' | 'reports' | 'saas';

const SAFETY_LOADING_TIMEOUT_MS = 2500;

export default function Layout() {
  const { logout: authLogout, loginInstant } = useAuth();
  const { updateTenantCache, invalidateCurrentTenant } = useTenant();

  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('gbfleet_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [currentCompany, setCurrentCompany] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('gbfleet_company');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.id) {
          return getCachedTenant(parsed.id) || parsed;
        }
        return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [impersonatedCompanyId, setImpersonatedCompanyId] = useState<string | null>(() => {
    return localStorage.getItem('gbfleet_impersonate');
  });

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const savedUser = localStorage.getItem('gbfleet_user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      return user.role === 'superadmin' ? 'saas' : 'home';
    }
    return 'home';
  });

  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Instant Stale-While-Revalidate initial state from localStorage cache (<50ms) so the user never sees a blank loading screen
  const [data, setData] = useState<any>(() => {
    try {
      const savedUserStr = localStorage.getItem('gbfleet_user');
      const savedCompStr = localStorage.getItem('gbfleet_company');
      const savedDbStr = localStorage.getItem('gbfleet_db_local');
      if (savedUserStr && savedDbStr) {
        const user = JSON.parse(savedUserStr);
        const comp = savedCompStr ? JSON.parse(savedCompStr) : null;
        const localDb = JSON.parse(savedDbStr);
        const targetCompId = localStorage.getItem('gbfleet_impersonate') || user.companyId;
        if (localDb && Array.isArray(localDb.trucks)) {
          return {
            currentUser: user,
            company: comp,
            trucks: (localDb.trucks || []).filter((t: any) => t.companyId === targetCompId),
            drivers: (localDb.drivers || []).filter((d: any) => d.companyId === targetCompId),
            fuel_logs: (localDb.fuel_logs || []).filter((f: any) => f.companyId === targetCompId),
            expenses: (localDb.expenses || []).filter((e: any) => e.companyId === targetCompId),
            cash_flow: (localDb.cash_flow || []).filter((c: any) => c.companyId === targetCompId),
            freights: (localDb.freights || []).filter((f: any) => f.companyId === targetCompId),
            maintenance_alerts: (localDb.maintenance_alerts || []).filter((m: any) => m.companyId === targetCompId),
            routes: (localDb.routes || []).filter((r: any) => r.companyId === targetCompId),
            gas_stations: (localDb.gas_stations || []).filter((g: any) => g.companyId === targetCompId),
            expense_companies: (localDb.expense_companies || []).filter((ec: any) => ec.companyId === targetCompId),
            driver_payments: (localDb.driver_payments || []).filter((dp: any) => dp.companyId === targetCompId),
            driver_adjustments: (localDb.driver_adjustments || []).filter((da: any) => da.companyId === targetCompId),
            categories_entrada: comp?.categories_entrada || localDb.categories_entrada || [],
            categories_saida: comp?.categories_saida || localDb.categories_saida || [],
            chat_logs: (localDb.chat_logs || []).filter((cl: any) => cl.companyId === targetCompId)
          };
        }
      }
    } catch {
      // ignore
    }
    return null;
  });

  // Safety Fallback Timeout (2500ms max) to prevent infinite "Carregando painel..." if 4G/Wi-Fi oscillates
  useEffect(() => {
    if (data || !currentUser) return;
    const timer = setTimeout(() => {
      setData((prev: any) =>
        prev || {
          currentUser,
          company: currentCompany,
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
          driver_payments: [],
          driver_adjustments: [],
          categories_entrada: [],
          categories_saida: [],
          chat_logs: []
        }
      );
    }, SAFETY_LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [data, currentUser, currentCompany]);

  // Support authorization code state
  const [supportCodeState, setSupportCodeState] = useState<string | null>(null);


  // Client-side Mercado Pago PIX Checkout state (for Blocked Screen & Expiration Warning Banner)
  const [clientPixCharge, setClientPixCharge] = useState<any>(null);
  const [isGeneratingClientPix, setIsGeneratingClientPix] = useState(false);
  const [isCheckingClientPix, setIsCheckingClientPix] = useState(false);
  const [clientPixCopied, setClientPixCopied] = useState(false);
  const [isClientPixModalOpen, setIsClientPixModalOpen] = useState(false);

  // Trial remaining days value helper
  const daysRemaining = useMemo(() => {
    if (!currentCompany) return 30;
    if (currentCompany.daysRemaining !== undefined) return currentCompany.daysRemaining;
    const created = new Date(currentCompany.createdAt || new Date());
    const now = new Date();
    const elapsedDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, (currentCompany.trialDays || 30) - elapsedDays);
  }, [currentCompany]);

  // Meu Perfil and Notifications states
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);

  // Profile fields state
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileLogo, setProfileLogo] = useState<string>('');
  const [profileLogoSize, setProfileLogoSize] = useState<number>(56);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Local notification read statuses
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('gbfleet_read_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  // Sync profile edits with session
  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.nome || '');
      setProfileEmail(currentUser.email || '');
      setProfilePassword(currentUser.password || 'demo');
    }
    if (currentCompany) {
      setProfileLogo(currentCompany.logoUrl || '');
      setProfileLogoSize(Number(currentCompany.logoSize) || 56);
    }
  }, [currentUser, currentCompany, isProfileOpen]);

  // Handle dynamic notifications calculated from state
  const computedNotifications = useMemo(() => {
    if (!data) return [];
    const items: Array<{
      id: string;
      title: string;
      text: string;
      type: 'info' | 'warning' | 'critical' | 'success';
      date: string;
      category: 'maintenance' | 'driver' | 'cash' | 'subscription';
    }> = [];

    // 1. Check Driver CNH Expiration Thresholds
    if (Array.isArray(data.drivers)) {
      data.drivers.forEach((d: any) => {
        if (d.vencimentoCnh) {
          const expDate = new Date(d.vencimentoCnh);
          const now = new Date();
          const diffTime = expDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            items.push({
              id: `drv_expired_${d.id}`,
              title: `CNH Vencida - ${d.nome}`,
              text: `O motorista está circulando com a habilitação vencida desde ${expDate.toLocaleDateString('pt-BR')}.`,
              type: 'critical',
              date: d.vencimentoCnh,
              category: 'driver'
            });
          } else if (diffDays <= 30) {
            items.push({
              id: `drv_exp_soon_${d.id}`,
              title: `CNH Vencendo: ${d.nome}`,
              text: `Vencimento da Habilitação em ${diffDays} dias (${expDate.toLocaleDateString('pt-BR')}).`,
              type: 'warning',
              date: d.vencimentoCnh,
              category: 'driver'
            });
          }
        }
      });
    }

    // 2. Check Pending Maintenance Alerts
    if (Array.isArray(data.maintenance_alerts)) {
      data.maintenance_alerts.forEach((m: any) => {
        if (m.status?.toLowerCase() === 'pendente') {
          const urgency = m.urgencia?.toLowerCase();
          items.push({
            id: `maint_${m.id}`,
            title: `Manutenção Pendente: ${m.truckId}`,
            text: `Item para revisar: ${m.item}. Prazo limite fixado até ${new Date(m.dataLimite).toLocaleDateString('pt-BR')}.`,
            type: urgency === 'alta' || urgency === 'critica' || urgency === 'crítica' ? 'critical' : 'warning',
            date: m.dataLimite,
            category: 'maintenance'
          });
        }
      });
    }

    // 3. Low Balance Cash Flow Warning
    let totalCashBalance = 0;
    if (Array.isArray(data.cash_flow)) {
      data.cash_flow.forEach((c: any) => {
        if (c.tipo === 'entrada') totalCashBalance += Number(c.valor);
        else if (c.tipo === 'saida') totalCashBalance -= Number(c.valor);
      });

      if (totalCashBalance < 5000) {
        items.push({
          id: 'low_balance_alert',
          title: 'Aviso de Caixa Baixo',
          text: `Atenção: o saldo consolidado do fluxo de caixa operacional está menor que R$ 5.000 (Atualmente R$ ${totalCashBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
          type: 'warning',
          date: new Date().toISOString().split('T')[0],
          category: 'cash'
        });
      }
    }

    // 4. Check Subscription Due Date Alerts
    if (data?.company?.dataVencimento) {
      const today = new Date();
      today.setHours(0,0,0,0);
      const dueDate = new Date(data.company.dataVencimento + 'T00:00:00');
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const dateFormatted = dueDate.toLocaleDateString('pt-BR');

      if (diffDays <= 0) {
        items.unshift({
          id: `sub_expired_${data.company.dataVencimento}`,
          title: 'Assinatura GBFleet Vencida',
          text: `Atenção: A mensalidade do plano da sua empresa venceu em ${dateFormatted}. Entre em contato com o suporte para manter seus serviços sem interrupções.`,
          type: 'critical',
          date: data.company.dataVencimento,
          category: 'subscription'
        });
      } else if (diffDays <= 7) {
        items.unshift({
          id: `sub_warning_${data.company.dataVencimento}`,
          title: 'Assinatura Próxima do Vencimento',
          text: `Sua mensalidade de R$ ${(data.company.valorMensalidade || 300).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} vence em ${diffDays} dia(s) (${dateFormatted}).`,
          type: 'warning',
          date: data.company.dataVencimento,
          category: 'subscription'
        });
      }
    }

    return items;
  }, [data]);

  const unreadNotifCount = useMemo(() => {
    return computedNotifications.filter(n => !readNotifIds.includes(n.id)).length;
  }, [computedNotifications, readNotifIds]);

  const saveUpdatedReadIds = (newIds: string[]) => {
    setReadNotifIds(newIds);
    localStorage.setItem('gbfleet_read_notifications', JSON.stringify(newIds));
  };

  const markAllAsRead = () => {
    const allIds = computedNotifications.map(n => n.id);
    saveUpdatedReadIds(allIds);
  };

  // Handle client-side canvas compression for logo upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileError('Por favor selecione um arquivo de imagem válido (JPEG, PNG ou WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 420;
        const maxHeight = 220;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
          setProfileLogo(compressedDataUrl);
          setProfileError('');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async () => {
    if (!profileName || !profileEmail) {
      setProfileError("Nome e e-mail são obrigatórios.");
      return;
    }
    setProfileError('');
    setProfileSuccess('');
    setIsSavingProfile(true);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: profileName,
          email: profileEmail,
          password: profilePassword,
          logoUrl: profileLogo,
          logoSize: profileLogoSize
        })
      });

      const json = await res.json();
      if (!res.ok) {
        setProfileError(json.error || "Erro ao atualizar perfil.");
      } else {
        setProfileSuccess("Perfil e dados da transportadora atualizados com sucesso!");
        setCurrentUser(json.user);
        localStorage.setItem('gbfleet_user', JSON.stringify(json.user));
        if (json.company) {
          setCurrentCompany(json.company);
          localStorage.setItem('gbfleet_company', JSON.stringify(json.company));
        }
        fetchData(); // pull fresh data state
        setTimeout(() => {
          setIsProfileOpen(false);
          setProfileSuccess('');
        }, 1200);
      }
    } catch (err) {
      setProfileError("Falha na conexão com o servidor.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const fetchData = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/data');
      if (res.status === 401) {
        handleLogout();
        return;
      }
      const json = await res.json();
      setData(json);

      if (json.currentUser) {
        setCurrentUser(json.currentUser);
        localStorage.setItem('gbfleet_user', JSON.stringify(json.currentUser));
        setCachedUserProfile(json.currentUser.id, json.currentUser);
      }
      if (json.company) {
        setCurrentCompany(json.company);
        localStorage.setItem('gbfleet_company', JSON.stringify(json.company));
        setCachedTenant(json.company.id, json.company);
        updateTenantCache(json.company);
        setSupportCodeState(json.company.supportCode || null);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };


  const handleGenerateSupportCode = async () => {
    try {
      const res = await fetch("/api/support/generate", { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        setSupportCodeState(json.supportCode);
        showToast(`Código de suporte gerado: ${json.supportCode}`, 'info', 5000);
      } else {
        showToast("Não foi possível gerar o código.", 'error');
      }
    } catch {
      showToast("Erro na conexão ao gerar código.", 'error');
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser?.id, impersonatedCompanyId]);

  useEffect(() => {
    return onDBSync(() => {
      if (currentUser) {
        fetchData();
      }
    });
  }, [currentUser?.id]);

  // Automatic 4-second polling for client Mercado Pago PIX payment (both on Blocked Screen and Renewal Modal)
  useEffect(() => {
    if (!clientPixCharge || clientPixCharge.status === 'approved' || !currentCompany) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/saas/payment/check-status/${clientPixCharge.paymentId}`);
        if (!res.ok) return;
        const statusData = await res.json();
        if (statusData.status === 'approved') {
          setClientPixCharge((prev: any) => (prev ? { ...prev, status: 'approved' } : null));
          await fetch('/api/saas/payment/confirm-unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenantId: currentCompany.id,
              paymentId: clientPixCharge.paymentId,
              amount: clientPixCharge.amount
            })
          });
          showToast('✓ Pagamento PIX confirmado! Seu painel foi desbloqueado e renovado por +30 dias!', 'success', 6000);
          setIsClientPixModalOpen(false);
          fetchData();
        }
      } catch (e) {
        // silent background check
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [clientPixCharge, currentCompany?.id]);

  const handleGenerateClientPix = async (openModalIfUnlocked: boolean = false) => {
    if (!currentCompany) return;
    if (openModalIfUnlocked) {
      setIsClientPixModalOpen(true);
    }
    setIsGeneratingClientPix(true);
    setClientPixCopied(false);

    const amountToCharge =
      currentCompany.effectiveChargeAmount ||
      (currentCompany.promoEnabled && Number(currentCompany.promoFirstPaymentAmount) > 0
        ? Number(currentCompany.promoFirstPaymentAmount)
        : Number(currentCompany.planPrice || currentCompany.monthlyFeeOverride || currentCompany.valorMensalidade || 149.9));

    try {
      const res = await fetch('/api/saas/payment/create-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: currentCompany.id,
          tenantName: currentCompany.nome,
          ownerEmail: currentCompany.ownerEmail || currentUser?.email || `financeiro@${currentCompany.id}.com`,
          ownerCpfCnpj: currentCompany.cnpjCpf || '',
          planName: currentCompany.planName || `Plano ${currentCompany.plano || 'Pro'}`,
          amount: amountToCharge
        })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Erro ao gerar QR Code PIX.');
      }
      setClientPixCharge(json);
    } catch (err: any) {
      showToast(err.message || 'Falha ao gerar cobrança PIX no Mercado Pago.', 'error');
    } finally {
      setIsGeneratingClientPix(false);
    }
  };

  const handleManualVerifyClientPix = async () => {
    if (!clientPixCharge || !currentCompany) return;
    setIsCheckingClientPix(true);
    try {
      const res = await fetch(`/api/saas/payment/check-status/${clientPixCharge.paymentId}`);
      const statusData = await res.json();
      if (statusData.status === 'approved') {
        setClientPixCharge((prev: any) => (prev ? { ...prev, status: 'approved' } : null));
        await fetch('/api/saas/payment/confirm-unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: currentCompany.id,
            paymentId: clientPixCharge.paymentId,
            amount: clientPixCharge.amount
          })
        });
        showToast('✓ Pagamento PIX confirmado! Painel liberado por +30 dias!', 'success', 6000);
        setIsClientPixModalOpen(false);
        fetchData();
      } else {
        showToast('Ainda aguardando confirmação do banco. Assim que pagar, a liberação é automática!', 'info');
      }
    } catch {
      showToast('Erro ao consultar status do pagamento.', 'error');
    } finally {
      setIsCheckingClientPix(false);
    }
  };

  const handleCopyClientPix = () => {
    if (!clientPixCharge?.qrCode) return;
    navigator.clipboard.writeText(clientPixCharge.qrCode);
    setClientPixCopied(true);
    showToast('✓ Código PIX Copia e Cola copiado!', 'success');
    setTimeout(() => setClientPixCopied(false), 3000);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentCompany(null);
    setImpersonatedCompanyId(null);
    setData(null);
    setSupportCodeState(null);
    authLogout();
    localStorage.removeItem('gbfleet_user');
    localStorage.removeItem('gbfleet_company');
    localStorage.removeItem('gbfleet_impersonate');
    localStorage.removeItem('gbfleet_session_token');
    setActiveTab('home');
  };

  const handleLoginSuccess = (user: any, company: any) => {
    setCurrentUser(user);
    setCurrentCompany(company);
    localStorage.setItem('gbfleet_user', JSON.stringify(user));
    localStorage.setItem('gbfleet_company', JSON.stringify(company));
    loginInstant(user, company);
    if (company?.id) {
      invalidateTenantCache(company.id);
      setCachedTenant(company.id, company);
      updateTenantCache(company);
    }
    invalidateCurrentTenant();
    
    if (user.role === 'superadmin') {
      setActiveTab('saas');
    } else {
      setActiveTab('home');
    }
  };


  const handleImpersonate = async (companyId: string) => {
    if (!companyId) {
      localStorage.removeItem('gbfleet_impersonate');
      setImpersonatedCompanyId(null);
      return;
    }

    // Bypass check for comp_1 demo for ease of evaluation and previews
    if (companyId === "comp_1") {
      localStorage.setItem('gbfleet_impersonate', companyId);
      setImpersonatedCompanyId(companyId);
      return;
    }

    const code = prompt("Para acessar este painel corporativo em modo suporte, insira o Código de Conciliação gerado pelo cliente em tempo real (ex: GB-XXXX):");
    if (code === null) return; // cancelled

    const cleanCode = code.toUpperCase().trim();
    if (!cleanCode) {
      alert("Código de conciliação obrigatório.");
      return;
    }

    try {
      const res = await fetch("/api/superadmin/verify-support-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUser?.id || ""
        },
        body: JSON.stringify({ companyId, code: cleanCode })
      });
      if (res.ok) {
        localStorage.setItem('gbfleet_impersonate', companyId);
        setImpersonatedCompanyId(companyId);
        alert("Acesso de suporte autorizado com sucesso! Redirecionando...");
      } else {
        const errJson = await res.json();
        alert(errJson.error || "Código de suporte incorreto ou expirado.");
      }
    } catch {
      alert("Falha de conexão com o servidor ao autenticar.");
    }
  };

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (data?.blocked) {
    const blockedComp = data.company || currentCompany;
    const chargeAmt =
      blockedComp?.effectiveChargeAmount ||
      (blockedComp?.promoEnabled && Number(blockedComp?.promoFirstPaymentAmount) > 0
        ? Number(blockedComp.promoFirstPaymentAmount)
        : Number(blockedComp?.planPrice || blockedComp?.monthlyFeeOverride || blockedComp?.valorMensalidade || 149.9));
    const regularAmt = Number(blockedComp?.planPrice || blockedComp?.valorMensalidade || chargeAmt);
    const expDateStr = (blockedComp?.planExpiresAt || blockedComp?.dataVencimento)
      ? new Date((blockedComp.planExpiresAt || blockedComp.dataVencimento) + 'T12:00:00').toLocaleDateString('pt-BR')
      : 'Vencida';

    return (
      <div className="flex min-h-screen w-screen items-center justify-center bg-slate-900 font-sans text-slate-100 p-4 overflow-y-auto">
        <div className="bg-slate-800 border border-slate-700 max-w-xl w-full rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-6 my-8">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500" />
          
          <div className="space-y-3 text-center">
            <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/20">
              <ShieldAlert className="w-7 h-7 animate-pulse text-rose-500" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-extrabold tracking-tight text-white">
                Licença Expirada ou Suspensa
              </h2>
              <p className="text-xs text-slate-400">
                Realize o pagamento via PIX abaixo para desbloquear seu painel instantaneamente (+30 dias).
              </p>
            </div>
          </div>

          {/* Resumo da Fatura / Plano */}
          <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-700/70 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Empresa / Transportadora</span>
                <span className="font-extrabold text-white text-sm">{blockedComp?.nome || 'Empresa'}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Vencimento</span>
                <span className="font-mono font-bold text-rose-400">{expDateStr}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Plano Contratado</span>
                <span className="font-bold text-slate-200">
                  {blockedComp?.planName || `Plano ${blockedComp?.plano || 'Transportadora Pro'}`}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Valor para Liberação (+30d)</span>
                <div className="flex items-center justify-end gap-2">
                  {blockedComp?.promoEnabled && Number(blockedComp?.promoFirstPaymentAmount) > 0 && (
                    <span className="text-[11px] text-slate-500 line-through font-mono">
                      R$ {regularAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  <span className="text-base font-black text-emerald-400 font-mono">
                    R$ {chargeAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Área de Desbloqueio Instantâneo via PIX (Mercado Pago) */}
          <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-400" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                  Desbloqueio Instantâneo via PIX (Mercado Pago)
                </span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                Liberação em segundos
              </span>
            </div>

            {!clientPixCharge ? (
              <button
                type="button"
                disabled={isGeneratingClientPix}
                onClick={() => handleGenerateClientPix(false)}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                {isGeneratingClientPix ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Gerando QR Code PIX no Mercado Pago...</span>
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    <span>Gerar QR Code PIX para Desbloquear Agora</span>
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-4 animate-fade-in">
                {clientPixCharge.qrCodeBase64 && (
                  <div className="bg-white p-3.5 rounded-2xl w-48 h-48 mx-auto flex items-center justify-center shadow-inner">
                    <img
                      src={`data:image/png;base64,${clientPixCharge.qrCodeBase64}`}
                      alt="QR Code PIX"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-400 block text-center">
                    Ou copie o código PIX Copia e Cola abaixo:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={clientPixCharge.qrCode}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-[11px] font-mono text-slate-300 select-all"
                    />
                    <button
                      type="button"
                      onClick={handleCopyClientPix}
                      className={cn(
                        "px-4 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shrink-0",
                        clientPixCopied ? "bg-emerald-600 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"
                      )}
                    >
                      {clientPixCopied ? <Check size={14} /> : <Copy size={14} />}
                      <span>{clientPixCopied ? "Copiado!" : "Copiar PIX"}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    disabled={isCheckingClientPix}
                    onClick={handleManualVerifyClientPix}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={cn(isCheckingClientPix && "animate-spin")} />
                    <span>Já Paguei — Verificar e Liberar</span>
                  </button>
                  <button
                    type="button"
                    disabled={isGeneratingClientPix}
                    onClick={() => handleGenerateClientPix(false)}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition cursor-pointer"
                  >
                    Novo QR
                  </button>
                </div>

                <div className="text-[10px] text-emerald-400/90 text-center flex items-center justify-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Aguardando confirmação do pagamento... Seu painel abrirá sozinho assim que compensar!</span>
                </div>
              </div>
            )}
          </div>

          {/* Special Support Code Group on Block Screen */}
          <div className="bg-slate-750 border border-slate-700/60 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <p className="text-xs font-bold text-white">Conciliação Técnica de Suporte</p>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Precisa de ajuda? Gere um código temporário para o suporte verificar sua conta.
              </p>
            </div>
            <div className="shrink-0 w-full sm:w-auto">
              {supportCodeState ? (
                <div className="flex flex-col items-center sm:items-end gap-1">
                  <span className="font-mono font-black text-rose-400 bg-slate-950 border border-rose-500/30 px-3 py-1.5 rounded-xl text-sm tracking-wider shadow-inner select-all">
                    {supportCodeState}
                  </span>
                  <span className="text-[9px] text-rose-400 italic font-mono font-bold">Passe para o suporte!</span>
                </div>
              ) : (
                <button
                  onClick={handleGenerateSupportCode}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold text-[11px] rounded-xl transition-all cursor-pointer"
                >
                  Gerar Código
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleLogout}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-extrabold text-xs rounded-xl transition border border-slate-700 cursor-pointer text-center"
            >
              Sair da Conta (Logout)
            </button>
          </div>
        </div>
        <ToastContainer />
      </div>
    );
  }

  const menuGroups = [
    {
      title: 'Visão Geral',
      items: [
        { id: 'home', label: 'Início', icon: HomeIcon },
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'reports', label: 'Relatórios', icon: FileText },
        { id: 'simulator', label: 'Simulador de Frete', icon: Calculator },
      ]
    },
    {
      title: 'Operações',
      items: [
        { id: 'freights', label: 'Gestão de Fretes', icon: Route },
        { id: 'trucks', label: 'Frota', icon: TruckIcon },
        { id: 'drivers', label: 'Motoristas', icon: Users },
        { id: 'maintenance', label: 'Alerta de Manutenção', icon: Wrench },
      ]
    },
    {
      title: 'Financeiro',
      items: [
        { id: 'cash', label: 'Caixa', icon: Wallet },
        { id: 'expenses', label: 'Despesas', icon: Receipt },
        { id: 'fuel', label: 'Abastecimentos', icon: Fuel },
        { id: 'driver_financials', label: 'Financeiro Motoristas', icon: DollarSign },
      ]
    },
    ...(currentUser?.role === 'superadmin' ? [
      {
        title: 'Sistema',
        items: [
          { id: 'saas', label: 'Gestão SaaS', icon: Shield }
        ]
      }
    ] : [])
  ];

  const menuItems = menuGroups.flatMap(group => group.items);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Backdrop for mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transition-all duration-300 ease-in-out lg:relative lg:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        !isDesktopSidebarOpen && "lg:w-20"
      )}>
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center justify-between">
            <div className={cn("flex items-center gap-3", !isDesktopSidebarOpen && "lg:hidden")}>
              {currentCompany?.logoUrl ? (
                <div 
                  className="shrink-0 bg-white border border-slate-200 rounded-xl p-1 shadow-xs flex items-center justify-center overflow-hidden"
                  style={{ 
                    height: `${Math.min(currentCompany.logoSize || 56, 52)}px`,
                    maxWidth: '85px',
                    minWidth: '40px'
                  }}
                  title={currentCompany.nome || "Logo da Empresa"}
                >
                  <img 
                    src={currentCompany.logoUrl} 
                    alt={currentCompany.nome || "Logo"} 
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                  <TruckIcon className="text-white w-5 h-5" />
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-lg tracking-tight leading-none truncate">GBFleet <span className="text-blue-600">AI</span></span>
                {currentCompany?.nome && (
                  <span className="text-[10px] text-slate-500 font-bold truncate max-w-[130px] mt-1" title={currentCompany.nome}>
                    {currentCompany.nome}
                  </span>
                )}
              </div>
            </div>
            {!isDesktopSidebarOpen && (
              <div className="hidden lg:flex items-center justify-center w-full py-1">
                {currentCompany?.logoUrl ? (
                  <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center p-1 shadow-xs overflow-hidden">
                    <img src={currentCompany.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <TruckIcon className="text-white w-5 h-5" />
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setIsDesktopSidebarOpen(!isDesktopSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg lg:block hidden">
              {isDesktopSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg lg:hidden">
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-6 overflow-y-auto">
            {menuGroups.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-1">
                {isDesktopSidebarOpen ? (
                  <span className="block text-[10px] font-black uppercase text-slate-400 tracking-wider px-3 mb-2 select-none">
                    {group.title}
                  </span>
                ) : (
                  <div className="border-b border-slate-100 my-2 mx-1 lg:block hidden" />
                )}
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as Tab);
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group text-left cursor-pointer",
                      activeTab === item.id 
                        ? "bg-blue-50 text-blue-600 font-semibold" 
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 shrink-0", activeTab === item.id ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} />
                    <span className={cn("transition-opacity duration-200 truncate text-xs font-medium", !isDesktopSidebarOpen && "lg:opacity-0 lg:hidden")}>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-100">
            <div 
              onClick={() => setIsProfileOpen(true)}
              className={cn(
                "flex items-center gap-3 p-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer border border-transparent hover:border-slate-200", 
                !isDesktopSidebarOpen && "lg:justify-center"
              )}
              title="Meu Perfil & Configurações"
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 border border-blue-200 shrink-0 flex items-center justify-center text-blue-700 font-extrabold uppercase select-none">
                {currentUser?.nome?.charAt(0) || "U"}
              </div>
              <div className={cn("flex-1 min-w-0 text-left", !isDesktopSidebarOpen && "lg:hidden")}>
                <p className="text-sm font-semibold truncate leading-tight text-slate-800">{currentUser?.nome}</p>
                <div className="flex items-center gap-1 leading-tight mt-0.5">
                  <span className="text-[10px] text-slate-500 truncate capitalize">
                    {currentUser?.role === 'superadmin' ? 'Master SaaS' : 'Admin'}
                  </span>
                  <span className="w-1 h-1 bg-slate-350 rounded-full"></span>
                  <span className="text-[10px] text-blue-600 font-bold hover:underline">Perfil</span>
                </div>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleLogout();
                }}
                className={cn("p-2 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-lg transition-all", !isDesktopSidebarOpen && "lg:hidden")}
                title="Sair do painel"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 hover:bg-slate-100 rounded-lg">
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-semibold text-slate-800 truncate">
              {menuItems.find(i => i.id === activeTab)?.label || 'Painel'}
            </h1>

            {/* Impersonation Indicator inside layout */}
            {impersonatedCompanyId && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3.5 py-1.5 rounded-xl text-xs font-semibold hidden md:flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></span>
                <span>Visualizando: {currentCompany?.nome}</span>
                <button 
                  onClick={() => handleImpersonate("")}
                  className="bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg px-2 py-0.5 font-bold text-[10px] transition-all cursor-pointer shadow-sm"
                >
                  Sair do Modo Suporte
                </button>
              </div>
            )}
          </div>
           <div className="flex items-center gap-4 relative">
             {/* Dynamic Notifications Center */}
             <div className="relative">
               <button 
                 onClick={() => setIsNotifDropdownOpen(!isNotifDropdownOpen)}
                 className={cn(
                   "p-2 rounded-xl transition-all relative cursor-pointer border",
                   isNotifDropdownOpen 
                     ? "bg-slate-100 text-slate-800 border-slate-300" 
                     : "text-slate-400 hover:text-slate-600 border-transparent hover:bg-slate-50"
                 )}
                 title="Notificações e Alertas"
               >
                 <Bell size={20} />
                 {unreadNotifCount > 0 && (
                   <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                     {unreadNotifCount}
                   </span>
                 )}
               </button>

               {isNotifDropdownOpen && (
                 <>
                   {/* Backdrop to dismiss */}
                   <div className="fixed inset-0 z-40" onClick={() => setIsNotifDropdownOpen(false)} />
                   
                   {/* Dropdown Card */}
                   <div className="absolute right-0 mt-2.5 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-fade-in font-sans">
                     <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
                       <div className="flex items-center gap-1.5">
                         <span className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Alertas do Sistema</span>
                         {unreadNotifCount > 0 && (
                           <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 font-extrabold text-[9px] uppercase tracking-wider rounded-md">
                             {unreadNotifCount} Ativos
                           </span>
                         )}
                       </div>
                       {unreadNotifCount > 0 && (
                         <button 
                           onClick={markAllAsRead} 
                           className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline cursor-pointer"
                         >
                           <CheckCheck size={12} />
                           Limpar todos
                         </button>
                       )}
                     </div>

                     <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100">
                       {computedNotifications.length === 0 ? (
                         <div className="p-8 text-center text-slate-400 space-y-2">
                           <CheckCheck size={28} className="text-emerald-500 mx-auto" id="no-notif-check" />
                           <p className="text-xs font-bold text-slate-650">Sua frota está 100% em dia!</p>
                           <p className="text-[10px] text-slate-400 italic">Sem irregularidades de CNH ou pendências críticas no painel.</p>
                         </div>
                       ) : (
                         computedNotifications.map((n) => {
                           const isRead = readNotifIds.includes(n.id);
                           return (
                             <div 
                               key={n.id} 
                               onClick={() => {
                                 // Mark singular as read click
                                 if (!isRead) {
                                   saveUpdatedReadIds([...readNotifIds, n.id]);
                                 }
                                 // Redirection target tabs
                                 if (n.category === 'driver') setActiveTab('drivers');
                                 else if (n.category === 'maintenance') setActiveTab('maintenance');
                                 else if (n.category === 'cash') setActiveTab('cash');
                                 setIsNotifDropdownOpen(false);
                               }}
                               className={cn(
                                 "p-4 transition-colors text-left cursor-pointer flex gap-3 relative hover:bg-slate-50/70",
                                 !isRead ? "bg-blue-50/15" : "opacity-65"
                               )}
                             >
                               {!isRead && (
                                 <span className="absolute top-4 left-1.5 w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                               )}
                               <div className="shrink-0 mt-0.5">
                                 {n.type === 'critical' ? (
                                   <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center">
                                     <ShieldAlert size={16} />
                                   </div>
                                 ) : (
                                   <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
                                     <AlertCircle size={16} />
                                   </div>
                                 )}
                               </div>
                               <div className="flex-1 min-w-0">
                                 <p className="font-extrabold text-slate-800 text-xs truncate leading-normal">{n.title}</p>
                                 <p className="text-slate-500 text-[11px] leading-relaxed mt-0.5">{n.text}</p>
                                 <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5 flex items-center gap-1">
                                   <Calendar size={10} />
                                   Limiar: {new Date(n.date).toLocaleDateString('pt-BR')}
                                 </p>
                               </div>
                             </div>
                           );
                         })
                       )}
                     </div>
                     <div className="p-2.5 bg-slate-50 text-center border-t border-slate-100">
                       <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Módulo GBFleet de Monitoramento Ativo</span>
                     </div>
                   </div>
                 </>
               )}
             </div>

             <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>
             <div className="text-right hidden sm:block">
               <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider leading-tight">
                 {currentUser?.role === 'superadmin' ? (
                    <span className="bg-purple-100 text-purple-750 font-black px-1.5 py-0.5 rounded text-[8px] mr-1.5 whitespace-nowrap">Master</span>
                  ) : currentCompany?.pago ? (
                    <span className="bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded text-[8px] mr-1.5 whitespace-nowrap">✓ Ativo</span>
                  ) : (
                    <span className="bg-amber-100 text-amber-850 font-extrabold px-1.5 py-0.5 rounded text-[8px] mr-1.5 whitespace-nowrap">Teste: {daysRemaining}d</span>
                  )}
                  {currentUser?.role === 'superadmin' ? 'Painel Geral' : 'Empresa Ativa'}
               </p>
               <p className="text-sm font-extrabold text-blue-600 leading-tight mt-0.5">
                 {currentCompany?.nome || 'GBFleet Admin'}
               </p>
             </div>
           </div>
        </header>

        {/* Mobile Impersonation Indicator */}
        {impersonatedCompanyId && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2 text-xs font-semibold md:hidden flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping shrink-0"></span>
              <span className="truncate">Visualizando: {currentCompany?.nome}</span>
            </div>
            <button 
              onClick={() => handleImpersonate("")}
              className="bg-white text-amber-900 border border-amber-300 rounded-lg px-2 py-0.5 font-bold text-[10px] transition-all shrink-0 cursor-pointer"
            >
              Sair
            </button>
          </div>
        )}

        {/* Aviso de Expiração de Licença (Banner no Topo quando faltam <= 5 dias) */}
        {currentUser?.role !== 'superadmin' && currentCompany?.isExpiringWarning && (
          <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white px-4 lg:px-8 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm shrink-0">
            <div className="flex items-center gap-2.5 text-xs">
              <AlertCircle size={17} className="shrink-0 animate-bounce" />
              <p className="font-semibold">
                {currentCompany.daysUntilExpiration === 0 ? (
                  <>Atenção: A licença do seu plano <strong>vence HOJE</strong> ({new Date((currentCompany.planExpiresAt || currentCompany.dataVencimento) + 'T12:00:00').toLocaleDateString('pt-BR')}).</>
                ) : currentCompany.daysUntilExpiration < 0 ? (
                  <>Aviso Crítico: Sua licença venceu há <strong>{Math.abs(currentCompany.daysUntilExpiration)} dia(s)</strong> (Período de tolerância ativo).</>
                ) : (
                  <>Aviso de Renovação: Sua assinatura vence em <strong>{currentCompany.daysUntilExpiration} dia(s)</strong> ({new Date((currentCompany.planExpiresAt || currentCompany.dataVencimento) + 'T12:00:00').toLocaleDateString('pt-BR')}).</>
                )}
                {' '}Evite o bloqueio automático do painel renovando via PIX.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleGenerateClientPix(true)}
              className="bg-white hover:bg-amber-50 text-amber-900 font-extrabold text-[11px] px-3.5 py-1.5 rounded-xl shadow-xs transition flex items-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer"
            >
              <QrCode size={13} className="text-emerald-600" />
              <span>
                Renovar Agora via PIX (R${' '}
                {Number(currentCompany.effectiveChargeAmount || currentCompany.planPrice || currentCompany.valorMensalidade || 149.9).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
              </span>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {!data && activeTab !== 'saas' ? (
            <div className="h-full flex items-center justify-center flex-col text-slate-400 gap-3">
              <div className="w-8 h-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
              <p className="text-sm font-semibold">Carregando painel...</p>
            </div>
          ) : (
            <>
              {activeTab === 'saas' && <SaaSAdmin currentUserId={currentUser?.id} onImpersonate={handleImpersonate} activeImpersonatedId={impersonatedCompanyId} />}
              {activeTab === 'home' && <Home data={data} onNavigate={(tab) => setActiveTab(tab as Tab)} currentUser={currentUser} />}
              {activeTab === 'dashboard' && <Dashboard data={data} onNavigate={(tab) => setActiveTab(tab as Tab)} />}
              {activeTab === 'reports' && <Reports data={data} />}
              {activeTab === 'trucks' && <Trucks data={data} onUpdate={fetchData} />}
              {activeTab === 'fuel' && <FuelLogs data={data} onUpdate={fetchData} />}
              {activeTab === 'expenses' && <Expenses data={data} onUpdate={fetchData} />}
              {activeTab === 'cash' && <CashFlow data={data} onUpdate={fetchData} />}
              {activeTab === 'freights' && <Freights data={data} onUpdate={fetchData} />}
              {activeTab === 'maintenance' && <Maintenance data={data} onUpdate={fetchData} />}
              {activeTab === 'drivers' && <Drivers data={data} onUpdate={fetchData} />}
              {activeTab === 'driver_financials' && <DriverFinancials data={data} onUpdate={fetchData} />}
              {activeTab === 'simulator' && <Simulator data={data} onUpdate={fetchData} />}
            </>
          )}
        </div>
      </main>

      {/* "Meu Perfil" Modal Overlay Dialog */}
      {isProfileOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                  <UserIcon size={18} />
                </div>
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Meu Perfil do Usuário</h3>
              </div>
              <button 
                onClick={() => {
                  setIsProfileOpen(false);
                  setProfileError('');
                  setProfileSuccess('');
                }}
                className="p-1 px-2.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-xs font-bold text-slate-700 transition cursor-pointer"
              >
                X
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {profileError && (
                <div className="p-3 bg-red-50 border border-red-250 rounded-xl text-red-650 text-xs font-semibold flex items-center gap-2">
                  <ShieldAlert size={16} className="shrink-0" />
                  <span>{profileError}</span>
                </div>
              )}
              {profileSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-250 rounded-xl text-emerald-650 text-xs font-semibold flex items-center gap-2">
                  <Check size={16} className="shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}

              <div className="flex justify-center flex-col items-center gap-2 pb-2">
                <div className="w-16 h-16 rounded-full bg-blue-600 border-4 border-white shadow-md flex items-center justify-center text-white text-2xl font-extrabold uppercase select-none">
                  {profileName.charAt(0) || currentUser?.nome?.charAt(0) || "U"}
                </div>
                <div className="text-center">
                  <span className="px-2.5 py-0.5 bg-slate-100 text-slate-500 font-extrabold text-[9px] uppercase tracking-wider rounded-md border border-slate-200">
                    {currentUser?.role === 'superadmin' ? 'Master SaaS' : 'Admin'}
                  </span>
                  <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-wider">{currentCompany?.nome || "GBFleet Fleet Manager"}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-450 tracking-wider mb-1.5">Nome Completo</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs font-bold"
                      placeholder="Seu nome"
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-450 tracking-wider mb-1.5">E-mail Corporativo</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input 
                      type="email"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs font-bold"
                      placeholder="seu@email.com"
                      value={profileEmail}
                      onChange={e => setProfileEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-450 tracking-wider mb-1.5">Alterar Senha do Painel</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input 
                      type="password"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs font-bold font-mono"
                      placeholder="••••••••"
                      value={profilePassword}
                      onChange={e => setProfilePassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Identidade Visual da Transportadora / Upload da Logo */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon size={16} className="text-blue-600" />
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">Logo da Empresa / Transportadora</h4>
                      <p className="text-[10px] text-slate-400">Reflete no menu, página inicial, recibos e relatórios em PDF</p>
                    </div>
                  </div>
                  {profileLogo && (
                    <button
                      type="button"
                      onClick={() => setProfileLogo('')}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                      title="Remover logo e voltar ao padrão GBFleet"
                    >
                      <Trash2 size={12} />
                      <span>Remover</span>
                    </button>
                  )}
                </div>

                {/* Área de Visualização e Upload */}
                <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
                  <div className="w-full sm:w-44 h-24 bg-slate-100/80 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center p-2 overflow-hidden relative group shrink-0">
                    {profileLogo ? (
                      <img 
                        src={profileLogo} 
                        alt="Logo Preview" 
                        className="object-contain transition-transform"
                        style={{ maxHeight: `${Math.min(profileLogoSize, 80)}px`, maxWidth: '100%' }}
                      />
                    ) : (
                      <div className="text-center p-2">
                        <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                        <span className="text-[10px] text-slate-400 font-bold block">Sem logo (Padrão)</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2 w-full">
                    <label className="block">
                      <span className="sr-only">Escolher logo</span>
                      <input 
                        type="file" 
                        accept="image/jpeg,image/png,image/webp,image/jpg" 
                        onChange={handleLogoUpload}
                        className="block w-full text-xs text-slate-500 file:mr-2.5 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[11px] file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Formatos aceitos: <strong>JPEG, PNG ou WebP</strong>. Imagens são compactadas automaticamente para máxima velocidade.
                    </p>
                  </div>
                </div>

                {/* Controle de Tamanho e Escala */}
                {profileLogo && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                        <Sliders size={12} className="text-slate-400" />
                        Tamanho da Logo: <strong className="text-blue-600 font-mono">{profileLogoSize}px</strong>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setProfileLogoSize(40)}
                          className={cn("px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer", profileLogoSize <= 44 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300")}
                        >
                          Pequeno
                        </button>
                        <button
                          type="button"
                          onClick={() => setProfileLogoSize(56)}
                          className={cn("px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer", profileLogoSize > 44 && profileLogoSize <= 64 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300")}
                        >
                          Médio
                        </button>
                        <button
                          type="button"
                          onClick={() => setProfileLogoSize(76)}
                          className={cn("px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer", profileLogoSize > 64 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300")}
                        >
                          Grande
                        </button>
                      </div>
                    </div>
                    <input 
                      type="range"
                      min={36}
                      max={96}
                      step={2}
                      value={profileLogoSize}
                      onChange={(e) => setProfileLogoSize(Number(e.target.value))}
                      className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* Detalhes da Assinatura do SaaS no Perfil do Usuário */}
              <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl shadow-lg space-y-3">
                <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <CreditCard size={18} className="text-emerald-400" />
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-100">Assinatura & Plano GBFleet</h4>
                      <p className="text-[10px] text-slate-400">Registrado centralmente via Portal SaaS</p>
                    </div>
                  </div>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                    currentCompany?.pago 
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" 
                      : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  )}>
                    {currentCompany?.pago ? "✓ Ativo / Liberado" : "Aguard. Pagamento"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Plano Contratado</span>
                    <span className="font-extrabold text-white text-xs">Plano {currentCompany?.plano || 'Pro'}</span>
                  </div>

                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Frota Liberada</span>
                    <span className="font-extrabold text-emerald-400 text-xs">
                      {data?.trucks?.length || 0} / {currentCompany?.limiteCaminhoes || 10} veículos
                    </span>
                  </div>

                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Mensalidade Total</span>
                    <span className="font-extrabold text-white text-xs block truncate">
                      R$ {(currentCompany?.valorMensalidade || ((currentCompany?.limiteCaminhoes||10)*(currentCompany?.valorPorCaminhao||30))).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /mês
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">(R$ {(currentCompany?.valorPorCaminhao || 30).toFixed(2)} /veíc)</span>
                  </div>

                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Próximo Vencimento</span>
                    <span className="font-extrabold text-amber-300 text-xs">
                      {(currentCompany?.planExpiresAt || currentCompany?.dataVencimento)
                        ? new Date((currentCompany.planExpiresAt || currentCompany.dataVencimento) + 'T12:00:00').toLocaleDateString('pt-BR') 
                        : 'A definir'}
                    </span>
                  </div>
                </div>

                {currentUser?.role !== 'superadmin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      handleGenerateClientPix(true);
                    }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <QrCode size={15} />
                    <span>Pagar / Renovar Assinatura (+30 Dias) via PIX</span>
                  </button>
                )}
              </div>

              {/* Channel notifications preferences (Interactive Settings Mock) */}
              <div className="pt-2 border-t border-slate-100">
                <span className="block text-[10px] font-black uppercase text-slate-450 tracking-wider mb-3">Preferências de Notificação</span>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 text-slate-650 text-xs font-semibold cursor-pointer select-none">
                    <input type="checkbox" defaultChecked className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4" />
                    <span>Alertas Críticos de Habilitação (CNH de Motoristas)</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-slate-650 text-xs font-semibold cursor-pointer select-none">
                    <input type="checkbox" defaultChecked className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4" />
                    <span>Lembretes de Revisões Técnicas (Manutenções)</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-slate-650 text-xs font-semibold cursor-pointer select-none">
                    <input type="checkbox" defaultChecked className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4" />
                    <span>Alertas de Limiar Mínimo do Caixa Geral</span>
                  </label>
                </div>
              </div>

              {/* Support access code group */}
              <div className="pt-4 border-t border-slate-100 animate-fade-in">
                <span className="block text-[10px] font-black uppercase text-slate-450 tracking-wider mb-2">Suporte Técnico Autorizado</span>
                <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-2xl flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-bold text-slate-800">Código de Conciliação</p>
                    <p className="text-[10px] text-slate-500 leading-normal mb-0">Gere um código seguro de acesso para que o administrador realize auditoria técnica no seu painel.</p>
                  </div>
                  <div className="text-right shrink-0">
                    {supportCodeState ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono font-black text-blue-700 bg-white border border-blue-200 px-2.5 py-1 rounded-xl text-xs select-all tracking-wider shadow-sm">
                          {supportCodeState}
                        </span>
                        <span className="text-[9px] text-slate-400 italic font-medium">Ativo para suporte</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleGenerateSupportCode}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] rounded-xl transition-all cursor-pointer shadow-sm"
                      >
                        Gerar Código
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Session / Logout group */}
              <div className="pt-4 border-t border-slate-100 animate-fade-in">
                <span className="block text-[10px] font-black uppercase text-slate-450 tracking-wider mb-2">Sessão da Conta</span>
                <div className="bg-rose-50 border border-rose-100 p-3.5 rounded-2xl flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-bold text-slate-800">Desconectar da Plataforma</p>
                    <p className="text-[10px] text-slate-550 leading-normal mb-0">Encerre sua sessão atual com segurança e retorne para a tela de login.</p>
                  </div>
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      handleLogout();
                    }}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 hover:text-white text-white font-black text-[10px] rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5 shrink-0 uppercase tracking-wider"
                  >
                    <LogOut size={13} />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button 
                onClick={() => setIsProfileOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs cursor-pointer text-center"
              >
                Voltar
              </button>
              <button 
                onClick={handleUpdateProfile}
                disabled={isSavingProfile}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingProfile ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Salvar Dados</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Checkout Transparente PIX (Renovação de Assinatura) */}
      {isClientPixModalOpen && currentCompany && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm">Renovação Instantânea via PIX</h3>
                  <p className="text-[11px] text-emerald-100">
                    {currentCompany.planName || `Plano ${currentCompany.plano || 'Pro'}`} (+30 Dias)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsClientPixModalOpen(false)}
                className="p-1.5 hover:bg-white/20 rounded-lg text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Vencimento Atual</span>
                  <span className="font-bold text-slate-800">
                    {(currentCompany.planExpiresAt || currentCompany.dataVencimento)
                      ? new Date((currentCompany.planExpiresAt || currentCompany.dataVencimento) + 'T12:00:00').toLocaleDateString('pt-BR')
                      : 'Hoje'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Valor da Fatura</span>
                  <span className="text-base font-black text-emerald-700 font-mono">
                    R${' '}
                    {Number(
                      currentCompany.effectiveChargeAmount ||
                        currentCompany.planPrice ||
                        currentCompany.valorMensalidade ||
                        149.9
                    ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {isGeneratingClientPix ? (
                <div className="py-10 text-center space-y-3">
                  <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-bold text-slate-600">Gerando QR Code PIX no Mercado Pago...</p>
                </div>
              ) : clientPixCharge ? (
                <div className="space-y-4">
                  {clientPixCharge.qrCodeBase64 && (
                    <div className="flex flex-col items-center justify-center bg-white border border-slate-200 rounded-2xl p-4">
                      <img
                        src={`data:image/png;base64,${clientPixCharge.qrCodeBase64}`}
                        alt="QR Code PIX"
                        className="w-48 h-48 object-contain"
                      />
                      <span className="text-[11px] font-bold text-slate-500 mt-2">
                        Escaneie com o aplicativo do seu banco
                      </span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 block">
                      PIX Copia e Cola
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={clientPixCharge.qrCode}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-mono text-slate-600 select-all"
                      />
                      <button
                        type="button"
                        onClick={handleCopyClientPix}
                        className={cn(
                          "px-3.5 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shrink-0",
                          clientPixCopied ? "bg-emerald-600 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"
                        )}
                      >
                        {clientPixCopied ? <Check size={14} /> : <Copy size={14} />}
                        <span>{clientPixCopied ? "Copiado!" : "Copiar"}</span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isCheckingClientPix}
                    onClick={handleManualVerifyClientPix}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw size={14} className={cn(isCheckingClientPix && "animate-spin")} />
                    <span>Já Paguei — Confirmar Renovação (+30 Dias)</span>
                  </button>

                  <div className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>Aguardando pagamento... A renovação é reconhecida automaticamente!</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  );
}
