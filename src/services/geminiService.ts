import { Truck } from "../types";

export const geminiService = {
  async processChatMessage(message: string, trucks: Truck[]) {
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, trucks }),
      });
      
      if (!response.ok) {
        throw new Error("Erro de comunicação com o servidor.");
      }

      return await response.json();
    } catch (error) {
      console.error("Gemini Service Error:", error);
      return {
        action: "NONE",
        response: "Desculpe, tive um problema ao processar sua mensagem. Pode repetir?"
      };
    }
  }
};
