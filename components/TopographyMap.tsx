'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, Info, Trash2 } from 'lucide-react';

export interface DataPoint {
  id: string;
  text: string;
  source: 'X' | 'Note';
  parentId: string;
  x: number;
  y: number;
}

export const TopographyMap: React.FC = () => {
  const [points, setPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);

  const fetchTopography = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/topography');
      if (!res.ok) {
        throw new Error('Failed to fetch topography data');
      }
      const data = await res.json();
      setPoints(data.points || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopography();
  }, []);

  // Calculate scales
  const { minX, maxX, minY, maxY } = useMemo(() => {
    if (points.length === 0) return { minX: 0, maxX: 10, minY: 0, maxY: 10 };
    let mix = points[0].x, max = points[0].x;
    let miy = points[0].y, may = points[0].y;
    points.forEach(p => {
      if (p.x < mix) mix = p.x;
      if (p.x > max) max = p.x;
      if (p.y < miy) miy = p.y;
      if (p.y > may) may = p.y;
    });
    // Add margin
    const dx = (max - mix) * 0.1 || 1;
    const dy = (may - miy) * 0.1 || 1;
    return { minX: mix - dx, maxX: max + dx, minY: miy - dy, maxY: may + dy };
  }, [points]);

  const mapX = (x: number) => ((x - minX) / (maxX - minX)) * 100;
  const mapY = (y: number) => ((y - minY) / (maxY - minY)) * 100;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-zinc-50 dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-zinc-500 font-medium">Generating Topography Mapping...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 text-red-600 rounded-2xl border border-red-200 text-center font-medium">
        Error loading topography: {error}
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-500">
        <Info className="w-10 h-10 mb-4 opacity-50" />
        <p className="font-medium">No data accumulated yet.</p>
        <p className="text-sm mt-2 opacity-70">Run topic or text analyses to populate the map.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-square md:aspect-video bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-inner group">
      {/* Legend */}
      <div className="absolute top-6 left-6 flex gap-4 text-sm font-bold bg-white/90 dark:bg-zinc-800/90 backdrop-blur px-5 py-2.5 rounded-2xl shadow-sm z-10 border border-zinc-100 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
          <span className="text-zinc-700 dark:text-zinc-200">X (Twitter)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
          <span className="text-zinc-700 dark:text-zinc-200">Note (Text)</span>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg className="w-full h-full" overflow="visible">
        {/* Draw subtle grid */}
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800/80" strokeWidth="1" />
        </pattern>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {points.map(p => (
          <circle
            key={p.id}
            cx={`${mapX(p.x)}%`}
            cy={`${mapY(p.y)}%`}
            r="6"
            className={`
              transition-all duration-300 cursor-pointer hover:r-8 hover:stroke-white hover:stroke-2
              ${p.source === 'X' ? 'fill-blue-500' : 'fill-emerald-500'}
            `}
            style={{
              filter: `drop-shadow(0 0 6px ${p.source === 'X' ? 'rgba(59,130,246,0.6)' : 'rgba(16,185,129,0.6)'})`,
              transformOrigin: `${mapX(p.x)}% ${mapY(p.y)}%`
            }}
            onMouseEnter={() => setHoveredPoint(p)}
            onMouseLeave={() => setHoveredPoint(null)}
          />
        ))}
      </svg>

      {/* Hover Tooltip */}
      {hoveredPoint && (
        <div className="absolute bottom-6 left-6 right-6 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-xl p-5 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700 animate-in fade-in slide-in-from-bottom-2 duration-200 z-20 pointer-events-none">
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full ${hoveredPoint.source === 'X' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'}`}>
              {hoveredPoint.source}
            </span>
            <span className="text-xs font-bold text-zinc-400 truncate max-w-[250px]">{hoveredPoint.parentId}</span>
          </div>
          <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed max-h-[80px] overflow-hidden text-ellipsis">
            {hoveredPoint.text}
          </p>
        </div>
      )}
      
      {/* Controls */}
      <div className="absolute top-6 right-6 flex gap-3">
        <button 
          onClick={async () => {
            if (window.confirm("蓄積されたすべての分析データを削除しますか？\n（この操作は元に戻せません）")) {
              setLoading(true);
              try {
                await fetch('/api/topography', { method: 'DELETE' });
                await fetchTopography();
              } catch (err: any) {
                setError(err.message);
                setLoading(false);
              }
            }
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-red-500/90 dark:bg-red-600/90 backdrop-blur rounded-xl text-xs font-bold uppercase tracking-wider text-white border border-red-400 dark:border-red-500 hover:bg-red-600 dark:hover:bg-red-700 hover:scale-105 transition-all shadow-sm active:scale-95"
        >
          <Trash2 size={14} />
          Clear Data
        </button>
        <button 
          onClick={fetchTopography} 
          className="px-4 py-2 bg-white/90 dark:bg-zinc-800/90 backdrop-blur rounded-xl text-xs font-bold uppercase tracking-wider border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:scale-105 transition-all shadow-sm active:scale-95"
        >
          Refresh Map
        </button>
      </div>
    </div>
  );
};
