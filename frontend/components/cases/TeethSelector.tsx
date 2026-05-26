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
              ? 'bg-primary text-white shadow-lg shadow-teal-500/30 font-extrabold' 
              : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'}
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
    <div className="flex flex-col gap-2 p-2 border border-slate-200 dark:border-slate-800 rounded-3xl glass-effect overflow-x-auto">
      <div className="min-w-fit">
        <div className="text-[10px] font-bold text-slate-400 mb-3 text-center uppercase tracking-widest">Arcada Superior (Maxilar)</div>
        <div className="flex justify-center gap-4 md:gap-8">
          <Quadrant start={18} end={11} step={-1} selectedTeeth={selectedTeeth} toggleTooth={toggleTooth} />
          <Quadrant start={21} end={28} step={1} selectedTeeth={selectedTeeth} toggleTooth={toggleTooth} />
        </div>
        
        <div className="my-2 relative">
          <div className="h-px bg-slate-200 dark:bg-slate-800 w-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 bg-white dark:bg-slate-900 text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] rounded-full border border-slate-100 dark:border-slate-800">
            Línea Media
          </div>
        </div>
        
        <div className="flex justify-center gap-4 md:gap-8">
          <Quadrant start={48} end={41} step={-1} selectedTeeth={selectedTeeth} toggleTooth={toggleTooth} />
          <Quadrant start={31} end={38} step={1} selectedTeeth={selectedTeeth} toggleTooth={toggleTooth} />
        </div>
        <div className="text-[10px] font-bold text-slate-400 mt-3 text-center uppercase tracking-widest">Arcada Inferior (Mandibular)</div>
      </div>

    </div>
  );
};
