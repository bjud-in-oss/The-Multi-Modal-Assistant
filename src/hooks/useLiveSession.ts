import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, FunctionDeclaration, Type, Modality } from '@google/genai';
import { TimelineEvent, PaneState, PaneType } from '../types';

const fixEncoding = (text: any) => {
  if (!text) return '';
  if (typeof text === 'object') {
    text = text.text ? String(text.text) : JSON.stringify(text);
  }
  if (typeof text !== 'string') {
    text = String(text);
  }
  try {
    if (text.includes('Ã')) {
      return decodeURIComponent(escape(text));
    }
    return text;
  } catch (e) {
    return text;
  }
};

export const useLiveSession = (
  getAI: () => GoogleGenAI,
  timelineRef: React.MutableRefObject<TimelineEvent[]>,
  addTimelineEvent: (type: TimelineEvent['type'], content: string, source?: 'spoken' | 'typed') => void,
  roleRef: React.MutableRefObject<string>,
  customRoleRef: React.MutableRefObject<string>,
  pane1Ref: React.MutableRefObject<PaneState>,
  pane2Ref: React.MutableRefObject<PaneState>,
  showInInactivePane: (type: 'board' | 'plan', data: any, forceActive?: boolean) => void,
  clearPane: (type: PaneType) => void,
  callVisionAPI: (question: string, base64Images: string[], thinkingLevel?: string) => Promise<string>,
  generateTeacherImage: (prompt: string) => Promise<string>,
  isTeacherMutedRef: React.MutableRefObject<boolean>,
  setIsTeacherMuted: (val: boolean) => void,
  isUserMutedRef: React.MutableRefObject<boolean>,
  setHasStarted: (val: boolean) => void,
  setTimeline: (val: TimelineEvent[] | ((prev: TimelineEvent[]) => TimelineEvent[])) => void,
  setCurriculumNodes: (val: any[] | ((prev: any[]) => any[])) => void,
  setAnnotations: (val: any[] | ((prev: any[]) => any[])) => void,
  setLatexOverlays: (val: any[] | ((prev: any[]) => any[])) => void,
  setPaperType: (val: string) => void
) => {
  const [isLive, setIsLive] = useState(false);
  const isLiveRef = useRef(false);
  const sessionRef = useRef<any>(null);
  const sessionHandleRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextAudioTimeRef = useRef<number>(0);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const deepInactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);

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
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close();
        if (sessionRef.current) {
          sessionRef.current.then((session: any) => {
            try { session.close(); } catch(e) {}
          });
          sessionRef.current = null;
        }
        setIsLive(false);
      }
      setHasStarted(false);
      setTimeline([]);
      sessionHandleRef.current = null;
    }, 30 * 60 * 1000);
  }, [addTimelineEvent, setIsTeacherMuted, setHasStarted, setTimeline]);

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
        description: 'Använd för att spara en lektionsplan, minnesanteckningar eller en sammanfattning till användarens "Läroplan"-flik.',
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

      const clearBoardDeclaration: FunctionDeclaration = {
        name: 'clear_board',
        description: 'Använd för att rensa tavlan när den blir för full eller när ni byter ämne.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            reason: { type: Type.STRING, description: 'Anledningen till att tavlan rensas.' }
          }
        }
      };

      const updateVisualEngineDeclaration: FunctionDeclaration = {
        name: 'update_visual_engine',
        description: 'Använd för att uppdatera den visuella motorn (papperstyp, lägga till annotationer, LaTeX-överlägg eller kursplan-noder).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            paperType: { type: Type.STRING, description: 'Typ av papper (t.ex. grid_math_paper, blank, lined)' },
            annotations: { 
              type: Type.ARRAY, 
              items: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, text: { type: Type.STRING } } },
              description: 'Lista med text-annotationer att placera på tavlan'
            },
            latexOverlays: { 
              type: Type.ARRAY, 
              items: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, latex: { type: Type.STRING } } },
              description: 'Lista med LaTeX-formler att placera på tavlan'
            },
            curriculumNodes: {
              type: Type.ARRAY,
              items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, label: { type: Type.STRING }, status: { type: Type.STRING } } },
              description: 'Lista med noder för kursplanen'
            }
          }
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
      const planSummary = currentPlan ? `\n\nNuvarande innehåll i "Läroplan":\n${currentPlan}` : '';

      // UPPDATERAD SYSTEMPROMPT
      const systemInstruction = `Du är en ${roleName} och en anpassningsbar, lyhörd och hjälpsam assistent. 
Din uppgift är att hjälpa användaren på det sätt som passar dem bäst just nu. Du är INTE en stelbent robot, utan en flexibel och empatisk pedagog.

DINA RIKTLINJER:
1. Anpassa din stil: Om användaren vill tänka själv, ställ ledande frågor. Om användaren är frustrerad, tycker det är svårt, eller ber om ett direkt svar – GE DIREKTA OCH TYDLIGA SVAR. Tvinga aldrig fram en gissningslek om användaren inte vill.
2. Var empatisk och naturlig: Lyssna in användarens tonläge. Om de tycker det är tufft, var uppmuntrande och förenkla din förklaring.
3. Undvik stelbenta avslag: Försök alltid hjälpa till. Om du måste rätta användaren, gör det mjukt och konstruktivt.
4. Hantera Expertens råd: Du får ibland systemmeddelanden från 'Experten'. Använd denna information för att ge bättre svar, och väv in det naturligt i ditt tal.

HUR DU ANVÄNDER TAVLAN (VERKTYGET 'write_on_board', 'clear_board' och 'update_visual_engine'):
När användaren skickar en uträkning med ett fel (t.ex. 2+2=5) MÅSTE du omedelbart anropa funktionen 'update_visual_engine'. Skicka in en 'annotation' med x- och y-koordinater (t.ex. x: 50, y: 50, text: '?') där felet är på pappret. Du får ALDRIG skriva en textförklaring på en text-tavla. Din förklaring ska enbart ske muntligt (via ljud), samtidigt som du ritar visuella markeringar på elevens canvas.
Om tavlan blir för full eller ni byter ämne, anropa 'clear_board' för att rensa den.

REGLER FÖR TAVLAN:
1. Du FÅR ALDRIG skriva vanlig text och förklaringar på tavlan.
2. Din pedagogiska förklaring ska du ENBART SÄGA muntligt med din röst.
3. Läs ALDRIG upp själva syntaxen/koden (t.ex. LaTeX-kod eller Mermaid-kod) högt.
4. Använd 'update_visual_engine' för att placera små etiketter (annotations) eller LaTeX-formler (latexOverlays) direkt på elevens rit-yta, eller för att byta papperstyp (paperType: 'grid_math_paper', 'lined', 'blank').

När du anropar 'update_visual_engine', uppdatera även 'curriculumNodes' med de koncept ni arbetar med (t.ex. id: 'addition', label: 'Addition', status: 'in-progress').

Tillåtna format för tavlan:
- Text: Vanlig text, punktlistor, fetstil (Markdown).
- Matematik: Använd $ för inline och $$ för centrerade formler (t.ex. $$x^2 + 2x$$).
- Diagram (Mermaid): Använd ett markdown-kodblock med typen 'mermaid'. Noder som innehåller formler/specialtecken MÅSTE ha dubbla citattecken! (Rätt: A["$E=mc^2$"], Fel: A[$E=mc^2$]).
- Grafer (Koordinatsystem): Använd taggen <math-graph>din funktion här</math-graph>.
  VIKTIG REGEL FÖR GRAFER: Inuti taggen får ENDAST giltig JavaScript-syntax finnas. Inget "y=" eller "f(x)=".
  Exempel: <math-graph>x*x - 3*x + 2</math-graph>

Prata naturligt, tålmodigt och vänligt på svenska.` + planSummary + historySummary;

      const sessionPromise = getAI().live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [analyzeVisualMathDeclaration, drawOnBoardDeclaration, savePlanDeclaration, writeOnBoardDeclaration, clearBoardDeclaration, updateVisualEngineDeclaration] }],
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
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(inputData.length);
              if (!isUserMutedRef.current) {
                for (let i = 0; i < inputData.length; i++) {
                  pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
                }
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
                  addTimelineEvent('teacher_text', fixEncoding(part.text));
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
                    const content = fixEncoding(args.content);
                    showInInactivePane('board', { content, isAnalysis: true }, false); // Overwrite board
                    showInInactivePane('plan', { content: `**Tavla (${new Date().toLocaleTimeString()}):**\n${content}` }, true); // Append to plan
                    addTimelineEvent('expert_note', content);
                    result = "Innehållet har skrivits på tavlan och sparats i läroplanen.";
                  } else if (name === 'save_plan') {
                    const planContent = fixEncoding(args.plan_content);
                    showInInactivePane('plan', { content: planContent }, false); // Overwrite plan
                    addTimelineEvent('expert_note', 'Sparade en ny plan i "Läroplan".');
                    result = "Planen har sparats.";
                  } else if (name === 'clear_board') {
                    clearPane('board');
                    addTimelineEvent('expert_note', 'Tavlan har rensats.');
                    result = "Tavlan är nu tom.";
                  } else if (name === 'update_visual_engine') {
                    if (args.paperType) setPaperType(args.paperType);
                    if (args.annotations) setAnnotations(args.annotations);
                    if (args.latexOverlays) setLatexOverlays(args.latexOverlays);
                    if (args.curriculumNodes) setCurriculumNodes(args.curriculumNodes);
                    showInInactivePane('draw', {}, false); // Switch to draw pane
                    result = "Visuella motorn har uppdaterats.";
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
            
            // Handle explicit transcription fields if they exist
            if (message.serverContent?.outputTranscription) {
              addTimelineEvent('teacher_text', fixEncoding(message.serverContent.outputTranscription));
            }
            if (message.serverContent?.inputTranscription) {
              addTimelineEvent('user_text', fixEncoding(message.serverContent.inputTranscription), 'spoken');
            }
            
            const userTurns = message.clientContent?.turns || message.serverContent?.clientContent?.turns;
            if (userTurns) {
              for (const turn of userTurns) {
                for (const part of turn.parts) {
                  if (part.text && !part.text.startsWith('[Systemmeddelande')) {
                    addTimelineEvent('user_text', fixEncoding(part.text), 'spoken');
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

  const disconnectLiveSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => {
        try {
          session.close();
        } catch (e) {
          console.error("Error closing session:", e);
        }
      });
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setIsLive(false);
  }, []);

  const ensureLiveSessionStarted = useCallback(() => {
    if (!isLiveRef.current) {
      startLiveSession();
    }
  }, []);

  return {
    isLive,
    startLiveSession,
    disconnectLiveSession,
    ensureLiveSessionStarted,
    sessionRef,
    audioCtxRef,
    resetInactivityTimer,
    activeSourcesRef,
    nextAudioTimeRef
  };
};