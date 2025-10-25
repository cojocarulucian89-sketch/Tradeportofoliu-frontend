import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// ============================================
// API CONFIGURATION - Multi-provider fallback
// ============================================
const API_KEYS = {
  finnhub: 'd3r39m1r01qopgh6pgbgd3r39m1r01qopgh6pgc0',
  fmp: 'XI00gXR2R27tsNEbChNxAPODUrhXaCPi',
  alphavantage: 'demo'
};

// Currency conversion rates (EUR base)
const FOREX_RATES = {
  USD: 1.09,
  EUR: 1.00,
  GBP: 0.86,
  RON: 4.97
};

function App() {
  // ============================================
  // STATE MANAGEMENT
  // ============================================
  const [portfolioData, setPortfolioData] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [transactionFilter, setTransactionFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [selectedStock, setSelectedStock] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [viewMode, setViewMode] = useState('portfolio');
  const [priceUpdateTime, setPriceUpdateTime] = useState(null);
  const [showChartModal, setShowChartModal] = useState(false);
  const [chartStock, setChartStock] = useState(null);
  
  // NEW: Notifications & Ticker Fixer
  const [showNotifications, setShowNotifications] = useState(false);
  const [showTickerFixer, setShowTickerFixer] = useState(false);
  const [tickerToFix, setTickerToFix] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [tickerSearchQuery, setTickerSearchQuery] = useState('');
  
  const fileInputRef = useRef(null);

  // Dark mode is default and permanent
  useEffect(() => {
    document.body.classList.add('dark-mode');
  }, []);

  // Auto-refresh prices every 2 minutes
  useEffect(() => {
    if (portfolioData.length > 0) {
      const interval = setInterval(() => {
        refreshPrices();
      }, 120000); // 2 minutes

      return () => clearInterval(interval);
    }
  }, [portfolioData]);

  // ============================================
  // ALERT SYSTEM - NOW WITH SILENT MODE
  // ============================================
  const showAlert = (message, type = 'info', silent = false) => {
    const id = Date.now();
    const newAlert = { id, message, type, timestamp: new Date() };
    setAlerts(prev => [...prev, newAlert]);
    
    // Auto-hide only if panel is not open
    if (!showNotifications && !silent) {
      setTimeout(() => {
        setAlerts(prev => prev.filter(alert => alert.id !== id));
      }, 5000);
    }
  };

  // ============================================
  // ENHANCED PRICE FETCHING - Multi-API with fallback
  // ============================================
  const fetchLivePrice = async (symbol) => {
    console.log(`Fetching price for ${symbol}...`);
    
    try {
      // Try Financial Modeling Prep FIRST (best for European stocks)
      const fmpResponse = await fetch(
        `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${API_KEYS.fmp}`
      );
      const fmpData = await fmpResponse.json();
      
      if (fmpData && fmpData[0] && fmpData[0].price > 0) {
        console.log(`✅ FMP Success for ${symbol}: €${fmpData[0].price}`);
        return fmpData[0].price;
      }
    } catch (error) {
      console.log(`⚠️ FMP failed for ${symbol}, trying Finnhub...`);
    }

    // Fallback to Finnhub
    try {
      const finnhubResponse = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEYS.finnhub}`
      );
      const finnhubData = await finnhubResponse.json();
      
      if (finnhubData.c && finnhubData.c > 0) {
        console.log(`✅ Finnhub Success for ${symbol}: €${finnhubData.c}`);
        return finnhubData.c;
      }
    } catch (error) {
      console.log(`⚠️ Finnhub failed for ${symbol}`);
    }

    // If all APIs fail, return 0 and show warning
    console.error(`❌ All APIs failed for ${symbol}`);
    showAlert(`Could not fetch price for ${symbol}`, 'warning', true);
    return 0;
  };

  // ============================================
  // REFRESH PRICES - Update all stocks
  // ============================================
  const refreshPrices = async () => {
    if (portfolioData.length === 0) return;
    
    setIsLoading(true);
    console.log('🔄 Refreshing all stock prices...');

    try {
      const updatedData = await Promise.all(
        portfolioData.map(async (stock) => {
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

      setPortfolioData(updatedData);
      setPriceUpdateTime(new Date());
      showAlert('✅ Prices updated successfully!', 'success');
      console.log('✅ Price refresh complete');
    } catch (error) {
      console.error('❌ Price refresh error:', error);
      showAlert('Failed to refresh prices', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // FETCH HISTORICAL DATA
  // ============================================
  const fetchHistoricalData = async (symbol) => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3); // 3 months of data
      
      const response = await fetch(
        `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?from=${startDate.toISOString().split('T')[0]}&to=${endDate.toISOString().split('T')[0]}&apikey=${API_KEYS.fmp}`
      );
      
      const data = await response.json();
      
      if (data && data.historical && data.historical.length > 0) {
        return data.historical.reverse().map(item => ({
          time: item.date,
          value: item.close,
          volume: item.volume
        }));
      }
      return [];
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      return [];
    }
  };

  // ============================================
  // FETCH FUNDAMENTALS
  // ============================================
  const fetchFundamentals = async (symbol) => {
    try {
      const response = await fetch(
        `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${API_KEYS.fmp}`
      );
      const data = await response.json();
      
      if (data && data[0]) {
        const profile = data[0];
        return {
          companyName: profile.companyName,
          marketCap: profile.mktCap,
          peRatio: profile.price && profile.eps ? profile.price / profile.eps : 0,
          eps: profile.eps,
          beta: profile.beta,
          sector: profile.sector,
          industry: profile.industry,
          description: profile.description,
          website: profile.website,
          ceo: profile.ceo,
          employees: profile.fullTimeEmployees,
          country: profile.country,
          exchange: profile.exchangeShortName,
          currency: profile.currency
        };
      }
      return null;
    } catch (error) {
      console.error(`Error fetching fundamentals for ${symbol}:`, error);
      return null;
    }
  };

  // ============================================
  // FETCH DIVIDENDS
  // ============================================
  const fetchDividends = async (symbol) => {
    try {
      const response = await fetch(
        `https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/${symbol}?apikey=${API_KEYS.fmp}`
      );
      const data = await response.json();
      
      if (data && data.historical && data.historical.length > 0) {
        const latest = data.historical[0];
        const annual = data.historical.slice(0, 4).reduce((sum, div) => sum + (div.dividend || 0), 0);
        
        return {
          yield: latest.adjDividend || latest.dividend || 0,
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

  // ============================================
  // TICKER SEARCH & FIX - NEW FEATURE
  // ============================================
  const searchTickerAPI = async (query) => {
    if (!query || query.length < 2) return [];
    
    try {
      // Try FMP API symbol search
      const response = await fetch(
        `https://financialmodelingprep.com/api/v3/search?query=${query}&limit=15&apikey=${API_KEYS.fmp}`
      );
      const data = await response.json();
      
      if (data && data.length > 0) {
        return data.map(item => ({
          symbol: item.symbol,
          name: item.name,
          exchange: item.exchangeShortName,
          currency: item.currency,
          type: item.type
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Error searching ticker:', error);
      return [];
    }
  };

  const handleTickerSearch = async (symbol) => {
    setTickerToFix(symbol);
    setTickerSearchQuery(symbol);
    setShowTickerFixer(true);
    
    // Search for similar tickers
    const results = await searchTickerAPI(symbol);
    setSearchResults(results);
    
    if (results.length === 0) {
      showAlert(`No results found for "${symbol}". Try a different search.`, 'warning');
    }
  };

  const performCustomSearch = async () => {
    if (!tickerSearchQuery || tickerSearchQuery.length < 2) {
      showAlert('Please enter at least 2 characters', 'warning');
      return;
    }
    
    const results = await searchTickerAPI(tickerSearchQuery);
    setSearchResults(results);
    
    if (results.length === 0) {
      showAlert(`No results found for "${tickerSearchQuery}"`, 'warning');
    }
  };

  const applyTickerFix = async (oldSymbol, newSymbol) => {
    setIsLoading(true);
    showAlert(`Updating ${oldSymbol} → ${newSymbol}...`, 'info');
    
    try {
      // Update portfolio data with new ticker
      const updatedData = await Promise.all(
        portfolioData.map(async (stock) => {
          if (stock.symbol === oldSymbol) {
            const livePrice = await fetchLivePrice(newSymbol);
            
            if (livePrice === 0) {
              showAlert(`❌ Still could not fetch price for ${newSymbol}`, 'error');
              return stock;
            }
            
            const currentValue = stock.shares * livePrice;
            const profitLoss = currentValue - stock.totalCost;
            const profitLossPercent = (profitLoss / stock.totalCost) * 100;
            
            const historical = await fetchHistoricalData(newSymbol);
            const fundamentals = await fetchFundamentals(newSymbol);
            const dividends = await fetchDividends(newSymbol);
            
            return {
              ...stock,
              symbol: newSymbol,
              currentPrice: livePrice,
              currentValue,
              profitLoss,
              profitLossPercent,
              historical,
              fundamentals,
              dividends
            };
          }
          return stock;
        })
      );
      
      setPortfolioData(updatedData);
      setShowTickerFixer(false);
      setTickerToFix(null);
      setSearchResults([]);
      setTickerSearchQuery('');
      showAlert(`✅ Successfully updated ${oldSymbol} → ${newSymbol}`, 'success');
    } catch (error) {
      console.error('Error applying ticker fix:', error);
      showAlert('Failed to update ticker', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  // ============================================
  // CSV FILE UPLOAD & PARSING
  // ============================================
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      showAlert('❌ Please upload a valid CSV file', 'error');
      return;
    }

    setIsLoading(true);
    setUploadStatus('Reading CSV file...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          showAlert('❌ CSV file is empty or invalid', 'error');
          setIsLoading(false);
          return;
        }

        // Parse header
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        console.log('📋 CSV Headers:', headers);

        // Find required column indices
        const dateIndex = headers.findIndex(h => h.toLowerCase().includes('date'));
        const tickerIndex = headers.findIndex(h => h.toLowerCase().includes('ticker'));
        const typeIndex = headers.findIndex(h => h.toLowerCase().includes('type'));
        const quantityIndex = headers.findIndex(h => h.toLowerCase().includes('quantity') || h.toLowerCase().includes('no. of shares'));
        const priceIndex = headers.findIndex(h => h.toLowerCase().includes('price per share'));
        const totalIndex = headers.findIndex(h => h.toLowerCase().includes('total amount'));

        if (tickerIndex === -1 || typeIndex === -1) {
          showAlert('❌ CSV must contain Ticker and Type columns', 'error');
          setIsLoading(false);
          return;
        }

        // Parse all transactions
        const transactions = [];
        const portfolio = {};

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          
          const date = dateIndex !== -1 ? values[dateIndex] : '';
          const ticker = tickerIndex !== -1 ? values[tickerIndex] : '';
          const type = typeIndex !== -1 ? values[typeIndex] : '';
          const quantity = quantityIndex !== -1 ? parseFloat(values[quantityIndex]) || 0 : 0;
          const price = priceIndex !== -1 ? parseFloat(values[priceIndex]) || 0 : 0;
          const totalAmount = totalIndex !== -1 ? parseFloat(values[totalIndex]) || 0 : 0;

          // Skip invalid rows
          if (!ticker || !type) continue;

          // Store transaction
          transactions.push({
            date,
            ticker,
            type,
            quantity,
            price,
            totalAmount
          });

          // Process portfolio holdings (only BUY transactions with ticker symbols)
          if (type.toUpperCase().includes('BUY') && ticker && quantity > 0) {
            if (!portfolio[ticker]) {
              portfolio[ticker] = {
                symbol: ticker,
                shares: 0,
                totalCost: 0,
                buyPrice: 0
              };
            }
            
            portfolio[ticker].shares += quantity;
            portfolio[ticker].totalCost += Math.abs(totalAmount);
            portfolio[ticker].buyPrice = portfolio[ticker].totalCost / portfolio[ticker].shares;
          } else if (type.toUpperCase().includes('SELL') && ticker && quantity > 0) {
            if (portfolio[ticker]) {
              portfolio[ticker].shares -= quantity;
              if (portfolio[ticker].shares <= 0) {
                delete portfolio[ticker];
              }
            }
          }
        }

        setAllTransactions(transactions);
        console.log(`✅ Parsed ${transactions.length} transactions`);
        console.log(`📊 Portfolio contains ${Object.keys(portfolio).length} stocks`);

        // Fetch live prices and enrich data
        const portfolioArray = Object.values(portfolio);
        setUploadStatus(`Fetching prices for ${portfolioArray.length} stocks...`);

        const enrichedPortfolio = [];
        for (let i = 0; i < portfolioArray.length; i++) {
          const stock = portfolioArray[i];
          setUploadStatus(`Fetching data for ${stock.symbol} (${i + 1}/${portfolioArray.length})...`);

          const livePrice = await fetchLivePrice(stock.symbol);
          const currentValue = stock.shares * livePrice;
          const profitLoss = currentValue - stock.totalCost;
          const profitLossPercent = (profitLoss / stock.totalCost) * 100;

          const historical = await fetchHistoricalData(stock.symbol);
          const fundamentals = await fetchFundamentals(stock.symbol);
          const dividends = await fetchDividends(stock.symbol);

          enrichedPortfolio.push({
            ...stock,
            currentPrice: livePrice,
            currentValue,
            profitLoss,
            profitLossPercent,
            historical,
            fundamentals,
            dividends
          });
        }

        setPortfolioData(enrichedPortfolio);
        setPriceUpdateTime(new Date());
        setIsLoading(false);
        setUploadStatus('');
        showAlert(`✅ Successfully loaded ${enrichedPortfolio.length} stocks!`, 'success');

      } catch (error) {
        console.error('❌ Error parsing CSV:', error);
        showAlert('❌ Failed to parse CSV file. Please check the format.', 'error');
        setIsLoading(false);
        setUploadStatus('');
      }
    };

    reader.readAsText(file);
  };

  // ============================================
  // PORTFOLIO METRICS CALCULATOR
  // ============================================
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

    const topGainer = portfolioData.reduce((max, stock) => 
      stock.profitLossPercent > (max?.profitLossPercent || -Infinity) ? stock : max
    , null);

    const topLoser = portfolioData.reduce((min, stock) => 
      stock.profitLossPercent < (min?.profitLossPercent || Infinity) ? stock : min
    , null);

    return {
      totalInvested,
      totalCurrent,
      totalProfitLoss,
      totalProfitLossPercent,
      gainers,
      losers,
      totalDividends,
      topGainer,
      topLoser,
      stockCount: portfolioData.length
    };
  };

  const metrics = calculateMetrics();

  // ============================================
  // TRANSACTION FILTER LOGIC
  // ============================================
  const filteredTransactions = transactionFilter === 'ALL' 
    ? allTransactions 
    : allTransactions.filter(tx => {
        if (transactionFilter === 'BUY') return tx.type.includes('BUY');
        if (transactionFilter === 'SELL') return tx.type.includes('SELL');
        if (transactionFilter === 'DIVIDEND') return tx.type.includes('DIVIDEND');
        if (transactionFilter === 'CASH') return tx.type.includes('CASH');
        return false;
      });

  const transactionTypes = ['ALL', 'BUY', 'SELL', 'DIVIDEND', 'CASH'];

  // ============================================
  // CHART RENDERING - Mini sparkline
  // ============================================
  const renderMiniChart = (data) => {
    if (!data || data.length === 0) return null;
    
    const max = Math.max(...data.map(d => d.value));
    const min = Math.min(...data.map(d => d.value));
    const range = max - min;
    
    if (range === 0) return null;
    
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
          stroke={isPositive ? 'var(--color-success)' : 'var(--color-error)'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  // ============================================
  // FORMAT HELPERS
  // ============================================
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatNumber = (value, decimals = 2) => {
    return new Intl.NumberFormat('ro-RO', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  };

  const formatMarketCap = (value) => {
    if (value >= 1e12) return `€${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `€${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `€${(value / 1e6).toFixed(2)}M`;
    return `€${value.toFixed(2)}`;
  };

  const formatTimeAgo = (date) => {
    if (!date) return '';
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };
  // ============================================
  // JSX RENDERING START
  // ============================================
  return (
    <div className="App">
      {/* NOTIFICATIONS PANEL - NEW: Collapsible, triggered by button */}
      {showNotifications && alerts.length > 0 && (
        <div className="notifications-panel">
          <div className="notifications-panel__header">
            <h3 className="notifications-panel__title">
              <span className="panel-icon">🔔</span>
              Notifications ({alerts.length})
            </h3>
            <button 
              className="notifications-panel__close"
              onClick={() => setShowNotifications(false)}
              title="Close"
            >
              ×
            </button>
          </div>
          <div className="notifications-panel__content">
            {alerts.map(alert => (
              <div key={alert.id} className={`alert alert--${alert.type}`}>
                <span className="alert__icon">
                  {alert.type === 'success' && '✅'}
                  {alert.type === 'error' && '❌'}
                  {alert.type === 'warning' && '⚠️'}
                  {alert.type === 'info' && 'ℹ️'}
                  {alert.type === 'gain' && '📈'}
                  {alert.type === 'loss' && '📉'}
                </span>
                <div className="alert__content">
                  <span className="alert__message">{alert.message}</span>
                  {alert.timestamp && (
                    <span className="alert__time">
                      {formatTimeAgo(alert.timestamp)}
                    </span>
                  )}
                </div>
                <button
                  className="alert__dismiss"
                  onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="notifications-panel__footer">
            <button 
              className="btn btn--secondary btn--sm"
              onClick={() => setAlerts([])}
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* LOADING OVERLAY */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p className="loading-text">{uploadStatus || 'Loading...'}</p>
          </div>
        </div>
      )}

      {/* HEADER - Premium Design with Notifications Button */}
      <header className="header">
        <div className="header__content">
          <div className="header__brand">
            <div className="brand-icon">📊</div>
            <div className="brand-text">
              <h1 className="brand-title">NEWTRADE Pro</h1>
              <p className="brand-subtitle">AI Sentinel Portfolio</p>
            </div>
          </div>
          
          <div className="header__actions">
            {priceUpdateTime && (
              <div className="price-update-badge">
                <span className="update-dot"></span>
                <span className="update-text">
                  Updated {formatTimeAgo(priceUpdateTime)}
                </span>
              </div>
            )}
            
            {/* NEW: NOTIFICATIONS BUTTON - Shows badge with count */}
            {alerts.length > 0 && (
              <button 
                className={`btn btn--secondary btn--icon ${showNotifications ? 'active' : ''}`}
                onClick={() => setShowNotifications(!showNotifications)}
                title="Notifications"
              >
                <span className="btn-icon">🔔</span>
                <span className="btn-text">Notifications</span>
                {alerts.length > 0 && (
                  <span className="notification-count">{alerts.length}</span>
                )}
              </button>
            )}
            
            {portfolioData.length > 0 && (
              <button 
                className="btn btn--secondary btn--icon" 
                onClick={refreshPrices}
                title="Refresh Prices"
                disabled={isLoading}
              >
                <span className="btn-icon">🔄</span>
                <span className="btn-text">Refresh</span>
              </button>
            )}
            
            <button 
              className="btn btn--primary" 
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              <span className="btn-icon">📁</span>
              <span className="btn-text">Upload CSV</span>
            </button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="main-content">
        {portfolioData.length === 0 && allTransactions.length === 0 ? (
          // EMPTY STATE - Beautiful Onboarding
          <div className="empty-state">
            <div className="empty-state__content">
              <div className="empty-state__icon-wrapper">
                <div className="empty-state__icon">📈</div>
                <div className="empty-state__icon-bg"></div>
              </div>
              <h2 className="empty-state__title">Welcome to NEWTRADE Pro</h2>
              <p className="empty-state__description">
                Start by uploading your Revolut portfolio CSV file to track your investments in real-time
              </p>
              <button 
                className="btn btn--primary btn--large" 
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="btn-icon">📁</span>
                <span className="btn-text">Upload Portfolio CSV</span>
              </button>
              <div className="empty-state__features">
                <div className="feature-item">
                  <span className="feature-icon">📊</span>
                  <span className="feature-text">Real-time Prices</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">📈</span>
                  <span className="feature-text">Interactive Charts</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">💎</span>
                  <span className="feature-text">Dividend Tracking</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">🔬</span>
                  <span className="feature-text">Fundamental Analysis</span>
                </div>
              </div>
              <div className="empty-state__format">
                <p className="format-title">Supported Formats:</p>
                <code className="format-code">✅ Revolut CSV Export (automatic detection)</code>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* VIEW TABS - Portfolio / Transactions */}
            <div className="view-tabs">
              <button 
                className={`view-tab ${viewMode === 'portfolio' ? 'active' : ''}`}
                onClick={() => setViewMode('portfolio')}
              >
                <span className="tab-icon">📊</span>
                <span className="tab-text">Portfolio</span>
                <span className="tab-badge">{portfolioData.length}</span>
              </button>
              <button 
                className={`view-tab ${viewMode === 'transactions' ? 'active' : ''}`}
                onClick={() => setViewMode('transactions')}
              >
                <span className="tab-icon">📜</span>
                <span className="tab-text">Transactions</span>
                <span className="tab-badge">{allTransactions.length}</span>
              </button>
            </div>

            {/* PORTFOLIO VIEW */}
            {viewMode === 'portfolio' && portfolioData.length > 0 && (
              <>
                {/* METRICS DASHBOARD */}
                {metrics && (
                  <div className="metrics-dashboard">
                    {/* Main Metrics Grid */}
                    <div className="metrics-grid">
                      <div className="metric-card metric-card--primary">
                        <div className="metric-card__header">
                          <span className="metric-card__icon">💰</span>
                          <span className="metric-card__label">Total Invested</span>
                        </div>
                        <div className="metric-card__value">
                          {formatCurrency(metrics.totalInvested)}
                        </div>
                      </div>

                      <div className="metric-card metric-card--primary">
                        <div className="metric-card__header">
                          <span className="metric-card__icon">📈</span>
                          <span className="metric-card__label">Current Value</span>
                        </div>
                        <div className="metric-card__value">
                          {formatCurrency(metrics.totalCurrent)}
                        </div>
                      </div>

                      <div className={`metric-card ${metrics.totalProfitLoss >= 0 ? 'metric-card--gain' : 'metric-card--loss'}`}>
                        <div className="metric-card__header">
                          <span className="metric-card__icon">
                            {metrics.totalProfitLoss >= 0 ? '💵' : '📉'}
                          </span>
                          <span className="metric-card__label">Total P/L</span>
                        </div>
                        <div className="metric-card__value">
                          {metrics.totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(metrics.totalProfitLoss)}
                        </div>
                        <div className="metric-card__percentage">
                          {metrics.totalProfitLossPercent >= 0 ? '+' : ''}{formatNumber(metrics.totalProfitLossPercent, 2)}%
                        </div>
                      </div>

                      <div className="metric-card metric-card--info">
                        <div className="metric-card__header">
                          <span className="metric-card__icon">📊</span>
                          <span className="metric-card__label">Portfolio Stats</span>
                        </div>
                        <div className="metric-card__stats">
                          <div className="stat-item stat-item--success">
                            <span className="stat-icon">🚀</span>
                            <span className="stat-text">{metrics.gainers} Gainers</span>
                          </div>
                          <div className="stat-item stat-item--danger">
                            <span className="stat-icon">📉</span>
                            <span className="stat-text">{metrics.losers} Losers</span>
                          </div>
                        </div>
                        {metrics.totalDividends > 0 && (
                          <div className="metric-card__dividend">
                            <span className="dividend-icon">💎</span>
                            <span className="dividend-text">
                              Annual: {formatCurrency(metrics.totalDividends)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Top Performers */}
                    {metrics.topGainer && metrics.topLoser && (
                      <div className="top-performers">
                        <div className="performer-card performer-card--gain">
                          <div className="performer-header">
                            <span className="performer-icon">🏆</span>
                            <span className="performer-title">Top Gainer</span>
                          </div>
                          <div className="performer-content">
                            <span className="performer-symbol">{metrics.topGainer.symbol}</span>
                            <span className="performer-change">
                              +{formatNumber(metrics.topGainer.profitLossPercent, 2)}%
                            </span>
                          </div>
                        </div>

                        <div className="performer-card performer-card--loss">
                          <div className="performer-header">
                            <span className="performer-icon">📉</span>
                            <span className="performer-title">Top Loser</span>
                          </div>
                          <div className="performer-content">
                            <span className="performer-symbol">{metrics.topLoser.symbol}</span>
                            <span className="performer-change">
                              {formatNumber(metrics.topLoser.profitLossPercent, 2)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* STOCKS GRID - Premium Cards with Fix Ticker Button */}
                <div className="stocks-grid">
                  {portfolioData.map((stock, index) => (
                    <div 
                      key={index} 
                      className="stock-card"
                      onClick={() => stock.currentPrice > 0 && setSelectedStock(stock)}
                      style={{ cursor: stock.currentPrice > 0 ? 'pointer' : 'default' }}
                    >
                      {/* Card Header */}
                      <div className="stock-card__header">
                        <div className="stock-card__symbol-group">
                          <span className="stock-card__symbol">{stock.symbol}</span>
                          {stock.fundamentals?.companyName && (
                            <span className="stock-card__company" title={stock.fundamentals.companyName}>
                              {stock.fundamentals.companyName.length > 20 
                                ? stock.fundamentals.companyName.substring(0, 20) + '...' 
                                : stock.fundamentals.companyName}
                            </span>
                          )}
                        </div>
                        <div className={`stock-card__badge ${stock.profitLoss >= 0 ? 'stock-card__badge--gain' : 'stock-card__badge--loss'}`}>
                          {stock.profitLoss >= 0 ? '📈' : '📉'} 
                          {stock.profitLoss >= 0 ? '+' : ''}{formatNumber(stock.profitLossPercent, 2)}%
                        </div>
                      </div>

                      {/* Current Price */}
                      <div className="stock-card__price-section">
                        <div className="price-label">Current Price</div>
                        <div className="price-value">
                          {stock.currentPrice > 0 ? (
                            <>
                              {formatCurrency(stock.currentPrice)}
                              <span className="price-live-indicator" title="Live Price">●</span>
                            </>
                          ) : (
                            <span style={{color: 'var(--color-error)'}}>No Data</span>
                          )}
                        </div>
                      </div>

                      {/* Mini Chart */}
                      {stock.historical && stock.historical.length > 0 && stock.currentPrice > 0 && (
                        <div className="stock-card__chart-container">
                          {renderMiniChart(stock.historical)}
                        </div>
                      )}

                      {/* Stock Details Grid */}
                      <div className="stock-card__details">
                        <div className="detail-row">
                          <span className="detail-label">Shares:</span>
                          <span className="detail-value">{formatNumber(stock.shares, 4)}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Avg Buy:</span>
                          <span className="detail-value">{formatCurrency(stock.buyPrice)}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Invested:</span>
                          <span className="detail-value">{formatCurrency(stock.totalCost)}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Value:</span>
                          <span className="detail-value">
                            {stock.currentPrice > 0 ? formatCurrency(stock.currentValue) : '-'}
                          </span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">P/L:</span>
                          <span className={`detail-value ${stock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                            {stock.currentPrice > 0 ? (
                              <>{stock.profitLoss >= 0 ? '+' : ''}{formatCurrency(stock.profitLoss)}</>
                            ) : '-'}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons - NEW: Shows Fix Ticker for missing prices */}
                      <div className="stock-card__actions">
                        {stock.currentPrice > 0 ? (
                          <>
                            <button 
                              className="action-btn action-btn--primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setChartStock(stock);
                                setShowChartModal(true);
                              }}
                            >
                              <span className="action-btn__icon">📈</span>
                              <span className="action-btn__text">Chart</span>
                            </button>
                            <button 
                              className="action-btn action-btn--secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStock(stock);
                              }}
                            >
                              <span className="action-btn__icon">🔬</span>
                              <span className="action-btn__text">Analysis</span>
                            </button>
                          </>
                        ) : (
                          <button 
                            className="action-btn action-btn--warning full-width"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTickerSearch(stock.symbol);
                            }}
                          >
                            <span className="action-btn__icon">🔧</span>
                            <span className="action-btn__text">Fix Ticker Symbol</span>
                          </button>
                        )}
                      </div>

                      {/* Dividend Badge */}
                      {stock.dividends && stock.dividends.annual > 0 && (
                        <div className="stock-card__dividend-badge">
                          <span className="dividend-badge__icon">💎</span>
                          <span className="dividend-badge__text">
                            {formatCurrency(stock.dividends.annual * stock.shares)}/year
                          </span>
                        </div>
                      )}

                      {/* Hover Overlay */}
                      {stock.currentPrice > 0 && (
                        <div className="stock-card__hover-overlay">
                          <span className="hover-text">Click for details</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* TRANSACTIONS VIEW */}
            {viewMode === 'transactions' && (
              <>
                {/* Transaction Filter */}
                <div className="transaction-filter">
                  <label className="filter-label">Filter by Type:</label>
                  <div className="filter-buttons">
                    {transactionTypes.map(type => {
                      const count = type === 'ALL' 
                        ? allTransactions.length 
                        : allTransactions.filter(tx => {
                            if (type === 'BUY') return tx.type.includes('BUY');
                            if (type === 'SELL') return tx.type.includes('SELL');
                            if (type === 'DIVIDEND') return tx.type.includes('DIVIDEND');
                            if (type === 'CASH') return tx.type.includes('CASH');
                            return false;
                          }).length;

                      return (
                        <button
                          key={type}
                          className={`filter-btn ${transactionFilter === type ? 'active' : ''}`}
                          onClick={() => setTransactionFilter(type)}
                        >
                          <span className="filter-btn__text">{type}</span>
                          <span className="filter-btn__badge">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Transactions Table */}
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
                      {filteredTransactions.map((tx, index) => {
                        const typeClass = tx.type.includes('BUY') ? 'buy' 
                          : tx.type.includes('SELL') ? 'sell'
                          : tx.type.includes('DIVIDEND') ? 'dividend'
                          : tx.type.includes('CASH') ? 'cash'
                          : 'other';

                        return (
                          <tr key={index} className={`transaction-row transaction-row--${typeClass}`}>
                            <td>{tx.date}</td>
                            <td className="ticker-cell">
                              <span className="ticker-badge">{tx.ticker}</span>
                            </td>
                            <td>
                              <span className={`type-badge type-badge--${typeClass}`}>
                                {tx.type}
                              </span>
                            </td>
                            <td className="quantity-cell">
                              {tx.quantity !== 0 ? formatNumber(tx.quantity, 4) : '-'}
                            </td>
                            <td className="price-cell">
                              {tx.price > 0 ? formatCurrency(tx.price) : '-'}
                            </td>
                            <td className={`amount-cell ${tx.totalAmount >= 0 ? 'positive' : 'negative'}`}>
                              {tx.totalAmount >= 0 ? '+' : ''}{formatCurrency(tx.totalAmount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {filteredTransactions.length === 0 && (
                    <div className="empty-transactions">
                      <p>No transactions found for this filter.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* TICKER FIXER MODAL - NEW */}
      {showTickerFixer && tickerToFix && (
        <div className="modal-overlay" onClick={() => setShowTickerFixer(false)}>
          <div className="modal-content ticker-fixer-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowTickerFixer(false)}>×</button>
            
            <div className="modal-header">
              <div className="modal-header__main">
                <h2 className="modal-symbol">🔧 Fix Ticker: {tickerToFix}</h2>
                <p className="modal-company">Search for the correct symbol in the API</p>
              </div>
            </div>

            <div className="modal-body">
              {/* Search Box */}
              <div className="ticker-search-box">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search company name or symbol..."
                  value={tickerSearchQuery}
                  onChange={(e) => setTickerSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && performCustomSearch()}
                />
                <button 
                  className="btn btn--primary"
                  onClick={performCustomSearch}
                  disabled={isLoading}
                >
                  🔍 Search
                </button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="ticker-search-results">
                  <h3 className="results-title">Found {searchResults.length} Results:</h3>
                  <div className="results-list">
                    {searchResults.map((result, index) => (
                      <div 
                        key={index} 
                        className="result-item"
                        onClick={() => applyTickerFix(tickerToFix, result.symbol)}
                      >
                        <div className="result-item__main">
                          <span className="result-symbol">{result.symbol}</span>
                          <span className="result-name">{result.name}</span>
                        </div>
                        <div className="result-item__meta">
                          <span className="result-exchange">{result.exchange}</span>
                          {result.currency && (
                            <span className="result-currency">{result.currency}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.length === 0 && tickerSearchQuery && (
                <div className="ticker-search-empty">
                  <p>No results found. Try a different search term.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STOCK DETAIL MODAL */}
      {selectedStock && (
        <div className="modal-overlay" onClick={() => setSelectedStock(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedStock(null)}>×</button>
            
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-header__main">
                <h2 className="modal-symbol">{selectedStock.symbol}</h2>
                {selectedStock.fundamentals?.companyName && (
                  <p className="modal-company">{selectedStock.fundamentals.companyName}</p>
                )}
              </div>
              <div className="modal-header__price">
                <div className="modal-price">{formatCurrency(selectedStock.currentPrice)}</div>
                <div className={`modal-change ${selectedStock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                  {selectedStock.profitLoss >= 0 ? '+' : ''}{formatNumber(selectedStock.profitLossPercent, 2)}%
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {/* Holdings Section */}
              <div className="modal-section">
                <h3 className="modal-section__title">
                  <span className="section-icon">📊</span>
                  Your Holdings
                </h3>
                <div className="modal-grid">
                  <div className="modal-data-item">
                    <span className="data-label">Shares Owned</span>
                    <span className="data-value">{formatNumber(selectedStock.shares, 4)}</span>
                  </div>
                  <div className="modal-data-item">
                    <span className="data-label">Average Buy Price</span>
                    <span className="data-value">{formatCurrency(selectedStock.buyPrice)}</span>
                  </div>
                  <div className="modal-data-item">
                    <span className="data-label">Total Invested</span>
                    <span className="data-value">{formatCurrency(selectedStock.totalCost)}</span>
                  </div>
                  <div className="modal-data-item">
                    <span className="data-label">Current Value</span>
                    <span className="data-value">{formatCurrency(selectedStock.currentValue)}</span>
                  </div>
                  <div className="modal-data-item modal-data-item--highlight">
                    <span className="data-label">Profit/Loss</span>
                    <span className={`data-value ${selectedStock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                      {selectedStock.profitLoss >= 0 ? '+' : ''}{formatCurrency(selectedStock.profitLoss)}
                    </span>
                  </div>
                  <div className="modal-data-item modal-data-item--highlight">
                    <span className="data-label">Return %</span>
                    <span className={`data-value ${selectedStock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                      {selectedStock.profitLoss >= 0 ? '+' : ''}{formatNumber(selectedStock.profitLossPercent, 2)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Fundamentals Section */}
              {selectedStock.fundamentals && (
                <div className="modal-section">
                  <h3 className="modal-section__title">
                    <span className="section-icon">🔬</span>
                    Fundamental Analysis
                  </h3>
                  <div className="modal-grid">
                    {selectedStock.fundamentals.marketCap && (
                      <div className="modal-data-item">
                        <span className="data-label">Market Cap</span>
                        <span className="data-value">{formatMarketCap(selectedStock.fundamentals.marketCap)}</span>
                      </div>
                    )}
                    {selectedStock.fundamentals.peRatio && selectedStock.fundamentals.peRatio > 0 && (
                      <div className="modal-data-item">
                        <span className="data-label">P/E Ratio</span>
                        <span className="data-value">{formatNumber(selectedStock.fundamentals.peRatio, 2)}</span>
                      </div>
                    )}
                    {selectedStock.fundamentals.eps && (
                      <div className="modal-data-item">
                        <span className="data-label">EPS</span>
                        <span className="data-value">{formatCurrency(selectedStock.fundamentals.eps)}</span>
                      </div>
                    )}
                    {selectedStock.fundamentals.beta && (
                      <div className="modal-data-item">
                        <span className="data-label">Beta</span>
                        <span className="data-value">{formatNumber(selectedStock.fundamentals.beta, 2)}</span>
                      </div>
                    )}
                    {selectedStock.fundamentals.sector && (
                      <div className="modal-data-item">
                        <span className="data-label">Sector</span>
                        <span className="data-value">{selectedStock.fundamentals.sector}</span>
                      </div>
                    )}
                    {selectedStock.fundamentals.industry && (
                      <div className="modal-data-item">
                        <span className="data-label">Industry</span>
                        <span className="data-value">{selectedStock.fundamentals.industry}</span>
                      </div>
                    )}
                  </div>
                  {selectedStock.fundamentals.description && (
                    <div className="company-description">
                      <strong>About:</strong>
                      <p>{selectedStock.fundamentals.description.substring(0, 250)}...</p>
                    </div>
                  )}
                </div>
              )}

              {/* Dividend Information */}
              {selectedStock.dividends && selectedStock.dividends.annual > 0 && (
                <div className="modal-section">
                  <h3 className="modal-section__title">
                    <span className="section-icon">💎</span>
                    Dividend Information
                  </h3>
                  <div className="modal-grid">
                    <div className="modal-data-item">
                      <span className="data-label">Annual Dividend</span>
                      <span className="data-value">{formatCurrency(selectedStock.dividends.annual)}</span>
                    </div>
                    <div className="modal-data-item">
                      <span className="data-label">Dividend Yield</span>
                      <span className="data-value positive">
                        {formatNumber((selectedStock.dividends.annual / selectedStock.currentPrice) * 100, 2)}%
                      </span>
                    </div>
                    {selectedStock.dividends.paymentDate && (
                      <div className="modal-data-item">
                        <span className="data-label">Last Payment</span>
                        <span className="data-value">{selectedStock.dividends.paymentDate}</span>
                      </div>
                    )}
                    <div className="modal-data-item modal-data-item--highlight">
                      <span className="data-label">Your Annual Income</span>
                      <span className="data-value positive">
                        {formatCurrency(selectedStock.dividends.annual * selectedStock.shares)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Historical Chart */}
              {selectedStock.historical && selectedStock.historical.length > 0 && (
                <div className="modal-section">
                  <h3 className="modal-section__title">
                    <span className="section-icon">📈</span>
                    Price History (90 Days)
                  </h3>
                  <div className="large-chart-container">
                    <svg viewBox="0 0 600 200" className="large-chart">
                      <defs>
                        <linearGradient id={`gradient-${selectedStock.symbol}`} x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor={selectedStock.profitLoss >= 0 ? 'var(--color-success)' : 'var(--color-error)'} stopOpacity="0.4"/>
                          <stop offset="100%" stopColor={selectedStock.profitLoss >= 0 ? 'var(--color-success)' : 'var(--color-error)'} stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      {(() => {
                        const data = selectedStock.historical;
                        const max = Math.max(...data.map(d => d.value));
                        const min = Math.min(...data.map(d => d.value));
                        const range = max - min;
                        
                        if (range === 0) return null;
                        
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
                              stroke={selectedStock.profitLoss >= 0 ? 'var(--color-success)' : 'var(--color-error)'}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </>
                        );
                      })()}
                    </svg>
                    <div className="chart-stats">
                      <div className="chart-stat">
                        <span className="chart-stat__label">Period Change:</span>
                        <span className={`chart-stat__value ${selectedStock.historical[selectedStock.historical.length - 1].value > selectedStock.historical[0].value ? 'positive' : 'negative'}`}>
                          {((selectedStock.historical[selectedStock.historical.length - 1].value - selectedStock.historical[0].value) / selectedStock.historical[0].value * 100).toFixed(2)}%
                        </span>
                      </div>
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
