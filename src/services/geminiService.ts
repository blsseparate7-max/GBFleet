import { GoogleGenAI, Type } from "@google/genai";
import { Truck } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const geminiService = {
  async processChatMessage(message: string, trucks: Truck[]) {
    const model = "gemini-3-flash-preview";
    
    const systemInstruction = `
      Você é o assistente inteligente da GBFleet AI, um sistema de gestão de frotas.
      Sua função é interpretar mensagens do usuário e transformá-las em ações no sistema.
      
      Caminhões disponíveis: ${trucks.map(t => `${t.placa} (${t.modelo})`).join(", ")}
      
      Ações possíveis:
      1. REGISTER_FUEL: Quando o usuário informa um abastecimento. Requer: truckId (placa), litros, valor, km.
      2. REGISTER_EXPENSE: Quando o usuário informa uma despesa (manutenção, pedágio, etc). Requer: truckId (placa), tipo, valor.
      3. REGISTER_CASH: Quando o usuário informa uma entrada ou saída de caixa genérica. Requer: tipo (entrada/saida), valor, descricao.
      4. ANALYZE: Quando o usuário pede uma análise, pergunta sobre o caminhão que mais gastou, ou resumo da frota.
      
      Regras de Resposta:
      - Se for um registro bem-sucedido, confirme com entusiasmo.
      - Se for uma análise, use os dados dos caminhões fornecidos.
      - Se o usuário perguntar "quem gastou mais", mencione que você pode analisar os relatórios no dashboard.
      - Mantenha um tom profissional de consultor de logística.
      
      Responda SEMPRE em JSON no formato:
      {
        "action": "REGISTER_FUEL" | "REGISTER_EXPENSE" | "REGISTER_CASH" | "ANALYZE" | "NONE",
        "data": { ... dados da ação ... },
        "response": "Sua resposta amigável para o usuário em português"
      }
      
      Se faltar informação, peça educadamente na "response" e use action "NONE".
      Se for um abastecimento, calcule o consumo se possível e mencione na resposta.
    `;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: message,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: { type: Type.STRING },
              data: { type: Type.OBJECT },
              response: { type: Type.STRING }
            },
            required: ["action", "response"]
          }
        }
      });

      return JSON.parse(response.text || "{}");
    } catch (error) {
      console.error("Gemini Error:", error);
      return {
        action: "NONE",
        response: "Desculpe, tive um problema ao processar sua mensagem. Pode repetir?"
      };
    }
  }
};
