import { useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { TimelineEvent } from '../types';

export const useExpertAI = (
  getAI: () => GoogleGenAI,
  addTimelineEvent: (type: TimelineEvent['type'], content: string, source?: 'spoken' | 'typed') => void,
  showInInactivePane: (type: 'board' | 'plan', data: any, forceActive?: boolean) => void,
  roleRef: React.MutableRefObject<string>,
  customRoleRef: React.MutableRefObject<string>
) => {
  const [isProcessing, setIsProcessing] = useState(false);

  // Expert Model with Classifier Routing
  const callVisionAPI = async (question: string, base64Images: string[], thinkingLevel?: string) => {
    setIsProcessing(true);

    try {
      const parts: any[] = base64Images.map(img => ({
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
        text: `Du är "Experten", en snabb AI-assistent som stödjer en ${roleName}. Användaren frågar/säger: "${question}". Analysera detta${base64Images.length > 0 ? ' och bilderna' : ''}. Returnera ett JSON-objekt med: 1. "chat_message": Dina anteckningar/formler/svar (Markdown/LaTeX). Om du ritar grafer, använd Mermaid.js syntax inom markdown kodblock (t.ex. \`\`\`mermaid ... \`\`\`). 2. "live_summary": En kort sammanfattning till röst-AI:n. Svara på svenska och använd korrekt teckenkodning för å, ä, ö.`
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

  return {
    isProcessing,
    callVisionAPI,
    generateTeacherImage
  };
};
