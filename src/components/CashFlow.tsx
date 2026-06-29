import React, { useState, useMemo } from 'react';
import { 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Wallet, 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit, 
  Download, 
  Printer, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Truck, 
  User, 
  RefreshCw, 
  FileText, 
  Tag, 
  AlertTriangle,
  X,
  FileSpreadsheet,
  Check,
  Percent
} from 'lucide-react';
import { cn, maskBRL, unmaskBRL } from '../lib/utils';
import Modal from './ui/Modal';

// Category options for Trucking industry
const CATEGORIES_ENTRADA = [
  "Faturamento de Frete",
  "Aporte de Capital",
  "Estadia de Viagem",
  "Reembolso de Despesas",
  "Outros Recebíveis"
];

const CATEGORIES_SAIDA = [
  "Diesel (Abastecimento)",
  "Pedágios",
  "Manutenção e Peças",
  "Motorista (Diária/Comissão)",
  "Pneus",
  "Seguros & Rastreamento",
  "Administrativo & Escritório",
  "Impostos/Licenciamento",
  "Outras Despesas"
];

export default function CashFlow({ data, onUpdate }: { data: any, onUpdate: () => void }) {
  if (!data) return <div className="p-12 text-center text-slate-500 font-sans">Carregando controlador do caixa...</div>;

  const categoriesEntrada = data.categories_entrada || CATEGORIES_ENTRADA;
  const categoriesSaida = data.categories_saida || CATEGORIES_SAIDA;

  // Modal and Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  // Category Management State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatTipo, setNewCatTipo] = useState<'entrada' | 'saida'>('entrada');
  const [newCatNome, setNewCatNome] = useState('');
  const [editingCat, setEditingCat] = useState<{ tipo: 'entrada' | 'saida', name: string } | null>(null);
  const [editingCatNewName, setEditingCatNewName] = useState('');

  // Form Inputs
  const [formTipo, setFormTipo] = useState<'entrada' | 'saida'>('entrada');
  const [formValor, setFormValor] = useState('');
  const [formData, setFormData] = useState(new Date().toISOString().split('T')[0]);
  const [formDescricao, setFormDescricao] = useState('');
  const [formCategoria, setFormCategoria] = useState('');
  const [formTruckId, setFormTruckId] = useState('');
  const [formDriverId, setFormDriverId] = useState('');
  const [formMeioPagamento, setFormMeioPagamento] = useState('Pix');

  // Filtering list state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTipo, setFilterTipo] = useState<'all' | 'entrada' | 'saida'>('all');
  const [filterCategoria, setFilterCategoria] = useState('all');
  const [filterTruckId, setFilterTruckId] = useState('all');
  const [filterDriverId, setFilterDriverId] = useState('all');
  const [filterPeriodo, setFilterPeriodo] = useState<'all' | 'today' | '7days' | 'month' | 'last_month'>('all');
  const [filterMeioPagamento, setFilterMeioPagamento] = useState('all');

  // UI feedback triggers
  const [copied, setCopied] = useState(false);
  const [csvNotice, setCsvNotice] = useState(false);

  // Quick reset logic for form
  const resetForm = () => {
    setFormTipo('entrada');
    setFormValor('');
    setFormData(new Date().toISOString().split('T')[0]);
    setFormDescricao('');
    setFormCategoria('');
    setFormTruckId('');
    setFormDriverId('');
    setFormMeioPagamento('Pix');
    setEditingItem(null);
  };

  // Populate form for edit
  const handleStartEdit = (item: any) => {
    setEditingItem(item);
    setFormTipo(item.tipo);
    setFormValor(item.valor.toString());
    setFormData(item.data);
    setFormDescricao(item.descricao);
    setFormCategoria(item.categoria || '');
    setFormTruckId(item.truckId || '');
    setFormDriverId(item.driverId || '');
    setFormMeioPagamento(item.meioPagamento || 'Pix');
    setIsModalOpen(true);
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValor || isNaN(Number(formValor)) || Number(formValor) <= 0) {
      alert("Por favor, insira um valor numérico válido e maior que zero.");
      return;
    }
    if (!formDescricao.trim()) {
      alert("Insira uma descrição válida.");
      return;
    }

    const companyId = data?.company?.id || 'comp_1';

    const payload = {
      companyId,
      tipo: formTipo,
      valor: parseFloat(formValor),
      data: formData,
      descricao: formDescricao.trim(),
      categoria: formCategoria || (formTipo === 'entrada' ? 'Outros Recebíveis' : 'Outras Despesas'),
      truckId: formTruckId || undefined,
      driverId: formDriverId || undefined,
      meioPagamento: formMeioPagamento
    };

    try {
      if (editingItem) {
        // PUT edit
        await fetch(`/api/cash_flow/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        // POST create
        await fetch('/api/cash_flow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      setIsModalOpen(false);
      resetForm();
      onUpdate();
    } catch (err) {
      console.error(err);
      alert("Ocorreu um erro ao gravar a transação.");
    }
  };

  // Delete handler
  const handleDelete = async (id: string, description: string) => {
    if (window.confirm(`Tem certeza que deseja excluir a transação: "${description}"?`)) {
      try {
        await fetch(`/api/cash_flow/${id}`, {
          method: 'DELETE'
        });
        onUpdate();
      } catch (err) {
        console.error(err);
        alert("Erro ao excluir transação do caixa.");
      }
    }
  };

  // --- Category Management Handlers ---
  const handleAddCategory = async (tipo: 'entrada' | 'saida', nome: string) => {
    if (!nome.trim()) return;
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, nome: nome.trim() })
      });
      if (!res.ok) {
        throw new Error("Erro ao adicionar");
      }
      setNewCatNome('');
      onUpdate();
    } catch (err) {
      console.error(err);
      alert("Erro ao adicionar categoria.");
    }
  };

  const handleEditCategory = async (tipo: 'entrada' | 'saida', oldNome: string, newNome: string) => {
    if (!newNome.trim() || oldNome === newNome) return;
    try {
      const res = await fetch('/api/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, oldNome, newNome: newNome.trim() })
      });
      if (!res.ok) {
        throw new Error("Erro ao editar");
      }
      setEditingCat(null);
      setEditingCatNewName('');
      onUpdate();
    } catch (err) {
      console.error(err);
      alert("Erro ao editar categoria.");
    }
  };

  const handleDeleteCategory = async (tipo: 'entrada' | 'saida', nome: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente a categoria "${nome}"? Ela deixará de aparecer nos relatórios e nos formulários de lançamento.`)) {
      return;
    }
    try {
      const res = await fetch('/api/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, nome })
      });
      if (!res.ok) {
        throw new Error("Erro ao excluir");
      }
      onUpdate();
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir categoria.");
    }
  };

  // --- Dynamic calculations on cash flow ---

  // 1. Calculations: Total General Ledger stats (Overall)
  const totalIn = useMemo(() => {
    return data.cash_flow
      .filter((f: any) => f.tipo === 'entrada')
      .reduce((acc: number, curr: any) => acc + curr.valor, 0);
  }, [data.cash_flow]);

  const totalOut = useMemo(() => {
    return data.cash_flow
      .filter((f: any) => f.tipo === 'saida')
      .reduce((acc: number, curr: any) => acc + curr.valor, 0);
  }, [data.cash_flow]);

  const ledgerBalance = totalIn - totalOut;
  const generalOperatingMargin = totalIn > 0 ? (ledgerBalance / totalIn) * 100 : 0;

  // 2. Compute category distributions for visual progress bars
  const categorySummary = useMemo(() => {
    const summary: { [key: string]: number } = {};
    // Seed standard ones
    categoriesSaida.forEach(c => { summary[c] = 0; });
    
    data.cash_flow
      .filter((f: any) => f.tipo === 'saida')
      .forEach((f: any) => {
        let cat = f.categoria || 'Outras Despesas';
        // Infer standard categorizing for synced logs
        if (!f.categoria) {
          if (f.descricao.includes('Abastecimento') || f.descricao.includes('Diesel')) {
            cat = "Diesel (Abastecimento)";
          } else if (f.descricao.includes('Pedágio')) {
            cat = "Pedágios";
          } else if (f.descricao.includes('Manutenção')) {
            cat = "Manutenção e Peças";
          } else if (f.descricao.includes('Motorista') || f.descricao.includes('Diária')) {
            cat = "Motorista (Diária/Comissão)";
          }
        }
        summary[cat] = (summary[cat] || 0) + f.valor;
      });
    return summary;
  }, [data.cash_flow]);

  const totalExpensesComputed = Object.values(categorySummary).reduce((a: number, b: number) => a + b, 0) as number;

  // Diesel Weigh factor tracker
  const dieselWeightPercent = totalExpensesComputed > 0 
    ? ((categorySummary["Diesel (Abastecimento)"] || 0) / totalExpensesComputed) * 100 
    : 0;

  // 3. Filtering logic
  const filteredCashFlow = useMemo(() => {
    return data.cash_flow.filter((item: any) => {
      // Search Box filter
      const descMatch = item.descricao?.toLowerCase().includes(searchQuery.toLowerCase());
      const catMatch = item.categoria?.toLowerCase().includes(searchQuery.toLowerCase());
      const truckMatch = item.truckId?.toLowerCase().includes(searchQuery.toLowerCase());
      const textMatch = descMatch || catMatch || truckMatch;

      // Type selector
      const tipoMatch = filterTipo === 'all' ? true : item.tipo === filterTipo;

      // Category selector
      let itemCategory = item.categoria;
      if (!itemCategory) {
        if (item.descricao.includes('Abastecimento')) itemCategory = "Diesel (Abastecimento)";
        else if (item.descricao.includes('Pedágio')) itemCategory = "Pedágios";
        else if (item.descricao.includes('Manutenção')) itemCategory = "Manutenção e Peças";
        else if (item.descricao.includes('Motorista')) itemCategory = "Motorista (Diária/Comissão)";
      }
      const categoryMatch = filterCategoria === 'all' ? true : itemCategory === filterCategoria;

      // Truck plate filter
      const truckIdFilterMatch = filterTruckId === 'all' ? true : item.truckId === filterTruckId;

      // Driver filter
      const driverIdFilterMatch = filterDriverId === 'all' ? true : item.driverId === filterDriverId;

      // Payment Method filter
      const meioPagamentoMatch = filterMeioPagamento === 'all' ? true : (item.meioPagamento || 'Pix') === filterMeioPagamento;

      // Date range filter
      let periodMatch = true;
      if (filterPeriodo !== 'all') {
        const itemDate = new Date(item.data);
        const today = new Date("2026-06-16"); // Simulated operational date
        
        if (filterPeriodo === 'today') {
          periodMatch = item.data === "2026-06-16";
        } else if (filterPeriodo === '7days') {
          const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          periodMatch = itemDate >= sevenDaysAgo && itemDate <= today;
        } else if (filterPeriodo === 'month') {
          // This month: 2026-06
          periodMatch = item.data.startsWith('2026-06');
        } else if (filterPeriodo === 'last_month') {
          // Last month: 2026-05
          periodMatch = item.data.startsWith('2026-05');
        }
      }

      return textMatch && tipoMatch && categoryMatch && truckIdFilterMatch && driverIdFilterMatch && meioPagamentoMatch && periodMatch;
    });
  }, [data.cash_flow, searchQuery, filterTipo, filterCategoria, filterTruckId, filterDriverId, filterPeriodo, filterMeioPagamento]);

  // Subset totals for filtered selection
  const filteredTotals = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    filteredCashFlow.forEach((f: any) => {
      if (f.tipo === 'entrada') entradas += f.valor;
      else if (f.tipo === 'saida') saidas += f.valor;
    });
    return { entradas, saidas, listBalance: entradas - saidas };
  }, [filteredCashFlow]);

  // WhatsApp report sharer action
  const handleCopyReport = () => {
    const todayStr = "16/06/2026";
    let text = `📋 *RELATÓRIO FINANCEIRO DE FROTA - GBFLEET*
📅 Gerado em: ${todayStr} - Filtrado: ${filterPeriodo === 'month' ? "Mês Atual" : filterPeriodo === '7days' ? "Últimos 7 dias" : "Todos os registros"}

💰 *RESUMO DO PERÍODO SELECIONADO*
🟢 Total Entradas: R$ ${filteredTotals.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
🔴 Total Saídas: R$ ${filteredTotals.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
📊 Saldo Operacional: R$ ${filteredTotals.listBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
-------------------------------------------
🚛 *DIVISÃO DO CAIXA POR VEÍCULO / CENTRO DE CUSTO*`;

    // Calculate aggregated costs by truck under this filter
    const truckExpMap: { [key: string]: number } = {};
    filteredCashFlow.forEach((item: any) => {
      if (item.tipo === 'saida' && item.truckId) {
        truckExpMap[item.truckId] = (truckExpMap[item.truckId] || 0) + item.valor;
      }
    });

    Object.keys(truckExpMap).forEach(plate => {
      text += `\n🚛 Placa ${plate}: R$ ${truckExpMap[plate].toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    });

    text += `\n\n📌 _Relatório condensado via Sistema Administrativo de Frotas_`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // CSV Mock download action
  const handleDownloadCsv = () => {
    setCsvNotice(true);
    setTimeout(() => setCsvNotice(false), 3000);

    const headers = ["ID", "Tipo", "Data", "Descricao", "Categoria", "Custo-Caminhao", "Valor"];
    const rows = filteredCashFlow.map((item: any) => [
      item.id,
      item.tipo === 'entrada' ? "Entrada" : "Saída",
      item.data,
      `"${item.descricao}"`,
      `"${item.categoria || 'Não Categorizado'}"`,
      item.truckId || "Corporativo/Geral",
      item.valor
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ledger_gbfleet_junho_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Title & Top Action tools */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Fluxo de Caixa & Custos Operacionais</h2>
          <p className="text-sm text-slate-500 font-medium">Contraste receitas de fretamento com os custos de combustível, pedágios, diárias de motoristas e revisões mecânicas.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button 
            type="button"
            onClick={() => {
              setIsCategoryModalOpen(true);
            }}
            className="border border-slate-300 hover:border-slate-400 bg-white text-slate-700 px-5 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer"
          >
            <Tag size={18} className="text-slate-500" />
            <span>Gerenciar Categorias</span>
          </button>
          <button 
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-md shadow-blue-100 transition-all cursor-pointer"
          >
            <Plus size={18} />
            <span>Lançar no Caixa</span>
          </button>
        </div>
      </div>

      {/* Primary General Balance indicators */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Total Inflow card */}
        <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Total Faturamento</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <ArrowUpRight size={20} />
            </div>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-black text-emerald-600 font-mono">
              R$ {totalIn.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h4>
            <p className="text-[10px] text-slate-400 mt-1">Fretes finalizados e entradas</p>
          </div>
        </div>

        {/* Total Outflow Card */}
        <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Total Desembolsos</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <ArrowDownLeft size={20} />
            </div>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-black text-rose-600 font-mono">
              R$ {totalOut.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h4>
            <p className="text-[10px] text-slate-400 mt-1">Abastecimento, pedágios, diárias</p>
          </div>
        </div>

        {/* Real liquid available */}
        <div className="bg-slate-900 p-6 rounded-[28px] shadow-lg shadow-slate-200 flex flex-col justify-between text-white md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Saldo Disponível</span>
            <div className="p-2 bg-slate-800 text-blue-400 rounded-xl">
              <Wallet size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h4 className={cn("text-2xl font-black font-mono", ledgerBalance >= 0 ? "text-white" : "text-rose-400")}>
              R$ {ledgerBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h4>
            <div className="flex items-center justify-between mt-1 text-[10px]">
              <span className="text-slate-400">Operações sob controle</span>
              <span className="text-emerald-500 font-bold">&#9679; Ativo</span>
            </div>
          </div>
        </div>

        {/* Margin Gauge and health warning */}
        <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Margem Líquida Fleet</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Percent size={18} />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-1">
              <h4 className="text-2xl font-black font-mono text-slate-800">{generalOperatingMargin.toFixed(1)}%</h4>
              <span className="text-xs font-bold text-slate-400">Real</span>
            </div>
            
            {/* Margem indicator label */}
            <div className="mt-1 flex items-center gap-1">
              {generalOperatingMargin >= 20 ? (
                <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md font-bold">Excelente Rendimento</span>
              ) : generalOperatingMargin >= 10 ? (
                <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md font-bold">Operação Justa</span>
              ) : (
                <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md font-bold">Atenção Extrema</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Advisory block for diesel and expenditures balance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cost Centers Bento Grid (Spent categories) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200">
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Distribuição por Categoria de Despesa (DRE)</h3>
              <p className="text-xs text-slate-400 mt-0.5">Analise onde a empresa está mais investindo capital da frotagem.</p>
            </div>
            <span className="text-xs bg-slate-100 font-mono font-bold text-slate-600 px-2 py-1 rounded-lg">
              R$ {totalExpensesComputed.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-xs">
            {Object.keys(categorySummary).map(catName => {
              const value = categorySummary[catName];
              const pctOfAll = totalExpensesComputed > 0 ? (value / totalExpensesComputed) * 100 : 0;
              return (
                <div key={catName} className="space-y-1 border-b border-slate-50 pb-2">
                  <div className="flex justify-between items-center text-slate-600 font-semibold">
                    <span className="truncate max-w-[200px]">{catName}</span>
                    <span className="font-bold text-slate-800 font-mono">R$ {value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                    <div 
                      className={cn(
                        "h-full rounded-full",
                        catName.includes('Diesel') ? "bg-blue-600" :
                        catName.includes('Manutenção') ? "bg-amber-500" :
                        catName.includes('Pedágios') ? "bg-yellow-500" : 
                        catName.includes('Motorista') ? "bg-emerald-500" : "bg-slate-400"
                      )} 
                      style={{ width: `${pctOfAll}%` }} 
                    />
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold">
                    <span>{pctOfAll.toFixed(1)}% das despesas</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Diesel Gauge and Advisory card */}
        <div className="bg-gradient-to-br from-indigo-50/70 to-blue-50/70 border border-blue-100 p-6 rounded-3xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-indigo-700 tracking-wider flex items-center gap-1">
                <AlertTriangle size={15} className="text-indigo-600" />
                Alerta de Consumo de Diesel
              </span>
              <span className="text-[10px] font-mono font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                Meta &lt; 40%
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                No setor rodoviário de transporte pesado, o óleo diesel costuma representar a maior fatia de custos. Monitoramos esse peso para você dinamicamente:
              </p>
              
              <div className="flex items-baseline gap-1 mt-3">
                <span className="text-4xl font-extrabold text-indigo-900 font-mono">{dieselWeightPercent.toFixed(1)}%</span>
                <span className="text-xs text-slate-500 font-bold">do gasto total</span>
              </div>

              {/* Progress bar of Diesel factor */}
              <div className="w-full bg-slate-200/60 h-3 rounded-full overflow-hidden mt-2">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    dieselWeightPercent > 45 ? "bg-rose-500" : "bg-indigo-600"
                  )}
                  style={{ width: `${Math.max(2, Math.min(100, dieselWeightPercent))}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200/40 text-[11px] leading-snug">
            {dieselWeightPercent > 45 ? (
              <p className="text-rose-600 font-black flex items-center gap-1 bg-white/60 p-2.5 rounded-xl border border-rose-100">
                🚨 Consumo Acima do Recomendado! Sugerimos revisar rotas, trechos de viagem e calibragem dos pneus nos caminhões.
              </p>
            ) : dieselWeightPercent > 30 ? (
              <p className="text-emerald-700 font-bold flex items-center gap-1 bg-white/60 p-2.5 rounded-xl border border-emerald-100">
                ✅ Gasto de combustível saudável e dentro da margem padrão de segurança.
              </p>
            ) : (
              <p className="text-indigo-700 font-bold flex items-center gap-1 bg-white/60 p-2.5 rounded-xl border border-indigo-100">
                ℹ️ Amostragem baixa de abastecimento registrada para o cálculo ponderado hoje.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Filters Drawer bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-blue-600" />
            <h4 className="font-bold text-slate-800 text-sm">Filtros Inteligentes de Pesquisa</h4>
          </div>
          {/* Quick Clear filters */}
          <button 
            onClick={() => {
              setSearchQuery('');
              setFilterTipo('all');
              setFilterCategoria('all');
              setFilterTruckId('all');
              setFilterDriverId('all');
              setFilterPeriodo('all');
              setFilterMeioPagamento('all');
            }}
            className="text-xs text-blue-600 font-bold hover:underline"
          >
            Limpar todos os filtros
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
          {/* Search Term */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Buscar por termo</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Ex. pedágio, placa..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              />
            </div>
          </div>

          {/* Type filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Tipo Fluxo</label>
            <select
              value={filterTipo}
              onChange={e => setFilterTipo(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-bold focus:outline-none"
            >
              <option value="all">Todos os Tipos</option>
              <option value="entrada">🟢 Entradas (Receitas)</option>
              <option value="saida">🔴 Saídas (Despesas)</option>
            </select>
          </div>

          {/* Period/Time filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Período de Viagem</label>
            <select
              value={filterPeriodo}
              onChange={e => setFilterPeriodo(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-bold focus:outline-none"
            >
              <option value="all">Qualquer Período</option>
              <option value="today">Hoje (16/06)</option>
              <option value="7days">Últimos 7 dias</option>
              <option value="month">Este Mês (Junho)</option>
              <option value="last_month">Mês Passado (Maio)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Categoria (Centro de Custo)</label>
            <select
              value={filterCategoria}
              onChange={e => setFilterCategoria(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-bold focus:outline-none"
            >
              <option value="all">Todas Categorias</option>
              <optgroup label="Entradas">
                {categoriesEntrada.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="Saídas/Custos">
                {categoriesSaida.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            </select>
          </div>

          {/* Filter by Truck Placa */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Centro por Caminhão</label>
            <select
              value={filterTruckId}
              onChange={e => setFilterTruckId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-bold focus:outline-none"
            >
              <option value="all">Todos Caminhões</option>
              {(data.trucks || []).map((t: any) => (
                <option key={t.id} value={t.placa}>{t.placa} ({t.modelo})</option>
              ))}
            </select>
          </div>

          {/* Filter by Driver */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Por Motorista</label>
            <select
              value={filterDriverId}
              onChange={e => setFilterDriverId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-bold focus:outline-none"
            >
              <option value="all">Todos Motoristas</option>
              {(data.drivers || []).map((d: any) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>

          {/* Filter by Payment Method */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Meio Pagamento</label>
            <select
              value={filterMeioPagamento}
              onChange={e => setFilterMeioPagamento(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-bold focus:outline-none"
            >
              <option value="all">Todos Meios</option>
              <option value="Pix">Pix</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Boleto">Boleto</option>
              <option value="Cartão de Débito">Cartão de Débito</option>
              <option value="Cartão de Crédito">Cartão de Crédito</option>
              <option value="Transferência (TED/DOC)">Transferência (TED/DOC)</option>
              <option value="Cartão de Frota">Cartão de Frota</option>
            </select>
          </div>
        </div>
      </div>

      {/* Subset filtered summary results banner */}
      <div className="bg-slate-50 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs border border-slate-200/60 font-sans">
        <div className="flex flex-wrap items-center gap-4 text-slate-600">
          <span>📋 Registros filtrados: <strong className="text-slate-800">{filteredCashFlow.length} transações</strong></span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span>Entradas: <strong className="text-emerald-600">R$ {filteredTotals.entradas.toLocaleString()}</strong></span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span>Saídas: <strong className="text-rose-600">R$ {filteredTotals.saidas.toLocaleString()}</strong></span>
        </div>

        <div className="flex gap-2">
          {/* Action buttons on selection */}
          <button
            onClick={handleCopyReport}
            className="px-3 py-1.5 border border-slate-200 bg-white text-slate-700 hover:border-slate-300 rounded-xl font-bold flex items-center gap-1.5 select-none transition-all text-[11px]"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-500" />
                <span className="text-emerald-600">Copiado p/ WhatsApp</span>
              </>
            ) : (
              <>
                <FileText size={14} />
                <span>Copiar p/ WhatsApp</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownloadCsv}
            className="px-3 py-1.5 border border-slate-200 bg-white text-slate-700 hover:border-slate-300 rounded-xl font-bold flex items-center gap-1.5 select-none transition-all text-[11px]"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span>Baixar Planilha</span>
          </button>
        </div>
      </div>

      {/* Main Table Ledger layout */}
      <div className="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/20">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-slate-800 text-sm">Histórico Detalhado do Caixa</h3>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">Livro Diário</span>
          </div>
          <button 
            onClick={() => onUpdate()} 
            className="p-1 px-2 border border-slate-100 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition-all font-bold text-xs flex items-center gap-1"
          >
            <RefreshCw size={12} />
            <span>Sincronizar</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto">
            <thead>
              <tr className="bg-slate-50/40 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Centro Custo / Categoria</th>
                <th className="px-6 py-4">Descrição do Lançamento</th>
                <th className="px-6 py-4">Atribuído a</th>
                <th className="px-6 py-4 text-right">Valor Líquido</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 text-xs">
              {filteredCashFlow.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-400 italic font-sans">
                    Nenhum lançamento corresponde aos filtros estipulados acima.
                  </td>
                </tr>
              ) : (
                [...filteredCashFlow].reverse().map((item: any) => {
                  // Inferred driver if object id found
                  const associatedDrvObj = data.drivers?.find((d: any) => d.id === item.driverId);
                  
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/40 transition-colors">
                      {/* Date */}
                      <td className="px-6 py-4 font-mono font-bold text-slate-500 whitespace-nowrap">
                        {new Date(item.data + "T00:00:00").toLocaleDateString('pt-BR')}
                      </td>

                      {/* Category Badge */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-extrabold max-w-max",
                            item.tipo === 'entrada' ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                          )}>
                            {item.categoria || (item.tipo === 'entrada' ? "Receitas Gerais" : "Outras Custas")}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded max-w-max">
                            💳 {item.meioPagamento || 'Pix'}
                          </span>
                        </div>
                      </td>

                      {/* Description input */}
                      <td className="px-6 py-4 max-w-md">
                        <p className="font-extrabold text-slate-800 line-clamp-1">{item.descricao}</p>
                        
                        {/* Auto-sync watermark */}
                        {item.id.includes('sync') && (
                          <span className="text-[9px] text-indigo-500 bg-indigo-50 px-1 py-0.2 rounded font-bold">Auto-Sincronizado</span>
                        )}
                        {item.id.includes('maint') && (
                          <span className="text-[9px] text-amber-600 bg-amber-50 px-1 py-0.2 rounded font-bold">Alerta Sincronizado</span>
                        )}
                      </td>

                      {/* Associated asset truck/driver */}
                      <td className="px-6 py-4">
                        <div className="space-y-1 text-[11px]">
                          {item.truckId && (
                            <span className="flex items-center gap-1 text-slate-700 font-mono font-bold bg-slate-100 border border-slate-200.60 px-1.5 py-0.5 rounded max-w-max">
                              <Truck size={10} className="text-slate-500" />
                              {item.truckId}
                            </span>
                          )}
                          {associatedDrvObj && (
                            <span className="flex items-center gap-1 text-slate-500 font-sans font-medium">
                              <User size={10} className="text-slate-400" />
                              {associatedDrvObj.nome}
                            </span>
                          )}
                          {!item.truckId && !associatedDrvObj && (
                            <span className="text-slate-400 italic">Despesa Geral da Empresa</span>
                          )}
                        </div>
                      </td>

                      {/* Value with colored markers */}
                      <td className={cn(
                        "px-6 py-4 text-right font-mono font-black font-sans whitespace-nowrap",
                        item.tipo === 'entrada' ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {item.tipo === 'entrada' ? '+' : '-'} R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Edit Delete Operations */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-1.5">
                          <button
                            onClick={() => handleStartEdit(item)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            title="Editar"
                          >
                            <Edit size={14} />
                          </button>
                          
                          {/* Disable deleting system synced records directly to prevent inconsistencies, unless confirmed */}
                          <button
                            onClick={() => handleDelete(item.id, item.descricao)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="Excluir"
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

      {/* Excel simulate notice toast */}
      {csvNotice && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white p-4 rounded-2xl flex items-center gap-3 animate-fade-in shadow-2xl z-50 text-xs font-bold font-sans">
          <FileSpreadsheet className="text-emerald-500" size={18} />
          <span>Planilha Excel gerada e transmitida com sucesso para o seu navegador!</span>
        </div>
      )}

      {/* Add / Edit Transaction Sliding Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? "Editar Operação de Lançamento" : "Novo Lançamento Financeiro"}
        size="large"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Inflow vs Outflow toggle select */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase text-slate-400">Tipo de Fluxo Financeiro</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setFormTipo('entrada');
                  setFormCategoria(categoriesEntrada[0] || '');
                }}
                className={cn(
                  "py-3 rounded-2xl font-bold flex items-center justify-center gap-2 border transition-all text-xs cursor-pointer",
                  formTipo === 'entrada' 
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm" 
                    : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                )}
              >
                <ArrowUpCircle size={18} />
                <span>🟢 Receita / Entrada</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormTipo('saida');
                  setFormCategoria(categoriesSaida[0] || '');
                }}
                className={cn(
                  "py-3 rounded-2xl font-bold flex items-center justify-center gap-2 border transition-all text-xs cursor-pointer",
                  formTipo === 'saida' 
                    ? "bg-rose-50 border-rose-300 text-rose-800 shadow-sm" 
                    : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                )}
              >
                <ArrowDownCircle size={18} />
                <span>🔴 Custo / Despesa / Saída</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Amount */}
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-400 mb-2">Valor da Operação *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                <input 
                  type="text" 
                  required
                  value={formValor ? maskBRL(formValor) : ""}
                  onChange={e => {
                    const masked = maskBRL(e.target.value);
                    setFormValor(masked ? String(unmaskBRL(masked)) : "");
                  }}
                  placeholder="R$ 0,00"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-400 mb-2">Data do Lançamento *</label>
              <input 
                type="date" 
                required
                value={formData}
                onChange={e => setFormData(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              />
            </div>

            {/* Category selection */}
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-400 mb-2">Categoria (Centro de Custo)</label>
              <select
                value={formCategoria}
                onChange={e => setFormCategoria(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              >
                <option value="">Selecione a categoria...</option>
                {formTipo === 'entrada' 
                  ? categoriesEntrada.map(c => <option key={c} value={c}>{c}</option>) 
                  : categoriesSaida.map(c => <option key={c} value={c}>{c}</option>)
                }
              </select>
            </div>

            {/* Meio de Pagamento selection */}
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-400 mb-2">Meio de Pagamento *</label>
              <select
                value={formMeioPagamento}
                onChange={e => setFormMeioPagamento(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              >
                <option value="Pix">Pix</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Boleto">Boleto</option>
                <option value="Cartão de Débito">Cartão de Débito</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Transferência (TED/DOC)">Transferência (TED/DOC)</option>
                <option value="Cartão de Frota">Cartão de Frota</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-black uppercase text-slate-400 mb-2">Descrição da Transação *</label>
            <input 
              type="text" 
              required
              value={formDescricao}
              onChange={e => setFormDescricao(e.target.value)}
              placeholder="Ex: Pagamento estadia pedágio motorista Cleiton..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150 text-xs space-y-4">
            <h5 className="font-black text-slate-600 uppercase text-[10px]">Atribuição Opcional (Cost Centers / Círculo Operacional)</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Associate with Truck Placa */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                  <Truck size={12} className="text-slate-400" /> Associar a Caminhão da Frota
                </label>
                <select
                  value={formTruckId}
                  onChange={e => setFormTruckId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
                >
                  <option value="">Nenhum caminhão (Gasto Corporativo)</option>
                  {(data.trucks || []).map((t: any) => (
                    <option key={t.id} value={t.placa}>{t.placa} ({t.modelo})</option>
                  ))}
                </select>
              </div>

              {/* Associate with Driver */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                  <User size={12} className="text-slate-400" /> Associar a Motorista
                </label>
                <select
                  value={formDriverId}
                  onChange={e => setFormDriverId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
                >
                  <option value="">Nenhum motorista (Gasto de Apoio)</option>
                  {(data.drivers || []).map((d: any) => (
                    <option key={d.id} value={d.id}>{d.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-2.5 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 font-bold text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-100"
            >
              {editingItem ? "Salvar Lançamento" : "Efetuar Lançamento"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Gerenciar Categorias */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title="Gerenciar Categorias (Centro de Custo)"
        size="large"
      >
        <div className="p-6 space-y-6">
          <p className="text-xs text-slate-500 font-medium">
            Adicione, edite ou exclua categorias de receitas e despesas. As alterações se aplicam retroativamente e refletem em todos os dashboards e abas do sistema em tempo real.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {/* Seção Categorias de Entrada */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
                <h4 className="font-bold text-slate-800 text-sm">Categorias de Entradas (Receitas)</h4>
              </div>

              {/* Form de Adicionar */}
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Nova categoria de entrada..."
                  value={newCatTipo === 'entrada' ? newCatNome : ''}
                  onChange={(e) => {
                    setNewCatTipo('entrada');
                    setNewCatNome(e.target.value);
                  }}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
                <button
                  type="button"
                  onClick={() => handleAddCategory('entrada', newCatNome)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                >
                  Adicionar
                </button>
              </div>

              {/* Lista */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {categoriesEntrada.map((cat: string) => (
                  <div key={cat} className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                    {editingCat?.tipo === 'entrada' && editingCat?.name === cat ? (
                      <div className="flex gap-1.5 w-full">
                        <input
                          type="text"
                          value={editingCatNewName}
                          onChange={(e) => setEditingCatNewName(e.target.value)}
                          className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleEditCategory('entrada', cat, editingCatNewName)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-lg text-[10px] font-bold"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCat(null)}
                          className="bg-slate-300 text-slate-700 px-2 py-1 rounded-lg text-[10px] font-bold"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-slate-700">{cat}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCat({ tipo: 'entrada', name: cat });
                              setEditingCatNewName(cat);
                            }}
                            className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700"
                            title="Editar"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory('entrada', cat)}
                            className="p-1 hover:bg-slate-200 rounded text-rose-500 hover:text-rose-700"
                            title="Excluir"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Seção Categorias de Saída */}
            <div className="space-y-4 md:pl-6 pt-4 md:pt-0">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <span className="w-2.5 h-2.5 bg-rose-500 rounded-full"></span>
                <h4 className="font-bold text-slate-800 text-sm">Categorias de Saídas (Custos/Despesas)</h4>
              </div>

              {/* Form de Adicionar */}
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Nova categoria de despesa..."
                  value={newCatTipo === 'saida' ? newCatNome : ''}
                  onChange={(e) => {
                    setNewCatTipo('saida');
                    setNewCatNome(e.target.value);
                  }}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
                <button
                  type="button"
                  onClick={() => handleAddCategory('saida', newCatNome)}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                >
                  Adicionar
                </button>
              </div>

              {/* Lista */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {categoriesSaida.map((cat: string) => (
                  <div key={cat} className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                    {editingCat?.tipo === 'saida' && editingCat?.name === cat ? (
                      <div className="flex gap-1.5 w-full">
                        <input
                          type="text"
                          value={editingCatNewName}
                          onChange={(e) => setEditingCatNewName(e.target.value)}
                          className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleEditCategory('saida', cat, editingCatNewName)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-lg text-[10px] font-bold"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCat(null)}
                          className="bg-slate-300 text-slate-705 px-2 py-1 rounded-lg text-[10px] font-bold"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-slate-700">{cat}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCat({ tipo: 'saida', name: cat });
                              setEditingCatNewName(cat);
                            }}
                            className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700"
                            title="Editar"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory('saida', cat)}
                            className="p-1 hover:bg-slate-200 rounded text-rose-500 hover:text-rose-700"
                            title="Excluir"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(false)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-100 cursor-pointer"
            >
              Concluído
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
