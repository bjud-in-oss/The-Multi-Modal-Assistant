export type TimelineEvent = {
  id: string;
  timestamp: number;
  type: 'user_image' | 'teacher_image' | 'expert_note' | 'user_text' | 'teacher_text';
  source?: 'typed' | 'spoken';
  content: string;
};
