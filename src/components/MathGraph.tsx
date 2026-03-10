import React, { useEffect, useRef } from 'react';

export const MathGraph = ({ funcStr }: { funcStr: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const drawGraph = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      
      const scale = width / 10; // Show from -5 to 5
      const originX = width / 2;
      const originY = height / 2;

      ctx.beginPath();
      for (let x = 0; x <= width; x += scale) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y <= height; y += scale) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, originY);
      ctx.lineTo(width, originY);
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, height);
      ctx.stroke();

      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.beginPath();

      let isFirstPoint = true;
      let fn: Function;
      
      try {
        fn = new Function('x', `return ${funcStr}`);
      } catch (e) {
        console.error("Invalid function string:", e);
        ctx.fillStyle = 'red';
        ctx.font = '14px sans-serif';
        ctx.fillText("Ogiltig funktion", 10, 20);
        return;
      }

      for (let px = 0; px <= width; px++) {
        const x = (px - originX) / scale;
        try {
          const y = fn(x);
          
          if (typeof y !== 'number' || isNaN(y) || !isFinite(y)) {
             isFirstPoint = true;
             continue;
          }

          const py = originY - y * scale;

          if (isFirstPoint) {
            ctx.moveTo(px, py);
            isFirstPoint = false;
          } else {
            ctx.lineTo(px, py);
          }
        } catch (e) {
          isFirstPoint = true;
        }
      }
      ctx.stroke();
    };

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        const { width } = entry.contentRect;
        canvas.width = width;
        canvas.height = width * 0.75; // 4:3 aspect ratio
        drawGraph();
      }
    });

    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [funcStr]);

  return (
    <div ref={containerRef} className="flex flex-col items-center my-4 w-full max-w-lg mx-auto">
      <canvas 
        ref={canvasRef} 
        className="border border-slate-300 rounded-lg bg-white shadow-sm w-full"
      />
      <div className="text-sm text-slate-500 mt-2 font-mono bg-slate-100 px-2 py-1 rounded">
        f(x) = {funcStr}
      </div>
    </div>
  );
};
