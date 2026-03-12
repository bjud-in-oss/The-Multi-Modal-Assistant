import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Eraser, PenTool, Send } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

export const DrawingCanvas = ({ 
  onCapture, 
  selectedImage,
  paperType = 'blank',
  annotations = [],
  latexOverlays = [],
  curriculumNodes = []
}: { 
  onCapture: (base64: string) => void, 
  selectedImage?: string | null,
  paperType?: string,
  annotations?: any[],
  latexOverlays?: any[],
  curriculumNodes?: any[]
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');

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
        // Don't fill with white if we want to see the CSS background
        // ctx.fillStyle = '#ffffff';
        // ctx.fillRect(0, 0, canvas.width, canvas.height);
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
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 24;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 4;
    }
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.globalCompositeOperation = 'source-over';
    }
  };

  const handleSend = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Create a temporary canvas to merge background and drawing
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, 0);
        const base64 = tempCanvas.toDataURL('image/jpeg', 0.8);
        onCapture(base64);
      }
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getBackgroundClass = () => {
    switch (paperType) {
      case 'grid_math_paper':
        return 'bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:20px_20px]';
      case 'lined':
        return 'bg-[linear-gradient(transparent_19px,#e5e7eb_20px)] bg-[size:100%_20px]';
      default:
        return 'bg-white';
    }
  };

  return (
    <div className={`relative w-full h-full rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col ${getBackgroundClass()}`}>
      {/* Render Annotations */}
      {annotations.map((ann, i) => (
        <div 
          key={`ann-${i}`} 
          className="absolute pointer-events-none text-slate-800 font-medium px-2 py-1 bg-white/80 backdrop-blur-sm rounded shadow-sm border border-slate-200"
          style={{ left: `${ann.x}%`, top: `${ann.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          {ann.text}
        </div>
      ))}

      {/* Render LaTeX Overlays */}
      {latexOverlays.map((latex, i) => (
        <div 
          key={`latex-${i}`} 
          className="absolute pointer-events-none text-slate-800 px-3 py-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200"
          style={{ left: `${latex.x}%`, top: `${latex.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          <MarkdownRenderer content={`$$${latex.latex}$$`} />
        </div>
      ))}

      {/* Render Curriculum Nodes */}
      {curriculumNodes.length > 0 && (
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-none">
          {curriculumNodes.map((node, i) => (
            <div 
              key={`node-${i}`} 
              className={`px-3 py-2 rounded-lg shadow-sm border text-sm font-medium flex items-center gap-2 backdrop-blur-sm ${
                node.status === 'completed' ? 'bg-emerald-50/90 border-emerald-200 text-emerald-700' :
                node.status === 'current' ? 'bg-indigo-50/90 border-indigo-200 text-indigo-700 ring-2 ring-indigo-500/20' :
                'bg-white/90 border-slate-200 text-slate-500'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${
                node.status === 'completed' ? 'bg-emerald-500' :
                node.status === 'current' ? 'bg-indigo-500 animate-pulse' :
                'bg-slate-300'
              }`} />
              {node.label}
            </div>
          ))}
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none cursor-crosshair relative z-10"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerOut={stopDrawing}
      />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white border border-slate-200 p-1.5 rounded-2xl shadow-sm flex gap-1 items-center z-20">
        <button 
          onClick={() => setTool('pen')} 
          className={`p-2 rounded-xl transition-colors ${tool === 'pen' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-50 text-slate-500'}`}
          title="Penna"
        >
          <PenTool size={20} />
        </button>
        <button 
          onClick={() => setTool('eraser')} 
          className={`p-2 rounded-xl transition-colors ${tool === 'eraser' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-50 text-slate-500'}`}
          title="Suddgummi"
        >
          <Eraser size={20} />
        </button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button 
          onClick={clearCanvas} 
          className="p-2 rounded-xl hover:bg-slate-50 text-slate-500 transition-colors"
          title="Rensa hela tavlan"
        >
          <Trash2 size={20} />
        </button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button 
          onClick={handleSend} 
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-2 font-medium"
          title="Skicka till AI"
        >
          <Send size={16} /> Skicka
        </button>
      </div>
    </div>
  );
};
