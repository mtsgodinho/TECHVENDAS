import React, { useState, useEffect } from 'react';
import { QuizAnswers } from '../types';
import WhatsAppCTA from './WhatsAppCTA';
import Roulette from './Roulette';

interface MiniVSLProps {
  answers: QuizAnswers | null;
}

const MiniVSL: React.FC<MiniVSLProps> = ({ answers }) => {
  const [progress, setProgress] = useState(0);
  const [showRoulette, setShowRoulette] = useState(false);
  const [showCTA, setShowCTA] = useState(false);
  const [bitrate, setBitrate] = useState(15420);
  
  // 1 minuto e 50 segundos = 110 segundos
  const DURATION_SECONDS = 110;

  const LIBRARY_ID = "576472";
  const VIDEO_ID = "d5dd91fa-774e-46c8-840e-b4bb04fbf526";
  const bunnyEmbedUrl = `https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${VIDEO_ID}?autoplay=true&muted=false&controls=true&loop=false&preload=true&responsive=true`;

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev + 1;
        if (next >= DURATION_SECONDS) {
          clearInterval(interval);
          setShowRoulette(true);
          return DURATION_SECONDS;
        }
        return next;
      });
      setBitrate(prev => prev + (Math.random() > 0.5 ? 15 : -12));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRouletteFinish = () => {
    setShowRoulette(false);
    setShowCTA(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12">
      {/* Upper Status Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
        <div className="animate-[fadeInLeft_0.6s_ease-out] text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start space-x-3 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse"></div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter italic uppercase italic">SINAL LIBERADO</h2>
          </div>
          <p className="text-gray-500 font-medium text-sm">Dispositivo Otimizado: <span className="text-white uppercase font-black tracking-widest text-xs px-2 py-1 glass rounded ml-1">{answers?.device || 'Terminal'}</span></p>
        </div>
        
        <div className="flex gap-4">
           <div className="glass p-4 rounded-2xl border-white/5 min-w-[120px] text-center border-l-2 border-l-cyan-500">
              <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Oferta Especial</p>
              <p className="text-white font-black text-lg italic">R$ 29,90<span className="text-[10px] text-gray-400">/mês</span></p>
           </div>
           <div className="hidden sm:block glass p-4 rounded-2xl border-white/5 min-w-[120px] text-center">
              <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Qualidade</p>
              <p className="text-cyan-400 font-black text-sm uppercase">Ultra HD</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        <div className="lg:col-span-3 space-y-6">
          <div className="relative rounded-[2rem] md:rounded-[2.5rem] bg-black border border-white/10 overflow-hidden shadow-[0_0_80px_rgba(0,229,255,0.15)]">
            <div className="absolute top-4 right-6 z-20 hidden md:flex space-x-4 pointer-events-none">
               <div className="text-[9px] font-mono text-cyan-500 bg-black/60 px-3 py-1 rounded border border-cyan-500/20 backdrop-blur-md">
                  ENCRYPTED STREAM: SSL/TLS
               </div>
            </div>

            <div className="relative w-full" style={{ padding: '56.25% 0 0 0' }}>
              <iframe 
                src={bunnyEmbedUrl} 
                className="absolute inset-0 w-full h-full"
                style={{ border: 0 }} 
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" 
                allowFullScreen
              ></iframe>
            </div>

            <div className="bg-[#050508] border-t border-white/5 p-4 flex items-center justify-between px-6 md:px-8">
               <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                     <span className="text-[10px] text-green-500 font-black uppercase tracking-widest">Live</span>
                  </div>
                  <div className="hidden sm:block">
                     <p className="text-[8px] text-gray-600 font-black uppercase">Taxa de Dados</p>
                     <p className="text-[10px] text-white font-mono">{bitrate.toLocaleString()} kbps</p>
                  </div>
               </div>
               <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-gray-500 font-bold uppercase">Sinal:</span>
                  <span className="text-[10px] text-cyan-500 font-black">EXCELENTE</span>
               </div>
            </div>
          </div>

          <div className="w-full">
            {showRoulette ? (
              <Roulette onFinish={handleRouletteFinish} />
            ) : showCTA ? (
              <div className="animate-[fadeInUp_0.8s_ease-out] bg-cyan-500/5 rounded-[2.5rem] p-6 md:p-10 border border-cyan-500/20 shadow-2xl">
                <div className="text-center mb-8">
                   <div className="inline-block px-4 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full mb-4">
                      <p className="text-[10px] text-green-400 font-black uppercase tracking-[0.3em]">Benefício de Ativação Reservado</p>
                   </div>
                   <h3 className="text-3xl md:text-4xl font-black italic tracking-tighter uppercase mb-2 text-white">Finalize sua Ativação</h3>
                   <p className="text-gray-400 text-sm font-medium">Toque abaixo para ativar seu plano com <span className="text-white font-bold uppercase underline decoration-green-500 underline-offset-4">Taxa de Instalação Grátis</span>.</p>
                </div>
                <div className="max-w-2xl mx-auto">
                  <WhatsAppCTA answers={answers} />
                </div>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center bg-white/[0.02] border border-white/5 rounded-[2.5rem] relative overflow-hidden">
                <div className="relative w-32 h-32 md:w-40 md:h-40 mb-8 scale-110">
                  <svg className="w-full h-full -rotate-90 transform">
                    <circle
                      cx="50%" cy="50%" r="45%"
                      className="fill-none stroke-white/5 stroke-[6px]"
                    />
                    <circle
                      cx="50%" cy="50%" r="45%"
                      className="fill-none stroke-cyan-500 stroke-[8px] transition-all duration-1000 ease-linear shadow-[0_0_20px_rgba(0,229,255,0.5)]"
                      style={{ 
                        strokeDasharray: '283', 
                        strokeDashoffset: `${283 - (283 * Math.min(100, (progress/DURATION_SECONDS)*100)) / 100}` 
                      }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                     <span className="text-2xl md:text-3xl font-black text-white italic">{Math.min(100, Math.floor((progress/DURATION_SECONDS)*100))}%</span>
                     <span className="text-[8px] font-black text-cyan-500 uppercase tracking-widest mt-1">Sincronia</span>
                  </div>
                  <div className="absolute inset-0 bg-cyan-500/10 blur-3xl rounded-full -z-10 animate-pulse"></div>
                </div>

                <div className="text-center px-6">
                  <p className="text-xs uppercase tracking-[0.4em] font-black text-cyan-400 animate-pulse mb-3">Liberando Chave de Acesso...</p>
                  <p className="text-[10px] md:text-xs text-gray-500 max-w-sm mx-auto leading-relaxed font-bold">
                    Aguarde o processamento para resgatar sua oferta exclusiva de ativação premiada.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
           <div className="p-8 glass rounded-[2rem] border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-purple-600/5 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2">
                 <div className="bg-cyan-500 text-black text-[8px] font-black px-2 py-0.5 rounded-bl-lg uppercase tracking-tighter">OFERTA ATIVA</div>
              </div>
              
              <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-4">Investimento</h4>
              <div className="mb-4">
                <p className="text-5xl font-[900] text-white tracking-tighter italic">R$ 29,90</p>
                <p className="text-xs text-gray-400 font-bold -mt-1">por mês no plano anual</p>
              </div>
              
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5 group-hover:border-cyan-500/30 transition-colors">
                 <p className="text-cyan-400 font-black text-sm leading-tight italic uppercase">
                    Menos de R$ 1,00 <br />
                    <span className="text-white">por dia</span>
                 </p>
              </div>
           </div>

           <div className="p-6 glass rounded-2xl border-white/5">
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center">
                 <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2 animate-pulse"></span>
                 Atividade no Servidor
              </h4>
              <div className="space-y-3">
                 {[1,2,3,4].map(i => (
                   <div key={i} className="flex items-center space-x-3 text-[9px] opacity-70">
                      <div className="w-1 h-1 rounded-full bg-cyan-500"></div>
                      <p className="text-gray-400 font-bold uppercase"><span className="text-white">ID_{Math.floor(Math.random()*9000)+1000}</span> RESERVOU VAGA</p>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInLeft { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default MiniVSL;