import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Printer, 
  Download, 
  Truck as TruckIcon, 
  Users, 
  Route, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Grid, 
  BarChart2, 
  DollarSign, 
  Milestone, 
  AlertCircle,
  HelpCircle,
  Sparkles,
  Search,
  Filter
} from 'lucide-react';
import { cn } from '../lib/utils';

interface ReportsProps {
  data: any;
}

type RankingTab = 'vehicles' | 'drivers' | 'routes' | 'expenses';

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

const isMotoristaByTipo = (tipo: string) => {
  const t = (tipo || "").toLowerCase();
  return t.includes("motorista") || t.includes("diária") || t.includes("diaria") || t.includes("comissão") || t.includes("comissao");
};

export default function Reports({ data }: ReportsProps) {
  const [activeRankTab, setActiveRankTab] = useState<RankingTab>('vehicles');
  const [startDate, setStartDate] = useState('2026-05-01');
  const [endDate, setEndDate] = useState('2026-06-30');
  const [selectedTruck, setSelectedTruck] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Safe data arrays fallbacks
  const freights = useMemo(() => data?.freights || [], [data]);
  const fuelLogs = useMemo(() => data?.fuel_logs || [], [data]);
  const expenses = useMemo(() => data?.expenses || [], [data]);
  const cashFlow = useMemo(() => data?.cash_flow || [], [data]);
  const trucks = useMemo(() => data?.trucks || [], [data]);
  const drivers = useMemo(() => data?.drivers || [], [data]);
  const maintenance = useMemo(() => data?.maintenance_alerts || [], [data]);

  // Helper date parsing
  const isWithinDateRange = (dateStr?: string) => {
    if (!dateStr) return true;
    const itemDate = new Date(dateStr).getTime();
    const start = startDate ? new Date(startDate).getTime() : -Infinity;
    const end = endDate ? new Date(endDate).getTime() : Infinity;
    return itemDate >= start && itemDate <= end;
  };

  // 2. Filtered collections
  const filteredFreights = useMemo(() => {
    return freights.filter((f: any) => {
      const matchTruck = !selectedTruck || f.truckId === selectedTruck || f.caminhao === selectedTruck;
      const matchDriver = !selectedDriver || f.driverId === selectedDriver || f.motorista === selectedDriver;
      const matchDates = isWithinDateRange(f.data || f.dataSaida);
      return matchTruck && matchDriver && matchDates;
    });
  }, [freights, selectedTruck, selectedDriver, startDate, endDate]);

  const filteredFuelLogs = useMemo(() => {
    return fuelLogs.filter((log: any) => {
      const matchTruck = !selectedTruck || log.truckId === selectedTruck;
      const matchDriver = !selectedDriver || log.driverId === selectedDriver;
      const matchDates = isWithinDateRange(log.data);
      return matchTruck && matchDriver && matchDates;
    });
  }, [fuelLogs, selectedTruck, selectedDriver, startDate, endDate]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp: any) => {
      const matchTruck = !selectedTruck || exp.truckId === selectedTruck;
      const matchDates = isWithinDateRange(exp.data);
      return matchTruck && matchDates;
    });
  }, [expenses, selectedTruck, startDate, endDate]);

  const filteredMaintenance = useMemo(() => {
    return maintenance.filter((m: any) => {
      const matchTruck = !selectedTruck || m.truckId === selectedTruck;
      const matchDates = isWithinDateRange(m.dataRealizada);
      return matchTruck && matchDates && m.status === 'Realizado';
    });
  }, [maintenance, selectedTruck, startDate, endDate]);

  // 3. Financial aggregates
  const rawRevenue = useMemo(() => {
    return filteredFreights.reduce((acc, f) => acc + Number(f.valorBruto || 0), 0);
  }, [filteredFreights]);

  const totalFuelCost = useMemo(() => {
    const realFuel = filteredFuelLogs.reduce((acc, f) => acc + Number(f.valor || 0), 0);
    const manualFuel = filteredExpenses.filter((e: any) => isCombustivelByTipo(e.tipo) && e.documento !== "Auto-Abastecimento").reduce((acc, e) => acc + Number(e.valor || 0), 0);
    return realFuel + manualFuel;
  }, [filteredFuelLogs, filteredExpenses]);

  const directFreightExpenses = useMemo(() => {
    const freightDirect = filteredFreights.reduce((acc, f) => {
      const motoristaCost = Number(f.comissao || f.motorista || 0);
      const pedagio = Number(f.pedagio || 0);
      const otherCosts = Number(f.outrasDespesas || f.outrosCustos || 0);
      return acc + motoristaCost + pedagio + otherCosts;
    }, 0);

    const manualPedagios = filteredExpenses.filter((e: any) => isPedagioByTipo(e.tipo)).reduce((acc, e) => acc + Number(e.valor || 0), 0);
    const manualMotoristas = filteredExpenses.filter((e: any) => isMotoristaByTipo(e.tipo)).reduce((acc, e) => acc + Number(e.valor || 0), 0);

    return freightDirect + manualPedagios + manualMotoristas;
  }, [filteredFreights, filteredExpenses]);

  const administrativeExpenses = useMemo(() => {
    return filteredExpenses
      .filter((e: any) => 
        !isCombustivelByTipo(e.tipo) && 
        !isMaintenanceByTipo(e.tipo) && 
        !isPedagioByTipo(e.tipo) && 
        !isMotoristaByTipo(e.tipo)
      )
      .reduce((acc, e) => acc + Number(e.valor || 0), 0);
  }, [filteredExpenses]);

  const maintenanceExpenses = useMemo(() => {
    const realMaint = filteredMaintenance.reduce((acc, m) => acc + Number(m.custo || 0), 0);
    const manualMaint = filteredExpenses.filter((e: any) => isMaintenanceByTipo(e.tipo) && !e.documento?.startsWith("Auto-Manutenção")).reduce((acc, e) => acc + Number(e.valor || 0), 0);
    return realMaint + manualMaint;
  }, [filteredMaintenance, filteredExpenses]);

  const totalCosts = useMemo(() => {
    return totalFuelCost + administrativeExpenses + maintenanceExpenses + directFreightExpenses;
  }, [totalFuelCost, administrativeExpenses, maintenanceExpenses, directFreightExpenses]);

  const netBalance = useMemo(() => {
    return rawRevenue - totalCosts;
  }, [rawRevenue, totalCosts]);

  const liquidMargin = useMemo(() => {
    return rawRevenue > 0 ? (netBalance / rawRevenue) * 100 : 0;
  }, [rawRevenue, netBalance]);

  const totalMileage = useMemo(() => {
    // Distance from either freight logs or fuel log differences
    const freightKm = filteredFreights.reduce((acc, f) => acc + Number(f.distanciaKm || 0), 0);
    if (freightKm > 0) return freightKm;

    // Fallback: derive distance from fuel logs if available
    let totalDeriv = 0;
    const grouped = {} as any;
    filteredFuelLogs.forEach((log: any) => {
      if (!grouped[log.truckId]) grouped[log.truckId] = [];
      grouped[log.truckId].push(Number(log.km || 0));
    });
    Object.keys(grouped).forEach(k => {
      const arr = grouped[k].sort((a: any, b: any) => a - b);
      if (arr.length > 1) {
        totalDeriv += (arr[arr.length - 1] - arr[0]);
      }
    });
    return totalDeriv > 0 ? totalDeriv : 0; // zeroed for clean accounts
  }, [filteredFreights, filteredFuelLogs]);

  const costPerKm = useMemo(() => {
    return totalMileage > 0 ? totalCosts / totalMileage : 0;
  }, [totalCosts, totalMileage]);


  // 4. RANKINGS GENERATION ENGINE

  // A) Vehicles Ranking
  const vehiclesRanking = useMemo(() => {
    const rawRank = trucks.map((truck: any) => {
      // Filter activities for this truck
      const truckFreights = filteredFreights.filter((f: any) => f.truckId === truck.placa || f.caminhao === truck.placa);
      const truckFuel = filteredFuelLogs.filter((log: any) => log.truckId === truck.placa);
      const truckExp = filteredExpenses.filter((e: any) => e.truckId === truck.placa);
      const truckMaint = filteredMaintenance.filter((m: any) => m.truckId === truck.placa);

      const countTrips = truckFreights.length;
      const grossRev = truckFreights.reduce((sum, f) => sum + Number(f.valorBruto || 0), 0);
      const fuelCost = truckFuel.reduce((sum, f) => sum + Number(f.valor || 0), 0);
      const adminCosts = truckExp.reduce((sum, f) => sum + Number(f.valor || 0), 0);
      const maintCost = truckMaint.reduce((sum, f) => sum + Number(f.custo || 0), 0);
      
      const directFreightsCost = truckFreights.reduce((sum, f) => {
         return sum + Number(f.comissao || f.motorista || 0) + Number(f.pedagio || 0) + Number(f.combustivel || f.dieselPrevisto || 0) + Number(f.outrasDespesas || f.outrosCustos || 0);
      }, 0);

      const totalSpentTruck = fuelCost + adminCosts + maintCost + directFreightsCost;
      const netProfit = grossRev - totalSpentTruck;
      const margin = grossRev > 0 ? (netProfit / grossRev) * 100 : 0;
      const kmCovered = truckFreights.reduce((sum, f) => sum + Number(f.distanciaKm || 0), 0);

      return {
        id: truck.id,
        placa: truck.placa,
        modelo: truck.modelo,
        tripsCount: countTrips,
        grossRevenue: grossRev,
        totalExpenses: totalSpentTruck,
        netProfit,
        margin,
        mileage: kmCovered > 0 ? kmCovered : 0,
        fuelSpent: fuelCost,
        maintCost
      };
    });

    // If query exists, search by placa or model
    const searched = rawRank.filter(item => 
      !searchQuery || 
      item.placa.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.modelo.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort by profit (Default)
    return searched.sort((a, b) => b.netProfit - a.netProfit);
  }, [trucks, filteredFreights, filteredFuelLogs, filteredExpenses, filteredMaintenance, searchQuery]);


  // B) Drivers Ranking
  const driversRanking = useMemo(() => {
    const rawRank = drivers.map((drv: any) => {
      const driverFreights = filteredFreights.filter((f: any) => f.driverId === drv.id || f.motorista === drv.nome);
      const driverFuel = filteredFuelLogs.filter((log: any) => log.driverId === drv.id);

      const countTrips = driverFreights.length;
      const grossRev = driverFreights.reduce((sum, f) => sum + Number(f.valorBruto || 0), 0);
      const totalComissao = driverFreights.reduce((sum, f) => sum + Number(f.comissao || f.motorista || 0), 0);
      const fuelCost = driverFuel.reduce((sum, f) => sum + Number(f.valor || 0), 0);
      const kmDriven = driverFreights.reduce((sum, f) => sum + Number(f.distanciaKm || 0), 0);
      
      const pedagogicalCosts = driverFreights.reduce((sum, f) => sum + Number(f.pedagio || 0), 0);
      const helperTravelExpenses = driverFreights.reduce((sum, f) => sum + Number(f.outrasDespesas || f.outrosCustos || 0), 0);
      const indirectFuelCostOnTravel = driverFreights.reduce((sum, f) => sum + Number(f.combustivel || f.dieselPrevisto || 0), 0);

      const totalIncuredCosts = totalComissao + fuelCost + pedagogicalCosts + helperTravelExpenses + indirectFuelCostOnTravel;
      const profitContribution = grossRev - totalIncuredCosts;
      const efficiency = grossRev > 0 ? (profitContribution / grossRev) * 100 : 0;

      return {
        id: drv.id,
        nome: drv.nome,
        cnh: drv.cnh,
        categoriaCnh: drv.categoriaCnh,
        tripsCount: countTrips,
        grossRevenue: grossRev,
        comissaoAcumulada: totalComissao,
        profitContribution,
        efficiency,
        mileage: kmDriven
      };
    });

    const searched = rawRank.filter(item => 
      !searchQuery || 
      item.nome.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return searched.sort((a, b) => b.tripsCount - a.tripsCount);
  }, [drivers, filteredFreights, filteredFuelLogs, searchQuery]);


  // C) Routes Ranking (Origins & Destinos combinations)
  const routesRanking = useMemo(() => {
    const matchedRoutes = {} as any;

    filteredFreights.forEach((f: any) => {
      if (!f.origem || !f.destino) return;
      const key = `${f.origem.trim()} ➔ ${f.destino.trim()}`;
      if (!matchedRoutes[key]) {
        matchedRoutes[key] = {
          routeKey: key,
          origem: f.origem,
          destino: f.destino,
          tripsCount: 0,
          grossRevenue: 0,
          totalExpenses: 0,
          netProfit: 0,
          mileageTotal: 0,
        };
      }

      const routeSum = matchedRoutes[key];
      routeSum.tripsCount += 1;
      routeSum.grossRevenue += Number(f.valorBruto || 0);
      
      const travelExpenses = Number(f.comissao || f.motorista || 0) + 
                             Number(f.pedagio || 0) + 
                             Number(f.combustivel || f.dieselPrevisto || 0) + 
                             Number(f.outrasDespesas || f.outrosCustos || 0);
      routeSum.totalExpenses += travelExpenses;
      routeSum.mileageTotal += Number(f.distanciaKm || 0);
      routeSum.netProfit = routeSum.grossRevenue - routeSum.totalExpenses;
    });

    const routeList = Object.values(matchedRoutes).map((r: any) => ({
      ...r,
      margin: r.grossRevenue > 0 ? (r.netProfit / r.grossRevenue) * 100 : 0
    }));

    const searched = routeList.filter((item: any) => 
      !searchQuery || 
      item.origem.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.destino.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return searched.sort((a, b) => b.netProfit - a.netProfit);
  }, [filteredFreights, searchQuery]);


  // D) Expenses ranking by category
  const expensesRanking = useMemo(() => {
    const rawCategorias: { [key: string]: number } = {};

    // 1. Fuel (Diesel)
    rawCategorias['Diesel (Abastecimento)'] = totalFuelCost;

    // 2. Maintenance
    rawCategorias['Manutenção e Peças'] = maintenanceExpenses;

    // 3. Tolls (Pedágios)
    const freightPedagios = filteredFreights.reduce((acc, f) => acc + Number(f.pedagio || 0), 0);
    const manualPedagios = filteredExpenses.filter((e: any) => isPedagioByTipo(e.tipo)).reduce((acc, e) => acc + Number(e.valor || 0), 0);
    rawCategorias['Pedágios'] = freightPedagios + manualPedagios;

    // 4. Drivers (Comissions / Diaries)
    const freightDrivers = filteredFreights.reduce((acc, f) => acc + Number(f.comissao || f.motorista || 0), 0);
    const manualDrivers = filteredExpenses.filter((e: any) => isMotoristaByTipo(e.tipo)).reduce((acc, e) => acc + Number(e.valor || 0), 0);
    rawCategorias['Motorista (Diária/Comissão)'] = freightDrivers + manualDrivers;

    // 5. Trip Other
    const freightOthers = filteredFreights.reduce((acc, f) => acc + Number(f.outrasDespesas || f.outrosCustos || 0), 0);
    if (freightOthers > 0) {
      rawCategorias['Outras Despesas de Viagem'] = freightOthers;
    }

    // 6. Manual Others (Insurances, Multas, etc.)
    filteredExpenses.forEach((exp: any) => {
      if (
        !isCombustivelByTipo(exp.tipo) &&
        !isMaintenanceByTipo(exp.tipo) &&
        !isPedagioByTipo(exp.tipo) &&
        !isMotoristaByTipo(exp.tipo)
      ) {
        const cat = exp.tipo || 'Outros Administrativos';
        rawCategorias[cat] = (rawCategorias[cat] || 0) + Number(exp.valor || 0);
      }
    });

    const list = Object.entries(rawCategorias).map(([category, sum]) => ({
      category,
      sum,
      percent: totalCosts > 0 ? (sum / totalCosts) * 100 : 0
    }));

    return list.sort((a, b) => b.sum - a.sum);
  }, [filteredFreights, filteredFuelLogs, filteredExpenses, filteredMaintenance, totalFuelCost, maintenanceExpenses, totalCosts]);


  // 5. Intelligent Insights Engine (Dynamic heuristic analysis of operational patterns)
  const businessInsights = useMemo(() => {
    const insightsList: string[] = [];

    if (vehiclesRanking.length > 0) {
      const mostProfitTruck = vehiclesRanking[0];
      if (mostProfitTruck.netProfit > 0) {
        insightsList.push(`🏆 Excelência de Rendimento: O veículo de placa ${mostProfitTruck.placa} (${mostProfitTruck.modelo}) obteve o maior faturamento operacional líquido do período, registrando R$ ${mostProfitTruck.netProfit.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} com uma margem sólida de ${mostProfitTruck.margin.toFixed(1)}%.`);
      }
    }

    if (driversRanking.length > 0) {
      const topDriver = driversRanking[0];
      if (topDriver.tripsCount > 0) {
        insightsList.push(`🚛 Liderança de Operação: O condutor parceiro ${topDriver.nome} liderou a produtividade de equipes com ${topDriver.tripsCount} viagens de despacho realizadas no intervalo, entregando alta performance de faturamento.`);
      }
    }

    if (expensesRanking.length > 0) {
      const topExpense = expensesRanking[0];
      if (topExpense.sum > 0) {
        const warningTxt = topExpense.category.includes('Diesel') 
          ? `⛽ Atenção Logística: O consumo de combustível (${topExpense.category}) representa ${topExpense.percent.toFixed(1)}% do seu custo geral (R$ ${topExpense.sum.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}). Considere rotas otimizadas e auditorias frequentes de quilômetros por litro para suavizar faturamento.`
          : `⚠️ Detecção de Centro de Custo: "${topExpense.category}" é a sua principal categoria de despesa, abocanhando ${topExpense.percent.toFixed(1)}% do total investido. Realize auditoria de notas fiscais nessa categoria.`;
        insightsList.push(warningTxt);
      }
    }

    if (liquidMargin < 15 && rawRevenue > 0) {
      insightsList.push(`📉 Alerta de Lucratividade: Sua margem líquida média está em ${liquidMargin.toFixed(1)}% (limiar saudável seria acima de 20%). Recomendamos simular novos contratos no Simulador de Custos e reajustar comissões ou taxas de frete bruto com seus contratadores.`);
    } else if (liquidMargin >= 25 && rawRevenue > 0) {
      insightsList.push(`📈 Desempenho Excepcional: Sua operação de frotas está altamente eficiente! Sua lucratividade líquida atingiu ${liquidMargin.toFixed(1)}%, indicando excelente balanceamento entre faturamento de contratos, diesel e pedágios.`);
    }

    // Default insight if data is brand new
    if (insightsList.length === 0) {
      insightsList.push("💡 Planejando Despachos: Quando você começar a cadastrar viagens reais, abastecimentos e manutenções frequentes, o sistema gerará insights inteligentes de centro de custos e ranking de desempenho operacional automaticamente aqui.");
    }

    return insightsList;
  }, [vehiclesRanking, driversRanking, expensesRanking, liquidMargin, rawRevenue]);


  // Clean client Print page-friendly layout
  const handlePrint = () => {
    window.print();
  };

  // CSV table export helper
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    if (activeRankTab === 'vehicles') {
      csvContent += "Placa,Modelo,Viagens,Faturamento Bruto (R$),Despesa Geral (R$),Lucro Liquido (R$),Margem (%),Km Rodado\n";
      vehiclesRanking.forEach(v => {
        csvContent += `"${v.placa}","${v.modelo}",${v.tripsCount},${v.grossRevenue},${v.totalExpenses},${v.netProfit},${v.margin.toFixed(2)},${v.mileage}\n`;
      });
    } else if (activeRankTab === 'drivers') {
      csvContent += "Motorista,Triagens Concluidas,Faturamento Gerado (R$),Diarias Acumuladas (R$),Eficiencia (%)\n";
      driversRanking.forEach(d => {
        csvContent += `"${d.nome}",${d.tripsCount},${d.grossRevenue},${d.comissaoAcumulada},${d.efficiency.toFixed(2)}\n`;
      });
    } else if (activeRankTab === 'routes') {
      csvContent += "Rota (Origem ➔ Destino),Frequencia de Viagens,Faturamento Geral (R$),Resultado Liquido (R$),Kms Totais\n";
      routesRanking.forEach(r => {
        csvContent += `"${r.routeKey}",${r.tripsCount},${r.grossRevenue},${r.netProfit},${r.mileageTotal}\n`;
      });
    } else {
      csvContent += "Categoria de Despesa,Soma de Custos (R$),Representacao (%)\n";
      expensesRanking.forEach(e => {
        csvContent += `"${e.category}",${e.sum},${e.percent.toFixed(2)}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `gbfleet_ranking_${activeRankTab}_${startDate}_a_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 font-sans relative">
      
      {/* HEADER CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-5 no-print">
        <div>
          <span className="text-[10px] uppercase font-black text-blue-650 bg-blue-50 px-2.5 py-1 rounded-md tracking-wider">Centro de Auditoria</span>
          <h2 className="text-xl font-extrabold text-slate-800 mt-2 flex items-center gap-2">
            <FileText className="text-blue-600 shrink-0" size={22} />
            Relatórios e Rankings Consolidados
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed font-semibold">
            Análise agregada de rendimento financeiro da frota física, equipes motoristas e custos do seu negócio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="btn-print-reports"
            onClick={handlePrint}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-650 flex items-center gap-2 transition shadow-sm cursor-pointer"
          >
            <Printer size={15} className="text-slate-500" />
            <span>Imprimir Relatório</span>
          </button>
          
          <button
            id="btn-export-csv"
            onClick={handleExportCSV}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-550 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition shadow-md shadow-blue-100 cursor-pointer"
          >
            <Download size={15} className="text-blue-100" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* PRINT-ONLY HEADER */}
      <div className="hidden print:block mb-8 border-b border-slate-900 pb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">GBFLEET AI GESTÃO</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">SISTEMA INTEGRADO DE AUDITORIA OPERACIONAL E FROTAS</p>
            <p className="text-[10px] text-slate-400 font-mono mt-1">Período Selecionado: {startDate} até {endDate}</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-black border border-slate-900 p-2 uppercase tracking-wider rounded-md">RELATÓRIO RESUMIDO DE GESTÃO</span>
          </div>
        </div>
      </div>

      {/* FILTERS PANEL */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4 no-print">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-blue-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Parâmetros de Auditoria</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[9px] font-black uppercase text-slate-450 tracking-wider mb-1.5 flex items-center gap-1">
              <Calendar size={11} className="text-slate-400" /> Data Inicial
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/60 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 transition text-slate-700"
            />
          </div>

          <div>
            <label className="block text-[9px] font-black uppercase text-slate-450 tracking-wider mb-1.5 flex items-center gap-1">
              <Calendar size={11} className="text-slate-400" /> Data Final
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/60 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 transition text-slate-700"
            />
          </div>

          <div>
            <label className="block text-[9px] font-black uppercase text-slate-450 tracking-wider mb-1.5 flex items-center gap-1">
              <TruckIcon size={11} className="text-slate-400" /> Filtrar Caminhão (Foco)
            </label>
            <select
              value={selectedTruck}
              onChange={e => setSelectedTruck(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/60 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-650 focus:outline-none transition"
            >
              <option value="">-- Todos os veículos --</option>
              {trucks.map((t: any) => (
                <option key={t.id} value={t.placa}>{t.placa} ({t.modelo})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] font-black uppercase text-slate-450 tracking-wider mb-1.5 flex items-center gap-1">
              <Users size={11} className="text-slate-400" /> Filtrar Motorista (Foco)
            </label>
            <select
              value={selectedDriver}
              onChange={e => setSelectedDriver(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/60 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-650 focus:outline-none transition"
            >
              <option value="">-- Todos os motoristas --</option>
              {drivers.map((d: any) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* AGGREGATES PERFORMANCE CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Card: Receita Operacional Bruta */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider">Faturamento Operacional</span>
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
                <DollarSign size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900 font-mono">
                R$ {rawRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 font-semibold mt-1 flex items-center gap-1">
                <Grid size={12} className="text-slate-400" />
                {filteredFreights.length} Viagens contabilizadas no intervalo
              </p>
            </div>
          </div>
        </div>

        {/* Card: Despesa Geral Consolidada */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500"></div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider">Custos Consolidados</span>
              <div className="p-2.5 bg-rose-50 text-rose-500 rounded-xl group-hover:scale-110 transition-transform">
                <TrendingDown size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900 font-mono">
                R$ {totalCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-rose-650 font-bold mt-1.5 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1 leading-normal">
                Compreende combustível, diárias, pedágios, manutenção e oficina
              </p>
            </div>
          </div>
        </div>

        {/* Card: Saldo Operacional Líquido */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500"></div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider">Resultado de Caixa</span>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
                <TrendingUp size={18} />
              </div>
            </div>
            <div>
              <p className={cn("text-2xl font-black font-mono", netBalance >= 0 ? "text-emerald-700" : "text-rose-700")}>
                R$ {netBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 font-semibold mt-1">
                Margem líquida do negócio: <strong className="text-slate-700 font-black">{liquidMargin.toFixed(1)}%</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Card: Quilometragem Coberta */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-500"></div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider">Métricas de Rodagem</span>
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
                <Milestone size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900 font-mono">
                {totalMileage.toLocaleString('pt-BR')} <span className="text-xs font-black text-slate-400">KM</span>
              </p>
              <p className="text-[10px] text-slate-500 font-semibold mt-1">
                Custo de frota: <strong className="text-slate-700 font-black">R$ {costPerKm.toFixed(2)} / KM</strong>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* AUDIT INSIGHTS (AI RECOMMENDATION CHIPS) */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-950 text-white rounded-3xl p-6 border border-slate-800 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl"></div>
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
                <Sparkles size={16} className="animate-spin-slow text-blue-300" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase text-blue-300 tracking-wider">AI Insight & Auditoria de Performance</h4>
                <p className="text-[10px] text-slate-400 leading-normal font-medium">Recomendações financeiras automáticas construídas a partir do faturamento</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {businessInsights.map((insight, index) => (
              <div key={index} className="p-3 bg-slate-900/60 border border-white/5 rounded-xl text-xs font-medium leading-relaxed text-slate-200 animate-fade-in flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                <span>{insight}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RANKINGS COMPONENT (WITH INTERNAL SUBMENU INTERACTIVE TABS) */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        
        {/* RANKINGS CONTROL HEADER */}
        <div className="p-6 bg-slate-50 border-b border-slate-105 flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
          
          {/* Submenu tab selectors */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { setActiveRankTab('vehicles'); setSearchQuery(''); }}
              className={cn(
                "px-4 py-2 rounded-2xl text-xs font-black transition cursor-pointer select-none border",
                activeRankTab === 'vehicles'
                  ? "bg-blue-600 border-blue-700 text-white shadow-md shadow-blue-100"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"
              )}
            >
              📊 Desempenho Caminhões
            </button>

            <button
              onClick={() => { setActiveRankTab('drivers'); setSearchQuery(''); }}
              className={cn(
                "px-4 py-2 rounded-2xl text-xs font-black transition cursor-pointer select-none border",
                activeRankTab === 'drivers'
                  ? "bg-blue-600 border-blue-700 text-white shadow-md shadow-blue-100"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"
              )}
            >
              🙋 Produtividade de Equipes
            </button>

            <button
              onClick={() => { setActiveRankTab('routes'); setSearchQuery(''); }}
              className={cn(
                "px-4 py-2 rounded-2xl text-xs font-black transition cursor-pointer select-none border",
                activeRankTab === 'routes'
                  ? "bg-blue-600 border-blue-700 text-white shadow-md shadow-blue-100"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"
              )}
            >
              🛣️ Rank de Rotas (Viagens)
            </button>

            <button
              onClick={() => { setActiveRankTab('expenses'); setSearchQuery(''); }}
              className={cn(
                "px-4 py-2 rounded-2xl text-xs font-black transition cursor-pointer select-none border",
                activeRankTab === 'expenses'
                  ? "bg-blue-600 border-blue-700 text-white shadow-md shadow-blue-100"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"
              )}
            >
              💸 Centro de Despesas
            </button>
          </div>

          {/* Quick search input */}
          <div className="relative max-w-sm w-full lg:w-72">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={
                activeRankTab === 'vehicles' ? "Buscar placa ou modelo..." :
                activeRankTab === 'drivers' ? "Buscar nome do motorista..." :
                activeRankTab === 'routes' ? "Buscar origem ou destino..." : "Filtrar por categoria..."
              }
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
            />
          </div>
        </div>

        {/* PRINT ONLY MENU SUBTITLE */}
        <div className="hidden print:block p-6 border-b border-slate-250 bg-slate-50 flex justify-between">
          <span className="text-sm font-black uppercase text-slate-800">
            {activeRankTab === 'vehicles' ? "Ranking de Desempenho e Margem por Caminhão" :
             activeRankTab === 'drivers' ? "Tabela de Produtividade e Diárias Concluídas de Condutores" :
             activeRankTab === 'routes' ? "Análise de Viagens por Demanda / Rotas Ativas" : "Rateamento de Despesas por Categorial Mecânica e Operacional"}
          </span>
          <span className="text-xs text-slate-500">Relatório Consolidado</span>
        </div>

        {/* DATA TABLE WRAPPER */}
        <div className="overflow-x-auto">
          
          {/* TAB 1: VEHICLES PERFORMANCE */}
          {activeRankTab === 'vehicles' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-[10px] uppercase font-black tracking-widest border-b border-slate-200">
                  <th className="px-6 py-4">Placa de Rodagem (Modelo)</th>
                  <th className="px-6 py-4 text-center">Viagens</th>
                  <th className="px-6 py-4 text-right">Faturamento Bruto</th>
                  <th className="px-6 py-4 text-right">Custo Vinculado</th>
                  <th className="px-6 py-4 text-right">Média Lucro Líquido</th>
                  <th className="px-6 py-4 text-right">Margem Líquida</th>
                  <th className="px-6 py-4 text-right">Km Rodados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vehiclesRanking.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-xs text-slate-400 font-bold italic">
                      Nenhum resultado filtrado coincide com o intervalo ou veículo.
                    </td>
                  </tr>
                ) : (
                  vehiclesRanking.map((v, idx) => (
                    <tr key={v.id} className="hover:bg-slate-50/50 text-xs font-bold text-slate-700 transition">
                      <td className="px-6 py-4 flex items-center gap-3">
                        <span className="w-5 h-5 rounded bg-slate-100 text-[10px] text-slate-400 flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-slate-800 font-black tracking-tight">{v.placa}</p>
                          <p className="text-[10px] text-slate-500 font-medium uppercase">{v.modelo}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-mono">{v.tripsCount}</td>
                      <td className="px-6 py-4 text-right font-mono">R$ {v.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right font-rose-600 font-mono">R$ {v.totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className={cn("px-6 py-4 text-right font-mono", v.netProfit >= 0 ? "text-emerald-700 font-black" : "text-rose-650")}>
                        R$ {v.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-800 font-black">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px]",
                          v.margin >= 20 ? "bg-emerald-50 text-emerald-800 border border-emerald-200" :
                          v.margin > 0 ? "bg-amber-50 text-amber-850 border border-amber-200" : "bg-rose-50 text-rose-800 border border-rose-200"
                        )}>
                          {v.margin.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-medium text-slate-500">{v.mileage.toLocaleString('pt-BR')} KM</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* TAB 2: DRIVERS PRODUCTIVITY */}
          {activeRankTab === 'drivers' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-[10px] uppercase font-black tracking-widest border-b border-slate-200">
                  <th className="px-6 py-4">Condutor Parceiro</th>
                  <th className="px-6 py-4 text-center">Viagens Entregues</th>
                  <th className="px-6 py-4 text-right">Faturamento Conduzido</th>
                  <th className="px-6 py-4 text-right">Diárias / Comissão Acumulada</th>
                  <th className="px-6 py-4 text-right">Contribuição Saldo</th>
                  <th className="px-6 py-4 text-right">Eficiência Operacional</th>
                  <th className="px-6 py-4 text-right">Km Percorrido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {driversRanking.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-xs text-slate-400 font-bold italic">
                      Nenhum motorista cadastrado coincide com o termo de busca.
                    </td>
                  </tr>
                ) : (
                  driversRanking.map((d, idx) => (
                    <tr key={d.id || idx} className="hover:bg-slate-50/50 text-xs font-bold text-slate-700 transition">
                      <td className="px-6 py-4 flex items-center gap-3">
                        <span className="w-5 h-5 rounded bg-slate-100 text-[10px] text-slate-405 flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-slate-800 font-black tracking-tight">{d.nome}</p>
                          <p className="text-[10px] text-slate-500 font-mono">CNH {d.categoriaCnh || 'D'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-slate-800 font-black">{d.tripsCount}</td>
                      <td className="px-6 py-4 text-right font-mono">R$ {d.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right font-mono text-amber-700">R$ {d.comissaoAcumulada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right font-mono text-emerald-700 font-black">R$ {d.profitContribution.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-800 text-[10px] rounded">
                          {d.efficiency.toFixed(1)}% de margem
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-medium text-slate-500">{d.mileage.toLocaleString('pt-BR')} KM</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* TAB 3: ROUTES DEMAND */}
          {activeRankTab === 'routes' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-[10px] uppercase font-black tracking-widest border-b border-slate-200">
                  <th className="px-6 py-4">Trajeto de Viagem (Origem ➔ Destino)</th>
                  <th className="px-6 py-4 text-center">Frequência</th>
                  <th className="px-6 py-4 text-right">Gasto Previsto Geral</th>
                  <th className="px-6 py-4 text-right">Retorno de Contratos</th>
                  <th className="px-6 py-4 text-right">Ganho Real Resultante</th>
                  <th className="px-6 py-4 text-right">Eficiência de Rota</th>
                  <th className="px-6 py-4 text-right">Rodagem Média</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {routesRanking.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-xs text-slate-400 font-bold italic">
                      Ainda não há registros de faturamentos de frete suficientes para derivar rotas.
                    </td>
                  </tr>
                ) : (
                  routesRanking.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 text-xs font-bold text-slate-700 transition">
                      <td className="px-6 py-4 flex items-center gap-3">
                        <span className="w-5 h-5 rounded bg-slate-100 text-[10px] text-slate-405 flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                        <div className="flex items-center gap-2 text-slate-800 font-black">
                          <span>{r.origem}</span>
                          <span className="text-slate-400 shrink-0">➔</span>
                          <span className="text-blue-750">{r.destino}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-slate-900">{r.tripsCount} x</td>
                      <td className="px-6 py-4 text-right font-mono text-rose-550">R$ {r.totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right font-mono text-slate-800">R$ {r.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right font-mono text-emerald-700 font-black">R$ {r.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-150 inline-block text-[10px] rounded font-black">
                         {r.margin.toFixed(1)}% Margem
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-450">{r.mileageTotal} KM</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* TAB 4: EXPENSES CENTER */}
          {activeRankTab === 'expenses' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-[10px] uppercase font-black tracking-widest border-b border-slate-200">
                  <th className="px-6 py-4">Categoria do Fluxo de Saída</th>
                  <th className="px-6 py-4 text-right">Soma de Custos do Período</th>
                  <th className="px-6 py-4 text-right">Representação do Custo Geral (%)</th>
                  <th className="px-6 py-4">Barra de Alocação de Recursos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expensesRanking.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-xs text-slate-400 font-bold italic">
                      Nenhuma saída financeira registrada no período de datas selecionado.
                    </td>
                  </tr>
                ) : (
                  expensesRanking.map((e, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 text-xs font-bold text-slate-700 transition">
                      <td className="px-6 py-4 flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-slate-105 text-[10px] text-slate-405 flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                        <span className="text-slate-800 font-black">{e.category}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-rose-550">R$ {e.sum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right font-mono text-slate-850 font-black">{e.percent.toFixed(1)}%</td>
                      <td className="px-6 py-4 min-w-[180px]">
                        <div className="w-full max-w-xs bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                          <div 
                            className="bg-rose-500 h-full rounded-full transition-all" 
                            style={{ width: `${Math.min(100, Math.max(2, e.percent))}%` }} 
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

        </div>

        {/* COMPREHENSIVE PLATFORM DISCLOSURE FOOTER */}
        <div className="p-4 bg-slate-50 text-center border-t border-slate-100 text-[10px] text-slate-400 font-medium">
          Relatório gerado pelo Módulo GBFleet AI de Auditoria Integrada. Todos os valores computados correspondem aos status providos na base de dados ativa gbfleet.
        </div>
      </div>

    </div>
  );
}
