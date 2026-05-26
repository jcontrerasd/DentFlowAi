'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface TeethSelectorProps {
  selectedTeeth: number[];
  onChange: (teeth: number[]) => void;
}

interface QuadrantProps {
  start: number;
  end: number;
  step: number;
  reverse?: boolean;
  selectedTeeth: number[];
  toggleTooth: (id: number) => void;
}

const Quadrant: React.FC<QuadrantProps> = ({ start, end, step, reverse = false, selectedTeeth, toggleTooth }) => {
  const teeth = [];
  for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
    teeth.push(i);
  }
  if (reverse) teeth.reverse();

  return (
    <div className="flex gap-1">
      {teeth.map(id => (
        <motion.div
          key={id}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => toggleTooth(id)}
          className={`
            w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-md cursor-pointer text-[10px] md:text-xs font-bold transition-all duration-200
            ${selectedTeeth.includes(id) 
              ? 'bg-primary text-inverse shadow-lg shadow-sm font-extrabold' 
              : 'bg-surface dark:bg-surface-2 hover:bg-surface-2 dark:hover:bg-surface-off text-faint dark:text-muted border border-slate-200 dark:border-divider'}
          `}
        >
          {id}
        </motion.div>
      ))}
    </div>
  );
};

export const TeethSelector: React.FC<TeethSelectorProps> = ({ selectedTeeth, onChange }) => {
  const toggleTooth = (id: number) => {
    if (selectedTeeth.includes(id)) {
      onChange(selectedTeeth.filter(t => t !== id));
    } else {
      onChange([...selectedTeeth, id]);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-2 border border-slate-200 dark:border-divider rounded-3xl bg-surface shadow-sm border border-divider overflow-x-auto">
      <div className="min-w-fit">
        <div className="text-[10px] font-bold text-muted mb-3 text-center uppercase tracking-widest">Arcada Superior (Maxilar)</div>
        <div className="flex justify-center gap-4 md:gap-8">
          <Quadrant start={18} end={11} step={-1} selectedTeeth={selectedTeeth} toggleTooth={toggleTooth} />
          <Quadrant start={21} end={28} step={1} selectedTeeth={selectedTeeth} toggleTooth={toggleTooth} />
        </div>
        
        <div className="my-2 relative">
          <div className="h-px bg-surface-2 dark:bg-surface-2 w-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 bg-white dark:bg-surface text-[10px] font-black text-muted uppercase tracking-[0.2em] rounded-full border border-slate-100 dark:border-divider">
            Línea Media
          </div>
        </div>
        
        <div className="flex justify-center gap-4 md:gap-8">
          <Quadrant start={48} end={41} step={-1} selectedTeeth={selectedTeeth} toggleTooth={toggleTooth} />
          <Quadrant start={31} end={38} step={1} selectedTeeth={selectedTeeth} toggleTooth={toggleTooth} />
        </div>
        <div className="text-[10px] font-bold text-muted mt-3 text-center uppercase tracking-widest">Arcada Inferior (Mandibular)</div>
      </div>

    </div>
  );
};
