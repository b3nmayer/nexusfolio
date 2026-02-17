"use client";

import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import dynamic from 'next/dynamic';
import { Upload, Plus, BarChart2, TrendingUp, X, Loader2, Activity, PieChart } from 'lucide-react';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

export default function PortfolioAnalyzer() {
  const [portfolio, setPortfolio] = useState<{ ticker: string, weight: number }[]>([]);
  const [stockData, setStockData] = useState<Record<string, any[]>>({});
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [newCompareTicker, setNewCompareTicker] = useState("");
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('line');
  const [timeframe, setTimeframe] = useState<number>(90); // Default to 3M
  const [isLoading, setIsLoading] = useState(false);

  // --- CSV IMPORT ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const tickers = results.data
          .map((row: any) => row[0]?.trim().toUpperCase())
          .filter((t: string) => t && t !== 'TICKER'); 
        
        const equalWeight = 100 / tickers.length;
        const newPortfolio = tickers.map((t: string) => ({ ticker: t, weight: equalWeight }));
        
        setPortfolio(newPortfolio);
        fetchDataForTickers([...tickers, ...compareTickers], 365);
      }
    });
  };

  // --- REAL DATA FETCHING VIA NEXT.JS API ---
  const fetchDataForTickers = async (tickers: string[], days: number = 365) => {
    setIsLoading(true);
    const newData: Record<string, any[]> = { ...stockData };
    
    try {
      await Promise.all(tickers.map(async (ticker) => {
        if (!newData[ticker]) {
          const res = await fetch(`/api/stock?ticker=${ticker}&days=${days}`);
          if (!res.ok) throw new Error(`Failed to fetch ${ticker}`);
          const json = await res.json();
          newData[ticker] = json.data;
        }
      }));
      setStockData(newData);
    } catch (error) {
      console.error(error);
      alert("Error fetching some stock data. Ensure tickers are valid (e.g., AAPL, TSLA).");
    } finally {
      setIsLoading(false);
    }
  };

  const updateWeight = (index: number, newWeight: number) => {
    const newPort = [...portfolio];
    newPort[index].weight = newWeight;
    setPortfolio(newPort);
  };

  const addCompareTicker = () => {
    if (newCompareTicker && !compareTickers.includes(newCompareTicker.toUpperCase())) {
      const ticker = newCompareTicker.toUpperCase();
      setCompareTickers([...compareTickers, ticker]);
      fetchDataForTickers([ticker]);
      setNewCompareTicker("");
    }
  };

  const removeCompareTicker = (ticker: string) => {
    setCompareTickers(compareTickers.filter(t => t !== ticker));
  };

  // --- AGGREGATE CALCULATIONS ---
  const chartSeries = useMemo(() => {
    if (portfolio.length === 0) return [];

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeframe);
    const cutoffTime = cutoffDate.getTime();

    const aggregateData = [];
    const baseTicker = portfolio[0].ticker;
    const baseData = stockData[baseTicker] || [];

    for (let i = 0; i < baseData.length; i++) {
      if (baseData[i].x < cutoffTime) continue;

      let aggOpen = 0, aggHigh = 0, aggLow = 0, aggClose = 0;
      let totalWeight = 0;

      portfolio.forEach(({ ticker, weight }) => {
        const sData = stockData[ticker]?.find(d => d.x === baseData[i].x);
        if (sData) {
          const w = weight / 100;
          aggOpen += sData.y[0] * w;
          aggHigh += sData.y[1] * w;
          aggLow += sData.y[2] * w;
          aggClose += sData.y[3] * w;
          totalWeight += w;
        }
      });

      if (totalWeight > 0) {
        aggregateData.push({
          x: baseData[i].x,
          y: chartType === 'candlestick' 
            ? [aggOpen, aggHigh, aggLow, aggClose].map(v => parseFloat(v.toFixed(2)))
            : parseFloat(aggClose.toFixed(2))
        });
      }
    }

    const series: any[] = [{
      name: 'Aggregate Portfolio',
      type: chartType,
      data: aggregateData
    }];

    compareTickers.forEach(ticker => {
      const cData = stockData[ticker] || [];
      const filteredData = cData.filter(d => d.x >= cutoffTime).map(d => ({
        x: d.x,
        y: parseFloat(d.y[3].toFixed(2))
      }));
      
      series.push({
        name: ticker,
        type: 'line',
        data: filteredData
      });
    });

    return series;
  }, [portfolio, stockData, compareTickers, chartType, timeframe]);

  // --- 2026 DARK MODE CHART CONFIG ---
  const chartOptions: any = {
    theme: { mode: 'dark' },
    chart: { 
      type: chartType, 
      animations: { enabled: true, easing: 'easeinout', speed: 800 }, 
      toolbar: { show: false },
      background: 'transparent',
      fontFamily: 'inherit'
    },
    xaxis: { 
      type: 'datetime',
      axisBorder: { show: false },
      axisTicks: { show: false },
      grid: { show: false },
      labels: { style: { colors: '#71717a' } }
    },
    yaxis: { 
      labels: { formatter: (value: number) => `$${value.toFixed(2)}`, style: { colors: '#71717a' } },
      tooltip: { enabled: true }
    },
    grid: { 
      borderColor: '#27272a', 
      strokeDashArray: 4,
      xaxis: { lines: { show: true } },   
      yaxis: { lines: { show: true } }
    },
    stroke: { width: chartType === 'line' ? 2 : 1, curve: 'smooth' },
    colors: ['#38bdf8', '#34d399', '#fb7185', '#fbbf24', '#a78bfa'],
    tooltip: { theme: 'dark', shared: true, intersect: false, style: { fontSize: '14px' } },
    noData: { text: '' }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-sky-500/30 p-4 md:p-8 flex flex-col gap-8 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.1),rgba(255,255,255,0))]">
      
      {/* Header */}
      <header className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-xl">
            <Activity className="text-sky-400 w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-500">
            FolioAnalyzer
          </h1>
        </div>
      </header>

      <div className="flex flex-col xl:flex-row gap-6 h-full flex-1">
        
        {/* LEFT COLUMN: Setup Panel */}
        <div className="w-full xl:w-1/3 flex flex-col gap-6">
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 p-6 rounded-3xl shadow-2xl flex flex-col gap-6 flex-1">
            
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-zinc-200 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-sky-400" /> Allocation Setup
              </h2>
            </div>
            
            <label className="group relative flex flex-col items-center justify-center w-full p-6 border border-dashed border-zinc-700/50 rounded-2xl cursor-pointer hover:bg-zinc-800/50 hover:border-sky-500/50 transition-all duration-300 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-sky-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Upload className="w-6 h-6 mb-3 text-zinc-400 group-hover:text-sky-400 transition-colors" />
              <span className="text-sm font-medium text-zinc-300">Import CSV Tickers</span>
              <span className="text-xs text-zinc-600 mt-1">Single column format</span>
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>

            {portfolio.length > 0 && (
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-5 mt-2">
                  {portfolio.map((item, idx) => (
                    <div key={item.ticker} className="flex flex-col gap-2 group">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold text-zinc-300 group-hover:text-white transition-colors">{item.ticker}</span>
                        <input 
                          type="number" 
                          value={item.weight.toFixed(1)} 
                          onChange={(e) => updateWeight(idx, Number(e.target.value))}
                          className="w-16 p-1 text-right bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-300 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all"
                        />
                      </div>
                      <input 
                        type="range" 
                        min="0" max="100" 
                        value={item.weight} 
                        onChange={(e) => updateWeight(idx, Number(e.target.value))}
                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {portfolio.length > 0 && (
              <div className="pt-4 border-t border-zinc-800/50 flex justify-between items-center">
                <span className="text-sm text-zinc-500">Total Allocation</span>
                <span className={`text-sm font-mono font-bold ${portfolio.reduce((s, i) => s + i.weight, 0) === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {portfolio.reduce((sum, item) => sum + item.weight, 0).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Terminal / Chart */}
        <div className="w-full xl:w-2/3 flex flex-col gap-6">
          
          {/* Top Control Bar */}
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 p-2 pl-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between shadow-lg">
            
            <div className="flex gap-1 p-1 bg-zinc-950/50 border border-zinc-800/50 rounded-xl">
              {[ {label: '1M', days: 30}, {label: '3M', days: 90}, {label: '6M', days: 180}, {label: '1Y', days: 365} ].map(tf => (
                <button 
                  key={tf.label}
                  onClick={() => setTimeframe(tf.days)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${timeframe === tf.days ? 'bg-zinc-800 text-sky-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            <div className="flex gap-1 p-1 bg-zinc-950/50 border border-zinc-800/50 rounded-xl">
              <button onClick={() => setChartType('line')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 flex items-center gap-1.5 ${chartType === 'line' ? 'bg-zinc-800 text-sky-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
                <TrendingUp size={14}/> Line
              </button>
              <button onClick={() => setChartType('candlestick')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 flex items-center gap-1.5 ${chartType === 'candlestick' ? 'bg-zinc-800 text-sky-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
                <BarChart2 size={14}/> Candle
              </button>
            </div>

            <div className="flex items-center gap-2 pr-2">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Compare (e.g. SPY)" 
                  value={newCompareTicker}
                  onChange={(e) => setNewCompareTicker(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800/80 rounded-xl pl-3 pr-8 py-1.5 w-36 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-all uppercase"
                  onKeyDown={(e) => e.key === 'Enter' && addCompareTicker()}
                />
                <button onClick={addCompareTicker} disabled={isLoading} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-sky-400 transition-colors disabled:opacity-50">
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>

          {compareTickers.length > 0 && (
            <div className="flex gap-2 flex-wrap px-1">
              {compareTickers.map(ticker => (
                <span key={ticker} className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800/50 border border-zinc-700/50 rounded-full text-xs font-medium text-zinc-300 backdrop-blur-sm group">
                  {ticker}
                  <X size={12} className="cursor-pointer text-zinc-500 group-hover:text-rose-400 transition-colors" onClick={() => removeCompareTicker(ticker)} />
                </span>
              ))}
            </div>
          )}

          {/* Main Chart Window */}
          <div className="flex-1 bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-3xl shadow-2xl min-h-[500px] relative overflow-hidden group">
            
            {/* Subtle inner glow */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center flex-col gap-4 bg-zinc-950/40 backdrop-blur-sm">
                <div className="relative">
                  <div className="absolute inset-0 bg-sky-500 blur-xl opacity-20 animate-pulse rounded-full" />
                  <Loader2 className="animate-spin text-sky-400 relative z-10" size={36} />
                </div>
                <p className="text-zinc-400 font-medium text-sm tracking-wide">Syncing Market Data...</p>
              </div>
            )}
            
            {portfolio.length === 0 ? (
              <div className="h-full flex items-center justify-center flex-col gap-4 text-zinc-600">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mb-2">
                  <Activity size={32} className="text-zinc-500" />
                </div>
                <p className="text-sm">Upload a CSV to initialize terminal.</p>
              </div>
            ) : (
              <div className="h-full w-full p-4 pt-6">
                {typeof window !== 'undefined' && (
                  <Chart 
                    options={chartOptions} 
                    series={chartSeries} 
                    type={chartType === 'candlestick' ? 'candlestick' : 'line'} 
                    height="100%" 
                  />
                )}
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}
