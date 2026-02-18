"use client";

import React, { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import dynamic from 'next/dynamic';
import { Upload, Plus, X, Loader2, Activity, PieChart, Calendar, Network, ActivitySquare, RotateCcw, Info } from 'lucide-react';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const BASE_BENCHMARKS = ['QQQ', 'SPY', 'IWM', 'ARKK', 'ARKW', 'IGV'];

// Frontend Math Helper for Pearson Correlation
function getPearson(x: number[], y: number[]) {
  const n = x.length;
  if (n === 0) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for(let i=0; i<n; i++) {
    sumX += x[i]; sumY += y[i];
    sumXY += x[i]*y[i];
    sumX2 += x[i]*x[i]; sumY2 += y[i]*y[i];
  }
  const num = (n * sumXY) - (sumX * sumY);
  const den = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));
  return den === 0 ? 0 : num / den;
}

export default function NexusFolio() {
  const [portfolio, setPortfolio] = useState<{ ticker: string, weight: number }[]>([]);
  const [stockData, setStockData] = useState<Record<string, any[]>>({});
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [newCompareTicker, setNewCompareTicker] = useState("");
  const [newPortfolioTicker, setNewPortfolioTicker] = useState("");
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('line');
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  
  // Single Unified Timeframe State
  const [timeframe, setTimeframe] = useState<number | 'YTD' | 'CUSTOM'>(180);
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split('T')[0]);

  const [showSMA, setShowSMA] = useState({ 20: false, 50: false, 200: false });

  // --- BROWSER AUTO-SAVE ---
  useEffect(() => {
    const savedPortfolio = localStorage.getItem('nexusFolio_portfolio');
    if (savedPortfolio) {
      try {
        const parsed = JSON.parse(savedPortfolio);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPortfolio(parsed);
        }
      } catch (e) { console.error("Failed to parse saved portfolio."); }
    }
    setHasLoadedStorage(true);
  }, []);

  useEffect(() => {
    if (hasLoadedStorage) {
      if (portfolio.length > 0) {
        localStorage.setItem('nexusFolio_portfolio', JSON.stringify(portfolio));
      } else {
        localStorage.removeItem('nexusFolio_portfolio');
      }
    }
  }, [portfolio, hasLoadedStorage]);

  useEffect(() => {
    if (hasLoadedStorage && portfolio.length > 0 && Object.keys(stockData).length === 0) {
      const tickers = Array.from(new Set([...portfolio.map(p => p.ticker), ...BASE_BENCHMARKS, 'SPY']));
      fetchDataForTickers(tickers, 1825);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoadedStorage, portfolio.length]);

  const handleReset = () => {
    setPortfolio([]);
    setStockData({});
    setCompareTickers([]);
    setNewCompareTicker("");
    setNewPortfolioTicker("");
    setTimeframe(180);
    setShowSMA({ 20: false, 50: false, 200: false });
    localStorage.removeItem('nexusFolio_portfolio');
  };

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results: any) => {
        const rows = results.data;
        if (!rows || rows.length === 0) return;

        const tickers = rows[0].map((c: string) => c?.trim().toUpperCase()).filter(Boolean);
        if (tickers.length === 0) return;

        let useEqualWeight = true;
        let weights: number[] = [];

        if (rows.length > 1) {
          const parsedWeights = rows[1].map((c: string) => parseFloat(c?.trim()));
          if (parsedWeights.slice(0, tickers.length).some((w: number) => !isNaN(w))) {
            useEqualWeight = false;
            weights = parsedWeights;
          }
        }

        const equalWeight = 100 / tickers.length;
        const newPortfolio = tickers.map((t: string, idx: number) => {
          const w = useEqualWeight ? equalWeight : (isNaN(weights[idx]) ? 0 : weights[idx]);
          return { ticker: t, weight: w };
        });

        setPortfolio(newPortfolio);
        const fetchList = Array.from(new Set([...tickers, ...compareTickers, ...BASE_BENCHMARKS]));
        fetchDataForTickers(fetchList, 1825);
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
    const fetchList = Array.from(new Set([ticker, ...BASE_BENCHMARKS]));
    fetchDataForTickers(fetchList, 1825);
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

  // --- REBUILT MATH ENGINE (INDEXED NAV) ---
  const { chartSeries, portfolioStats, compareStats, individualPerformance, topCorrelations } = useMemo(() => {
    if (portfolio.length === 0) return { chartSeries: [], portfolioStats: null, compareStats: [], individualPerformance: [], topCorrelations: [] };

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

    const allDates = new Set<number>();
    portfolio.forEach(p => (stockData[p.ticker] || []).forEach(d => allDates.add(d.x)));
    const sortedDates = Array.from(allDates).sort((a, b) => a - b);

    // Build the Portfolio Index (Base 100)
    const fullAggData: any[] = [];
    let previousPrices: Record<string, number> = {};
    let portfolioIndex = 100;

    sortedDates.forEach((date, i) => {
      let dailyRetSum = 0;
      let totalWeightThisDay = 0;
      let currentPrices: Record<string, number> = {};

      portfolio.forEach(({ ticker, weight }) => {
        const sData = stockData[ticker]?.find(d => d.x === date);
        const todayPrice = sData ? sData.y[3] : previousPrices[ticker];
        currentPrices[ticker] = todayPrice;

        if (todayPrice !== undefined && previousPrices[ticker] !== undefined) {
           const ret = (todayPrice - previousPrices[ticker]) / previousPrices[ticker];
           const w = weight / 100;
           dailyRetSum += ret * w;
           totalWeightThisDay += w;
        }
      });

      let portfolioDailyRet = 0;
      if (totalWeightThisDay > 0) {
         portfolioDailyRet = dailyRetSum / totalWeightThisDay; 
      }

      if (i > 0) {
         portfolioIndex = portfolioIndex * (1 + portfolioDailyRet);
      }

      fullAggData.push({ x: date, close: portfolioIndex });
      previousPrices = { ...currentPrices };
    });

    const aggregateData: any[] = [];
    const rawDailyData: any[] = [];
    
    fullAggData.forEach(d => {
      if (d.x >= startTime && d.x <= endTime) {
        aggregateData.push({ x: d.x, y: parseFloat(d.close.toFixed(2)) });
        rawDailyData.push({ date: d.x, price: d.close });
      }
    });

    const series: any[] = [{ name: 'Fund NAV Index', type: 'line', data: aggregateData }];

    // SMAs
    [20, 50, 200].forEach(smaDays => {
      if (showSMA[smaDays as keyof typeof showSMA]) {
         const smaData = [];
         for(let i = 0; i < fullAggData.length; i++) {
           if (i >= smaDays - 1) {
             let sum = 0;
             for(let j = 0; j < smaDays; j++) { sum += fullAggData[i - j].close; }
             const avg = parseFloat((sum / smaDays).toFixed(2));
             if (fullAggData[i].x >= startTime && fullAggData[i].x <= endTime) {
               smaData.push({ x: fullAggData[i].x, y: avg });
             }
           }
         }
         series.push({ name: `${smaDays} Day SMA`, type: 'line', data: smaData });
      }
    });

    // Normalized Comparisons
    const portfolioStartValue = aggregateData.length > 0 ? aggregateData[0].y : 0;
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

    // Portfolio Stats
    let stats = null;
    if (rawDailyData.length > 0) {
      const startPrice = rawDailyData[0].price;
      const endPrice = rawDailyData[rawDailyData.length - 1].price;
      const perc = ((endPrice - startPrice) / startPrice) * 100;
      
      let peak = startPrice;
      let maxDrawdown = 0;

      for (let i = 1; i < rawDailyData.length; i++) {
        const curr = rawDailyData[i].price;
        if (curr > peak) peak = curr;
        const dd = (peak - curr) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }
      stats = { startPrice, endPrice, perc, maxDrawdown: maxDrawdown * 100 };
    }

    // Comparison Stats for Overlay
    const cStats = compareTickers.map(ticker => {
      const cData = stockData[ticker] || [];
      const timeFiltered = cData.filter(d => d.x >= startTime && d.x <= endTime);
      if (timeFiltered.length < 2) return null;
      const sPrice = timeFiltered[0].y[3];
      const ePrice = timeFiltered[timeFiltered.length - 1].y[3];
      const perc = ((ePrice - sPrice) / sPrice) * 100;
      return { ticker, perc };
    }).filter(Boolean);

    // Individual Ticker Perf
    const indPerf = portfolio.map(p => {
      const data = stockData[p.ticker] || [];
      const filtered = data.filter(d => d.x >= startTime && d.x <= endTime);
      if (filtered.length < 2) return null;
      const sPrice = filtered[0].y[3];
      const ePrice = filtered[filtered.length-1].y[3];
      return { ticker: p.ticker, startPrice: sPrice, endPrice: ePrice, change: ((ePrice - sPrice) / sPrice) * 100 };
    }).filter(Boolean).sort((a: any, b: any) => b.change - a.change);

    // INSTANT STATIC CORRELATION
    const topCorrs: any[] = [];
    const targetTickers = Array.from(new Set([...portfolio.map(p => p.ticker), ...BASE_BENCHMARKS]));

    targetTickers.forEach(ticker => {
        const tData = stockData[ticker];
        if (!tData) return;
        const tMap = new Map(tData.map(d => [d.x, d.y[3]]));
        const pRets: number[] = [];
        const tRets: number[] = [];

        for(let i = 1; i < rawDailyData.length; i++) {
            const date = rawDailyData[i].date;
            const prevDate = rawDailyData[i-1].date;
            
            const pClose = rawDailyData[i].price;
            const pPrev = rawDailyData[i-1].price;
            
            const tClose = tMap.get(date) ?? tMap.get(prevDate);
            const tPrev = tMap.get(prevDate);

            if (tClose !== undefined && tPrev !== undefined) {
                pRets.push((pClose - pPrev) / pPrev);
                tRets.push((tClose - tPrev) / tPrev);
            }
        }
        if (pRets.length > 5) {
            const corr = getPearson(pRets, tRets);
            if (!isNaN(corr)) topCorrs.push({ ticker, correlation: corr });
        }
    });
    topCorrs.sort((a, b) => b.correlation - a.correlation);

    return { chartSeries: series, portfolioStats: stats, compareStats: cStats, individualPerformance: indPerf as any[], topCorrelations: topCorrs };
  }, [portfolio, stockData, compareTickers, chartType, timeframe, customStart, customEnd, showSMA]);

  const externalBenchmarks = useMemo(() => {
    return BASE_BENCHMARKS.filter(b => !portfolio.some(p => p.ticker === b));
  }, [portfolio]);

  // --- CHART OPTIONS ---
  const chartOptions: any = {
    theme: { mode: 'dark' },
    chart: { type: chartType, animations: { enabled: false }, toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
    xaxis: { type: 'datetime', axisBorder: { show: false }, axisTicks: { show: false }, grid: { show: false }, labels: { style: { colors: '#71717a' } } },
    yaxis: { labels: { formatter: (value: number) => `$${value.toFixed(2)}`, style: { colors: '#71717a' } }, tooltip: { enabled: true } },
    grid: { borderColor: '#27272a', strokeDashArray: 4, xaxis: { lines: { show: true } }, yaxis: { lines: { show: true } } },
    stroke: { width: chartType === 'line' ? 2 : 1, curve: 'smooth' },
    colors: ['#22d3ee', '#818cf8', '#fb7185', '#fbbf24', '#a78bfa', '#f97316', '#8b5cf6', '#a1a1aa'], 
    tooltip: { 
      theme: 'dark', 
      shared: true, 
      intersect: false,
      y: {
        formatter: function (value: number, opts: any) {
          if (typeof value !== 'number') return value; 
          let startVal = opts?.w?.globals?.initialSeries?.[opts.seriesIndex]?.data?.[0]?.y;
          if (Array.isArray(startVal)) startVal = startVal[3]; 
          if (startVal && typeof startVal === 'number' && startVal !== 0) {
            const perc = ((value - startVal) / startVal) * 100;
            return `$${value.toFixed(2)} (${perc >= 0 ? '+' : ''}${perc.toFixed(2)}%)`;
          }
          return `$${value.toFixed(2)}`;
        }
      }
    },
    noData: { text: '' }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-cyan-500/30 p-4 md:p-8 flex flex-col gap-8 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(34,211,238,0.1),rgba(255,255,255,0))]">
      
      {/* HEADER */}
      <header className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tighter text-white">
            Nexus<span className="text-zinc-500 font-medium">Folio</span>
          </h1>
        </div>
        
        {portfolio.length > 0 && (
          <button 
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition-colors"
          >
            <RotateCcw size={14} /> Reset UI
          </button>
        )}
      </header>

      <div className="flex flex-col xl:flex-row gap-6 flex-1 items-stretch">
        
        {/* LEFT COLUMN: Setup */}
        <div className="w-full xl:w-1/4 flex flex-col min-h-[500px]">
          <div className="bg-zinc-900/40 border border-zinc-800/50 p-6 rounded-3xl flex flex-col gap-6 flex-1 h-full shadow-lg">
            <h2 className="text-lg font-medium text-zinc-200 flex items-center gap-2 shrink-0">
              <PieChart className="w-5 h-5 text-cyan-400" /> Portfolio Allocation
            </h2>
            
            <div className="flex flex-col gap-3 shrink-0">
              <label className="group relative flex flex-col items-center justify-center w-full p-4 border border-dashed border-zinc-700/50 rounded-2xl cursor-pointer hover:bg-zinc-800/50 hover:border-cyan-500/50 transition-all">
                <Upload className="w-5 h-5 mb-2 text-zinc-400 group-hover:text-cyan-400 transition-colors" />
                <span className="text-sm font-medium text-zinc-300">Import CSV Tickers</span>
                <p className="text-[10px] text-zinc-500 mt-1.5 text-center leading-tight">
                  Row 1: Tickers (AAPL, TSLA)<br/>
                  Row 2 (Optional): Weights (60, 40)
                </p>
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>

              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="text" placeholder="Add manual (e.g. TSLA)" value={newPortfolioTicker}
                  onChange={(e) => setNewPortfolioTicker(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualTicker()}
                  className="flex-1 bg-zinc-950/50 border border-zinc-800/80 rounded-xl pl-3 py-2 text-xs text-zinc-200 focus:ring-1 focus:ring-cyan-500/50 uppercase"
                />
                <button onClick={addManualTicker} disabled={isLoading || !newPortfolioTicker} className="px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/20 transition-all disabled:opacity-50 shrink-0">
                  <Plus size={16} />
                </button>
              </div>
            </div>

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
                            className="w-16 p-1 text-right bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-300 focus:ring-1 focus:ring-cyan-500 outline-none"
                          />
                        </div>
                        <input 
                          type="range" min="0" max="100" value={item.weight} 
                          onChange={(e) => updateWeight(idx, Number(e.target.value))}
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                      </div>
                    ))}
                  </div>
                </div>

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

        {/* RIGHT COLUMN: Terminal Container */}
        <div className="w-full xl:w-3/4 flex flex-col gap-6">
          
          <div className="bg-zinc-900/40 border border-zinc-800/50 p-2 pl-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between shadow-lg shrink-0">
            <div className="flex gap-2 items-center flex-wrap">
              <div className="flex gap-1 p-1 bg-zinc-950/50 border border-zinc-800/50 rounded-xl">
                {[ {label: '1M', val: 30}, {label: '3M', val: 90}, {label: '6M', val: 180}, {label: 'YTD', val: 'YTD'}, {label: '1Y', val: 365}, {label: 'Custom', val: 'CUSTOM'} ].map(tf => (
                  <button 
                    key={tf.label} onClick={() => setTimeframe(tf.val as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${timeframe === tf.val ? 'bg-zinc-800 text-cyan-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-1 p-1 bg-zinc-950/50 border border-zinc-800/50 rounded-xl hidden md:flex">
                 {[20, 50, 200].map(days => (
                   <button
                      key={days}
                      onClick={() => setShowSMA(prev => ({...prev, [days]: !prev[days as keyof typeof prev]}))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 flex items-center gap-1 ${showSMA[days as keyof typeof showSMA] ? 'bg-zinc-800 text-cyan-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                   >
                      <ActivitySquare size={12} /> SMA {days}
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
                  className="bg-zinc-950 border border-zinc-800/80 rounded-xl pl-3 pr-8 py-1.5 w-36 text-xs text-zinc-200 focus:ring-1 focus:ring-cyan-500/50 uppercase"
                />
                <button onClick={addCompareTicker} disabled={isLoading} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-cyan-400 transition-colors disabled:opacity-50">
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

          {/* MAIN DASHBOARD LAYOUT */}
          <div className="flex flex-col lg:flex-row gap-6">
            
            {/* Chart Area */}
            <div className="flex-1 bg-zinc-900/40 border border-zinc-800/50 rounded-3xl shadow-xl min-h-[400px] flex flex-col relative overflow-hidden">
              
              {/* UPGRADED PERFORMANCE OVERLAY BADGES */}
              {portfolioStats && (
                <div className="absolute top-6 left-6 z-10">
                  <h3 className="text-sm font-medium text-zinc-400 mb-2">Performance Analysis (NAV Index)</h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-zinc-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800">
                      <span className="text-zinc-400 text-xs font-semibold">FUND</span>
                      <span className={`text-sm font-bold ${portfolioStats.perc >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {portfolioStats.perc >= 0 ? '+' : ''}{portfolioStats.perc.toFixed(2)}%
                      </span>
                    </div>
                    {compareStats?.map(c => (
                      <div key={c.ticker} className="flex items-center gap-2 bg-zinc-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800">
                        <span className="text-zinc-400 text-xs font-semibold">{c.ticker}</span>
                        <span className={`text-sm font-bold ${c.perc >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {c.perc >= 0 ? '+' : ''}{c.perc.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center flex-col gap-4 bg-zinc-950/40 backdrop-blur-sm">
                  <Loader2 className="animate-spin text-cyan-400" size={36} />
                  <p className="text-zinc-400 font-medium text-sm">Syncing Data...</p>
                </div>
              )}
              
              {portfolio.length === 0 ? (
                <div className="h-full flex items-center justify-center flex-col gap-4 text-zinc-600">
                  <Activity size={32} className="text-zinc-500 opacity-50" />
                  <p className="text-sm">Add a ticker to initialize NexusFolio.</p>
                </div>
              ) : (
                <div className="h-full w-full p-4 pt-28">
                  {typeof window !== 'undefined' && (
                    <Chart options={chartOptions} series={chartSeries} type={chartType === 'candlestick' ? 'candlestick' : 'line'} height="100%" />
                  )}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN STATS & TOP/BOTTOM PANELS */}
            {portfolioStats && (
              <div className="w-full lg:w-[340px] flex flex-col gap-6 shrink-0">
                <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl p-6 shadow-xl flex flex-col gap-5">
                  <h3 className="text-sm font-semibold text-zinc-300 border-b border-zinc-800 pb-2">Portfolio Stats</h3>
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-zinc-500">Return (Timeframe)</span>
                      <span className={`text-sm font-medium ${portfolioStats.perc >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {portfolioStats.perc >= 0 ? '+' : ''}{portfolioStats.perc.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-zinc-500">Max Drawdown</span>
                      <span className="text-sm font-medium text-rose-400">-{portfolioStats.maxDrawdown.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>

                {individualPerformance.length > 0 && (
                  <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl p-5 shadow-xl flex flex-col gap-4">
                    <h3 className="text-sm font-semibold text-zinc-300 border-b border-zinc-800 pb-2">Top Performers</h3>
                    <div className="flex flex-col gap-3">
                      {individualPerformance.slice(0, 5).map(t => (
                        <div key={t.ticker} className="flex items-center justify-between text-sm">
                          <span className="font-bold text-zinc-200">{t.ticker}</span>
                          <span className="text-zinc-500 text-xs hidden sm:block">${t.endPrice.toFixed(2)}</span>
                          <span className={`font-medium text-right ${t.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.change >= 0 ? '+' : ''}{t.change.toFixed(2)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {individualPerformance.length > 0 && (
                  <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl p-5 shadow-xl flex flex-col gap-4">
                    <h3 className="text-sm font-semibold text-zinc-300 border-b border-zinc-800 pb-2">Underperformers</h3>
                    <div className="flex flex-col gap-3">
                      {[...individualPerformance].reverse().slice(0, 5).map(t => (
                        <div key={t.ticker} className="flex items-center justify-between text-sm">
                          <span className="font-bold text-zinc-200">{t.ticker}</span>
                          <span className="text-zinc-500 text-xs hidden sm:block">${t.endPrice.toFixed(2)}</span>
                          <span className={`font-medium text-right ${t.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.change >= 0 ? '+' : ''}{t.change.toFixed(2)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STATIC CORRELATION ENGINE PANEL */}
          {portfolio.length > 0 && (
            <div className="bg-zinc-900/40 border border-zinc-800/50 p-6 rounded-3xl shadow-xl flex flex-col gap-4 relative overflow-hidden shrink-0 mt-2">
               <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <h3 className="text-lg font-medium text-zinc-200 flex items-center gap-2">
                      <Network className="w-5 h-5 text-cyan-400" /> Static Correlation Engine
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">Automatically calculates portfolio correlation over your selected visual timeframe.</p>
                  </div>
               </div>

               {topCorrelations.length > 0 && (
                 <>
                   <div className="flex flex-wrap gap-3 mt-2">
                      {topCorrelations.map((c, i) => (
                        <div key={c.ticker} className="bg-zinc-950 border border-zinc-800/80 p-3 rounded-xl flex flex-col gap-1 items-center justify-center relative group min-w-[100px] flex-1 hover:border-cyan-500/30 transition-colors">
                          <span className="font-bold text-zinc-200 mt-1">{c.ticker}</span>
                          <span className="text-cyan-400 font-mono text-sm">{(c.correlation * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                   </div>
                   
                   {externalBenchmarks.length > 0 && (
                     <div className="mt-2 text-xs text-zinc-500/80 flex items-center gap-1.5 border-t border-zinc-800/50 pt-3">
                       <Info size={14} className="text-zinc-400 shrink-0" />
                       <span>Also evaluating benchmark ETFs: <span className="text-zinc-400">{externalBenchmarks.join(', ')}</span></span>
                     </div>
                   )}
                 </>
               )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
