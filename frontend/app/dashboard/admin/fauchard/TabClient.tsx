'use client';

import { useState } from 'react';
import { Sliders, Trophy, History, ShieldCheck } from 'lucide-react';
import FauchardWeightsPanel from '@/components/admin/fauchard/FauchardWeightsPanel';
import FauchardFiltersPanel from '@/components/admin/fauchard/FauchardFiltersPanel';
import LeagueConfigPanel from '@/components/admin/fauchard/LeagueConfigPanel';
import ConfigChangeLog from '@/components/admin/fauchard/ConfigChangeLog';
import { motion, AnimatePresence } from 'framer-motion';

type Tab = 'weights' | 'filters' | 'leagues' | 'history';

export function TabClient({ config }: { config: any }) {
  const [activeTab, setActiveTab] = useState<Tab>('weights');

  const tabs = [
    { id: 'weights', label: 'Pesos del Score', icon: Sliders },
    { id: 'filters', label: 'Filtros y Tiempos', icon: ShieldCheck },
    { id: 'leagues', label: 'Sistema de Categorías', icon: Trophy },
    { id: 'history', label: 'Historial', icon: History },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Tab Navigation */}
      <nav className="flex items-center gap-1 p-1 bg-slate-900/60 border border-slate-800/80 rounded-[2.5rem] self-start overflow-hidden backdrop-blur-md">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`
                flex items-center gap-3 px-6 py-3 rounded-full transition-all duration-300 relative
                ${isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300'}
              `}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-slate-800 border border-slate-700/50 rounded-full"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon className={`w-4 h-4 shrink-0 relative z-10 ${isActive ? 'text-teal-400' : ''}`} />
              <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Tab Content */}
      <div className="bg-slate-900/20 border border-slate-800/40 rounded-[3rem] p-8 md:p-12 shadow-inner min-h-[500px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'weights' && <FauchardWeightsPanel initialConfig={config} />}
            {activeTab === 'filters' && <FauchardFiltersPanel initialConfig={config} />}
            {activeTab === 'leagues' && <LeagueConfigPanel initialConfig={config} />}
            {activeTab === 'history' && <ConfigChangeLog />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
