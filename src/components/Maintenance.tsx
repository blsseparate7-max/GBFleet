import React, { useState } from 'react';
import { 
  Wrench, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar, 
  Gauge, 
  Plus, 
  Trash2, 
  TrendingUp, 
  AlertCircle,
  Clock,
  DollarSign,
  User,
  Activity
} from 'lucide-react';
import Modal from './ui/Modal';
import { cn, maskBRL, unmaskBRL } from '../lib/utils';

interface MaintenanceProps {
  data: any;
  onUpdate: () => void;
}

export default function Maintenance({ data, onUpdate }: MaintenanceProps) {
  const [isNewAlertModalOpen, setIsNewAlertModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTruck, setFilterTruck] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // New alert form state
  const [newAlert, setNewAlert] = useState({
    truckId: '',
    tipo: 'Troca de Óleo',
    prioridade: 'alta',
    tipoLimite: 'km',
    limiteKm: '',
    limiteData: '',
    descricao: ''
  });

  // Complete alert form state
  const [completeForm, setCompleteForm] = useState({
    custo: '',
    dataRealizada: new Date().toISOString().split('T')[0],
    meioPagamento: 'Pix',
    oficina: '',
    observacao: ''
  });

  if (!data) return null;

  // Helper to get latest KM of a truck
  const getTruckLatestKm = (truckId: string): number => {
    const truckLogs = data.fuel_logs.filter((log: any) => log.truckId === truckId);
    if (truckLogs.length === 0) {
      // Return a standard baseline if no fuel logs exist yet
      if (truckId === 'ABC-1234') return 120000;
      if (truckId === 'XYZ-5678') return 85000;
      return 100000;
    }
    return Math.max(...truckLogs.map((log: any) => Number(log.km)));
  };

  // Process and compute true real-time alert state
  const processedAlerts = data.maintenance_alerts.map((alert: any) => {
    if (alert.status === 'Realizado') {
      return {
        ...alert,
        computedStatus: 'Realizado',
        progressoDesc: 'Concluído'
      };
    }

    const currentKm = getTruckLatestKm(alert.truckId);

    if (alert.tipoLimite === 'km') {
      const restKm = alert.limiteKm - currentKm;
      let computedStatus = 'Pendente';
      
      if (restKm <= 0) {
        computedStatus = 'Vencido';
      } else if (restKm <= 3000) {
        computedStatus = 'Atenção';
      }

      return {
        ...alert,
        currentKm,
        restKm,
        computedStatus,
        progressoDesc: restKm <= 0 
          ? `Vencido há ${Math.abs(restKm).toLocaleString()} km` 
          : `Faltam ${restKm.toLocaleString()} km para a troca`
      };
    } else {
      // date limit check
      const limitTime = new Date(alert.limiteData).getTime();
      const currentTime = new Date().getTime();
      const diffDays = Math.ceil((limitTime - currentTime) / (1000 * 60 * 60 * 24));
      
      let computedStatus = 'Pendente';
      
      if (diffDays <= 0) {
        computedStatus = 'Vencido';
      } else if (diffDays <= 15) {
        computedStatus = 'Atenção';
      }

      return {
        ...alert,
        diffDays,
        computedStatus,
        progressoDesc: diffDays <= 0 
          ? `Vencido há ${Math.abs(diffDays)} dia(s)` 
          : `Faltam ${diffDays} dia(s) (${new Date(alert.limiteData).toLocaleDateString('pt-BR')})`
      };
    }
  });

  // Filter and Search logic
  const filteredAlerts = processedAlerts.filter((alert: any) => {
    const truckMatches = !filterTruck || alert.truckId === filterTruck;
    const statusMatches = !filterStatus || alert.computedStatus === filterStatus;
    const searchMatches = !searchTerm || 
      alert.truckId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.tipo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.descricao.toLowerCase().includes(searchTerm.toLowerCase());
    return truckMatches && statusMatches && searchMatches;
  });

  // Stats Counters
  const countTotal = processedAlerts.length;
  const countVencidos = processedAlerts.filter((a: any) => a.computedStatus === 'Vencido').length;
  const countAtencao = processedAlerts.filter((a: any) => a.computedStatus === 'Atenção').length;
  const countConcluidos = processedAlerts.filter((a: any) => a.computedStatus === 'Realizado').length;

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlert.truckId || !newAlert.tipo) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    if (newAlert.tipoLimite === 'km' && !newAlert.limiteKm) {
      alert("Informe a quilometragem recomendada");
      return;
    }

    if (newAlert.tipoLimite === 'data' && !newAlert.limiteData) {
      alert("Informe a data limite");
      return;
    }

    try {
      const companyId = data?.company?.id || 'comp_1';
      const response = await fetch('/api/maintenance_alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          truckId: newAlert.truckId,
          tipo: newAlert.tipo,
          prioridade: newAlert.prioridade,
          tipoLimite: newAlert.tipoLimite,
          limiteKm: newAlert.tipoLimite === 'km' ? Number(newAlert.limiteKm) : 0,
          limiteData: newAlert.tipoLimite === 'data' ? newAlert.limiteData : "",
          descricao: newAlert.descricao || `Revisão periódica de ${newAlert.tipo}`
        })
      });

      if (response.ok) {
        setIsNewAlertModalOpen(false);
        // Reset form
        setNewAlert({
          truckId: '',
          tipo: 'Troca de Óleo',
          prioridade: 'alta',
          tipoLimite: 'km',
          limiteKm: '',
          limiteData: '',
          descricao: ''
        });
        onUpdate();
      } else {
        alert("Falha ao registrar novo alerta.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao conectar com o servidor.");
    }
  };

  const handleCompleteAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlert) return;

    try {
      const response = await fetch(`/api/maintenance_alerts/${selectedAlert.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custo: Number(completeForm.custo || 0),
          dataRealizada: completeForm.dataRealizada,
          meioPagamento: completeForm.meioPagamento,
          oficina: completeForm.oficina,
          observacao: completeForm.observacao
        })
      });

      if (response.ok) {
        setIsCompleteModalOpen(false);
        setSelectedAlert(null);
        setCompleteForm({
          custo: '',
          dataRealizada: new Date().toISOString().split('T')[0],
          meioPagamento: 'Pix',
          oficina: '',
          observacao: ''
        });
        onUpdate();
      } else {
        alert("Erro ao marcar alerta como realizado.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão.");
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!confirm("Tem certeza que deseja excluir este alerta de manutenção de forma definitiva?")) {
      return;
    }

    try {
      const response = await fetch(`/api/maintenance_alerts/${alertId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        onUpdate();
      } else {
        alert("Erro ao excluir alerta.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upper header action row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Alertas de Manutenção</h2>
          <p className="text-sm text-slate-500 font-medium">Controle de revisões, troca de peças, óleo e segurança da frota</p>
        </div>
        <button 
          onClick={() => setIsNewAlertModalOpen(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
        >
          <Plus size={20} />
          Novo Alerta / Plano
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-500">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Total Monitorado</p>
            <p className="text-2xl font-black text-slate-800">{countTotal}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Críticos / Vencidos</p>
            <p className="text-2xl font-black text-red-600">{countVencidos}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Atenção Breve</p>
            <p className="text-2xl font-black text-amber-600">{countAtencao}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Histórico Resolvido</p>
            <p className="text-2xl font-black text-emerald-600">{countConcluidos}</p>
          </div>
        </div>
      </div>

      {/* Filter panel */}
      <div className="flex flex-col md:flex-row gap-4">
        <input 
          type="text" 
          placeholder="Buscar por placa, tipo ou detalhe..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
        />
        <select
          value={filterTruck}
          onChange={e => setFilterTruck(e.target.value)}
          className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 focus:outline-none"
        >
          <option value="">Todos os Veículos</option>
          {data.trucks.map((t: any) => (
            <option key={t.id} value={t.placa}>{t.placa}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 focus:outline-none"
        >
          <option value="">Todos os Status</option>
          <option value="Vencido">Crítico / Vencido</option>
          <option value="Atenção">Atenção</option>
          <option value="Pendente">Em Dia / Pendente</option>
          <option value="Realizado">Realizado</option>
        </select>
      </div>

      {/* Primary alert lists cards */}
      <div className="grid grid-cols-1 gap-6">
        {filteredAlerts.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 py-16 text-center shadow-xs">
            <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wrench size={28} />
            </div>
            <h4 className="text-base font-bold text-slate-700">Tudo em ordem</h4>
            <p className="text-sm text-slate-400 mt-1">Nenhum plano de manutenção ou alerta encontrado para o filtro atual.</p>
          </div>
        ) : (
          filteredAlerts.map((alert: any) => {
            const isVencido = alert.computedStatus === 'Vencido';
            const isAtencao = alert.computedStatus === 'Atenção';
            const isRealizado = alert.computedStatus === 'Realizado';

            // Calculate percentage if metric is km
            let pct = 0;
            if (alert.tipoLimite === 'km' && !isRealizado) {
              const startKm = alert.limiteKm - 10000; // Look at a standard 10,000km cycle progress
              const totalCycle = 10000;
              const completedInCycle = alert.currentKm - startKm;
              pct = Math.max(0, Math.min(100, Math.round((completedInCycle / totalCycle) * 100)));
            }

            return (
              <div 
                key={alert.id}
                className={cn(
                  "bg-white rounded-3xl border shadow-xs p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 transition-all hover:shadow-xs",
                  isVencido ? "border-red-200 bg-red-50/5" :
                  isAtencao ? "border-amber-200 bg-amber-50/5" :
                  isRealizado ? "border-slate-100 opacity-80" : "border-slate-200"
                )}
              >
                {/* Information */}
                <div className="flex-1 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-bold text-lg text-slate-900 border border-slate-200 rounded-xl px-3 py-1 bg-slate-50 font-sans">
                      {alert.truckId}
                    </span>
                    <span className={cn(
                      "px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full border",
                      alert.prioridade === 'critica' ? "bg-rose-50 text-rose-700 border-rose-100" :
                      alert.prioridade === 'alta' ? "bg-amber-50 text-amber-700 border-amber-100" :
                      alert.prioridade === 'media' ? "bg-blue-50 text-blue-700 border-blue-100" :
                      "bg-slate-100 text-slate-600 border-slate-200"
                    )}>
                      Prioridade {alert.prioridade}
                    </span>

                    <span className={cn(
                      "px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full border",
                      isVencido ? "bg-red-100 text-red-700 border-red-200" :
                      isAtencao ? "bg-amber-100 text-amber-700 border-amber-200" :
                      isRealizado ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                      "bg-slate-100 text-slate-700 border-slate-200"
                    )}>
                      {isVencido ? "🚨 Crítico / Vencido" :
                       isAtencao ? "⚠️ Atenção Breve" :
                       isRealizado ? "✅ Concluído" : "⏱️ Em Dia"}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                      <Wrench size={18} className="text-blue-500" />
                      {alert.tipo}
                    </h4>
                    <p className="text-sm text-slate-500 mt-1 font-medium">{alert.descricao}</p>
                  </div>

                  {/* Progress specifications */}
                  <div className="text-xs text-slate-400 font-medium space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      {alert.tipoLimite === 'km' ? (
                        <>
                          <Gauge size={14} className="text-slate-400" />
                          <span>Metragem Limite: <b className="text-slate-700">{alert.limiteKm.toLocaleString()} km</b></span>
                          {!isRealizado && (
                            <span className="text-slate-400">| Leitura atual do veículo: <b className="text-slate-600">{(alert.currentKm || 0).toLocaleString()} km</b></span>
                          )}
                        </>
                      ) : (
                        <>
                          <Calendar size={14} className="text-slate-400" />
                          <span>Prazo Limite: <b className="text-slate-700">{alert.limiteData ? new Date(alert.limiteData).toLocaleDateString('pt-BR') : '---'}</b></span>
                        </>
                      )}
                    </div>
                    {isRealizado && (
                      <div className="flex items-center gap-2 text-emerald-600">
                        <CheckCircle2 size={14} />
                        <span>Manutenção concluída em {new Date(alert.dataRealizada).toLocaleDateString('pt-BR')} com investimento de <b>R$ {alert.custo?.toLocaleString()}</b></span>
                      </div>
                    )}
                  </div>

                  {/* Progress bar for oil / brakes metrics */}
                  {alert.tipoLimite === 'km' && !isRealizado && (
                    <div className="space-y-1 w-full max-w-md pt-1">
                      <div className="flex justify-between text-[11px] font-bold text-slate-400">
                        <span>Ciclo de quilometragem útil</span>
                        <span className={cn(isVencido ? "text-red-500" : isAtencao ? "text-amber-500" : "text-blue-500")}>
                          {isVencido ? '100%+' : `${pct}%`}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            isVencido ? "bg-red-500" :
                            isAtencao ? "bg-amber-500" : "bg-blue-600"
                          )}
                          style={{ width: `${isVencido ? '100' : pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Operations side panel */}
                <div className="flex lg:flex-col items-stretch lg:items-end justify-between lg:justify-center gap-4 border-t lg:border-t-0 border-slate-100 pt-4 lg:pt-0">
                  <div className="text-left lg:text-right">
                    <p className="text-[10px] font-mono font-black uppercase text-slate-400 tracking-wider">Situação da Rota</p>
                    <p className={cn(
                      "text-sm font-bold mt-0.5",
                      isVencido ? "text-red-600" :
                      isAtencao ? "text-amber-600" :
                      isRealizado ? "text-emerald-600" : "text-slate-600"
                    )}>
                      {alert.progressoDesc}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isRealizado && (
                      <button 
                        onClick={() => {
                          setSelectedAlert(alert);
                          setIsCompleteModalOpen(true);
                        }}
                        className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={14} />
                        Resolver Alerta
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeleteAlert(alert.id)}
                      className="bg-slate-50 hover:bg-red-50 hover:text-red-600 border border-slate-200 hover:border-red-200 p-2 rounded-xl text-slate-400 transition-all flex items-center justify-center"
                      title="Excluir Alerta"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal - Novo Alerta */}
      <Modal isOpen={isNewAlertModalOpen} onClose={() => setIsNewAlertModalOpen(false)} title="Novo Alerta / Plano de Manutenção">
        <form onSubmit={handleCreateAlert} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Veículo / Caminhão</label>
              <select 
                value={newAlert.truckId}
                onChange={e => setNewAlert({...newAlert, truckId: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
                required
              >
                <option value="">Selecione...</option>
                {data.trucks.map((t: any) => (
                  <option key={t.id} value={t.placa}>{t.placa} - {t.modelo}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo de Revisão/Peça</label>
              <select 
                value={newAlert.tipo}
                onChange={e => setNewAlert({...newAlert, tipo: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
                required
              >
                <option value="Troca de Óleo">Troca de Óleo</option>
                <option value="Pastilhas de Freio">Pastilhas de Freio</option>
                <option value="Alinhamento e Balanceamento">Alinhamento / Balanc.</option>
                <option value="Troca de Pneus">Troca de Pneus</option>
                <option value="Sistema de Embreagem">Sistema de Embreagem</option>
                <option value="Suspensão / Molas">Suspensão / Molas</option>
                <option value="Inspeção Geral">Inspeção Sazonória Geral</option>
                <option value="Correia Dentada / Tensores">Correia Dentada / Tensores</option>
                <option value="Sistema Elétrico">Sistema Elétrico / Baterias</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Prioridade</label>
              <select 
                value={newAlert.prioridade}
                onChange={e => setNewAlert({...newAlert, prioridade: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
              >
                <option value="baixa">Baixa (Rotina)</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica (Imeditada)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Métrica Limite</label>
              <select 
                value={newAlert.tipoLimite}
                onChange={e => setNewAlert({...newAlert, tipoLimite: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
              >
                <option value="km">Quilometragem (Odomêtro)</option>
                <option value="data">Data de Vencimento</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {newAlert.tipoLimite === 'km' ? (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Quilometragem de Limite (Odomêtro recomendado)</label>
                <input 
                  type="number" 
                  placeholder="Ex: 130000"
                  value={newAlert.limiteKm}
                  onChange={e => setNewAlert({...newAlert, limiteKm: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  {newAlert.truckId ? (
                    <>A quilometragem atual deste caminhão é de <b>{getTruckLatestKm(newAlert.truckId).toLocaleString()} km</b>.</>
                  ) : (
                    <>Configure para disparar o alerta quanto o veículo atingir esse odomêtro.</>
                  )}
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Data de Validade Final</label>
                <input 
                  type="date" 
                  value={newAlert.limiteData}
                  onChange={e => setNewAlert({...newAlert, limiteData: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                  required
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descrição detalhada</label>
            <textarea 
              placeholder="Ex: Utilizar óleo mineral SAE 15W-40, trocar filtros de ar e combustível juntos..."
              rows={3}
              value={newAlert.descricao}
              onChange={e => setNewAlert({...newAlert, descricao: e.target.value})}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button 
              type="button" 
              onClick={() => setIsNewAlertModalOpen(false)}
              className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors text-sm"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm"
            >
              Salvar Alerta
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal - Confirmar Manutenção Resolvida */}
      <Modal isOpen={isCompleteModalOpen} onClose={() => setIsCompleteModalOpen(false)} title="Confirmar Manutenção Realizada">
        {selectedAlert && (
          <form onSubmit={handleCompleteAlert} className="space-y-5">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-sm space-y-1">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Serviço/Veículo</p>
              <p className="font-bold text-slate-800">{selectedAlert.tipo} no veículo {selectedAlert.truckId}</p>
              <p className="text-xs text-slate-500">{selectedAlert.descricao}</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Custo Final da Manutenção (Investimento em R$)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                <input 
                  type="text" 
                  placeholder="R$ 0,00"
                  value={completeForm.custo ? maskBRL(completeForm.custo) : ""}
                  onChange={e => {
                    const masked = maskBRL(e.target.value);
                    setCompleteForm({...completeForm, custo: masked ? String(unmaskBRL(masked)) : ""});
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-bold font-mono"
                  required
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Este custo será registrado automaticamente no fluxo de caixa (saída) e na lista de despesas de Manutenção.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Data de Execução</label>
              <input 
                type="date" 
                value={completeForm.dataRealizada}
                onChange={e => setCompleteForm({...completeForm, dataRealizada: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Meio de Pagamento</label>
                <select 
                  value={completeForm.meioPagamento}
                  onChange={e => setCompleteForm({...completeForm, meioPagamento: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                  required
                >
                  <option value="Pix">Pix</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Boleto">Boleto</option>
                  <option value="Transferência/TED">Transferência/TED</option>
                  <option value="Cartão Combustível">Cartão Combustível</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Oficina / Fornecedor</label>
                <input 
                  type="text" 
                  placeholder="Ex: Oficina Mecânica Silva"
                  value={completeForm.oficina}
                  onChange={e => setCompleteForm({...completeForm, oficina: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Observações da Execução</label>
              <textarea 
                placeholder="Ex: Substituído o filtro primário de combustível e óleo de motor."
                rows={2}
                value={completeForm.observacao}
                onChange={e => setCompleteForm({...completeForm, observacao: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setIsCompleteModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors text-sm"
              >
                Voltar
              </button>
              <button 
                type="submit"
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-sm flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={16} />
                Confirmar e Lançar
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
