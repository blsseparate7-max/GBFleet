import React, { useState } from 'react';
import { Fuel, Plus, Calendar, MapPin, DollarSign, Camera, FileText, CheckCircle } from 'lucide-react';
import Modal from './ui/Modal';
import { compressAndSetFile, AttachmentPreview } from '../lib/fileCompressor';

export default function FuelLogs({ data, onUpdate }: { data: any, onUpdate: () => void }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newLog, setNewLog] = useState({
    truckId: '',
    data: new Date().toISOString().split('T')[0],
    km: '',
    litros: '',
    valor: '',
    comprovante: ''
  });

  const handleSave = async () => {
    if (!newLog.truckId || !newLog.km || !newLog.litros || !newLog.valor) return;

    const companyId = data?.company?.id || 'comp_1';

    await fetch('/api/fuel_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newLog,
        companyId,
        km: Number(newLog.km),
        litros: Number(newLog.litros),
        valor: Number(newLog.valor),
        comprovante: newLog.comprovante
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

    setIsModalOpen(false);
    setNewLog({ truckId: '', data: new Date().toISOString().split('T')[0], km: '', litros: '', valor: '', comprovante: '' });
    onUpdate();
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
    // Sort ascending by KM because distance traveled goes forward as KM goes up
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Histórico de Abastecimentos</h2>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
        >
          <Plus size={20} />
          Registrar Abastecimento
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Caminhão</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Data</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">KM</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Litros</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Consumo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Comprovante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.fuel_logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                    Nenhum abastecimento registrado. Use o chat para começar!
                  </td>
                </tr>
              ) : (
                [...data.fuel_logs].reverse().map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                          <Fuel size={16} className="text-blue-600" />
                        </div>
                        <span className="font-bold text-slate-900">{log.truckId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(log.data).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">
                      {log.km.toLocaleString()} km
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">
                      {log.litros} L
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900">
                      R$ {log.valor.toLocaleString()}
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Novo Abastecimento">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Caminhão</label>
              <select 
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
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Data</label>
              <input 
                type="date" 
                value={newLog.data}
                onChange={e => setNewLog({...newLog, data: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">KM Atual</label>
              <input 
                type="number" 
                value={newLog.km}
                onChange={e => setNewLog({...newLog, km: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Litros</label>
              <input 
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
                type="number" 
                value={newLog.valor}
                onChange={e => setNewLog({...newLog, valor: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="0,00"
              />
            </div>
          </div>
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
              onClick={() => setIsModalOpen(false)}
              className="flex-1 px-4 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSave}
              className="flex-1 px-4 py-3 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
            >
              Salvar Registro
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
