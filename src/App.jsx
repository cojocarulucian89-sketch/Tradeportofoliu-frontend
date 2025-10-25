import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// API Configuration
const API_KEYS = {
  finnhub: 'd3r39m1r01qopgh6pgbgd3r39m1r01qopgh6pgc0',
  eodhd: '68f772ba2a7c87.32575988',
  fmp: 'XI00gXR2R27tsNEbChNxAPODUrhXaCPi',
  alphavantage: 'demo'
};

function App() {
  const [portfolioData, setPortfolioData] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [transactionFilter, setTransactionFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [selectedStock, setSelectedStock] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [viewMode, setViewMode] = useState('portfolio'); // 'portfolio' or 'transactions'
  const fileInputRef = useRef(null);
  const chartRefs = useRef({});

  // Toggle dark mode
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  // Show alerts for significant profit/loss
  const showAlert = (message, type) => {
    const id = Date.now();
    setAlerts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setAlerts(prev => prev.filter(alert => alert.id !== id));
    }, 5000);
  };

  // Fetch historical data for charts
  const fetchHistoricalData = async (symbol) => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      
      const response = await fetch(
        `https://eodhistoricaldata.com/api/eod/${symbol}?from=${startDate.toISOString().split('T')[0]}&to=${endDate.toISOString().split('T')[0]}&api_token=${API_KEYS.eodhd}&fmt=json`
      );
      
      const data = await response.json();
      return data.map(item => ({
        time: item.date,
        value: item.close
      }));
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      return [];
    }
  };

  // Fetch fundamental data
  const fetchFundamentals = async (symbol) => {
    try {
      const response = await fetch(
        `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${API_KEYS.fmp}`
      );
      const data = await response.json();
      
      if (data && data[0]) {
        const profile = data[0];
        return {
          marketCap: profile.mktCap,
          peRatio: profile.price / profile.eps,
          eps: profile.eps,
          beta: profile.beta,
          sector: profile.sector,
          industry: profile.industry,
          description: profile.description
        };
      }
      return null;
    } catch (error) {
      console.error(`Error fetching fundamentals for ${symbol}:`, error);
      return null;
    }
  };

  // Fetch dividend data
  const fetchDividends = async (symbol) => {
    try {
      const response = await fetch(
        `https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/${symbol}?apikey=${API_KEYS.fmp}`
      );
      const data = await response.json();
      
      if (data && data.historical && data.historical.length > 0) {
        const latest = data.historical[0];
        const annual = data.historical.slice(0, 4).reduce((sum, div) => sum + div.dividend, 0);
        
        return {
          yield: latest.adjDividend,
          annual: annual,
          paymentDate: latest.paymentDate,
          recordDate: latest.recordDate,
          history: data.historical.slice(0, 8)
        };
      }
      return null;
    } catch (error) {
      console.error(`Error fetching dividends for ${symbol}:`, error);
      return null;
    }
  };

  // Fetch live price from APIs
  const fetchLivePrice = async (symbol) => {
    try {
      const finnhubResponse = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEYS.finnhub}`
      );
      const finnhubData = await finnhubResponse.json();
      
      if (finnhubData.c && finnhubData.c > 0) {
        return finnhubData.c;
      }

      const eodhdResponse = await fetch(
        `https://eodhistoricaldata.com/api/real-time/${symbol}?api_token=${API_KEYS.eodhd}&fmt=json`
      );
      const eodhdData = await eodhdResponse.json();
      
      if (eodhdData.close && eodhdData.close > 0) {
        return eodhdData.close;
      }

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

  // Handle file upload with ALL TRANSACTIONS SUPPORT
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
      let parsedTransactions = [];
      let parsedData = [];

      // DETECT FORMAT: Revolut vs Simple CSV
      if (header.includes('ticker') && header.includes('type') && (header.includes('quantity') || header.includes('total amount'))) {
        // ✅ REVOLUT FORMAT DETECTAT
        console.log('Detected Revolut format');
        
        // Parse header pentru a găsi indicii coloanelor
        const headerParts = lines[0].split(',');
        const dateIdx = headerParts.findIndex(h => h.toLowerCase().trim() === 'date');
        const tickerIdx = headerParts.findIndex(h => h.toLowerCase().trim() === 'ticker');
        const typeIdx = headerParts.findIndex(h => h.toLowerCase().trim() === 'type');
        const quantityIdx = headerParts.findIndex(h => h.toLowerCase().trim() === 'quantity');
        const priceIdx = headerParts.findIndex(h => h.toLowerCase().includes('price per share'));
        const totalAmountIdx = headerParts.findIndex(h => h.toLowerCase().includes('total amount'));
        
        console.log('Column indices:', { dateIdx, tickerIdx, typeIdx, quantityIdx, priceIdx, totalAmountIdx });
        
        const holdings = {};
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Split by comma
          const values = line.split(',');
          
          if (values.length < 6) continue;
          
          const date = values[dateIdx]?.trim();
          const ticker = values[tickerIdx]?.trim();
          const type = values[typeIdx]?.trim();
          const quantityStr = values[quantityIdx]?.trim();
          const priceStr = values[priceIdx]?.replace(/[€$]/g, '').trim();
          const totalAmountStr = values[totalAmountIdx]?.replace(/[€$]/g, '').trim();
          
          const quantity = parseFloat(quantityStr) || 0;
          const price = parseFloat(priceStr) || 0;
          const totalAmount = parseFloat(totalAmountStr) || 0;
          
          // SALVEAZĂ TOATE TRANZACȚIILE
          parsedTransactions.push({
            date,
            ticker: ticker || 'N/A',
            type,
            quantity,
            price,
            totalAmount
          });
          
          // AGREGARE doar pentru tranzacții BUY cu ticker valid
          if (ticker && ticker !== '' && type.includes('BUY')) {
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
            holdings[ticker].transactions.push({ date, quantity, price });
          }
        }
        
        // Convert to array and calculate average buy price
        parsedData = Object.values(holdings).map(holding => ({
          symbol: holding.symbol,
          shares: holding.totalShares,
          buyPrice: holding.totalCost / holding.totalShares,
          totalCost: holding.totalCost
        }));
        
        console.log(`Parsed ${parsedTransactions.length} transactions`);
        console.log(`Parsed ${parsedData.length} unique stock holdings`);
        
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

      // Save all transactions
      setAllTransactions(parsedTransactions);

      if (parsedData.length === 0) {
        setUploadStatus(`Loaded ${parsedTransactions.length} transactions. No stock holdings found.`);
        setIsLoading(false);
        return;
      }

      setUploadStatus(`Loaded ${parsedData.length} stocks. Fetching live data...`);
      
      // Fetch live prices for all stocks
      const enrichedData = await Promise.all(
        parsedData.map(async (stock) => {
          const livePrice = await fetchLivePrice(stock.symbol);
          const currentValue = stock.shares * livePrice;
          const profitLoss = currentValue - stock.totalCost;
          const profitLossPercent = (profitLoss / stock.totalCost) * 100;
          
          // Show alert for significant changes
          if (Math.abs(profitLossPercent) > 5) {
            showAlert(
              `${stock.symbol}: ${profitLossPercent > 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%`,
              profitLossPercent > 0 ? 'gain' : 'loss'
            );
          }
          
          const historical = await fetchHistoricalData(stock.symbol);
          const fundamentals = await fetchFundamentals(stock.symbol);
          const dividends = await fetchDividends(stock.symbol);
          
          return {
            ...stock,
            currentPrice: livePrice,
            currentValue,
            profitLoss,
            profitLossPercent,
            historical,
            fundamentals,
            dividends
          };
        })
      );

      setPortfolioData(enrichedData);
      setUploadStatus(`Successfully loaded ${enrichedData.length} stocks with full data!`);
      
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
    
    const totalDividends = portfolioData.reduce((sum, stock) => {
      if (stock.dividends && stock.dividends.annual) {
        return sum + (stock.dividends.annual * stock.shares);
      }
      return sum;
    }, 0);

    return {
      totalInvested,
      totalCurrent,
      totalProfitLoss,
      totalProfitLossPercent,
      gainers,
      losers,
      totalDividends
    };
  };

  const metrics = calculateMetrics();

  // Filter transactions based on selected type
  const filteredTransactions = transactionFilter === 'ALL' 
    ? allTransactions 
    : allTransactions.filter(tx => tx.type.includes(transactionFilter));

  // Get unique transaction types for filter
  const transactionTypes = ['ALL', ...new Set(allTransactions.map(tx => {
    if (tx.type.includes('BUY')) return 'BUY';
    if (tx.type.includes('SELL')) return 'SELL';
    if (tx.type.includes('DIVIDEND')) return 'DIVIDEND';
    if (tx.type.includes('CASH')) return 'CASH';
    return 'OTHER';
  }))];

  // Render mini chart
  const renderMiniChart = (data) => {
    if (!data || data.length === 0) return null;
    
    const max = Math.max(...data.map(d => d.value));
    const min = Math.min(...data.map(d => d.value));
    const range = max - min;
    
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((d.value - min) / range) * 100;
      return `${x},${y}`;
    }).join(' ');
    
    const isPositive = data[data.length - 1].value > data[0].value;
    
    return (
      <svg className="mini-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke={isPositive ? '#4ade80' : '#f87171'}
          strokeWidth="2"
        />
      </svg>
    );
  };

  return (
    <div className="App">
      {/* Alerts */}
      <div className="alerts-container">
        {alerts.map(alert => (
          <div key={alert.id} className={`alert alert--${alert.type}`}>
            {alert.message}
          </div>
        ))}
      </div>

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
      {portfolioData.length === 0 && allTransactions.length === 0 ? (
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
              <p><strong>Supported Formats:</strong></p>
              <code>✅ Revolut Export (automatic detection)</code>
              <code>✅ Simple CSV: Symbol,Shares,BuyPrice,TotalCost</code>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* View Mode Tabs */}
          <div className="view-tabs">
            <button 
              className={`view-tab ${viewMode === 'portfolio' ? 'active' : ''}`}
              onClick={() => setViewMode('portfolio')}
            >
              📊 Portfolio ({portfolioData.length} stocks)
            </button>
            <button 
              className={`view-tab ${viewMode === 'transactions' ? 'active' : ''}`}
              onClick={() => setViewMode('transactions')}
            >
              📜 Transactions ({allTransactions.length})
            </button>
          </div>

          {/* PORTFOLIO VIEW */}
          {viewMode === 'portfolio' && portfolioData.length > 0 && (
            <>
              {/* Metrics Grid */}
              {metrics && (
                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-card__label">💰 Total Invested</div>
                    <div className="metric-card__value">
                      €{metrics.totalInvested.toFixed(2)}
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-card__label">📈 Current Value</div>
                    <div className="metric-card__value">
                      €{metrics.totalCurrent.toFixed(2)}
                    </div>
                  </div>
                  <div className={`metric-card ${metrics.totalProfitLoss >= 0 ? 'metric-card--positive' : 'metric-card--negative'}`}>
                    <div className="metric-card__label">💵 Total P/L</div>
                    <div className="metric-card__value">
                      {metrics.totalProfitLoss >= 0 ? '+' : ''}€{metrics.totalProfitLoss.toFixed(2)}
                      <span className="metric-card__percentage">
                        ({metrics.totalProfitLossPercent >= 0 ? '+' : ''}{metrics.totalProfitLossPercent.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-card__label">📊 Portfolio Stats</div>
                    <div className="metric-card__stats">
                      <span className="stat-badge stat-badge--success">
                        {metrics.gainers} 🚀 Gainers
                      </span>
                      <span className="stat-badge stat-badge--danger">
                        {metrics.losers} 📉 Losers
                      </span>
                    </div>
                    {metrics.totalDividends > 0 && (
                      <div className="metric-card__dividends">
                        💎 Annual Dividends: €{metrics.totalDividends.toFixed(2)}
                      </div>
                    )}
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
                        {stock.profitLoss >= 0 ? '📈 +' : '📉 '}{stock.profitLossPercent.toFixed(2)}%
                      </div>
                    </div>
                    
                    <div className="stock-card__price">
                      <div className="price-label">Current Price</div>
                      <div className="price-value">€{stock.currentPrice.toFixed(2)}</div>
                    </div>

                    {/* Mini Chart */}
                    {stock.historical && stock.historical.length > 0 && (
                      <div className="stock-card__chart">
                        {renderMiniChart(stock.historical)}
                      </div>
                    )}

                    <div className="stock-card__details">
                      <div className="detail-row">
                        <span className="detail-label">Shares:</span>
                        <span className="detail-value">{stock.shares.toFixed(4)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Avg Buy:</span>
                        <span className="detail-value">€{stock.buyPrice.toFixed(2)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Invested:</span>
                        <span className="detail-value">€{stock.totalCost.toFixed(2)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Value:</span>
                        <span className="detail-value">€{stock.currentValue.toFixed(2)}</span>
                      </div>
                      {stock.dividends && stock.dividends.annual > 0 && (
                        <div className="detail-row">
                          <span className="detail-label">💎 Div Yield:</span>
                          <span className="detail-value positive">
                            {((stock.dividends.annual / stock.currentPrice) * 100).toFixed(2)}%
                          </span>
                        </div>
                      )}
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

          {/* TRANSACTIONS VIEW */}
          {viewMode === 'transactions' && allTransactions.length > 0 && (
            <div className="transactions-view">
              {/* Transaction Filter */}
              <div className="transaction-filter">
                <label>Filter by Type:</label>
                <div className="filter-buttons">
                  {transactionTypes.map(type => (
                    <button
                      key={type}
                      className={`filter-btn ${transactionFilter === type ? 'active' : ''}`}
                      onClick={() => setTransactionFilter(type)}
                    >
                      {type} ({type === 'ALL' ? allTransactions.length : allTransactions.filter(tx => tx.type.includes(type)).length})
                    </button>
                  ))}
                </div>
              </div>

              {/* Transaction Table */}
              <div className="transactions-table-container">
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Ticker</th>
                      <th>Type</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx, index) => (
                      <tr key={index} className={`transaction-row ${tx.type.includes('BUY') ? 'buy' : tx.type.includes('SELL') ? 'sell' : tx.type.includes('DIVIDEND') ? 'dividend' : 'cash'}`}>
                        <td>{new Date(tx.date).toLocaleDateString()}</td>
                        <td><strong>{tx.ticker}</strong></td>
                        <td>
                          <span className={`type-badge ${tx.type.includes('BUY') ? 'buy' : tx.type.includes('SELL') ? 'sell' : tx.type.includes('DIVIDEND') ? 'dividend' : 'cash'}`}>
                            {tx.type}
                          </span>
                        </td>
                        <td>{tx.quantity > 0 ? tx.quantity.toFixed(4) : '-'}</td>
                        <td>{tx.price > 0 ? `€${tx.price.toFixed(2)}` : '-'}</td>
                        <td className={tx.totalAmount >= 0 ? 'positive' : 'negative'}>
                          {tx.totalAmount >= 0 ? '+' : ''}€{Math.abs(tx.totalAmount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
            <p className="modal-subtitle">
              {selectedStock.fundamentals?.sector || 'Stock'} • {selectedStock.fundamentals?.industry || 'Details'}
            </p>
            
            <div className="modal-sections">
              {/* Price Information */}
              <div className="modal-section">
                <h3>💰 Price Information</h3>
                <div className="detail-grid">
                  <div>
                    <strong>Current Price</strong>
                    <div>€{selectedStock.currentPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <strong>Average Buy</strong>
                    <div>€{selectedStock.buyPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <strong>Price Change</strong>
                    <div className={selectedStock.profitLoss >= 0 ? 'positive' : 'negative'}>
                      {selectedStock.profitLoss >= 0 ? '+' : ''}
                      {selectedStock.profitLossPercent.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <strong>52W Range</strong>
                    <div className="text-small">Coming soon</div>
                  </div>
                </div>
              </div>

              {/* Holdings */}
              <div className="modal-section">
                <h3>📊 Your Holdings</h3>
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

              {/* Fundamental Analysis */}
              {selectedStock.fundamentals && (
                <div className="modal-section">
                  <h3>🔬 Fundamental Analysis</h3>
                  <div className="detail-grid">
                    <div>
                      <strong>Market Cap</strong>
                      <div>
                        {selectedStock.fundamentals.marketCap 
                          ? `€${(selectedStock.fundamentals.marketCap / 1e9).toFixed(2)}B` 
                          : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <strong>P/E Ratio</strong>
                      <div>
                        {selectedStock.fundamentals.peRatio 
                          ? selectedStock.fundamentals.peRatio.toFixed(2) 
                          : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <strong>EPS</strong>
                      <div>
                        {selectedStock.fundamentals.eps 
                          ? `€${selectedStock.fundamentals.eps.toFixed(2)}` 
                          : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <strong>Beta</strong>
                      <div>
                        {selectedStock.fundamentals.beta 
                          ? selectedStock.fundamentals.beta.toFixed(2) 
                          : 'N/A'}
                      </div>
                    </div>
                  </div>
                  {selectedStock.fundamentals.description && (
                    <div className="company-description">
                      <strong>About:</strong>
                      <p>{selectedStock.fundamentals.description.substring(0, 200)}...</p>
                    </div>
                  )}
                </div>
              )}

              {/* Dividend Information */}
              {selectedStock.dividends && selectedStock.dividends.annual > 0 && (
                <div className="modal-section">
                  <h3>💎 Dividend Information</h3>
                  <div className="detail-grid">
                    <div>
                      <strong>Annual Dividend</strong>
                      <div>€{selectedStock.dividends.annual.toFixed(2)}</div>
                    </div>
                    <div>
                      <strong>Dividend Yield</strong>
                      <div className="positive">
                        {((selectedStock.dividends.annual / selectedStock.currentPrice) * 100).toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <strong>Payment Date</strong>
                      <div>{selectedStock.dividends.paymentDate || 'N/A'}</div>
                    </div>
                    <div>
                      <strong>Your Annual Income</strong>
                      <div className="positive">
                        €{(selectedStock.dividends.annual * selectedStock.shares).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  {selectedStock.dividends.history && selectedStock.dividends.history.length > 0 && (
                    <div className="dividend-list">
                      <strong>Recent Dividends:</strong>
                      {selectedStock.dividends.history.slice(0, 4).map((div, i) => (
                        <div key={i} className="dividend-item">
                          <span>{div.paymentDate || div.date}</span>
                          <span>€{div.dividend.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Historical Performance */}
              {selectedStock.historical && selectedStock.historical.length > 0 && (
                <div className="modal-section">
                  <h3>📈 Historical Performance (90 Days)</h3>
                  <div className="large-chart-container">
                    <svg viewBox="0 0 600 200" className="large-chart">
                      <defs>
                        <linearGradient id={`gradient-${selectedStock.symbol}`} x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor={selectedStock.profitLoss >= 0 ? '#4ade80' : '#f87171'} stopOpacity="0.3"/>
                          <stop offset="100%" stopColor={selectedStock.profitLoss >= 0 ? '#4ade80' : '#f87171'} stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      {(() => {
                        const data = selectedStock.historical;
                        const max = Math.max(...data.map(d => d.value));
                        const min = Math.min(...data.map(d => d.value));
                        const range = max - min;
                        
                        const points = data.map((d, i) => {
                          const x = (i / (data.length - 1)) * 600;
                          const y = 200 - ((d.value - min) / range) * 180;
                          return `${x},${y}`;
                        }).join(' ');
                        
                        const areaPoints = `0,200 ${points} 600,200`;
                        
                        return (
                          <>
                            <polygon
                              points={areaPoints}
                              fill={`url(#gradient-${selectedStock.symbol})`}
                            />
                            <polyline
                              points={points}
                              fill="none"
                              stroke={selectedStock.profitLoss >= 0 ? '#4ade80' : '#f87171'}
                              strokeWidth="3"
                            />
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                  <div className="chart-stats">
                    <div>
                      <strong>Period Change:</strong>
                      <span className={selectedStock.profitLoss >= 0 ? 'positive' : 'negative'}>
                        {selectedStock.profitLoss >= 0 ? '+' : ''}
                        {((selectedStock.currentPrice - selectedStock.historical[0].value) / selectedStock.historical[0].value * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
