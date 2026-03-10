import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, RefreshCw, X } from 'lucide-react';

export const CameraScanner = ({ onCapture, onClose }: { onCapture: (base64: string) => void, onClose?: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number;
    let lastImageData: ImageData | null = null;
    let stableStartTime: number | null = null;

    const startCamera = async () => {
      try {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
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
  }, [isActive, onCapture, facingMode]);

  const handleManualCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0) return;

    const hiResCanvas = document.createElement('canvas');
    hiResCanvas.width = video.videoWidth;
    hiResCanvas.height = video.videoHeight;
    const hiResCtx = hiResCanvas.getContext('2d');
    if (hiResCtx) {
      if (facingMode === 'user') {
        hiResCtx.translate(hiResCanvas.width, 0);
        hiResCtx.scale(-1, 1);
      }
      hiResCtx.drawImage(video, 0, 0);
      const base64 = hiResCanvas.toDataURL('image/jpeg', 0.8);
      onCapture(base64);
    }
  };

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center shadow-inner group">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} 
      />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-medium flex items-center gap-2 shadow-lg border border-white/10">
        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
        Auto-Scanner Aktiv
      </div>
      
      {onClose && (
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white p-2 rounded-full shadow-lg border border-white/10 transition-all"
          title="Stäng kamera"
        >
          <X size={20} />
        </button>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
        <button 
          onClick={toggleCamera}
          className="bg-white/20 hover:bg-white/40 backdrop-blur-md text-white p-3 rounded-full shadow-lg border border-white/30 transition-all"
          title="Vänd kamera"
        >
          <RefreshCw size={20} />
        </button>
        <button 
          onClick={handleManualCapture}
          className="bg-white/20 hover:bg-white/40 backdrop-blur-md text-white p-4 rounded-full shadow-lg border border-white/30 transition-all"
          title="Ta foto manuellt"
        >
          <Camera size={24} />
        </button>
      </div>
    </div>
  );
};
