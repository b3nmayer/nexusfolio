"use client";

import React, { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import dynamic from 'next/dynamic';
import { Upload, Plus, BarChart2, TrendingUp, X, Loader2, Activity, PieChart, Calendar, Network, Search } from 'lucide-react';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

export default function PortfolioAnalyzer() {
  const [portfolio, setPortfolio] = useState<{ ticker: string, weight: number }[]>([]);
  const [stockData, setStockData] = useState<Record<string, any[]>>({});
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [newCompareTicker, setNewCompareTicker] = useState("");
  const [newPortfolioTicker, setNewPortfolioTicker] = useState("");
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('line');
  const [isLoading, setIsLoading] = useState(false);
  
  // Main Chart Timeframes
  const [timeframe, setTimeframe] = useState<number | 'YTD' | 'CUSTOM'>(90);
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split('T')[0]);

  // Correlation Engine
  const [isCalculatingCorr, setIsCalculatingCorr] = useState(false);
  const [topCorrelations, setTopCorrelations] = useState<{ticker: string, correlation: number}[]>([]);
  const [corrTimeframe, setCorrTimeframe] = useState<number>(90); // Independent Correlation Timeframe

  // Sequential Data Fetcher
  const fetchDataForTickers = async (tickers: string[], days: number = 1825) => {
    setIsLoading(true);
    const newData: Record<string, any[]> = { ...stockData };
    try {
      for (const ticker of tickers) {
        if (!newData[ticker]) {
          const res = await fetch(`/api/stock?ticker=${ticker}&days=${days}`);
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(`Rejected ticker '${ticker}': ${errorData.error || 'Server error'}`);
          }
          const json = await res.json();
          newData[ticker] = json.data;
        }
      }
      setStockData(newData);
    } catch (error: any) {
      console.error(error);
      alert(`Data Sync Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // CSV Import
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
        fetchDataForTickers([...tickers, ...compareTickers], 1825);
      }
    });
  };

  const addManualTicker = () => {
    if (!newPortfolioTicker) return;
    const ticker = newPortfolioTicker.toUpperCase().trim();
    if (portfolio.some(p => p.ticker === ticker)) {
      setNewPortfolioTicker("");
      return; 
    }
    fetchDataForTickers([ticker], 1825);
    const newWeight = portfolio.length === 0 ? 100 : 0;
    setPortfolio([...portfolio, { ticker, weight: newWeight }]);
    setNewPortfolioTicker("");
  };

  const updateWeight = (index: number, newWeight: number) => {
    const newPort = [...portfolio];
    newPort[index].weight = newWeight;
    setPortfolio(newPort);
  };

  const removePortfolioTicker = (index: number) => {
    const newPort = [...portfolio];
    newPort.splice(index, 1);
    setPortfolio(newPort);
  };

  const addCompareTicker = () => {
    if (newCompareTicker && !compareTickers.includes(newCompareTicker.toUpperCase())) {
      const ticker = newCompareTicker.toUpperCase().trim();
      setCompareTickers([...compareTickers, ticker]);
      fetchDataForTickers([ticker], 1825);
      setNewCompareTicker("");
    }
  };

  const removeCompareTicker = (ticker: string) => {
    setCompareTickers(compareTickers.filter(t => t !== ticker));
  };

  // Chart Data Processing
  const { chartSeries, aggregateRawData } = useMemo(() => {
    if (portfolio.length === 0) return { chartSeries: [], aggregateRawData: [] };

    let startTime = 0;
    let endTime = new Date().getTime();

    if (timeframe === 'CUSTOM') {
      startTime = new Date(customStart).getTime();
      endTime = new Date(customEnd).getTime();
    } else if (timeframe === 'YTD') {
      startTime = new Date(new Date().getFullYear(), 0, 1).getTime();
    } else {
      const d = new Date(); d.setDate(d.getDate() - (timeframe as number));
      startTime = d.getTime();
    }

    const aggregateData = [];
    const rawDailyData = [];
    const baseTicker = portfolio[0].ticker;
    const baseData = stockData[baseTicker] || [];

    for (let i = 0; i < baseData.length; i++) {
      if (baseData[i].x < startTime || baseData[i].x > endTime) continue;

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
        const closeVal = parseFloat(aggClose.toFixed(2));
        aggregateData.push({
          x: baseData[i].x,
          y: chartType === 'candlestick' ? [aggOpen, aggHigh, aggLow, aggClose].map(v => parseFloat(v.toFixed(2))) : closeVal
        });
        rawDailyData.push({ date: baseData[i].x, price: closeVal });
      }
    }

    const series: any[] = [{ name: 'Aggregate Portfolio', type: chartType, data: aggregateData }];
    const portfolioStartValue = aggregateData.length > 0 ? (chartType === 'candlestick' ? aggregateData[0].y[3] : aggregateData[0].y) : 0;

    compareTickers.forEach(ticker => {
      const cData = stockData[ticker] || [];
      const timeFiltered = cData.filter(d => d.x >= startTime && d.x <= endTime);
      if (timeFiltered.length > 0 && portfolioStartValue > 0) {
        const compStartValue = timeFiltered[0].y[3]; 
        const ratio = (portfolioStartValue as number) / compStartValue; 
        const normalizedData = timeFiltered.map(d => ({
          x: d.x, y: parseFloat((d.y[3] * ratio).toFixed(2)) 
        }));
        series.push({ name: `${ticker} (Norm)`, type: 'line', data: normalizedData });
      }
    });

    return { chartSeries: series, aggregateRawData: rawDailyData };
  }, [portfolio, stockData, compareTickers, chartType, timeframe, customStart, customEnd]);

  const portfolioStats = useMemo(() => {
    if(!chartSeries[0] || chartSeries[0].data.length === 0) return null;
    const d = chartSeries[0].data;
    const startPrice = chartType === 'candlestick' ? d[0].y[3] : d[0].y;
    const endPrice = chartType === 'candlestick' ? d[d.length-1].y[3] : d[d.length-1].y;
    const diff = endPrice - startPrice;
    const perc = (diff / startPrice) * 100;
    return { startPrice, endPrice, diff, perc };
  }, [chartSeries, chartType]);

  // INDEPENDENT CORRELATION LOGIC
  const fetchCorrelations = async () => {
    if(portfolio.length === 0) return;
    
    // 1. Generate a custom dataset based specifically on the 'corrTimeframe' dropdown
    const corrStartTime = new Date();
    corrStartTime.setDate(corrStartTime.getDate() - corrTimeframe);
    const corrStartMs = corrStartTime.getTime();

    const corrData = [];
    const baseTicker = portfolio[0].ticker;
    const baseData = stockData[baseTicker] || [];

    for (let i = 0; i < baseData.length; i++) {
      if (baseData[i].x < corrStartMs) continue;

      let aggClose = 0;
      let totalWeight = 0;

      portfolio.forEach(({ ticker, weight }) => {
        const sData = stockData[ticker]?.find(d => d.x === baseData[i].x);
        if (sData) {
          const w = weight / 100;
          aggClose += sData.y[3] * w;
          totalWeight += w;
        }
      });

      if (totalWeight > 0) {
        corrData.push({ date: baseData[i].x, price: parseFloat(aggClose.toFixed(2)) });
      }
    }

    if(corrData.length < 5) {
      alert("Not enough data points in this timeframe to calculate a valid correlation.");
      return;
    }

    setIsCalculatingCorr(true);
    setTopCorrelations([]);
    
    const baseBenchmarks = ['QQQ', 'SPY', 'IWM', 'ARKK', 'ARKW', 'IGV'];
    const portfolioTickers = portfolio.map(p => p.ticker);
    const targetTickers = Array.from(new Set([...portfolioTickers, ...baseBenchmarks]));

    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          portfolioData: corrData,
          targetTickers: targetTickers 
        })
      });
      const data = await res.json();
      if(data.topCorrelations) setTopCorrelations(data.topCorrelations);
    } catch (err) {
      console.error(err);
      alert("Failed to calculate correlation.");
    } finally {
      setIsCalculatingCorr(false);
    }
  };

  useEffect(() => { setTopCorrelations([]); }, [corrTimeframe, portfolio]);

  const chartOptions: any = {
    theme: { mode: 'dark' },
    chart: { type: chartType, animations: { enabled: false }, toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
    xaxis: { type: 'datetime', axisBorder: { show: false }, axisTicks: { show: false }, grid: { show: false }, labels: { style: { colors: '#71717a' } } },
    yaxis: { labels: { formatter: (value: number) => `$${value.toFixed(2)}`, style: { colors: '#71717a' } }, tooltip: { enabled: true } },
    grid: { borderColor: '#27272a', strokeDashArray: 4, xaxis: { lines: { show: true } }, yaxis: { lines: { show: true } } },
    stroke: { width: chartType === 'line' ? 2 : 1, curve: 'smooth' },
    colors: ['#38bdf8', '#34d399', '#fb7185', '#fbbf24', '#a78bfa'],
    tooltip: { theme: 'dark', shared: true, intersect: false },
    noData: { text: '' }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-sky-500/30 p-4 md:p-8 flex flex-col gap-8 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.1),rgba(255,255,255,0))]">
      
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

      {/* Main Flex Layout ensures both columns stretch */}
      <div className="flex flex-col xl:flex-row gap-6 flex-1 items-stretch">
        
        {/* LEFT COLUMN: Uses flex-col and flex-1 to stretch full height */}
        <div className="w-full xl:w-1/3 flex flex-col min-h-[500px]">
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 p-6 rounded-3xl shadow-2xl flex flex-col gap-6 flex-1 h-full">
            <h2 className="text-lg font-medium text-zinc-200 flex items-center gap-2 shrink-0">
              <PieChart className="w-5 h-5 text-sky-400" /> Allocation Setup
            </h2>
            
            <div className="flex flex-col gap-3 shrink-0">
              <label className="group relative flex flex-col items-center justify-center w-full p-4 border border-dashed border-zinc-700/50 rounded-2xl cursor-pointer hover:bg-zinc-800/50 hover:border-sky-500/50 transition-all">
                <Upload className="w-5 h-5 mb-2 text-zinc-400 group-hover:text-sky-400 transition-colors" />
                <span className="text-sm font-medium text-zinc-300">Import CSV Tickers</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>

              <div className="flex items-center gap-2">
                <input 
                  type="text" placeholder="Add manual (e.g. TSLA)" value={newPortfolioTicker}
                  onChange={(e) => setNewPortfolioTicker(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualTicker()}
                  className="flex-1 bg-zinc-950 border border-zinc-800/80 rounded-xl pl-3 py-2 text-xs text-zinc-200 focus:ring-1 focus:ring-sky-500/50 uppercase"
                />
                <button onClick={addManualTicker} disabled={isLoading || !newPortfolioTicker} className="px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/20 transition-all disabled:opacity-50 shrink-0">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* List scrolls dynamically, leaves room for total at the bottom */}
            {portfolio.length > 0 && (
              <>
                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar border-t border-zinc-800/50 pt-4 mt-2 pr-2">
                  <div className="space-y-5">
                    {portfolio.map((item, idx) => (
                      <div key={item.ticker} className="flex flex-col gap-2 group">
                        <div className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <button onClick={() => removePortfolioTicker(idx)} className="text-zinc-600 hover:text-rose-400 transition-colors"><X size={14} /></button>
                            <span className="font-semibold text-zinc-300">{item.ticker}</span>
                          </div>
                          <input 
                            type="number" value={item.weight.toFixed(1)} 
                            onChange={(e) => updateWeight(idx, Number(e.target.value))}
                            className="w-16 p-1 text-right bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-300 focus:ring-1 focus:ring-sky-500 outline-none"
                          />
                        </div>
                        <input 
                          type="range" min="0" max="100" value={item.weight} 
                          onChange={(e) => updateWeight(idx, Number(e.target.value))}
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Restored Total Allocation Math (Sticks to bottom) */}
                <div className="pt-4 border-t border-zinc-800/50 flex justify-between items-center mt-auto shrink-0">
                  <span className="text-sm text-zinc-500">Total Allocation</span>
                  <span className={`text-sm font-mono font-bold ${portfolio.reduce((s, i) => s + i.weight, 0) === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {portfolio.reduce((sum, item) => sum + item.weight, 0).toFixed(1)}%
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="w-full xl:w-2/3 flex flex-col gap-6">
          
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 p-2 pl-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between shadow-lg shrink-0">
            
            <div className="flex gap-1 items-center">
              <div className="flex gap-1 p-1 bg-zinc-950/50 border border-zinc-800/50 rounded-xl mr-2">
                {[ {label: '1M', val: 30}, {label: '3M', val: 90}, {label: '6M', val: 180}, {label: 'YTD', val: 'YTD'}, {label: '1Y', val: 365}, {label: 'Custom', val: 'CUSTOM'} ].map(tf => (
                  <button 
                    key={tf.label} onClick={() => setTimeframe(tf.val as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${timeframe === tf.val ? 'bg-zinc-800 text-sky-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              {timeframe === 'CUSTOM' && (
                <div className="flex items-center gap-2 bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-1 px-3">
                  <Calendar size={14} className="text-zinc-500" />
                  <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} className="bg-transparent text-xs text-zinc-300 focus:outline-none [color-scheme:dark]" />
                  <span className="text-zinc-600">-</span>
                  <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} className="bg-transparent text-xs text-zinc-300 focus:outline-none [color-scheme:dark]" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pr-2">
              <div className="relative">
                <input 
                  type="text" placeholder="Compare (e.g. SPY)" value={newCompareTicker}
                  onChange={(e) => setNewCompareTicker(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCompareTicker()}
                  className="bg-zinc-950 border border-zinc-800/80 rounded-xl pl-3 pr-8 py-1.5 w-36 text-xs text-zinc-200 focus:ring-1 focus:ring-sky-500/50 uppercase"
                />
                <button onClick={addCompareTicker} disabled={isLoading} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-sky-400 transition-colors disabled:opacity-50">
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>

          {compareTickers.length > 0 && (
            <div className="flex gap-2 flex-wrap px-1 shrink-0">
              {compareTickers.map(ticker => (
                <span key={ticker} className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800/50 border border-zinc-700/50 rounded-full text-xs font-medium text-zinc-300">
                  {ticker}
                  <X size={12} className="cursor-pointer text-zinc-500 hover:text-rose-400" onClick={() => removeCompareTicker(ticker)} />
                </span>
              ))}
            </div>
          )}

          {/* Chart Frame */}
          <div className="flex-1 bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-3xl shadow-2xl min-h-[400px] flex flex-col relative overflow-hidden">
            {portfolioStats && (
              <div className="absolute top-6 left-6 z-10">
                <h3 className="text-sm font-medium text-zinc-400 mb-1">Portfolio Performance</h3>
                <div className="flex items-end gap-3">
                  <span className="text-2xl font-bold tracking-tight text-white">${portfolioStats.endPrice.toFixed(2)}</span>
                  <span className={`text-sm font-medium mb-1 px-2 py-0.5 rounded-md ${portfolioStats.perc >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    {portfolioStats.perc >= 0 ? '+' : ''}{portfolioStats.perc.toFixed(2)}%
                  </span>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center flex-col gap-4 bg-zinc-950/40 backdrop-blur-sm">
                <Loader2 className="animate-spin text-sky-400" size={36} />
                <p className="text-zinc-400 font-medium text-sm">Syncing Data...</p>
              </div>
            )}
            
            {portfolio.length === 0 ? (
              <div className="h-full flex items-center justify-center flex-col gap-4 text-zinc-600">
                <Activity size={32} className="text-zinc-500 opacity-50" />
                <p className="text-sm">Add a ticker to initialize terminal.</p>
              </div>
            ) : (
              <div className="h-full w-full p-4 pt-20">
                {typeof window !== 'undefined' && (
                  <Chart options={chartOptions} series={chartSeries} type={chartType === 'candlestick' ? 'candlestick' : 'line'} height="100%" />
                )}
              </div>
            )}
          </div>

          {/* CORRELATION ENGINE PANEL */}
          {portfolio.length > 0 && (
            <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 p-6 rounded-3xl shadow-2xl flex flex-col gap-4 relative overflow-hidden shrink-0">
               <div className="absolute right-0 top-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <h3 className="text-lg font-medium text-zinc-200 flex items-center gap-2">
                      <Network className="w-5 h-5 text-sky-400" /> Correlation Engine
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">Calculates portfolio correlation against its holdings and key ETFs.</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {/* NEW INDEPENDENT DROPDOWN */}
                    <select 
                      value={corrTimeframe} 
                      onChange={(e) => setCorrTimeframe(Number(e.target.value))}
                      className="bg-zinc-950 border border-zinc-800/80 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 focus:outline-none focus:ring-1 focus:ring-sky-500/50 appearance-none cursor-pointer"
                    >
                      <option value={30}>Last 1 Month</option>
                      <option value={90}>Last 3 Months</option>
                      <option value={180}>Last 6 Months</option>
                      <option value={365}>Last 1 Year</option>
                      <option value={1095}>Last 3 Years</option>
                    </select>

                    <button 
                      onClick={fetchCorrelations} 
                      disabled={isCalculatingCorr}
                      className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-zinc-950 font-semibold rounded-xl hover:bg-sky-400 transition-colors disabled:opacity-50 shadow-[0_0_20px_rgba(56,189,248,0.3)] min-w-[140px] justify-center"
                    >
                      {isCalculatingCorr ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                      {isCalculatingCorr ? "Scanning..." : "Scan Market"}
                    </button>
                  </div>
               </div>

               {topCorrelations.length > 0 && (
                 <div className="flex flex-wrap gap-3 mt-2">
                    {topCorrelations.map((c, i) => (
                      <div key={c.ticker} className="bg-zinc-950 border border-zinc-800/80 p-3 rounded-xl flex flex-col gap-1 items-center justify-center relative group min-w-[100px] flex-1">
                        <span className="font-bold text-zinc-200 mt-1">{c.ticker}</span>
                        <span className="text-sky-400 font-mono text-sm">{(c.correlation * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                 </div>
               )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
