import React, { useState, useRef } from 'react';
import { Search, Instagram, Copy, Loader2, Filter, ExternalLink, Activity, Terminal, ShieldAlert, Database, Upload, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

function composeQuery(name: string, media: string, location: string, extra: string) {
  return [name.trim(), media.trim(), location.trim(), extra.trim()]
    .filter(Boolean)
    .join(' ');
}

export default function App() {
  const [nameQuery, setNameQuery] = useState('');
  const [mediaQuery, setMediaQuery] = useState('instagram');
  const [locationQuery, setLocationQuery] = useState('Zürich');
  const [extraQuery, setExtraQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ items: { handle: string; link: string; followers: string | null }[]; links: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [queue, setQueue] = useState<{ name: string; done: boolean }[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [logs, setLogs] = useState<{ time: string; msg: string; type: 'info' | 'raw' | 'proc' | 'extract' | 'error' }[]>([]);

  const query = composeQuery(nameQuery, mediaQuery, locationQuery, extraQuery);

  const addLog = (msg: string, type: 'info' | 'raw' | 'proc' | 'extract' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev.slice(-4), { time, msg, type }]);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);
    addLog(`Initiating search for: "${query}"`, 'info');

    try {
      addLog('Fetching result set from duckduckgo.com...', 'info');
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) throw new Error('Search failed. Please try again.');

      const data = await response.json();
      
      addLog(`RAW: Found ${data.links.length} candidate links containing "instagram.com"`, 'raw');
      addLog('PROC: Stripping Google redirect wrappers... OK', 'proc');
      addLog(`EXTRACT: Filtered internal paths. ${data.items.length} unique handles identified.`, 'extract');
      
      setResults(data);
      setQueue(prev => prev.map(item => item.name === nameQuery ? { ...item, done: true } : item));
    } catch (err: any) {
      setError(err.message);
      addLog(`ERROR: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const nameIdx = headers.indexOf('name');
      if (nameIdx === -1) { addLog('CSV has no "name" column', 'error'); return; }
      const names = lines.slice(1)
        .map(l => l.split(',')[nameIdx]?.trim())
        .filter(Boolean) as string[];
      setQueue(names.map(name => ({ name, done: false })));
      addLog(`CSV loaded: ${names.length} names queued`, 'info');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const clearDb = async () => {
    try {
      const res = await fetch('/api/handles', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear database');
      addLog('Database cleared.', 'info');
    } catch (err: any) {
      addLog(`ERROR: ${err.message}`, 'error');
    } finally {
      setConfirmClear(false);
    }
  };

  const exportFromDb = async () => {
    try {
      const response = await fetch('/api/handles');
      if (!response.ok) throw new Error('Failed to fetch stored handles');
      const rows: { handle: string; link: string; followers: string | null; search_count: number; first_seen: number; last_seen: number }[] = await response.json();
      if (!rows.length) return;

      const header = 'handle,link,followers,search_count,first_seen,last_seen';
      const csvRows = rows.map(r =>
        [
          r.handle,
          r.link,
          r.followers ?? '',
          r.search_count,
          new Date(r.first_seen).toISOString(),
          new Date(r.last_seen).toISOString(),
        ].join(',')
      );
      const csv = [header, ...csvRows].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `instahunt_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      addLog(`ERROR: ${err.message}`, 'error');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      {/* Confirm Clear Dialog */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-red-700/50 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-red-400 font-bold text-lg mb-2">Clear Database?</h2>
            <p className="text-slate-300 text-sm mb-6">This will permanently delete all stored handles from the database. This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmClear(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold rounded border border-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={clearDb}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded border border-red-600 transition-colors"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Top Navigation Bar */}
      <header className="h-16 border-b border-slate-700 bg-slate-800 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-600 rounded flex items-center justify-center text-white shadow-lg shadow-orange-600/20">
            <Instagram size={20} />
          </div>
          <h1 className="text-slate-100 font-bold text-lg tracking-tight">
            InstaHunt <span className="text-slate-400 font-normal text-xs ml-2 font-mono">v2.4.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <div className={`w-2 h-2 rounded-full ${loading ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500'}`}></div>
            <span className={`text-xs font-medium uppercase tracking-wider ${loading ? 'text-orange-400' : 'text-emerald-400'}`}>
              {loading ? 'Scraper Active' : 'Engine Ready'}
            </span>
          </div>
          <button
            onClick={() => setConfirmClear(true)}
            className="px-4 py-2 bg-red-900/60 hover:bg-red-800/80 text-red-300 text-sm font-semibold rounded border border-red-700/50 transition-colors"
          >
            Clear DB
          </button>
          <button 
            onClick={exportFromDb}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold rounded border border-slate-600 transition-colors"
          >
            {copied ? 'Exported!' : 'Export List'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Configuration */}
        <aside className="w-80 border-r border-slate-700 bg-slate-800/50 p-6 flex flex-col gap-6 shrink-0">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-4">Search Configuration</label>
            <input ref={csvInputRef} type="file" accept=".csv" onChange={loadCsv} className="hidden" />
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="w-full mb-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold rounded border border-slate-600 transition-colors flex items-center justify-center gap-2"
            >
              <Upload size={14} />
              Load CSV
            </button>
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="text-[11px] text-slate-400 block mb-2 uppercase font-medium">Name</label>
                <input
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  placeholder="vicafe"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-slate-300 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-2 uppercase font-medium">Media</label>
                  <input
                    value={mediaQuery}
                    onChange={(e) => setMediaQuery(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-slate-300 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-2 uppercase font-medium">Location</label>
                  <input
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-slate-300 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-2 uppercase font-medium">Additional Terms</label>
                <input
                  value={extraQuery}
                  onChange={(e) => setExtraQuery(e.target.value)}
                  placeholder="media handle"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-slate-300 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-2 uppercase font-medium">Composed Search</label>
                <div className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-slate-300 text-sm min-h-24 font-mono break-words">
                  {query || 'Enter at least one search value'}
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-lg shadow-orange-600/10 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                <span>{loading ? 'HUNTING...' : 'INITIALIZE SCOUT'}</span>
              </button>
            </form>
          </div>

          {queue.length > 0 && (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">
                CSV Queue ({queue.filter(i => !i.done).length} / {queue.length} remaining)
              </label>
              <div className="space-y-1 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                {queue.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setNameQuery(item.name)}
                    className={`w-full text-left px-3 py-2 rounded text-xs font-mono transition-colors border flex items-center gap-2 ${
                      item.done
                        ? 'bg-slate-900/30 border-slate-800 text-slate-600'
                        : nameQuery === item.name
                        ? 'bg-orange-600/20 border-orange-500/50 text-orange-300'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {item.done
                      ? <CheckCircle2 size={12} className="shrink-0 text-emerald-600" />
                      : <span className="text-slate-600 text-[10px] shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                    }
                    <span className={item.done ? 'line-through' : ''}>{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300">Deep Link Extraction</span>
              <div className="w-8 h-4 bg-orange-600 rounded-full flex items-center px-1">
                <div className="w-2.5 h-2.5 bg-white rounded-full ml-auto"></div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300">Auth Snippet Parsing</span>
              <div className="w-8 h-4 bg-orange-600 rounded-full flex items-center px-1">
                <div className="w-2.5 h-2.5 bg-white rounded-full ml-auto"></div>
              </div>
            </div>
          </div>

          <div className="mt-auto">
            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg">
              <p className="text-[10px] text-slate-500 mb-2 font-bold uppercase tracking-widest">Engine Status</p>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-200 font-mono">ddg_html_v4</span>
                <span className="text-[10px] text-emerald-500 font-bold">STABLE</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-3">
                <motion.div 
                  initial={{ width: "30%" }}
                  animate={{ width: loading ? "90%" : "68%" }}
                  className="bg-orange-500 h-full transition-all duration-1000"
                ></motion.div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Data Feed */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-900">
          {/* Stats Overview */}
          <div className="grid grid-cols-4 border-b border-slate-700 shrink-0">
            <div className="p-6 border-r border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <Activity size={14} className="text-slate-500" />
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Links Scanned</p>
              </div>
              <p className="text-3xl text-slate-100 font-mono font-bold">{results?.links.length || 0}</p>
            </div>
            <div className="p-6 border-r border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <Database size={14} className="text-slate-500" />
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Candidate Matches</p>
              </div>
              <p className="text-3xl text-slate-100 font-mono font-bold">{results?.links.length || 0}</p>
            </div>
            <div className="p-6 border-r border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <Filter size={14} className="text-orange-500" />
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Clean Handles</p>
              </div>
              <p className="text-3xl text-orange-500 font-mono font-bold">{results?.items.length || 0}</p>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert size={14} className="text-slate-500" />
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Filter Rate</p>
              </div>
              <p className="text-3xl text-slate-100 font-mono font-bold">
                {results ? `${Math.round((1 - results.items.length / results.links.length) * 100)}%` : '0%'}
              </p>
            </div>
          </div>

          {/* Results Table Section */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="bg-slate-800/40 px-6 py-3 border-b border-slate-700 grid grid-cols-[1.5fr_1.5fr_1.5fr_1fr] gap-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest shrink-0">
              <div>Extracted Handle</div>
              <div>Followers (Est.)</div>
              <div>Source Metadata</div>
              <div className="text-right">Actions</div>
            </div>
            
            <div className="flex-1 overflow-y-auto font-mono text-xs custom-scrollbar">
              <AnimatePresence>
                {results?.items.map((item, idx) => (
                  <motion.div
                    key={item.handle}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="px-6 py-4 border-b border-slate-800/50 grid grid-cols-[1.5fr_1.5fr_1.5fr_1fr] gap-4 items-center hover:bg-slate-800/30 group transition-colors"
                  >
                    <div className="text-emerald-400 font-bold flex items-center gap-2">
                       <span className="text-slate-600 text-[10px]">{String(idx + 1).padStart(2, '0')}</span>
                       @{item.handle}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.followers ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-slate-800 text-slate-500'}`}>
                        {item.followers ? item.followers : '---'}
                      </span>
                    </div>
                    <div className="text-slate-500 truncate text-[11px]">
                      instagram.com/{item.handle}/...
                    </div>
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={`https://instagram.com/${item.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 px-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded border border-slate-600 transition-all flex items-center gap-1"
                      >
                        <ExternalLink size={12} />
                        <span className="text-[10px] font-sans font-bold">VIEW</span>
                      </a>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {(!results || results.items.length === 0) && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-30">
                  <Terminal size={40} className="mb-4" />
                  <p className="text-sm font-mono tracking-widest uppercase font-bold">
                    {query ? 'No handles identified in result set' : 'Awaiting initialization...'}
                  </p>
                </div>
              )}
              
              {loading && (
                <div className="h-full flex flex-col items-center justify-center text-slate-600">
                  <Loader2 size={32} className="animate-spin mb-4 text-orange-500/50" />
                  <p className="text-sm font-mono tracking-widest uppercase font-bold animate-pulse text-slate-400">
                    Scanning DuckDuckGo Indexes...
                  </p>
                </div>
              )}
            </div>

            {/* Console Output */}
            <div className="h-44 bg-black border-t border-slate-700 p-4 font-mono text-[11px] overflow-hidden shrink-0">
              <div className="flex items-center gap-2 text-slate-500 mb-2 pb-2 border-b border-slate-900">
                <Terminal size={12} />
                <span className="font-bold uppercase tracking-widest text-[9px]">Live Scraper Console</span>
              </div>
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-slate-600 min-w-[60px]">[{log.time}]</span>
                    <span className={`
                      ${log.type === 'info' ? 'text-blue-400' : ''}
                      ${log.type === 'raw' ? 'text-slate-300' : ''}
                      ${log.type === 'proc' ? 'text-slate-300' : ''}
                      ${log.type === 'extract' ? 'text-orange-400 font-bold' : ''}
                      ${log.type === 'error' ? 'text-red-500' : ''}
                     truncate`}>
                      {log.type.toUpperCase()}: {log.msg}
                    </span>
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-3">
                    <span className="text-slate-600 min-w-[60px]">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                    <span className="text-slate-300 animate-pulse">_</span>
                  </div>
                )}
                {!loading && logs.length === 0 && (
                  <div className="text-slate-700 italic">Waiting for process initialization...</div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}} />
    </div>
  );
}
