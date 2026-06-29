import React, { useState } from 'react';
import { 
  User, 
  Users, 
  Phone, 
  Mail, 
  FileText, 
  Calendar, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Activity,
  Shield,
  CreditCard,
  TrendingUp,
  MapPin,
  DollarSign,
  Truck as TruckIcon,
  Printer,
  ChevronRight,
  TrendingDown,
  Clock
} from 'lucide-react';
import Modal from './ui/Modal';
import { cn } from '../lib/utils';

interface DriversProps {
  data: any;
  onUpdate: () => void;
}

export default function Drivers({ data, onUpdate }: DriversProps) {
  const [isNewDriverModalOpen, setIsNewDriverModalOpen] = useState(false);
  const [isEditDriverModalOpen, setIsEditDriverModalOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Reporting States
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportingDriver, setReportingDriver] = useState<any>(null);
  const [startDate, setStartDate] = useState('2026-04-01');
  const [endDate, setEndDate] = useState('2026-06-30');

  // Form states
  const [driverForm, setDriverForm] = useState({
    nome: '',
    cpf: '',
    cnh: '',
    categoriaCnh: 'E',
    vencimentoCnh: '',
    telefone: '',
    email: '',
    status: 'Ativo'
  });

  if (!data) return null;

  const driversList = data.drivers || [];

  // Track validity status for driver's licenses
  const processedDrivers = driversList.map((driver: any) => {
    let cnhStatus = 'Regular';
    let diffDays = 0;

    if (driver.vencimentoCnh) {
      const expirationTime = new Date(driver.vencimentoCnh).getTime();
      const currentTime = new Date().getTime();
      diffDays = Math.ceil((expirationTime - currentTime) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        cnhStatus = 'Vencida';
      } else if (diffDays <= 30) {
        cnhStatus = 'Vencendo Breve';
      }
    }

    return {
      ...driver,
      cnhStatus,
      diffDays
    };
  });

  // Filters
  const filteredDrivers = processedDrivers.filter((driver: any) => {
    const matchesSearch = !searchTerm || 
      driver.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.cpf.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.cnh.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = !filterStatus || driver.status === filterStatus;
    const matchesCategory = !filterCategory || driver.categoriaCnh === filterCategory;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Stats Counters
  const countTotal = processedDrivers.length;
  const countAtivos = processedDrivers.filter((d: any) => d.status === 'Ativo').length;
  const countEmViagem = processedDrivers.filter((d: any) => d.status === 'Em Viagem').length;
  const countCnhAlerta = processedDrivers.filter((d: any) => d.cnhStatus !== 'Regular').length;

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverForm.nome || !driverForm.cpf || !driverForm.cnh || !driverForm.vencimentoCnh) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      const companyId = data?.company?.id || 'comp_1';
      const response = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...driverForm,
          companyId
        })
      });

      if (response.ok) {
        setIsNewDriverModalOpen(false);
        // Reset form
        setDriverForm({
          nome: '',
          cpf: '',
          cnh: '',
          categoriaCnh: 'E',
          vencimentoCnh: '',
          telefone: '',
          email: '',
          status: 'Ativo'
        });
        onUpdate();
      } else {
        alert("Erro ao registrar motorista.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao conectar com o servidor.");
    }
  };

  const handleEditDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriver) return;

    try {
      const response = await fetch(`/api/drivers/${selectedDriver.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driverForm)
      });

      if (response.ok) {
        setIsEditDriverModalOpen(false);
        setSelectedDriver(null);
        onUpdate();
      } else {
        alert("Erro ao atualizar dados.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteDriver = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir o cadastro deste motorista?")) {
      return;
    }

    try {
      const response = await fetch(`/api/drivers/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        onUpdate();
      } else {
        alert("Erro ao excluir motorista.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (driver: any) => {
    setSelectedDriver(driver);
    setDriverForm({
      nome: driver.nome,
      cpf: driver.cpf,
      cnh: driver.cnh,
      categoriaCnh: driver.categoriaCnh,
      vencimentoCnh: driver.vencimentoCnh,
      telefone: driver.telefone,
      email: driver.email,
      status: driver.status
    });
    setIsEditDriverModalOpen(true);
  };

  const openNewDriverModal = () => {
    setDriverForm({
      nome: '',
      cpf: '',
      cnh: '',
      categoriaCnh: 'E',
      vencimentoCnh: '',
      telefone: '',
      email: '',
      status: 'Ativo'
    });
    setIsNewDriverModalOpen(true);
  };

  function formatCPF(val: string) {
    return val
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  }

  function formatPhone(val: string) {
    return val
      .replace(/\D/g, '')
      .replace(/^(\d{2})(\d)/g, '($1) $2')
      .replace(/(\d)(\d{4})$/, '$1-$2');
  }

  // Calculate detailed timeline metrics for a driver during a chosen date range
  const getDriverReportData = (driverId: string) => {
    const freights = (data.freights || []).filter((f: any) => {
      const isMatch = f.driverId === driverId;
      if (!isMatch) return false;
      if (!f.data) return true;
      return f.data >= startDate && f.data <= endDate;
    });

    const totalGrossRevenue = freights.reduce((acc: number, f: any) => acc + Number(f.valorBruto || 0), 0);
    const totalDriverDailyRates = freights.reduce((acc: number, f: any) => acc + Number(f.motorista || 0), 0);
    const totalFuelUsedFromFreight = freights.reduce((acc: number, f: any) => acc + Number(f.combustivel || 0), 0);
    const totalTollsFromFreight = freights.reduce((acc: number, f: any) => acc + Number(f.pedagio || 0), 0);

    return {
      freights,
      totalGrossRevenue,
      totalDriverDailyRates,
      totalFuelUsedFromFreight,
      totalTollsFromFreight,
      cargoCount: freights.length,
      activeDays: Array.from(new Set(freights.map((f: any) => f.data))).length
    };
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Upper header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Cadastro de Motoristas</h2>
          <p className="text-sm text-slate-500 font-medium font-sans">Gerenciamento completo do perfil, contatos, validade de CNH e relatórios cronológicos de diária</p>
        </div>
        <button 
          onClick={openNewDriverModal}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
        >
          <Plus size={20} />
          Novo Motorista
        </button>
      </div>

      {/* Driver State Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-500">
            <Users size={24} />
          </div>
          <div>
            <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Total Cadastrado</p>
            <p className="text-2xl font-black text-slate-800">{countTotal}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Disponíveis / Ativos</p>
            <p className="text-2xl font-black text-emerald-600">{countAtivos}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Em Viagem / Rota</p>
            <p className="text-2xl font-black text-blue-600">{countEmViagem}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center",
            countCnhAlerta > 0 ? "bg-rose-50 text-rose-500" : "bg-slate-50 text-slate-400"
          )}>
            <Shield size={24} />
          </div>
          <div>
            <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">CNH Vencendo / Vencida</p>
            <p className={cn("text-2xl font-black", countCnhAlerta > 0 ? "text-rose-600" : "text-slate-800")}>
              {countCnhAlerta}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Options */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por nome, CPF, CNH ou email..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-2xs"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 focus:outline-none shadow-2xs"
        >
          <option value="">Todos os Status</option>
          <option value="Ativo">Ativo / Disponível</option>
          <option value="Em Viagem">Em Viagem</option>
          <option value="Inativo">Inativo</option>
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 focus:outline-none shadow-2xs"
        >
          <option value="">Todas as Categorias CNH</option>
          <option value="C">Categoria C</option>
          <option value="D">Categoria D</option>
          <option value="E">Categoria E</option>
        </select>
      </div>

      {/* Drivers List Card Visual */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDrivers.length === 0 ? (
          <div className="col-span-full bg-white rounded-3xl border border-slate-200 py-16 text-center shadow-xs">
            <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <User size={28} />
            </div>
            <h4 className="text-base font-bold text-slate-700">Nenhum motorista encontrado</h4>
            <p className="text-sm text-slate-400 mt-1">Nenhum cadastro atende aos parâmetros de busca selecionados.</p>
          </div>
        ) : (
          filteredDrivers.map((driver: any) => {
            const isVencida = driver.cnhStatus === 'Vencida';
            const isVencendoBreve = driver.cnhStatus === 'Vencendo Breve';

            return (
              <div 
                key={driver.id}
                className={cn(
                  "bg-white rounded-3xl border shadow-sm p-6 flex flex-col justify-between gap-5 transition-all hover:shadow-md relative overflow-hidden",
                  isVencida ? "border-red-200" :
                  isVencendoBreve ? "border-amber-200" :
                  "border-slate-200"
                )}
              >
                {/* Accent validity banner at bottom of card */}
                {isVencida && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-red-500" />
                )}
                {isVencendoBreve && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                )}

                {/* Info block */}
                <div className="space-y-4">
                  {/* Avatar and status header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-150 rounded-xl flex items-center justify-center text-slate-600 font-extrabold font-sans">
                        {driver.nome?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-slate-800 leading-tight">{driver.nome}</h4>
                        <span className="text-[10px] font-mono tracking-wider font-bold text-slate-400 uppercase">CPF: {driver.cpf}</span>
                      </div>
                    </div>

                    <span className={cn(
                      "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-full border",
                      driver.status === 'Ativo' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                      driver.status === 'Em Viagem' ? "bg-blue-50 text-blue-700 border-blue-100" :
                      "bg-slate-100 text-slate-600 border-slate-200"
                    )}>
                      {driver.status}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-slate-100 my-2" />

                  {/* Tech specs license section */}
                  <div className="bg-slate-50/50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-bold flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                        <CreditCard size={12} /> CNH Registro
                      </span>
                      <span className="font-mono text-slate-800 font-bold">{driver.cnh} (Cat. {driver.categoriaCnh})</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-bold flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                        <Calendar size={12} /> CNH Expirando
                      </span>
                      <span className={cn(
                        "font-bold font-sans",
                        isVencida ? "text-red-600" :
                        isVencendoBreve ? "text-amber-600" :
                        "text-slate-700"
                      )}>
                        {driver.vencimentoCnh ? new Date(driver.vencimentoCnh).toLocaleDateString('pt-BR') : '---'}
                      </span>
                    </div>

                    {/* Show warnings */}
                    {isVencida && (
                      <div className="bg-red-50 text-red-700 p-2 rounded-lg text-[11px] font-bold flex items-center gap-1">
                        <AlertCircle size={14} />
                        CNH Vencida há {Math.abs(driver.diffDays)} dia(s)
                      </div>
                    )}
                    {isVencendoBreve && (
                      <div className="bg-amber-50 text-amber-700 p-2 rounded-lg text-[11px] font-bold flex items-center gap-1">
                        <AlertCircle size={14} />
                        Expira em {driver.diffDays} dia(s)!
                      </div>
                    )}
                  </div>

                  {/* Contacts */}
                  <div className="space-y-1.5 text-xs text-slate-500 font-medium">
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="text-slate-400" />
                      <span>{driver.telefone || 'Telefone não inserido'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail size={13} className="text-slate-400" />
                      <span className="truncate">{driver.email || 'E-mail não inserido'}</span>
                    </div>
                  </div>
                </div>

                {/* Footer action buttons */}
                <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  {/* GENERATE PERIODIC DATES REPORT CARD ACTION */}
                  <button
                    onClick={() => {
                      setReportingDriver(driver);
                      setIsReportModalOpen(true);
                    }}
                    className="flex-1 px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100/80 rounded-xl transition-all font-bold text-xs flex items-center justify-center gap-1.5"
                  >
                    <FileText size={14} />
                    <span>Gerar Relatório</span>
                  </button>

                  <div className="flex gap-1.5">
                    <button
                      onClick={() => openEditModal(driver)}
                      className="p-2 border border-slate-200 hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-600 rounded-xl text-slate-400 transition-all flex items-center justify-center"
                      title="Editar Motorista"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteDriver(driver.id)}
                      className="p-2 border border-slate-200 hover:border-rose-200 hover:bg-rose-50/50 hover:text-rose-600 rounded-xl text-slate-400 transition-all flex items-center justify-center"
                      title="Excluir Motorista"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal - Novo Motorista */}
      <Modal isOpen={isNewDriverModalOpen} onClose={() => setIsNewDriverModalOpen(false)} title="Cadastrar Novo Motorista">
        <form onSubmit={handleCreateDriver} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nome Completo</label>
            <input 
              type="text" 
              placeholder="Ex: Carlos Heitor Fernandes"
              value={driverForm.nome}
              onChange={e => setDriverForm({...driverForm, nome: e.target.value})}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">CPF</label>
              <input 
                type="text" 
                placeholder="000.000.000-00"
                value={driverForm.cpf}
                onChange={e => setDriverForm({...driverForm, cpf: formatCPF(e.target.value)})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Registro CNH</label>
              <input 
                type="text" 
                placeholder="Nº da habilitação"
                value={driverForm.cnh}
                onChange={e => setDriverForm({...driverForm, cnh: e.target.value.replace(/\D/g, '')})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Categoria CNH</label>
              <select 
                value={driverForm.categoriaCnh}
                onChange={e => setDriverForm({...driverForm, categoriaCnh: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="C">Categoria C (Caminhão simples)</option>
                <option value="D">Categoria D (Ônibus/Micro)</option>
                <option value="E">Categoria E (Articulado/Carreta)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Vencimento CNH</label>
              <input 
                type="date" 
                value={driverForm.vencimentoCnh}
                onChange={e => setDriverForm({...driverForm, vencimentoCnh: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Telefone Celular</label>
              <input 
                type="text" 
                placeholder="(00) 00000-0000"
                value={driverForm.telefone}
                onChange={e => setDriverForm({...driverForm, telefone: formatPhone(e.target.value)})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">E-mail</label>
              <input 
                type="email" 
                placeholder="nome@gbfleet.ai"
                value={driverForm.email}
                onChange={e => setDriverForm({...driverForm, email: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Status Operacional</label>
            <select 
              value={driverForm.status}
              onChange={e => setDriverForm({...driverForm, status: e.target.value})}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none"
            >
              <option value="Ativo">Ativo / Disponível</option>
              <option value="Em Viagem">Em Viagem</option>
              <option value="Inativo">Inativo</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button 
              type="button" 
              onClick={() => setIsNewDriverModalOpen(false)}
              className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors text-sm"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm"
            >
              Salvar Motorista
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal - Editar Motorista */}
      <Modal isOpen={isEditDriverModalOpen} onClose={() => setIsEditDriverModalOpen(false)} title="Editar Cadastro de Motorista">
        {selectedDriver && (
          <form onSubmit={handleEditDriver} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Nome Completo</label>
              <input 
                type="text" 
                placeholder="Ex: Carlos Heitor Fernandes"
                value={driverForm.nome}
                onChange={e => setDriverForm({...driverForm, nome: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">CPF</label>
                <input 
                  type="text" 
                  placeholder="000.000.000-00"
                  value={driverForm.cpf}
                  onChange={e => setDriverForm({...driverForm, cpf: formatCPF(e.target.value)})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Registro CNH</label>
                <input 
                  type="text" 
                  placeholder="Nº da habilitação"
                  value={driverForm.cnh}
                  onChange={e => setDriverForm({...driverForm, cnh: e.target.value.replace(/\D/g, '')})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Categoria CNH</label>
                <select 
                  value={driverForm.categoriaCnh}
                  onChange={e => setDriverForm({...driverForm, categoriaCnh: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="C">Categoria C (Caminhão simples)</option>
                  <option value="D">Categoria D (Ônibus/Micro)</option>
                  <option value="E">Categoria E (Articulado/Carreta)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Vencimento CNH</label>
                <input 
                  type="date" 
                  value={driverForm.vencimentoCnh}
                  onChange={e => setDriverForm({...driverForm, vencimentoCnh: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Telefone Celular</label>
                <input 
                  type="text" 
                  placeholder="(00) 00000-0000"
                  value={driverForm.telefone}
                  onChange={e => setDriverForm({...driverForm, telefone: formatPhone(e.target.value)})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">E-mail</label>
                <input 
                  type="email" 
                  placeholder="nome@gbfleet.ai"
                  value={driverForm.email}
                  onChange={e => setDriverForm({...driverForm, email: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Status Operacional</label>
              <select 
                value={driverForm.status}
                onChange={e => setDriverForm({...driverForm, status: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none"
              >
                <option value="Ativo">Ativo / Disponível</option>
                <option value="Em Viagem">Em Viagem</option>
                <option value="Inativo">Inativo</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setIsEditDriverModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* DYNAMIC RANGE DETAILED DRIVER REPORT MODAL */}
      <Modal 
        isOpen={isReportModalOpen} 
        onClose={() => {
          setIsReportModalOpen(false);
          setReportingDriver(null);
        }} 
        title={`Relatório Operacional do Motorista`}
        size="large"
      >
        {reportingDriver && (() => {
          const report = getDriverReportData(reportingDriver.id);

          return (
            <div className="space-y-6">
              {/* Filter controls inside report view */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Período de Análise do Relatório</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Data Inicial</label>
                    <input 
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Data Final</label>
                    <input 
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Print ready container wrapper */}
              <div id="print-area" className="p-6 bg-white border border-slate-200 rounded-3xl space-y-6 shadow-2xs">
                {/* Header title */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold font-mono uppercase bg-blue-50 text-blue-700 px-3 py-1 rounded-full">{reportingDriver.status}</span>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight mt-2">{reportingDriver.nome}</h3>
                    <p className="text-xs text-slate-500 font-bold">CNH {reportingDriver.cnh} (Cat. {reportingDriver.categoriaCnh}) • CPF {reportingDriver.cpf}</p>
                  </div>
                  <div className="text-left sm:text-right text-xs">
                    <p className="text-slate-400 font-bold uppercase tracking-wider">Período</p>
                    <p className="font-extrabold text-slate-800 font-sans mt-0.5">
                      {new Date(startDate).toLocaleDateString('pt-BR')} à {new Date(endDate).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                {/* Primary dynamic calculations metric block */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left">
                    <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block mb-1">Faturamento Bruto</span>
                    <span className="text-lg font-black text-slate-900">R$ {report.totalGrossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left">
                    <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block mb-1">Rendimento Diárias</span>
                    <span className="text-lg font-black text-emerald-600">R$ {report.totalDriverDailyRates.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left">
                    <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block mb-1">Combustível Viagem</span>
                    <span className="text-lg font-black text-amber-600">R$ {report.totalFuelUsedFromFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left">
                    <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block mb-1">Viagens Rodadas</span>
                    <span className="text-lg font-black text-blue-600">{report.cargoCount} Fretes</span>
                  </div>
                </div>

                {/* Freight travel ledger list */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">Detalhamento das Viagens Realizadas pelo Motorista</h4>
                  {report.freights.length === 0 ? (
                    <div className="py-12 text-center bg-slate-50 rounded-2xl border border-slate-150 text-slate-400 text-xs italic">
                      Nenhuma viagem de frete foi associada a este motorista neste período.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 bg-white border border-slate-150 rounded-2xl overflow-hidden text-xs">
                      {report.freights.map((f: any) => (
                        <div key={f.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/40">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-extrabold text-[9px] uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                {f.status}
                              </span>
                              <span className="text-slate-400 font-medium">{new Date(f.data + "T00:00:00").toLocaleDateString('pt-BR')}</span>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-500 font-bold flex items-center gap-1">
                                <TruckIcon size={12} /> Placa: {f.truckId}
                              </span>
                            </div>
                            <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                              <MapPin size={14} className="text-slate-400" />
                              <span>{f.origem}</span>
                              <span className="text-slate-300">→</span>
                              <span className="text-blue-600">{f.destino}</span>
                            </div>
                          </div>
                          
                          <div className="text-right grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Frete Bruto</p>
                              <p className="font-black text-slate-800">R$ {f.valorBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-emerald-600 font-bold uppercase">Diária Mot.</p>
                              <p className="font-black text-emerald-600">R$ {(f.motorista || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons (Print / Export) */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  onClick={() => {
                    setIsReportModalOpen(false);
                    setReportingDriver(null);
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs uppercase font-extrabold tracking-wider bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={handlePrint}
                  className="px-5 py-2.5 rounded-xl text-xs uppercase font-extrabold tracking-wider bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg shadow-blue-200"
                >
                  <Printer size={16} />
                  <span>Imprimir Relatório</span>
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
