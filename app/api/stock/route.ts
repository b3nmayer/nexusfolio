// app/api/stock/route.ts
import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const days = parseInt(searchParams.get('days') || '365');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  try {
    // Calculate the start date based on the requested timeframe
    const period1 = new Date();
    period1.setDate(period1.getDate() - days);
    
    // Fetch historical daily data from Yahoo Finance
    const result = await yahooFinance.historical(ticker, {
      period1: period1,
      interval: '1d',
    });

    // Format data specifically for ApexCharts: { x: timestamp, y: [O, H, L, C] }
    const formattedData = result.map((quote) => ({
      x: quote.date.getTime(),
      y: [
        Number(quote.open.toFixed(2)),
        Number(quote.high.toFixed(2)),
        Number(quote.low.toFixed(2)),
        Number(quote.close.toFixed(2)),
      ],
    }));

    return NextResponse.json({ ticker, data: formattedData });
  } catch (error) {
    console.error(`Failed to fetch data for ${ticker}:`, error);
    return NextResponse.json({ error: 'Failed to fetch stock data or invalid ticker.' }, { status: 500 });
  }
}
