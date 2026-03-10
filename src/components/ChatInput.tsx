import React from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  chatInput: string;
  setChatInput: (val: string) => void;
  handleTextSend: (text: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ chatInput, setChatInput, handleTextSend }) => {
  return (
    <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0">
      <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-xl p-1 shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
        <input 
          type="text" 
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleTextSend(chatInput); }}
          placeholder="Skriv ett meddelande..."
          className="flex-1 bg-transparent border-none outline-none px-3 py-2 text-slate-700"
        />
        <button 
          onClick={() => handleTextSend(chatInput)}
          disabled={!chatInput.trim()}
          className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};
