import React, { useState } from 'react';
import { QuizAnswers } from '../types';

interface QuizModalProps {
  onClose: () => void;
  onComplete: (answers: QuizAnswers) => void;
}

const QuizModal: React.FC<QuizModalProps> = ({ onClose, onComplete }) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>({});
  const [isExiting, setIsExiting] = useState(false);

  const handleNext = (key: keyof QuizAnswers, value: string) => {
    const newAnswers = { ...answers, [key]: value };
    setAnswers(newAnswers);
    if (step < 3) {
      setStep(step + 1);
    } else {
      setIsExiting(true);
      setTimeout(() => onComplete(newAnswers as QuizAnswers), 500);
    }
  };

  const steps = [
    {
      title: "INICIANDO DIAGNÓSTICO",
      desc: "Nosso sistema irá analisar a melhor rota de sinal para sua região.",
      button: "Iniciar Scan",
      action: () => setStep(1)
    },
    {
      title: "HARDWARE DE SAÍDA",
      desc: "Qual dispositivo receberá o sinal?",
      key: "device",
      options: ["Smart TV", "Celular / Tablet", "TV Box / Firestick", "Computador"]
    },
    {
      title: "PREFERÊNCIAS DE FILTRO",
      desc: "O que o sistema deve priorizar?",
      key: "preference",
      options: ["Esportes ao Vivo", "Lançamentos Cinema", "Séries Completas", "Canais Variados"]
    },
    {
      title: "DISPONIBILIDADE",
      desc: "Deseja liberar o túnel de acesso agora?",
      key: "urgency",
      options: ["Sim, agora!", "Apenas testando"]
    }
  ];

  const current = steps[step];

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl transition-all duration-500 ${isExiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
      <div className="bg-[#050508] border border-white/10 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-[0_0_100px_rgba(0,229,255,0.15)] relative">
        
        {/* Top Progress Line */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-white/5 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-purple-600 transition-all duration-700 ease-out" 
            style={{ width: `${(step / 3) * 100}%` }}
          ></div>
        </div>

        <div className="p-10">
          <div className="text-center mb-10">
            <p className="text-cyan-500 text-[9px] font-black uppercase tracking-[0.4em] mb-3">Passo {step} de 3</p>
            <h2 className="text-3xl font-black text-white tracking-tighter italic uppercase">{current.title}</h2>
            <p className="text-gray-500 text-sm mt-3 font-medium">{current.desc}</p>
          </div>
          
          <div className="animate-[fadeInUp_0.4s_ease-out] space-y-3">
            {step === 0 ? (
              <button 
                onClick={current.action}
                className="w-full shimmer bg-gradient-to-br from-cyan-500 to-purple-600 py-5 rounded-2xl font-black text-lg uppercase tracking-widest shadow-[0_15px_30px_rgba(123,44,255,0.3)] hover:scale-[1.02] active:scale-95 transition-all"
              >
                {current.button}
              </button>
            ) : (
              current.options?.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleNext(current.key as keyof QuizAnswers, option)}
                  className="w-full text-left p-5 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-cyan-500/50 transition-all flex items-center group"
                >
                  <span className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center mr-5 text-xs font-black group-hover:bg-cyan-500 group-hover:text-black group-hover:border-cyan-500 transition-all">
                    0{idx + 1}
                  </span>
                  <span className="font-bold text-gray-300 group-hover:text-white">{option}</span>
                </button>
              ))
            )}
          </div>

          {step === 0 && (
            <button 
              onClick={onClose}
              className="mt-8 w-full text-gray-600 text-[10px] uppercase font-black tracking-widest hover:text-gray-400 transition-colors"
            >
              Cancelar Diagnóstico
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default QuizModal;