import React from 'react';

export const COLORS = {
  azulTech: '#0A1AFF',
  cianoNeon: '#00E5FF',
  roxoTech: '#7B2CFF',
  bgDark: '#020205'
};

export const IMAGES = {
  hero: "https://i.imgur.com/chDta6O.png",
  carrousel: [
    "https://i.imgur.com/KYzTo7K.png",
    "https://i.imgur.com/P2Ier3e.png",
    "https://i.imgur.com/X3ILYJ9.png"
  ],
  quality: "https://i.imgur.com/6RCloTW.png",
  authority: "https://i.imgur.com/WdnQ8k0.png"
};

export const AstronautMascot = ({ className = "w-48 h-48" }: { className?: string }) => (
  <div className={`${className} flex items-center justify-center`}>
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{stopColor:'#00E5FF', stopOpacity:1}} />
          <stop offset="100%" style={{stopColor:'#7B2CFF', stopOpacity:1}} />
        </linearGradient>
      </defs>
      
      <circle cx="100" cy="100" r="90" stroke="url(#grad1)" strokeWidth="1" strokeDasharray="5,5" fill="none">
        <animateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="20s" repeatCount="indefinite" />
      </circle>

      <g transform="translate(0, -5)">
        <rect x="75" y="60" width="50" height="45" rx="12" fill="#0A1AFF" stroke="#00E5FF" strokeWidth="2" />
        <rect x="82" y="68" width="36" height="25" rx="6" fill="#00E5FF" fillOpacity="0.2" />
        <path d="M80 105 L75 145 L125 145 L120 105 Z" fill="#0A1AFF" stroke="#7B2CFF" strokeWidth="2" />
        <circle cx="92" cy="78" r="1.5" fill="white" />
        <circle cx="108" cy="78" r="1.5" fill="white" />
      </g>
    </svg>
  </div>
);

export const WHATSAPP_NUMBER = "5511999999999"; 
export const WHATSAPP_MESSAGE = "Oi! Vi a apresentação da TechView e quero garantir minha vaga no sistema premium. Como faço para ativar?";