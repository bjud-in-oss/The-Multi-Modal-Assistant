import React from 'react';
import { BookOpen, Pin, PinOff, X, CheckCircle2, Circle, Clock } from 'lucide-react';

export interface CurriculumNode {
  id: string;
  label: string;
  status: 'completed' | 'in-progress' | 'pending' | string;
}

interface SidebarProps {
  isPinned: boolean;
  setIsPinned: (val: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (val: boolean) => void;
  curriculumNodes: CurriculumNode[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  isPinned,
  setIsPinned,
  sidebarOpen,
  setSidebarOpen,
  curriculumNodes
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={18} className="text-emerald-500" />;
      case 'in-progress':
        return <Clock size={18} className="text-amber-500" />;
      default:
        return <Circle size={18} className="text-slate-300" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'in-progress':
        return 'bg-amber-50 border-amber-200 text-amber-700';
      default:
        return 'bg-white border-slate-200 text-slate-600';
    }
  };

  return (
    <div className={`${isPinned ? 'relative w-full lg:flex-1' : 'fixed inset-y-0 left-0 z-50 w-80 lg:relative lg:w-80'} bg-white border-r border-slate-200 shadow-2xl lg:shadow-none transform transition-transform duration-300 flex flex-col ${sidebarOpen || isPinned ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
        <h2 className="font-bold text-slate-700 flex items-center gap-2">
          <BookOpen size={18} className="text-indigo-600" /> Kunskapskarta
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
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {curriculumNodes.length === 0 ? (
          <div className="text-center text-slate-400 italic text-sm mt-10">
            Din kunskapskarta är tom. Lär dig nya koncept för att fylla den.
          </div>
        ) : (
          curriculumNodes.map(node => (
            <div 
              key={node.id} 
              className={`p-4 rounded-xl shadow-sm border transition-colors flex items-center gap-3 ${getStatusColor(node.status)}`}
            >
              <div className="shrink-0">
                {getStatusIcon(node.status)}
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-sm">{node.label}</h3>
                <p className="text-xs opacity-80 capitalize mt-0.5">{node.status === 'in-progress' ? 'Pågår' : node.status === 'completed' ? 'Klar' : 'Kommande'}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
