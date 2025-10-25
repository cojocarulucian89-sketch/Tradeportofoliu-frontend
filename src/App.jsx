import React, { useState, useEffect, useRef } from 'react';

const API_URL = 'https://tradeportofoliu-backend.onrender.com';

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

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const prices = data.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    // Draw line
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

    // Draw area under line
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
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showAIChat, setShowAIChat] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const fileInputRef = useRef(null);

  // Fetch portfolio data
  const fetchPortfolio = async () => {
    try {
      const response = await fetch(`${API_URL}/api/portfolio`);
      const data = await response.json();
      setPortfolio(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching portfolio:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Handle CSV upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadStatus('Uploading...');
      const response = await fetch(`${API_URL}/api/upload-csv`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        setUploadStatus(`✅ ${result.message}`);
        fetchPortfolio(); // Reload portfolio
      } else {
        setUploadStatus(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setUploadStatus(`❌ Upload failed: ${error.message}`);
    }

    // Clear status after 5 seconds
    setTimeout(() => setUploadStatus(''), 5000);
  };

  // Handle portfolio optimization
  const handleOptimize = async () => {
    try {
      const response = await fetch(`${API_URL}/api/optimize`, {
        method: 'POST'
      });

      const result = await response.json();

      if (response.ok) {
        alert('Portfolio optimized using AI analysis. Check console for details.');
        console.log('Optimization Results:', result);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      alert(`Optimization failed: ${error.message}`);
    }
  };

  // Calculate portfolio stats
  const totalValue = portfolio.reduce((sum, stock) => sum + stock.currentValue, 0);
  const totalCost = portfolio.reduce((sum, stock) => sum + stock.totalCost, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? ((totalPL / totalCost) * 100) : 0;

  // AI Chat handlers
  const handleAIMessage = (message) => {
    setAiMessages([...aiMessages, { text: message, sender: 'user' }]);
    
    // Simple AI response simulation
    setTimeout(() => {
      let response = "I'm analyzing your portfolio...";
      
      if (message.toLowerCase().includes('recommend')) {
        response = "Based on your portfolio, consider diversifying into sectors with lower volatility. Would you like specific stock recommendations?";
      } else if (message.toLowerCase().includes('risk')) {
        response = "Your portfolio shows moderate risk. Consider adding bonds or defensive stocks to balance your holdings.";
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
            <button className="btn btn-primary" onClick={handleOptimize}>
              ⚡ Optimize Portfolio
            </button>
            
            <div className="csv-upload">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".csv"
                className="file-input"
              />
              <button 
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                📁 Choose CSV
              </button>
              {uploadStatus && (
                <span className="upload-status">{uploadStatus}</span>
              )}
            </div>
          </div>

          {/* Portfolio Grid */}
          {loading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>Loading portfolio...</p>
            </div>
          ) : portfolio.length === 0 ? (
            <div className="loading">
              <p>No portfolio data. Upload a CSV file to get started!</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
                CSV format: symbol, shares, buyPrice
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
                  <li>Optimization strategies</li>
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
