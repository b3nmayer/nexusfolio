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
  try {
    const { portfolioData, targetTickers } = await request.json();
    
    if(!portfolioData || portfolioData.length < 5) {
        return NextResponse.json({ error: 'Not enough timeframe data for correlation.' }, { status: 400 });
    }
    if(!targetTickers || !Array.isArray(targetTickers) || targetTickers.length === 0) {
        return NextResponse.json({ error: 'No target tickers provided.' }, { status: 400 });
    }

    // Deduplicate tickers just in case the user manually added SPY to their portfolio
    const uniqueTickers = Array.from(new Set(targetTickers));

    const start = new Date(portfolioData[0].date);
    const end = new Date(portfolioData[portfolioData.length-1].date);
    end.setDate(end.getDate() + 2); // Pad end date

    // Process in batches
    const chunkSize = 20;
    const results: any[] = [];
    
    for (let i = 0; i < uniqueTickers.length; i += chunkSize) {
      const chunk = uniqueTickers.slice(i, i + chunkSize);
      const promises = chunk.map(ticker =>
          yahooFinance.historical(ticker as string, { period1: start, period2: end }).catch(() => null)
      );
      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }

    const correlations = [];

    for (let i = 0; i < uniqueTickers.length; i++) {
        const hist = results[i];
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
            correlations.push({ ticker: uniqueTickers[i], correlation: corr });
        }
    }

    // Sort descending and return ALL calculated correlations
    correlations.sort((a,b) => b.correlation - a.correlation);
    return NextResponse.json({ topCorrelations: correlations });

  } catch (error: any) {
    console.error('[CORRELATION API ERROR]:', error);
    return NextResponse.json({ error: 'Failed to calculate correlation.' }, { status: 500 });
  }
}
