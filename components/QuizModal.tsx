import React, { useState, useMemo } from 'react';
import { QuizAnswers } from '../types';

interface QuizModalProps {
  onClose: () => void;
  onComplete: (answers: QuizAnswers) => void;
}

const QuizModal: React.FC<QuizModalProps> = ({ onClose, onComplete }) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>({});
  const [isExiting, setIsExiting] = useState(false);
  const [showResult, setShowResult] = useState(false);

  // Lógica de progressão
  const handleAnswer = (key: keyof QuizAnswers, value: string) => {
    const newAnswers = { ...answers, [key]: value };
    setAnswers(newAnswers);

    // Lógica Condicional para a Pergunta de Dispositivo (Step 2)
    if (step === 2) {
      setStep(3); // Vai para a pergunta condicional
      return;
    }

    // Se estiver na pergunta condicional (Step 3), vai para a Pergunta 3 real (Step 4)
    if (step === 3) {
      setStep(4);
      return;
    }

    // Fluxo normal para as demais perguntas
    if (step < 8) {
      setStep(step + 1);
    } else {
      // Pergunta Final respondida, mostrar tela de resultado
      setShowResult(true);
    }
  };

  const currentConditionalOptions = useMemo(() => {
    switch (answers.device) {
      case "Smart TV": return { title: "Qual a marca da sua TV?", options: ["Samsung", "LG", "Philips", "TCL", "Outra marca"] };
      case "Celular": return { title: "Seu celular é Android ou iPhone?", options: ["Android", "iPhone (iOS)"] };
      case "Computador": return { title: "Qual sistema você usa no computador?", options: ["Windows", "Mac (Apple)"] };
      case "TV Box / Fire Stick / Mi Stick": return { title: "Qual desses você usa?", options: ["TV Box", "Fire Stick (Amazon)", "Mi Stick (Xiaomi)"] };
      default: return null;
    }
  }, [answers.device]);

  const steps = [
    {
      title: "INICIANDO DIAGNÓSTICO",
      desc: "Nosso sistema irá analisar a melhor rota de sinal para sua região.",
      type: "intro"
    },
    {
      title: "PRINCIPAL PROBLEMA",
      desc: "Qual o maior problema que você enfrenta hoje ao assistir seus conteúdos?",
      key: "problem",
      options: [
        "A transmissão trava bem na hora mais importante",
        "A qualidade da imagem não é boa",
        "Conteúdos somem ou não funcionam",
        "Quando dá problema, ninguém resolve"
      ]
    },
    {
      title: "DISPOSITIVO PRINCIPAL",
      desc: "Em qual dispositivo você pretende assistir?",
      key: "device",
      options: ["Smart TV", "Celular", "Computador", "TV Box / Fire Stick / Mi Stick"]
    },
    {
      title: currentConditionalOptions?.title || "ESPECIFICAÇÃO",
      desc: "Ajustando parâmetros de compatibilidade...",
      key: "subDevice",
      options: currentConditionalOptions?.options || []
    },
    {
      title: "TIPO DE CONTEÚDO",
      desc: "O que você mais pretende assistir?",
      key: "contentType",
      options: ["Futebol ao vivo", "Filmes e séries", "Canais ao vivo", "Um pouco de tudo"]
    },
    {
      title: "FREQUÊNCIA DE USO",
      desc: "Com que frequência você costuma assistir?",
      key: "frequency",
      options: ["Todos os dias", "Quase todos os dias", "Apenas em jogos ou eventos", "Uso ocasional"]
    },
    {
      title: "EXPECTATIVA PRINCIPAL",
      desc: "O que é mais importante para você?",
      key: "expectation",
      options: ["Não travar em nenhum momento", "Imagem em alta qualidade", "Ter bastante conteúdo disponível", "Poder assistir em qualquer lugar"]
    },
    {
      title: "FRUSTRAÇÃO REAL",
      desc: "O que mais te irrita quando algo não funciona como deveria?",
      key: "frustration",
      options: [
        "Travar no momento mais importante",
        "Imagem ruim ou fora de sincronia",
        "Aplicativo confuso ou difícil de usar",
        "Falta de suporte quando preciso"
      ]
    },
    {
      title: "INTENÇÃO",
      desc: "Se existisse um serviço que resolvesse tudo isso, você gostaria de conhecer?",
      key: "intent",
      options: ["Sim, com certeza", "Sim, dependendo do valor", "Talvez", "Não tenho interesse agora"]
    }
  ];

  const current = steps[step];
  const progress = (step / (steps.length - 1)) * 100;

  if (showResult) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-[fadeIn_0.5s_ease-out]">
        <div className="bg-[#050508] border border-white/10 rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-[0_0_100px_rgba(0,229,255,0.2)] p-10 text-center">
          <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-cyan-500/30">
            <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic mb-6">Diagnóstico Concluído</h2>
          <div className="glass p-6 rounded-3xl mb-8 text-left border-white/5">
            <p className="text-gray-300 font-medium leading-relaxed">
              Pelo que você respondeu, você precisa de uma experiência <span className="text-cyan-400 font-bold">estável</span>, com <span className="text-white font-bold">alta qualidade de imagem</span> e compatível com seu <span className="text-purple-400 font-bold">{answers.device}</span>.
            </p>
            <p className="text-gray-400 text-sm mt-4">
              A TechView foi criada exatamente para resolver o problema de <span className="italic">"{answers.problem}"</span> que você enfrenta hoje.
            </p>
          </div>
          
          <button 
            onClick={() => {
              setIsExiting(true);
              setTimeout(() => onComplete(answers as QuizAnswers), 500);
            }}
            className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 py-6 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl hover:scale-[1.02] transition-all"
          >
            Ver Apresentação do Sistema
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl transition-all duration-500 ${isExiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
      <div className="bg-[#050508] border border-white/10 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-[0_0_100px_rgba(0,229,255,0.15)] relative">
        
        {/* Top Progress Line */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-white/5 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-purple-600 transition-all duration-700 ease-out" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className="p-10">
          <div className="text-center mb-10">
            <p className="text-cyan-500 text-[9px] font-black uppercase tracking-[0.4em] mb-3">
              {step === 0 ? "Configurando" : `Analise ${Math.floor(progress)}%`}
            </p>
            <h2 className="text-3xl font-black text-white tracking-tighter italic uppercase leading-none">{current.title}</h2>
            <p className="text-gray-500 text-sm mt-3 font-medium">{current.desc}</p>
          </div>
          
          <div className="animate-[fadeInUp_0.4s_ease-out] space-y-3">
            {current.type === "intro" ? (
              <button 
                onClick={() => setStep(1)}
                className="w-full shimmer bg-gradient-to-br from-cyan-500 to-purple-600 py-5 px-4 rounded-2xl font-black text-lg uppercase tracking-widest shadow-[0_15px_30px_rgba(123,44,255,0.3)] hover:scale-[1.02] active:scale-95 transition-all leading-tight"
              >
                Iniciar avaliação de alta precisão
              </button>
            ) : (
              current.options?.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAnswer(current.key as keyof QuizAnswers, option)}
                  className="w-full text-left p-5 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-cyan-500/50 transition-all flex items-center group"
                >
                  <span className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center mr-5 text-xs font-black group-hover:bg-cyan-500 group-hover:text-black group-hover:border-cyan-500 transition-all shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-bold text-gray-300 group-hover:text-white leading-tight">{option}</span>
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
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default QuizModal;