import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Truck as TruckIcon, 
  CheckCircle2, 
  XCircle, 
  DollarSign, 
  Fuel, 
  Receipt, 
  Wrench, 
  Calendar, 
  MapPin, 
  TrendingUp, 
  AlertTriangle,
  FileText,
  Activity,
  Trash2,
  AlertCircle,
  TrendingDown
} from 'lucide-react';
import Modal from './ui/Modal';
import { cn } from '../lib/utils';

export default function Trucks({ data, onUpdate }: { data: any, onUpdate: () => void }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTruck, setNewTruck] = useState({ placa: '', modelo: '', usaArla: false });
  const [searchTerm, setSearchTerm] = useState('');

  // Details Modal States
  const [selectedTruck, setSelectedTruck] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'freights' | 'fuel' | 'expenses' | 'maintenance'>('summary');

  const handleAdd = async () => {
    if (!newTruck.placa) {
      alert("Por favor, preencha a placa do caminhão.");
      return;
    }
    if (!newTruck.modelo) {
      alert("Por favor, preencha o modelo do caminhão.");
      return;
    }
    
    const companyId = data?.company?.id || 'comp_1';
    
    await fetch('/api/trucks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newTruck, companyId, ativo: true })
    });
    
    setNewTruck({ placa: '', modelo: '', usaArla: false });
    setIsModalOpen(false);
    onUpdate();
  };

  const handleDeleteTruck = async (id: string, placa: string) => {
    if (!confirm(`Deseja realmente remover o caminhão ${placa}?`)) return;
    try {
      const response = await fetch(`/api/trucks/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setIsDetailsOpen(false);
        setSelectedTruck(null);
        onUpdate();
      } else {
        alert("Erro ao remover veículo.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!data) return null;

  const filteredTrucks = data.trucks.filter((truck: any) => {
    return !searchTerm || 
      truck.placa.toLowerCase().includes(searchTerm.toLowerCase()) ||
      truck.modelo.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Calculate stats for details view of the selected truck
  const getTruckStats = (truckPlaca: string) => {
    const fuelLogs = (data.fuel_logs || []).filter((log: any) => log.truckId === truckPlaca);
    const expenses = (data.expenses || []).filter((exp: any) => exp.truckId === truckPlaca);
    const freights = (data.freights || []).filter((f: any) => f.truckId === truckPlaca);
    const maintenance = (data.maintenance_alerts || []).filter((alert: any) => alert.truckId === truckPlaca);

    const totalSpentFuel = fuelLogs.reduce((acc: number, log: any) => acc + Number(log.valor || 0), 0);
    const totalSpentArla = fuelLogs.reduce((acc: number, log: any) => acc + Number(log.valorArla || 0), 0);
    const totalSpentExpenses = expenses.reduce((acc: number, exp: any) => acc + Number(exp.valor || 0), 0);
    
    const totalFreightRevenue = freights.reduce((acc: number, f: any) => acc + Number(f.valorBruto || 0), 0);
    const totalFreightCosts = freights.reduce((acc: number, f: any) => {
      return acc + Number(f.combustivel || 0) + Number(f.pedagio || 0) + Number(f.motorista || 0) + Number(f.outrasDespesas || 0);
    }, 0);

    const totalMaintenanceCosts = maintenance
      .filter((m: any) => m.status === 'Realizado')
      .reduce((acc: number, m: any) => acc + Number(m.custo || 0), 0);

    // Consolidated metrics
    const totalInvestedCosts = totalSpentFuel + totalSpentArla + totalSpentExpenses + totalFreightCosts + totalMaintenanceCosts;
    const estimatedProfit = totalFreightRevenue - totalInvestedCosts;

    return {
      fuelLogs,
      expenses,
      freights,
      maintenance,
      totalSpentFuel,
      totalSpentArla,
      totalSpentExpenses,
      totalFreightRevenue,
      totalFreightCosts,
      totalMaintenanceCosts,
      totalInvestedCosts,
      estimatedProfit
    };
  };

  // Open details helper
  const handleOpenDetails = (truck: any) => {
    setSelectedTruck(truck);
    setActiveTab('summary');
    setIsDetailsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por placa ou modelo..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-11"
          />
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 text-sm h-11"
        >
          <Plus size={20} />
          Novo Caminhão
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTrucks.map((truck: any) => {
          const stats = getTruckStats(truck.placa);
          const alertsCount = stats.maintenance.filter((m: any) => m.status === 'Pendente').length;

          return (
            <div key={truck.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-5">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                    <TruckIcon className="text-slate-400 group-hover:text-blue-600 transition-colors" size={24} />
                  </div>
                  {alertsCount > 0 && (
                    <span className="bg-amber-50 text-amber-600 border border-amber-100 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold">
                      <AlertTriangle size={12} />
                      {alertsCount} Alerta{alertsCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                
                <div className="space-y-1 mb-6">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-lg font-black text-slate-900 tracking-tight">{truck.placa}</h4>
                    {truck.usaArla && (
                      <span className="bg-sky-50 text-sky-700 border border-sky-100 px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1">
                        💨 Arla 32
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 font-bold">{truck.modelo}</p>
                </div>

                {/* mini metrics preview */}
                <div className="grid grid-cols-2 gap-3 mb-6 bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block tracking-wider">Faturamento</span>
                    <span className="font-extrabold text-slate-700 text-sm">R$ {stats.totalFreightRevenue.toLocaleString('pt-BR')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block tracking-wider">Viagens</span>
                    <span className="font-extrabold text-slate-700 text-sm">{stats.freights.length} efetuadas</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                <div className="flex items-center gap-1.5">
                  {truck.ativo ? (
                    <>
                      <CheckCircle2 className="text-emerald-500" size={16} />
                      <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Ativo</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="text-slate-400" size={16} />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inativo</span>
                    </>
                  )}
                </div>
                <button 
                  onClick={() => handleOpenDetails(truck)}
                  className="text-xs font-black text-blue-600 hover:text-blue-700 transition-colors hover:underline"
                >
                  Ver Detalhes →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Simples - Cadastrar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 animate-fadeIn">
            <h3 className="text-xl font-bold mb-6 text-slate-800">Cadastrar Caminhão</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Placa</label>
                <input 
                  type="text" 
                  value={newTruck.placa}
                  onChange={e => setNewTruck({...newTruck, placa: e.target.value.toUpperCase()})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 uppercase"
                  placeholder="Ex: ABC-1234"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Modelo</label>
                <input 
                  type="text" 
                  value={newTruck.modelo}
                  onChange={e => setNewTruck({...newTruck, modelo: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Ex: Scania R450"
                />
              </div>
              <div className="flex items-center gap-2.5 pt-2">
                <input 
                  type="checkbox" 
                  id="input-usa-arla"
                  checked={newTruck.usaArla}
                  onChange={e => setNewTruck({...newTruck, usaArla: e.target.checked})}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="input-usa-arla" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
                  Este caminhão exige / utiliza Arla 32
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleAdd}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AMPLO DE DETALHES 360º DO VEÍCULO */}
      <Modal 
        isOpen={isDetailsOpen} 
        onClose={() => {
          setIsDetailsOpen(false);
          setSelectedTruck(null);
        }} 
        title={`Dossiê do Veículo: ${selectedTruck?.placa || ''}`}
        size="large"
      >
        {selectedTruck && (() => {
          const stats = getTruckStats(selectedTruck.placa);

          return (
            <div className="space-y-6">
              {/* Profile Card Summary Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center">
                    <TruckIcon size={32} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">{selectedTruck.placa}</h3>
                    <p className="text-sm text-slate-500 font-bold">{selectedTruck.modelo}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={cn(
                    "px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-full border",
                    selectedTruck.ativo ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-300"
                  )}>
                    {selectedTruck.ativo ? 'Em Operação' : 'Desativado'}
                  </span>
                  
                  <button
                    onClick={() => handleDeleteTruck(selectedTruck.id, selectedTruck.placa)}
                    className="p-2 text-rose-500 hover:bg-rose-50 border border-slate-200 hover:border-rose-100 rounded-xl transition-all"
                    title="Excluir Caminhão"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Subtabs for unified information */}
              <div className="flex border-b border-slate-200 overflow-x-auto gap-2">
                <button
                  onClick={() => setActiveTab('summary')}
                  className={cn(
                    "px-4 py-2 border-b-2 font-bold text-xs uppercase tracking-wider pb-3 transition-colors shrink-0",
                    activeTab === 'summary' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
                  )}
                >
                  Finanças e Diagnóstico
                </button>
                <button
                  onClick={() => setActiveTab('freights')}
                  className={cn(
                    "px-4 py-2 border-b-2 font-bold text-xs uppercase tracking-wider pb-3 transition-colors shrink-0",
                    activeTab === 'freights' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
                  )}
                >
                  Fretes ({stats.freights.length})
                </button>
                <button
                  onClick={() => setActiveTab('fuel')}
                  className={cn(
                    "px-4 py-2 border-b-2 font-bold text-xs uppercase tracking-wider pb-3 transition-colors shrink-0",
                    activeTab === 'fuel' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
                  )}
                >
                  Diesel ({stats.fuelLogs.length})
                </button>
                <button
                  onClick={() => setActiveTab('expenses')}
                  className={cn(
                    "px-4 py-2 border-b-2 font-bold text-xs uppercase tracking-wider pb-3 transition-colors shrink-0",
                    activeTab === 'expenses' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
                  )}
                >
                  Despesas ({stats.expenses.length})
                </button>
                <button
                  onClick={() => setActiveTab('maintenance')}
                  className={cn(
                    "px-4 py-2 border-b-2 font-bold text-xs uppercase tracking-wider pb-3 transition-colors shrink-0",
                    activeTab === 'maintenance' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
                  )}
                >
                  Checkup / Alertas ({stats.maintenance.length})
                </button>
              </div>

              {/* TAB CONTENTS */}
              {activeTab === 'summary' && (
                <div className="space-y-6">
                  {/* Financial cards inside vehicle summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-3xl border border-slate-200">
                      <div className="flex items-center gap-2 text-blue-600 mb-2">
                        <TrendingUp size={18} />
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Receita (Fretes)</span>
                      </div>
                      <p className="text-xl font-black text-slate-800">R$ {stats.totalFreightRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>

                    <div className="bg-white p-5 rounded-3xl border border-slate-200">
                      <div className="flex items-center gap-2 text-amber-600 mb-2">
                        <Fuel size={18} />
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Diesel Gasto</span>
                      </div>
                      <p className="text-xl font-black text-slate-800">R$ {stats.totalSpentFuel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      {selectedTruck.usaArla && (
                        <p className="text-[10px] text-sky-600 font-extrabold mt-1.5 pt-1.5 border-t border-slate-100 flex justify-between items-center">
                          <span>💨 Arla 32 Gasto:</span>
                          <span>R$ {stats.totalSpentArla.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </p>
                      )}
                    </div>

                    <div className="bg-white p-5 rounded-3xl border border-slate-200">
                      <div className="flex items-center gap-2 text-rose-600 mb-2">
                        <Receipt size={18} />
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Despesas e Manutenção</span>
                      </div>
                      <p className="text-xl font-black text-slate-800">R$ {(stats.totalSpentExpenses + stats.totalMaintenanceCosts).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>

                    <div className="bg-slate-900 p-5 rounded-3xl">
                      <div className="flex items-center gap-2 text-emerald-400 mb-2">
                        <DollarSign size={18} />
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Saldo Operacional</span>
                      </div>
                      <p className="text-xl font-black text-emerald-400">R$ {stats.estimatedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>

                  {/* Operational indicators diagnostics check */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-4">
                      <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                        <Activity size={16} className="text-blue-500" />
                        Composto de Eficiência
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm border-b border-slate-200/60 pb-2">
                          <span className="text-slate-500 font-medium">Frequência de Viagem</span>
                          <span className="font-bold text-slate-800">{stats.freights.length} Viagens catalogadas</span>
                        </div>
                        <div className="flex justify-between items-center text-sm border-b border-slate-200/60 pb-2">
                          <span className="text-slate-500 font-medium">Logs de Refuel (Diesel)</span>
                          <span className="font-bold text-slate-800">{stats.fuelLogs.length} Registros</span>
                        </div>
                        <div className="flex justify-between items-center text-sm pb-1">
                          <span className="text-slate-500 font-medium">Margem Estimada Real</span>
                          {stats.totalFreightRevenue > 0 ? (
                            <span className="font-extrabold text-emerald-600">
                              {((stats.estimatedProfit / stats.totalFreightRevenue) * 100).toFixed(1)}% de margem
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs italic">Sem faturamento</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-4">
                      <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                        <Wrench size={16} className="text-amber-500" />
                        Status de Manutenções Pendentes
                      </h4>
                      {stats.maintenance.filter((a: any) => a.status === 'Pendente').length === 0 ? (
                        <div className="text-center py-6 text-slate-400 italic text-xs bg-white rounded-2xl border border-slate-100">
                          <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
                          Nenhuma preventiva pendente. O veículo está regular!
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {stats.maintenance.filter((a: any) => a.status === 'Pendente').map((alert: any) => (
                            <div key={alert.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between text-xs">
                              <div>
                                <p className="font-bold text-slate-800">{alert.tipo}</p>
                                <p className="text-slate-400 text-[10px]">{alert.descricao || 'Inspeção preventiva agendada'}</p>
                              </div>
                              <span className={cn(
                                "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                                alert.prioridade === 'critica' ? "bg-red-50 text-red-700 border-red-200" :
                                alert.prioridade === 'alta' ? "bg-orange-50 text-orange-700 border-orange-200" :
                                "bg-slate-50 text-slate-600 border-slate-200"
                              )}>
                                {alert.prioridade}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB FREIGHTS */}
              {activeTab === 'freights' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">Histórico de viagens vinculadas à placa {selectedTruck.placa}:</h4>
                  {stats.freights.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 italic text-sm">
                      Nenhuma viagem de frete foi registrada para este caminhão ainda.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                      {stats.freights.map((f: any) => {
                        const costs = (f.pedagio || 0) + (f.combustivel || 0) + (f.motorista || 0) + (f.outrasDespesas || 0);
                        const profit = (f.valorBruto || 0) - costs;
                        
                        return (
                          <div key={f.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50">
                            <div>
                              <div className="flex items-center gap-2 text-xs font-sans text-slate-400 mb-1.5">
                                <span className="font-extrabold text-[10px] uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                  {f.status}
                                </span>
                                <span>{new Date(f.data + "T00:00:00").toLocaleDateString('pt-BR')}</span>
                              </div>
                              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                                <MapPin size={14} className="text-slate-400 animate-pulse" />
                                <span>{f.origem}</span>
                                <span className="text-slate-300">→</span>
                                <span className="text-blue-600">{f.destino}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Resultado Líquido</p>
                              <p className={cn("text-sm font-black", profit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB FUEL */}
              {activeTab === 'fuel' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">Lançamentos de abastecimentos:</h4>
                  {stats.fuelLogs.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 italic text-sm">
                      Nenhum abastecimento registrado para este caminhão.
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-5 py-3 font-bold text-slate-400 uppercase tracking-wider">Data</th>
                            <th className="px-5 py-3 font-bold text-slate-400 uppercase tracking-wider">Odômetro (KM)</th>
                            <th className="px-5 py-3 font-bold text-slate-400 uppercase tracking-wider">Volume (Litros)</th>
                            <th className="px-5 py-3 font-bold text-slate-400 uppercase tracking-wider">Valor Pago</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150">
                          {stats.fuelLogs.map((log: any) => (
                            <tr key={log.id} className="hover:bg-slate-50/50">
                             <td className="px-5 py-3 text-slate-600">{new Date(log.data + "T00:00:00").toLocaleDateString('pt-BR')}</td>
                              <td className="px-5 py-3 font-medium text-slate-700">{log.km.toLocaleString()} km</td>
                              <td className="px-5 py-3 font-medium text-slate-700">{log.litros} L</td>
                              <td className="px-5 py-3 font-bold text-slate-950">R$ {log.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB EXPENSES */}
              {activeTab === 'expenses' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">Despesas administrativas, taxas ou insumos cadastrados:</h4>
                  {stats.expenses.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 italic text-sm">
                      Nenhuma outra despesa pendente ou paga para este veículo.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                      {stats.expenses.map((exp: any) => (
                        <div key={exp.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/50 text-xs">
                          <div>
                            <p className="font-bold text-slate-800">{exp.tipo}</p>
                            <span className="text-slate-400 block text-[10px]">{new Date(exp.data + "T00:00:00").toLocaleDateString('pt-BR')} {exp.obs ? `• ${exp.obs}` : ''}</span>
                          </div>
                          <span className="font-bold text-rose-500">- R$ {exp.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB MAINTENANCE */}
              {activeTab === 'maintenance' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">Plano de Manutenção Preventiva & Alertas de troca:</h4>
                  {stats.maintenance.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 italic text-sm">
                      Nenhum plano ou preventivas agendadas para esta unidade.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                      {stats.maintenance.map((m: any) => (
                        <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-50/50">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn(
                                "text-[9px] uppercase font-black px-2 py-0.5 rounded border tracking-wider",
                                m.status === 'Realizado' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-sky-50 text-sky-700 border-sky-200"
                              )}>
                                {m.status}
                              </span>
                              <span className="font-bold text-slate-800 text-sm">{m.tipo}</span>
                            </div>
                            <p className="text-slate-500">{m.descricao || 'Alinhamento geral e calibração de sensores'}</p>
                            {m.limiteKm > 0 && <span className="text-[10px] text-slate-400 block mt-1">Limite preventivo: {m.limiteKm.toLocaleString()} km</span>}
                          </div>
                          <div className="text-right">
                            {m.status === 'Realizado' ? (
                              <p className="font-bold text-slate-700">Custo: R$ {(m.custo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            ) : (
                              <p className="font-medium text-slate-400 italic">Prevenção ativa</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Back actions header close */}
              <div className="border-t border-slate-100 pt-5 flex justify-end">
                <button
                  onClick={() => {
                    setIsDetailsOpen(false);
                    setSelectedTruck(null);
                  }}
                  className="px-6 py-2.5 rounded-xl font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors text-xs uppercase"
                >
                  Fechar Dossiê
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
