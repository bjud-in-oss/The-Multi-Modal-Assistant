import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, Modality } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Mermaid } from './components/Mermaid';
import 'katex/dist/katex.min.css';
import { Mic, MicOff, Volume2, VolumeX, BrainCircuit, Image as ImageIcon, Menu, X, MessageSquare, Pin, PinOff, Send, Trash2, ArrowDown, Edit3, Check } from 'lucide-react';

import { TimelineEvent } from './types';
import { CameraScanner } from './components/CameraScanner';
import { DrawingCanvas } from './components/DrawingCanvas';

const markdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    if (!inline && match && match[1] === 'mermaid') {
      return <Mermaid chart={String(children).replace(/\n$/, '')} />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
};

// Initialize SDK
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY || 'DIN_API_NYCKEL_HÄR' });

type PaneType = 'draw' | 'camera' | 'board' | 'plan';

type PaneState = {
  id: 1 | 2;
  type: PaneType;
  data?: any;
};

// --- Main App ---

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [selectedRole, setSelectedRole] = useState('Lärare');
  const [customRole, setCustomRole] = useState('');
  
  const [pane1, setPane1] = useState<PaneState>({ id: 1, type: 'draw' });
  const [pane2, setPane2] = useState<PaneState>({ id: 2, type: 'board' });
  const [activePaneId, setActivePaneId] = useState<1 | 2>(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [editedPlan, setEditedPlan] = useState('');
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const planScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showPlanScrollButton, setShowPlanScrollButton] = useState(false);

  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTeacherMuted, setIsTeacherMuted] = useState(true);
  const [isUserMuted, setIsUserMuted] = useState(false);

  const isTeacherMutedRef = useRef(true);
  const isUserMutedRef = useRef(false);
  const roleRef = useRef('Lärare');
  const customRoleRef = useRef('');
  const activePaneIdRef = useRef<1 | 2>(1);
  const pane1Ref = useRef(pane1);
  const pane2Ref = useRef(pane2);

  useEffect(() => {
    roleRef.current = selectedRole;
    customRoleRef.current = customRole;
  }, [selectedRole, customRole]);

  useEffect(() => {
    activePaneIdRef.current = activePaneId;
  }, [activePaneId]);

  useEffect(() => {
    pane1Ref.current = pane1;
  }, [pane1]);

  useEffect(() => {
    pane2Ref.current = pane2;
  }, [pane2]);

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

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const timelineRef = useRef(timeline);
  const nextAudioTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const sessionHandleRef = useRef<string | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const deepInactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLiveRef = useRef(isLive);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);

  const addTimelineEvent = useCallback((type: TimelineEvent['type'], content: string, source?: 'typed' | 'spoken') => {
    setTimeline(prev => [...prev, {
      id: Date.now().toString() + Math.random().toString(),
      timestamp: Date.now(),
      type,
      content,
      source
    }]);
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (deepInactivityTimerRef.current) clearTimeout(deepInactivityTimerRef.current);

    inactivityTimerRef.current = setTimeout(() => {
      if (isLiveRef.current && !isTeacherMutedRef.current) {
        isTeacherMutedRef.current = true;
        setIsTeacherMuted(true);
        activeSourcesRef.current.forEach(source => source.stop());
        activeSourcesRef.current = [];
        nextAudioTimeRef.current = 0;
        addTimelineEvent('expert_note', '*Rösten har pausats automatiskt på grund av 5 minuters inaktivitet. Prata eller klicka på högtalarikonen för att slå på den igen.*');
      }
    }, 5 * 60 * 1000);

    deepInactivityTimerRef.current = setTimeout(() => {
      if (isLiveRef.current) {
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
        if (audioCtxRef.current) audioCtxRef.current.close();
        if (sessionRef.current) {
          sessionRef.current.then((session: any) => session.close());
          sessionRef.current = null;
        }
        setIsLive(false);
      }
      setHasStarted(false);
      setTimeline([]);
      sessionHandleRef.current = null;
    }, 30 * 60 * 1000);
  }, [addTimelineEvent]);

  const deleteTimelineEvent = useCallback((id: string) => {
    setTimeline(prev => prev.filter(event => event.id !== id));
  }, []);

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

  // Expert Model with Classifier Routing
  const callVisionAPI = async (question: string, images: string[], thinkingLevel?: string) => {
    setIsProcessing(true);

    try {
      const parts: any[] = images.map(img => ({
        inlineData: { data: img.split(',')[1], mimeType: 'image/jpeg' }
      }));

      const roleName = roleRef.current === 'Annan' ? customRoleRef.current : roleRef.current;
      
      // 1. Classify complexity using Flash-Lite
      let isComplex = thinkingLevel === 'high';
      
      if (!isComplex) {
        try {
          const classifierPrompt = `Bedöm komplexiteten i följande fråga/bild. Svara EXAKT med ett JSON-objekt: {"complexity": "simple"} eller {"complexity": "complex"}. Använd "complex" för svår matte, fysik, djupgående analys eller avancerad logik. Använd "simple" för allmänna frågor, enkel matte, hälsningar eller grundläggande förklaringar. Fråga: "${question}"`;
          
          const classifierRes = await getAI().models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: { role: 'user', parts: [...parts, { text: classifierPrompt }] },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: { complexity: { type: Type.STRING } }
              }
            }
          });
          const result = JSON.parse(classifierRes.text || '{}');
          isComplex = result.complexity === 'complex';
          console.log("Classifier determined complexity:", isComplex ? "complex" : "simple");
        } catch (e) {
          console.warn("Classifier failed, defaulting to simple", e);
        }
      }

      // 2. Prepare the actual request
      parts.push({
        text: `Du är "Experten", en snabb AI-assistent som stödjer en ${roleName}. Användaren frågar/säger: "${question}". Analysera detta${images.length > 0 ? ' och bilderna' : ''}. Returnera ett JSON-objekt med: 1. "chat_message": Dina anteckningar/formler/svar (Markdown/LaTeX). Om du ritar grafer, använd Mermaid.js syntax inom markdown kodblock (t.ex. \`\`\`mermaid ... \`\`\`). 2. "live_summary": En kort sammanfattning till röst-AI:n. Svara på svenska och använd korrekt teckenkodning för å, ä, ö.`
      });

      const config: any = {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            chat_message: { type: Type.STRING },
            live_summary: { type: Type.STRING }
          }
        }
      };

      if (thinkingLevel === 'high' || thinkingLevel === 'low') {
        config.thinkingConfig = { thinkingLevel };
      }

      // 3. Route to appropriate model with graceful fallback
      let response;
      const targetModel = isComplex ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';
      
      try {
        response = await getAI().models.generateContent({
          model: targetModel,
          contents: { role: 'user', parts },
          config
        });
      } catch (error: any) {
        if (isComplex) {
          console.warn(`Model ${targetModel} failed (likely quota), falling back to gemini-3-flash-preview...`, error);
          response = await getAI().models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { role: 'user', parts },
            config
          });
        } else {
          throw error;
        }
      }

      const resultText = response.text;
      if (resultText) {
        const result = JSON.parse(resultText);
        addTimelineEvent('expert_note', result.chat_message);
        showInInactivePane('board', { content: result.chat_message, isAnalysis: true });
        return result.live_summary;
      }
      return "Kunde inte analysera bilden.";
    } catch (error) {
      console.error("Vision API Error:", error);
      return "Ett fel uppstod vid bildanalysen.";
    } finally {
      setIsProcessing(false);
    }
  };

  // Teacher's Red Pen (Gemini 3.1 Flash Image)
  const generateTeacherImage = async (prompt: string) => {
    setIsProcessing(true);
    try {
      const response = await getAI().models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "16:9", imageSize: "1K" } }
      });
      
      let imageUrl = '';
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
      
      if (imageUrl) {
        addTimelineEvent('teacher_image', imageUrl);
        showInInactivePane('board', { content: imageUrl, isAnalysis: false });
        return "Bilden har ritats och lagts till i tidslinjen.";
      }
      return "Kunde inte generera bilden.";
    } catch (error) {
      console.error("Image Gen Error:", error);
      return "Ett fel uppstod när bilden skulle ritas.";
    } finally {
      setIsProcessing(false);
    }
  };

  const ensureLiveSessionStarted = useCallback(() => {
    if (!isLiveRef.current) {
      startLiveSession();
    }
  }, []);

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

    if (isLiveRef.current && sessionRef.current) {
      sessionRef.current.then((session: any) => {
        session.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64.split(',')[1] } });
      });
    }

    const summary = await callVisionAPI("Användaren har precis ritat/visat detta. Analysera det.", [base64]);
    
    if (isLiveRef.current && sessionRef.current) {
      sessionRef.current.then((session: any) => {
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: `[Systemmeddelande: Experten har automatiskt analyserat användarens senaste bild och säger: ${summary} Agera på detta om det är relevant för er konversation.]` }] }],
          turnComplete: true
        });
      });
    }
  }, [addTimelineEvent, resetInactivityTimer, callVisionAPI, ensureLiveSessionStarted]);

  const handleTextSend = useCallback(async (text: string) => {
    if (!text.trim()) return;
    addTimelineEvent('user_text', text, 'typed');
    setChatInput('');
    resetInactivityTimer();
    ensureLiveSessionStarted();

    if (isTeacherMutedRef.current) {
      setIsTeacherMuted(false);
      isTeacherMutedRef.current = false;
    }

    if (isLiveRef.current && sessionRef.current) {
      sessionRef.current.then((session: any) => {
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        });
      });
    }

    const roleName = roleRef.current === 'Annan' ? customRoleRef.current : roleRef.current;
    const summary = await callVisionAPI(`Användaren skrev precis detta: "${text}". Analysera det i kontexten av din roll som ${roleName}.`, []);
    
    if (isLiveRef.current && sessionRef.current) {
      sessionRef.current.then((session: any) => {
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: `[Systemmeddelande: Experten har analyserat elevens text och säger: ${summary}]` }] }],
          turnComplete: true
        });
      });
    }
  }, [addTimelineEvent, resetInactivityTimer, callVisionAPI, ensureLiveSessionStarted]);

  const startLiveSession = async () => {
    if (isLiveRef.current) return;

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
      nextAudioTimeRef.current = 0;
      activeSourcesRef.current = [];
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      const analyzeVisualMathDeclaration: FunctionDeclaration = {
        name: 'analyze_visual_math',
        description: 'Använd när användaren ber dig titta på tavlan eller kameran. Returnerar en analys av vad som syns.',
        parameters: {
          type: Type.OBJECT,
          properties: { 
            question: { type: Type.STRING, description: 'Användarens fråga' },
            thinking_level: { type: Type.STRING, description: 'Hur mycket tänkande som ska användas för analysen ("low" eller "high"). Utelämna för auto.' }
          },
          required: ['question']
        }
      };

      const drawOnBoardDeclaration: FunctionDeclaration = {
        name: 'draw_on_board',
        description: 'Använd för att rita en graf, en geometrisk figur eller en visuell förklaring på tavlan. Returnerar bekräftelse när bilden är ritad.',
        parameters: {
          type: Type.OBJECT,
          properties: { prompt: { type: Type.STRING, description: 'Detaljerad beskrivning på engelska av vad som ska ritas.' } },
          required: ['prompt']
        }
      };

      const savePlanDeclaration: FunctionDeclaration = {
        name: 'save_plan',
        description: 'Använd för att spara en lektionsplan, minnesanteckningar eller en sammanfattning till användarens "Kom ihåg"-flik.',
        parameters: {
          type: Type.OBJECT,
          properties: { plan_content: { type: Type.STRING, description: 'Innehållet som ska sparas (Markdown).' } },
          required: ['plan_content']
        }
      };

      const writeOnBoardDeclaration: FunctionDeclaration = {
        name: 'write_on_board',
        description: 'Använd för att skriva text, matematiska formler (LaTeX) eller rita grafer (Mermaid.js) på tavlan.',
        parameters: {
          type: Type.OBJECT,
          properties: { content: { type: Type.STRING, description: 'Innehållet som ska visas på tavlan (Markdown, LaTeX, eller Mermaid).' } },
          required: ['content']
        }
      };

      const historySummary = timelineRef.current.length > 0 
        ? `\n\nTidigare i konversationen har ni pratat om:\n` + timelineRef.current.map(e => {
            if (e.type === 'expert_note') return `Expert/System: ${e.content}`;
            if (e.type === 'user_image') return `[Användaren visade en bild]`;
            if (e.type === 'teacher_image') return `[Du ritade en bild på tavlan]`;
            if (e.type === 'user_text') return `Användaren: ${e.content}`;
            return '';
          }).filter(Boolean).slice(-15).join('\n')
        : '';

      const roleName = roleRef.current === 'Annan' ? customRoleRef.current : roleRef.current;
      
      const currentPlan = pane1Ref.current.type === 'plan' ? pane1Ref.current.data?.content : (pane2Ref.current.type === 'plan' ? pane2Ref.current.data?.content : '');
      const planSummary = currentPlan ? `\n\nNuvarande innehåll i "Kom ihåg / Plan":\n${currentPlan}` : '';

      const systemInstruction = `Du är en ${roleName}. Du är en sokratisk lärare som leder eleven till att lära sig själv snarare än att bara ge facit. Ställ ledande frågor, men fråga inte om varenda liten detalj. Följ den övergripande planen. Du har tillgång till verktyg för att se vad användaren gör ('analyze_visual_math') och för att rita egna förklaringar ('draw_on_board' för bilder, 'write_on_board' för text/grafer/formler). Använd 'save_plan' för att spara viktiga anteckningar eller lektionsplaner. Använd 'analyze_visual_math' när användaren ber dig titta på något. Prata naturligt och vänligt på svenska.` + planSummary + historySummary;

      const sessionPromise = getAI().live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [analyzeVisualMathDeclaration, drawOnBoardDeclaration, savePlanDeclaration, writeOnBoardDeclaration] }],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          contextWindowCompression: { slidingWindow: {} },
          ...(sessionHandleRef.current ? { sessionResumption: { handle: sessionHandleRef.current } } : {})
        },
        callbacks: {
          onopen: () => {
            setIsLive(true);
            resetInactivityTimer();
            
            if (!sessionHandleRef.current && timelineRef.current.length > 0) {
              const turns = timelineRef.current.map(event => {
                if (event.type === 'user_text') return { role: 'user', parts: [{ text: event.content }] };
                if (event.type === 'teacher_text') return { role: 'model', parts: [{ text: event.content }] };
                if (event.type === 'expert_note') return { role: 'user', parts: [{ text: `[System: ${event.content}]` }] };
                return null;
              }).filter(Boolean);
              
              if (turns.length > 0) {
                sessionPromise.then(session => {
                  session.sendClientContent({ turns, turnComplete: true });
                });
              }
            }

            const source = audioCtxRef.current!.createMediaStreamSource(streamRef.current!);
            const processor = audioCtxRef.current!.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              if (isUserMutedRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
              }
              const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: base64 } });
              });
            };
            source.connect(processor);
            processor.connect(audioCtxRef.current!.destination);
          },
          onmessage: async (message: any) => {
            resetInactivityTimer();
            
            if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate?.newHandle) {
              sessionHandleRef.current = message.sessionResumptionUpdate.newHandle;
            }

            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(source => source.stop());
              activeSourcesRef.current = [];
              nextAudioTimeRef.current = 0;
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioCtxRef.current && !isTeacherMutedRef.current) {
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const pcm16 = new Int16Array(bytes.buffer);
              const audioBuffer = audioCtxRef.current.createBuffer(1, pcm16.length, 24000);
              const channelData = audioBuffer.getChannelData(0);
              for (let i = 0; i < pcm16.length; i++) {
                channelData[i] = pcm16[i] / 32768;
              }
              const source = audioCtxRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioCtxRef.current.destination);
              
              const currentTime = audioCtxRef.current.currentTime;
              const startTime = Math.max(currentTime, nextAudioTimeRef.current);
              source.start(startTime);
              nextAudioTimeRef.current = startTime + audioBuffer.duration;
              
              activeSourcesRef.current.push(source);
              source.onended = () => {
                activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
              };
            }

            // Handle Transcriptions
            const modelParts = message.serverContent?.modelTurn?.parts;
            if (modelParts) {
              for (const part of modelParts) {
                if (part.text) {
                  addTimelineEvent('teacher_text', part.text);
                }
                if (part.functionCall) {
                  const name = part.functionCall.name;
                  const args = part.functionCall.args as any;
                  let result = "";
                  
                  if (name === 'analyze_visual_math') {
                    const images = timelineRef.current.filter(e => e.type === 'user_image').map(e => e.content);
                    result = await callVisionAPI(args.question || "Vad ser du?", images, args.thinking_level);
                  } else if (name === 'draw_on_board') {
                    result = await generateTeacherImage(args.prompt);
                  } else if (name === 'write_on_board') {
                    showInInactivePane('board', { content: args.content, isAnalysis: true }, true);
                    addTimelineEvent('expert_note', args.content);
                    result = "Innehållet har skrivits på tavlan.";
                  } else if (name === 'save_plan') {
                    showInInactivePane('plan', { content: args.plan_content }, true);
                    addTimelineEvent('expert_note', 'Sparade en ny plan i "Kom ihåg".');
                    result = "Planen har sparats.";
                  }

                  sessionPromise.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{
                        id: part.functionCall!.id,
                        name: part.functionCall!.name,
                        response: { result }
                      }]
                    });
                  });
                }
              }
            }
            
            const userTurns = message.clientContent?.turns;
            if (userTurns) {
              for (const turn of userTurns) {
                for (const part of turn.parts) {
                  if (part.text && !part.text.startsWith('[Systemmeddelande')) {
                    addTimelineEvent('user_text', part.text, 'spoken');
                    if (isTeacherMutedRef.current) {
                      setIsTeacherMuted(false);
                      isTeacherMutedRef.current = false;
                    }
                  }
                }
              }
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            addTimelineEvent('expert_note', `*Nätverksfel uppstod. Anslutningen bröts, men din historik är sparad. Klicka på "Återuppta Lektion" för att återansluta.*`);
            setIsLive(false);
          },
          onclose: () => setIsLive(false)
        }
      });

      sessionRef.current = sessionPromise;

    } catch (err) {
      console.error("Failed to start Live session:", err);
      setIsLive(false);
    }
  };

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
             {state.type === 'plan' && 'Kom ihåg'}
           </span>
           {isActive && <div className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />}
        </div>
  
        <div className="flex-1 relative bg-white">
          {state.type === 'draw' && <DrawingCanvas onCapture={(base64) => handleCapture(base64, 'draw')} selectedImage={state.data?.image} />}
          {state.type === 'camera' && <CameraScanner onCapture={(base64) => handleCapture(base64, 'camera')} onClose={() => {
            if (pane1.id === state.id) setPane1(prev => ({ ...prev, type: 'draw' }));
            if (pane2.id === state.id) setPane2(prev => ({ ...prev, type: 'draw' }));
          }} />}
          {state.type === 'board' && (
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
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
                    {state.data.content}
                  </ReactMarkdown>
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
          )}
          {state.type === 'plan' && (
            <div 
              ref={planScrollRef}
              onScroll={handlePlanScroll}
              className="h-full overflow-y-auto bg-slate-50 p-6 pt-10 flex flex-col gap-4 relative"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-700">Kom ihåg / Plan</h3>
                {state.data?.content && !isEditingPlan && (
                  <button 
                    onClick={() => {
                      setEditedPlan(state.data.content);
                      setIsEditingPlan(true);
                    }}
                    className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg transition-colors"
                    title="Redigera plan"
                  >
                    <Edit3 size={18} />
                  </button>
                )}
                {isEditingPlan && (
                  <button 
                    onClick={() => {
                      if (activePaneId === 1) setPane1(prev => ({ ...prev, data: { ...prev.data, content: editedPlan } }));
                      else setPane2(prev => ({ ...prev, data: { ...prev.data, content: editedPlan } }));
                      setIsEditingPlan(false);
                      handleTextSend(`Jag har uppdaterat vår plan. Här är den nya versionen:\n\n${editedPlan}`);
                    }}
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
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>{state.data.content}</ReactMarkdown>
                  </div>
                )
              ) : (
                <>
                  <p className="text-slate-500 text-sm">Be AI:n att skapa en strukturerad plan för vad ni ska gå igenom, eller skriv dina egna anteckningar här.</p>
                  <button onClick={() => handleTextSend("Skapa en lektionsplan för detta ämne och spara den i Kom ihåg.")} className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-200 self-start">Be om plan</button>
                </>
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
      
      {/* Sidebar (Chat/Timeline) */}
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
                onClick={() => {
                  if (window.innerWidth < 1024 && !isPinned) setSidebarOpen(false);
                  if (event.type === 'user_image') {
                    setPaneType('draw');
                    if (activePaneId === 1) setPane1(prev => ({ ...prev, data: { image: event.content } }));
                    else setPane2(prev => ({ ...prev, data: { image: event.content } }));
                  } else if (event.type === 'teacher_image') {
                    setPaneType('board');
                    if (activePaneId === 1) setPane1(prev => ({ ...prev, data: { content: event.content, isAnalysis: false } }));
                    else setPane2(prev => ({ ...prev, data: { content: event.content, isAnalysis: false } }));
                  } else if (event.type === 'expert_note') {
                    setPaneType('board');
                    if (activePaneId === 1) setPane1(prev => ({ ...prev, data: { content: event.content, isAnalysis: true } }));
                    else setPane2(prev => ({ ...prev, data: { content: event.content, isAnalysis: true } }));
                  }
                }}
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
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>{event.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-base text-slate-700">{event.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* Chat Input */}
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
      </div>

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
                const labels = { draw: 'Rita', camera: 'Fota', board: 'Tavla', plan: 'Kom ihåg' };
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
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button onClick={toggleUserMute} className={`p-2 rounded-full transition-colors ${isUserMuted ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title={isUserMuted ? 'Slå på mikrofon' : 'Stäng av mikrofon'}>
              {isUserMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button onClick={toggleTeacherMute} className={`p-2 rounded-full transition-colors ${isTeacherMuted ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title={isTeacherMuted ? 'Slå på AI:ns röst' : 'Stäng av AI:ns röst'}>
              {isTeacherMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>
        </div>

        {/* Panes Area */}
        <div className="flex-1 flex flex-col sm:flex-row p-4 gap-4 overflow-hidden bg-slate-100">
          {renderPane(pane1, activePaneId === 1, () => setActivePaneId(1))}
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
