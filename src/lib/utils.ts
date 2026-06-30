import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function maskBRL(value: string | number): string {
  if (value === undefined || value === null || value === "") return "";
  
  let num: number;
  if (typeof value === 'number') {
    num = value;
  } else {
    // If it is a string and contains BRL symbols or standard BRL decimal comma, treat as user input mask
    if (value.includes("R$") || value.includes(",")) {
      const clean = value.replace(/\D/g, "");
      if (!clean) return "";
      num = Number(clean) / 100;
    } else {
      // Direct raw float string (e.g. "5000" or "5000.5")
      num = parseFloat(value);
      if (isNaN(num)) return "";
    }
  }

  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

export function unmaskBRL(value: string | number): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === 'number') return value;
  
  if (value.includes("R$") || value.includes(",")) {
    const cleanValue = value.replace(/\D/g, "");
    if (!cleanValue) return 0;
    return Number(cleanValue) / 100;
  }
  
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}
