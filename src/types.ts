export type Role = 'admin' | 'user';

export interface Company {
  id: string;
  nome: string;
  plano: string;
  createdAt: string;
}

export interface User {
  id: string;
  companyId: string;
  role: Role;
  nome: string;
  email: string;
}

export interface Truck {
  id: string;
  companyId: string;
  placa: string;
  modelo: string;
  ativo: boolean;
}

export interface FuelLog {
  id: string;
  companyId: string;
  truckId: string;
  data: string;
  km: number;
  litros: number;
  valor: number;
  fotoUrl?: string;
}

export interface Expense {
  id: string;
  companyId: string;
  truckId: string;
  tipo: string;
  valor: number;
  km?: number;
  data: string;
  fotoUrl?: string;
}

export interface CashFlow {
  id: string;
  companyId: string;
  tipo: 'entrada' | 'saida';
  valor: number;
  data: string;
  descricao: string;
}

export interface ChatLog {
  id: string;
  companyId: string;
  userId: string;
  mensagem: string;
  resposta: string;
  acaoGerada?: any;
  timestamp: string;
}

export interface FleetStats {
  totalSpentMonth: number;
  avgConsumption: number;
  truckRanking: { truckId: string; placa: string; consumption: number }[];
  monthlyExpenses: { month: string; value: number }[];
  alerts: string[];
}
