export const dbTemplate = {
  "companies": [
    {
      "id": "comp_superadmin",
      "nome": "GBFleet Gestão",
      "plano": "Enterprise",
      "createdAt": "2026-06-18T20:29:40.116Z",
      "status": "ativo",
      "pago": true,
      "trialDays": 30,
      "supportCode": null,
      "supportCodeCreatedAt": null,
      "supportAuthorizedUntil": null
    }
  ],
  "users": [
    {
      "id": "super_1",
      "companyId": "comp_superadmin",
      "role": "superadmin",
      "nome": "Admin Master",
      "email": "gbfleet@admin.ai",
      "password": "Gb9119130312"
    },
    {
      "id": "super_2",
      "companyId": "comp_superadmin",
      "role": "superadmin",
      "nome": "Super Admin GBFleet",
      "email": "super@gbfleet.ai",
      "password": "super"
    }
  ],
  "categories_entrada": [
    "Faturamento de Frete",
    "Aporte de Capital",
    "Estadia de Viagem",
    "Reembolso de Despesas",
    "Outros Recebíveis"
  ],
  "categories_saida": [
    "Diesel (Abastecimento)",
    "Pedágios",
    "Manutenção e Peças",
    "Motorista (Diária/Comissão)",
    "Pneus",
    "Seguros & Rastreamento",
    "Administrativo & Escritório",
    "Impostos/Licenciamento",
    "Outras Despesas"
  ],
  "trucks": [],
  "drivers": [],
  "fuel_logs": [],
  "expenses": [],
  "cash_flow": [],
  "freights": [],
  "maintenance_alerts": [],
  "routes": [],
  "gas_stations": [],
  "expense_companies": [],
  "chat_logs": [],
  "bills": []
};
