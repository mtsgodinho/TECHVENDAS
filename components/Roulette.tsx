import React, { useState, useEffect } from 'react';

interface RouletteProps {
  onFinish: () => void;
}

const Roulette: React.FC<RouletteProps> = ({ onFinish }) => {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);

  // Lista de 8 prêmios conforme solicitado
  const prizes = [
    { label: "1 MÊS GRÁTIS", color: "#7B2CFF" },      // 0
    { label: "100 REAIS", color: "#0A1AFF" },         // 1
    { label: "PLANO ANUAL", color: "#7B2CFF" },       // 2
    { label: "50 REAIS", color: "#0A1AFF" },          // 3
    { label: "PLANO TRIMESTRAL", color: "#7B2CFF" },  // 4
    { label: "20 REAIS", color: "#0A1AFF" },          // 5
    { label: "10 REAIS", color: "#7B2CFF" },          // 6
    { label: "INSTALAÇÃO GRÁTIS", color: "#00FF88" }  // 7 - ALVO
  ];

  const handleSpin = () => {
    if (spinning) return;
    
    setSpinning(true);
    
    // 360 / 8 = 45 graus por fatia. 
    const sectorAngle = 360 / prizes.length;
    const targetSectorIndex = 7; // INSTALAÇÃO GRÁTIS
    
    // A fatia i é renderizada com rotate(i * 45deg) e centralizada no eixo vertical superior.
    // Portanto, o centro da fatia i está na posição (i * 45) graus.
    // Para que o centro da fatia 7 (315°) fique no topo (0° ou 360°),
    // a roda deve girar R tal que: 315 + R = 360 * k
    // R = 360 * k - 315 = 45 graus (mais as voltas completas).
    
    const extraSpins = 10 + Math.floor(Math.random() * 5);
    const finalRotation = (extraSpins * 360) + (360 - (targetSectorIndex * sectorAngle));
    
    setRotation(finalRotation);

    setTimeout(() => {
      setSpinning(false);
      setShowResult(true);
      setTimeout(() => {
        onFinish();
      }, 4000);
    }, 5000);
  };

  return (
    <div className="flex flex-col items-center justify-center py-10 animate-[scaleIn_0.5s_ease-out]">
      <div className="text-center mb-12">
        <h3 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase text-white mb-2 leading-none">
          {showResult ? "SISTEMA SELECIONOU:" : "SORTEIO DE ATIVAÇÃO"}
        </h3>
        <p className="text-cyan-400 font-bold uppercase text-xs tracking-[0.3em]">
          {showResult ? "Bônus confirmado pela TechView" : "Gire para descobrir seu benefício de hoje"}
        </p>
      </div>

      <div className="relative w-80 h-80 md:w-[450px] md:h-[450px]">
        {/* Indicator - Posicionado exatamente no centro superior */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-30 filter drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]">
          <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
            <path d="M25 50L45 15H5L25 50Z" fill="white" />
          </svg>
        </div>

        {/* Outer Ring Decoration */}
        <div className="absolute -inset-4 border border-white/5 rounded-full animate-pulse"></div>
        <div className="absolute -inset-8 border border-white/5 rounded-full opacity-50"></div>

        {/* Wheel */}
        <div 
          className="w-full h-full rounded-full border-[10px] border-white/10 relative overflow-hidden transition-transform duration-[5000ms] cubic-bezier(0.15, 0, 0.15, 1) shadow-[0_0_120px_rgba(0,229,255,0.2)] bg-[#050508]"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          {prizes.map((prize, i) => (
            <div 
              key={i}
              className="absolute top-0 left-0 w-full h-full origin-center"
              style={{ transform: `rotate(${i * 45}deg)` }}
            >
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1/2 origin-bottom flex items-center justify-center pt-8"
                style={{ 
                  backgroundColor: prize.color,
                  clipPath: 'polygon(50% 100%, 11% 0, 89% 0)', // Ajuste leve para fechar melhor as fatias
                  opacity: i === 7 ? 1 : 0.6,
                  borderLeft: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                <span className="text-[8px] md:text-[10px] font-black text-white text-center uppercase tracking-tighter rotate-0 mt-[-30%] max-w-[50px] md:max-w-[70px] leading-tight">
                  {prize.label}
                </span>
              </div>
            </div>
          ))}
          
          {/* Central Hub */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 md:w-28 md:h-28 bg-[#050508] rounded-full border-4 border-white/20 z-20 flex items-center justify-center shadow-2xl">
              <div className="w-6 h-6 bg-cyan-500 rounded-full animate-ping opacity-50 absolute"></div>
              <div className="w-4 h-4 bg-white rounded-full relative z-30 shadow-[0_0_15px_white]"></div>
            </div>
          </div>
        </div>

        {/* Big Spin Button */}
        {!showResult && (
          <button 
            onClick={handleSpin}
            disabled={spinning}
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 px-8 py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-[0_20px_50px_rgba(255,255,255,0.2)] ${spinning ? 'opacity-0 scale-50 pointer-events-none' : 'bg-white text-black hover:scale-110 active:scale-95'}`}
          >
            RESGATAR PRÊMIO
          </button>
        )}
      </div>

      {showResult && (
        <div className="mt-12 p-8 glass rounded-[2.5rem] border-green-500/30 bg-green-500/10 animate-[fadeInUp_0.5s_ease-out] text-center max-w-lg">
          <p className="text-[10px] text-green-400 font-black uppercase tracking-[0.5em] mb-4">Prêmio Adquirido</p>
          <p className="text-3xl md:text-5xl font-black text-white italic leading-tight uppercase">TAXA DE INSTALAÇÃO <br /><span className="text-green-400">100% GRÁTIS</span></p>
        </div>
      )}

      <style>{`
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default Roulette;