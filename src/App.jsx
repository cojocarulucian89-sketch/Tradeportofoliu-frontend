import { useState, useEffect, useRef } from 'react';
import './index.css';

const API_URL = 'https://tradeportofoliu-backend.onrender.com';

// Simple Line Chart Component
function MiniChart({ data, symbol }) {
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

    // Get prices
    const prices = data.map(d => d.price);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
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

    // Fill area under line
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.fill();
  }, [data]);

  return <canvas ref={canvasRef} width={300} height={80} className="mini-chart" />;
}

function App() {
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [chartData, setChartData] = useState({});
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    fetchPortfolio();
    const portfolioInterval = setInterval(fetchPortfolio, 30000); // 30s
    
    // Update timestamp every second
    const timeInterval = setInterval(() => {
      setLastUpdate(new Date());
    }, 1000);

    return () => {
      clearInterval(portfolioInterval);
      clearInterval(timeInterval);
    };
  }, []);

  const fetchPortfolio = async () => {
    try {
      console.log('[FETCH] Getting portfolio from:', `${API_URL}/api/portfolio`);
      const response = await fetch(`${API_URL}/api/portfolio`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[SUCCESS] Portfolio data:', data);
      setPortfolio(data);
      setLoading(false);

      // Fetch chart data for each stock
      data.forEach(stock => {
        fetchChartData(stock.symbol);
      });
    } catch (error) {
      console.error('[ERROR] Failed to fetch portfolio:', error);
      setLoading(false);
    }
  };

  const fetchChartData = async (symbol) => {
    try {
      const response = await fetch(`${API_URL}/api/chart-data/${symbol}?days=7`);
      if (response.ok) {
        const data = await response.json();
        setChartData(prev => ({
          ...prev,
          [symbol]: data
        }));
      }
    } catch (error) {
      console.error(`[ERROR] Failed to fetch chart for ${symbol}:`, error);
    }
  };

  const handleOptimize = async () => {
    try {
      const response = await fetch(`${API_URL}/api/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error('Optimization failed');
      }

      const data = await response.json();
      alert(`✅ ${data.message}\n\nCheck console for details.`);
      console.log('[OPTIMIZE]', data);
    } catch (error) {
      console.error('[ERROR] Optimization failed:', error);
      alert('❌ Failed to optimize portfolio. Check console for details.');
    }
  };

  const handleAIChat = async () => {
    if (!chatInput.trim()) return;

    const userMessage = { role: 'user', content: chatInput };
    setChatMessages([...chatMessages, userMessage]);
    setChatInput('');

    try {
      const response = await fetch(`${API_URL}/api/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chatInput }),
      });
      
      if (response.ok) {
        const data = await response.json();
        const aiMessage = { role: 'ai', content: data.response };
        setChatMessages(prev => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error('[ERROR] AI chat failed:', error);
      const errorMessage = { role: 'ai', content: 'Sorry, I encountered an error. Please try again.' };
      setChatMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) {
      alert('⚠️ Please select a CSV file first');
      return;
    }

    setUploadStatus('Uploading...');

    const formData = new FormData();
    formData.append('file', csvFile);

    try {
      const response = await fetch(`${API_URL}/api/upload-csv`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setUploadStatus(`✅ Success! ${data.rows_imported} rows imported.`);
      setTimeout(() => {
        setUploadStatus('');
        setCsvFile(null);
      }, 3000);
      
      fetchPortfolio();
    } catch (error) {
      console.error('[ERROR] CSV upload failed:', error);
      setUploadStatus('❌ Upload failed');
      setTimeout(() => setUploadStatus(''), 3000);
    }
  };

  const totalValue = portfolio.reduce((sum, stock) => sum + stock.totalValue, 0);
  const totalProfitLoss = portfolio.reduce((sum, stock) => sum + stock.profitLoss, 0);
  const totalProfitLossPct = totalValue > 0 
    ? ((totalProfitLoss / (totalValue - totalProfitLoss)) * 100) 
    : 0;

  const timeSinceUpdate = Math.floor((new Date() - lastUpdate) / 1000);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header-left">
            <h1 className="logo">📊 NEWTRADE Pro AI Sentinel</h1>
            <div className="live-indicator">
              <span className="live-dot"></span>
              <span className="live-text">LIVE</span>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={() => setAiChatOpen(!aiChatOpen)}>
              🤖 AI Assistant
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="container">
          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card stat-card-primary">
              <div className="stat-label">Total Portfolio Value</div>
              <div className="stat-value">${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
              <div className="stat-subtitle">Last updated: {timeSinceUpdate}s ago</div>
            </div>
            <div className="stat-card stat-card-success">
              <div className="stat-label">Total P&L</div>
              <div className={`stat-value ${totalProfitLoss >= 0 ? 'positive' : 'negative'}`}>
                {totalProfitLoss >= 0 ? '+' : ''} ${totalProfitLoss.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </div>
              <div className={`stat-subtitle ${totalProfitLossPct >= 0 ? 'positive' : 'negative'}`}>
                {totalProfitLossPct >= 0 ? '▲' : '▼'} {Math.abs(totalProfitLossPct).toFixed(2)}%
              </div>
            </div>
            <div className="stat-card stat-card-info">
              <div className="stat-label">Holdings</div>
              <div className="stat-value">{portfolio.length}</div>
              <div className="stat-subtitle">{portfolio.length} active positions</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="action-bar">
            <button className="btn btn-primary" onClick={handleOptimize}>
              ⚡ Optimize Portfolio
            </button>
            <div className="csv-upload">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files[0])}
                className="file-input"
                id="csv-input"
              />
              <label htmlFor="csv-input" className="btn btn-secondary">
                📁 {csvFile ? csvFile.name : 'Choose CSV'}
              </label>
              {csvFile && (
                <button className="btn btn-primary" onClick={handleCsvUpload}>
                  📤 Upload
                </button>
              )}
              {uploadStatus && (
                <div className="upload-status">{uploadStatus}</div>
              )}
            </div>
          </div>

          {/* Portfolio Grid */}
          {loading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>Loading portfolio data...</p>
            </div>
          ) : (
            <div className="portfolio-grid">
              {portfolio.map((stock) => (
                <div key={stock.symbol} className="stock-card">
                  <div className="stock-header">
                    <h3 className="stock-symbol">{stock.symbol}</h3>
                    <div className={`stock-change ${stock.profitLossPct >= 0 ? 'positive' : 'negative'}`}>
                      {stock.profitLossPct >= 0 ? '▲' : '▼'} {Math.abs(stock.profitLossPct).toFixed(2)}%
                    </div>
                  </div>

                  {/* Mini Chart */}
                  {chartData[stock.symbol] && (
                    <div className="chart-container">
                      <MiniChart data={chartData[stock.symbol]} symbol={stock.symbol} />
                    </div>
                  )}

                  <div className="stock-price-section">
                    <div className="stock-price">${stock.currentPrice.toFixed(2)}</div>
                    <div className="stock-price-label">Current Price</div>
                  </div>

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
                      <span className="label">Total Value:</span>
                      <span className="value">${stock.totalValue.toFixed(2)}</span>
                    </div>
                    <div className="stock-detail-item stock-detail-highlight">
                      <span className="label">P&L:</span>
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
      {aiChatOpen && (
        <div className="ai-chat-sidebar">
          <div className="ai-chat-header">
            <h3>🤖 AI Assistant</h3>
            <button className="close-btn" onClick={() => setAiChatOpen(false)}>×</button>
          </div>
          <div className="ai-chat-messages">
            {chatMessages.length === 0 ? (
              <div className="ai-welcome">
                <p>👋 Hello! I'm your AI trading assistant.</p>
                <p>Ask me about:</p>
                <ul>
                  <li>Portfolio analysis</li>
                  <li>Stock recommendations</li>
                  <li>Market insights</li>
                  <li>Investment strategies</li>
                </ul>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className="message-content">{msg.content}</div>
                </div>
              ))
            )}
          </div>
          <div className="ai-chat-input">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAIChat()}
              placeholder="Type your question..."
            />
            <button className="btn btn-primary" onClick={handleAIChat}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
