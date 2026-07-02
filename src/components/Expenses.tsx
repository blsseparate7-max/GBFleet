import React, { useState, useMemo } from 'react';
import { 
  Receipt, 
  Tag, 
  Calendar, 
  DollarSign, 
  Plus, 
  Camera, 
  LayoutGrid, 
  BarChart3, 
  Trash2, 
  Truck, 
  TrendingUp, 
  TrendingDown, 
  PieChart, 
  Filter, 
  ChevronRight, 
  RefreshCw,
  Clock,
  AlertCircle,
  FileText,
  CheckCircle,
  Building,
  Edit,
  Eye
} from 'lucide-react';
import Modal from './ui/Modal';
import { cn, maskBRL, unmaskBRL } from '../lib/utils';
import { compressAndSetFile, AttachmentPreview } from '../lib/fileCompressor';

export default function Expenses({ data, onUpdate }: { data: any, onUpdate: () => void }) {
  const categoriesSaida = data.categories_saida || [
    "Pedágios",
    "Manutenção e Peças",
    "Motorista (Diária/Comissão)",
    "Pneus",
    "Seguros & Rastreamento",
    "Administrativo & Escritório",
    "Impostos/Licenciamento",
    "Outras Despesas"
  ];

  const isMaintenanceByTipo = (tipo: string) => {
    const t = (tipo || "").toLowerCase();
    return t.includes("manut") || t.includes("peça") || t.includes("oficina") || t.includes("mecan");
  };
  const isPedagioByTipo = (tipo: string) => {
    const t = (tipo || "").toLowerCase();
    return t.includes("pedág") || t.includes("pedag");
  };
  const isMultaByTipo = (tipo: string) => {
    const t = (tipo || "").toLowerCase();
    return t.includes("multa");
  };
  const isSeguroByTipo = (tipo: string) => {
    const t = (tipo || "").toLowerCase();
    return t.includes("segur") || t.includes("rastre");
  };
  const isArlaByTipo = (tipo: string) => {
    const t = (tipo || "").toLowerCase();
    return t.includes("arla");
  };
  const isCombustivelByTipo = (tipo: string) => {
    const t = (tipo || "").toLowerCase();
    if (t.includes("arla")) return false;
    return t.includes("diesel") || t.includes("combust") || t.includes("gasol") || t.includes("abastec");
  };
  const isMotoristaByTipo = (tipo: string) => {
    const t = (tipo || "").toLowerCase();
    return t.includes("motorista") || t.includes("diária") || t.includes("diaria") || t.includes("comissão") || t.includes("comissao");
  };

  const [activeSubTab, setActiveSubTab] = useState<'dre' | 'manual' | 'bills' | 'categorias' | 'charts' | 'empresas'>('dre');

  // New Category states
  const [newCatName, setNewCatName] = useState('');
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [editingCatValue, setEditingCatValue] = useState('');

  // Bills states
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isPayingBillModalOpen, setIsPayingBillModalOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<any | null>(null);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSavingBill, setIsSavingBill] = useState(false);
  const [billFilterStatus, setBillFilterStatus] = useState<'Todos' | 'Pendente' | 'Pago'>('Todos');
  const [newBill, setNewBill] = useState({
    descricao: '',
    truckId: '',
    categoria: '',
    valorTotal: '',
    valorParcela: '',
    recorrencia: 'unico',
    parcelas: '1',
    vencimento: new Date().toISOString().split('T')[0],
    observacao: ''
  });
  
  // Filtering DRE & Custos
  const [filterMonth, setFilterMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // format: 'YYYY-MM'
  const [filterPlaca, setFilterPlaca] = useState<string>('all');

  // Manual expense form modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newExpense, setNewExpense] = useState({
    truckId: '',
    tipo: '',
    data: new Date().toISOString().split('T')[0],
    valor: '',
    km: '',
    obs: '',
    comprovante: '',
    empresaDespesa: '',
    expenseCompanyId: ''
  });

  // Selected expense for detailing and edit modal
  const [selectedExpenseDetail, setSelectedExpenseDetail] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditingExpense, setIsEditingExpense] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editExpenseForm, setEditExpenseForm] = useState({
    truckId: '',
    tipo: '',
    data: '',
    valor: '',
    km: '',
    obs: '',
    comprovante: '',
    empresaDespesa: '',
    expenseCompanyId: ''
  });

  // Registered Companies states
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
  const [companyForm, setCompanyForm] = useState({
    nome: '',
    cnpj: '',
    cidade: '',
    uf: ''
  });
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  const openNewCompany = () => {
    setSelectedCompany(null);
    setCompanyForm({ nome: '', cnpj: '', cidade: '', uf: '' });
    setIsCompanyModalOpen(true);
  };

  const openEditCompany = (comp: any) => {
    setSelectedCompany(comp);
    setCompanyForm({
      nome: comp.nome || '',
      cnpj: comp.cnpj || '',
      cidade: comp.cidade || '',
      uf: comp.uf || ''
    });
    setIsCompanyModalOpen(true);
  };

  const handleDeleteCompany = async (id: string) => {
    if (!confirm("Tem certeza de que deseja remover esta empresa de despesa?")) return;
    try {
      await fetch(`/api/expense_companies/${id}`, { method: 'DELETE' });
      onUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveCompany = async () => {
    if (!companyForm.nome) return;
    setIsSavingCompany(true);
    try {
      const url = selectedCompany 
        ? `/api/expense_companies/${selectedCompany.id}` 
        : '/api/expense_companies';
      const method = selectedCompany ? 'PUT' : 'POST';
      
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companyForm)
      });
      setIsCompanyModalOpen(false);
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingCompany(false);
    }
  };

  // Delete manual expense handler
  const handleDeleteExpense = async (id: string) => {
    try {
      await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      setDeleteConfirmId(null);
      onUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    if (!newExpense.truckId) {
      alert("Por favor, selecione um veículo (Caminhão).");
      return;
    }
    if (!newExpense.tipo) {
      alert("Por favor, selecione o tipo de despesa.");
      return;
    }
    if (!newExpense.valor || isNaN(Number(newExpense.valor)) || Number(newExpense.valor) <= 0) {
      alert("Por favor, insira um valor numérico válido maior que zero.");
      return;
    }
    if (isSaving) return;

    try {
      setIsSaving(true);
      const companyId = data?.company?.id || 'comp_1';
      const userId = data?.currentUser?.id || 'user_1';

      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newExpense,
          companyId,
          valor: Number(newExpense.valor),
          km: newExpense.km ? Number(newExpense.km) : undefined,
          comprovante: newExpense.comprovante
        })
      });

      // Notify chat
      await fetch('/api/chat_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          userId,
          mensagem: `Registro manual de despesa: ${newExpense.tipo} no ${newExpense.truckId}`,
          resposta: `Despesa de ${newExpense.tipo} (R$ ${Number(newExpense.valor).toLocaleString('pt-BR')}) lançada com sucesso para o veículo ${newExpense.truckId}.`,
          acaoGerada: 'REGISTER_EXPENSE'
        })
      });

      setIsModalOpen(false);
      setNewExpense({ truckId: '', tipo: '', data: new Date().toISOString().split('T')[0], valor: '', km: '', obs: '', comprovante: '', empresaDespesa: '', expenseCompanyId: '' });
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const openExpenseDetail = (exp: any) => {
    setSelectedExpenseDetail(exp);
    setIsDetailModalOpen(true);
    setIsEditingExpense(false);
    setEditExpenseForm({
      truckId: exp.truckId || '',
      tipo: exp.tipo || '',
      data: exp.data || '',
      valor: String(exp.valor || ''),
      km: exp.km ? String(exp.km) : '',
      obs: exp.obs || '',
      comprovante: exp.comprovante || '',
      empresaDespesa: exp.empresaDespesa || '',
      expenseCompanyId: exp.expenseCompanyId || ''
    });
  };

  const handleUpdateExpense = async () => {
    if (!selectedExpenseDetail) return;
    if (!editExpenseForm.truckId) {
      alert("Por favor, selecione um veículo (Caminhão).");
      return;
    }
    if (!editExpenseForm.tipo) {
      alert("Por favor, selecione o tipo de despesa.");
      return;
    }
    if (!editExpenseForm.valor || isNaN(Number(editExpenseForm.valor)) || Number(editExpenseForm.valor) <= 0) {
      alert("Por favor, insira um valor numérico válido maior que zero.");
      return;
    }

    try {
      const response = await fetch(`/api/expenses/${selectedExpenseDetail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editExpenseForm,
          valor: Number(editExpenseForm.valor),
          km: editExpenseForm.km ? Number(editExpenseForm.km) : undefined,
        })
      });

      if (response.ok) {
        setIsDetailModalOpen(false);
        setSelectedExpenseDetail(null);
        onUpdate();
      } else {
        alert("Erro ao atualizar despesa.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão ao atualizar despesa.");
    }
  };

  // Categories Handlers
  const handleAddCategory = async (nome: string) => {
    if (!nome.trim()) return;
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'saida', nome: nome.trim() })
      });
      if (!res.ok) throw new Error();
      onUpdate();
    } catch (err) {
      console.error(err);
      alert("Erro ao adicionar categoria.");
    }
  };

  const handleEditCategory = async (oldNome: string, newNome: string) => {
    if (!newNome.trim() || oldNome === newNome) return;
    try {
      const res = await fetch('/api/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'saida', oldNome, newNome: newNome.trim() })
      });
      if (!res.ok) throw new Error();
      onUpdate();
    } catch (err) {
      console.error(err);
      alert("Erro ao editar categoria.");
    }
  };

  const handleDeleteCategory = async (nome: string) => {
    if (!window.confirm(`Deseja realmente excluir a categoria "${nome}"?`)) return;
    try {
      const res = await fetch('/api/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'saida', nome })
      });
      if (!res.ok) throw new Error();
      onUpdate();
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir categoria.");
    }
  };

  // Bills Handlers
  const handleAddBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBill.descricao.trim()) return alert("A descrição é obrigatória.");
    if (!newBill.categoria) return alert("A categoria é obrigatória.");
    if (!newBill.valorTotal && newBill.recorrencia === 'unico') return alert("O valor total é obrigatório.");
    if (!newBill.valorParcela && newBill.recorrencia !== 'unico') return alert("O valor da parcela é obrigatório.");

    setIsSavingBill(true);
    try {
      const valorTotalNum = newBill.recorrencia === 'unico' 
        ? unmaskBRL(newBill.valorTotal) 
        : unmaskBRL(newBill.valorParcela) * Number(newBill.parcelas);

      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: newBill.descricao.trim(),
          truckId: newBill.truckId,
          categoria: newBill.categoria,
          valorTotal: valorTotalNum,
          valorParcela: newBill.recorrencia === 'unico' ? valorTotalNum : unmaskBRL(newBill.valorParcela),
          recorrencia: newBill.recorrencia,
          parcelas: Number(newBill.parcelas) || 1,
          vencimento: newBill.vencimento,
          observacao: newBill.observacao.trim()
        })
      });

      if (!res.ok) throw new Error();
      
      onUpdate();
      setIsBillModalOpen(false);
      // Reset form
      setNewBill({
        descricao: '',
        truckId: '',
        categoria: '',
        valorTotal: '',
        valorParcela: '',
        recorrencia: 'unico',
        parcelas: '1',
        vencimento: new Date().toISOString().split('T')[0],
        observacao: ''
      });
    } catch (err) {
      console.error(err);
      alert("Erro ao cadastrar conta a pagar.");
    } finally {
      setIsSavingBill(false);
    }
  };

  const handlePayBillClick = (bill: any) => {
    setSelectedBillForPayment(bill);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setIsPayingBillModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedBillForPayment) return;
    setIsSavingBill(true);
    try {
      const res = await fetch(`/api/bills/${selectedBillForPayment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Pago',
          pagamentoData: paymentDate
        })
      });
      if (!res.ok) throw new Error();
      onUpdate();
      setIsPayingBillModalOpen(false);
      setSelectedBillForPayment(null);
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar pagamento.");
    } finally {
      setIsSavingBill(false);
    }
  };

  const handleRevertPayment = async (billId: string) => {
    if (!window.confirm("Deseja realmente reverter este pagamento? Os lançamentos de despesa e de caixa correspondentes serão excluídos.")) return;
    try {
      const res = await fetch(`/api/bills/${billId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Pendente'
        })
      });
      if (!res.ok) throw new Error();
      onUpdate();
    } catch (err) {
      console.error(err);
      alert("Erro ao reverter pagamento.");
    }
  };

  const handleDeleteBill = async (billId: string) => {
    if (!window.confirm("Deseja realmente excluir esta conta a pagar? Os lançamentos de despesa e fluxo de caixa associados também serão excluídos.")) return;
    try {
      const res = await fetch(`/api/bills/${billId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error();
      onUpdate();
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir conta a pagar.");
    }
  };

  const filteredBills = useMemo(() => {
    return (data?.bills || []).filter((b: any) => {
      const matchMonth = filterMonth === 'all' ? true : (b.vencimento && b.vencimento.startsWith(filterMonth));
      const matchPlaca = filterPlaca === 'all' ? true : b.truckId === filterPlaca;
      const matchStatus = billFilterStatus === 'Todos' ? true : b.status === billFilterStatus;
      return matchMonth && matchPlaca && matchStatus;
    });
  }, [data?.bills, filterMonth, filterPlaca, billFilterStatus]);

  // Extract unique months from all available financial actions
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(new Date().toISOString().substring(0, 7));
    
    // Add from freights
    (data?.freights || []).forEach((f: any) => {
      if (f.data && f.data.length >= 7) {
        months.add(f.data.substring(0, 7));
      }
    });

    // Add from cashflow
    (data?.cash_flow || []).forEach((c: any) => {
      if (c.data && c.data.length >= 7) {
        months.add(c.data.substring(0, 7));
      }
    });

    // Add from manual expenses
    (data?.expenses || []).forEach((e: any) => {
      if (e.data && e.data.length >= 7) {
        months.add(e.data.substring(0, 7));
      }
    });

    return Array.from(months).sort().reverse();
  }, [data]);

  // Calculations for the dynamic structured DRE P&L
  const dreReport = useMemo(() => {
    if (!data) return null;

    // Filter lists based on the selected month & truck plate filters
    const freightsFiltered = (data.freights || []).filter((f: any) => {
      const matchMonth = filterMonth === 'all' ? true : (f.data && f.data.startsWith(filterMonth));
      const matchPlaca = filterPlaca === 'all' ? true : f.truckId === filterPlaca;
      return matchMonth && matchPlaca;
    });

    const manualExpensesFiltered = (data.expenses || []).filter((e: any) => {
      const matchMonth = filterMonth === 'all' ? true : (e.data && e.data.startsWith(filterMonth));
      const matchPlaca = filterPlaca === 'all' ? true : e.truckId === filterPlaca;
      const isAuto = e.documento === "Auto-Abastecimento" || e.documento?.startsWith("Auto-Manutenção") || !!e.fuelLogId || !!e.billId;
      return matchMonth && matchPlaca && !isAuto;
    });

    const cashFlowFiltered = (data.cash_flow || []).filter((c: any) => {
      const matchMonth = filterMonth === 'all' ? true : (c.data && c.data.startsWith(filterMonth));
      const matchPlaca = filterPlaca === 'all' ? true : c.truckId === filterPlaca;
      return matchMonth && matchPlaca;
    });

    const fuelLogsFiltered = (data.fuel_logs || []).filter((l: any) => {
      const matchMonth = filterMonth === 'all' ? true : (l.data && l.data.startsWith(filterMonth));
      const matchPlaca = filterPlaca === 'all' ? true : l.truckId === filterPlaca;
      return matchMonth && matchPlaca;
    });

    // 1. RECEITAS
    // Concluded trips revenue
    const receitaFretes = freightsFiltered
      .filter((f: any) => f.status === 'Concluído' || f.status === 'Em Andamento')
      .reduce((sum: number, f: any) => sum + (Number(f.valorBruto) || 0), 0);

    // Complementary cashflow entries (not synced from trips to avoid duplication)
    const receitaEstadiasEExtras = cashFlowFiltered
      .filter((c: any) => c.tipo === 'entrada' && !c.id.includes('cash_freight_in'))
      .reduce((sum: number, c: any) => sum + (Number(c.valor) || 0), 0);

    const receitaBrutaTotal = receitaFretes + receitaEstadiasEExtras;

    // 2. CUSTOS VARIÁVEIS DA OPERAÇÃO (Viagens)
    // Fuel costs are managed under the dedicated Fuel and Freight Management tabs
    const realFuelS10 = fuelLogsFiltered
      .filter((l: any) => !l.tipoDiesel || l.tipoDiesel === 'S10')
      .reduce((sum: number, l: any) => sum + (Number(l.valor) || 0), 0);
    const manualFuelS10 = manualExpensesFiltered
      .filter((e: any) => isCombustivelByTipo(e.tipo) && !e.tipo?.toLowerCase().includes("s500"))
      .reduce((sum: number, e: any) => sum + (Number(e.valor) || 0), 0);
    const custoDieselS10 = realFuelS10 + manualFuelS10;

    const realFuelS500 = fuelLogsFiltered
      .filter((l: any) => l.tipoDiesel === 'S500')
      .reduce((sum: number, l: any) => sum + (Number(l.valor) || 0), 0);
    const manualFuelS500 = manualExpensesFiltered
      .filter((e: any) => isCombustivelByTipo(e.tipo) && e.tipo?.toLowerCase().includes("s500"))
      .reduce((sum: number, e: any) => sum + (Number(e.valor) || 0), 0);
    const custoDieselS500 = realFuelS500 + manualFuelS500;

    const custoDiesel = custoDieselS10 + custoDieselS500;
    
    // Arla 32 (Ar)
    const custoArlaFromFuel = fuelLogsFiltered.reduce((sum: number, l: any) => sum + (Number(l.valorArla) || 0), 0);
    const custoArlaManual = manualExpensesFiltered
      .filter((e: any) => isArlaByTipo(e.tipo))
      .reduce((sum: number, e: any) => sum + (Number(e.valor) || 0), 0);
    const custoArla = custoArlaFromFuel + custoArlaManual;

    // Tolls (Pedágios)
    const custoPedagios = freightsFiltered.reduce((sum: number, f: any) => sum + (Number(f.pedagio) || 0), 0);

    // Driver commissions / diaries
    const despesasMotoristasManual = manualExpensesFiltered
      .filter((e: any) => isMotoristaByTipo(e.tipo))
      .reduce((sum: number, e: any) => sum + (Number(e.valor) || 0), 0);
    const custoMotoristas = freightsFiltered.reduce((sum: number, f: any) => sum + (Number(f.motorista) || 0), 0) + despesasMotoristasManual;

    // Other trip variables (diaries, support)
    const custoOutrasDespesasViagem = freightsFiltered.reduce((sum: number, f: any) => sum + (Number(f.outrasDespesas) || 0), 0);

    const custoVariavelTotal = custoDiesel + custoArla + custoPedagios + custoMotoristas + custoOutrasDespesasViagem;

    // Margin = Revenue - Variable Costs
    const margemContribuicao = receitaBrutaTotal - custoVariavelTotal;
    const margemContribuicaoPercent = receitaBrutaTotal > 0 ? (margemContribuicao / receitaBrutaTotal) * 100 : 0;

    // 3. CUSTOS FIXOS E APOIO (Administrative / Maintenances)
    // Filtered maintenance costs (all alert costs that are done, plus cashflow pieces category)
    const filteredMaintenances = (data.maintenance_alerts || []).filter((m: any) => {
      const matchPlaca = filterPlaca === 'all' ? true : m.truckId === filterPlaca;
      const matchMonth = filterMonth === 'all' ? true : (m.dataRealizada && m.dataRealizada.startsWith(filterMonth));
      return m.status === 'Realizado' && matchPlaca && matchMonth;
    });

    const custoManutencaoAlerta = filteredMaintenances.reduce((sum: number, m: any) => sum + (Number(m.custo) || 0), 0);

    // Add manual despesas matching 'Manutenção'
    const despesasManutencaoManual = manualExpensesFiltered
      .filter((e: any) => isMaintenanceByTipo(e.tipo) && !e.documento?.startsWith("Auto-Manutenção"))
      .reduce((sum: number, e: any) => sum + (Number(e.valor) || 0), 0);

    const mntsTotal = custoManutencaoAlerta + despesasManutencaoManual;

    // Pedágio manual despesa (where not counted on freights)
    const pedagiosManual = manualExpensesFiltered
      .filter((e: any) => isPedagioByTipo(e.tipo))
      .reduce((sum: number, e: any) => sum + (Number(e.valor) || 0), 0);

    // Administrative & Offices, Insurances, Taxes, multas
    const despesaMultas = manualExpensesFiltered
      .filter((e: any) => isMultaByTipo(e.tipo))
      .reduce((sum: number, e: any) => sum + (Number(e.valor) || 0), 0);

    const despesaSeguro = manualExpensesFiltered
      .filter((e: any) => isSeguroByTipo(e.tipo))
      .reduce((sum: number, e: any) => sum + (Number(e.valor) || 0), 0);

    const dynamicCategoriesMap: { [key: string]: number } = {};
    manualExpensesFiltered.forEach((e: any) => {
      if (
        !isMaintenanceByTipo(e.tipo) && 
        !isPedagioByTipo(e.tipo) && 
        !isMultaByTipo(e.tipo) && 
        !isSeguroByTipo(e.tipo) &&
        !isCombustivelByTipo(e.tipo) &&
        !isArlaByTipo(e.tipo) &&
        !isMotoristaByTipo(e.tipo)
      ) {
        const catName = e.tipo || "Outras Despesas";
        dynamicCategoriesMap[catName] = (dynamicCategoriesMap[catName] || 0) + (Number(e.valor) || 0);
      }
    });

    const dynamicCategories = Object.entries(dynamicCategoriesMap).map(([name, value]) => ({
      name,
      value
    })).filter(c => c.value > 0);

    const despesaOutros = dynamicCategories.reduce((sum, c) => sum + c.value, 0);
    
    // Sum cash flow Saídas not already synced from freights or manual expenses
    const extrasCorporativo = cashFlowFiltered
      .filter((c: any) => {
        // Exclude synced freights and synced expenses to avoid double count
        const isTripSync = c.id.includes('cash_freight_out') || c.id.includes('cash_freight_in') || !!c.billId;
        const isExpSync = c.descricao.startsWith('Despesa');
        const isFuelSync = c.descricao.startsWith('Combustível') || c.categoria?.includes('Diesel') || c.descricao.startsWith('Abastecimento') || c.descricao.includes('Arla');
        const isMaintSync = c.descricao.startsWith('Conclusão Manutenção') || c.descricao.startsWith('Despesa Manutenção') || c.categoria?.includes('Manutenção');
        return c.tipo === 'saida' && !isTripSync && !isExpSync && !isFuelSync && !isMaintSync;
      })
      .reduce((sum: number, c: any) => sum + (Number(c.valor) || 0), 0);

    const despesasFixasEStrutura = mntsTotal + pedagiosManual + despesaMultas + despesaSeguro + despesaOutros + extrasCorporativo;

    // 4. NET RESULTS
    const resultadoLiquido = margemContribuicao - despesasFixasEStrutura;
    const resultadoLiquidoPercent = receitaBrutaTotal > 0 ? (resultadoLiquido / receitaBrutaTotal) * 100 : 0;

    return {
      receitaFretes,
      receitaEstadiasEExtras,
      receitaBrutaTotal,
      custoDiesel,
      custoDieselS10,
      custoDieselS500,
      custoArla,
      custoPedagios,
      custoMotoristas,
      custoOutrasDespesasViagem,
      custoVariavelTotal,
      margemContribuicao,
      margemContribuicaoPercent,
      custoManutencoes: mntsTotal,
      custoPedagiosFixos: pedagiosManual,
      despesaMultas,
      despesaSeguro,
      despesaOutros,
      dynamicCategories,
      extrasCorporativo,
      despesasFixasEStrutura,
      resultadoLiquido,
      resultadoLiquidoPercent,
      manualExpensesFiltered
    };
  }, [data, filterMonth, filterPlaca]);

  if (!data) return <div className="p-12 text-center text-slate-500 font-sans">Carregando painel de custos...</div>;

  const currentDRE = dreReport || {
    receitaFretes: 0,
    receitaEstadiasEExtras: 0,
    receitaBrutaTotal: 0,
    custoDiesel: 0,
    custoDieselS10: 0,
    custoDieselS500: 0,
    custoArla: 0,
    custoPedagios: 0,
    custoMotoristas: 0,
    custoOutrasDespesasViagem: 0,
    custoVariavelTotal: 0,
    margemContribuicao: 0,
    margemContribuicaoPercent: 0,
    custoManutencoes: 0,
    custoPedagiosFixos: 0,
    despesaMultas: 0,
    despesaSeguro: 0,
    despesaOutros: 0,
    dynamicCategories: [],
    extrasCorporativo: 0,
    despesasFixasEStrutura: 0,
    resultadoLiquido: 0,
    resultadoLiquidoPercent: 0,
    manualExpensesFiltered: []
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Header Block with Filtering controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800">DRE & Gestão de Custos</h2>
          <p className="text-xs text-slate-500 font-semibold font-sans mt-0.5">
            Demonstrativo financeiro completo integrado com as viagens, combustível e manutenções da frota.
          </p>
        </div>
        
        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 text-xs font-bold max-w-max">
          <button 
            onClick={() => setActiveSubTab('dre')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
              activeSubTab === 'dre' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <BarChart3 size={14} />
            <span>DRE Estruturado</span>
          </button>
          <button 
            onClick={() => setActiveSubTab('manual')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
              activeSubTab === 'manual' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Receipt size={14} />
            <span>Lançamentos Administrativos</span>
          </button>
          <button 
            onClick={() => setActiveSubTab('bills')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
              activeSubTab === 'bills' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Calendar size={14} className="text-amber-500" />
            <span className="font-semibold text-amber-600">Contas a Pagar</span>
          </button>
          <button 
            onClick={() => setActiveSubTab('categorias')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
              activeSubTab === 'categorias' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Tag size={14} className="text-blue-500" />
            <span>Categorias</span>
          </button>
          <button 
            onClick={() => setActiveSubTab('charts')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
              activeSubTab === 'charts' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <PieChart size={14} />
            <span>Análise Ponderada</span>
          </button>
          <button 
            onClick={() => setActiveSubTab('empresas')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
              activeSubTab === 'empresas' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Building size={14} />
            <span>Empresas & Credores</span>
          </button>
        </div>
      </div>

      {/* Corporate Filter Drawer for the P&L */}
      <div className="bg-white p-5 rounded-3xl border border-slate-250/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-blue-600" />
          <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Filtros de Consolidação</h3>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Calendar Month filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-bold">Mês Operacional:</span>
            <select
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 text-[11px]"
            >
              <option value="all">Todos os Meses</option>
              {availableMonths.map((m: string) => {
                const [year, month] = m.split('-');
                const dateObj = new Date(Number(year), Number(month) - 1, 1);
                const label = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                return <option key={m} value={m}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>;
              })}
            </select>
          </div>

          <span className="text-slate-300">|</span>

          {/* Truck filter for specific plate DRE */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-bold">Centro por Caminhão Placa:</span>
            <select
              value={filterPlaca}
              onChange={e => setFilterPlaca(e.target.value)}
              className="bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 text-[11px]"
            >
              <option value="all">Toda a Frota Ativa</option>
              {data.trucks.map((t: any) => (
                <option key={t.id} value={t.placa}>{t.placa} ({t.modelo})</option>
              ))}
            </select>
          </div>

          {(filterMonth !== 'all' || filterPlaca !== 'all') && (
            <button
              onClick={() => {
                setFilterMonth('all');
                setFilterPlaca('all');
              }}
              className="text-xs text-blue-600 hover:underline font-bold"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Main UI body based on tabs */}
      {activeSubTab === 'dre' && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Card 1: Revenue */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs relative overflow-hidden flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Receita Bruta Acumulada</p>
                <h4 className="text-2xl font-black text-slate-800 font-mono mt-1">
                  R$ {currentDRE.receitaBrutaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h4>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 rounded-lg px-2 py-0.5 mt-3 max-w-max">
                <TrendingUp size={12} />
                <span>Entrada em Caixa</span>
              </div>
            </div>

            {/* Card 2: Costs */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs relative overflow-hidden flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Custos de Viagem (Variáveis)</p>
                <h4 className="text-2xl font-black text-slate-800 font-mono mt-1">
                  R$ {currentDRE.custoVariavelTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-medium font-sans mt-3">
                Combustível, Pedágios e Motoristas
              </span>
            </div>

            {/* Card 3: Contribution Margin */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs relative overflow-hidden flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Margem de Contribuição</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <h4 className="text-2xl font-black text-slate-850 font-mono">
                    {currentDRE.margemContribuicaoPercent.toFixed(1)}%
                  </h4>
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">da receita</span>
                </div>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full rounded-full" 
                  style={{ width: `${Math.max(5, Math.min(100, currentDRE.margemContribuicaoPercent))}%` }}
                />
              </div>
            </div>

            {/* Card 4: EBITDA Net Profits */}
            <div className={cn(
              "p-5 rounded-3xl border shadow-2xs relative overflow-hidden flex flex-col justify-between",
              currentDRE.resultadoLiquido >= 0 ? "bg-emerald-50/50 border-emerald-200" : "bg-rose-50/50 border-rose-200"
            )}>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Resultado Líquido do Exercício</p>
                <h4 className={cn(
                  "text-2xl font-black font-mono mt-1",
                  currentDRE.resultadoLiquido >= 0 ? "text-emerald-700" : "text-rose-700"
                )}>
                  R$ {currentDRE.resultadoLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h4>
              </div>
              <div className={cn(
                "flex items-center gap-1 text-[11px] font-bold rounded-lg px-2 py-0.5 mt-3 max-w-max",
                currentDRE.resultadoLiquido >= 0 ? "text-emerald-800 bg-emerald-100" : "text-rose-800 bg-rose-100"
              )}>
                {currentDRE.resultadoLiquido >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                <span>Margem Líquida {currentDRE.resultadoLiquidoPercent.toFixed(1)}%</span>
              </div>
            </div>

          </div>

          {/* Complete Structured DRE table */}
          <div className="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <BarChart3 className="text-blue-600" size={18} />
                <h3 className="font-extrabold text-slate-800 text-sm">Demonstrativo de Resultado do Exercício - DRE Rodoviário</h3>
              </div>
              <span className="text-[10px] font-bold font-mono text-slate-400">Padrão Contábil Gerencial</span>
            </div>

            <div className="divide-y divide-slate-100 font-sans text-xs">
              
              {/* SECTION 1: REVENUE */}
              <div className="p-4 flex justify-between items-center bg-slate-50/20">
                <span className="font-extrabold text-slate-800 text-sm">1. RECEITA OPERACIONAL CORRENTE</span>
                <span className="font-black text-slate-900 font-mono text-sm">
                  R$ {currentDRE.receitaBrutaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              
              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (+) Faturamento de Fretes (Cartas-Frete Concluídas)
                </span>
                <span className="font-bold font-mono">
                  R$ {currentDRE.receitaFretes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (+) Estadias de Viagem, Reembolsos e Ajustes
                </span>
                <span className="font-bold font-mono">
                  R$ {currentDRE.receitaEstadiasEExtras.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* SECTION 2: VARIABLE COSTS */}
              <div className="p-4 flex justify-between items-center bg-slate-55/20">
                <span className="font-extrabold text-slate-800 text-sm">2. (-) CUSTOS VARIÁVEIS DE VIAGEM (DEDUÇÕES)</span>
                <span className="font-black text-red-650 font-mono text-sm text-red-600">
                  - R$ {currentDRE.custoVariavelTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (-) Abastecimento de Diesel / Combustível
                </span>
                <span className="font-bold font-mono text-red-600">
                  - R$ {currentDRE.custoDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {currentDRE.custoDieselS10 > 0 && (
                <div className="p-2 pl-14 flex justify-between items-center text-slate-500 text-xs border-l-2 border-slate-100 ml-10">
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Diesel S10
                  </span>
                  <span className="font-medium font-mono text-red-500">
                    - R$ {currentDRE.custoDieselS10.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {currentDRE.custoDieselS500 > 0 && (
                <div className="p-2 pl-14 flex justify-between items-center text-slate-500 text-xs border-l-2 border-slate-100 ml-10">
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Diesel S500
                  </span>
                  <span className="font-medium font-mono text-red-500">
                    - R$ {currentDRE.custoDieselS500.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (-) Despesa com Abastecimento de Arla 32
                </span>
                <span className="font-bold font-mono text-red-600">
                  - R$ {currentDRE.custoArla.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (-) Vales-Pedágio da Rota Operada
                </span>
                <span className="font-bold font-mono text-red-600">
                  - R$ {currentDRE.custoPedagios.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (-) Diárias e Comissionamento de Motoristas
                </span>
                <span className="font-bold font-mono text-red-600">
                  - R$ {currentDRE.custoMotoristas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (-) Outras Custas de Carregamento e Escolta
                </span>
                <span className="font-bold font-mono text-red-600">
                  - R$ {currentDRE.custoOutrasDespesasViagem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* MARGIN OF CONTRIBUTION */}
              <div className="p-4 flex justify-between items-center bg-indigo-50/50">
                <span className="font-black text-indigo-900 text-sm">(=) MARGEM DE CONTRIBUIÇÃO BRUTA DA OPERAÇÃO</span>
                <div className="text-right">
                  <span className="font-black text-indigo-950 font-mono text-sm leading-none block">
                    R$ {currentDRE.margemContribuicao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-indigo-700 font-bold block mt-0.5">
                    Margem: {currentDRE.margemContribuicaoPercent.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* SECTION 3: FIXED COSTS & REPAIRS */}
              <div className="p-4 flex justify-between items-center bg-slate-50/20">
                <span className="font-extrabold text-slate-800 text-sm">3. (-) OUTROS CUSTOS FIXOS, MANUTENÇÕES E ESTRUTURA</span>
                <span className="font-black text-red-650 font-mono text-sm text-red-600">
                  - R$ {currentDRE.despesasFixasEStrutura.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (-) Manutenções Preventivas e Corretivas de Caminhões (Oficina)
                </span>
                <span className="font-bold font-mono text-red-600">
                  - R$ {currentDRE.custoManutencoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (-) Seguros, Assistência 24h e Rastreadores Satelitais
                </span>
                <span className="font-bold font-mono text-red-600">
                  - R$ {currentDRE.despesaSeguro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (-) Custos de Pedágios Avulsos (Sem Viagem)
                </span>
                <span className="font-bold font-mono text-red-600">
                  - R$ {currentDRE.custoPedagiosFixos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (-) Infrações de Trânsito, Multas e Custas Estatutárias
                </span>
                <span className="font-bold font-mono text-red-600">
                  - R$ {currentDRE.despesaMultas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-slate-400" />
                  (-) Despesas Extras de Apoio Corporativo e Lançamentos Administrativos
                </span>
                <span className="font-bold font-mono text-red-600">
                  - R$ {currentDRE.extrasCorporativo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {currentDRE.dynamicCategories && currentDRE.dynamicCategories.length > 0 ? (
                currentDRE.dynamicCategories.map((cat: any) => (
                  <div key={cat.name} className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                    <span className="flex items-center gap-2">
                      <ChevronRight size={12} className="text-slate-400" />
                      (-) {cat.name}
                    </span>
                    <span className="font-bold font-mono text-red-650 text-red-600">
                      - R$ {cat.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-3.5 pl-8 flex justify-between items-center text-slate-600">
                  <span className="flex items-center gap-2">
                    <ChevronRight size={12} className="text-slate-400" />
                    (-) Despesas Diversas Gerais
                  </span>
                  <span className="font-bold font-mono text-red-600">
                    - R$ 0,00
                  </span>
                </div>
              )}

              {/* FINAL NET RESULT CARD */}
              <div className={cn(
                "p-5 flex justify-between items-center",
                currentDRE.resultadoLiquido >= 0 ? "bg-emerald-50" : "bg-rose-50"
              )}>
                <span className="font-black text-slate-900 text-sm flex items-center gap-2">
                  {currentDRE.resultadoLiquido >= 0 ? '🟢' : '🔴'} 
                  (=) RESULTADO FINANCEIRO OPERACIONAL (LUCRO OU PREJUÍZO LÍQUIDO)
                </span>
                <div className="text-right">
                  <span className={cn(
                    "font-black font-mono text-base leading-none block",
                    currentDRE.resultadoLiquido >= 0 ? "text-emerald-800" : "text-rose-800"
                  )}>
                    R$ {currentDRE.resultadoLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className={cn(
                    "text-[10px] font-black block mt-0.5",
                    currentDRE.resultadoLiquido >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    Lucratividade Líquida: {currentDRE.resultadoLiquidoPercent.toFixed(1)}%
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Manual support and administrative expenditures table tab */}
      {activeSubTab === 'manual' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Lançamentos de Controles Administrativos</h3>
              <p className="text-xs text-slate-500">Lançamento de outras e despesas diversas gerais administrativas da frota.</p>
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
            >
              <Plus size={16} />
              Nova Despesa
            </button>
          </div>

          {/* Tabela de Lançamentos - Modo Desktop */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 uppercase font-black text-slate-400">
                    <th className="px-6 py-4 text-[10px]">Caminhão</th>
                    <th className="px-6 py-4 text-[10px]">Tipo de Item</th>
                    <th className="px-6 py-4 text-[10px]">Data</th>
                    <th className="px-6 py-4 text-[10px]">Descrição / Obs</th>
                    <th className="px-6 py-4 text-[10px]">Comprovante</th>
                    <th className="px-6 py-4 text-[10px] text-right">Valor</th>
                    <th className="px-6 py-4 text-[10px] text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {currentDRE.manualExpensesFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                        Nenhuma despesa administrativa manual registrada para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    [...currentDRE.manualExpensesFiltered].reverse().map((exp: any) => (
                      <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 bg-slate-100 border border-slate-200.60 px-2 py-0.5 rounded text-[11px] font-mono">
                            {exp.truckId}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Tag size={12} className="text-blue-500" />
                            <span className="font-bold text-slate-700">{exp.tipo}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-mono">
                          {new Date(exp.data + "T00:00:00").toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-medium max-w-xs">
                          {exp.empresaDespesa && (
                            <div className="mb-1 text-[10px] font-black text-blue-600 bg-blue-50 border border-blue-150 inline-block px-1.5 py-0.5 rounded-lg uppercase tracking-wider">
                              🏢 {exp.empresaDespesa}
                            </div>
                          )}
                          <div className="truncate">
                            {exp.obs || <span className="text-slate-350 italic">Sem detalhamento</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {exp.comprovante ? (
                            <div className="w-24">
                              <AttachmentPreview src={exp.comprovante} label={`Recibo - ${exp.tipo}`} className="!h-9 border border-slate-200" />
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Nenhum</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-red-600 font-mono font-bold">
                          - R$ {exp.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openExpenseDetail(exp)}
                              className="p-1 px-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100 cursor-pointer"
                              title="Visualizar e Editar Detalhes"
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(exp.id)}
                              className="p-1 px-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors border border-rose-100 cursor-pointer"
                              title="Remover lançamento"
                            >
                              <Trash2 size={13} />
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

          {/* Cards de Lançamentos - Modo Responsivo Mobile */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {currentDRE.manualExpensesFiltered.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-400 italic text-xs">
                Nenhuma despesa administrativa manual registrada para os filtros selecionados.
              </div>
            ) : (
              [...currentDRE.manualExpensesFiltered].reverse().map((exp: any) => (
                <div key={exp.id} className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3.5">
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
                          {exp.truckId}
                        </span>
                        <span className="font-bold text-slate-800 text-xs">{exp.tipo}</span>
                      </div>
                      <div className="text-slate-400 font-mono text-[10px]">
                        📅 {new Date(exp.data + "T00:00:00").toLocaleDateString('pt-BR')}
                        {exp.km ? ` • 🛣️ ${Number(exp.km).toLocaleString('pt-BR')} km` : ''}
                      </div>
                    </div>
                    <span className="text-red-650 font-mono font-bold text-xs shrink-0 whitespace-nowrap">
                      - R$ {exp.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {(exp.empresaDespesa || exp.obs) && (
                    <div className="bg-slate-50 p-2.5 rounded-xl space-y-1 text-slate-650 text-[11px] border border-slate-100">
                      {exp.empresaDespesa && (
                        <div className="font-black text-blue-600 uppercase tracking-wider text-[9px] flex items-center gap-1">
                          🏢 {exp.empresaDespesa}
                        </div>
                      )}
                      {exp.obs && (
                        <p className="font-medium line-clamp-3 text-slate-600 leading-normal">{exp.obs}</p>
                      )}
                    </div>
                  )}

                  {exp.comprovante && (
                    <div className="w-full">
                      <AttachmentPreview src={exp.comprovante} label={`Recibo - ${exp.tipo}`} className="!h-16 border border-slate-250 bg-slate-50" />
                    </div>
                  )}

                  <div className="flex gap-2 pt-1 font-bold">
                    <button
                      onClick={() => openExpenseDetail(exp)}
                      className="flex-1 py-2 px-3 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl transition-all border border-blue-150 text-center text-[11px] flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Eye size={13} />
                      <span>Ver e Editar</span>
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(exp.id)}
                      className="py-2 px-3.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-all border border-rose-150 text-center text-[11px] flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Trash2 size={13} />
                      <span>Excluir</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Subtab Contas a Pagar */}
      {activeSubTab === 'bills' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Contas a Pagar & Parcelamentos</h3>
              <p className="text-xs text-slate-500">Acompanhe vencimentos de parcelamentos semanais ou mensais de caminhões e despesas.</p>
            </div>
            <button 
              onClick={() => setIsBillModalOpen(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-200 self-start sm:self-auto cursor-pointer"
            >
              <Plus size={16} />
              <span>Novo Parcelamento / Conta</span>
            </button>
          </div>

          {/* Filtros rápidos de Status de Contas a Pagar */}
          <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
            {(['Todos', 'Pendente', 'Pago'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setBillFilterStatus(st)}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                  billFilterStatus === st 
                    ? "bg-slate-800 text-white" 
                    : "text-slate-500 hover:bg-slate-100"
                )}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Tabela de Contas a Pagar */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 uppercase font-black text-slate-400">
                    <th className="px-6 py-4 text-[10px]">Vencimento</th>
                    <th className="px-6 py-4 text-[10px]">Descrição da Conta</th>
                    <th className="px-6 py-4 text-[10px]">Caminhão</th>
                    <th className="px-6 py-4 text-[10px]">Categoria</th>
                    <th className="px-6 py-4 text-[10px]">Valor da Parcela</th>
                    <th className="px-6 py-4 text-[10px]">Parcela</th>
                    <th className="px-6 py-4 text-[10px]">Status</th>
                    <th className="px-6 py-4 text-[10px] text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBills.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-slate-400 italic">
                        Nenhuma conta a pagar encontrada para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    [...filteredBills].sort((a: any, b: any) => a.vencimento.localeCompare(b.vencimento)).map((bill: any) => (
                      <tr key={bill.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-6 py-4.5 font-mono font-bold text-slate-600">
                          {new Date(bill.vencimento + "T12:00:00").toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4.5 font-bold text-slate-800">
                          <div className="space-y-0.5">
                            <p>{bill.descricao}</p>
                            {bill.observacao && <p className="text-[10px] text-slate-400 font-medium line-clamp-1">{bill.observacao}</p>}
                          </div>
                        </td>
                        <td className="px-6 py-4.5">
                          {bill.truckId ? (
                            <span className="font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] border border-slate-200">
                              {bill.truckId}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Administrativo</span>
                          )}
                        </td>
                        <td className="px-6 py-4.5">
                          <span className="font-semibold text-slate-650 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] border border-blue-100">
                            {bill.categoria}
                          </span>
                        </td>
                        <td className="px-6 py-4.5 font-mono font-bold text-slate-800">
                          R$ {bill.valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4.5 font-mono font-medium text-slate-500">
                          {bill.parcelas > 1 ? `${bill.parcelaAtual}/${bill.parcelas}` : 'Única'}
                        </td>
                        <td className="px-6 py-4.5">
                          {bill.status === "Pago" ? (
                            <span className="font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px]">
                              Quitação Confirmada
                            </span>
                          ) : (
                            <span className="font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full text-[10px]">
                              Pendente
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {bill.status === "Pendente" ? (
                              <button
                                onClick={() => handlePayBillClick(bill)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg font-bold transition cursor-pointer text-[10px]"
                              >
                                Pagar
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRevertPayment(bill.id)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1 rounded-lg font-bold transition border border-slate-200 cursor-pointer text-[10px]"
                              >
                                Reverter
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteBill(bill.id)}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-100 transition cursor-pointer"
                              title="Excluir Conta"
                            >
                              <Trash2 size={14} />
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

          {/* Modo Mobile para Contas a Pagar */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {filteredBills.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-400 italic text-xs">
                Nenhuma conta a pagar para os filtros selecionados.
              </div>
            ) : (
              [...filteredBills].sort((a: any, b: any) => a.vencimento.localeCompare(b.vencimento)).map((bill: any) => (
                <div key={bill.id} className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3.5">
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {bill.truckId ? (
                          <span className="font-bold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
                            {bill.truckId}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded uppercase">Administrativo</span>
                        )}
                        <span className="font-bold text-slate-800 text-xs">{bill.descricao}</span>
                      </div>
                      <div className="text-slate-400 font-mono text-[10px]">
                        📅 Vencimento: {new Date(bill.vencimento + "T12:00:00").toLocaleDateString('pt-BR')}
                        {bill.parcelas > 1 ? ` • 🔢 Parcela: ${bill.parcelaAtual}/${bill.parcelas}` : ' • Única'}
                      </div>
                    </div>
                    <span className="text-slate-800 font-mono font-bold text-xs shrink-0 whitespace-nowrap">
                      R$ {bill.valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div>
                      {bill.status === "Pago" ? (
                        <span className="font-bold bg-emerald-50 text-emerald-600 border border-emerald-150 px-2 py-0.5 rounded-full text-[9px]">
                          Quitada
                        </span>
                      ) : (
                        <span className="font-bold bg-amber-50 text-amber-600 border border-amber-150 px-2 py-0.5 rounded-full text-[9px]">
                          Pendente
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {bill.status === "Pendente" ? (
                        <button
                          onClick={() => handlePayBillClick(bill)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl font-bold text-[10px] cursor-pointer transition shadow-sm"
                        >
                          Pagar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRevertPayment(bill.id)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-xl font-bold text-[10px] border border-slate-200 cursor-pointer transition"
                        >
                          Reverter
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteBill(bill.id)}
                        className="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-150 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Subtab Categorias */}
      {activeSubTab === 'categorias' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Gerenciamento de Categorias de Despesas</h3>
              <p className="text-xs text-slate-500">Adicione, edite ou exclua categorias personalizadas para sincronia automática com o DRE e fluxo de caixa.</p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input 
                type="text" 
                placeholder="Nome da nova categoria..." 
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold w-full md:w-64"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddCategory(newCatName);
                    setNewCatName('');
                  }
                }}
              />
              <button 
                onClick={() => {
                  handleAddCategory(newCatName);
                  setNewCatName('');
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 shrink-0 cursor-pointer"
              >
                <Plus size={14} />
                <span>Adicionar</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-4">Categorias Cadastradas</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {categoriesSaida.map((cat: string) => {
                const isEditing = editingCatName === cat;
                return (
                  <div key={cat} className="p-3 border border-slate-200 rounded-2xl flex items-center justify-between gap-2 bg-slate-50/30 hover:bg-slate-50/80 transition-all">
                    {isEditing ? (
                      <input 
                        type="text"
                        value={editingCatValue}
                        onChange={e => setEditingCatValue(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold w-full"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleEditCategory(cat, editingCatValue);
                            setEditingCatName(null);
                          }
                          if (e.key === 'Escape') {
                            setEditingCatName(null);
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <span className="font-bold text-slate-700 text-xs truncate" title={cat}>{cat}</span>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <button 
                            onClick={() => {
                              handleEditCategory(cat, editingCatValue);
                              setEditingCatName(null);
                            }}
                            className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer text-xs font-bold"
                          >
                            Salvar
                          </button>
                          <button 
                            onClick={() => setEditingCatName(null)}
                            className="p-1.5 bg-slate-100 text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-200 transition cursor-pointer text-xs font-bold"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => {
                              setEditingCatName(cat);
                              setEditingCatValue(cat);
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-100 transition cursor-pointer"
                            title="Editar Categoria"
                          >
                            <Edit size={14} />
                          </button>
                          <button 
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-100 transition cursor-pointer"
                            title="Excluir Categoria"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cost share & charts analysis */}
      {activeSubTab === 'charts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
          {/* Box 1: Cost Weigh Factor progress list */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <PieChart size={16} className="text-blue-600" />
                Diferenciação Ponderada do Gasto
              </h4>
              <p className="text-xs text-slate-400 mt-1">Quanto cada componente pesa no custo operacional do período estipulado.</p>
            </div>

            {(() => {
              const totalCost = currentDRE.custoVariavelTotal + currentDRE.despesasFixasEStrutura;
              if (totalCost === 0) {
                return <div className="text-center py-10 text-xs text-slate-400 italic">Sem custos na listagem atual para calculação ponderada.</div>;
              }

              const categoryShares = [
                { name: "Diesel S10", value: currentDRE.custoDieselS10, color: "bg-amber-500", labelColor: "text-amber-800" },
                { name: "Diesel S500", value: currentDRE.custoDieselS500, color: "bg-blue-500", labelColor: "text-blue-800" },
                { name: "Arla 32 (Ar)", value: currentDRE.custoArla, color: "bg-sky-400", labelColor: "text-sky-800" },
                { name: "Motoristas (Diárias/Comissões)", value: currentDRE.custoMotoristas, color: "bg-blue-600", labelColor: "text-blue-800" },
                { name: "Manutenção & Consertos", value: currentDRE.custoManutencoes, color: "bg-indigo-600", labelColor: "text-indigo-800" },
                { name: "Pedágios (Viagem e Avulsos)", value: currentDRE.custoPedagios + currentDRE.custoPedagiosFixos, color: "bg-slate-700", labelColor: "text-slate-800" },
                { name: "Seguro & Assistência", value: currentDRE.despesaSeguro, color: "bg-teal-600", labelColor: "text-teal-800" },
                { name: "Multas de Trânsito", value: currentDRE.despesaMultas, color: "bg-rose-600", labelColor: "text-rose-800" },
                { name: "Outras Despesas", value: currentDRE.custoOutrasDespesasViagem + currentDRE.despesaOutros + currentDRE.extrasCorporativo, color: "bg-slate-400", labelColor: "text-slate-500" }
              ].sort((a: any, b: any) => b.value - a.value);

              return (
                <div className="space-y-4">
                  {categoryShares.map((share: any) => {
                    const pct = (share.value / totalCost) * 100;
                    if (share.value === 0) return null;
                    return (
                      <div key={share.name} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold font-sans">
                          <span className="text-slate-600">{share.name}</span>
                          <span className="text-slate-900 font-mono">
                            R$ {share.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({pct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full", share.color)} 
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Box 2: Health Indicators of the fleet */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <AlertCircle size={16} className="text-blue-600" />
                Diagnóstico de Rentabilidade
              </h4>
              <p className="text-xs text-slate-400 mt-1">Análises objetivas com base nas premissas contábeis de transporte pesado de carga.</p>
            </div>

            <div className="space-y-4.5 text-xs">
              
              {/* Fuel analysis row removed as fuel is tracked in dedicated tabs */}

              {/* Maintenance weight */}
              <div className="p-3 border border-slate-150 rounded-2xl space-y-2 bg-slate-50/50">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-slate-700">Peso das Oficinas (Manutenções)</span>
                  {currentDRE.receitaBrutaTotal > 0 ? (
                    (() => {
                      const maintWeightStr = ((currentDRE.custoManutencoes / currentDRE.receitaBrutaTotal) * 100);
                      return maintWeightStr > 15 ? (
                        <span className="bg-rose-100 text-rose-800 p-0.5 px-2 rounded-full text-[10px]">Alto</span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 p-0.5 px-2 rounded-full text-[10px]">Excelente</span>
                      );
                    })()
                  ) : <span className="text-slate-400">Pendente</span>}
                </div>
                {currentDRE.receitaBrutaTotal > 0 ? (
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    A oficina e trocas manuais de peças pesam <strong>{((currentDRE.custoManutencoes / currentDRE.receitaBrutaTotal) * 100).toFixed(1)}%</strong> sobre as entradas brutas. Recomenda-se manter o reinvestimento em manutenção entre 5% e 12% para frotas seminovas.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">Insira novos fretes concluídos e despesas de oficina para habilitar.</p>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Expense Companies Management tab */}
      {activeSubTab === 'empresas' && (
        <div className="space-y-6 font-sans">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Cadastro de Empresas e Fornecedores</h3>
              <p className="text-xs text-slate-500">Cadastre e gerencie as empresas e credores para vincular aos lançamentos de despesas.</p>
            </div>
            <button 
              onClick={openNewCompany}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 cursor-pointer"
            >
              <Plus size={16} />
              Cadastrar Empresa
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" id="panel-expense-companies">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="table-expense-companies">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 uppercase font-black text-slate-400">
                    <th className="px-6 py-4 text-[10px] tracking-wider">Nome da Empresa</th>
                    <th className="px-6 py-4 text-[10px] tracking-wider">CNPJ</th>
                    <th className="px-6 py-4 text-[10px] tracking-wider">Localidade</th>
                    <th className="px-6 py-4 text-[10px] tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(!data?.expense_companies || data.expense_companies.length === 0) ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                        Nenhuma empresa cadastrada. Clique em "Cadastrar Empresa" para começar!
                      </td>
                    </tr>
                  ) : (
                    data.expense_companies.map((comp: any) => (
                      <tr key={comp.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                              <Building size={16} className="text-blue-600" />
                            </div>
                            <span className="font-bold text-slate-900">{comp.nome}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-650 font-mono">
                          {comp.cnpj || '---'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-650">
                          {comp.cidade ? `${comp.cidade} / ${comp.uf || '---'}` : '---'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditCompany(comp)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                              title="Editar Empresa"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteCompany(comp.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                              title="Excluir Empresa"
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
        </div>
      )}

      {/* Manual Expense create Modal (traditional) */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nova Despesa Administrativa">
        <div className="space-y-5 text-slate-700 font-sans text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-750 mb-1.5">Caminhão</label>
              <select 
                value={newExpense.truckId}
                onChange={e => setNewExpense({...newExpense, truckId: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
              >
                <option value="">Selecione...</option>
                {data.trucks.map((t: any) => (
                  <option key={t.id} value={t.placa}>{t.placa} - {t.modelo}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-750 mb-1.5">Tipo de Despesa</label>
              <select 
                value={newExpense.tipo}
                onChange={e => setNewExpense({...newExpense, tipo: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
              >
                <option value="">Selecione...</option>
                {categoriesSaida.filter((cat: string) => !isCombustivelByTipo(cat)).map((cat: string) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-750 mb-1.5">Data</label>
              <input 
                type="date" 
                value={newExpense.data}
                onChange={e => setNewExpense({...newExpense, data: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-750 mb-1.5">Valor (R$)</label>
              <input 
                type="text" 
                value={newExpense.valor ? maskBRL(newExpense.valor) : ""}
                onChange={e => {
                  const masked = maskBRL(e.target.value);
                  setNewExpense({...newExpense, valor: masked ? String(unmaskBRL(masked)) : ""});
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold font-mono focus:outline-none text-xs"
                placeholder="R$ 0,00"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-750 mb-1.5">KM (Odômetro)</label>
              <input 
                type="number" 
                value={newExpense.km}
                onChange={e => setNewExpense({...newExpense, km: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold font-mono focus:outline-none text-xs"
                placeholder="Ex: 125400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-750 mb-1.5">Empresa / Destinatário da Despesa</label>
            <select
              value={newExpense.expenseCompanyId}
              onChange={e => {
                const id = e.target.value;
                if (id === "manual") {
                  setNewExpense({
                    ...newExpense,
                    expenseCompanyId: "manual",
                    empresaDespesa: ""
                  });
                } else {
                  const matched = (data?.expense_companies || []).find((ec: any) => ec.id === id);
                  setNewExpense({
                    ...newExpense,
                    expenseCompanyId: id,
                    empresaDespesa: matched ? matched.nome : ""
                  });
                }
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none text-xs text-slate-700"
            >
              <option value="">Nenhuma / Não especificada</option>
              <option value="manual">✍️ Digitar manualmente...</option>
              {(data?.expense_companies || []).map((ec: any) => (
                <option key={ec.id} value={ec.id}>
                  🏢 {ec.nome} {ec.cnpj ? `(CNPJ: ${ec.cnpj})` : ''} {ec.cidade ? `- ${ec.cidade}/${ec.uf}` : ''}
                </option>
              ))}
            </select>

            {newExpense.expenseCompanyId === "manual" && (
              <div className="mt-2.5">
                <input
                  type="text"
                  value={newExpense.empresaDespesa}
                  onChange={e => setNewExpense({...newExpense, empresaDespesa: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none text-xs text-slate-700 focus:ring-2 focus:ring-blue-500/10"
                  placeholder="Digite o nome do credor / empresa destinatária"
                />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-750 mb-1.5">Observação (Opcional)</label>
            <textarea 
              value={newExpense.obs}
              onChange={e => setNewExpense({...newExpense, obs: e.target.value})}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold text-slate-600 focus:outline-none h-20 resize-none text-xs"
              placeholder="Ex: Troca de pastilhas de freio da campana traseira..."
            />
          </div>
          <div className="relative border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-4 text-center hover:border-blue-500 hover:bg-blue-50/10 transition-all cursor-pointer">
            <input 
              type="file"
              accept="image/*,application/pdf"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  compressAndSetFile(file, (base64) => {
                    setNewExpense({ ...newExpense, comprovante: base64 });
                  });
                }
              }}
            />
            {newExpense.comprovante ? (
              <div className="flex items-center gap-2">
                {newExpense.comprovante.startsWith('data:application/pdf') ? (
                  <FileText className="text-red-500 w-8 h-8 shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded overflow-hidden border bg-slate-150 shrink-0">
                    <img src={newExpense.comprovante} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="text-left animate-fade-in">
                  <span className="text-xs font-bold text-emerald-650 flex items-center gap-1">
                    <CheckCircle size={14} /> Documento anexado!
                  </span>
                  <p className="text-[10px] text-slate-400">Clique ou arraste outro para substituir</p>
                </div>
              </div>
            ) : (
              <>
                <Camera size={20} />
                <span className="text-[10px] font-black uppercase tracking-wider">Anexar Comprovante Oficial (Foto ou PDF)</span>
              </>
            )}
          </div>
          <div className="flex gap-3 pt-4 font-bold">
            <button 
              onClick={() => setIsModalOpen(false)}
              disabled={isSaving}
              className="flex-1 px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {isSaving ? 'Lançando...' : 'Lançar Despesa'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail and Edit Expense Modal */}
      <Modal isOpen={isDetailModalOpen} onClose={() => { setIsDetailModalOpen(false); setSelectedExpenseDetail(null); }} title={isEditingExpense ? "Editar Despesa Administrativa" : "Detalhamento de Despesa Administrativa"}>
        {selectedExpenseDetail && (
          <div className="space-y-5 text-slate-750 font-sans text-xs">
            {!isEditingExpense ? (
              // View Mode
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <span className="block text-[10px] font-black uppercase text-slate-400 mb-0.5">Veículo / Caminhão</span>
                    <span className="font-bold text-slate-800 text-sm">{selectedExpenseDetail.truckId}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-black uppercase text-slate-400 mb-0.5">Tipo de Despesa</span>
                    <span className="font-bold text-slate-800 text-sm">{selectedExpenseDetail.tipo}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <span className="block text-[10px] font-black uppercase text-slate-400 mb-0.5">Data de Emissão</span>
                    <span className="font-bold text-slate-800 text-sm font-mono">
                      {new Date(selectedExpenseDetail.data + "T00:00:00").toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-black uppercase text-slate-400 mb-0.5">Valor da Despesa</span>
                    <span className="font-bold text-red-650 text-sm font-mono">
                      R$ {selectedExpenseDetail.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-black uppercase text-slate-400 mb-0.5">Odômetro (KM)</span>
                    <span className="font-bold text-slate-850 text-sm font-mono">
                      {selectedExpenseDetail.km ? `${Number(selectedExpenseDetail.km).toLocaleString('pt-BR')} km` : <span className="text-slate-400 italic">Não informado</span>}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">Empresa Credora / Destinatário</span>
                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center gap-2">
                    <Building className="text-slate-400" size={16} />
                    <div>
                      <span className="font-bold text-slate-800 block text-xs">
                        {selectedExpenseDetail.empresaDespesa || "Não identificada / Não especificada"}
                      </span>
                      {selectedExpenseDetail.expenseCompanyId && selectedExpenseDetail.expenseCompanyId !== "manual" && (
                        (() => {
                          const comp = (data?.expense_companies || []).find((ec: any) => ec.id === selectedExpenseDetail.expenseCompanyId);
                          if (comp) {
                            return (
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                {comp.cnpj ? `CNPJ: ${comp.cnpj}` : ''} {comp.cidade ? ` • ${comp.cidade}/${comp.uf}` : ''}
                              </span>
                            );
                          }
                          return null;
                        })()
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">Observação / Descrição Detalhada</span>
                  <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl text-slate-650 font-medium whitespace-pre-wrap leading-relaxed">
                    {selectedExpenseDetail.obs || <span className="text-slate-350 italic">Nenhum detalhamento registrado para este lançamento.</span>}
                  </div>
                </div>

                {selectedExpenseDetail.comprovante && (
                  <div>
                    <span className="block text-[10px] font-black uppercase text-slate-400 mb-1.5">Comprovante Oficial / Recibo</span>
                    <div className="border border-slate-150 rounded-2xl overflow-hidden p-2 bg-slate-50">
                      <AttachmentPreview src={selectedExpenseDetail.comprovante} label={`Recibo - ${selectedExpenseDetail.tipo}`} className="!h-48 border border-slate-200 bg-white" />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 font-bold">
                  <button 
                    onClick={() => { setIsDetailModalOpen(false); setSelectedExpenseDetail(null); }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                  >
                    Fechar Detalhes
                  </button>
                  <button 
                    onClick={() => setIsEditingExpense(true)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 flex items-center justify-center gap-1.5"
                  >
                    <Edit size={14} />
                    Editar Lançamento
                  </button>
                </div>
              </div>
            ) : (
              // Edit Mode
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-750 mb-1.5">Caminhão</label>
                    <select 
                      value={editExpenseForm.truckId}
                      onChange={e => setEditExpenseForm({...editExpenseForm, truckId: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-slate-700"
                    >
                      <option value="">Selecione...</option>
                      {data.trucks.map((t: any) => (
                        <option key={t.id} value={t.placa}>{t.placa} - {t.modelo}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-750 mb-1.5">Tipo de Despesa</label>
                    <select 
                      value={editExpenseForm.tipo}
                      onChange={e => setEditExpenseForm({...editExpenseForm, tipo: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-slate-700"
                    >
                      <option value="">Selecione...</option>
                      {categoriesSaida.filter((cat: string) => !isCombustivelByTipo(cat)).map((cat: string) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-750 mb-1.5">Data</label>
                    <input 
                      type="date" 
                      value={editExpenseForm.data}
                      onChange={e => setEditExpenseForm({...editExpenseForm, data: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none text-xs text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-750 mb-1.5">Valor (R$)</label>
                    <input 
                      type="text" 
                      value={editExpenseForm.valor ? maskBRL(editExpenseForm.valor) : ""}
                      onChange={e => {
                        const masked = maskBRL(e.target.value);
                        setEditExpenseForm({...editExpenseForm, valor: masked ? String(unmaskBRL(masked)) : ""});
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold font-mono focus:outline-none text-xs text-slate-700"
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-750 mb-1.5">KM (Odômetro)</label>
                    <input 
                      type="number" 
                      value={editExpenseForm.km}
                      onChange={e => setEditExpenseForm({...editExpenseForm, km: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold font-mono focus:outline-none text-xs text-slate-700"
                      placeholder="Ex: 125400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-750 mb-1.5">Empresa / Destinatário da Despesa</label>
                  <select
                    value={editExpenseForm.expenseCompanyId}
                    onChange={e => {
                      const id = e.target.value;
                      if (id === "manual") {
                        setEditExpenseForm({
                          ...editExpenseForm,
                          expenseCompanyId: "manual",
                          empresaDespesa: ""
                        });
                      } else {
                        const matched = (data?.expense_companies || []).find((ec: any) => ec.id === id);
                        setEditExpenseForm({
                          ...editExpenseForm,
                          expenseCompanyId: id,
                          empresaDespesa: matched ? matched.nome : ""
                        });
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none text-xs text-slate-700"
                  >
                    <option value="">Nenhuma / Não especificada</option>
                    <option value="manual">✍️ Digitar manualmente...</option>
                    {(data?.expense_companies || []).map((ec: any) => (
                      <option key={ec.id} value={ec.id}>
                        🏢 {ec.nome} {ec.cnpj ? `(CNPJ: ${ec.cnpj})` : ''} {ec.cidade ? `- ${ec.cidade}/${ec.uf}` : ''}
                      </option>
                    ))}
                  </select>

                  {editExpenseForm.expenseCompanyId === "manual" && (
                    <div className="mt-2.5">
                      <input
                        type="text"
                        value={editExpenseForm.empresaDespesa}
                        onChange={e => setEditExpenseForm({...editExpenseForm, empresaDespesa: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none text-xs text-slate-700 focus:ring-2 focus:ring-blue-500/10"
                        placeholder="Digite o nome do credor / empresa destinatária"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-750 mb-1.5">Observação (Opcional)</label>
                  <textarea 
                    value={editExpenseForm.obs}
                    onChange={e => setEditExpenseForm({...editExpenseForm, obs: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold text-slate-600 focus:outline-none h-20 resize-none text-xs text-slate-700"
                  />
                </div>

                <div className="relative border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-4 text-center hover:border-blue-500 hover:bg-blue-50/10 transition-all cursor-pointer">
                  <input 
                    type="file"
                    accept="image/*,application/pdf"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        compressAndSetFile(file, (base64) => {
                          setEditExpenseForm({ ...editExpenseForm, comprovante: base64 });
                        });
                      }
                    }}
                  />
                  {editExpenseForm.comprovante ? (
                    <div className="flex items-center gap-2">
                      {editExpenseForm.comprovante.startsWith('data:application/pdf') ? (
                        <FileText className="text-red-500 w-8 h-8 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded overflow-hidden border bg-slate-150 shrink-0">
                          <img src={editExpenseForm.comprovante} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="text-left animate-fade-in">
                        <span className="text-xs font-bold text-emerald-650 flex items-center gap-1">
                          <CheckCircle size={14} /> Documento anexado!
                        </span>
                        <p className="text-[10px] text-slate-400">Clique ou arraste outro para substituir</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Camera size={20} />
                      <span className="text-[10px] font-black uppercase tracking-wider">Substituir Comprovante Oficial (Foto ou PDF)</span>
                    </>
                  )}
                </div>

                <div className="flex gap-3 pt-4 font-bold">
                  <button 
                    onClick={() => setIsEditingExpense(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                  >
                    Voltar
                  </button>
                  <button 
                    onClick={handleUpdateExpense}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal to Add/Edit Expense Company */}
      <Modal 
        isOpen={isCompanyModalOpen} 
        onClose={() => setIsCompanyModalOpen(false)} 
        title={selectedCompany ? "Editar Empresa / Credor" : "Cadastrar Nova Empresa / Credor"}
      >
        <div className="space-y-4 font-sans text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1.5">Razão Social / Nome Fantasia *</label>
            <input 
              type="text"
              value={companyForm.nome}
              onChange={e => setCompanyForm({...companyForm, nome: e.target.value})}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
              placeholder="Ex: Auto Posto Shell, Mecânica Silva, etc."
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1.5">CNPJ (Opcional)</label>
            <input 
              type="text"
              value={companyForm.cnpj}
              onChange={e => setCompanyForm({...companyForm, cnpj: e.target.value})}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800 font-mono"
              placeholder="Ex: 00.000.000/0001-00"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">Cidade (Opcional)</label>
              <input 
                type="text"
                value={companyForm.cidade}
                onChange={e => setCompanyForm({...companyForm, cidade: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                placeholder="Ex: São Paulo"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">UF (Opcional)</label>
              <input 
                type="text"
                value={companyForm.uf}
                maxLength={2}
                onChange={e => setCompanyForm({...companyForm, uf: e.target.value.toUpperCase()})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                placeholder="Ex: SP"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button 
              onClick={() => setIsCompanyModalOpen(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-250 font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveCompany}
              disabled={!companyForm.nome || isSavingCompany}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold disabled:opacity-50 transition-all cursor-pointer shadow-lg shadow-blue-100"
            >
              {isSavingCompany ? "Salvando..." : "Salvar Empresa"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de Confirmação de Exclusão */}
      <Modal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Confirmar Exclusão"
      >
        <div className="space-y-4 font-sans text-xs text-slate-700">
          <p className="text-sm font-medium leading-relaxed">
            Tem certeza que deseja remover esta despesa administrativa?
          </p>
          <p className="text-slate-400 bg-slate-50 border border-slate-100 p-3 rounded-xl leading-relaxed">
            ⚠️ <strong>Aviso importante:</strong> Esta ação é definitiva e também excluirá o lançamento correspondente do fluxo de caixa e relatórios financeiros associados.
          </p>
          <div className="flex gap-3 pt-4 border-t border-slate-100 font-bold">
            <button
              onClick={() => setDeleteConfirmId(null)}
              className="flex-1 px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => deleteConfirmId && handleDeleteExpense(deleteConfirmId)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
            >
              Excluir Definitivamente
            </button>
          </div>
        </div>
      </Modal>

      {/* Nova Conta a Pagar Modal */}
      {isBillModalOpen && (
        <Modal isOpen={isBillModalOpen} onClose={() => setIsBillModalOpen(false)} title="Cadastrar Nova Conta a Pagar">
          <form onSubmit={handleAddBillSubmit} className="space-y-4 font-sans text-xs">
            <div className="space-y-1">
              <label className="font-bold text-slate-700">Descrição / Título da Conta *</label>
              <input 
                type="text"
                required
                placeholder="Ex: Parcela de Caminhão Scania"
                value={newBill.descricao}
                onChange={e => setNewBill({ ...newBill, descricao: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Caminhão Placa (Opcional)</label>
                <select
                  value={newBill.truckId}
                  onChange={e => setNewBill({ ...newBill, truckId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                >
                  <option value="">Geral / Administrativo</option>
                  {(data?.trucks || []).map((t: any) => (
                    <option key={t.id} value={t.placa}>{t.placa} ({t.modelo || "Sem Modelo"})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Categoria de Gasto *</label>
                <select
                  required
                  value={newBill.categoria}
                  onChange={e => setNewBill({ ...newBill, categoria: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                >
                  <option value="">Selecione...</option>
                  {categoriesSaida.map((cat: string) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Recorrência / Frequência *</label>
                <select
                  value={newBill.recorrencia}
                  onChange={e => setNewBill({ ...newBill, recorrencia: e.target.value, parcelas: e.target.value === 'unico' ? '1' : '12' })}
                  className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                >
                  <option value="unico">Único (À Vista / Vencimento Único)</option>
                  <option value="parcelado_mes">Parcelamento Mensal (Por Mês)</option>
                  <option value="parcelado_semana">Parcelamento Semanal (Por Semana)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Data do 1º Vencimento *</label>
                <input 
                  type="date"
                  required
                  value={newBill.vencimento}
                  onChange={e => setNewBill({ ...newBill, vencimento: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                />
              </div>
            </div>

            {newBill.recorrencia === 'unico' ? (
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Valor Total *</label>
                <input 
                  type="text"
                  required
                  placeholder="R$ 0,00"
                  value={newBill.valorTotal}
                  onChange={e => setNewBill({ ...newBill, valorTotal: maskBRL(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-blue-600"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Qtd de Parcelas *</label>
                  <input 
                    type="number"
                    required
                    min="2"
                    max="120"
                    value={newBill.parcelas}
                    onChange={e => setNewBill({ ...newBill, parcelas: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Valor de Cada Parcela *</label>
                  <input 
                    type="text"
                    required
                    placeholder="R$ 0,00"
                    value={newBill.valorParcela}
                    onChange={e => setNewBill({ ...newBill, valorParcela: maskBRL(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-amber-600"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="font-bold text-slate-700">Observações adicionais</label>
              <textarea 
                placeholder="Alguma anotação sobre esta conta..."
                rows={2}
                value={newBill.observacao}
                onChange={e => setNewBill({ ...newBill, observacao: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button 
                type="button"
                onClick={() => setIsBillModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition font-bold"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={isSavingBill}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-bold shadow-lg shadow-blue-100 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSavingBill ? "Salvando..." : "Cadastrar Conta"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmar Pagamento Modal */}
      {isPayingBillModalOpen && (
        <Modal isOpen={isPayingBillModalOpen} onClose={() => setIsPayingBillModalOpen(false)} title="Confirmar Pagamento de Conta">
          <div className="space-y-4 font-sans text-xs text-slate-700">
            <p className="text-slate-600 font-semibold leading-relaxed">
              Você está registrando o pagamento para: <strong className="text-slate-800">{selectedBillForPayment?.descricao}</strong>
            </p>
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex items-center justify-between font-mono">
              <span className="font-bold text-slate-600">Valor da Parcela:</span>
              <span className="font-black text-emerald-600 text-sm">
                R$ {selectedBillForPayment?.valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">Data da Quitação / Pagamento *</label>
              <input 
                type="date"
                required
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
              />
            </div>

            <div className="flex gap-2.5 pt-2 font-bold">
              <button 
                type="button"
                onClick={() => setIsPayingBillModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmPayment}
                disabled={isSavingBill}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-lg shadow-emerald-100 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSavingBill ? "Processando..." : "Quitar Lançamento"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
