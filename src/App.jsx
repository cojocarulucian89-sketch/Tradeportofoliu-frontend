import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// API Configuration
const API_KEYS = {
  finnhub: 'd3r39m1r01qopgh6pgbgd3r39m1r01qopgh6pgc0',
  eodhd: '68f772ba2a7c87.32575988',
  fmp: 'XI00gXR2R27tsNEbChNxAPODUrhXaCPi'
};

function App() {
  const [portfolioData, setPortfolioData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [selectedStock, setSelectedStock] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const fileInputRef = useRef(null);

  // Toggle dark mode
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  // Fetch live price from APIs
  const fetchLivePrice = async (symbol) => {
    try {
      // Try Finnhub first
      const finnhubResponse = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEYS.finnhub}`
      );
      const finnhubData = await finnhubResponse.json();
      
      if (finnhubData.c && finnhubData.c > 0) {
        return finnhubData.c;
      }

      // Try EODHD as fallback
      const eodhdResponse = await fetch(
        `https://eodhistoricaldata.com/api/real-time/${symbol}?api_token=${API_KEYS.eodhd}&fmt=json`
      );
      const eodhdData = await eodhdResponse.json();
      
      if (eodhdData.close && eodhdData.close > 0) {
        return eodhdData.close;
      }

      // Try FMP as last fallback
      const fmpResponse = await fetch(
        `https://financialmodelingprep.com/api/v3/quote-short/${symbol}?apikey=${API_KEYS.fmp}`
      );
      const fmpData = await fmpResponse.json();
      
      if (fmpData[0]?.price && fmpData[0].price > 0) {
        return fmpData[0].price;
      }

      return 0;
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      return 0;
    }
  };

  // Handle file upload with REVOLUT FORMAT SUPPORT
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setUploadStatus(`Uploading ${file.name}...`);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        setUploadStatus('No data found in file');
        setIsLoading(false);
        return;
      }

      const header = lines[0].toLowerCase();
      let parsedData = [];

      // DETECT FORMAT: Revolut vs Simple CSV
      if (header.includes('ticker') && header.includes('type') && header.includes('quantity')) {
        // ✅ REVOLUT FORMAT
        console.log('Detected Revolut format');
        
        const holdings = {};
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Split by comma, handle quoted values
          const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
          
          if (values.length < 6) continue;
          
          const ticker = values[1]?.replace(/"/g, '').trim();
          const type = values[2]?.replace(/"/g, '').trim();
          const quantityStr = values[3]?.replace(/"/g, '').trim();
          const priceStr = values[4]?.replace(/"/g, '').replace('€', '').replace('$', '').trim();
          
          // Only process BUY transactions
          if (!ticker || !type.includes('BUY')) continue;
          
          const quantity = parseFloat(quantityStr);
          const price = parseFloat(priceStr);
          
          if (isNaN(quantity) || isNaN(price) || quantity <= 0) continue;
          
          // Aggregate by ticker
          if (!holdings[ticker]) {
            holdings[ticker] = {
              symbol: ticker,
              totalShares: 0,
              totalCost: 0,
              transactions: []
            };
          }
          
          holdings[ticker].totalShares += quantity;
          holdings[ticker].totalCost += (quantity * price);
          holdings[ticker].transactions.push({ quantity, price });
        }
        
        // Convert to array and calculate average buy price
        parsedData = Object.values(holdings).map(holding => ({
          symbol: holding.symbol,
          shares: holding.totalShares,
          buyPrice: holding.totalCost / holding.totalShares,
          totalCost: holding.totalCost
        }));
        
      } else {
        // ✅ SIMPLE FORMAT (Symbol,Shares,BuyPrice,TotalCost)
        console.log('Detected simple format');
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = line.includes(';') ? line.split(';') : line.split(',');
          
          if (values.length >= 4) {
            const symbol = values[0].trim();
            const shares = parseFloat(values[1].trim());
            const buyPrice = parseFloat(values[2].trim());
            const totalCost = parseFloat(values[3].trim());
            
            if (symbol && !isNaN(shares) && !isNaN(buyPrice) && shares > 0) {
              parsedData.push({
                symbol,
                shares,
                buyPrice,
                totalCost: totalCost || (shares * buyPrice)
              });
            }
          }
        }
      }

      if (parsedData.length === 0) {
        setUploadStatus('No valid data found');
        setIsLoading(false);
        return;
      }

      console.log(`Parsed ${parsedData.length} holdings:`, parsedData);
      
      setUploadStatus(`Loaded ${parsedData.length} stocks. Fetching live prices...`);
      
      // Fetch live prices for all stocks
      const enrichedData = await Promise.all(
        parsedData.map(async (stock) => {
          const livePrice = await fetchLivePrice(stock.symbol);
          const currentValue = stock.shares * livePrice;
          const profitLoss = currentValue - stock.totalCost;
          const profitLossPercent = (profitLoss / stock.totalCost) * 100;
          
          return {
            ...stock,
            currentPrice: livePrice,
            currentValue,
            profitLoss,
            profitLossPercent
          };
        })
      );

      setPortfolioData(enrichedData);
      setUploadStatus(`Successfully loaded ${enrichedData.length} stocks!`);
      
      setTimeout(() => setUploadStatus(''), 3000);
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  // Calculate portfolio metrics
  const calculateMetrics = () => {
    if (portfolioData.length === 0) return null;

    const totalInvested = portfolioData.reduce((sum, stock) => sum + stock.totalCost, 0);
    const totalCurrent = portfolioData.reduce((sum, stock) => sum + stock.currentValue, 0);
    const totalProfitLoss = totalCurrent - totalInvested;
    const totalProfitLossPercent = (totalProfitLoss / totalInvested) * 100;

    const gainers = portfolioData.filter(stock => stock.profitLoss > 0).length;
    const losers = portfolioData.filter(stock => stock.profitLoss < 0).length;

    return {
      totalInvested,
      totalCurrent,
      totalProfitLoss,
      totalProfitLossPercent,
      gainers,
      losers
    };
  };

  const metrics = calculateMetrics();

  return (
    <div className="App">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading portfolio data...</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="header">
        <h1>📊 NEWTRADE Pro AI Sentinel</h1>
        <div className="header-actions">
          <button 
            className="btn btn--icon" 
            onClick={() => setDarkMode(!darkMode)}
            title="Toggle Dark Mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button 
            className="btn btn--primary btn--lg" 
            onClick={() => fileInputRef.current?.click()}
          >
            📁 Upload CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </div>
      </header>

      {/* Upload Status */}
      {uploadStatus && (
        <div className="upload-status">
          {uploadStatus}
        </div>
      )}

      {/* Portfolio Content */}
      {portfolioData.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__content">
            <div className="empty-state__icon">📈</div>
            <h2>Welcome to NEWTRADE Pro</h2>
            <p>Upload your portfolio CSV file to get started</p>
            <button 
              className="btn btn--primary btn--lg" 
              onClick={() => fileInputRef.current?.click()}
            >
              📁 Upload Portfolio CSV
            </button>
            <div className="empty-state__format">
              <p><strong>CSV Format:</strong></p>
              <code>Symbol,Shares,BuyPrice,TotalCost</code>
              <code>AAPL,10,150.00,1500.00</code>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          {metrics && (
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-card__label">Total Invested</div>
                <div className="metric-card__value">
                  €{metrics.totalInvested.toFixed(2)}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-card__label">Current Value</div>
                <div className="metric-card__value">
                  €{metrics.totalCurrent.toFixed(2)}
                </div>
              </div>
              <div className={`metric-card ${metrics.totalProfitLoss >= 0 ? 'metric-card--positive' : 'metric-card--negative'}`}>
                <div className="metric-card__label">Total P/L</div>
                <div className="metric-card__value">
                  {metrics.totalProfitLoss >= 0 ? '+' : ''}€{metrics.totalProfitLoss.toFixed(2)}
                  <span className="metric-card__percentage">
                    ({metrics.totalProfitLossPercent >= 0 ? '+' : ''}{metrics.totalProfitLossPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-card__label">Portfolio Stats</div>
                <div className="metric-card__stats">
                  <span className="stat-badge stat-badge--success">
                    {metrics.gainers} Gainers
                  </span>
                  <span className="stat-badge stat-badge--danger">
                    {metrics.losers} Losers
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Stocks Grid */}
          <div className="stocks-grid">
            {portfolioData.map((stock, index) => (
              <div 
                key={index} 
                className="stock-card"
                onClick={() => setSelectedStock(stock)}
              >
                <div className="stock-card__header">
                  <div className="stock-card__symbol">{stock.symbol}</div>
                  <div className={`stock-card__change ${stock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                    {stock.profitLoss >= 0 ? '+' : ''}{stock.profitLossPercent.toFixed(2)}%
                  </div>
                </div>
                
                <div className="stock-card__price">
                  <div className="price-label">Current Price</div>
                  <div className="price-value">€{stock.currentPrice.toFixed(2)}</div>
                </div>

                <div className="stock-card__details">
                  <div className="detail-row">
                    <span className="detail-label">Shares:</span>
                    <span className="detail-value">{stock.shares.toFixed(4)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Avg Buy Price:</span>
                    <span className="detail-value">€{stock.buyPrice.toFixed(2)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Invested:</span>
                    <span className="detail-value">€{stock.totalCost.toFixed(2)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Current Value:</span>
                    <span className="detail-value">€{stock.currentValue.toFixed(2)}</span>
                  </div>
                  <div className={`detail-row detail-row--highlight ${stock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                    <span className="detail-label">P/L:</span>
                    <span className="detail-value">
                      {stock.profitLoss >= 0 ? '+' : ''}€{stock.profitLoss.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal for Stock Details */}
      {selectedStock && (
        <div className="modal-overlay" onClick={() => setSelectedStock(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedStock(null)}>
              ×
            </button>
            <h2>{selectedStock.symbol}</h2>
            <p className="modal-subtitle">Stock Details</p>
            
            <div className="modal-sections">
              <div className="modal-section">
                <h3>💰 Price Information</h3>
                <div className="detail-grid">
                  <div>
                    <strong>Current Price</strong>
                    <div>€{selectedStock.currentPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <strong>Average Buy Price</strong>
                    <div>€{selectedStock.buyPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <strong>Price Change</strong>
                    <div className={selectedStock.profitLoss >= 0 ? 'positive' : 'negative'}>
                      {selectedStock.profitLoss >= 0 ? '+' : ''}
                      {selectedStock.profitLossPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h3>📊 Holdings</h3>
                <div className="detail-grid">
                  <div>
                    <strong>Shares Owned</strong>
                    <div>{selectedStock.shares.toFixed(4)}</div>
                  </div>
                  <div>
                    <strong>Total Invested</strong>
                    <div>€{selectedStock.totalCost.toFixed(2)}</div>
                  </div>
                  <div>
                    <strong>Current Value</strong>
                    <div>€{selectedStock.currentValue.toFixed(2)}</div>
                  </div>
                  <div>
                    <strong>Profit/Loss</strong>
                    <div className={selectedStock.profitLoss >= 0 ? 'positive' : 'negative'}>
                      {selectedStock.profitLoss >= 0 ? '+' : ''}€{selectedStock.profitLoss.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
