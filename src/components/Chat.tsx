import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { geminiService } from '../services/geminiService';
import { cn } from '../lib/utils';

export default function Chat({ data, onUpdate }: { data: any, onUpdate: () => void }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const result = await geminiService.processChatMessage(userMsg, data.trucks);
      
      // Process action if any
      if (result.action !== 'NONE') {
        await processAction(result.action, result.data);
        onUpdate();
      }

      setMessages(prev => [...prev, { role: 'bot', text: result.response }]);
      
      // Save to chat logs
      await fetch('/api/chat_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: 'comp_1',
          userId: 'user_1',
          mensagem: userMsg,
          resposta: result.response,
          acaoGerada: result.action
        })
      });

    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: "Ops, algo deu errado. Tente novamente." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const processAction = async (action: string, actionData: any) => {
    let endpoint = '';
    let payload = { ...actionData, companyId: 'comp_1', data: new Date().toISOString().split('T')[0] };

    switch (action) {
      case 'REGISTER_FUEL':
        endpoint = '/api/fuel_logs';
        break;
      case 'REGISTER_EXPENSE':
        endpoint = '/api/expenses';
        break;
      case 'REGISTER_CASH':
        endpoint = '/api/cash_flow';
        break;
    }

    if (endpoint) {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Chat Header */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
            <Sparkles className="text-white w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">GBFleet Assistant</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-xs text-slate-500 font-medium">Online e pronto para ajudar</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-60">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <Bot className="text-slate-400 w-8 h-8" />
            </div>
            <div>
              <p className="font-semibold text-slate-600">Como posso ajudar hoje?</p>
              <p className="text-sm text-slate-400 max-w-xs">Você pode registrar abastecimentos, despesas ou pedir análises da sua frota.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              <button onClick={() => setInput("Abasteci 200 reais no caminhão ABC-1234 com 80 litros km 120000")} className="text-xs p-3 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-xl border border-slate-100 transition-colors text-left">
                "Abasteci 200 reais no caminhão ABC-1234..."
              </button>
              <button onClick={() => setInput("Qual o consumo médio da minha frota?")} className="text-xs p-3 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-xl border border-slate-100 transition-colors text-left">
                "Qual o consumo médio da minha frota?"
              </button>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "flex gap-4 max-w-[85%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                msg.role === 'user' ? "bg-slate-100" : "bg-blue-600"
              )}>
                {msg.role === 'user' ? <User size={16} className="text-slate-600" /> : <Bot size={16} className="text-white" />}
              </div>
              <div className={cn(
                "p-4 rounded-2xl text-sm leading-relaxed",
                msg.role === 'user' 
                  ? "bg-slate-900 text-white rounded-tr-none" 
                  : "bg-slate-100 text-slate-800 rounded-tl-none"
              )}>
                {msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <div className="flex gap-4 max-w-[85%]">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <Bot size={16} className="text-white" />
            </div>
            <div className="bg-slate-100 p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span className="text-sm text-slate-500">Pensando...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-6 border-t border-slate-100 bg-slate-50/50">
        <div className="relative flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Digite sua mensagem..."
            className="flex-1 bg-white border border-slate-200 rounded-2xl px-5 py-3.5 pr-14 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors shadow-lg shadow-blue-200"
          >
            <Send size={20} />
          </button>
        </div>
        <p className="text-[10px] text-center text-slate-400 mt-3 font-medium uppercase tracking-wider">
          GBFleet AI pode cometer erros. Verifique informações importantes.
        </p>
      </div>
    </div>
  );
}
