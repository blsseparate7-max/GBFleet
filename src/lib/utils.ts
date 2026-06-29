import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function maskBRL(value: string | number): string {
  if (value === undefined || value === null) return "";
  if (typeof value === 'number') {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }
  const cleanValue = value.replace(/\D/g, "");
  if (!cleanValue) return "";
  const numberValue = Number(cleanValue) / 100;
  return numberValue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

export function unmaskBRL(value: string): number {
  if (!value) return 0;
  const cleanValue = value.replace(/\D/g, "");
  if (!cleanValue) return 0;
  return Number(cleanValue) / 100;
}
