import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// Initialize the v3 client
const yahooFinance = new YahooFinance();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const days = parseInt(searchParams.get('days') || '365');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  try {
    console.log(`[API] Attempting to fetch data for: ${ticker}`);
    
    // Create raw JavaScript Date objects to bypass the library's string validation bug
    const period2Date = new Date(); // Today
    const period1Date = new Date();
    period1Date.setDate(period1Date.getDate() - days); // X days ago

    // Pass the raw Date objects directly
    const result = (await yahooFinance.historical(ticker, {
      period1: period1Date,
      period2: period2Date
    })) as any[];

    if (!result || result.length === 0) {
      throw new Error("Yahoo Finance returned an empty dataset.");
    }

    const formattedData = result.map((quote: any) => ({
      x: new Date(quote.date).getTime(),
      y: [
        Number(quote.open.toFixed(2)),
        Number(quote.high.toFixed(2)),
        Number(quote.low.toFixed(2)),
        Number(quote.close.toFixed(2)),
      ],
    }));

    console.log(`[API] Successfully fetched ${formattedData.length} days of data for ${ticker}`);
    return NextResponse.json({ ticker, data: formattedData });
    
  } catch (error: any) {
    console.error(`[API ERROR] Failed for ${ticker}:`, error.message || error);
    return NextResponse.json({ error: error.message || 'Failed to fetch stock data.' }, { status: 500 });
  }
}
