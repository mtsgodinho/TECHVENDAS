import React from 'react';
import { WHATSAPP_NUMBER } from '../constants';
import { QuizAnswers } from '../types';

interface WhatsAppCTAProps {
  answers: QuizAnswers | null;
}

const WhatsAppCTA: React.FC<WhatsAppCTAProps> = ({ answers }) => {
  const handleClick = () => {
    const diagnosticInfo = answers ? `
----------------------------
🔍 MEU DIAGNÓSTICO:
• Problema: ${answers.problem}
• Dispositivo: ${answers.device} (${answers.subDevice || 'Não especificado'})
• Conteúdo: ${answers.contentType}
• Frequência: ${answers.frequency}
• Intenção: ${answers.intent}
🎁 PRÊMIO: Taxa de Instalação Grátis
----------------------------` : '';

    const baseMessage = "Oi! Vi a apresentação da TechView e quero garantir minha vaga no sistema premium com meu bônus de INSTALAÇÃO GRÁTIS.";
    const fullMessage = `${baseMessage}${diagnosticInfo}\n\nComo faço para ativar?`;
    
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(fullMessage)}`;
    
    console.log('[TRACKING]: InitiateCheckout');
    window.open(url, '_blank');
  };

  return (
    <div className="relative group">
      {/* Dynamic Glow Behind Button */}
      <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-3xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
      
      <button 
        onClick={handleClick}
        className="relative w-full bg-white text-black py-6 px-10 rounded-2xl flex items-center justify-between overflow-hidden shadow-2xl transform active:scale-95 transition-all"
      >
        <div className="flex flex-col items-start text-left">
          <span className="text-xs font-black uppercase tracking-[0.3em] opacity-40 mb-1">Passo Final</span>
          <span className="text-xl md:text-2xl font-black uppercase tracking-tighter italic">Liberar Acesso Agora</span>
        </div>
        
        <div className="flex items-center space-x-4">
           <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766 0-3.18-2.587-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-1.157-.459-1.956-1.168-.614-.545-1.013-1.213-1.133-1.417-.121-.203-.013-.314.088-.415.091-.091.203-.236.304-.354.101-.118.135-.203.203-.338.068-.135.034-.253-.017-.354-.051-.101-.454-1.093-.623-1.503-.164-.397-.333-.343-.454-.349l-.388-.007c-.135 0-.354.051-.54.253-.186.203-.708.692-.708 1.687 0 .996.725 1.959.826 2.093.101.135 1.428 2.18 3.459 3.058.483.209.86.334 1.154.428.486.154.928.132 1.278.08.39-.058 1.198-.49 1.367-.963.169-.473.169-.878.118-.963-.051-.085-.186-.135-.371-.22z"/>
              </svg>
           </div>
           <svg className="w-6 h-6 animate-[moveX_1s_infinite]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
        </div>

        {/* Shimmer Effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
      </button>

      <div className="mt-8 flex flex-col items-center">
        <div className="flex -space-x-3 mb-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="w-10 h-10 rounded-full border-4 border-[#020205] overflow-hidden bg-gray-800">
              <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="user" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest text-center">
          Junte-se a <span className="text-white">+14.300 clientes</span> satisfeitos hoje.
        </p>
      </div>

      <style>{`
        @keyframes moveX { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(10px); } }
        @keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
      `}</style>
    </div>
  );
};

export default WhatsAppCTA;