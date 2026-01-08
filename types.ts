
export enum FunnelStep {
  LANDING = 'LANDING',
  QUIZ = 'QUIZ',
  VSL = 'VSL',
  WHATSAPP = 'WHATSAPP'
}

export interface QuizAnswers {
  device: string;
  preference: string;
  urgency: string;
}

export interface VSLState {
  isPlaying: boolean;
  isCompleted: boolean;
  currentTime: number;
  duration: number;
}
