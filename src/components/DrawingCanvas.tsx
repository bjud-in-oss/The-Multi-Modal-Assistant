import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Eraser, PenTool, Send } from 'lucide-react';

export const DrawingCanvas = ({ onCapture, selectedImage }: { onCapture: (base64: string) => void, selectedImage?: string | null }) => {
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
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : '#1e293b';
    ctx.lineWidth = tool === 'eraser' ? 24 : 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
  };

  const handleSend = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const base64 = canvas.toDataURL('image/jpeg', 0.8);
      onCapture(base64);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="relative w-full h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none cursor-crosshair"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerOut={stopDrawing}
      />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white border border-slate-200 p-1.5 rounded-2xl shadow-sm flex gap-1 items-center">
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
