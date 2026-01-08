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
  const bunnyEmbedUrl = `https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${VIDEO_ID}?autoplay=false&muted=false&controls=true&loop=false&preload=true&responsive=true`;

  useEffect(() => {
    const duration = 125; 
    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev + 1;
        if (next >= 45) setShowCTA(true); 
        if (next >= duration) {
          clearInterval(interval);
          return duration;
        }
        return next;
      });
      // Mock bitrate variance
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
           <div className="glass p-4 rounded-2xl border-white/5 min-w-[120px] text-center">
              <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Status</p>
              <p className="text-green-500 font-black text-sm">ESTÁVEL</p>
           </div>
           <div className="glass p-4 rounded-2xl border-white/5 min-w-[120px] text-center">
              <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Qualidade</p>
              <p className="text-cyan-400 font-black text-sm">4K HDR</p>
           </div>
        </div>
      </div>

      {/* Main Content Area: Video + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-16">
        
        {/* Video Player Section */}
        <div className="lg:col-span-3 space-y-6">
          <div className="relative rounded-[2.5rem] bg-black border border-white/5 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.5)]">
            {/* Decorative Tech Overlay */}
            <div className="absolute top-4 right-6 z-20 flex space-x-4 pointer-events-none opacity-60">
               <div className="text-[9px] font-mono text-cyan-500 bg-black/40 px-3 py-1 rounded border border-cyan-500/20">
                  ENCRYPTION: AES-256
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

            {/* Bottom Tech Bar */}
            <div className="bg-black/80 backdrop-blur-md border-t border-white/5 p-4 flex items-center justify-between px-8">
               <div className="flex items-center space-x-6">
                  <div className="hidden md:block">
                     <p className="text-[8px] text-gray-600 font-black uppercase">Taxa de Bits</p>
                     <p className="text-xs text-white font-mono">{bitrate.toLocaleString()} kbps</p>
                  </div>
                  <div>
                     <p className="text-[8px] text-gray-600 font-black uppercase">Latência</p>
                     <p className="text-xs text-white font-mono">24ms</p>
                  </div>
               </div>
               <div className="flex-1 max-w-[200px] mx-8">
                  <p className="text-[8px] text-gray-600 font-black uppercase mb-1">Sincronização</p>
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                     <div className="h-full bg-cyan-500 shadow-[0_0_10px_#00E5FF] transition-all duration-1000" style={{ width: `${(progress/125)*100}%` }}></div>
                  </div>
               </div>
            </div>
          </div>
          
          <div className="p-6 glass rounded-3xl border-white/5 flex items-center justify-between">
             <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <p className="text-sm text-gray-400 font-medium">Você está visualizando a configuração de sinal <span className="text-white font-bold">VIP Platinum</span>.</p>
             </div>
             <p className="text-[10px] text-gray-600 font-black uppercase hidden md:block">Server: BRA-SA-01</p>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-4">
           <div className="p-6 glass rounded-3xl border-white/5">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Em Tempo Real</h4>
              <div className="space-y-4">
                 {[1,2,3].map(i => (
                   <div key={i} className="flex items-center space-x-3 text-[10px] animate-pulse" style={{ animationDelay: `${i*0.5}s` }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                      <p className="text-gray-400 font-bold uppercase"><span className="text-white">USER_{Math.floor(Math.random()*900)+100}</span> ACESSOU O SINAL</p>
                   </div>
                 ))}
              </div>
           </div>
           
           <div className="p-8 glass rounded-[2.5rem] border-cyan-500/10 bg-gradient-to-br from-cyan-500/5 to-transparent">
              <h4 className="text-xs font-black text-cyan-500 uppercase tracking-widest mb-3">Destaque do Plano</h4>
              <p className="text-white font-black text-lg leading-tight mb-4 tracking-tighter italic">TESTE GRÁTIS DISPONÍVEL</p>
              <ul className="text-[10px] space-y-2 text-gray-400 font-bold uppercase">
                 <li className="flex items-center"><span className="text-cyan-500 mr-2">✓</span> SUPORTE 24/7</li>
                 <li className="flex items-center"><span className="text-cyan-500 mr-2">✓</span> SEM FIDELIDADE</li>
                 <li className="flex items-center"><span className="text-cyan-500 mr-2">✓</span> APP EXCLUSIVO</li>
              </ul>
           </div>
        </div>
      </div>

      {/* CTA SECTION */}
      <div className="max-w-3xl mx-auto">
        {showCTA ? (
          <div className="animate-[fadeInUp_0.8s_ease-out]">
            <div className="text-center mb-8">
               <h3 className="text-3xl font-black italic tracking-tighter uppercase mb-2">Liberação Confirmada!</h3>
               <p className="text-gray-500 text-sm">Clique no botão abaixo para receber seu código de acesso no WhatsApp.</p>
            </div>
            <WhatsAppCTA />
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-white/5 border-t-cyan-500 rounded-full animate-spin mb-6"></div>
            <p className="text-xs uppercase tracking-[0.4em] font-black text-gray-500 animate-pulse">Sincronizando Banco de Dados...</p>
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