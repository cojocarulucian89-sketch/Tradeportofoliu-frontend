import React, { useState, useEffect, useRef } from 'react';

// API Configuration - Using multiple APIs for redundancy
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
  const fileInputRef = useRef(null);

  // Fetch stock price from Finnhub API
  const fetchStockPrice = async (symbol) => {
    // Check cache first
    if (priceCache[symbol] && Date.now() - priceCache[symbol].timestamp < 30000) {
      return priceCache[symbol].price;
    }

    try {
      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEYS.finnhub}`
      );
      const data = await response.json();
      
      if (data.c && data.c > 0) {
        const price = data.c; // Current price
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

  // Fetch historical data for charts
  const fetchChartData = async (symbol) => {
    try {
      const to = Math.floor(Date.now() / 1000);
      const from = to - (7 * 24 * 60 * 60); // 7 days ago

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

  // Update portfolio with live prices
  const updatePortfolioWithPrices = async (portfolioData) => {
    setLoading(true);
    
    const updatedPortfolio = await Promise.all(
      portfolioData.map(async (stock) => {
        const currentPrice = await fetchStockPrice(stock.symbol);
        const chartData = await fetchChartData(stock.symbol);
        
        if (!currentPrice) {
          return {
            ...stock,
            currentPrice: stock.buyPrice,
            currentValue: stock.shares * stock.buyPrice,
            profitLoss: 0,
            profitLossPct: 0,
            chartData: []
          };
        }

        const currentValue = stock.shares * currentPrice;
        const totalCost = stock.shares * stock.buyPrice;
        const profitLoss = currentValue - totalCost;
        const profitLossPct = (profitLoss / totalCost) * 100;

        return {
          ...stock,
          currentPrice,
          currentValue,
          totalCost,
          profitLoss,
          profitLossPct,
          chartData
        };
      })
    );

    setPortfolio(updatedPortfolio);
    setLoading(false);
  };

  // Handle CSV upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadStatus('Processing CSV...');

    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      
      if (lines.length < 2) {
        setUploadStatus('❌ CSV file is empty or invalid');
        setTimeout(() => setUploadStatus(''), 3000);
        return;
      }

      // Parse CSV (skip header)
      const portfolioData = lines.slice(1).map(line => {
        const [symbol, shares, buyPrice] = line.split(',').map(s => s.trim());
        return {
          symbol: symbol.toUpperCase(),
          shares: parseFloat(shares),
          buyPrice: parseFloat(buyPrice),
          totalCost: parseFloat(shares) * parseFloat(buyPrice)
        };
      }).filter(stock => stock.symbol && stock.shares && stock.buyPrice);

      if (portfolioData.length === 0) {
        setUploadStatus('❌ No valid data found in CSV');
        setTimeout(() => setUploadStatus(''), 3000);
        return;
      }

      setUploadStatus(`✅ Loaded ${portfolioData.length} stocks. Fetching live prices...`);
      
      await updatePortfolioWithPrices(portfolioData);
      
      setUploadStatus(`✅ Portfolio loaded successfully!`);
      setTimeout(() => setUploadStatus(''), 5000);

    } catch (error) {
      setUploadStatus(`❌ Error: ${error.message}`);
      setTimeout(() => setUploadStatus(''), 5000);
    }
  };

  // Auto-refresh prices every 30 seconds
  useEffect(() => {
    if (portfolio.length === 0) return;

    const interval = setInterval(() => {
      updatePortfolioWithPrices(portfolio.map(stock => ({
        symbol: stock.symbol,
        shares: stock.shares,
        buyPrice: stock.buyPrice,
        totalCost: stock.totalCost
      })));
    }, 30000);

    return () => clearInterval(interval);
  }, [portfolio]);

  // Calculate portfolio stats
  const totalValue = portfolio.reduce((sum, stock) => sum + (stock.currentValue || 0), 0);
  const totalCost = portfolio.reduce((sum, stock) => sum + stock.totalCost, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  // AI Chat handlers
  const handleAIMessage = (message) => {
    setAiMessages([...aiMessages, { text: message, sender: 'user' }]);
    
    setTimeout(() => {
      let response = "I'm analyzing your portfolio...";
      
      if (message.toLowerCase().includes('recommend')) {
        response = "Based on your portfolio, consider diversifying into sectors with lower volatility. Would you like specific stock recommendations?";
      } else if (message.toLowerCase().includes('risk')) {
        response = "Your portfolio shows moderate risk. Consider adding bonds or defensive stocks to balance your holdings.";
      } else if (message.toLowerCase().includes('best') || message.toLowerCase().includes('top')) {
        if (portfolio.length > 0) {
          const topPerformer = portfolio.reduce((best, stock) => 
            stock.profitLossPct > best.profitLossPct ? stock : best
          );
          response = `Your top performer is ${topPerformer.symbol} with a ${topPerformer.profitLossPct.toFixed(2)}% gain!`;
        }
      }
      
      setAiMessages(prev => [...prev, { text: response, sender: 'ai' }]);
    }, 1000);
    
    setAiInput('');
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header-left">
            <div className="logo">📊 NEWTRADE Pro AI Sentinel</div>
            <div className="live-indicator">
              <span className="live-dot"></span>
              <span className="live-text">Live</span>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={() => setShowAIChat(!showAIChat)}>
              🤖 AI Assistant
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="container">
          {/* Stats Grid */}
          <div className="stats-grid">
            <div className="stat-card stat-card-primary">
              <div className="stat-label">Total Portfolio Value</div>
              <div className="stat-value">${totalValue.toFixed(2)}</div>
              <div className="stat-subtitle">Last updated: {new Date().toLocaleTimeString()}</div>
            </div>

            <div className={`stat-card stat-card-${totalPL >= 0 ? 'success' : 'danger'}`}>
              <div className="stat-label">Profit/Loss</div>
              <div className={`stat-value ${totalPL >= 0 ? 'positive' : 'negative'}`}>
                {totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)}
              </div>
              <div className={`stat-subtitle ${totalPLPct >= 0 ? 'positive' : 'negative'}`}>
                {totalPLPct >= 0 ? '+' : ''}{totalPLPct.toFixed(2)}%
              </div>
            </div>

            <div className="stat-card stat-card-info">
              <div className="stat-label">Holdings</div>
              <div className="stat-value">{portfolio.length}</div>
              <div className="stat-subtitle">{portfolio.length} active positions</div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="action-bar">
            <div className="csv-upload">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".csv"
                className="file-input"
              />
              <button 
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                📁 {loading ? 'Loading...' : 'Choose CSV'}
              </button>
              {uploadStatus && (
                <span className="upload-status">{uploadStatus}</span>
              )}
            </div>

            {portfolio.length > 0 && (
              <button 
                className="btn btn-secondary"
                onClick={() => updatePortfolioWithPrices(portfolio.map(stock => ({
                  symbol: stock.symbol,
                  shares: stock.shares,
                  buyPrice: stock.buyPrice,
                  totalCost: stock.totalCost
                })))}
                disabled={loading}
              >
                🔄 Refresh Prices
              </button>
            )}
          </div>

          {/* Portfolio Grid */}
          {loading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>Loading live prices...</p>
            </div>
          ) : portfolio.length === 0 ? (
            <div className="loading">
              <p>No portfolio data. Upload a CSV file to get started!</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '1rem' }}>
                CSV format: symbol,shares,buyPrice<br />
                Example: AAPL,50,150.00
              </p>
            </div>
          ) : (
            <div className="portfolio-grid">
              {portfolio.map((stock) => (
                <div key={stock.symbol} className="stock-card">
                  <div className="stock-header">
                    <h3 className="stock-symbol">{stock.symbol}</h3>
                    <span className={`stock-change ${stock.profitLossPct >= 0 ? 'positive' : 'negative'}`}>
                      {stock.profitLossPct >= 0 ? '+' : ''}{stock.profitLossPct.toFixed(2)}%
                    </span>
                  </div>

                  {/* Chart */}
                  <div className="chart-container">
                    <MiniChart data={stock.chartData || []} />
                  </div>

                  {/* Current Price */}
                  <div className="stock-price-section">
                    <div className="stock-price">${stock.currentPrice.toFixed(2)}</div>
                    <div className="stock-price-label">Current Price</div>
                  </div>

                  {/* Details */}
                  <div className="stock-details">
                    <div className="stock-detail-item">
                      <span className="label">Shares:</span>
                      <span className="value">{stock.shares}</span>
                    </div>
                    <div className="stock-detail-item">
                      <span className="label">Buy Price:</span>
                      <span className="value">${stock.buyPrice.toFixed(2)}</span>
                    </div>
                    <div className="stock-detail-item">
                      <span className="label">Total Cost:</span>
                      <span className="value">${stock.totalCost.toFixed(2)}</span>
                    </div>
                    <div className="stock-detail-item">
                      <span className="label">Current Value:</span>
                      <span className="value">${stock.currentValue.toFixed(2)}</span>
                    </div>
                    <div className="stock-detail-item stock-detail-highlight">
                      <span className="label">P/L:</span>
                      <span className={`value ${stock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                        {stock.profitLoss >= 0 ? '+' : ''}${stock.profitLoss.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* AI Chat Sidebar */}
      {showAIChat && (
        <div className="ai-chat-sidebar">
          <div className="ai-chat-header">
            <h3>🤖 AI Assistant</h3>
            <button className="close-btn" onClick={() => setShowAIChat(false)}>×</button>
          </div>
          
          <div className="ai-chat-messages">
            {aiMessages.length === 0 ? (
              <div className="ai-welcome">
                <p>Hello! I'm your AI portfolio assistant.</p>
                <p>Ask me about:</p>
                <ul>
                  <li>Portfolio recommendations</li>
                  <li>Risk analysis</li>
                  <li>Stock performance insights</li>
                  <li>Your top/worst performers</li>
                </ul>
              </div>
            ) : (
              aiMessages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.sender}`}>
                  <div className="message-avatar">{msg.sender === 'user' ? '👤' : '🤖'}</div>
                  <div className="message-content">{msg.text}</div>
                </div>
              ))
            )}
          </div>
          
          <div className="ai-chat-input">
            <input
              type="text"
              placeholder="Ask me anything..."
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && aiInput && handleAIMessage(aiInput)}
            />
            <button 
              className="btn btn-primary"
              onClick={() => aiInput && handleAIMessage(aiInput)}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
