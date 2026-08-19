import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Calendar, 
  Users, 
  Route, 
  Plus, 
  Trash2, 
  FileText, 
  CheckCircle, 
  Coins, 
  Award,
  Wallet,
  Loader2
} from 'lucide-react';
import { cn, maskBRL, unmaskBRL, formatDateBR } from '../lib/utils';
import { showToast } from './ui/Toast';

interface DriverFinancialsProps {
  data: any;
  onUpdate: () => void;
}

export default function DriverFinancials({ data, onUpdate }: DriverFinancialsProps) {
  // Filters and Selection states
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return new Date().toISOString().slice(0, 7); // "YYYY-MM"
  });

  // Adjustment form states
  const [adjustmentTipo, setAdjustmentTipo] = useState<'Vale' | 'Desconto' | 'Bônus'>('Vale');
  const [adjustmentValor, setAdjustmentValor] = useState<string>('');
  const [adjustmentDescricao, setAdjustmentDescricao] = useState<string>('');
  const [adjustmentData, setAdjustmentData] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Payment registration states
  const [meioPagamento, setMeioPagamento] = useState<string>('Pix');
  const [paymentObservacao, setPaymentObservacao] = useState<string>('');
  const [isSubmittingPay, setIsSubmittingPay] = useState<boolean>(false);
  const [isSubmittingAdj, setIsSubmittingAdj] = useState<boolean>(false);

  // Active Selected Driver Object
  const selectedDriver = useMemo(() => {
    if (!selectedDriverId || !data?.drivers) return null;
    return data.drivers.find((d: any) => d.id === selectedDriverId);
  }, [selectedDriverId, data?.drivers]);

  // Voyages / Freights for selected driver and month
  const driverFreights = useMemo(() => {
    if (!selectedDriverId || !data?.freights) return [];
    return data.freights.filter((f: any) => {
      if (f.driverId !== selectedDriverId) return false;
      // Check if date starts with the selected month "YYYY-MM"
      return f.data && f.data.startsWith(selectedMonth);
    });
  }, [selectedDriverId, selectedMonth, data?.freights]);

  // Adjustments (Vales / Bônus / Descontos) for selected driver and month
  const driverAdjustments = useMemo(() => {
    if (!selectedDriverId || !data?.driver_adjustments) return [];
    return data.driver_adjustments.filter((a: any) => {
      return a.driverId === selectedDriverId && a.referenciaMesAno === selectedMonth;
    });
  }, [selectedDriverId, selectedMonth, data?.driver_adjustments]);

  // Driver Payments history
  const driverPayments = useMemo(() => {
    if (!selectedDriverId || !data?.driver_payments) return [];
    return data.driver_payments.filter((p: any) => p.driverId === selectedDriverId)
      .sort((a: any, b: any) => b.data.localeCompare(a.data));
  }, [selectedDriverId, data?.driver_payments]);

  // Automatically calculated summaries
  const totals = useMemo(() => {
    const salarioFixo = selectedDriver ? (selectedDriver.salarioFixo || 0) : 0;
    
    let diarias = 0;
    let almoco = 0;
    let comissoes = 0;

    driverFreights.forEach((f: any) => {
      diarias += (f.valorDiaria || 0);
      almoco += (f.valorAlmoco || 0);
      comissoes += (f.motorista || 0);
    });

    let bônus = 0;
    let valesDescontos = 0;

    driverAdjustments.forEach((a: any) => {
      if (a.tipo === 'Bônus') {
        bônus += (a.valor || 0);
      } else {
        // "Vale" and "Desconto" reduce the paid amount
        valesDescontos += (a.valor || 0);
      }
    });

    const saldoAjustes = bônus - valesDescontos;
    const totalLiquido = salarioFixo + diarias + almoco + comissoes + saldoAjustes;

    return {
      salarioFixo,
      diarias,
      almoco,
      comissoes,
      bônus,
      valesDescontos,
      saldoAjustes,
      totalLiquido
    };
  }, [selectedDriver, driverFreights, driverAdjustments]);

  // Handle registering an adjustment
  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriverId) {
      showToast('Selecione um motorista primeiro!', 'error');
      return;
    }
    const val = parseFloat(adjustmentValor);
    if (isNaN(val) || val <= 0) {
      showToast('Insira um valor válido para o ajuste.', 'error');
      return;
    }
    if (!adjustmentDescricao) {
      showToast('Insira uma breve descrição para o ajuste.', 'error');
      return;
    }

    if (isSubmittingAdj) return;
    setIsSubmittingAdj(true);
    try {
      const response = await fetch('/api/driver_adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: selectedDriverId,
          data: adjustmentData,
          tipo: adjustmentTipo,
          valor: val,
          descricao: adjustmentDescricao,
          referenciaMesAno: selectedMonth
        })
      });

      if (response.ok) {
        showToast(`✓ Ajuste de ${adjustmentTipo} registrado com sucesso no banco!`, 'success');
        setAdjustmentValor('');
        setAdjustmentDescricao('');
        onUpdate();
      } else {
        showToast('Erro ao registrar ajuste.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro de conexão ao salvar ajuste.', 'error');
    } finally {
      setIsSubmittingAdj(false);
    }
  };

  // Handle removing adjustment
  const handleDeleteAdjustment = async (id: string) => {
    if (!confirm('Deseja realmente excluir este lançamento de ajuste?')) return;
    try {
      const response = await fetch(`/api/driver_adjustments/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        showToast('Ajuste excluído com sucesso!', 'success');
        onUpdate();
      } else {
        showToast('Erro ao excluir ajuste.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro de conexão ao excluir ajuste.', 'error');
    }
  };

  // Handle submitting the final payment settlement
  const handleRegisterPayment = async () => {
    if (!selectedDriverId) return;
    if (totals.totalLiquido <= 0) {
      if (!confirm('O valor líquido calculado é zero ou negativo. Deseja registrar este pagamento mesmo assim?')) {
        return;
      }
    }

    // Check if payment already exists for this period to warn user
    const alreadyPaid = driverPayments.some((p: any) => p.referenciaMesAno === selectedMonth);
    if (alreadyPaid) {
      if (!confirm(`Já existe um pagamento registrado para este motorista na referência ${selectedMonth}. Deseja registrar um novo pagamento duplicado?`)) {
        return;
      }
    }

    if (isSubmittingPay) return;
    setIsSubmittingPay(true);
    try {
      const response = await fetch('/api/driver_payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: selectedDriverId,
          data: new Date().toISOString().split('T')[0],
          referenciaMesAno: selectedMonth,
          valorSalario: totals.salarioFixo,
          valorDiarias: totals.diarias,
          valorAlmoco: totals.almoco,
          valorComissoes: totals.comissoes,
          valorAjustes: totals.saldoAjustes,
          valorTotalPago: totals.totalLiquido,
          meioPagamento,
          observacao: paymentObservacao
        })
      });

      if (response.ok) {
        showToast('✓ Pagamento registrado e integrado às despesas e caixa com sucesso!', 'success');
        setPaymentObservacao('');
        onUpdate();
      } else {
        showToast('Erro ao salvar pagamento.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro de conexão ao registrar pagamento.', 'error');
    } finally {
      setIsSubmittingPay(false);
    }
  };

  // Handle removing payment
  const handleDeletePayment = async (id: string) => {
    if (!confirm('Atenção: Excluir este registro de pagamento NÃO removerá a despesa correspondente do fluxo de caixa central por motivos de segurança contábil. Deseja prosseguir com a exclusão do recibo do motorista?')) {
      return;
    }
    try {
      const response = await fetch(`/api/driver_payments/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        showToast('Recibo de pagamento excluído!', 'success');
        onUpdate();
      } else {
        showToast('Erro ao excluir registro de pagamento.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro de conexão ao excluir recibo.', 'error');
    }
  };

  // Generate Print window or custom HTML modal for a specific recorded payment receipt
  const printReceipt = (payment: any) => {
    const drvName = selectedDriver ? selectedDriver.nome : 'Motorista';
    const drvCpf = selectedDriver ? selectedDriver.cpf : '';
    const dateFormatted = formatDateBR(payment.data);
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Recibo GBFleet - ${drvName}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: bold; color: #1e3a8a; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
            .details-table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 30px; }
            .details-table th, .details-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            .details-table th { bg-color: #f3f4f6; }
            .total-row { font-weight: bold; font-size: 16px; background-color: #eff6ff; }
            .signature { margin-top: 80px; text-align: center; display: flex; justify-content: space-around; }
            .sig-line { border-top: 1px solid #333; width: 250px; margin-top: 40px; padding-top: 10px; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">RECIBO DE FECHAMENTO FINANCEIRO - MOTORISTA</div>
            <p>GBFleet AI - Sistema Integrado de Gestão de Transportes</p>
          </div>
          <div class="meta">
            <div>
              <strong>Favorecido (Motorista):</strong> ${drvName}<br/>
              <strong>CPF:</strong> ${drvCpf}
            </div>
            <div>
              <strong>Mês de Referência:</strong> ${payment.referenciaMesAno}<br/>
              <strong>Data de Emissão:</strong> ${dateFormatted}
            </div>
          </div>
          
          <h3>Itemização dos Valores Calculados</h3>
          <table class="details-table">
            <thead>
              <tr>
                <th>Descrição do Item</th>
                <th style="text-align: right;">Valor (R$)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Salário Fixo Mensal</td>
                <td style="text-align: right;">R$ ${payment.valorSalario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td>Diárias de Viagem Acumuladas</td>
                <td style="text-align: right;">R$ ${payment.valorDiarias.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td>Ajuda de Almoço/Refeição Acumulada</td>
                <td style="text-align: right;">R$ ${payment.valorAlmoco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td>Comissões / Adicionais de Viagem</td>
                <td style="text-align: right;">R$ ${payment.valorComissoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td>Ajustes Especiais (Vales, Descontos e Bônus)</td>
                <td style="text-align: right;">R$ ${payment.valorAjustes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr class="total-row">
                <td>Valor Líquido Total Pago (${payment.meioPagamento})</td>
                <td style="text-align: right; color: #2563eb;">R$ ${payment.valorTotalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 20px; font-size: 14px; background-color: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <strong>Observações do Pagamento:</strong><br/>
            ${payment.observacao || 'Nenhuma observação informada.'}
          </div>

          <div style="margin-top: 50px; font-size: 12px; color: #555;">
            Declaramos para os devidos fins que o valor líquido acima descrito foi creditado e liquidado ao motorista favorecido através de ${payment.meioPagamento}, quitando integralmente as obrigações deste período de referência.
          </div>

          <div class="signature">
            <div class="sig-line">
              Representante da Empresa (GBFleet)
            </div>
            <div class="sig-line">
              Favorecido: ${drvName}
            </div>
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet className="text-blue-600" size={28} />
            Módulo Financeiro de Motoristas
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Fechamento de faturamento mensal, diárias sob demanda, refeições, adiantamentos e integração direta com o fluxo de caixa.
          </p>
        </div>
      </div>

      {/* Driver and Month filter bar */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Selecione o Motorista para Fechamento</label>
          <select
            value={selectedDriverId}
            onChange={(e) => setSelectedDriverId(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 transition-colors font-bold text-slate-700"
          >
            <option value="">Selecione um motorista...</option>
            {(data?.drivers || []).map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.nome} (CPF: {d.cpf})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Mês de Referência do Pagamento</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 transition-colors font-bold text-slate-700 font-mono"
          />
        </div>
      </div>

      {!selectedDriverId ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-16 text-center text-slate-400">
          <Users className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="font-bold text-slate-700 mb-1">Nenhum Motorista Selecionado</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Por favor, escolha um motorista e o mês de referência acima para carregar o extrato de viagens, vales e calcular o recibo de pagamento integrado.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT/MID: travel listings and adjustments (col-span-2) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* A. Extrato de Viagens */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Route className="text-indigo-600" size={20} />
                  <h3 className="font-bold text-slate-800">Extrato de Viagens (Viagens do Mês)</h3>
                </div>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-black">
                  {driverFreights.length} fretes
                </span>
              </div>

              {driverFreights.length === 0 ? (
                <div className="p-12 text-center text-slate-400 italic">
                  Nenhum frete com custos registrado para este motorista no período selecionado.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        <th className="p-4">Data</th>
                        <th className="p-4">Rota</th>
                        <th className="p-4 text-right">Diária</th>
                        <th className="p-4 text-right">Almoço</th>
                        <th className="p-4 text-right">Comissão</th>
                        <th className="p-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {driverFreights.map((f: any) => {
                        const tripTotal = (f.valorDiaria || 0) + (f.valorAlmoco || 0) + (f.motorista || 0);
                        return (
                          <tr key={f.id} className="hover:bg-slate-50/30">
                            <td className="p-4 font-mono text-slate-500 whitespace-nowrap">
                              {formatDateBR(f.data)}
                            </td>
                            <td className="p-4 text-slate-700">
                              <div className="flex items-center gap-1.5 font-bold">
                                <span>{f.origem.split(',')[0]}</span>
                                <span className="text-slate-300">➡️</span>
                                <span className="text-blue-600">{f.destino.split(',')[0]}</span>
                              </div>
                            </td>
                            <td className="p-4 text-right font-mono text-slate-700 font-bold">
                              {maskBRL(f.valorDiaria || 0)}
                            </td>
                            <td className="p-4 text-right font-mono text-slate-700 font-bold">
                              {maskBRL(f.valorAlmoco || 0)}
                            </td>
                            <td className="p-4 text-right font-mono text-slate-700 font-bold">
                              {maskBRL(f.motorista || 0)}
                            </td>
                            <td className="p-4 text-right font-mono text-indigo-600 font-extrabold bg-indigo-50/20">
                              {maskBRL(tripTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* B. Vales, Descontos e Bônus */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Coins className="text-amber-500" size={20} />
                  <h3 className="font-bold text-slate-800">Vales, Descontos e Adiantamentos</h3>
                </div>
                <span className="text-xs bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-black">
                  {driverAdjustments.length} lançamentos
                </span>
              </div>

              {/* Inline layout dividing adjustments list and adjustment form */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                
                {/* 1. List of active adjustments */}
                <div className="p-6 space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Histórico de Ajustes</h4>
                  {driverAdjustments.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 italic text-xs">
                      Nenhum adiantamento, vale ou desconto registrado neste período.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {driverAdjustments.map((a: any) => (
                        <div key={a.id} className="bg-slate-50 border border-slate-150 p-3 rounded-2xl flex items-center justify-between gap-3 text-xs">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider",
                                a.tipo === 'Bônus' ? "bg-emerald-50 text-emerald-700" :
                                a.tipo === 'Vale' ? "bg-amber-50 text-amber-700" :
                                "bg-rose-50 text-rose-700"
                              )}>
                                {a.tipo}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono font-bold">
                                {formatDateBR(a.data)}
                              </span>
                            </div>
                            <p className="font-bold text-slate-700 leading-snug">{a.descricao}</p>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <span className={cn(
                              "font-mono font-extrabold text-sm",
                              a.tipo === 'Bônus' ? "text-emerald-600" : "text-rose-500"
                            )}>
                              {a.tipo === 'Bônus' ? '+' : '-'} R$ {(a.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <button
                              onClick={() => handleDeleteAdjustment(a.id)}
                              className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Excluir Lançamento"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Add adjustment form */}
                <form onSubmit={handleAddAdjustment} className="p-6 space-y-4 bg-slate-50/30">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Novo Lançamento</h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Tipo</label>
                      <select
                        value={adjustmentTipo}
                        onChange={(e: any) => setAdjustmentTipo(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 text-xs font-bold text-slate-700"
                      >
                        <option value="Vale">Vale (Adiantamento)</option>
                        <option value="Desconto">Desconto (Danos/Multas)</option>
                        <option value="Bônus">Bônus (Meta/Produtividade)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Valor</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-slate-400 text-xs font-bold">R$</span>
                        <input
                          type="text"
                          placeholder="0,00"
                          value={adjustmentValor ? maskBRL(adjustmentValor) : ""}
                          onChange={(e) => {
                            const masked = maskBRL(e.target.value);
                            setAdjustmentValor(masked ? String(unmaskBRL(masked)) : "");
                          }}
                          className="w-full pl-7 pr-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 text-xs font-bold font-mono text-slate-700"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Descrição / Justificativa</label>
                    <input
                      type="text"
                      placeholder="Ex: Vale adiantamento p/ pneu ou bônus carga"
                      value={adjustmentDescricao}
                      onChange={(e) => setAdjustmentDescricao(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 text-xs font-medium"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Data Lançamento</label>
                      <input
                        type="date"
                        value={adjustmentData}
                        onChange={(e) => setAdjustmentData(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 text-xs font-mono font-bold"
                        required
                      />
                    </div>
                    
                    <button
                      type="submit"
                      disabled={isSubmittingAdj}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-xs py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isSubmittingAdj ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                          <span>Gravando...</span>
                        </>
                      ) : (
                        <>
                          <Plus size={14} />
                          <span>Lançar</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>

              </div>
            </div>

          </div>

          {/* RIGHT: Financial statement & summary (col-span-1) */}
          <div className="space-y-8">
            
            {/* C. Demonstrativo de Fechamento */}
            <div className="bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex items-center gap-2 mb-6">
                <Award className="text-blue-400" size={24} />
                <h3 className="font-extrabold text-lg text-slate-100">Cálculo de Liquidação</h3>
              </div>

              {/* Driver identity summary */}
              <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 mb-6 text-xs space-y-1.5">
                <p className="font-black text-slate-200 text-sm leading-none">{selectedDriver?.nome}</p>
                <p className="text-slate-400 font-mono">CPF: {selectedDriver?.cpf}</p>
                <p className="text-slate-400 font-sans">Remuneração: <span className="text-blue-400 font-bold">{selectedDriver?.tipoRemuneracao || 'Fixo + Variável'}</span></p>
              </div>

              {/* Math list */}
              <div className="space-y-3.5 text-xs border-b border-slate-800 pb-5 mb-5">
                <div className="flex justify-between items-center text-slate-300">
                  <span>Salário Fixo Mensal</span>
                  <span className="font-mono font-bold text-slate-100">{maskBRL(totals.salarioFixo)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span className="flex items-center gap-1">
                    Diárias Acumuladas
                    <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[9px] font-black">{driverFreights.length}v</span>
                  </span>
                  <span className="font-mono font-bold text-slate-100">{maskBRL(totals.diarias)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span>Ajuda de Custo (Almoço)</span>
                  <span className="font-mono font-bold text-slate-100">{maskBRL(totals.almoco)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span>Comissões de Frete</span>
                  <span className="font-mono font-bold text-slate-100">{maskBRL(totals.comissoes)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span>Ajustes Adicionais (Bônus)</span>
                  <span className="font-mono font-bold text-emerald-400">+{maskBRL(totals.bônus)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span>Vales e Descontos</span>
                  <span className="font-mono font-bold text-rose-400">-{maskBRL(totals.valesDescontos)}</span>
                </div>
              </div>

              {/* Grand Total */}
              <div className="flex justify-between items-center mb-6">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Total Líquido Devido</span>
                  <span className="text-xs text-blue-400 font-mono font-bold block">Referência: {selectedMonth}</span>
                </div>
                <span className="text-2xl font-black font-mono text-blue-400">
                  {maskBRL(totals.totalLiquido)}
                </span>
              </div>

              {/* Controls */}
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-bold uppercase tracking-wider mb-1.5">Meio de Pagamento</label>
                  <select
                    value={meioPagamento}
                    onChange={(e) => setMeioPagamento(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                  >
                    <option value="Pix">Pix / Transferência Online</option>
                    <option value="Dinheiro">Dinheiro em Espécie</option>
                    <option value="Conta Bancária">Depósito Identificado</option>
                    <option value="Cheque">Cheque Nominal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold uppercase tracking-wider mb-1.5">Observação de Recibo / Notas</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Pagamento integral de salário e adicionais da quinzena"
                    value={paymentObservacao}
                    onChange={(e) => setPaymentObservacao(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                  />
                </div>

                <button
                  onClick={handleRegisterPayment}
                  disabled={isSubmittingPay}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white font-black text-xs uppercase tracking-wider py-3 px-4 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:cursor-not-allowed"
                >
                  {isSubmittingPay ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>GRAVANDO NO BANCO...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      <span>REGISTRAR E INTEGRAR CAIXA</span>
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* D. Historico de Fechamentos Concluídos */}
      {selectedDriverId && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-8">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <FileText className="text-blue-600" size={20} />
              Recibos de Fechamentos Registrados (Histórico do Motorista)
            </h3>
            <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-black">
              {driverPayments.length} recibos
            </span>
          </div>

          {driverPayments.length === 0 ? (
            <div className="p-12 text-center text-slate-400 italic">
              Nenhum pagamento registrado anteriormente para este motorista.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-4">Período</th>
                    <th className="p-4">Data Registro</th>
                    <th className="p-4 text-right">Salário</th>
                    <th className="p-4 text-right">Diárias</th>
                    <th className="p-4 text-right">Almoço</th>
                    <th className="p-4 text-right">Comissões</th>
                    <th className="p-4 text-right">Ajustes</th>
                    <th className="p-4 text-right">Líquido Pago</th>
                    <th className="p-4">Meio</th>
                    <th className="p-4">Observações</th>
                    <th className="p-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {driverPayments.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50/30">
                      <td className="p-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {p.referenciaMesAno}
                      </td>
                      <td className="p-4 font-mono text-slate-500 whitespace-nowrap">
                        {formatDateBR(p.data)}
                      </td>
                      <td className="p-4 text-right font-mono text-slate-600">{maskBRL(p.valorSalario)}</td>
                      <td className="p-4 text-right font-mono text-slate-600">{maskBRL(p.valorDiarias)}</td>
                      <td className="p-4 text-right font-mono text-slate-600">{maskBRL(p.valorAlmoco)}</td>
                      <td className="p-4 text-right font-mono text-slate-600">{maskBRL(p.valorComissoes)}</td>
                      <td className="p-4 text-right font-mono text-slate-600">{maskBRL(p.valorAjustes)}</td>
                      <td className="p-4 text-right font-mono text-blue-600 font-extrabold">{maskBRL(p.valorTotalPago)}</td>
                      <td className="p-4 font-semibold text-slate-600">{p.meioPagamento}</td>
                      <td className="p-4 text-slate-500 truncate max-w-[150px]" title={p.observacao}>{p.observacao || '---'}</td>
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => printReceipt(p)}
                            className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-all font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                          >
                            <FileText size={12} />
                            <span>Imprimir Recibo</span>
                          </button>
                          <button
                            onClick={() => handleDeletePayment(p.id)}
                            className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Remover Registro de Recibo"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
