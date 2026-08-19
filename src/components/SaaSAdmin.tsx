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
  Wallet, 
  Briefcase, 
  X,
  CreditCard,
  CircleCheck,
  TrendingUp,
  Loader2
} from "lucide-react";
import { cn } from "../lib/utils";
import { showToast } from "./ui/Toast";

interface CompanyMeta {
  id: string;
  nome: string;
  plano: string;
  createdAt: string;
  truckCount: number;
  driverCount: number;
  freightCount: number;
  userCount: number;
  balance: number;
  status: string;
  pago: boolean;
  trialDays: number;
  daysRemaining: number;
  supportCode: string | null;
  dataVencimento?: string;
  limiteCaminhoes?: number;
  valorPorCaminhao?: number;
  valorMensalidade?: number;
  adminUser?: {
    id: string;
    nome: string;
    email: string;
  } | null;
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

  // Form State
  const [isSaving, setIsSaving] = useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [plano, setPlano] = useState("Pro");
  const [adminNome, setAdminNome] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit Subscription Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyMeta | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editPlano, setEditPlano] = useState("Pro");
  const [editStatus, setEditStatus] = useState("ativo");
  const [editPago, setEditPago] = useState(false);
  const [editTrialDays, setEditTrialDays] = useState(30);
  const [editCreatedAt, setEditCreatedAt] = useState("");
  const [editAdminNome, setEditAdminNome] = useState("");
  const [editAdminEmail, setEditAdminEmail] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [editDataVencimento, setEditDataVencimento] = useState("");
  const [editLimiteCaminhoes, setEditLimiteCaminhoes] = useState(10);
  const [editValorPorCaminhao, setEditValorPorCaminhao] = useState(30);
  const [editValorMensalidade, setEditValorMensalidade] = useState(300);

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

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !adminNome || !adminEmail || !adminPassword) {
      showToast("Preencha todos os campos obrigatórios da nova empresa.", 'error');
      return;
    }

    if (isSaving) return;
    setIsSaving(true);

    try {
      const res = await fetch("/api/superadmin/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUserId,
        },
        body: JSON.stringify({ nome, plano, adminNome, adminEmail, adminPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao cadastrar empresa.");
      }

      showToast("✓ Empresa e administrador criados com sucesso no banco!", 'success');
      setSuccessMsg("Empresa e administrador criados com absoluto sucesso!");
      setNome("");
      setAdminNome("");
      setAdminEmail("");
      setAdminPassword("");
      setPlano("Pro");
      fetchCompanies();
      setTimeout(() => setSuccessMsg(null), 4000);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Erro ao criar empresa.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePlan = async (companyId: string, currentPlan: string) => {
    const plans = ["Basic", "Pro", "Enterprise"];
    const currentIdx = plans.indexOf(currentPlan);
    const nextPlan = plans[(currentIdx + 1) % plans.length];

    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUserId,
        },
        body: JSON.stringify({ plano: nextPlan }),
      });

      if (!res.ok) {
        throw new Error("Erro ao mudar plano");
      }

      showToast(`✓ Plano alterado para ${nextPlan} com sucesso!`, 'success');
      fetchCompanies();
    } catch (err) {
      console.error(err);
      showToast("Erro ao alterar o plano.", 'error');
    }
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

      showToast(`✓ Empresa "${name}" excluída com sucesso do banco!`, 'success');
      // If active impersonated was deleted, deactivate context
      if (activeImpersonatedId === companyId) {
        onImpersonate("");
      }

      fetchCompanies();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Erro ao excluir empresa.", 'error');
    } finally {
      setDeletingCompanyId(null);
    }
  };

  const handleOpenEditModal = (company: CompanyMeta) => {
    setSelectedCompany(company);
    setEditNome(company.nome);
    setEditPlano(company.plano);
    setEditStatus(company.status || "ativo");
    setEditPago(!!company.pago);
    setEditTrialDays(company.trialDays !== undefined ? company.trialDays : 30);
    setEditCreatedAt(company.createdAt ? company.createdAt.substring(0, 10) : new Date().toISOString().substring(0, 10));
    setEditAdminNome(company.adminUser?.nome || "");
    setEditAdminEmail(company.adminUser?.email || "");
    setEditAdminPassword("");

    const defaultDueDate = company.dataVencimento || (
      company.createdAt 
        ? new Date(new Date(company.createdAt).getTime() + (company.trialDays || 30) * 86400000).toISOString().substring(0, 10)
        : new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10)
    );
    setEditDataVencimento(defaultDueDate);

    const lim = company.limiteCaminhoes !== undefined ? company.limiteCaminhoes : 10;
    const valCam = company.valorPorCaminhao !== undefined ? company.valorPorCaminhao : 30;
    const valTot = company.valorMensalidade !== undefined ? company.valorMensalidade : (lim * valCam);

    setEditLimiteCaminhoes(lim);
    setEditValorPorCaminhao(valCam);
    setEditValorMensalidade(valTot);

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

      const res = await fetch(`/api/superadmin/companies/${selectedCompany.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUserId,
        },
        body: JSON.stringify({
          nome: editNome,
          plano: editPlano,
          status: editStatus,
          pago: editPago,
          trialDays: Number(editTrialDays),
          createdAt: isoCreatedAt,
          adminNome: editAdminNome,
          adminEmail: editAdminEmail,
          adminPassword: editAdminPassword,
          dataVencimento: editDataVencimento,
          limiteCaminhoes: Number(editLimiteCaminhoes),
          valorPorCaminhao: Number(editValorPorCaminhao),
          valorMensalidade: Number(editValorMensalidade)
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao atualizar assinatura.");
      }

      showToast(`✓ Assinatura e limites de "${editNome}" gravados no banco com sucesso!`, 'success');
      setSuccessMsg(`Sucesso: Cadastro e assinatura de "${editNome}" atualizados!`);
      setIsEditModalOpen(false);
      setSelectedCompany(null);
      fetchCompanies();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Não foi possível atualizar os limites comerciais.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Aggregated System Metrics
  const totalCompanies = companies.length;
  const totalTrucks = companies.reduce((sum, c) => sum + c.truckCount, 0);
  const totalDrivers = companies.reduce((sum, c) => sum + c.driverCount, 0);
  const totalConsolidatedBalance = companies.reduce((sum, c) => sum + c.balance, 0);

  return (
    <div className="space-y-8 font-sans text-slate-800">
      {/* Upper banner explaining the role */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 md:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="bg-white/20 text-white font-bold text-[10px] tracking-wider uppercase px-2.5 py-1 rounded-full border border-white/10">
            Painel Master SaaS
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Portal de Gestão de Clientes (B2B)</h2>
          <p className="text-sm text-blue-100 max-w-xl">
            Como fundador e administrador, você gerencia novas empresas, altera planos comerciais de assinatura e pode auditar ou dar suporte aos clientes impersonando as contas deles com 1 clique.
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Empresas Ativas</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Building size={18} />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-extrabold text-slate-900">{totalCompanies}</h3>
            <p className="text-xs text-slate-500 mt-1">Clientes corporativos ativos</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Caminhões Monitorados</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Truck size={18} />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-extrabold text-slate-900">{totalTrucks}</h3>
            <p className="text-xs text-slate-500 mt-1">Frota consolidada de clientes</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Motoristas Ativos</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users size={18} />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-extrabold text-slate-900">{totalDrivers}</h3>
            <p className="text-xs text-slate-500 mt-1">Motoristas cadastrados no SaaS</p>
          </div>
        </div>
      </div>

      {/* Companies List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Portfólio de Empresas e Cooperativas</h3>
            <p className="text-xs text-slate-500 mt-1">Controle de acesso, cobrança e suporte direto.</p>
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
            <p className="text-xs max-w-sm mx-auto text-slate-500">Comece fechando uma venda B2B e criando a conta da cooperativa ou transportadora pelo botão acima!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-widest font-extrabold">
                  <th className="py-4 px-6">Empresa / Cliente</th>
                  <th className="py-4 px-6">Plano Assinatura</th>
                  <th className="py-4 px-6">Frota / Limite</th>
                  <th className="py-4 px-6">Mensalidade & Vencimento</th>
                  <th className="py-4 px-6">Motoristas & Fretes</th>
                  <th className="py-4 px-6">Data de Adesão</th>
                  <th className="py-4 px-6 text-right">Suporte & Controles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {companies.map((company) => {
                  const isBeingImpersonated = activeImpersonatedId === company.id;
                  const limCam = company.limiteCaminhoes || 10;
                  const valCam = company.valorPorCaminhao || 30;
                  const valMensal = company.valorMensalidade || (limCam * valCam);
                  const vencStr = company.dataVencimento 
                    ? new Date(company.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR') 
                    : 'A definir';

                  return (
                    <tr 
                      key={company.id} 
                      className={cn(
                        "hover:bg-slate-50 transition-colors",
                        isBeingImpersonated && "bg-blue-50/50 hover:bg-blue-50"
                      )}
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center font-bold font-mono">
                            {company.nome.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 text-sm block">
                              {company.nome}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-400 font-mono">
                                ID: {company.id}
                              </span>
                              {company.status === "inativo" ? (
                                <span className="bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">Inativo</span>
                              ) : company.pago ? (
                                <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">✓ Liberado</span>
                              ) : (
                                <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">Aguard. Pagam.</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <button
                          type="button"
                          onClick={() => handleChangePlan(company.id, company.plano)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer",
                            company.plano === "Enterprise" && "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100",
                            company.plano === "Pro" && "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
                            company.plano === "Basic" && "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          )}
                          title="Clique para alternar o plano"
                        >
                          Plano {company.plano}
                        </button>
                      </td>
                      <td className="py-4 px-6 font-semibold text-slate-700">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">{company.truckCount} / {limCam} caminhões</span>
                          <span className="text-[10px] text-slate-400">R$ {valCam.toFixed(2)} / veíc</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-600">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-emerald-700">R$ {valMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /mês</span>
                          <span className="text-[10px] text-slate-500 font-medium">Venc: {vencStr}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-500">
                        {company.driverCount} motoristas • {company.freightCount} fretes
                      </td>
                      <td className="py-4 px-6 text-slate-500">
                        {new Date(company.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(company)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl transition border border-transparent hover:border-slate-300 flex items-center gap-1 cursor-pointer"
                            title="Gerenciar período de teste, pagamentos e bloqueios"
                          >
                            <span>Assinatura</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onImpersonate(company.id)}
                            className={cn(
                              "px-3 py-1.5 rounded-xl font-bold text-[11px] transition-all flex items-center gap-1.5 cursor-pointer",
                              isBeingImpersonated 
                                ? "bg-blue-600 text-white shadow-sm" 
                                : "bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600"
                            )}
                          >
                            <ExternalLink size={13} />
                            <span>{isBeingImpersonated ? "Suportando" : "Acessar"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCompany(company.id, company.nome)}
                            disabled={deletingCompanyId === company.id}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            title="Desativar Empresa"
                          >
                            {deletingCompanyId === company.id ? (
                              <Loader2 size={15} className="animate-spin text-rose-600" />
                            ) : (
                              <Trash2 size={15} />
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

      {/* Modal - Create Company */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                  <Building className="text-white w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Ativação Comercial de Empresa</h3>
                  <p className="text-[11px] text-slate-500">Preencha os dados da transportadora e sua conta master.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCompany} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Seção Dados da Empresa */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">1. Dados da Transportadora</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Razão Social / Nome Fantasia *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Transportadora Rota Sul Ltda"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Plano Comercial</label>
                    <select
                      value={plano}
                      onChange={(e) => setPlano(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="Basic">Basic (Até 3 cam.)</option>
                      <option value="Pro">Pro (Até 15 cam.)</option>
                      <option value="Enterprise">Enterprise (Ilimit.)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Seção Diretor / Gestor Principal */}
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">2. Administrador Geral (Gestor do Cliente)</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">Nome do Gestor *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Carlos Oliveira"
                        value={adminNome}
                        onChange={(e) => setAdminNome(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">E-mail Comercial (Login de Acesso) *</label>
                      <input
                        type="email"
                        required
                        placeholder="Ex: carlos@rotasul.com"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 w-1/2">
                    <label className="text-[11px] font-bold text-slate-600 block">Senha para Primeiro Acesso *</label>
                    <input
                      type="password"
                      required
                      placeholder="Criar senha temporária"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-100 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Gravando no banco...</span>
                    </>
                  ) : (
                    <span>Ativar Cliente</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal - Edit Subscription */}
      {isEditModalOpen && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200 animate-fade-in max-h-[90vh] flex flex-col">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 text-blue-600 rounded-xl flex items-center justify-center border border-slate-200">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Controle de Assinatura & Tempo</h3>
                  <p className="text-[11px] text-slate-500">Soberania completa sobre prazos, faturas e status de <strong>{selectedCompany.nome}</strong></p>
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

            <form onSubmit={handleUpdateCompanySubscription} className="p-6 space-y-5 overflow-y-auto flex-1">
              
              {/* Seção Dados Básicos e Comercial */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Razão Social / Nome Fantasia</label>
                    <input
                      type="text"
                      required
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Plano de Assinatura</label>
                    <select
                      value={editPlano}
                      onChange={(e) => setEditPlano(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                    >
                      <option value="Basic">Basic (Até 3 cam.)</option>
                      <option value="Pro">Pro (Até 15 cam.)</option>
                      <option value="Enterprise">Enterprise (Ilimit.)</option>
                    </select>
                  </div>
                </div>

                {/* Seção Autonomia Comercial: Dias de Trial / Pago / Status */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-450">Parâmetros Ativos de Liberação</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Status da Conta: Ativo ou Inativo (Bloqueia o painel geral de acesso) */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 block">Status da Conta</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                      >
                        <option value="ativo">Ativo (Acesso autorizado)</option>
                        <option value="inativo">Inativo / Bloqueado (Impede login e navegação)</option>
                      </select>
                    </div>

                    {/* Pago ou Não Pago: Se falso, calcula daysRemaining e bloqueia após expirar */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-600 block">Status de Faturamento (Asaas)</label>
                      <label className="flex items-center gap-2.5 bg-white border border-slate-200 p-2.5 rounded-xl cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={editPago}
                          onChange={(e) => setEditPago(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4.5 h-4.5" 
                        />
                        <div className="text-left leading-tight">
                          <p className="text-xs font-bold text-slate-800">Liberado / Pago</p>
                          <p className="text-[9px] text-slate-400">Ignora limite de tempo de teste</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200/60">
                    {/* Trial dias de teste */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 block">Período de Testes (Dias)</label>
                      <div className="relative">
                        <input
                          type="number"
                          required
                          min="0"
                          max="365"
                          value={editTrialDays}
                          onChange={(e) => setEditTrialDays(Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold font-mono"
                        />
                        <span className="absolute right-3 top-2 text-[10px] uppercase font-bold text-slate-400">Dias</span>
                      </div>
                    </div>

                    {/* CreatedAt to simulate/adjust start date */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 block">Data de Adesão / Início</label>
                      <input
                        type="date"
                        required
                        value={editCreatedAt}
                        onChange={(e) => setEditCreatedAt(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold font-mono"
                      />
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 italic leading-relaxed pt-1 flex items-start gap-1">
                    <span className="text-rose-500 font-bold">*</span>
                    <p>Caso o faturamento esteja como "Aguardando pagamento" (não marcado como Liberado), o painel verificará se a data de adesão somada aos dias de teste é maior que o dia de hoje para autorizar ou bloquear o painel principal.</p>
                  </div>
                </div>

                {/* Seção Cálculo e Precificação por Caminhão */}
                <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-200/60 space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Truck size={14} className="text-emerald-600" />
                      Assinatura por Frota & Faturamento Recorrente
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                      Cálculo por Caminhão
                    </span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    {/* Limite de caminhões */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">Qtd. Caminhões Liberados</label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={editLimiteCaminhoes}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setEditLimiteCaminhoes(val);
                          setEditValorMensalidade(val * editValorPorCaminhao);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                      />
                      <p className="text-[9px] text-slate-400">Ex: 10 caminhões</p>
                    </div>

                    {/* Preço por caminhão */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">Valor por Caminhão (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editValorPorCaminhao}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setEditValorPorCaminhao(val);
                          setEditValorMensalidade(editLimiteCaminhoes * val);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                      />
                      <p className="text-[9px] text-slate-400">Ex: R$ 30,00 por veíc</p>
                    </div>

                    {/* Mensalidade total calculada */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">Mensalidade Total (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editValorMensalidade}
                        onChange={(e) => setEditValorMensalidade(Number(e.target.value))}
                        className="w-full bg-emerald-100/60 border border-emerald-300 rounded-xl px-3 py-2 text-xs font-black text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                      />
                      <p className="text-[9px] text-emerald-700 font-bold">Valor cobrado mensal</p>
                    </div>
                  </div>

                  {/* Data de Vencimento */}
                  <div className="pt-2 border-t border-emerald-200/50 grid grid-cols-1 md:grid-cols-2 gap-3.5 items-center">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">Data de Vencimento da Assinatura</label>
                      <input
                        type="date"
                        required
                        value={editDataVencimento}
                        onChange={(e) => setEditDataVencimento(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight">
                      <p className="font-bold text-slate-700">Reflexo no Perfil do Usuário:</p>
                      <p>Vencimento em <strong>{editDataVencimento ? new Date(editDataVencimento + 'T12:00:00').toLocaleDateString('pt-BR') : 'A definir'}</strong>. O cliente verá os detalhes e alertas no seu próprio perfil.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção Gestor / Cadastro do Cliente */}
              <div className="p-4 bg-blue-50/20 rounded-2xl border border-blue-100/50 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                  Dados Cadastrais do Gestor (Admin)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Nome do Gestor</label>
                    <input
                      type="text"
                      value={editAdminNome}
                      onChange={(e) => setEditAdminNome(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">E-mail Comercial (Login)</label>
                    <input
                      type="email"
                      value={editAdminEmail}
                      onChange={(e) => setEditAdminEmail(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1.5 pt-1.5">
                  <label className="text-[11px] font-bold text-slate-600 block">Alterar Senha do Cliente</label>
                  <input
                    type="password"
                    placeholder="Deixe em branco para manter a senha atual"
                    value={editAdminPassword}
                    onChange={(e) => setEditAdminPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                  />
                  <p className="text-[9px] text-slate-400">A senha é mantida oculta por privacidade. Preencha acima se desejar definir uma nova senha para este gestor.</p>
                </div>
              </div>

              {/* Support context if exists */}
              {selectedCompany.supportCode && (
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-2xl flex items-center justify-between text-xs text-blue-800">
                  <div className="space-y-0.5">
                    <p className="font-bold">Código de Suporte Fornecido</p>
                    <p className="text-[10px] text-slate-500">Este cliente forneceu um código para assistência atualmente.</p>
                  </div>
                  <div className="font-mono bg-white px-2.5 py-1 rounded-xl border border-blue-200 font-black text-xs tracking-wider">
                    {selectedCompany.supportCode}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedCompany(null);
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-100 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Gravando no banco...</span>
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
    </div>
  );
}
