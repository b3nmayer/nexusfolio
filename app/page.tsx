"use client";

import React, { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import dynamic from 'next/dynamic';
import { Upload, Plus, X, Loader2, Activity, PieChart, Calendar, Network, Search, ActivitySquare, RotateCcw, Info } from 'lucide-react';

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
                {[ {label: '1M', val: 30}, {label: '3M', val: 90}, {label: '6M', val: 180}, {label: 'YTD', val: '
