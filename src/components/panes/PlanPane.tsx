import React from 'react';
import { Edit3, Check, ArrowDown } from 'lucide-react';
import { MarkdownRenderer } from '../MarkdownRenderer';

interface PlanPaneProps {
  state: any;
  planScrollRef: React.RefObject<HTMLDivElement>;
  handlePlanScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  isEditingPlan: boolean;
  setIsEditingPlan: (val: boolean) => void;
  editedPlan: string;
  setEditedPlan: (val: string) => void;
  onSavePlan: (editedPlan: string) => void;
  showPlanScrollButton: boolean;
  scrollToPlanBottom: () => void;
}

export const PlanPane: React.FC<PlanPaneProps> = ({
  state,
  planScrollRef,
  handlePlanScroll,
  isEditingPlan,
  setIsEditingPlan,
  editedPlan,
  setEditedPlan,
  onSavePlan,
  showPlanScrollButton,
  scrollToPlanBottom
}) => {
  return (
    <div 
      ref={planScrollRef}
      onScroll={handlePlanScroll}
      className="h-full overflow-y-auto bg-slate-50 p-6 pt-10 flex flex-col gap-4 relative"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-700">Läroplan</h3>
        {state.data?.content && !isEditingPlan && (
          <button 
            onClick={() => {
              setEditedPlan(state.data.content);
              setIsEditingPlan(true);
            }}
            className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg transition-colors"
            title="Redigera läroplan"
          >
            <Edit3 size={18} />
          </button>
        )}
        {isEditingPlan && (
          <button 
            onClick={() => onSavePlan(editedPlan)}
            className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium"
          >
            <Check size={18} /> Spara
          </button>
        )}
      </div>
      {state.data?.content ? (
        isEditingPlan ? (
          <textarea 
            value={editedPlan}
            onChange={(e) => setEditedPlan(e.target.value)}
            className="flex-1 w-full p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none font-sans text-slate-700"
          />
        ) : (
          <div className="prose prose-slate max-w-none">
            <MarkdownRenderer content={state.data.content} />
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center gap-4">
          <p className="max-w-[250px] text-sm">Här sparas din läroplan och historik från tavlan. Du kan be AI:n att skriva här, eller lägga till egna anteckningar.</p>
        </div>
      )}
      
      {showPlanScrollButton && state.data && (
        <button 
          onClick={scrollToPlanBottom}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium hover:bg-emerald-700 transition-all animate-bounce"
        >
          <ArrowDown size={16} /> Fortsätt
        </button>
      )}
    </div>
  );
};
