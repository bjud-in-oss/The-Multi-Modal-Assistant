import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, Modality } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Camera, PenTool, Square, Trash2, Mic, MicOff, Volume2, VolumeX, BrainCircuit, MessageSquare, Play, Image as ImageIcon } from 'lucide-react';

// Initialize SDK
const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'DIN_API_NYCKEL_HÄR' });

// --- Types ---
type TimelineEvent = {
  id: string;
  timestamp: number;
  type: 'user_image' | 'teacher_image' | 'expert_note';
  source?: 'typed' | 'spoken';
  content: string;
};

// --- Components ---

const CameraScanner = ({ onCapture }: { onCapture: (base64: string) => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number;
    let lastImageData: ImageData | null = null;
    let stableStartTime: number | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsActive(true);
        }
      } catch (err) {
        console.error("Kunde inte starta kameran", err);
      }
    };

    const processFrame = () => {
      if (!videoRef.current || !canvasRef.current || !isActive) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx || video.videoWidth === 0) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      canvas.width = 100;
      canvas.height = 100 * (video.videoHeight / video.videoWidth);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let totalLuma = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        totalLuma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      const avgLuma = totalLuma / (data.length / 4);

      let mse = 0;
      if (lastImageData) {
        const lastData = lastImageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const diffR = data[i] - lastData[i];
          const diffG = data[i + 1] - lastData[i + 1];
          const diffB = data[i + 2] - lastData[i + 2];
          mse += (diffR * diffR + diffG * diffG + diffB * diffB) / 3;
        }
        mse /= (data.length / 4);
      }
      lastImageData = imageData;

      const isPaper = avgLuma > 150;
      const isStable = mse < 50;

      if (isPaper && isStable) {
        if (!stableStartTime) {
          stableStartTime = Date.now();
        } else if (Date.now() - stableStartTime > 1000) {
          const hiResCanvas = document.createElement('canvas');
          hiResCanvas.width = video.videoWidth;
          hiResCanvas.height = video.videoHeight;
          const hiResCtx = hiResCanvas.getContext('2d');
          if (hiResCtx) {
            hiResCtx.drawImage(video, 0, 0);
            const base64 = hiResCanvas.toDataURL('image/jpeg', 0.8);
            onCapture(base64);
            stableStartTime = null;
            setTimeout(() => { lastImageData = null; }, 2000);
          }
        }
      } else {
        stableStartTime = null;
      }

      animationFrameId = requestAnimationFrame(processFrame);
    };

    startCamera().then(() => {
      animationFrameId = requestAnimationFrame(processFrame);
    });

    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      cancelAnimationFrame(animationFrameId);
    };
  }, [isActive, onCapture]);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center shadow-inner">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-medium flex items-center gap-2 shadow-lg border border-white/10">
        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
        Auto-Scanner Aktiv
      </div>
    </div>
  );
};

const DrawingCanvas = ({ onCapture, selectedImage }: { onCapture: (base64: string) => void, selectedImage?: string | null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (selectedImage && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
          const x = (canvas.width / 2) - (img.width / 2) * scale;
          const y = (canvas.height / 2) - (img.height / 2) * scale;
          
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        };
        img.src = selectedImage;
      }
    }
  }, [selectedImage]);

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    timeoutRef.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        onCapture(base64);
      }
    }, 2000);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  return (
    <div className="relative w-full h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none cursor-crosshair"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerOut={stopDrawing}
      />
      <button
        onClick={clearCanvas}
        className="absolute top-4 right-4 bg-white border border-slate-200 p-2.5 rounded-xl shadow-sm hover:bg-slate-50 text-slate-500 transition-colors"
        title="Rensa tavlan"
      >
        <Trash2 size={20} />
      </button>
    </div>
  );
};

const TextInput = ({ onSend, initialText = '' }: { onSend: (text: string) => void, initialText?: string }) => {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  return (
    <div className="w-full h-full bg-white rounded-2xl border border-slate-200 p-4 flex flex-col shadow-sm">
      <textarea 
        className="flex-1 resize-none outline-none text-slate-700 p-2" 
        placeholder="Skriv din fråga eller ekvation här..."
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div className="flex justify-end mt-2">
        <button 
          onClick={() => { if(text.trim()) { onSend(text); setText(''); } }}
          className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-medium hover:bg-indigo-700 transition-colors"
        >
          Lägg till i tidslinjen
        </button>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [selectedRole, setSelectedRole] = useState('Lärare');
  const [customRole, setCustomRole] = useState('');
  const [leftMode, setLeftMode] = useState<'draw' | 'camera' | 'text'>('draw');
  const [rightMode, setRightMode] = useState<'board' | 'plan'>('board');
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingImageToLoad, setPendingImageToLoad] = useState<string | null>(null);
  const [pendingTextToEdit, setPendingTextToEdit] = useState<string>('');
  const [selectedAnalysis, setSelectedAnalysis] = useState<string | null>(null);
  const [isTeacherMuted, setIsTeacherMuted] = useState(false);
  const [isUserMuted, setIsUserMuted] = useState(false);

  const isTeacherMutedRef = useRef(false);
  const isUserMutedRef = useRef(false);
  const roleRef = useRef('Lärare');
  const customRoleRef = useRef('');

  useEffect(() => {
    roleRef.current = selectedRole;
    customRoleRef.current = customRole;
  }, [selectedRole, customRole]);

  const toggleTeacherMute = () => {
    isTeacherMutedRef.current = !isTeacherMutedRef.current;
    setIsTeacherMuted(isTeacherMutedRef.current);
  };

  const toggleUserMute = () => {
    isUserMutedRef.current = !isUserMutedRef.current;
    setIsUserMuted(isUserMutedRef.current);
  };

  const handleImageClick = useCallback((base64: string) => {
    setLeftMode('draw');
    setPendingImageToLoad(base64);
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
      if (isLiveRef.current) {
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
        if (audioCtxRef.current) audioCtxRef.current.close();
        if (sessionRef.current) {
          sessionRef.current.then((session: any) => session.close());
          sessionRef.current = null;
        }
        setIsLive(false);
        addTimelineEvent('expert_note', '*Lektionen har pausats automatiskt på grund av inaktivitet. Klicka på "Återuppta Lektion" för att fortsätta.*');
      }
    }, 3 * 60 * 1000);

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
    }, 15 * 60 * 1000);
  }, [addTimelineEvent]);

  const handleCapture = useCallback(async (base64: string) => {
    const images = timelineRef.current.filter(e => e.type === 'user_image');
    if (images.length > 0 && images[images.length - 1].content === base64) return;
    addTimelineEvent('user_image', base64);
    resetInactivityTimer();

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
  }, [addTimelineEvent, resetInactivityTimer]);

  const handleTextSend = useCallback(async (text: string) => {
    setLeftMode('text');
    setPendingTextToEdit('');
    resetInactivityTimer();

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
  }, [addTimelineEvent, resetInactivityTimer]);

  // FAST Expert Model (Gemini 3 Flash)
  const callVisionAPI = async (question: string, images: string[]) => {
    setIsProcessing(true);

    try {
      const parts: any[] = images.map(img => ({
        inlineData: { data: img.split(',')[1], mimeType: 'image/jpeg' }
      }));

      const roleName = roleRef.current === 'Annan' ? customRoleRef.current : roleRef.current;
      parts.push({
        text: `Du är "Experten", en snabb AI-assistent som stödjer en ${roleName}. Användaren frågar/säger: "${question}". Analysera detta${images.length > 0 ? ' och bilderna' : ''}. Returnera ett JSON-objekt med: 1. "chat_message": Dina anteckningar/formler/svar (Markdown/LaTeX). 2. "live_summary": En kort sammanfattning till röst-AI:n.`
      });

      const response = await getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { role: 'user', parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              chat_message: { type: Type.STRING },
              live_summary: { type: Type.STRING }
            }
          }
        }
      });

      const resultText = response.text;
      if (resultText) {
        const result = JSON.parse(resultText);
        addTimelineEvent('expert_note', result.chat_message);
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

  const toggleLiveSession = async () => {
    if (isLiveRef.current) {
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (sessionRef.current) {
        sessionRef.current.then((session: any) => session.close());
        sessionRef.current = null;
      }
      setIsLive(false);
      return;
    }

    try {
      audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
      nextAudioTimeRef.current = 0;
      activeSourcesRef.current = [];
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      const analyzeVisualMathDeclaration: FunctionDeclaration = {
        name: 'analyze_visual_math',
        description: 'Använd när användaren ber dig titta på tavlan eller kameran. Returnerar en analys av vad som syns.',
        parameters: {
          type: Type.OBJECT,
          properties: { question: { type: Type.STRING, description: 'Användarens fråga' } },
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

      const historySummary = timelineRef.current.length > 0 
        ? `\n\nTidigare i konversationen har ni pratat om:\n` + timelineRef.current.map(e => {
            if (e.type === 'expert_note') return `Expert/System: ${e.content}`;
            if (e.type === 'user_image') return `[Användaren visade en bild]`;
            if (e.type === 'teacher_image') return `[Du ritade en bild på tavlan]`;
            return '';
          }).filter(Boolean).slice(-15).join('\n')
        : '';

      const roleName = roleRef.current === 'Annan' ? customRoleRef.current : roleRef.current;
      const systemInstruction = `Du är en ${roleName}. Du har tillgång till verktyg för att se vad användaren gör ('analyze_visual_math') och för att rita egna förklaringar ('draw_on_board'). Använd 'analyze_visual_math' när användaren ber dig titta på något. Använd 'draw_on_board' för att visuellt förklara saker. Prata naturligt och vänligt på svenska.` + historySummary;

      const sessionPromise = getAI().live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [analyzeVisualMathDeclaration, drawOnBoardDeclaration] }],
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

            if (message.goAway) {
              console.log("Session ending soon. Time left:", message.goAway.timeLeft);
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
                  // addTimelineEvent('teacher_text', part.text); // Removed
                }
                if (part.functionCall) {
                  const name = part.functionCall.name;
                  const args = part.functionCall.args as any;
                  let result = "";
                  
                  if (name === 'analyze_visual_math') {
                    const images = timelineRef.current.filter(e => e.type === 'user_image').map(e => e.content);
                    result = await callVisionAPI(args.question || "Vad ser du?", images);
                  } else if (name === 'draw_on_board') {
                    result = await generateTeacherImage(args.prompt);
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
                    // addTimelineEvent('user_text', part.text, 'spoken'); // Removed
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
  };

  const groupedTimeline = useMemo(() => {
    const grouped: any[] = [];

    for (const event of timeline) {
      if (event.type === 'expert_note') {
        const last = grouped[grouped.length - 1];
        if (last && last.type === 'user_image' && !last.analysis) {
          last.analysis = event.content;
          continue;
        }
      }
      grouped.push({ ...event });
    }
    return grouped;
  }, [timeline]);

  const latestBoardItem = [...timeline].reverse().find(e => e.type === 'expert_note' || e.type === 'teacher_image');

  if (!hasStarted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 font-sans">
        <BrainCircuit size={80} className="text-indigo-600 mb-8" />
        <h1 className="text-5xl font-bold text-slate-800 mb-6 tracking-tight">Sokratisk AI-Assistent</h1>
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
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* Top Area: 3/4 Height */}
      <div className="flex h-[75%] w-full border-b border-slate-200 relative">
        
        {/* Central Button */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <button
            onClick={toggleLiveSession}
            className={`flex items-center justify-center w-24 h-24 rounded-full font-bold text-lg transition-all shadow-2xl border-4 border-slate-50 ${
              isLive ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isLive ? 'Pausa' : 'Starta'}
          </button>
        </div>

        {/* Left: Input */}
        <div className="w-1/2 h-full p-6 flex flex-col gap-4 border-r border-slate-200 bg-slate-50/50">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              Du
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={toggleUserMute} className={`p-2 rounded-full transition-colors ${isUserMuted ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`} title={isUserMuted ? 'Slå på mikrofon' : 'Stäng av mikrofon'}>
                {isUserMuted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <div className="flex bg-slate-200/50 p-1 rounded-xl">
                <button onClick={() => setLeftMode('draw')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${leftMode === 'draw' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Rita</button>
                <button onClick={() => setLeftMode('camera')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${leftMode === 'camera' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Kamera</button>
                <button onClick={() => setLeftMode('text')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${leftMode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Text</button>
              </div>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden">
            {leftMode === 'draw' && <DrawingCanvas onCapture={handleCapture} selectedImage={pendingImageToLoad} />}
            {leftMode === 'camera' && <CameraScanner onCapture={handleCapture} />}
            {leftMode === 'text' && <TextInput onSend={handleTextSend} initialText={pendingTextToEdit} />}
          </div>
        </div>

        {/* Right: Board/Focus */}
        <div className="w-1/2 h-full p-6 bg-white flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-200/50 p-1 rounded-xl">
                <button onClick={() => setRightMode('board')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${rightMode === 'board' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Tavla</button>
                <button onClick={() => setRightMode('plan')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${rightMode === 'plan' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Plan</button>
                <button onClick={() => setRightMode('dialog')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${rightMode === 'dialog' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Lektion</button>
              </div>
              <button onClick={toggleTeacherMute} className={`p-2 rounded-full transition-colors ${isTeacherMuted ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`} title={isTeacherMuted ? 'Slå på AI:ns röst' : 'Stäng av AI:ns röst'}>
                {isTeacherMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              {roleRef.current === 'Annan' ? customRoleRef.current : roleRef.current} <BrainCircuit size={18} className="text-emerald-600" />
            </h2>
          </div>
          <div className="flex-1 relative overflow-hidden">
             {rightMode === 'board' && (
                <div className="h-full overflow-y-auto bg-slate-50 rounded-2xl border border-slate-100 p-6 relative">
                  {isProcessing && (
                    <div className="absolute top-4 right-4 flex items-center gap-2 text-indigo-600 text-sm font-medium animate-pulse bg-white/80 px-3 py-1 rounded-full shadow-sm">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      Arbetar...
                    </div>
                  )}
                  {selectedAnalysis ? (
                    <div className="prose prose-slate max-w-none">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Analys av din bild</h3>
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {selectedAnalysis}
                      </ReactMarkdown>
                      <button onClick={() => setSelectedAnalysis(null)} className="mt-6 text-indigo-600 text-sm font-medium">Visa senaste</button>
                    </div>
                  ) : (
                    !latestBoardItem ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center gap-4">
                        <ImageIcon size={48} className="text-slate-300" />
                        <p className="max-w-[250px] text-sm">Här visas AI:ns anteckningar, formler och genererade grafer.</p>
                      </div>
                    ) : latestBoardItem.type === 'teacher_image' ? (
                      <img src={latestBoardItem.content} alt="Teacher generated" className="w-full h-auto rounded-xl shadow-sm" />
                    ) : (
                      <div className="prose prose-slate max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {latestBoardItem.content}
                        </ReactMarkdown>
                      </div>
                    )
                  )}
                </div>
             )}
             {rightMode === 'plan' && (
                <div className="h-full overflow-y-auto bg-slate-50 rounded-2xl border border-slate-100 p-6 flex flex-col gap-4">
                  <h3 className="text-lg font-bold text-slate-700">Lektionsplan</h3>
                  <p className="text-slate-500 text-sm">Be AI:n att skapa en strukturerad plan för vad ni ska gå igenom.</p>
                  <button onClick={() => handleTextSend("Skapa en lektionsplan för detta ämne.")} className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-200 self-start">Be om lektionsplan</button>
                </div>
             )}
             {rightMode === 'dialog' && (
                <DialogView timeline={timeline} side="right" roleName={roleRef.current === 'Annan' ? customRoleRef.current : roleRef.current} />
             )}
          </div>
        </div>
      </div>

      {/* Bottom Area: 1/4 Height - Full Width Timeline */}
      <div className="h-[25%] w-full bg-slate-100 p-6 flex flex-col gap-4">
        <div className="flex-1 flex gap-4 overflow-x-auto pb-2 items-stretch snap-x">
          {groupedTimeline.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-slate-400 italic text-sm">
              Tidslinjen är tom. Börja rita eller prata för att spara historik.
            </div>
          ) : (
            groupedTimeline.map(event => {
              if (event.type === 'user_image') {
                return (
                  <div key={event.id} className="h-full w-64 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-shrink-0 snap-start hover:border-indigo-300 transition-colors overflow-hidden">
                    <div className="flex items-center justify-between p-3 border-b border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-slate-100 text-slate-600">
                        Din Bild
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex border-b border-slate-100 text-[10px] font-medium">
                      <button className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 text-center border-r border-slate-100" onClick={() => { setLeftMode('draw'); setPendingImageToLoad(event.content); }}>Din bild</button>
                      <button className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 text-center" onClick={() => { if (event.analysis) { setRightMode('board'); setSelectedAnalysis(event.analysis); } }}>Analys</button>
                    </div>
                    <div className="flex-1 p-3 overflow-y-auto cursor-pointer" onClick={() => { setLeftMode('draw'); setPendingImageToLoad(event.content); if (event.analysis) { setRightMode('board'); setSelectedAnalysis(event.analysis); } }}>
                      <img src={event.content} className="w-full h-24 object-cover rounded-lg mb-2" alt="Timeline item" />
                      {event.analysis && (
                        <div className="text-xs prose prose-sm prose-slate line-clamp-3">
                          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{event.analysis}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div 
                  key={event.id} 
                  className="h-full w-64 bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col gap-3 flex-shrink-0 snap-start hover:border-indigo-300 transition-colors cursor-pointer"
                  onClick={() => {
                    if (event.type === 'teacher_image') {
                      setLeftMode('draw');
                      setPendingImageToLoad(event.content);
                    } else if (event.type === 'expert_note') {
                      setRightMode('board');
                      setSelectedAnalysis(event.content);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                      event.type === 'teacher_image' ? 'bg-emerald-100 text-emerald-700' :
                      event.type === 'expert_note' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {event.type === 'teacher_image' ? 'AI:ns Bild' :
                       event.type === 'expert_note' ? 'AI:n observerar' : 'Händelse'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {event.type === 'teacher_image' ? (
                      <img src={event.content} className="w-full h-full object-cover rounded-lg" alt="Timeline item" title="Klicka för att redigera på tavlan" />
                    ) : event.type === 'expert_note' ? (
                      <div className="text-xs prose prose-sm prose-slate line-clamp-6">
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{event.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-700 italic">"{event.content}"</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
