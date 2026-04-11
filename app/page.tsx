'use client';

import React, { useState } from 'react';
import { Search, Loader2, Download, MessageCircle, FileText } from 'lucide-react';
import { AxisCard, AxisData } from '@/components/AxisCard'; // Import from aliases won't work perfectly unless tsconfig paths are set, usually @/components is default.
// Let's rely on standard imports if we aren't sure, although default nextjs app has @/* mapped to ./*

interface AnalysisData {
  topic_summary: string;
  axes: AxisData[];
}

export default function Home() {
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'twitter' | 'text'>('twitter');
  const [pastedText, setPastedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [data, setData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAxisId, setSelectedAxisId] = useState<string | null>(null);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    if (mode === 'text' && !pastedText.trim()) return;

    setLoading(true);
    setError(null);
    setData(null);
    setSelectedAxisId(null);
    setLoadingText(mode === 'twitter' ? 'Fetching X posts...' : 'Chunking text & Analyzing...');

    try {
      // Small timeout to show progressive text
      setTimeout(() => {
        setLoadingText('Analyzing with AI...');
      }, 2000);

      const endpoint = mode === 'twitter' ? '/api/analyze' : '/api/analyze-text';
      const body = mode === 'twitter' ? { topic } : { topic, text: pastedText };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch analysis');
      }

      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans selection:bg-indigo-500/30">
      <main className="max-w-4xl mx-auto px-6 py-16 md:py-24">
        
        {/* Header / Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center px-3 py-1 mb-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-sm font-medium tracking-wide">
            Opinion Topography MVP
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-zinc-800 to-zinc-500 dark:from-zinc-100 dark:to-zinc-400 bg-clip-text text-transparent">
            Visualize the hidden axes of debate
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            Enter a trending topic to aggregate X posts and use AI to extract the core underlying values and conflicting dimensions shaping the conversation.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex justify-center mb-8 print:hidden">
          <div className="bg-zinc-200 dark:bg-zinc-800 p-1 rounded-xl inline-flex">
            <button
              onClick={() => { setMode('twitter'); setData(null); setSelectedAxisId(null); setError(null); }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === 'twitter' ? 'bg-white dark:bg-zinc-900 shadow text-indigo-600 dark:text-indigo-400' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
            >
              <MessageCircle size={18} />
              X (Twitter)
            </button>
            <button
              onClick={() => { setMode('text'); setData(null); setSelectedAxisId(null); setError(null); }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === 'text' ? 'bg-white dark:bg-zinc-900 shadow text-indigo-600 dark:text-indigo-400' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
            >
              <FileText size={18} />
              長文分析 (手動ペースト)
            </button>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleAnalyze} className="relative max-w-2xl mx-auto mb-16 print:hidden">
          <div className="space-y-4">
            <div className="relative flex items-center">
              <Search className="absolute left-4 text-zinc-400" size={20} />
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={mode === 'twitter' ? "e.g., AI regulation, Remote Work, Universal Basic Income..." : "テーマ・論点を入力 (例: 生成AIの未来)"}
                className="w-full pl-12 pr-32 py-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 shadow-sm transition-all text-lg placeholder-zinc-400"
                disabled={loading}
              />
              {mode === 'twitter' && (
                <button
                  type="submit"
                  disabled={loading || !topic.trim()}
                  className="absolute right-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 text-white font-medium rounded-xl transition-colors"
                >
                  Generate
                </button>
              )}
            </div>
            
            {mode === 'text' && (
              <div className="relative">
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="ここにNote記事などの長文をペーストしてください..."
                  className="w-full p-6 text-base rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm transition-all h-64 resize-y leading-relaxed"
                  disabled={loading}
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="submit"
                    disabled={loading || !topic.trim() || !pastedText.trim()}
                    className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 text-white font-semibold rounded-xl transition-colors shadow-md"
                  >
                    Analyze Text
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">{loadingText}</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 mb-8 rounded-xl bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900/50 text-red-600 dark:text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Results State */}
        {data && !loading && (
          <div className="animate-in slide-in-from-bottom-4 fade-in duration-700">
            <div className="mb-8 p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <h2 className="text-sm font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider mb-2">Topic Summary</h2>
              <p className="text-lg text-zinc-800 dark:text-zinc-200 leading-relaxed font-medium">
                {data.topic_summary}
              </p>
            </div>

            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Identified Axes</h2>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Select one to explore deeper</span>
              </div>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl transition-all text-sm font-bold shadow-sm hover:shadow-md active:scale-95"
              >
                <Download size={18} />
                PDF形式で保存
              </button>
            </div>

            <div className="grid gap-6 md:grid-cols-1">
              {data.axes.map((axis) => (
                <AxisCard
                  key={axis.id}
                  axis={axis}
                  isSelected={selectedAxisId === axis.id}
                  onSelect={setSelectedAxisId}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
