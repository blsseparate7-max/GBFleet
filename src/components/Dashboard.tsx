import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Fuel, 
  DollarSign, 
  Truck as TruckIcon,
  Receipt,
  Users,
  Activity,
  Wrench,
  CheckCircle,
  Clock,
  ArrowRight,
  Route,
  Calculator
} from 'lucide-react';
import { cn } from '../lib/utils';

const isMaintenanceByTipo = (tipo: string) => {
  const t = (tipo || "").toLowerCase();
  return t.includes("manut") || t.includes("peça") || t.includes("oficina") || t.includes("mecan");
};

const isPedagioByTipo = (tipo: string) => {
  const t = (tipo || "").toLowerCase();
  return t.includes("pedág") || t.includes("pedag");
};

const isCombustivelByTipo = (tipo: string) => {
  const t = (tipo || "").toLowerCase();
  return t.includes("diesel") || t.includes("combust") || t.includes("gasol") || t.includes("abastec");
};

export default function Dashboard({ data, onNavigate }: { data: any, onNavigate?: (tab: string) => void }) {
  if (!data) return <div className="flex items-center justify-center h-full text-slate-500 font-medium font-sans">Carregando dados da frota...</div>;

  // 1. Basic Stats Calculation
  const totalFuel = data.fuel_logs.reduce((acc: number, curr: any) => acc + curr.valor, 0);
  const totalExpenses = data.expenses
    .filter((e: any) => e.documento !== "Auto-Abastecimento")
    .reduce((acc: number, curr: any) => acc + curr.valor, 0);
  const totalSpent = totalFuel + totalExpenses;

  const totalIncome = data.cash_flow
    .filter((f: any) => f.tipo === 'entrada')
    .reduce((acc: number, curr: any) => acc + curr.valor, 0);

  const balance = totalIncome - totalSpent;

  // Net Margin calculation
  const netMargin = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;

  // Active trucks percentage
  const totalTrucksCount = data.trucks.length;
  const activeTrucksCount = data.trucks.filter((t: any) => t.ativo).length;
  const activeTrucksPercentage = totalTrucksCount > 0 ? (activeTrucksCount / totalTrucksCount) * 100 : 0;

  // Driver summary count
  const totalDriversCount = data.drivers.length;
  const travelingDriversCount = data.drivers.filter((d: any) => d.status === 'Em Viagem').length;

  // 2. Cost Category Breakdown for Pie Chart
  const manualDiesel = data.expenses.filter((e: any) => isCombustivelByTipo(e.tipo) && e.documento !== "Auto-Abastecimento").reduce((acc: number, curr: any) => acc + curr.valor, 0);
  const pedagiosValue = data.expenses.filter((e: any) => isPedagioByTipo(e.tipo)).reduce((acc: number, curr: any) => acc + curr.valor, 0);
  const manutencoesValue = data.expenses.filter((e: any) => isMaintenanceByTipo(e.tipo)).reduce((acc: number, curr: any) => acc + curr.valor, 0);
  const outrosValue = data.expenses.filter((e: any) => 
    !isPedagioByTipo(e.tipo) && 
    !isMaintenanceByTipo(e.tipo) && 
    !isCombustivelByTipo(e.tipo)
  ).reduce((acc: number, curr: any) => acc + curr.valor, 0);

  const costBreakdownData = [
    { name: 'Diesel', value: totalFuel + manualDiesel, color: '#3b82f6' },
    { name: 'Pedágios', value: pedagiosValue, color: '#f59e0b' },
    { name: 'Manutenção', value: manutencoesValue, color: '#ef4444' },
    { name: 'Outras Custas', value: outrosValue, color: '#10b981' },
  ].filter(c => c.value > 0);

  // 3. Overall Fleet FUEL Consumption average
  const logsByTruck: { [key: string]: any[] } = {};
  data.fuel_logs.forEach((log: any) => {
    if (!logsByTruck[log.truckId]) {
      logsByTruck[log.truckId] = [];
    }
    logsByTruck[log.truckId].push({ ...log });
  });

  let totalDistanceCombined = 0;
  let totalLitersCombined = 0;

  Object.keys(logsByTruck).forEach((truckId) => {
    const sorted = logsByTruck[truckId].sort((a: any, b: any) => a.km - b.km);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const dist = curr.km - prev.km;
      if (dist > 0 && curr.litros > 0) {
        totalDistanceCombined += dist;
        totalLitersCombined += curr.litros;
      }
    }
  });

  const avgConsumption = totalLitersCombined > 0 
    ? (totalDistanceCombined / totalLitersCombined).toFixed(2)
    : "0.00"; // starting at 0 for clean accounts

  // 4. Monthly Financial Data Grouping (making it dynamic!)
  const groupedMonths: { [key: string]: { entr: number; said: number } } = {
    '01': { entr: 0, said: 0 },
    '02': { entr: 0, said: 0 },
    '03': { entr: 0, said: 0 },
    '04': { entr: 0, said: 0 },
    '05': { entr: 0, said: 0 },
    '06': { entr: 0, said: 0 },
    '07': { entr: 0, said: 0 },
    '08': { entr: 0, said: 0 },
    '09': { entr: 0, said: 0 },
    '10': { entr: 0, said: 0 },
    '11': { entr: 0, said: 0 },
    '12': { entr: 0, said: 0 }
  };

  data.cash_flow.forEach((c: any) => {
    if (!c.data) return;
    const parts = c.data.split('-'); // e.g. 2026-04-15
    if (parts.length >= 2) {
      const m = parts[1];
      if (groupedMonths[m] !== undefined) {
        if (c.tipo === 'entrada') {
          groupedMonths[m].entr += c.valor;
        } else if (c.tipo === 'saida') {
          groupedMonths[m].said += c.valor;
        }
      } else {
        groupedMonths[m] = { 
          entr: c.tipo === 'entrada' ? c.valor : 0, 
          said: c.tipo === 'saida' ? c.valor : 0 
        };
      }
    }
  });

  const monthNames: { [key: string]: string } = {
    '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
    '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
  };

  const monthlyFinancialData = Object.keys(groupedMonths)
    .sort()
    .map(m => ({
      name: monthNames[m] || `Mês ${m}`,
      faturamento: groupedMonths[m].entr,
      despesas: groupedMonths[m].said,
      lucro: Math.max(0, groupedMonths[m].entr - groupedMonths[m].said)
    }));

  // 5. Dynamic Alerts Engine
  const alertsList: any[] = [];
  const todaySimulated = new Date("2026-06-16");

  // A. Check expiring driver CNH within 30 days
  data.drivers.forEach((drv: any) => {
    const vDate = new Date(drv.vencimentoCnh);
    const diffTime = vDate.getTime() - todaySimulated.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      alertsList.push({
        type: 'critical',
        title: `CNH Vencida!`,
        desc: `O motorista ${drv.nome} está com a habilitação vencida desde ${drv.vencimentoCnh}.`,
        icon: Users
      });
    } else if (diffDays <= 30) {
      alertsList.push({
        type: 'warning',
        title: `Vencimento de CNH Próximo`,
        desc: `Motorista ${drv.nome} deve renovar a CNH em ${diffDays} dias (${drv.vencimentoCnh}).`,
        icon: Users
      });
    }
  });

  // B. Check pending high/critical priority maintenance alerts
  data.maintenance_alerts
    .filter((a: any) => a.status === 'Pendente')
    .forEach((a: any) => {
      if (a.prioridade === 'critica') {
        alertsList.push({
          type: 'critical',
          title: `Manutenção Crítica - ${a.truckId}`,
          desc: `${a.tipo} pendente e urgente: ${a.descricao}`,
          icon: Wrench
        });
      } else if (a.prioridade === 'alta') {
        alertsList.push({
          type: 'warning',
          title: `Revisão Pendente - ${a.truckId}`,
          desc: `${a.tipo} programado com prioridade alta: ${a.descricao}`,
          icon: Wrench
        });
      }
    });

  // If no dynamic alerts exist, add fallbacks to show a healthy state
  if (alertsList.length === 0) {
    alertsList.push({
      type: 'info',
      title: "Frota Operando sob Controle",
      desc: "Nenhum sinal crítico de CNH vencida ou manutenção atrasada detectado hoje.",
      icon: CheckCircle
    });
  }

  // 6. Truck Spent & Consumption Ranking
  const truckRanking = data.trucks.map((t: any) => {
    const fuelLogs = data.fuel_logs.filter((l: any) => l.truckId === t.placa);
    const truckExpenses = data.expenses.filter((e: any) => e.truckId === t.placa);
    const totalTruckSpent = fuelLogs.reduce((acc: number, curr: any) => acc + curr.valor, 0) + 
                          truckExpenses.filter((e: any) => e.documento !== "Auto-Abastecimento").reduce((acc: number, curr: any) => acc + curr.valor, 0);
    
    // Calculate custom average for this truck
    const sortedLogs = [...fuelLogs].sort((a: any, b: any) => a.km - b.km);
    let truckDist = 0;
    let truckLiters = 0;
    for (let i = 1; i < sortedLogs.length; i++) {
      const prev = sortedLogs[i - 1];
      const curr = sortedLogs[i];
      const dist = curr.km - prev.km;
      if (dist > 0 && curr.litros > 0) {
        truckDist += dist;
        truckLiters += curr.litros;
      }
    }
    const truckAvg = truckLiters > 0 ? (truckDist / truckLiters) : 3.0;

    return { name: t.placa, model: t.modelo, value: totalTruckSpent, avg: truckAvg };
  }).sort((a: any, b: any) => b.value - a.value);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Dynamic Header State */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 p-6 rounded-3xl text-white shadow-xl shadow-blue-100">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest bg-blue-500/30 px-3 py-1 rounded-full text-blue-100">GBFleet AI Analytics</span>
          <h2 className="text-2xl font-black mt-2">Visão Geral da Operação Rodoviária</h2>
          <p className="text-xs text-blue-100/90 mt-1">Status em tempo real para tomada de decisão em transporte de cargas e logística pesada.</p>
        </div>
        <div className="flex gap-6 text-sm">
          <div className="bg-white/10 px-4 py-2.5 rounded-2xl backdrop-blur-sm border border-white/10 text-center min-w-[100px]">
            <p className="text-blue-100 font-bold text-[10px] uppercase tracking-wider">Caminhões</p>
            <p className="text-xl font-mono font-black mt-0.5">{activeTrucksCount}/{totalTrucksCount}</p>
          </div>
          <div className="bg-white/10 px-4 py-2.5 rounded-2xl backdrop-blur-sm border border-white/10 text-center min-w-[100px]">
            <p className="text-blue-100 font-bold text-[10px] uppercase tracking-wider">Motoristas</p>
            <p className="text-xl font-mono font-black mt-0.5">{travelingDriversCount} Viajando</p>
          </div>
        </div>
      </div>

      {/* Main Core Financial Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Faturamento Bruto" 
          value={`R$ ${totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
          trend="Financeiro" 
          trendUp={true}
          icon={DollarSign}
          color="indigo"
          subtitle="Entradas acumuladas"
        />
        <StatCard 
          title="Combustível (Diesel)" 
          value={`R$ ${totalFuel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
          trend={`${avgConsumption} km/L Médio`} 
          trendUp={parseFloat(avgConsumption) >= 3.0}
          icon={Fuel}
          color="blue"
          subtitle="Gasto ponderado em viagens"
        />
        <StatCard 
          title="Investimento em Manutenção" 
          value={`R$ ${manutencoesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
          trend="Conservação" 
          trendUp={manutencoesValue < totalSpent * 0.3}
          icon={Wrench}
          color="amber"
          subtitle="Segurança mecânica"
        />
        <StatCard 
          title="Superávit Operacional" 
          value={`R$ ${balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
          trend={`Margem ${netMargin.toFixed(1)}%`} 
          trendUp={netMargin >= 15}
          icon={TrendingUp}
          color="emerald"
          subtitle="Saldo real em caixa"
        />
      </div>

      {/* Charts split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart - Monthly financial health: bar with lines */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800">Evolução de Fluxo de Caixa (2026)</h3>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">Comparativo mensal entre faturamento bruto, custos totais e margem líquida.</p>
            </div>
            <div className="flex gap-3 text-xs font-extrabold text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-600 rounded-lg"></span> Faturamento</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-rose-500 rounded-lg"></span> Custos</span>
            </div>
          </div>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyFinancialData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.08)'}}
                />
                <Legend iconType="circle" wrapperStyle={{paddingTop: 10, fontSize: 11}} />
                <Bar name="Faturamento" dataKey="faturamento" fill="#2563eb" radius={[6, 6, 0, 0]} barSize={34} />
                <Bar name="Despesas Totais" dataKey="despesas" fill="#f43f5e" radius={[6, 6, 0, 0]} barSize={34} />
                <Line name="Margem de Lucro Est." type="monotone" dataKey="lucro" stroke="#10b981" strokeWidth={3} activeDot={{ r: 8 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost breakdown analysis */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800">Custo Operacional por Categoria</h3>
            <p className="text-xs text-slate-400 mt-0.5">Distribuição percentual de despesas correntes.</p>
          </div>
          
          <div className="relative h-[200px] flex items-center justify-center">
            {costBreakdownData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={costBreakdownData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {costBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => `R$ ${Number(value).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400">Nenhum custo registrado ainda.</div>
            )}
            
            {/* Center Total calculation */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Desembolso Total</span>
              <span className="text-lg font-black text-slate-800 mt-0.5">R$ {totalSpent.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          <div className="space-y-3 mt-4 pt-4 border-t border-slate-100 flex-1">
            {costBreakdownData.map((entry) => {
              const pct = totalSpent > 0 ? (entry.value / totalSpent) * 100 : 0;
              return (
                <div key={entry.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: entry.color }}></span>
                    <span className="text-slate-600 font-semibold">{entry.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-slate-800 block">R$ {entry.value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                    <span className="text-[10px] text-slate-400 font-bold">{pct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Alerts and Vehicles Health status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Dynamic Fleet Alerts Column */}
        <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Alertas de Operação Inteligentes</h3>
              <span className="text-xs bg-red-50 text-red-600 font-extrabold px-2 py-0.5 rounded-full">
                {alertsList.filter(a => a.type === 'critical').length} graves
              </span>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {alertsList.map((alert, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "p-4 rounded-2xl flex gap-3.5 border text-xs",
                    alert.type === 'critical' ? "bg-rose-50 border-rose-100" :
                    alert.type === 'warning' ? "bg-amber-50 border-amber-100" :
                    "bg-slate-50 border-slate-100"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-xl shrink-0 h-9 w-9 flex items-center justify-center",
                    alert.type === 'critical' ? "bg-rose-100 text-rose-600" :
                    alert.type === 'warning' ? "bg-amber-100 text-amber-600" :
                    "bg-blue-100 text-blue-600"
                  )}>
                    <alert.icon size={18} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-black text-slate-800 leading-tight">{alert.title}</p>
                    <p className="text-slate-600 leading-relaxed text-[11px]">{alert.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] font-medium text-slate-400 mt-4 italic text-center">Alertas gerados em tempo real com base na ficha técnica da frota.</p>
        </div>

        {/* Expenses & Efficiencie ranking of vehicles */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800">Ranking Geral de Veículos</h3>
              <p className="text-xs text-slate-400 mt-0.5">Análise cruzada de gastos acumulados versus rendimento médio em rodovet.</p>
            </div>
            <Activity className="text-blue-500" size={20} />
          </div>

          <div className="space-y-4">
            {truckRanking.map((truck: any, idx: number) => {
              const spentPct = truckRanking[0].value > 0 ? (truck.value / truckRanking[0].value) * 100 : 0;
              return (
                <div key={truck.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50/50 hover:bg-slate-100/30 border border-slate-100 transition-all">
                  <div className="flex items-center gap-4">
                    <span className={cn(
                      "w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0",
                      idx === 0 ? "bg-amber-100 text-amber-700 font-bold" :
                      idx === 1 ? "bg-slate-200 text-slate-700" :
                      "bg-blue-50 text-blue-600"
                    )}>
                      #{idx + 1}
                    </span>
                    <div>
                      <span className="font-black text-slate-800 font-mono tracking-tight bg-white px-2 py-0.5 border border-slate-200 rounded-lg shadow-2xs mr-1 text-xs">
                        {truck.name}
                      </span>
                      <span className="text-xs font-medium text-slate-500">{truck.model}</span>
                      
                      {/* Metric consumption label */}
                      <span className="ml-2 inline-block text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-mono">
                        {truck.avg.toFixed(1)} km/l
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-1 max-w-xs sm:justify-end">
                    {/* Visual mini bar indicator */}
                    <div className="hidden md:block w-32 bg-slate-200 h-2 rounded-full overflow-hidden shrink-0">
                      <div className="bg-red-500 h-full rounded-full" style={{ width: `${spentPct}%` }}></div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-rose-600">
                        R$ {truck.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[9px] text-slate-400 font-black uppercase">Despesa total</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, trend, trendUp, icon: Icon, color, subtitle }: any) {
  const colors: any = {
    blue: "bg-blue-50 text-blue-600 border-blue-100/20",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100/20",
    amber: "bg-amber-50 text-amber-600 border-amber-100/20",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100/20",
  };

  return (
    <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-3 rounded-2xl border", colors[color])}>
          <Icon size={22} className="shrink-0" />
        </div>
        <span className={cn(
          "text-[10px] font-black uppercase px-2.5 py-1 rounded-full font-mono tracking-wider",
          trendUp ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
        )}>
          {trend}
        </span>
      </div>
      <div>
        <p className="text-xs text-slate-400 font-black uppercase tracking-wider mb-1">{title}</p>
        <h4 className="text-xl font-bold text-slate-900 leading-none">{value}</h4>
        <p className="text-[10px] text-slate-400 mt-2 font-medium">{subtitle}</p>
      </div>
    </div>
  );
}
