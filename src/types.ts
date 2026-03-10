export type TimelineEvent = {
  id: string;
  timestamp: number;
  type: 'user_image' | 'teacher_image' | 'expert_note' | 'user_text' | 'teacher_text';
  source?: 'typed' | 'spoken';
  content: string;
};

export type PaneType = 'draw' | 'camera' | 'board' | 'plan';

export type PaneState = {
  id: 1 | 2;
  type: PaneType;
  data?: any;
};
