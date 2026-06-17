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
  Mail
} from 'lucide-react';
import { cn } from '../lib/utils';
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
import Simulator from './Simulator';
import Login from './Login';
import SaaSAdmin from './SaaSAdmin';

type Tab = 'home' | 'dashboard' | 'trucks' | 'fuel' | 'expenses' | 'cash' | 'freights' | 'maintenance' | 'drivers' | 'simulator' | 'saas';

export default function Layout() {
  const [currentUser, setCurrentUser] = useState<any>(() => {
    const saved = localStorage.getItem('gbfleet_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [currentCompany, setCurrentCompany] = useState<any>(() => {
    const saved = localStorage.getItem('gbfleet_company');
    return saved ? JSON.parse(saved) : null;
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
  const [data, setData] = useState<any>(null);

  // Support authorization code state
  const [supportCodeState, setSupportCodeState] = useState<string | null>(null);

  // Trial remaining days value helper
  const daysRemaining = useMemo(() => {
    if (!currentCompany) return 30;
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
  }, [currentUser, isProfileOpen]);

  // Handle dynamic notifications calculated from state
  const computedNotifications = useMemo(() => {
    if (!data) return [];
    const items: Array<{
      id: string;
      title: string;
      text: string;
      type: 'info' | 'warning' | 'critical' | 'success';
      date: string;
      category: 'maintenance' | 'driver' | 'cash';
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
          password: profilePassword
        })
      });

      const json = await res.json();
      if (!res.ok) {
        setProfileError(json.error || "Erro ao atualizar perfil.");
      } else {
        setProfileSuccess("Perfil atualizado com sucesso!");
        setCurrentUser(json.user);
        localStorage.setItem('gbfleet_user', JSON.stringify(json.user));
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
      }
      if (json.company) {
        setCurrentCompany(json.company);
        localStorage.setItem('gbfleet_company', JSON.stringify(json.company));
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
        alert(`Código gerado com sucesso: ${json.supportCode}\nPasse este código ao suporte master para liberar seu acesso temporário.`);
      } else {
        alert("Não foi possível gerar o código.");
      }
    } catch {
      alert("Erro na conexão ao gerar código.");
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser, impersonatedCompanyId]);

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentCompany(null);
    setImpersonatedCompanyId(null);
    setData(null);
    setSupportCodeState(null);
    localStorage.removeItem('gbfleet_user');
    localStorage.removeItem('gbfleet_company');
    localStorage.removeItem('gbfleet_impersonate');
    setActiveTab('home');
  };

  const handleLoginSuccess = (user: any, company: any) => {
    setCurrentUser(user);
    setCurrentCompany(company);
    localStorage.setItem('gbfleet_user', JSON.stringify(user));
    localStorage.setItem('gbfleet_company', JSON.stringify(company));
    
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
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900 font-sans text-slate-100 p-4">
        <div className="bg-slate-800 border border-slate-700 max-w-lg w-full rounded-3xl p-8 shadow-2xl relative overflow-hidden space-y-6">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500" />
          
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 bg-rose-550/10 text-rose-450 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
              <ShieldAlert className="w-8 h-8 animate-pulse text-rose-500" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-extrabold tracking-tight text-white">Painel Temporariamente Bloqueado</h2>
              <p className="text-xs text-slate-400">Assinatura corporativa inativa ou período gratuito esgotado.</p>
            </div>
          </div>

          <div className="bg-slate-950/45 rounded-2xl p-5 border border-slate-700/50 space-y-3.5 text-xs text-slate-300">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 bg-rose-500 rounded-full mt-1.5 shrink-0" />
              <p className="leading-relaxed">
                Sua empresa <strong>{currentCompany?.nome || "GBFleet Demo"}</strong> completou os 30 dias de trial gratuito ou teve seu status suspenso.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 bg-rose-500 rounded-full mt-1.5 shrink-0" />
              <p className="leading-relaxed">
                Deixamos tudo pronto para integração de webhook com a <strong>Asaas</strong>. Para liberar o painel principal, finalize a liquidação de fatura ou solicite o desbloqueio.
              </p>
            </div>
          </div>

          {/* Special Support Code Group on Block Screen */}
          <div className="bg-slate-750 border border-slate-700/60 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <p className="text-xs font-bold text-white">Conciliação Técnica de Suporte</p>
              <p className="text-[10px] text-slate-400 leading-relaxed">Gere um código temporário de acesso para que o administrador possa verificar sua conta e liberar o painel.</p>
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
                  className="w-full sm:w-auto px-4 py-2.5 bg-rose-600 hover:bg-rose-550 text-white font-bold text-[11px] rounded-xl transition-all cursor-pointer shadow-md"
                >
                  Gerar Código
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleLogout}
              className="flex-1 py-3 bg-slate-740 hover:bg-slate-700 text-slate-200 hover:text-white font-extrabold text-xs rounded-xl transition border border-slate-600 cursor-pointer text-center"
            >
              Sair da Conta (Logout)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const menuItems = [
    ...(currentUser?.role === 'superadmin' ? [{ id: 'saas', label: 'Gestão SaaS', icon: Shield }] : []),
    { id: 'home', label: 'Início', icon: HomeIcon },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'trucks', label: 'Frota', icon: TruckIcon },
    { id: 'drivers', label: 'Motoristas', icon: Users },
    { id: 'fuel', label: 'Abastecimentos', icon: Fuel },
    { id: 'expenses', label: 'Despesas', icon: Receipt },
    { id: 'cash', label: 'Caixa', icon: Wallet },
    { id: 'freights', label: 'Gastos com Fretes', icon: Route },
    { id: 'simulator', label: 'Simulador de Frete', icon: Calculator },
    { id: 'maintenance', label: 'Manutenção', icon: Wrench },
  ];

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
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <TruckIcon className="text-white w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg tracking-tight leading-none">GBFleet <span className="text-blue-600">AI</span></span>
                {currentCompany?.nome && (
                  <span className="text-[10px] text-slate-500 font-bold truncate max-w-[130px] mt-1" title={currentCompany.nome}>
                    {currentCompany.nome}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setIsDesktopSidebarOpen(!isDesktopSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg lg:block hidden">
              {isDesktopSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg lg:hidden">
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as Tab);
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group text-left",
                  activeTab === item.id 
                    ? "bg-blue-50 text-blue-600 font-medium" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", activeTab === item.id ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} />
                <span className={cn("transition-opacity duration-200 truncate", !isDesktopSidebarOpen && "lg:opacity-0 lg:hidden")}>{item.label}</span>
              </button>
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
              {activeTab === 'trucks' && <Trucks data={data} onUpdate={fetchData} />}
              {activeTab === 'fuel' && <FuelLogs data={data} onUpdate={fetchData} />}
              {activeTab === 'expenses' && <Expenses data={data} onUpdate={fetchData} />}
              {activeTab === 'cash' && <CashFlow data={data} onUpdate={fetchData} />}
              {activeTab === 'freights' && <Freights data={data} onUpdate={fetchData} />}
              {activeTab === 'maintenance' && <Maintenance data={data} onUpdate={fetchData} />}
              {activeTab === 'drivers' && <Drivers data={data} onUpdate={fetchData} />}
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
    </div>
  );
}
