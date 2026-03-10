import React from 'react';
import { MessageSquare, Pin, PinOff, X, Trash2 } from 'lucide-react';
import { TimelineEvent } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ChatInput } from './ChatInput';

interface SidebarProps {
  isPinned: boolean;
  setIsPinned: (val: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (val: boolean) => void;
  timeline: TimelineEvent[];
  deleteTimelineEvent: (id: string) => void;
  onEventClick: (event: TimelineEvent) => void;
  chatInput: string;
  setChatInput: (val: string) => void;
  handleTextSend: (text: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isPinned,
  setIsPinned,
  sidebarOpen,
  setSidebarOpen,
  timeline,
  deleteTimelineEvent,
  onEventClick,
  chatInput,
  setChatInput,
  handleTextSend
}) => {
  return (
    <div className={`${isPinned ? 'relative w-full lg:flex-1' : 'fixed inset-y-0 left-0 z-50 w-80 lg:relative lg:w-80'} bg-white border-r border-slate-200 shadow-2xl lg:shadow-none transform transition-transform duration-300 flex flex-col ${sidebarOpen || isPinned ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
        <h2 className="font-bold text-slate-700 flex items-center gap-2">
          <MessageSquare size={18} className="text-indigo-600" /> Chatt & Historik
        </h2>
        <div className="flex items-center gap-1">
          <button className="hidden lg:flex p-2 text-slate-500 hover:bg-slate-200 rounded-lg" onClick={() => setIsPinned(!isPinned)} title={isPinned ? "Lossa" : "Nåla fast"}>
            {isPinned ? <PinOff size={18} /> : <Pin size={18} />}
          </button>
          <button className="lg:hidden p-2 text-slate-500 hover:bg-slate-200 rounded-lg" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {timeline.length === 0 ? (
          <div className="text-center text-slate-400 italic text-sm mt-10">
            Chatten är tom. Börja rita eller prata för att spara historik.
          </div>
        ) : (
          timeline.map(event => (
            <div 
              key={event.id} 
              className={`p-3 rounded-xl shadow-sm border cursor-pointer transition-colors ${
                event.type === 'user_image' || event.type === 'user_text' ? 'bg-indigo-50 border-indigo-100 ml-4' : 
                'bg-white border-slate-200 mr-4'
              }`}
              onClick={() => onEventClick(event)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {event.type === 'user_image' ? 'Du (Bild)' :
                   event.type === 'user_text' ? 'Du' :
                   event.type === 'teacher_image' ? 'AI (Bild)' : 'AI'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">
                    {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteTimelineEvent(event.id); }}
                    className="text-slate-300 hover:text-rose-500 transition-colors"
                    title="Radera från historik"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div>
                {event.type === 'user_image' || event.type === 'teacher_image' ? (
                  <img src={event.content} className="w-full h-32 object-cover rounded-lg" alt="Chat image" />
                ) : event.type === 'expert_note' ? (
                  <div className="text-base prose prose-slate line-clamp-4">
                    <MarkdownRenderer content={event.content} />
                  </div>
                ) : (
                  <p className="text-base text-slate-700">{event.content}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      
      <ChatInput 
        chatInput={chatInput} 
        setChatInput={setChatInput} 
        handleTextSend={handleTextSend} 
      />
    </div>
  );
};
