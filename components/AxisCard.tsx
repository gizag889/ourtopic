'use client';

import React from 'react';
import { Lightbulb, CheckCircle2 } from 'lucide-react';

export interface CoreAxiom {
  statement: string;
  why_it_is_core: string;
  vulnerability: number;
}

export interface DeepAnalysis {
  reasoning_process: {
    abduction: string;
    necessary_condition: string;
  };
  paradigm_name: string;
  core_axioms: CoreAxiom[];
  alternative_lens: string;
}

export interface AxisData {
  id: string;
  dimension_name: string;
  poles: string[];
  description: string;
  bridge_hint: string;
  representative_texts?: [string, string];
  deep_analysis?: DeepAnalysis;
}

interface AxisCardProps {
  axis: AxisData;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export const AxisCard: React.FC<AxisCardProps> = ({ axis, isSelected, onSelect }) => {
  return (
    <div 
      onClick={() => onSelect(axis.id)}
      className={`
        relative p-6 rounded-2xl cursor-pointer transition-all duration-300 ease-in-out
        border ${isSelected ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20' : 'border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 hover:border-indigo-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}
        backdrop-blur-sm
      `}
    >
      {isSelected && (
        <div className="absolute top-4 right-4 text-indigo-600 dark:text-indigo-400">
          <CheckCircle2 size={24} />
        </div>
      )}
      
      <h3 className="text-xl font-bold mb-4 text-zinc-900 dark:text-zinc-100 pr-8">
        {axis.dimension_name}
      </h3>
      
      {/* Visual Versus Bar */}
      <div className="flex items-center justify-between mb-6 bg-zinc-100 dark:bg-zinc-800 p-3 rounded-lg">
        <div className="flex-1 text-center font-medium text-blue-600 dark:text-blue-400">
          {axis.poles[0]}
        </div>
        <div className="px-4 text-zinc-400 italic font-serif text-sm">vs</div>
        <div className="flex-1 text-center font-medium text-rose-600 dark:text-rose-400">
          {axis.poles[1]}
        </div>
      </div>
      
      {/* Description */}
      <p className="text-zinc-600 dark:text-zinc-400 mb-6 text-sm leading-relaxed">
        {axis.description}
      </p>

      {/* Representative Texts (Shown only when selected) */}
      {isSelected && axis.representative_texts && (
        <div className="space-y-6 mb-6" onClick={(e) => e.stopPropagation()}>
          {/* Extreme Opinions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col h-full">
              <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wide text-center">
                先鋭的な意見 ({axis.poles[0]})
              </div>
              <div className="flex-1 rounded-xl overflow-hidden">
                {axis.representative_texts && (
                  <blockquote className="h-full p-4 bg-white dark:bg-zinc-800 border-l-4 border-blue-500 rounded-r-xl text-sm text-zinc-700 dark:text-zinc-300 shadow-sm leading-relaxed whitespace-pre-wrap">
                    {axis.representative_texts[0]}
                  </blockquote>
                )}
              </div>
            </div>
            <div className="flex flex-col h-full">
              <div className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-2 uppercase tracking-wide text-center">
                先鋭的な意見 ({axis.poles[1]})
              </div>
              <div className="flex-1 rounded-xl overflow-hidden">
                {axis.representative_texts && (
                  <blockquote className="h-full p-4 bg-white dark:bg-zinc-800 border-l-4 border-rose-500 rounded-r-xl text-sm text-zinc-700 dark:text-zinc-300 shadow-sm leading-relaxed whitespace-pre-wrap">
                    {axis.representative_texts[1]}
                  </blockquote>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Deep Analysis (Philosophical Insights) */}
      {isSelected && axis.deep_analysis && (
        <div className="mb-6 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="bg-slate-100 dark:bg-slate-800/60 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm tracking-wide flex items-center gap-2">
              <span className="text-lg">👁️</span> 深層分析: 核心的公理 (Core Axioms)
            </h4>
            <div className="text-xs font-mono px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
              {axis.deep_analysis.paradigm_name}
            </div>
          </div>
          
          <div className="p-4 space-y-5">
            {/* Reasoning Process */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span>1.</span> 推論プロセス (Chain of Thought)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="bg-white dark:bg-slate-800/80 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50 shadow-sm">
                  <span className="block text-xs font-bold text-slate-400 dark:text-slate-500 mb-1">Abduction (逆行推論)</span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[13px]">
                    {axis.deep_analysis.reasoning_process.abduction}
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-800/80 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50 shadow-sm">
                  <span className="block text-xs font-bold text-slate-400 dark:text-slate-500 mb-1">Necessary Condition (必要条件)</span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[13px]">
                    {axis.deep_analysis.reasoning_process.necessary_condition}
                  </p>
                </div>
              </div>
            </div>

            {/* Core Axioms */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span>2.</span> 抽出された公理
              </div>
              <div className="space-y-3">
                {axis.deep_analysis.core_axioms.map((axiom, idx) => (
                  <div key={idx} className="bg-white dark:bg-slate-800/80 p-4 rounded-lg border border-slate-100 dark:border-slate-700/50 shadow-sm relative overflow-hidden group hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                    {/* Vulnerability indicator */}
                    <div 
                      className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-purple-500" 
                      style={{ opacity: Math.max(0.2, 1 - axiom.vulnerability) }}
                      title={`Vulnerability: ${axiom.vulnerability} (低いほど強固)`}
                    />
                    <div className="pl-3">
                      <div className="flex items-start justify-between mb-2 gap-4">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {axiom.statement}
                        </span>
                        <span className="shrink-0 text-[10px] font-mono bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600" title="Vulnerability (0.0=不動, 1.0=可変)">
                          Vuln: {axiom.vulnerability.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {axiom.why_it_is_core}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alternative Lens */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700/50">
               <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span>3.</span> オルタナティヴな解釈
              </div>
              <p className="text-[13px] text-slate-700 dark:text-slate-300 italic bg-white/50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700/30">
                {axis.deep_analysis.alternative_lens}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Bridge Hint Highlight */}
      <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl border border-amber-100 dark:border-amber-900/50 flex gap-3 items-start">
        <Lightbulb className="text-amber-500 shrink-0 mt-0.5" size={20} />
        <div>
          <h4 className="text-amber-800 dark:text-amber-500 font-semibold text-sm mb-1">
            第三極の示唆 (Bridge Hint)
          </h4>
          <p className="text-amber-700 dark:text-amber-400/90 text-sm leading-relaxed">
            {axis.bridge_hint}
          </p>
        </div>
      </div>
    </div>
  );
};
