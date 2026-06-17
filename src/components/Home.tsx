import React from 'react';
import { 
  DollarSign, 
  Route, 
  Fuel, 
  Receipt, 
  Wrench, 
  Calculator, 
  Users, 
  Truck, 
  ArrowRight,
  TrendingUp,
  Activity
} from 'lucide-react';
import { cn } from '../lib/utils';

interface HomeProps {
  data: any;
  onNavigate?: (tab: string) => void;
  currentUser?: any;
}

export default function Home({ data, onNavigate, currentUser }: HomeProps) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 font-medium font-sans">
        Carregando atalhos operacionais...
      </div>
    );
  }

  // Calculate dynamic contexts to display on buttons
  const activeAlertsCount = data.maintenance_alerts ? data.maintenance_alerts.filter((a: any) => a.status === 'pendente').length : 0;
  const trucksCount = data.trucks ? data.trucks.length : 0;
  const driversInTransit = data.drivers ? data.drivers.filter((d: any) => d.status === 'Em Viagem').length : 0;
  
  // Format last entry dates
  const formatCompactDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
      }
      return dateStr;
    } catch {
      return '';
    }
  };

  const lastFuel = data.fuel_logs && data.fuel_logs.length > 0 ? data.fuel_logs[data.fuel_logs.length - 1] : null;
  const lastCash = data.cash_flow && data.cash_flow.length > 0 ? data.cash_flow[data.cash_flow.length - 1] : null;

  const actionCategories = [
    {
      title: "Logística & Fretes",
      subtitle: "Gestão operacional de viagens e rotas executadas",
      actions: [
        {
          id: 'freights',
          title: "Gastos com Fretes",
          description: "Registrar fretes e rateamento de custos por rota",
          icon: Route,
          color: "indigo",
          badge: data.freights?.length > 0 ? `${data.freights.length} Viagens` : "Novo",
          actionText: "Faturar viagem"
        },
        {
          id: 'fuel',
          title: "Abastecimento",
          description: "Lançar litros, quilometragem e postos de combustível",
          icon: Fuel,
          color: "amber",
          badge: lastFuel ? `Último: ${formatCompactDate(lastFuel.data)}` : "Iniciar",
          actionText: "Registrar diesel"
        },
        {
          id: 'simulator',
          title: "Simulador de Custo",
          description: "Estimar lucro líquido, pedágios e combustível para novas rotas",
          icon: Calculator,
          color: "emerald",
          badge: "Planejamento",
          actionText: "Simular rota"
        }
      ]
    },
    {
      title: "Financeiro & Manutenção",
      subtitle: "Fluxo de caixa de suporte e conservação da frota",
      actions: [
        {
          id: 'cash',
          title: "Movimentação Geral",
          description: "Registrar lançamentos de entrada ou provisões no caixa",
          icon: DollarSign,
          color: "blue",
          badge: lastCash ? `Último: R$ ${Number(lastCash.valor).toFixed(0)}` : "Gerenciar",
          actionText: "Novo lançamento"
        },
        {
          id: 'expenses',
          title: "Despesas & Oficina",
          description: "Custos indiretos, insumos de escritório, multas e oficina",
          icon: Receipt,
          color: "rose",
          badge: data.expenses ? `${data.expenses.length} Notas` : "Registrar",
          actionText: "Registrar nota"
        },
        {
          id: 'maintenance',
          title: "Plano de Manutenção",
          description: "Visualizar e finalizar alertas de trocas mecânicas",
          icon: Wrench,
          color: "orange",
          badge: activeAlertsCount > 0 ? `${activeAlertsCount} Alertas` : "Tudo Ok",
          badgeAlert: activeAlertsCount > 0,
          actionText: "Ver alertas"
        }
      ]
    },
    {
      title: "Cadastros Fundamentais",
      subtitle: "Configuração de frota física e colaboradores",
      actions: [
        {
          id: 'trucks',
          title: "Gerenciar Frota",
          description: "Configurar caminhões, placas e verificação de Km",
          icon: Truck,
          color: "slate",
          badge: trucksCount > 0 ? `${trucksCount} Ativos` : "Cadastrar",
          actionText: "Ver veículos"
        },
        {
          id: 'drivers',
          title: "Motoristas",
          description: "Histórico de condutores, filiação e status atual",
          icon: Users,
          color: "sky",
          badge: driversInTransit > 0 ? `${driversInTransit} Em Viagem` : "Gerenciar",
          actionText: "Ver motoristas"
        }
      ]
    }
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'indigo':
        return {
          bg: 'bg-indigo-50 border-indigo-100',
          hoverBg: 'hover:border-indigo-300 hover:bg-indigo-50/20',
          iconBg: 'bg-indigo-100 text-indigo-700',
          text: 'text-indigo-800',
          badge: 'bg-indigo-50 text-indigo-700 border-indigo-200'
        };
      case 'amber':
        return {
          bg: 'bg-amber-50 border-amber-100',
          hoverBg: 'hover:border-amber-300 hover:bg-amber-50/20',
          iconBg: 'bg-amber-100 text-amber-700',
          text: 'text-amber-800',
          badge: 'bg-amber-50 text-amber-700 border-amber-200'
        };
      case 'emerald':
        return {
          bg: 'bg-emerald-50 border-emerald-100',
          hoverBg: 'hover:border-emerald-300 hover:bg-emerald-50/20',
          iconBg: 'bg-emerald-100 text-emerald-700',
          text: 'text-emerald-800',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-200'
        };
      case 'blue':
        return {
          bg: 'bg-blue-50 border-blue-100',
          hoverBg: 'hover:border-blue-300 hover:bg-blue-50/20',
          iconBg: 'bg-blue-100 text-blue-700',
          text: 'text-blue-800',
          badge: 'bg-blue-50 text-blue-700 border-blue-200'
        };
      case 'rose':
        return {
          bg: 'bg-rose-50 border-rose-100',
          hoverBg: 'hover:border-rose-300 hover:bg-rose-50/20',
          iconBg: 'bg-rose-100 text-rose-700',
          text: 'text-rose-800',
          badge: 'bg-rose-50 text-rose-700 border-rose-200'
        };
      case 'orange':
        return {
          bg: 'bg-orange-50 border-orange-100',
          hoverBg: 'hover:border-orange-300 hover:bg-orange-50/20',
          iconBg: 'bg-orange-100 text-orange-700',
          text: 'text-orange-800',
          badge: 'bg-orange-50 text-orange-700 border-orange-200'
        };
      case 'sky':
        return {
          bg: 'bg-sky-50 border-sky-100',
          hoverBg: 'hover:border-sky-300 hover:bg-sky-50/20',
          iconBg: 'bg-sky-100 text-sky-700',
          text: 'text-sky-800',
          badge: 'bg-sky-50 text-sky-700 border-sky-200'
        };
      default:
        return {
          bg: 'bg-slate-50 border-slate-100',
          hoverBg: 'hover:border-slate-300 hover:bg-slate-50/20',
          iconBg: 'bg-slate-100 text-slate-700',
          text: 'text-slate-800',
          badge: 'bg-slate-50 text-slate-700 border-slate-200'
        };
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Prime Greeting Section with dynamic details */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-8 rounded-[32px] border border-slate-800 shadow-xl relative overflow-hidden">
        {/* Modern decorative grid */}
        <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-[11px] font-bold tracking-wider text-blue-300 uppercase">
              <Activity size={12} className="animate-pulse" /> Painel de Controle Operacional
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Olá, {currentUser?.nome || 'Operador'}!
            </h2>
            <p className="text-indigo-200 text-sm max-w-xl leading-relaxed">
              Inicie conexões e registros imediatos a partir desta central. Selecione um atalho para ir direto ao formulário em cada aba.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10 shrink-0">
            <div className="text-center px-4 py-1">
              <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider">Frota Cadastrada</p>
              <p className="text-2xl font-black mt-0.5 text-white">{trucksCount}</p>
            </div>
            <div className="h-6 w-[1px] bg-white/10"></div>
            <div className="text-center px-4 py-1">
              <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider">Viagens Ativas</p>
              <p className="text-2xl font-black mt-0.5 text-white">{driversInTransit}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Category Blocks */}
      <div className="space-y-8">
        {actionCategories.map((group, gIdx) => (
          <div key={gIdx} className="space-y-4">
            <div>
              <h3 className="font-extrabold text-slate-800 text-base">{group.title}</h3>
              <p className="text-xs text-slate-500 font-medium">{group.subtitle}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {group.actions.map((act) => {
                const styles = getColorClasses(act.color);
                const IconComp = act.icon;
                return (
                  <div 
                    key={act.id}
                    className={cn(
                      "group bg-white p-6 rounded-3xl border border-slate-200 hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer",
                      styles.hoverBg
                    )}
                    onClick={() => onNavigate?.(act.id)}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className={cn("p-3 rounded-2xl", styles.iconBg)}>
                          <IconComp size={22} />
                        </div>
                        <span className={cn(
                          "px-2.5 py-1 text-[11px] font-bold rounded-full border",
                          act.badgeAlert ? "bg-rose-50 border-rose-200 text-rose-700 animate-pulse" : styles.badge
                        )}>
                          {act.badge}
                        </span>
                      </div>
                      
                      <div>
                        <h4 className="font-extrabold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">
                          {act.title}
                        </h4>
                        <p className="text-slate-500 text-xs mt-1.5 leading-relaxed font-medium">
                          {act.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 group-hover:text-blue-600 transition-colors uppercase tracking-wider">
                        Atalho Rápido
                      </span>
                      <div className="flex items-center gap-1 font-bold text-xs text-blue-600 group-hover:translate-x-1.5 transition-transform duration-200">
                        <span>{act.actionText}</span>
                        <ArrowRight size={14} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
