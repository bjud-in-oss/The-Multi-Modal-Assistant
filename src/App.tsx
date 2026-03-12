import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Mic, MicOff, Volume2, VolumeX, Menu } from 'lucide-react';

import { TimelineEvent, PaneType, PaneState } from './types';
import { CameraScanner } from './components/CameraScanner';
import { DrawingCanvas } from './components/DrawingCanvas';
import { Sidebar } from './components/Sidebar';
import { BoardPane } from './components/panes/BoardPane';
import { PlanPane } from './components/panes/PlanPane';
import { useExpertAI } from './hooks/useExpertAI';
import { useLiveSession } from './hooks/useLiveSession';

// Initialize SDK
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY || 'DIN_API_NYCKEL_HÄR' });

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [selectedRole, setSelectedRole] = useState('Lärare');
  const [customRole, setCustomRole] = useState('');
  
  const [pane1, setPane1] = useState<PaneState>(() => {
    try {
      const saved = localStorage.getItem('ai_tutor_pane1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.data) {
          let content = parsed.data.content;
          if (content !== null && typeof content === 'object') {
            parsed.data.content = content.text ? String(content.text) : JSON.stringify(content);
          } else if (content !== undefined) {
            parsed.data.content = String(content);
          }
        }
        return parsed || { id: 1, type: 'draw' };
      }
    } catch (e) {}
    return { id: 1, type: 'draw' };
  });
  const [pane2, setPane2] = useState<PaneState>(() => {
    try {
      const saved = localStorage.getItem('ai_tutor_pane2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.data) {
          let content = parsed.data.content;
          if (content !== null && typeof content === 'object') {
            parsed.data.content = content.text ? String(content.text) : JSON.stringify(content);
          } else if (content !== undefined) {
            parsed.data.content = String(content);
          }
        }
        return parsed || { id: 2, type: 'board' };
      }
    } catch (e) {}
    return { id: 2, type: 'board' };
  });
  const [activePaneId, setActivePaneId] = useState<1 | 2>(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [curriculumNodes, setCurriculumNodes] = useState<any[]>([]);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [latexOverlays, setLatexOverlays] = useState<any[]>([]);
  const [paperType, setPaperType] = useState<string>('grid_math_paper');
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [editedPlan, setEditedPlan] = useState('');
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const planScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showPlanScrollButton, setShowPlanScrollButton] = useState(false);

  const [timeline, setTimeline] = useState<TimelineEvent[]>(() => {
    try {
      const saved = localStorage.getItem('ai_tutor_timeline');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((e: any) => {
            let content = e.content;
            if (content !== null && typeof content === 'object') {
              content = content.text ? String(content.text) : JSON.stringify(content);
            } else {
              content = String(content || '');
            }
            return { ...e, content };
          });
        }
      }
    } catch (e) {
      console.error("Failed to load timeline", e);
    }
    return [];
  });

  const [isTeacherMuted, setIsTeacherMuted] = useState(true);
  const [isUserMuted, setIsUserMuted] = useState(false);

  const isTeacherMutedRef = useRef(true);
  const isUserMutedRef = useRef(false);
  const roleRef = useRef('Lärare');
  const customRoleRef = useRef('');
  const activePaneIdRef = useRef<1 | 2>(1);
  const pane1Ref = useRef(pane1);
  const pane2Ref = useRef(pane2);
  const timelineRef = useRef(timeline);

  useEffect(() => {
    roleRef.current = selectedRole;
    customRoleRef.current = customRole;
  }, [selectedRole, customRole]);

  useEffect(() => {
    activePaneIdRef.current = activePaneId;
  }, [activePaneId]);

  useEffect(() => {
    try {
      localStorage.setItem('ai_tutor_pane1', JSON.stringify(pane1));
    } catch (e) {}
    pane1Ref.current = pane1;
  }, [pane1]);

  useEffect(() => {
    try {
      localStorage.setItem('ai_tutor_pane2', JSON.stringify(pane2));
    } catch (e) {}
    pane2Ref.current = pane2;
  }, [pane2]);

  useEffect(() => {
    try {
      localStorage.setItem('ai_tutor_timeline', JSON.stringify(timeline));
    } catch (e) {
      console.error("Failed to save timeline", e);
    }
    timelineRef.current = timeline;
  }, [timeline]);

  const addTimelineEvent = useCallback((type: TimelineEvent['type'], content: string, source?: 'typed' | 'spoken') => {
    setTimeline(prev => {
      const last = prev[prev.length - 1];
      
      const isStreamable = (type === 'teacher_text') || (type === 'user_text' && source === 'spoken');
      
      const safeContent = typeof content === 'string' ? content : 
                         (content !== null && typeof content === 'object' && (content as any).text ? String((content as any).text) : String(content || ''));
      
      if (isStreamable && last && last.type === type && last.source === source) {
        const timeDiff = Date.now() - last.timestamp;
        if (timeDiff < 5000) {
          const newTimeline = [...prev];
          
          const safeLastContent = typeof last.content === 'string' ? last.content : 
                                 (last.content !== null && typeof last.content === 'object' && (last.content as any).text ? String((last.content as any).text) : String(last.content || ''));
          
          let newContent = safeContent;
          if (safeContent.startsWith(safeLastContent)) {
            newContent = safeContent;
          } else if (safeLastContent.startsWith(safeContent)) {
            newContent = safeLastContent;
          } else {
            newContent = safeLastContent + safeContent;
          }
          
          newTimeline[newTimeline.length - 1] = {
            ...last,
            content: newContent,
            timestamp: Date.now()
          };
          return newTimeline;
        }
      }
      
      return [...prev, {
        id: Date.now().toString() + Math.random().toString(),
        timestamp: Date.now(),
        type,
        content: safeContent,
        source
      }];
    });
  }, []);

  const deleteTimelineEvent = useCallback((id: string) => {
    setTimeline(prev => prev.filter(event => event.id !== id));
  }, []);

  const clearPane = useCallback((type: PaneType) => {
    setPane1(prev => prev.type === type ? { ...prev, data: null } : prev);
    setPane2(prev => prev.type === type ? { ...prev, data: null } : prev);
  }, []);

  const showInInactivePane = useCallback((type: PaneType, data: any, append: boolean = false) => {
    const p1 = pane1Ref.current;
    const p2 = pane2Ref.current;
    
    if (append) {
      if (p1.type === type) {
        setPane1({ ...p1, data: { ...data, content: p1.data?.content ? p1.data.content + '\n\n---\n\n' + data.content : data.content } });
        return;
      }
      if (p2.type === type) {
        setPane2({ ...p2, data: { ...data, content: p2.data?.content ? p2.data.content + '\n\n---\n\n' + data.content : data.content } });
        return;
      }
    }
    
    const targetPaneId = activePaneIdRef.current === 1 ? 2 : 1;
    if (targetPaneId === 1) setPane1({ id: 1, type, data });
    else setPane2({ id: 2, type, data });
  }, []);

  const { isProcessing, callVisionAPI, generateTeacherImage } = useExpertAI(
    getAI,
    addTimelineEvent,
    showInInactivePane,
    roleRef,
    customRoleRef
  );

  const {
    isLive,
    startLiveSession,
    disconnectLiveSession,
    ensureLiveSessionStarted,
    sessionRef,
    audioCtxRef,
    resetInactivityTimer,
    activeSourcesRef,
    nextAudioTimeRef
  } = useLiveSession(
    getAI,
    timelineRef,
    addTimelineEvent,
    roleRef,
    customRoleRef,
    pane1Ref,
    pane2Ref,
    showInInactivePane,
    clearPane,
    callVisionAPI,
    generateTeacherImage,
    isTeacherMutedRef,
    setIsTeacherMuted,
    isUserMutedRef,
    setHasStarted,
    setTimeline,
    setCurriculumNodes,
    setAnnotations,
    setLatexOverlays,
    setPaperType
  );

  const toggleTeacherMute = () => {
    isTeacherMutedRef.current = !isTeacherMutedRef.current;
    setIsTeacherMuted(isTeacherMutedRef.current);
    if (isTeacherMutedRef.current) {
      activeSourcesRef.current.forEach(source => source.stop());
      activeSourcesRef.current = [];
      nextAudioTimeRef.current = 0;
    }
  };

  const toggleUserMute = () => {
    isUserMutedRef.current = !isUserMutedRef.current;
    setIsUserMuted(isUserMutedRef.current);
  };

  const setPaneType = (type: PaneType) => {
    if (activePaneId === 1) setPane1(prev => ({ ...prev, type }));
    else setPane2(prev => ({ ...prev, type }));
  };

  const handleBoardScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = Math.abs(target.scrollHeight - target.clientHeight - target.scrollTop) < 10;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBoardBottom = () => {
    if (boardScrollRef.current) {
      boardScrollRef.current.scrollTo({
        top: boardScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  const handlePlanScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = Math.abs(target.scrollHeight - target.clientHeight - target.scrollTop) < 10;
    setShowPlanScrollButton(!isAtBottom);
  };

  const scrollToPlanBottom = () => {
    if (planScrollRef.current) {
      planScrollRef.current.scrollTo({
        top: planScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  const handleCapture = useCallback(async (base64: string, source: 'camera' | 'draw' = 'camera') => {
    const images = timelineRef.current.filter(e => e.type === 'user_image');
    if (images.length > 0 && images[images.length - 1].content === base64) return;
    addTimelineEvent('user_image', base64);
    resetInactivityTimer();
    ensureLiveSessionStarted();
    
    if (source === 'camera') {
      setPane1(prev => prev.type === 'camera' ? { ...prev, type: 'draw' } : prev);
      setPane2(prev => prev.type === 'camera' ? { ...prev, type: 'draw' } : prev);
    }

    if (isTeacherMutedRef.current) {
      setIsTeacherMuted(false);
      isTeacherMutedRef.current = false;
    }

    const summary = await callVisionAPI("Användaren har precis ritat/visat detta. Analysera det.", [base64]);
    
    if (isLive && sessionRef.current) {
      sessionRef.current.then((session: any) => {
        session.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64.split(',')[1] } });
        session.sendClientContent({
          turns: [{ 
            role: 'user', 
            parts: [
              { text: `[Dolt systemmeddelande från Exper-analysatorn: ${summary}. Använd nu din röst för att ställa en metakognitiv fråga till eleven baserat på detta, och använd verktyget 'update_visual_engine' för att rita en röd markering (annotation) vid felet i bilden.]` }
            ] 
          }],
          turnComplete: true
        });
      });
    }
  }, [addTimelineEvent, resetInactivityTimer, callVisionAPI, ensureLiveSessionStarted, isLive, sessionRef]);

  const handleStart = async () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
      }
    } catch (e) {
      console.warn("AudioContext init failed:", e);
    }

    try {
      // @ts-ignore
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        // @ts-ignore
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          // @ts-ignore
          await window.aistudio.openSelectKey();
        }
      }
    } catch (e) {
      console.error("API Key selection error:", e);
    }
    setHasStarted(true);
    startLiveSession();
  };

  const renderPane = (state: PaneState, isActive: boolean, onClick: () => void) => {
    return (
      <div 
        onClick={onClick}
        className={`flex-1 relative rounded-2xl overflow-hidden border-2 transition-all duration-200 flex flex-col cursor-pointer ${isActive ? 'border-indigo-500 shadow-md' : 'border-slate-200 shadow-sm opacity-90 hover:opacity-100'}`}
      >
        <div className={`absolute top-0 left-0 right-0 z-10 px-4 py-2 bg-gradient-to-b from-black/50 to-transparent pointer-events-none flex justify-between items-center`}>
           <span className="text-white text-xs font-bold uppercase tracking-wider drop-shadow-md">
             {state.type === 'draw' && 'Rita'}
             {state.type === 'camera' && 'Fota'}
             {state.type === 'board' && 'Tavla'}
             {state.type === 'plan' && 'Läroplan'}
           </span>
           {isActive && <div className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />}
        </div>
  
        <div className="flex-1 relative bg-white overflow-hidden">
          {state.type === 'draw' && (
            <DrawingCanvas 
              onCapture={(base64) => handleCapture(base64, 'draw')} 
              selectedImage={state.data?.image} 
              paperType={paperType}
              annotations={annotations}
              latexOverlays={latexOverlays}
              curriculumNodes={curriculumNodes}
            />
          )}
          {state.type === 'camera' && <CameraScanner onCapture={(base64) => handleCapture(base64, 'camera')} onClose={() => {
            if (pane1.id === state.id) setPane1(prev => ({ ...prev, type: 'draw' }));
            if (pane2.id === state.id) setPane2(prev => ({ ...prev, type: 'draw' }));
          }} />}
          {state.type === 'board' && (
            <BoardPane 
              state={state}
              isActive={isActive}
              isProcessing={isProcessing}
              boardScrollRef={boardScrollRef}
              handleBoardScroll={handleBoardScroll}
              showScrollButton={showScrollButton}
              scrollToBoardBottom={scrollToBoardBottom}
              clearBoard={() => clearPane('board')}
            />
          )}
          {state.type === 'plan' && (
            <PlanPane 
              state={state}
              planScrollRef={planScrollRef}
              handlePlanScroll={handlePlanScroll}
              isEditingPlan={isEditingPlan}
              setIsEditingPlan={setIsEditingPlan}
              editedPlan={editedPlan}
              setEditedPlan={setEditedPlan}
              onSavePlan={(editedPlan) => {
                if (activePaneId === 1) setPane1(prev => ({ ...prev, data: { ...prev.data, content: editedPlan } }));
                else setPane2(prev => ({ ...prev, data: { ...prev.data, content: editedPlan } }));
                setIsEditingPlan(false);
              }}
              showPlanScrollButton={showPlanScrollButton}
              scrollToPlanBottom={scrollToPlanBottom}
            />
          )}
        </div>
      </div>
    );
  };

  if (!hasStarted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 font-sans p-4">
        <h1 className="text-5xl font-bold text-slate-800 mb-6 tracking-tight text-center">Din AI-assistent</h1>
        <p className="text-slate-500 mb-8 max-w-lg text-center text-lg leading-relaxed">
          En interaktiv lärmiljö med röst, vision och generativ grafik. Välj en roll eller börja fritt. Allt sparas i din tidslinje.
        </p>
        
        <div className="mb-12 w-full max-w-md bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <label className="block text-sm font-medium text-slate-700 mb-3">Välj AI:ns roll:</label>
          <div className="flex flex-wrap gap-2 mb-4">
            {['Lärare', 'Kompis', 'Coach', 'Expert', 'Annan'].map(role => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedRole === role 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
          {selectedRole === 'Annan' && (
            <input
              type="text"
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="Skriv in en egen roll..."
              className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
          )}
        </div>

        <button 
          onClick={handleStart} 
          className="bg-indigo-600 text-white px-10 py-4 rounded-full font-semibold text-lg shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:scale-105 transition-all"
        >
          Starta Konversationen
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
      
      <Sidebar 
        isPinned={isPinned}
        setIsPinned={setIsPinned}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        curriculumNodes={curriculumNodes}
      />

      {/* Main Content */}
      <div className={`${isPinned ? 'flex-[2]' : 'flex-1'} flex flex-col h-full relative min-w-0 transition-all`}>
        {/* Header / Menu */}
        <div className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg shrink-0" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
              {(['draw', 'camera', 'board', 'plan'] as PaneType[]).map(type => {
                const labels = { draw: 'Rita', camera: 'Fota', board: 'Tavla', plan: 'Läroplan' };
                const isActiveInPane1 = pane1.type === type;
                const isActiveInPane2 = pane2.type === type;
                const isHighlighted = isActiveInPane1 || isActiveInPane2;
                
                return (
                  <button 
                    key={type}
                    onClick={() => {
                      if (!isHighlighted) setPaneType(type);
                      else if (isActiveInPane1) setActivePaneId(1);
                      else if (isActiveInPane2) setActivePaneId(2);
                    }} 
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isHighlighted ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {labels[type]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Panes Area */}
        <div className="flex-1 flex flex-col sm:flex-row p-4 gap-4 overflow-hidden bg-slate-100 relative">
          {renderPane(pane1, activePaneId === 1, () => setActivePaneId(1))}
          
          {/* Mute buttons in the middle */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex sm:flex-col gap-2 z-30 bg-slate-100/80 p-2 rounded-full backdrop-blur-sm shadow-sm border border-slate-200">
            <button onClick={toggleUserMute} className={`p-3 rounded-full shadow-md transition-colors ${isUserMuted ? 'bg-rose-100 text-rose-600' : 'bg-white text-slate-600 hover:bg-slate-50'}`} title={isUserMuted ? 'Slå på mikrofon' : 'Stäng av mikrofon'}>
              {isUserMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button onClick={toggleTeacherMute} className={`p-3 rounded-full shadow-md transition-colors ${isTeacherMuted ? 'bg-rose-100 text-rose-600' : 'bg-white text-slate-600 hover:bg-slate-50'}`} title={isTeacherMuted ? 'Slå på AI:ns röst' : 'Stäng av AI:ns röst'}>
              {isTeacherMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          </div>

          {renderPane(pane2, activePaneId === 2, () => setActivePaneId(2))}
        </div>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && !isPinned && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
