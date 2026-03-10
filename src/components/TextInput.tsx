import React, { useState, useEffect } from 'react';

export const TextInput = ({ onSend, initialText = '' }: { onSend: (text: string) => void, initialText?: string }) => {
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
