import React, { useState } from 'react';
import { 
  Route, 
  MapPin, 
  TrendingUp, 
  Plus, 
  Search, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  X,
  ArrowRight, 
  Coins, 
  Eye,
  Percent,
  Calculator,
  User,
  ShieldAlert,
  Camera,
  FileText,
  Image as ImageIcon,
  Edit,
  Trash2
} from 'lucide-react';
import { cn } from '../lib/utils';
import Modal from './ui/Modal';
import { generateFreightPDF } from '../lib/pdfGenerator';
import { compressAndSetFile, AttachmentPreview } from '../lib/fileCompressor';

export default function Freights({ data, onUpdate }: { data: any, onUpdate: () => void }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFreight, setSelectedFreight] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTruck, setSelectedTruck] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Form states
  const [truckId, setTruckId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [valorBruto, setValorBruto] = useState('');
  const [pedagio, setPedagio] = useState('');
  const [combustivel, setCombustivel] = useState('');
  const [motorista, setMotorista] = useState('');
  const [outrasDespesas, setOutrasDespesas] = useState('');
  const [status, setStatus] = useState('Orçado');
  const [dataFrete, setDataFrete] = useState(new Date().toISOString().split('T')[0]);

  // Premium travel note fields & photo attachment simulation
  const [localAbastecimento, setLocalAbastecimento] = useState('');
  const [fotoAbastecimento, setFotoAbastecimento] = useState('');
  const [localPedagio, setLocalPedagio] = useState('');
  const [localMotorista, setLocalMotorista] = useState('');
  const [outrosDetalhes, setOutrosDetalhes] = useState('');
  const [fotoComprovanteGeral, setFotoComprovanteGeral] = useState('');

  // Details expand overlay
  const [expandedFreightId, setExpandedFreightId] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      compressAndSetFile(file, setter);
    }
  };

  if (!data) return null;

  const freightsList = data.freights || [];
  const trucksList = data.trucks || [];

  // Filtered lists
  const filteredFreights = freightsList.filter((f: any) => {
    const matchesSearch = 
      f.origem?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.destino?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.truckId?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTruck = selectedTruck === '' || f.truckId === selectedTruck;
    const matchesStatus = selectedStatus === '' || f.status === selectedStatus;
    
    return matchesSearch && matchesTruck && matchesStatus;
  });

  // Totals calculations
  const totalRevenue = filteredFreights.reduce((acc: number, f: any) => acc + (f.valorBruto || 0), 0);
  const totalTolls = filteredFreights.reduce((acc: number, f: any) => acc + (f.pedagio || 0), 0);
  const totalFuel = filteredFreights.reduce((acc: number, f: any) => acc + (f.combustivel || 0), 0);
  const totalDriver = filteredFreights.reduce((acc: number, f: any) => acc + (f.motorista || 0), 0);
  const totalOthers = filteredFreights.reduce((acc: number, f: any) => acc + (f.outrasDespesas || 0), 0);

  const totalCosts = totalTolls + totalFuel + totalDriver + totalOthers;
  const netProfit = totalRevenue - totalCosts;
  const averageMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const handleStatusChange = async (freightId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/freights/${freightId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        onUpdate();
      } else {
        alert("Erro ao atualizar o status do frete.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao conectar com o servidor.");
    }
  };

  const openEditModal = (freight: any) => {
    setSelectedFreight(freight);
    setTruckId(freight.truckId || '');
    setDriverId(freight.driverId || '');
    setOrigem(freight.origem || '');
    setDestino(freight.destino || '');
    setValorBruto(freight.valorBruto ? String(freight.valorBruto) : '');
    setPedagio(freight.pedagio ? String(freight.pedagio) : '');
    setCombustivel(freight.combustivel ? String(freight.combustivel) : '');
    setMotorista(freight.motorista ? String(freight.motorista) : '');
    setOutrasDespesas(freight.outrasDespesas ? String(freight.outrasDespesas) : '');
    setLocalAbastecimento(freight.localAbastecimento || '');
    setFotoAbastecimento(freight.fotoAbastecimento || '');
    setLocalPedagio(freight.localPedagio || '');
    setLocalMotorista(freight.localMotorista || '');
    setOutrosDetalhes(freight.outrosDetalhes || '');
    setFotoComprovanteGeral(freight.fotoComprovanteGeral || '');
    setStatus(freight.status || 'Orçado');
    setDataFrete(freight.data || new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
  };

  const handleDeleteFreight = async (id: string) => {
    if (!confirm("Deseja realmente excluir este frete? Isso também removerá todos os lançamentos financeiros vinculados (entrada de receita e saídas de custos).")) return;
    try {
      const response = await fetch(`/api/freights/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        onUpdate();
        setExpandedFreightId(null);
      } else {
        alert("Erro ao remover o frete.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão ao remover o frete.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!truckId || !origem || !destino || !valorBruto) {
      alert("Por favor, preencha todos os campos obrigatórios (*)");
      return;
    }

    try {
      const url = selectedFreight ? `/api/freights/${selectedFreight.id}` : '/api/freights';
      const method = selectedFreight ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: 'comp_1',
          truckId,
          driverId,
          origem,
          destino,
          valorBruto: parseFloat(valorBruto),
          pedagio: parseFloat(pedagio || '0'),
          combustivel: parseFloat(combustivel || '0'),
          motorista: parseFloat(motorista || '0'),
          outrasDespesas: parseFloat(outrasDespesas || '0'),
          localAbastecimento,
          fotoAbastecimento,
          localPedagio,
          localMotorista,
          outrosDetalhes,
          fotoComprovanteGeral,
          status,
          data: dataFrete
        })
      });

      if (response.ok) {
        setIsModalOpen(false);
        setSelectedFreight(null);
        // Reset form
        setTruckId('');
        setDriverId('');
        setOrigem('');
        setDestino('');
        setValorBruto('');
        setPedagio('');
        setCombustivel('');
        setMotorista('');
        setOutrasDespesas('');
        setLocalAbastecimento('');
        setFotoAbastecimento('');
        setLocalPedagio('');
        setLocalMotorista('');
        setOutrosDetalhes('');
        setFotoComprovanteGeral('');
        setStatus('Orçado');
        setDataFrete(new Date().toISOString().split('T')[0]);
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header and Add button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Route className="text-blue-600" size={28} />
            Gestão de Fretes
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Planejamento, custos dedicados e cálculo de margem de lucro por viagem individual.
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedFreight(null);
            setTruckId('');
            setDriverId('');
            setOrigem('');
            setDestino('');
            setValorBruto('');
            setPedagio('');
            setCombustivel('');
            setMotorista('');
            setOutrasDespesas('');
            setLocalAbastecimento('');
            setFotoAbastecimento('');
            setLocalPedagio('');
            setLocalMotorista('');
            setOutrosDetalhes('');
            setFotoComprovanteGeral('');
            setStatus('Orçado');
            setDataFrete(new Date().toISOString().split('T')[0]);
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-100 transition-all self-stretch sm:self-auto justify-center"
        >
          <Plus size={18} />
          Cadastrar Frete
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* KPI 1: Total Revenue */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
              <Coins size={22} />
            </div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Faturamento de Fretes</p>
          </div>
          <h4 className="text-2xl font-black text-slate-900">R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
          <span className="text-xs text-slate-400 font-medium">Soma de todos os fretes listados</span>
        </div>

        {/* KPI 2: Total Costs */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-red-50 text-red-600 rounded-2xl">
              <Calculator size={22} />
            </div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Custos Operacionais</p>
          </div>
          <h4 className="text-2xl font-black text-red-600">R$ {totalCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
          <span className="text-xs text-slate-400 font-medium">Diesel + Pedágios + Diárias + Outros</span>
        </div>

        {/* KPI 3: Net Profit */}
        <div className="bg-slate-900 p-6 rounded-[32px] shadow-xl shadow-slate-200 hover:scale-105 transition-all">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl">
              <TrendingUp size={22} />
            </div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Lucro Líquido Viagens</p>
          </div>
          <h4 className="text-2xl font-black text-emerald-400">R$ {netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
          <span className="text-xs text-slate-400 font-medium">Faturamento subtraído de custos</span>
        </div>

        {/* KPI 4: Net Margin */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-2xl">
              <Percent size={22} />
            </div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Margem de Lucro Média</p>
          </div>
          <h4 className="text-2xl font-black text-purple-600">
            {averageMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
          </h4>
          <div className="mt-1 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(Math.max(averageMargin, 0), 100)}%` }}></div>
          </div>
        </div>
      </div>

      {/* Filters Area */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-4 top-3.5 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por origem, destino ou veículo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          {/* Truck Filter */}
          <select
            value={selectedTruck}
            onChange={(e) => setSelectedTruck(e.target.value)}
            className="flex-1 sm:flex-initial bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-sm font-medium text-slate-600 focus:outline-none focus:border-blue-500"
          >
            <option value="">Todos os Caminhões</option>
            {trucksList.map((t: any) => (
              <option key={t.id} value={t.placa}>{t.placa} - {t.modelo}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="flex-1 sm:flex-initial bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-sm font-medium text-slate-600 focus:outline-none focus:border-blue-500"
          >
            <option value="">Todos os Status</option>
            <option value="Orçado">Orçado</option>
            <option value="Confirmado">Confirmado</option>
            <option value="Em Andamento">Em Andamento</option>
            <option value="Concluído">Concluído</option>
            <option value="Cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      {/* Freights List / Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Histórico de Fretes Cadastrados</h3>
          <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-bold">
            {filteredFreights.length} fretes encontrados
          </span>
        </div>

        {filteredFreights.length === 0 ? (
          <div className="p-16 text-center text-slate-400 italic">
            <Route className="mx-auto text-slate-300 mb-4" size={48} />
            Nenhum frete cadastrado ou correspondente aos filtros. Cliqe em "Cadastrar Frete" para iniciar.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredFreights.map((freight: any) => {
              const freightExpensesSum = 
                (freight.pedagio || 0) + 
                (freight.combustivel || 0) + 
                (freight.motorista || 0) + 
                (freight.outrasDespesas || 0);
              const freightProfit = (freight.valorBruto || 0) - freightExpensesSum;
              const freightMargin = freight.valorBruto > 0 ? (freightProfit / freight.valorBruto) * 100 : 0;
              const isExpanded = expandedFreightId === freight.id;

              return (
                <div key={freight.id} className="p-6 hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    {/* Route Details */}
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <div className="relative inline-block">
                          <select
                            value={freight.status}
                            onChange={(e) => handleStatusChange(freight.id, e.target.value)}
                            className={cn(
                              "appearance-none px-3.5 py-1.5 pr-8 rounded-full text-[10px] font-black uppercase tracking-wider border cursor-pointer focus:outline-none transition-all hover:scale-[1.02] shadow-xs font-sans",
                              freight.status === 'Concluído' ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/50" :
                              freight.status === 'Em Andamento' ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100/50" :
                              freight.status === 'Confirmado' ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100/50" :
                              freight.status === 'Orçado' ? "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200/55" :
                              "bg-red-50 text-red-700 border-red-200 hover:bg-red-100/50"
                            )}
                            style={{
                              backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'right 10px center',
                              backgroundSize: '10px'
                            }}
                          >
                            <option value="Orçado">Orçado</option>
                            <option value="Confirmado">Confirmado</option>
                            <option value="Em Andamento">Em Andamento</option>
                            <option value="Concluído">Concluído</option>
                            <option value="Cancelado">Cancelado</option>
                          </select>
                        </div>
                        <span className="text-xs font-mono text-slate-400">
                          {new Date(freight.data).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-bold">
                          Veículo: {freight.truckId}
                        </span>
                        {freight.driverId && (
                          <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                            Motorista: {data.drivers?.find((d: any) => d.id === freight.driverId)?.nome || freight.driverId}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-lg">
                          <MapPin size={18} className="text-slate-400" />
                          <span>{freight.origem}</span>
                        </div>
                        <ArrowRight size={18} className="text-slate-400 mx-2" />
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-lg">
                          <MapPin size={18} className="text-blue-600" />
                          <span>{freight.destino}</span>
                        </div>
                      </div>
                    </div>

                    {/* Financial Values summary */}
                    <div className="flex flex-wrap items-center gap-4 lg:gap-8 justify-between lg:justify-end">
                      {/* Gross revenue */}
                      <div className="text-left lg:text-right">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Valor Bruto</p>
                        <p className="text-lg font-black text-slate-800">R$ {freight.valorBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>

                      {/* Total Expenses */}
                      <div className="text-left lg:text-right">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Custos</p>
                        <p className="text-lg font-black text-rose-500">R$ {freightExpensesSum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>

                      {/* Net profit & margin */}
                      <div className="text-left lg:text-right min-w-[130px]">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Lucro Líquido (Margem)</p>
                        <p className={cn(
                          "text-lg font-black",
                          freightProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}>
                          R$ {freightProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          <span className="text-xs font-bold block">
                            ({freightMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% margem)
                          </span>
                        </p>
                      </div>

                      {/* Expand / Details action */}
                      <button
                        onClick={() => setExpandedFreightId(isExpanded ? null : freight.id)}
                        className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl transition-all self-center ml-2 border border-slate-200"
                        title="Ver Detalhes dos Custos"
                      >
                        <Eye size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-dashed border-slate-200 bg-slate-50/50 p-6 rounded-3xl animate-fadeIn space-y-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <h4 className="text-xs font-black uppercase text-blue-600 tracking-wider flex items-center gap-2">
                          <FileText size={16} />
                          Dossiê Detalhado de Custos e Viagem
                        </h4>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(freight)}
                            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[10px] sm:text-xs uppercase tracking-wider px-3.5 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <Edit size={14} />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFreight(freight.id)}
                            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] sm:text-xs uppercase tracking-wider px-3.5 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <Trash2 size={14} />
                            Excluir
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                generateFreightPDF(freight);
                              } catch (error) {
                                console.error("Erro ao gerar PDF:", error);
                                alert("Não foi possível gerar o PDF. Verifique se as imagens anexas estão no formato correto.");
                              }
                            }}
                            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] sm:text-xs uppercase tracking-wider px-3.5 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer shadow-blue-100 hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <FileText size={14} />
                            Baixar Recibo PDF
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Combustível */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3 shadow-xs">
                          <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Combustível</p>
                            <p className="font-extrabold text-slate-800 text-base">R$ {freight.combustivel?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                          {freight.localAbastecimento ? (
                            <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                              <span className="font-bold block text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Local / Notas:</span>
                              {freight.localAbastecimento}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 italic">Sem notas do local</div>
                          )}
                           {freight.fotoAbastecimento ? (
                             <div className="space-y-1 pt-1">
                               <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Comprovante de Combustível:</span>
                               <AttachmentPreview src={freight.fotoAbastecimento} label="Comprovante de Diesel" />
                             </div>
                           ) : (
                             <div className="text-[10px] text-slate-400 italic">Sem foto do comprovante</div>
                           )}
                        </div>

                        {/* Pedágio */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3 shadow-xs">
                          <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Pedágio / Taxas</p>
                            <p className="font-extrabold text-slate-800 text-base">R$ {freight.pedagio?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                          {freight.localPedagio ? (
                            <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                              <span className="font-bold block text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Notas / Praças:</span>
                              {freight.localPedagio}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 italic">Notas de pedágio não descritas</div>
                          )}
                        </div>

                        {/* Diárias */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3 shadow-xs">
                          <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Motorista / Diárias</p>
                            <p className="font-extrabold text-slate-800 text-base">R$ {freight.motorista?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                          {freight.localMotorista ? (
                            <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                              <span className="font-bold block text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Escala / Notas:</span>
                              {freight.localMotorista}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 italic">Notas da diária não descritas</div>
                          )}
                        </div>

                        {/* Outras Despesas */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3 shadow-xs">
                          <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Outras Despesas</p>
                            <p className="font-extrabold text-slate-800 text-base">R$ {freight.outrasDespesas?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                          {freight.outrosDetalhes ? (
                            <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                              <span className="font-bold block text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Tipo / Justificativa:</span>
                              {freight.outrosDetalhes}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 italic">Sem detalhes adicionais</div>
                          )}
                           {freight.fotoComprovanteGeral ? (
                             <div className="space-y-1 pt-1">
                               <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Comprovante Geral:</span>
                               <AttachmentPreview src={freight.fotoComprovanteGeral} label="Comprovante Geral" />
                             </div>
                           ) : (
                             <div className="text-[10px] text-slate-400 italic">Sem comprovante de despesa</div>
                           )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal - Cadastrar/Editar Frete */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setSelectedFreight(null); }} title={selectedFreight ? "Editar Lançamento de Frete" : "Cadastrar Novo Frete Dedicado"}>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-1">
              <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Caminhão Vinculado *</label>
              <select
                required
                value={truckId}
                onChange={(e) => setTruckId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
              >
                <option value="">Selecione...</option>
                {trucksList.map((t: any) => (
                  <option key={t.id} value={t.placa}>{t.placa} - {t.modelo}</option>
                ))}
              </select>
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Motorista Vinculado</label>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
              >
                <option value="">Nenhum / Sem vínculo</option>
                {(data.drivers || []).map((d: any) => (
                  <option key={d.id} value={d.id}>{d.nome} ({d.categoriaCnh})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Data da Viagem *</label>
              <input
                type="date"
                required
                value={dataFrete}
                onChange={(e) => setDataFrete(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Status Inicial *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
              >
                <option value="Orçado">Orçado</option>
                <option value="Confirmado">Confirmado</option>
                <option value="Em Andamento">Em Andamento</option>
                <option value="Concluído">Concluído</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Cidade Origem *</label>
              <input
                type="text"
                required
                placeholder="Ex: São Paulo, SP"
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Cidade Destino *</label>
              <input
                type="text"
                required
                placeholder="Ex: Curitiba, PR"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Valor Bruto do Frete (Receita) *</label>
              <div className="relative">
                <span className="absolute left-4 top-3 text-slate-400 font-bold text-sm">R$</span>
                <input
                  type="number"
                  required
                  step="0.01"
                  placeholder="0,00"
                  value={valorBruto}
                  onChange={(e) => setValorBruto(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-200 pt-6 space-y-6">
            <h4 className="text-xs font-black uppercase text-blue-600 tracking-wider">Custos Detalhados do Frete (Com notas e comprovantes)</h4>
            
            <div className="grid grid-cols-1 gap-6 p-5 bg-slate-50 rounded-2xl border border-slate-200">
              {/* Combustível Section inside Modal */}
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Combustível (R$)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-3 text-slate-400 font-medium text-sm">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={combustivel}
                        onChange={(e) => setCombustivel(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex-2">
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Local / Posto de Abastecimento</label>
                    <input
                      type="text"
                      placeholder="Ex: Posto Ipiranga, Dutra KM 145"
                      value={localAbastecimento}
                      onChange={(e) => setLocalAbastecimento(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
                    />
                  </div>
                </div>
                
                 <div>
                   <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Anexar Cupom Fiscal Combustível</label>
                   <div className="relative group border-2 border-dashed border-slate-200 rounded-xl p-4 bg-white hover:border-blue-500 hover:bg-blue-50/10 transition-all text-center cursor-pointer">
                     <input
                       type="file"
                       accept="image/*,application/pdf"
                       onChange={(e) => handleFileChange(e, setFotoAbastecimento)}
                       className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                     />
                     {fotoAbastecimento ? (
                       <div className="flex items-center justify-center gap-3">
                         <div className="w-10 h-10 rounded overflow-hidden border bg-slate-50 shrink-0 flex items-center justify-center">
                           {fotoAbastecimento.startsWith('data:application/pdf') ? (
                             <FileText size={18} className="text-red-500 animate-bounce" />
                           ) : (
                             <img src={fotoAbastecimento} alt="Cupom Fiscal" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                           )}
                         </div>
                         <div className="text-left text-xs">
                           <p className="font-bold text-emerald-600">Comprovante de combustível anexado!</p>
                           <p className="text-slate-400 text-[10px]">Clique ou arraste outro para substituir</p>
                         </div>
                       </div>
                     ) : (
                       <div className="flex flex-col items-center justify-center gap-1 text-slate-400">
                         <Camera size={20} className="text-slate-400 mb-0.5" />
                         <span className="text-xs font-bold uppercase tracking-wider">Selecione ou Arraste Comprovante de Diesel (Foto ou PDF)</span>
                       </div>
                     )}
                   </div>
                 </div>
              </div>

              {/* Pedágio / Taxas */}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Pedágio / Taxas (R$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-400 font-medium text-sm">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={pedagio}
                      onChange={(e) => setPedagio(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Notas/Locais do Pedágio</label>
                  <input
                    type="text"
                    placeholder="Ex: Rod. Ayrton Senna, CCR"
                    value={localPedagio}
                    onChange={(e) => setLocalPedagio(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  />
                </div>
              </div>

              {/* Motorista */}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Diárias / Motorista (R$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-400 font-medium text-sm">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={motorista}
                      onChange={(e) => setMotorista(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Notas de Escala/Diária</label>
                  <input
                    type="text"
                    placeholder="Ex: Diária de viagem motorista principal"
                    value={localMotorista}
                    onChange={(e) => setLocalMotorista(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  />
                </div>
              </div>

              {/* Outras Despesas */}
              <div className="space-y-4 border-t border-slate-200 pt-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Outras Despesas (R$)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-3 text-slate-400 font-medium text-sm">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={outrasDespesas}
                        onChange={(e) => setOutrasDespesas(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex-2">
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Justificativa / Detalhes</label>
                    <input
                      type="text"
                      placeholder="Ex: Manutenção rápida pneu / Peças"
                      value={outrosDetalhes}
                      onChange={(e) => setOutrosDetalhes(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors text-sm"
                    />
                  </div>
                </div>

                 <div>
                   <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Anexar Comprovante Geral / Recibos</label>
                   <div className="relative group border-2 border-dashed border-slate-200 rounded-xl p-4 bg-white hover:border-blue-500 hover:bg-blue-50/10 transition-all text-center cursor-pointer">
                     <input
                       type="file"
                       accept="image/*,application/pdf"
                       onChange={(e) => handleFileChange(e, setFotoComprovanteGeral)}
                       className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                     />
                     {fotoComprovanteGeral ? (
                       <div className="flex items-center justify-center gap-3">
                         <div className="w-10 h-10 rounded overflow-hidden border bg-slate-50 shrink-0 flex items-center justify-center">
                           {fotoComprovanteGeral.startsWith('data:application/pdf') ? (
                             <FileText size={18} className="text-red-500 animate-bounce" />
                           ) : (
                             <img src={fotoComprovanteGeral} alt="Comprovante Geral" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                           )}
                         </div>
                         <div className="text-left text-xs">
                           <p className="font-bold text-emerald-600">Comprovante de viagem anexado!</p>
                           <p className="text-slate-400 text-[10px]">Clique ou arraste outro para substituir</p>
                         </div>
                       </div>
                     ) : (
                       <div className="flex flex-col items-center justify-center gap-1 text-slate-400">
                         <Camera size={20} className="text-slate-400 mb-0.5" />
                         <span className="text-xs font-bold uppercase tracking-wider">Arraste comprovantes de Despesas Gerais / Recibo (Foto ou PDF)</span>
                       </div>
                     )}
                   </div>
                 </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-3 rounded-2xl text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 font-bold transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-blue-500/10 transition-all"
            >
              Confirmar Cadastro
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
