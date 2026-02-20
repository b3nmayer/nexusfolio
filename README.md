# NexusFolio 📈

**Portfolio Analyzer & Correlation Terminal**

NexusFolio is a professional, Bloomberg-lite quantitative tracking dashboard built with Next.js. It goes beyond simple price tracking by calculating a true Base-100 Net Asset Value (NAV) Index for your custom portfolio, complete with dynamic timeframe syncing, technical indicators, and real-time Pearson correlation analysis.

![NexusFolio Dashboard](https://via.placeholder.com/1000x500.png?text=NexusFolio+Dashboard) ## ✨ Key Features

### 🧠 Advanced Math Engine
* **True NAV Indexing**: Calculates portfolio performance using Indexed NAV (starting at Base 100) with weighted daily returns.
* **Forward-Filling**: Automatically handles missing market days or halted tickers by carrying over the last known closing price, preventing chart "cliffs".
* **Max Drawdown**: Automatically calculates the maximum peak-to-trough drop over your selected timeframe.

### 📊 Professional Charting & Analysis
* **Interactive Timeframes**: Instantly slice data by 1M, 3M, 6M, YTD, 1Y, or custom date ranges.
* **Technical Overlays**: Toggle 20-day, 50-day, and 200-day Simple Moving Averages (SMAs) directly on the chart.
* **Normalized Comparisons**: Overlay broad market benchmarks (e.g., SPY, QQQ) normalized to your portfolio's start value for direct 1:1 visual comparison.
* **Performance Tracking**: Instantly view the top 5 and bottom 5 performing assets in your allocation.

### 🕸️ Static Correlation Engine
* **Timeframe-Synced**: The correlation engine automatically binds to your main chart's timeframe. If you look at a 6-month chart, the correlation adjusts to match.
* **Pearson Correlation**: Calculates internal correlation among your holdings and external benchmarks (SPY, QQQ, IWM, ARKK, ARKW, IGV) to help identify portfolio overlap and diversification quality.

### ⚡ Seamless User Experience
* **CSV Import**: Quickly upload a portfolio matrix. 
    * *Row 1:* Tickers (e.g., AAPL, TSLA, NVDA)
    * *Row 2 (Optional):* Target Weights (e.g., 40, 30, 30). Defaults to equal weight if left blank.
* **Browser Auto-Save**: Your portfolio and weightings are silently saved to local storage. Close the tab, and your terminal instantly restores on your next visit.
* **Dark Mode UI**: Sleek, distraction-free interface featuring Electric Cyan branding and Lucide iconography.

---

## 🛠️ Tech Stack

* **Framework**: [Next.js](https://nextjs.org/) (App Router)
* **Language**: TypeScript
* **Styling**: [Tailwind CSS](https://tailwindcss.com/)
* **Charting Engine**: [ApexCharts](https://apexcharts.com/) (`react-apexcharts`)
* **Market Data**: `yahoo-finance2` (Server-side API routes)
* **Data Parsing**: `papaparse` (Client-side CSV processing)
* **Icons**: `lucide-react`

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (v18 or higher) installed.

### Installation

1. Clone the repository:
   ```bash
   git clone [https://github.com/b3nmayer/folioanalyzer.git](https://github.com/b3nmayer/folioanalyzer.git)
   cd folioanalyzer
