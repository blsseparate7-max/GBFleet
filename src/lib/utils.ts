import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function maskBRL(value: string | number | undefined | null, allowZero: boolean = false): string {
  if (value === undefined || value === null || value === "") return allowZero ? "R$ 0,00" : "";
  
  let num: number;
  if (typeof value === 'number') {
    if (value === 0 && !allowZero) return "";
    num = value;
  } else {
    const str = String(value).trim();
    if (!str) return allowZero ? "R$ 0,00" : "";
    
    // If it is a string and contains BRL symbols or standard BRL decimal comma, treat as user input mask
    if (str.includes("R$") || str.includes(",")) {
      const clean = str.replace(/\D/g, "");
      if (!clean) return "";
      const rawNum = Number(clean);
      if (rawNum === 0) return allowZero ? "R$ 0,00" : "";
      num = rawNum / 100;
    } else {
      // Direct raw float string (e.g. "5000", "50", "0")
      num = parseFloat(str);
      if (isNaN(num)) return allowZero ? "R$ 0,00" : "";
      if (num === 0 && !allowZero) return "";
    }
  }

  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

export function unmaskBRL(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "" || value === 0 || value === "0") return 0;
  if (typeof value === 'number') return value;
  
  const str = String(value).trim();
  if (!str || str === "0") return 0;
  
  if (str.includes("R$") || str.includes(",")) {
    const cleanValue = str.replace(/\D/g, "");
    if (!cleanValue) return 0;
    return Number(cleanValue) / 100;
  }
  
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export function formatCurrencyBRL(value: string | number | undefined | null): string {
  return maskBRL(value, true);
}

export function formatDateBR(dateStr: any): string {
  if (!dateStr) return "---";
  try {
    const cleanStr = String(dateStr).trim();
    if (!cleanStr) return "---";
    
    // If it's in YYYY-MM-DD format
    const parts = cleanStr.split('T')[0].split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      if (year.length === 4 && month.length <= 2 && day.length <= 2) {
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }
    }
    
    // Fallback
    const dateObj = new Date(cleanStr.includes('T') ? cleanStr : cleanStr + "T12:00:00");
    if (isNaN(dateObj.getTime())) {
      return "---";
    }
    return dateObj.toLocaleDateString('pt-BR');
  } catch (e) {
    return "---";
  }
}

