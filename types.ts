
export enum FunnelStep {
  LANDING = 'LANDING',
  QUIZ = 'QUIZ',
  VSL = 'VSL',
  WHATSAPP = 'WHATSAPP'
}

export interface QuizAnswers {
  problem: string;
  device: string;
  subDevice?: string;
  contentType: string;
  frequency: string;
  expectation: string;
  frustration: string;
  intent: string;
}

export interface VSLState {
  isPlaying: boolean;
  isCompleted: boolean;
  currentTime: number;
  duration: number;
}