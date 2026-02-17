import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

// --- MATH HELPER ---
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

// --- GET: FETCH STOCK CHARTS ---
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const days = parseInt(searchParams.get('days') || '1825');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  try {
    const period2Date = new Date(); 
    const period1Date = new Date();
    period1Date.setDate(period1Date.getDate() - days);

    const result = (await yahooFinance.historical(ticker, {
      period1: period1Date,
      period2: period2Date
    })) as any[];

    if (!result || result.length === 0) throw new Error("Empty dataset.");

    const formattedData = result.map((quote: any) => ({
      x: new Date(quote.date).getTime(),
      y: [
        Number(quote.open.toFixed(2)),
        Number(quote.high.toFixed(2)),
        Number(quote.low.toFixed(2)),
        Number(quote.close.toFixed(2)),
      ],
    }));

    return NextResponse.json({ ticker, data: formattedData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch stock data.' }, { status: 500 });
  }
}

// --- POST: CORRELATION ENGINE ---
export async function POST(request: Request) {
  try {
    const { portfolioData, targetTickers } = await request.json();
    
    if(!portfolioData || portfolioData.length < 5) {
        return NextResponse.json({ error: 'Not enough timeframe data.' }, { status: 400 });
    }

    const uniqueTickers = Array.from(new Set(targetTickers));
    const start = new Date(portfolioData[0].date);
    const end = new Date(portfolioData[portfolioData.length-1].date);
    end.setDate(end.getDate() + 2);

    const results: any[] = [];

    // Sequential fetch with 300ms anti-spam delay
    for (const ticker of uniqueTickers) {
      try {
         const hist = await yahooFinance.historical(ticker as string, { period1: start, period2: end });
         results.push({ ticker, hist });
      } catch (err) {
         results.push({ ticker, hist: null }); 
      }
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
    return NextResponse.json({ topCorrelations: correlations });

  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to calculate correlation.' }, { status: 500 });
  }
}
