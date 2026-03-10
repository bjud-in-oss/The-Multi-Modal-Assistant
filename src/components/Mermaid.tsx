import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

export const Mermaid = ({ chart }: { chart: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');

  useEffect(() => {
    if (containerRef.current && chart) {
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      mermaid.render(id, chart)
        .then(({ svg }) => setSvg(svg))
        .catch(e => {
          console.error('Mermaid rendering error:', e);
          setSvg(`<div class="text-red-500 text-sm">Failed to render diagram</div>`);
        });
    }
  }, [chart]);

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />;
};
