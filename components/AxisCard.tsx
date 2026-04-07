'use client';

import React from 'react';
import { Lightbulb, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Tweet } from 'react-tweet';

export interface AxisData {
  id: string;
  dimension_name: string;
  poles: string[];
  description: string;
  bridge_hint: string;
  representative_tweets?: [string, string];
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

      {/* Representative Tweets (Shown only when selected) */}
      {isSelected && axis.representative_tweets && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col">
            <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wide text-center">
              代表的な意見 ({axis.poles[0]})
            </div>
            <div className="flex-1 rounded-xl overflow-hidden [&_.react-tweet-theme]:m-0! [&_.react-tweet-theme]:w-full! [&_.react-tweet-theme]:max-w-none!">
              <Tweet id={axis.representative_tweets[0]} />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-2 uppercase tracking-wide text-center">
              代表的な意見 ({axis.poles[1]})
            </div>
            <div className="flex-1 rounded-xl overflow-hidden [&_.react-tweet-theme]:m-0! [&_.react-tweet-theme]:w-full! [&_.react-tweet-theme]:max-w-none!">
              <Tweet id={axis.representative_tweets[1]} />
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
