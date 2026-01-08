import React, { useState, useEffect } from 'react';
import { QuizAnswers } from '../types';
import WhatsAppCTA from './WhatsAppCTA';

interface MiniVSLProps {
  answers: QuizAnswers | null;
}

const MiniVSL: React.FC<MiniVSLProps> = ({ answers }) => {
  const [progress, setProgress] = useState(0);
  const [showCTA, setShowCTA] = useState(false);
  const [bitrate, setBitrate] = useState(15420);
  
  const LIBRARY_ID = "576472";
  const VIDEO_ID = "d5dd91fa-774e-46c8-840e-b4bb04fbf526";
  // Ativado controls para true para permitir que o usuário adiante o vídeo
  const bunnyEmbedUrl = `https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${VIDEO_ID}?autoplay=true&muted=false&controls=true&loop=false&preload=true&responsive=true`;

  useEffect(() => {
    const duration = 125; 
    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev + 1;
        // Mantemos a liberação do CTA após um tempo de "exposição" ou no final
        if (next >= 15) setShowCTA(true); 
        if (next >= duration) {
          clearInterval(interval);
          return duration;
        }
        return next;
      });
      setBitrate(prev => prev + (Math.random() > 0.5 ? 15 : -12));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Upper Status Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6">
        <div className="animate-[fadeInLeft_0.6s_ease-out]">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse"></div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter italic uppercase italic">SINAL LIBERADO</h2>
          </div>
          <p className="text-gray-500 font-medium text-sm">Verificação completa para dispositivo: <span className="text-white uppercase font-black tracking-widest text-xs px-2 py-1 glass rounded ml-1">{answers?.device || 'Terminal'}</span></p>
        </div>
        
        <div className="flex gap-4">
           <div className="glass p-4 rounded-2xl border-white/5 min-w-[120px] text-center border-l-2 border-l-cyan-500">
              <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Oferta Especial</p>
              <p className="text-white font-black text-lg italic">R$ 29,90<span className="text-[10px] text-gray-400">/mês</span></p>
           </div>
           <div className="glass p-4 rounded-2xl border-white/5 min-w-[120px] text-center">
              <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Qualidade</p>
              <p className="text-cyan-400 font-black text-sm uppercase">Ultra HD</p>
           </div>
        </div>
      </div>

      {/* Main Content Area: Video + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-16">
        
        {/* Video Player Section */}
        <div className="lg:col-span-3 space-y-6">
          <div className="relative rounded-[2.5rem] bg-black border border-white/10 overflow-hidden shadow-[0_0_80px_rgba(0,229,255,0.1)]">
            {/* Decorative Tech Overlay */}
            <div className="absolute top-4 right-6 z-20 flex space-x-4 pointer-events-none">
               <div className="text-[9px] font-mono text-cyan-500 bg-black/60 px-3 py-1 rounded border border-cyan-500/20 backdrop-blur-md">
                  LIVE STREAM SECURE: AES-256
               </div>
            </div>

            <div className="relative w-full select-none" style={{ padding: '56.25% 0 0 0' }}>
              <iframe 
                src={bunnyEmbedUrl} 
                className="absolute inset-0 w-full h-full"
                style={{ border: 0 }} 
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" 
                allowFullScreen
              ></iframe>
            </div>

            {/* Bottom Tech Bar */}
            <div className="bg-[#050508] border-t border-white/5 p-5 flex flex-col md:flex-row items-center justify-between px-8 gap-4">
               <div className="flex items-center space-x-8">
                  <div className="flex items-center space-x-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-ping"></div>
                     <span className="text-[10px] text-cyan-500 font-black uppercase tracking-widest">Sincronizando...</span>
                  </div>
                  <div className="hidden md:block">
                     <p className="text-[8px] text-gray-600 font-black uppercase">Bitrate</p>
                     <p className="text-xs text-white font-mono">{bitrate.toLocaleString()} kbps</p>
                  </div>
               </div>
               
               <div className="flex-1 w-full md:max-w-[300px] md:mx-8">
                  <div className="flex justify-between items-end mb-1.5">
                    <p className="text-[8px] text-gray-500 font-black uppercase">Progresso da Sincronização</p>
                    <p className="text-[9px] text-cyan-500 font-mono font-bold">{Math.min(100, Math.floor((progress/60)*100))}%</p>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                     <div 
                        className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.5)] transition-all duration-1000 ease-linear" 
                        style={{ width: `${Math.min(100, (progress/60)*100)}%` }}
                     ></div>
                  </div>
               </div>
            </div>
          </div>
          
          <div className="p-6 glass rounded-3xl border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
             <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div>
                   <p className="text-sm text-gray-400 font-medium leading-tight">Configuração de sinal <span className="text-white font-bold">VIP Platinum</span> detectada.</p>
                   <p className="text-[10px] text-cyan-500/70 font-black uppercase tracking-widest mt-1">Assista ao vídeo para liberar sua chave de acesso</p>
                </div>
             </div>
             <div className="text-right">
                <p className="text-[10px] text-gray-600 font-black uppercase">Server Status</p>
                <p className="text-xs text-green-500 font-bold">OPERACIONAL</p>
             </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-4">
           {/* Price Emphasis Box */}
           <div className="p-8 glass rounded-[2.5rem] border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-purple-600/5 shadow-xl relative overflow-hidden group">
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
                 <p className="text-[9px] text-gray-500 mt-2 font-medium">Acesso imediato a todos os canais, filmes e séries sem limites.</p>
              </div>
           </div>

           <div className="p-6 glass rounded-3xl border-white/5">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center">
                 <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2 animate-pulse"></span>
                 Atividade Recente
              </h4>
              <div className="space-y-4">
                 {[1,2,3].map(i => (
                   <div key={i} className="flex items-center space-x-3 text-[10px] opacity-70">
                      <div className="w-1 h-1 rounded-full bg-gray-600"></div>
                      <p className="text-gray-400 font-bold uppercase"><span className="text-white">USER_{Math.floor(Math.random()*900)+100}</span> ACESSOU O SINAL</p>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>

      {/* CTA SECTION */}
      <div className="max-w-3xl mx-auto">
        {showCTA ? (
          <div className="animate-[fadeInUp_0.8s_ease-out]">
            <div className="text-center mb-10">
               <div className="inline-block px-4 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-full mb-4">
                  <p className="text-[10px] text-cyan-400 font-black uppercase tracking-[0.3em]">Sincronização Finalizada</p>
               </div>
               <h3 className="text-4xl font-black italic tracking-tighter uppercase mb-2 text-white">Liberação Confirmada!</h3>
               <p className="text-gray-400 text-sm font-medium">Sua vaga premium está garantida. Clique abaixo para receber os dados de acesso.</p>
            </div>
            <WhatsAppCTA />
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center glass rounded-[3rem] border-white/5">
            <div className="relative w-20 h-20 mb-8">
              <div className="absolute inset-0 border-4 border-white/5 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-cyan-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                 <span className="text-[10px] font-black text-cyan-500">{Math.min(100, Math.floor((progress/60)*100))}%</span>
              </div>
            </div>
            <p className="text-xs uppercase tracking-[0.5em] font-black text-gray-500 animate-pulse">Autenticando Túnel de Dados...</p>
            <p className="text-[10px] text-gray-600 mt-4 max-w-xs text-center leading-relaxed">Aguarde o processamento para liberar sua chave de acesso.</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeInLeft { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default MiniVSL;