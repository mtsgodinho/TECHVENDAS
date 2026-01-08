import React, { useState, useEffect } from 'react';
import { IMAGES } from '../constants';

interface LandingPageProps {
  onStartQuiz: () => void;
}

const ImageCarrousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % IMAGES.carrousel.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full max-w-4xl mx-auto overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl">
      <div 
        className="flex transition-transform duration-700 ease-in-out" 
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {IMAGES.carrousel.map((img, idx) => (
          <div key={idx} className="min-w-full">
            <img src={img} alt={`Slide ${idx}`} className="w-full h-auto object-cover" />
          </div>
        ))}
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex space-x-2">
        {IMAGES.carrousel.map((_, idx) => (
          <div 
            key={idx} 
            className={`w-2 h-2 rounded-full transition-all ${idx === currentIndex ? 'bg-cyan-500 w-6' : 'bg-white/30'}`}
          />
        ))}
      </div>
    </div>
  );
};

export default function LandingPage({ onStartQuiz }: LandingPageProps) {
  return (
    <div className="w-full flex flex-col items-center">
      
      {/* === BLOCO 1: HERO === */}
      <section className="w-full relative min-h-screen flex flex-col items-center">
        <div className="w-full max-w-[1440px] mx-auto">
          <img 
            src={IMAGES.hero} 
            alt="TechView Hero" 
            className="w-full h-auto object-cover animate-[fadeIn_1.2s_ease-out]"
          />
        </div>
        
        <div className="max-w-4xl text-center px-6 -mt-10 md:-mt-20 z-10">
          <h1 className="text-4xl md:text-7xl font-[900] text-white mb-6 tracking-tighter leading-tight drop-shadow-2xl">
            Assista Futebol, Filmes e Séries <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00E5FF] to-[#7B2CFF]">
              Com Qualidade Premium e Sem Travar
            </span>
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed font-medium mb-10">
            A experiência definitiva para quem exige imagem, estabilidade e variedade.
          </p>
          
          <button 
            onClick={onStartQuiz}
            className="bg-white text-black px-12 py-5 rounded-full font-black uppercase text-sm tracking-widest hover:scale-105 transition-all shadow-[0_20px_40px_rgba(0,229,255,0.3)] animate-bounce"
          >
            Verificar Disponibilidade
          </button>
        </div>
      </section>

      {/* === BLOCO 2: EXPERIÊNCIA / DESEJO === */}
      <section className="w-full py-24 bg-gradient-to-b from-transparent to-black/40 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-black text-white mb-12 tracking-tighter uppercase italic">
            Tudo o que você quer assistir, em um só lugar.
          </h2>
          <ImageCarrousel />
        </div>
      </section>

      {/* === BLOCO 3: QUALIDADE E FUNCIONAMENTO === */}
      <section className="w-full py-24 px-6 glass border-y border-white/5">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1">
            <img 
              src={IMAGES.quality} 
              alt="Qualidade TechView" 
              className="w-full h-auto rounded-[3rem] shadow-[0_0_50px_rgba(0,229,255,0.1)] border border-white/5"
            />
          </div>
          <div className="order-1 md:order-2 space-y-8">
            <h3 className="text-4xl font-black text-white tracking-tighter leading-none italic uppercase">
              O Padrão de Ouro <br /><span className="text-cyan-500">do Entretenimento</span>
            </h3>
            <ul className="space-y-6">
              {[
                "Futebol ao vivo em alta definição",
                "Filmes e séries sempre atualizados",
                "Imagem estável e fluida",
                "Compatível com Smart TV, celular e computador"
              ].map((item, idx) => (
                <li key={idx} className="flex items-center space-x-4 group">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-black group-hover:bg-cyan-500 group-hover:text-black transition-all">
                    ✓
                  </div>
                  <span className="text-gray-300 font-bold text-lg uppercase tracking-tight">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* === BLOCO 4: AUTORIDADE E CONFIANÇA === */}
      <section className="w-full py-32 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="mb-12 relative inline-block">
             <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full"></div>
             <img 
               src={IMAGES.authority} 
               alt="Autoridade TechView" 
               className="relative z-10 w-full max-w-2xl mx-auto rounded-[3rem] shadow-2xl border border-white/10"
             />
          </div>
          
          <h2 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tighter italic uppercase">
            Tecnologia de verdade para <br />
            <span className="text-gradient">quem não aceita travamentos</span>
          </h2>
          
          <p className="text-gray-500 text-lg md:text-xl max-w-3xl mx-auto leading-relaxed font-medium mb-12">
            A TechView utiliza uma estrutura robusta para entregar estabilidade, qualidade e a melhor experiência de transmissão disponível no mercado.
          </p>

          <button 
            onClick={onStartQuiz}
            className="group relative inline-flex items-center justify-center px-10 py-6 font-black text-white uppercase tracking-widest overflow-hidden rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500 transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="relative z-10 group-hover:text-black transition-colors">Quero Minha Vaga Premium</span>
          </button>
        </div>
      </section>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}