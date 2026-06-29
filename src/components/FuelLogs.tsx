import React, { useState } from 'react';
import { Fuel, Plus, Calendar, MapPin, DollarSign, Camera, FileText, CheckCircle, Edit, Trash2, Filter, AlertCircle, Building } from 'lucide-react';
import Modal from './ui/Modal';
import { compressAndSetFile, AttachmentPreview } from '../lib/fileCompressor';
import { maskBRL, unmaskBRL } from '../lib/utils';

export default function FuelLogs({ data, onUpdate }: { data: any, onUpdate: () => void }) {
  const [activeTab, setActiveTab] = useState<'logs' | 'stations'>('logs');

  // Abastecimentos states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [newLog, setNewLog] = useState({
    truckId: '',
    driverId: '',
    gasStationId: '',
    data: new Date().toISOString().split('T')[0],
    km: '',
    litros: '',
    valor: '',
    litrosArla: '',
    valorArla: '',
    comprovante: '',
    tipoDiesel: 'S10'
  });

  // Filters
  const [filterTruck, setFilterTruck] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterStation, setFilterStation] = useState('');
  const [showArlaManual, setShowArlaManual] = useState(false);

  // Gas Stations states
  const [isStationModalOpen, setIsStationModalOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [stationForm, setStationForm] = useState({
    nome: '',
    cnpj: '',
    cidade: '',
    uf: '',
    precoDiesel: '',
    status: 'Ativo'
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!newLog.truckId) {
      alert("Por favor, selecione um veículo (Caminhão).");
      return;
    }
    if (!newLog.driverId) {
      alert("Por favor, selecione um motorista.");
      return;
    }
    if (!newLog.km || isNaN(Number(newLog.km)) || Number(newLog.km) <= 0) {
      alert("Por favor, insira uma quilometragem (KM) válida.");
      return;
    }
    if (!newLog.litros || isNaN(Number(newLog.litros)) || Number(newLog.litros) <= 0) {
      alert("Por favor, insira uma quantidade de litros válida.");
      return;
    }
    if (!newLog.valor || isNaN(Number(newLog.valor)) || Number(newLog.valor) <= 0) {
      alert("Por favor, insira um valor numérico válido maior que zero.");
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    try {
      const companyId = data?.company?.id || 'comp_1';

      if (selectedLog) {
        // Edit
        await fetch(`/api/fuel_logs/${selectedLog.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newLog,
            companyId,
            km: Number(newLog.km),
            litros: Number(newLog.litros),
            valor: Number(newLog.valor),
            litrosArla: newLog.litrosArla ? Number(newLog.litrosArla) : undefined,
            valorArla: newLog.valorArla ? Number(newLog.valorArla) : undefined,
            comprovante: newLog.comprovante,
            tipoDiesel: newLog.tipoDiesel || 'S10'
          })
        });
      } else {
        // New
        await fetch('/api/fuel_logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newLog,
            companyId,
            km: Number(newLog.km),
            litros: Number(newLog.litros),
            valor: Number(newLog.valor),
            litrosArla: newLog.litrosArla ? Number(newLog.litrosArla) : undefined,
            valorArla: newLog.valorArla ? Number(newLog.valorArla) : undefined,
            comprovante: newLog.comprovante,
            tipoDiesel: newLog.tipoDiesel || 'S10'
          })
        });

        // Notify chat (simulated for demo)
        await fetch('/api/chat_logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            userId: 'user_1',
            mensagem: `Registro manual de abastecimento: ${newLog.truckId}`,
            resposta: `Abastecimento de R$ ${Number(newLog.valor).toLocaleString('pt-BR')} registrado com sucesso no caminhão ${newLog.truckId}. O caixa e a DRE foram atualizados.`,
            acaoGerada: 'REGISTER_FUEL'
          })
        });
      }

      setIsModalOpen(false);
      setSelectedLog(null);
      setNewLog({ truckId: '', driverId: '', gasStationId: '', data: new Date().toISOString().split('T')[0], km: '', litros: '', valor: '', litrosArla: '', valorArla: '', comprovante: '', tipoDiesel: 'S10' });
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!confirm('Deseja realmente excluir este abastecimento? Isso também removerá os registros financeiros de despesa e fluxo de caixa associados.')) return;

    try {
      await fetch(`/api/fuel_logs/${id}`, {
        method: 'DELETE'
      });
      onUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditLog = (log: any) => {
    setSelectedLog(log);
    setNewLog({
      truckId: log.truckId || '',
      driverId: log.driverId || '',
      gasStationId: log.gasStationId || '',
      data: log.data || new Date().toISOString().split('T')[0],
      km: log.km ? String(log.km) : '',
      litros: log.litros ? String(log.litros) : '',
      valor: log.valor ? String(log.valor) : '',
      litrosArla: log.litrosArla ? String(log.litrosArla) : '',
      valorArla: log.valorArla ? String(log.valorArla) : '',
      comprovante: log.comprovante || '',
      tipoDiesel: log.tipoDiesel || 'S10'
    });
    setShowArlaManual(log.valorArla ? true : false);
    setIsModalOpen(true);
  };

  const handleSaveStation = async () => {
    if (!stationForm.nome) return;

    const companyId = data?.company?.id || 'comp_1';

    if (selectedStation) {
      // Edit
      await fetch(`/api/gas_stations/${selectedStation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stationForm)
      });
    } else {
      // New
      await fetch('/api/gas_stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...stationForm,
          companyId
        })
      });
    }

    setIsStationModalOpen(false);
    setSelectedStation(null);
    setStationForm({ nome: '', cnpj: '', cidade: '', uf: '', precoDiesel: '', status: 'Ativo' });
    onUpdate();
  };

  const handleDeleteStation = async (id: string) => {
    if (!confirm('Deseja realmente excluir este posto?')) return;

    await fetch(`/api/gas_stations/${id}`, {
      method: 'DELETE'
    });
    onUpdate();
  };

  const openEditStation = (station: any) => {
    setSelectedStation(station);
    setStationForm({
      nome: station.nome,
      cnpj: station.cnpj || '',
      cidade: station.cidade || '',
      uf: station.uf || '',
      precoDiesel: station.precoDiesel ? String(station.precoDiesel) : '',
      status: station.status || 'Ativo'
    });
    setIsStationModalOpen(true);
  };

  if (!data) return null;

  // Group logs by truck to properly calculate chronological KM consumption difference
  const logsByTruck: { [key: string]: any[] } = {};
  data.fuel_logs.forEach((log: any) => {
    if (!logsByTruck[log.truckId]) {
      logsByTruck[log.truckId] = [];
    }
    logsByTruck[log.truckId].push({ ...log });
  });

  const calculatedLogsMap = new Map<string, string>();

  Object.keys(logsByTruck).forEach((truckId) => {
    const sorted = logsByTruck[truckId].sort((a: any, b: any) => a.km - b.km);
    sorted.forEach((log: any, index: number) => {
      if (index === 0) {
        calculatedLogsMap.set(log.id, "1º Abast.");
      } else {
        const prev = sorted[index - 1];
        const dist = log.km - prev.km;
        if (dist > 0 && log.litros > 0) {
          const ratio = dist / log.litros;
          calculatedLogsMap.set(log.id, `${ratio.toFixed(2)} km/l`);
        } else {
          calculatedLogsMap.set(log.id, "---");
        }
      }
    });
  });

  // Filter fuel logs
  const filteredFuelLogs = (data.fuel_logs || []).filter((log: any) => {
    const matchesTruck = !filterTruck || log.truckId === filterTruck;
    const matchesDriver = !filterDriver || log.driverId === filterDriver;
    const matchesStation = !filterStation || log.gasStationId === filterStation;
    return matchesTruck && matchesDriver && matchesStation;
  });

  const gasStationsList = data.gas_stations || [];

  return (
    <div className="space-y-6" id="fuel-logs-main-container">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Abastecimentos e Postos</h2>
          <p className="text-sm text-slate-500">Gerencie os abastecimentos da frota e os postos parceiros conveniados.</p>
        </div>
        
        <div className="flex gap-2">
          {activeTab === 'logs' ? (
            <button 
              id="btn-register-fuel-log"
              onClick={() => {
                setSelectedLog(null);
                setNewLog({
                  truckId: '',
                  driverId: '',
                  gasStationId: '',
                  data: new Date().toISOString().split('T')[0],
                  km: '',
                  litros: '',
                  valor: '',
                  comprovante: ''
                });
                setIsModalOpen(true);
              }}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
            >
              <Plus size={20} />
              Registrar Abastecimento
            </button>
          ) : (
            <button 
              id="btn-register-gas-station"
              onClick={() => {
                setSelectedStation(null);
                setStationForm({ nome: '', cnpj: '', cidade: '', uf: '', precoDiesel: '', status: 'Ativo' });
                setIsStationModalOpen(true);
              }}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
            >
              <Plus size={20} />
              Cadastrar Posto
            </button>
          )}
        </div>
      </div>

      {/* Tab Selectors */}
      <div className="flex border-b border-slate-200" id="fuel-logs-tabs">
        <button 
          id="tab-select-logs"
          onClick={() => setActiveTab('logs')}
          className={`px-5 py-3 font-semibold text-sm border-b-2 transition-colors ${activeTab === 'logs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          Histórico de Abastecimentos ({filteredFuelLogs.length})
        </button>
        <button 
          id="tab-select-stations"
          onClick={() => setActiveTab('stations')}
          className={`px-5 py-3 font-semibold text-sm border-b-2 transition-colors ${activeTab === 'stations' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          Postos Cadastrados ({gasStationsList.length})
        </button>
      </div>

      {activeTab === 'logs' ? (
        <div className="space-y-4" id="panel-fuel-logs">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap gap-4 items-center" id="fuel-logs-filters-bar">
            <div className="flex items-center gap-2 text-slate-500 text-sm font-semibold shrink-0">
              <Filter size={16} />
              <span>Filtrar por:</span>
            </div>

            <div className="flex-1 min-w-[150px]">
              <select
                id="select-filter-truck"
                value={filterTruck}
                onChange={e => setFilterTruck(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Todos os Caminhões</option>
                {data.trucks.map((t: any) => (
                  <option key={t.id} value={t.placa}>{t.placa} - {t.modelo}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[150px]">
              <select
                id="select-filter-driver"
                value={filterDriver}
                onChange={e => setFilterDriver(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Todos os Motoristas</option>
                {(data.drivers || []).map((d: any) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[150px]">
              <select
                id="select-filter-station"
                value={filterStation}
                onChange={e => setFilterStation(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Todos os Postos</option>
                {gasStationsList.map((g: any) => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </select>
            </div>

            {(filterTruck || filterDriver || filterStation) && (
              <button
                id="btn-clear-fuel-filters"
                onClick={() => {
                  setFilterTruck('');
                  setFilterDriver('');
                  setFilterStation('');
                }}
                className="text-xs font-bold text-red-500 hover:text-red-600 uppercase tracking-wider"
              >
                Limpar Filtros
              </button>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" id="table-fuel-logs-container">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="table-fuel-logs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Caminhão</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Motorista</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Posto</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Data</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">KM</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Litros</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Valor</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Consumo</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Comprovante</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredFuelLogs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-slate-400 italic">
                        Nenhum abastecimento encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    [...filteredFuelLogs].reverse().map((log: any) => {
                      const matchedDriver = (data.drivers || []).find((d: any) => d.id === log.driverId);
                      const matchedStation = gasStationsList.find((g: any) => g.id === log.gasStationId);
                      return (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                                <Fuel size={16} className="text-blue-600" />
                              </div>
                              <span className="font-bold text-slate-900">{log.truckId}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {matchedDriver ? matchedDriver.nome : <span className="text-slate-400 italic">Não informado</span>}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {matchedStation ? (
                              <span className="font-semibold text-slate-800">{matchedStation.nome}</span>
                            ) : (
                              <span className="text-slate-400 italic">Geral / Não informado</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {new Date(log.data + "T00:00:00").toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-700">
                            {log.km?.toLocaleString()} km
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-700">
                            <div className="flex items-center gap-1.5">
                              <span>{log.litros} L</span>
                              <span className={`px-1.5 py-0.5 text-[9px] font-black rounded uppercase tracking-wider ${
                                (log.tipoDiesel || 'S10') === 'S10'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}>
                                {log.tipoDiesel || 'S10'}
                              </span>
                            </div>
                            {Number(log.litrosArla) > 0 && (
                              <span className="text-[10px] text-sky-600 font-extrabold block mt-0.5">
                                💨 {log.litrosArla} L Arla
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-900">
                            <div>R$ {log.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            {Number(log.valorArla) > 0 && (
                              <span className="text-[10px] text-sky-600 font-extrabold block mt-0.5">
                                💨 R$ {log.valorArla?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                              calculatedLogsMap.get(log.id) === '1º Abast.' ? 'bg-slate-100 text-slate-500' :
                              calculatedLogsMap.get(log.id) === '---' ? 'bg-slate-100 text-slate-400' :
                              'bg-emerald-50 text-emerald-600'
                            }`}>
                              {calculatedLogsMap.get(log.id) || "---"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {log.comprovante ? (
                              <div className="w-24">
                                <AttachmentPreview src={log.comprovante} label={`Comprovante Abastecimento - ${log.truckId}`} className="!h-10 border border-slate-200" />
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Nenhum</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => openEditLog(log)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors"
                                title="Editar Abastecimento"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteLog(log.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded-lg transition-colors"
                                title="Excluir Abastecimento"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Gas Stations Sub-panel */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" id="panel-gas-stations">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="table-gas-stations">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Nome do Posto</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">CNPJ</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Localidade</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Diesel Preço Ref.</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {gasStationsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                      Nenhum posto de combustível conveniado cadastrado. Clique em "Cadastrar Posto" para começar!
                    </td>
                  </tr>
                ) : (
                  gasStationsList.map((station: any) => (
                    <tr key={station.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <Building size={16} className="text-emerald-600" />
                          </div>
                          <span className="font-bold text-slate-900">{station.nome}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                        {station.cnpj || '---'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {station.cidade ? `${station.cidade} / ${station.uf || '---'}` : '---'}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                        {station.precoDiesel ? `R$ ${Number(station.precoDiesel).toFixed(2)}` : '---'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                          station.status === 'Ativo' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {station.status || 'Ativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEditStation(station)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors"
                            title="Editar Posto"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteStation(station.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded-lg transition-colors"
                            title="Excluir Posto"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fuel Log Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setSelectedLog(null);
          setShowArlaManual(false);
          setNewLog({
            truckId: '',
            driverId: '',
            gasStationId: '',
            data: new Date().toISOString().split('T')[0],
            km: '',
            litros: '',
            valor: '',
            litrosArla: '',
            valorArla: '',
            comprovante: '',
            tipoDiesel: 'S10'
          });
        }} 
        title={selectedLog ? "Editar Abastecimento" : "Novo Abastecimento"}
      >
        <div className="space-y-5" id="form-fuel-log">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Caminhão</label>
              <select 
                id="input-fuel-truck"
                value={newLog.truckId}
                onChange={e => setNewLog({...newLog, truckId: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Selecione...</option>
                {data.trucks.map((t: any) => (
                  <option key={t.id} value={t.placa}>{t.placa} - {t.modelo}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Motorista</label>
              <select 
                id="input-fuel-driver"
                value={newLog.driverId}
                onChange={e => setNewLog({...newLog, driverId: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Selecione...</option>
                {(data.drivers || []).map((d: any) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Posto de Abastecimento</label>
              <select 
                id="input-fuel-station"
                value={newLog.gasStationId}
                onChange={e => setNewLog({...newLog, gasStationId: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
              >
                <option value="">Geral / Não listado</option>
                {gasStationsList.map((g: any) => (
                  <option key={g.id} value={g.id}>{g.nome} {g.cidade ? `(${g.cidade}/${g.uf})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo de Diesel</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewLog({...newLog, tipoDiesel: 'S10'})}
                  className={`py-2.5 px-4 rounded-xl font-bold border text-sm transition-all flex items-center justify-center gap-2 ${
                    (newLog.tipoDiesel || 'S10') === 'S10'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-700 shadow-sm shadow-amber-500/5'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Diesel S10
                </button>
                <button
                  type="button"
                  onClick={() => setNewLog({...newLog, tipoDiesel: 'S500'})}
                  className={`py-2.5 px-4 rounded-xl font-bold border text-sm transition-all flex items-center justify-center gap-2 ${
                    newLog.tipoDiesel === 'S500'
                      ? 'bg-blue-600/10 border-blue-600 text-blue-700 shadow-sm shadow-blue-600/5'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  Diesel S500
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Data</label>
              <input 
                id="input-fuel-data"
                type="date" 
                value={newLog.data}
                onChange={e => setNewLog({...newLog, data: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">KM Atual</label>
              <input 
                id="input-fuel-km"
                type="number" 
                value={newLog.km}
                onChange={e => setNewLog({...newLog, km: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Litros</label>
              <input 
                id="input-fuel-litros"
                type="number" 
                value={newLog.litros}
                onChange={e => setNewLog({...newLog, litros: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Valor (R$)</label>
              <input 
                id="input-fuel-valor"
                type="text" 
                value={newLog.valor ? maskBRL(newLog.valor) : ""}
                onChange={e => {
                  const masked = maskBRL(e.target.value);
                  setNewLog({...newLog, valor: masked ? String(unmaskBRL(masked)) : ""});
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold font-mono text-slate-700"
                placeholder="R$ 0,00"
              />
            </div>
          </div>

          {/* Arla 32 conditional fields */}
          {(() => {
            const selectedTruckObj = (data.trucks || []).find((t: any) => t.placa === newLog.truckId);
            const usesArla = selectedTruckObj?.usaArla;
            const isVisible = usesArla || showArlaManual;

            if (isVisible) {
              return (
                <div className="bg-sky-50/50 p-4 rounded-2xl border border-sky-100 space-y-3">
                  <div className="flex justify-between items-center border-b border-sky-100/50 pb-2">
                    <span className="text-xs font-black text-sky-800 uppercase tracking-wider flex items-center gap-1.5">
                      💨 Abastecimento de Arla 32 (Adicional)
                    </span>
                    {!usesArla && (
                      <button 
                        type="button"
                        onClick={() => {
                          setShowArlaManual(false);
                          setNewLog({ ...newLog, litrosArla: '', valorArla: '' });
                        }}
                        className="text-[10px] font-bold text-sky-600 hover:underline"
                      >
                        Ocultar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-sky-800 mb-1">Litros Arla</label>
                      <input 
                        id="input-fuel-litros-arla"
                        type="number" 
                        value={newLog.litrosArla}
                        onChange={e => setNewLog({...newLog, litrosArla: e.target.value})}
                        className="w-full bg-white border border-sky-200/80 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-sky-800 mb-1">Valor Arla (R$)</label>
                      <input 
                        id="input-fuel-valor-arla"
                        type="text" 
                        value={newLog.valorArla ? maskBRL(newLog.valorArla) : ""}
                        onChange={e => {
                          const masked = maskBRL(e.target.value);
                          setNewLog({...newLog, valorArla: masked ? String(unmaskBRL(masked)) : ""});
                        }}
                        className="w-full bg-white border border-sky-200/80 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 font-bold font-mono text-slate-700"
                        placeholder="R$ 0,00"
                      />
                    </div>
                  </div>
                </div>
              );
            } else {
              return (
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => setShowArlaManual(true)}
                    className="text-xs font-bold text-sky-600 hover:text-sky-750 bg-sky-50 border border-sky-100 hover:bg-sky-100/50 px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>💨 Registrar também Arla 32 para este abastecimento</span>
                  </button>
                </div>
              );
            }
          })()}
          <div className="relative border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-4 text-center hover:border-blue-500 hover:bg-blue-50/10 transition-all cursor-pointer">
            <input 
              type="file"
              accept="image/*,application/pdf"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  compressAndSetFile(file, (base64) => {
                    setNewLog({ ...newLog, comprovante: base64 });
                  });
                }
              }}
            />
            {newLog.comprovante ? (
              <div className="flex items-center gap-2">
                {newLog.comprovante.startsWith('data:application/pdf') ? (
                  <FileText className="text-red-500 w-8 h-8 shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded overflow-hidden border bg-slate-150 shrink-0">
                    <img src={newLog.comprovante} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="text-left">
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle size={14} /> Documento anexado!
                  </span>
                  <p className="text-[10px] text-slate-400">Clique ou arraste outro para substituir</p>
                </div>
              </div>
            ) : (
              <>
                <Camera size={24} className="text-slate-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Anexar Comprovante (Foto ou PDF)</span>
              </>
            )}
          </div>
          <div className="flex gap-3 pt-4">
            <button 
              id="btn-cancel-fuel-log"
              onClick={() => {
                setIsModalOpen(false);
                setSelectedLog(null);
                setNewLog({
                  truckId: '',
                  driverId: '',
                  gasStationId: '',
                  data: new Date().toISOString().split('T')[0],
                  km: '',
                  litros: '',
                  valor: '',
                  comprovante: ''
                });
              }}
              className="flex-1 px-4 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button 
              id="btn-submit-fuel-log"
              onClick={handleSave}
              disabled={isSaving}
              className={`flex-1 px-4 py-3 rounded-xl font-semibold text-white transition-colors shadow-lg shadow-blue-200 ${isSaving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isSaving ? "Salvando..." : (selectedLog ? "Salvar Alterações" : "Salvar Registro")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Gas Station Register/Edit Modal */}
      <Modal 
        isOpen={isStationModalOpen} 
        onClose={() => setIsStationModalOpen(false)} 
        title={selectedStation ? "Editar Posto" : "Novo Posto Conveniado"}
      >
        <div className="space-y-5" id="form-gas-station">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome do Posto</label>
            <input 
              id="input-station-nome"
              type="text"
              value={stationForm.nome}
              onChange={e => setStationForm({...stationForm, nome: e.target.value})}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Ex: Posto Graal Rodovia"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">CNPJ (Opcional)</label>
              <input 
                id="input-station-cnpj"
                type="text"
                value={stationForm.cnpj}
                onChange={e => setStationForm({...stationForm, cnpj: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="00.000.000/0001-00"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Diesel Preço Ref.</label>
              <input 
                id="input-station-precoDiesel"
                type="number"
                step="0.01"
                value={stationForm.precoDiesel}
                onChange={e => setStationForm({...stationForm, precoDiesel: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cidade</label>
              <input 
                id="input-station-cidade"
                type="text"
                value={stationForm.cidade}
                onChange={e => setStationForm({...stationForm, cidade: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Ex: Rondonópolis"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Estado (UF)</label>
              <input 
                id="input-station-uf"
                type="text"
                maxLength={2}
                value={stationForm.uf}
                onChange={e => setStationForm({...stationForm, uf: e.target.value.toUpperCase()})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Ex: MT"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
            <select
              id="input-station-status"
              value={stationForm.status}
              onChange={e => setStationForm({...stationForm, status: e.target.value})}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              id="btn-cancel-gas-station"
              onClick={() => setIsStationModalOpen(false)}
              className="flex-1 px-4 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button 
              id="btn-submit-gas-station"
              onClick={handleSaveStation}
              className="flex-1 px-4 py-3 rounded-xl font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
            >
              {selectedStation ? "Salvar Alterações" : "Cadastrar Posto"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
