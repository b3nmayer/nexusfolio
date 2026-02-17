// Sequential Data Fetcher (with Anti-Spam Delay)
  const fetchDataForTickers = async (tickers: string[], days: number = 512) => {
    setIsLoading(true);
    const newData: Record<string, any[]> = { ...stockData };
    try {
      for (const ticker of tickers) {
        if (!newData[ticker]) {
          const res = await fetch(`/api/stock?ticker=${ticker}&days=${days}`);
          
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            // If the server didn't give a specific error, it will show the HTTP status code
            throw new Error(`${errorData.error || `HTTP ${res.status} Server Crash`}`);
          }
          
          const json = await res.json();
          newData[ticker] = json.data;

          // PAUSE FOR 300ms BEFORE THE NEXT FETCH TO PREVENT RATE LIMITING
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      setStockData(newData);
    } catch (error: any) {
      console.error(error);
      alert(`Data Sync Error (Ticker rejected): ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
