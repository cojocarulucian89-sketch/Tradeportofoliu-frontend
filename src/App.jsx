import React, { useState, useEffect, useRef } from 'react';

// API Configuration
const API_KEYS = {
  finnhub: 'd3r39m1r01qopgh6pgbgd3r39m1r01qopgh6pgc0',
  eodhd: '68f772ba2a7c87.32575988',
  fmp: 'XI00gXR2R27tsNEbChNxAPODUrhXaCPi'
};

// Mini Chart Component
const MiniChart = ({ data }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!data || data.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const prices = data.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    ctx.beginPath();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;

    data.forEach((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((point.price - minPrice) / priceRange) * height;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.fill();
  }, [data]);

  return <canvas ref={canvasRef} width={300} height={80} className="mini-chart" />;
};

function App() {
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showAIChat, setShowAIChat] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [priceCache, setPriceCache] = useState({});
  const [selectedStock, setSelectedStock] = useState(null);
  const fileInputRef = useRef(null);

  // 💾 Load portfolio from localStorage on mount
  useEffect(() => {
    const savedPortfolio = localStorage.getItem('portfolio_data');
    const timestamp = localStorage.getItem('portfolio_timestamp');
    
    if (savedPortfolio) {
      try {
        const data = JSON.parse(savedPortfolio);
        const age = Date.now() - parseInt(timestamp || '0');
        
        // Restore if less than 24 hours old
        if (age < 24 * 60 * 60 * 1000) {
          setPortfolio(data);
          // Refresh prices in background
          updatePortfolioWithPrices(data.map(s => ({
            symbol: s.symbol,
            shares: s.shares,
            buyPrice: s.buyPrice,
            totalCost: s.totalCost
          })));
        }
      } catch (error) {
        console.error('Error restoring portfolio:', error);
      }
    }
  }, []);

  // 💾 Save portfolio to localStorage whenever it changes
  useEffect(() => {
    if (portfolio.length > 0) {
      localStorage.setItem('portfolio_data', JSON.stringify(portfolio));
      localStorage.setItem('portfolio_timestamp', Date.now().toString());
    }
  }, [portfolio]);

  // Fetch stock price from Finnhub API
  const fetchStockPrice = async (symbol) => {
    if (priceCache[symbol] && Date.now() - priceCache[symbol].timestamp < 30000) {
      return priceCache[symbol].price;
    }

    try {
      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEYS.finnhub}`
      );
      const data = await response.json();
      
      if (data.c && data.c > 0) {
        const price = data.c;
        setPriceCache(prev => ({
          ...prev,
          [symbol]: { price, timestamp: Date.now() }
        }));
        return price;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      return null;
    }
  };

  // Fetch historical chart data
  const fetchChartData = async (symbol) => {
    try {
      const to = Math.floor(Date.now() / 1000);
      const from = to - (7 * 24 * 60 * 60);

      const response = await fetch(
        `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${API_KEYS.finnhub}`
      );
      const data = await response.json();

      if (data.c && data.c.length > 0) {
        return data.c.map((price, idx) => ({
          price: price,
          timestamp: data.t[idx]
        }));
      }
      return [];
    } catch (error) {
      console.error(`Error fetching chart data for ${symbol}:`, error);
      return [];
    }
  };

  // 🚀 Update portfolio with live prices - SEQUENTIAL (fixes black screen)
  const updatePortfolioWithPrices = async (portfolioData) => {
    setLoading(true);
    const updatedPortfolio = [];
    
    for (let i = 0; i < portfolioData.length; i++) {
      const stock = portfolioData[i];
      
      // Rate limiting: 300ms delay between requests
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      const currentPrice = await fetchStockPrice(stock.symbol);
      const chartData = await fetchChartData(stock.symbol);
      
      if (!currentPrice) {
        updatedPortfolio.push({
          ...stock,
          currentPrice: stock.buyPrice,
          currentValue: stock.shares * stock.buyPrice,
          profitLoss: 0,
          profitLossPct: 0,
          chartData: []
        });
        continue;
      }

      const currentValue = stock.shares * currentPrice;
      const totalCost = stock.shares * stock.buyPrice;
      const profitLoss = currentValue - totalCost;
      const profitLossPct = (profitLoss / totalCost) * 100;

      updatedPortfolio.push({
        ...stock,
        currentPrice,
        currentValue,
        totalCost,
        profitLoss,
        profitLossPct,
        chartData
      });
    }

    setPortfolio(updatedPortfolio);
    setLoading(false);
  };
  // Handle CSV file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadStatus('Uploading...');
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        const portfolioData = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          if (values.length >= 4) {
            const symbol = values[0].trim();
            const shares = parseFloat(values[1].trim());
            const buyPrice = parseFloat(values[2].trim());
            const totalCost = parseFloat(values[3].trim());

            if (symbol && !isNaN(shares) && !isNaN(buyPrice)) {
              portfolioData.push({
                symbol,
                shares,
                buyPrice,
                totalCost: totalCost || shares * buyPrice
              });
            }
          }
        }

        if (portfolioData.length > 0) {
          setUploadStatus(`Processing ${portfolioData.length} stocks...`);
          updatePortfolioWithPrices(portfolioData);
          setTimeout(() => setUploadStatus(''), 3000);
        } else {
          setUploadStatus('No valid data found');
          setTimeout(() => setUploadStatus(''), 3000);
        }
      } catch (error) {
        setUploadStatus('Error processing file');
        console.error('Error parsing CSV:', error);
        setTimeout(() => setUploadStatus(''), 3000);
      }
    };

    reader.readAsText(file);
  };

  // Calculate portfolio metrics
  const calculateMetrics = () => {
    const totalValue = portfolio.reduce((sum, stock) => sum + stock.currentValue, 0);
    const totalCost = portfolio.reduce((sum, stock) => sum + stock.totalCost, 0);
    const totalProfitLoss = totalValue - totalCost;
    const totalProfitLossPct = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;

    const winners = portfolio.filter(s => s.profitLoss > 0).length;
    const losers = portfolio.filter(s => s.profitLoss < 0).length;

    return {
      totalValue,
      totalCost,
      totalProfitLoss,
      totalProfitLossPct,
      winners,
      losers,
      totalStocks: portfolio.length
    };
  };

  // Export portfolio to CSV
  const exportToCSV = () => {
    const headers = ['Symbol', 'Shares', 'Buy Price', 'Current Price', 'Total Cost', 'Current Value', 'Profit/Loss', 'P/L %'];
    const rows = portfolio.map(stock => [
      stock.symbol,
      stock.shares,
      stock.buyPrice.toFixed(2),
      stock.currentPrice.toFixed(2),
      stock.totalCost.toFixed(2),
      stock.currentValue.toFixed(2),
      stock.profitLoss.toFixed(2),
      stock.profitLossPct.toFixed(2) + '%'
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const metrics = calculateMetrics();

  return (
    <div id="root">
      {/* Header */}
      <div className="header">
        <h1>NEWTRADE Pro AI Sentinel</h1>
        <div className="header-actions">
          <button className="btn btn--primary" onClick={() => fileInputRef.current?.click()}>
            📁 Upload CSV
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".csv"
            style={{ display: 'none' }}
          />
          {portfolio.length > 0 && (
            <>
              <button className="btn btn--secondary" onClick={exportToCSV}>
                💾 Export CSV
              </button>
              <button 
                className="btn btn--outline" 
                onClick={() => updatePortfolioWithPrices(portfolio.map(s => ({
                  symbol: s.symbol,
                  shares: s.shares,
                  buyPrice: s.buyPrice,
                  totalCost: s.totalCost
                })))}
              >
                🔄 Refresh Prices
              </button>
            </>
          )}
        </div>
      </div>

      {uploadStatus && (
        <div className="upload-status">
          {uploadStatus}
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading portfolio data...</p>
          </div>
        </div>
      )}

      {portfolio.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-state__content">
            <div className="empty-state__icon">📊</div>
            <h2>Welcome to NEWTRADE Pro</h2>
            <p>Upload your portfolio CSV file to get started</p>
            <button className="btn btn--primary btn--lg" onClick={() => fileInputRef.current?.click()}>
              📁 Upload Portfolio CSV
            </button>
            <div className="empty-state__format">
              <p><strong>CSV Format:</strong></p>
              <code>Symbol,Shares,BuyPrice,TotalCost</code>
              <code>AAPL,10,150.00,1500.00</code>
            </div>
          </div>
        </div>
      )}

      {portfolio.length > 0 && (
        <>
          {/* Portfolio Summary Cards */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-card__label">Total Value</div>
              <div className="metric-card__value">${metrics.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Total Cost</div>
              <div className="metric-card__value">${metrics.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className={`metric-card ${metrics.totalProfitLoss >= 0 ? 'metric-card--positive' : 'metric-card--negative'}`}>
              <div className="metric-card__label">Total P/L</div>
              <div className="metric-card__value">
                {metrics.totalProfitLoss >= 0 ? '+' : ''}${metrics.totalProfitLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="metric-card__percentage">
                  ({metrics.totalProfitLossPct >= 0 ? '+' : ''}{metrics.totalProfitLossPct.toFixed(2)}%)
                </span>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Portfolio Stats</div>
              <div className="metric-card__stats">
                <span className="stat-badge stat-badge--success">{metrics.winners} Winners</span>
                <span className="stat-badge stat-badge--danger">{metrics.losers} Losers</span>
              </div>
            </div>
          </div>

          {/* Stock Cards Grid */}
          <div className="stocks-grid">
            {portfolio.map((stock, index) => (
              <div key={index} className="stock-card">
                <div className="stock-card__header">
                  <div className="stock-card__symbol">{stock.symbol}</div>
                  <div className={`stock-card__change ${stock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                    {stock.profitLoss >= 0 ? '+' : ''}{stock.profitLossPct.toFixed(2)}%
                  </div>
                </div>

                <div className="stock-card__price">
                  <div className="price-label">Current Price</div>
                  <div className="price-value">${stock.currentPrice.toFixed(2)}</div>
                </div>

                {stock.chartData && stock.chartData.length > 0 && (
                  <div className="stock-card__chart">
                    <MiniChart data={stock.chartData} />
                  </div>
                )}

                <div className="stock-card__details">
                  <div className="detail-row">
                    <span className="detail-label">Shares:</span>
                    <span className="detail-value">{stock.shares}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Buy Price:</span>
                    <span className="detail-value">${stock.buyPrice.toFixed(2)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Total Cost:</span>
                    <span className="detail-value">${stock.totalCost.toFixed(2)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Current Value:</span>
                    <span className="detail-value">${stock.currentValue.toFixed(2)}</span>
                  </div>
                  <div className={`detail-row detail-row--highlight ${stock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                    <span className="detail-label">Profit/Loss:</span>
                    <span className="detail-value">
                      {stock.profitLoss >= 0 ? '+' : ''}${stock.profitLoss.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
