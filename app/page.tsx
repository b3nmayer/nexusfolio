// app/page.tsx
"use client";

import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import dynamic from 'next/dynamic';
import { Upload, Plus, BarChart2, TrendingUp, X, Loader2 } from 'lucide-react';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

export default function PortfolioAnalyzer() {
  const [portfolio, setPortfolio] = useState<{ ticker: string, weight: number }[]>([]);
  const [stockData, setStockData] = useState<Record<string, any[]>>({});
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [newCompareTicker, setNewCompareTicker] = useState("");
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('line');
  const [timeframe, setTimeframe] = useState<number>(30); // days
  const [isLoading, setIsLoading] = useState(false);

  // --- CSV IMPORT ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        // Extract valid tickers
        const tickers = results.data
          .map((row: any) => row[0]?.trim().toUpperCase())
          .filter((t: string) => t && t !== 'TICKER'); 
        
        const equalWeight = 100 / tickers.length;
        const newPortfolio = tickers.map((t: string) => ({ ticker: t, weight: equalWeight }));
        
        setPortfolio(newPortfolio);
        fetchDataForTickers([...tickers, ...compareTickers], 365); // Fetch max needed days
      }
    });
  };

  // --- REAL DATA FETCHING VIA NEXT.JS API ---
  const fetchDataForTickers = async (tickers: string[], days: number = 365) => {
    setIsLoading(true);
    const newData: Record<string, any[]> = { ...stockData };
    
    try {
      // Fetch concurrently to speed up load times
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

    // Loop through historical dates
    for (let i = 0; i < baseData.length; i++) {
      if (baseData[i].x < cutoffTime) continue;

      let aggOpen = 0, aggHigh = 0, aggLow = 0, aggClose = 0;
      let totalWeight = 0;

      portfolio.forEach(({ ticker, weight }) => {
        // Find matching date for the current stock
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

    // Add Comparison Tickers
    compareTickers.forEach(ticker => {
      const cData = stockData[ticker] || [];
      const filteredData = cData.filter(d => d.x >= cutoffTime).map(d => ({
        x: d.x,
        y: parseFloat(d.y[3].toFixed(2)) // Use close price for comparison lines
      }));
      
      series.push({
        name: ticker,
        type: 'line',
        data: filteredData
      });
    });

    return series;
  }, [portfolio, stockData, compareTickers, chartType, timeframe]);

  // Chart Configuration
  const chartOptions: any = {
    chart: { type: chartType, animations: { enabled: false }, toolbar: { show: true } },
    xaxis: { type: 'datetime' },
    yaxis: { 
      labels: { formatter: (value: number) => `$${value.toFixed(2)}` },
      tooltip: { enabled: true }
    },
    stroke: { width: chartType === 'line' ? 2 : 1 },
    colors: ['#3b82f6', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6'],
    tooltip: { shared: true, intersect: false },
    noData: { text: isLoading ? 'Loading market data...' : 'No data available' }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col md:flex-row gap-6">
      
      {/* LEFT COLUMN: Portfolio & Allocation */}
      <div className="w-full md:w-1/3 bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><BarChart2 /> Portfolio Setup</h2>
          
          <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition">
            <Upload className="w-5 h-5 mr-2 text-gray-500" />
            <span className="text-gray-600 font-medium">Upload CSV (Tickers)</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
          <p className="text-xs text-gray-400 mt-2">CSV format: Single column with stock tickers (e.g., AAPL, TSLA).</p>
        </div>

        {portfolio.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <h3 className="font-semibold text-gray-700 mb-3 border-b pb-2">Allocations (%)</h3>
            <div className="space-y-4">
              {portfolio.map((item, idx) => (
                <div key={item.ticker} className="flex items-center gap-4">
                  <span className="font-bold w-16 text-gray-700">{item.ticker}</span>
                  <input 
                    type="range" 
                    min="0" max="100" 
                    value={item.weight} 
                    onChange={(e) => updateWeight(idx, Number(e.target.value))}
                    className="flex-1"
                  />
                  <input 
                    type="number" 
                    value={item.weight.toFixed(1)} 
                    onChange={(e) => updateWeight(idx, Number(e.target.value))}
                    className="w-16 p-1 text-right border rounded"
                  />
                </div>
              ))}
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 text-blue-800 rounded-lg text-sm flex justify-between">
              <span>Total Weight:</span>
              <span className="font-bold">
                {portfolio.reduce((sum, item) => sum + item.weight, 0).toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Charts & Comparisons */}
      <div className="w-full md:w-2/3 flex flex-col gap-6">
        
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-center justify-between">
          
          <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
            {[ {label: '1M', days: 30}, {label: '3M', days: 90}, {label: '6M', days: 180}, {label: '1Y', days: 365} ].map(tf => (
              <button 
                key={tf.label}
                onClick={() => setTimeframe(tf.days)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition ${timeframe === tf.days ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setChartType('line')} className={`px-3 py-1 rounded-md text-sm font-medium transition flex items-center gap-1 ${chartType === 'line' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>
              <TrendingUp size={16}/> Line
            </button>
            <button onClick={() => setChartType('candlestick')} className={`px-3 py-1 rounded-md text-sm font-medium transition flex items-center gap-1 ${chartType === 'candlestick' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>
              <BarChart2 size={16}/> Candle
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input 
              type="text" 
              placeholder="Compare (e.g. SPY)" 
              value={newCompareTicker}
              onChange={(e) => setNewCompareTicker(e.target.value)}
              className="border p-1.5 rounded-md w-40 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              onKeyDown={(e) => e.key === 'Enter' && addCompareTicker()}
            />
            <button onClick={addCompareTicker} disabled={isLoading} className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50">
              <Plus size={18} />
            </button>
          </div>
        </div>

        {compareTickers.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {compareTickers.map(ticker => (
              <span key={ticker} className="flex items-center gap-1 px-3 py-1 bg-gray-200 rounded-full text-sm font-medium text-gray-700">
                {ticker}
                <X size={14} className="cursor-pointer hover:text-red-500" onClick={() => removeCompareTicker(ticker)} />
              </span>
            ))}
          </div>
        )}

        <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border border-gray-200 min-h-[400px] relative">
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center flex-col gap-3 backdrop-blur-sm rounded-xl">
              <Loader2 className="animate-spin text-blue-600" size={32} />
              <p className="text-gray-600 font-medium">Fetching market data...</p>
            </div>
          )}
          
          {portfolio.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 flex-col gap-2">
              <BarChart2 size={48} className="opacity-50" />
              <p>Upload a CSV with real tickers (e.g., AAPL, MSFT) to begin.</p>
            </div>
          ) : (
            <div className="h-full w-full">
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
  );
}
