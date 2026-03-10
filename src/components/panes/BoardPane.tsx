import React from 'react';
import { Image as ImageIcon, ArrowDown } from 'lucide-react';
import { MarkdownRenderer } from '../MarkdownRenderer';

interface BoardPaneProps {
  state: any;
  isActive: boolean;
  isProcessing: boolean;
  boardScrollRef: React.RefObject<HTMLDivElement>;
  handleBoardScroll: () => void;
  showScrollButton: boolean;
  scrollToBoardBottom: () => void;
}

export const BoardPane: React.FC<BoardPaneProps> = ({
  state,
  isActive,
  isProcessing,
  boardScrollRef,
  handleBoardScroll,
  showScrollButton,
  scrollToBoardBottom
}) => {
  return (
    <div 
      ref={boardScrollRef}
      onScroll={handleBoardScroll}
      className="h-full overflow-y-auto bg-slate-50 p-6 pt-10 relative"
    >
      {isProcessing && isActive && (
        <div className="absolute top-4 right-4 flex items-center gap-2 text-indigo-600 text-sm font-medium animate-pulse bg-white/80 px-3 py-1 rounded-full shadow-sm z-20">
          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          Arbetar...
        </div>
      )}
      {!state.data ? (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center gap-4">
          <ImageIcon size={48} className="text-slate-300" />
          <p className="max-w-[250px] text-sm">Här visas AI:ns anteckningar, formler och genererade grafer.</p>
        </div>
      ) : !state.data.isAnalysis ? (
        <img src={state.data.content} alt="Teacher generated" className="w-full h-auto rounded-xl shadow-sm" />
      ) : (
        <div className="prose prose-slate max-w-none pb-12">
          <MarkdownRenderer content={state.data.content} />
        </div>
      )}
      
      {showScrollButton && state.data && (
        <button 
          onClick={scrollToBoardBottom}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium hover:bg-indigo-700 transition-all animate-bounce"
        >
          <ArrowDown size={16} /> Fortsätt
        </button>
      )}
    </div>
  );
};
