import { useState, useEffect } from 'react';
import './index.css';

const API_URL = 'https://tradeportofoliu-backend.onrender.com';

function App() {
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [csvFile, setCsvFile] = useState(null);

  useEffect(() => {
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, []);

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

  const handleOptimize = async () => {
    try {
      const response = await fetch(`${API_URL}/api/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      alert('Portfolio optimized! Check console for details.');
      console.log(data);
    } catch (error) {
      console.error('Error optimizing:', error);
      alert('Failed to optimize portfolio');
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
      const data = await response.json();
      const aiMessage = { role: 'ai', content: data.response };
      setChatMessages([...chatMessages, userMessage, aiMessage]);
    } catch (error) {
      console.error('Error with AI chat:', error);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) {
      alert('Please select a CSV file first');
      return;
    }

    const formData = new FormData();
    formData.append('file', csvFile);

    try {
      const response = await fetch(`${API_URL}/api/upload-csv`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      alert(`CSV imported successfully! ${data.rows_imported} rows processed.`);
      fetchPortfolio();
    } catch (error) {
      console.error('Error uploading CSV:', error);
      alert('Failed to upload CSV');
    }
  };

  const totalValue = portfolio.reduce((sum, stock) => sum + stock.totalValue, 0);
  const totalProfitLoss = portfolio.reduce((sum, stock) => sum + stock.profitLoss, 0);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="container">
          <h1 className="logo">📊 NEWTRADE Pro AI Sentinel</h1>
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
            <div className="stat-card">
              <div className="stat-label">Total Portfolio Value</div>
              <div className="stat-value">${totalValue.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total P&L</div>
              <div className={`stat-value ${totalProfitLoss >= 0 ? 'positive' : 'negative'}`}>
                {totalProfitLoss >= 0 ? '+' : ''} ${totalProfitLoss.toFixed(2)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Holdings</div>
              <div className="stat-value">{portfolio.length}</div>
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
                📁 Choose CSV
              </label>
              {csvFile && (
                <button className="btn btn-primary" onClick={handleCsvUpload}>
                  📤 Upload {csvFile.name}
                </button>
              )}
            </div>
          </div>

          {/* Portfolio Grid */}
          {loading ? (
            <div className="loading">Loading portfolio...</div>
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
                  <div className="stock-price">${stock.currentPrice.toFixed(2)}</div>
                  <div className="stock-details">
                    <div className="stock-detail-item">
                      <span className="label">Shares:</span>
                      <span className="value">{stock.shares}</span>
                    </div>
                    <div className="stock-detail-item">
                      <span className="label">Total Value:</span>
                      <span className="value">${stock.totalValue.toFixed(2)}</span>
                    </div>
                    <div className="stock-detail-item">
                      <span className="label">P&L:</span>
                      <span className={`value ${stock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                        ${stock.profitLoss.toFixed(2)}
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
              <div className="ai-welcome">Ask me anything about your portfolio!</div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.role}`}>
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
            <button className="btn btn-primary" onClick={handleAIChat}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
