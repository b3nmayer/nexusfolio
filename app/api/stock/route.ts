import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

function pearsonCorrelation(x: number[], y: number[]) {
  const n = x.length;
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

export async function POST(request: Request) {
  console.log("[CORRELATION] Engine started!");
  
  try {
    const { portfolioData, targetTickers } = await request.json();
    
    if(!portfolioData || portfolioData.length < 5) {
        return NextResponse.json({ error: 'Not enough timeframe data.' }, { status: 400 });
    }

    const uniqueTickers = Array.from(new Set(targetTickers));
    console.log(`[CORRELATION] Scanning ${uniqueTickers.length} tickers...`);

    const start = new Date(portfolioData[0].date);
    const end = new Date(portfolioData[portfolioData.length-1].date);
    end.setDate(end.getDate() + 2);

    const results: any[] = [];

    // SEQUENTIAL FETCH WITH 300ms DELAY TO PREVENT RATE LIMITING
    for (const ticker of uniqueTickers) {
      try {
         console.log(`[CORRELATION] Fetching history for ${ticker}...`);
         const hist = await yahooFinance.historical(ticker as string, { period1: start, period2: end });
         results.push({ ticker, hist });
      } catch (err: any) {
         console.warn(`[CORRELATION] Failed to fetch ${ticker}: ${err.message}`);
         results.push({ ticker, hist: null }); // Store null so we know it failed, but keep loop going
      }
      
      // Pause for 300ms to bypass Yahoo anti-spam filters
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const correlations = [];

    for (const result of results) {
        const hist = result.hist;
        if(!hist || hist.length < 5) continue;

        const dateToPrice: Record<string, number> = {};
        hist.forEach((q: any) => {
            const d = new Date(q.date).toISOString().split('T')[0];
            dateToPrice[d] = q.close;
        });

        const candPrices: number[] = [];
        const portAligned: number[] = [];

        // Align the dates perfectly (skipping weekends/holidays naturally)
        portfolioData.forEach((pd: any) => {
            const d = new Date(pd.date).toISOString().split('T')[0];
            if(dateToPrice[d]) {
                candPrices.push(dateToPrice[d]);
                portAligned.push(pd.price);
            }
        });

        if(candPrices.length < 5) continue;

        const candReturns = [];
        const pReturns = [];
        for(let j=1; j<candPrices.length; j++) {
            candReturns.push((candPrices[j]-candPrices[j-1])/candPrices[j-1]);
            pReturns.push((portAligned[j]-portAligned[j-1])/portAligned[j-1]);
        }

        const corr = pearsonCorrelation(pReturns, candReturns);
        if(!isNaN(corr)) {
            correlations.push({ ticker: result.ticker as string, correlation: corr });
        }
    }

    correlations.sort((a,b) => b.correlation - a.correlation);
    console.log(`[CORRELATION] Successfully calculated ${correlations.length} matches.`);
    
    return NextResponse.json({ topCorrelations: correlations });

  } catch (error: any) {
    console.error('[CORRELATION API ERROR]:', error.message || error);
    return NextResponse.json({ error: 'Failed to calculate correlation.' }, { status: 500 });
  }
}
