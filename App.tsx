import React, { useState, useEffect } from 'react';
import { FunnelStep, QuizAnswers } from './types';
import LandingPage from './components/LandingPage';
import QuizModal from './components/QuizModal';
import MiniVSL from './components/MiniVSL';

export default function App() {
  const [currentStep, setCurrentStep] = useState<FunnelStep>(FunnelStep.LANDING);
  const [showQuiz, setShowQuiz] = useState(false);
  const [answers, setAnswers] = useState<QuizAnswers | null>(null);

  useEffect(() => {
    // Timer para abrir o Quiz automaticamente após 12 segundos, conforme solicitado
    const timer = setTimeout(() => {
      if (currentStep === FunnelStep.LANDING) {
        setShowQuiz(true);
      }
    }, 12000);
    return () => clearTimeout(timer);
  }, [currentStep]);

  const handleStartQuiz = () => {
    setShowQuiz(true);
  };

  const handleQuizComplete = (finalAnswers: QuizAnswers) => {
    setAnswers(finalAnswers);
    setShowQuiz(false);
    setCurrentStep(FunnelStep.VSL);
  };

  return (
    <div className="w-full min-h-screen flex flex-col">
      <main className="flex-grow">
        {currentStep === FunnelStep.LANDING && (
          <LandingPage onStartQuiz={handleStartQuiz} />
        )}
        {currentStep === FunnelStep.VSL && (
          <MiniVSL answers={answers} />
        )}
      </main>

      {showQuiz && (
        <QuizModal 
          onClose={() => setShowQuiz(false)} 
          onComplete={handleQuizComplete} 
        />
      )}

      <footer className="py-10 text-center border-t border-white/5 bg-black/20">
        <p className="text-gray-500 text-[10px] uppercase tracking-[0.2em]">
          © 2024 TechView • Tecnologia de Ponta em Entretenimento
        </p>
      </footer>
    </div>
  );
}