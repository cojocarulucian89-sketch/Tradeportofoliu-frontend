import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  // ============================================
  // STATE MANAGEMENT
  // ============================================
  
  // Portfolio Data
  const [portfolioData, setPortfolioData] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  
  // View State
  const [viewMode, setViewMode] = useState('dashboard'); // dashboard, portfolio, transactions, projections
  const [transactionFilter, setTransactionFilter] = useState('ALL');
  
  // Projection Settings (CORE FEATURES)
  const [projectionSettings, setProjectionSettings] = useState({
    monthlyInvestment: 500,
    targetAnnualDividend: 3000,
    investmentHorizon: 5,
    targetDividendYield: 4.0,
    conservativeGrowth: 3,
    targetGrowth: 5,
    optimisticGrowth: 8
  });
  
  // Projection Results
  const [projectionResults, setProjectionResults] = useState(null);
  const [aiRecommendations, setAiRecommendations] = useState([]);
  
  // UI State
  const [showSettings, setShowSettings] = useState(true);
  const [selectedStock, setSelectedStock] = useState(null);
  const fileInputRef = useRef(null);
  
  const transactionTypes = ['ALL', 'BUY', 'SELL', 'DIVIDEND', 'CASH'];

  // ============================================
  // LOAD FROM LOCALSTORAGE ON MOUNT
  // ============================================
  useEffect(() => {
    const savedPortfolio = localStorage.getItem('portfolioData');
    const savedTransactions = localStorage.getItem('allTransactions');
    const savedSettings = localStorage.getItem('projectionSettings');
    
    if (savedPortfolio) {
      setPortfolioData(JSON.parse(savedPortfolio));
    }
    if (savedTransactions) {
      setAllTransactions(JSON.parse(savedTransactions));
    }
    if (savedSettings) {
      setProjectionSettings(JSON.parse(savedSettings));
    }
  }, []);

  // ============================================
  // SAVE TO LOCALSTORAGE WHEN DATA CHANGES
  // ============================================
  useEffect(() => {
    if (portfolioData.length > 0) {
      localStorage.setItem('portfolioData', JSON.stringify(portfolioData));
    }
  }, [portfolioData]);

  useEffect(() => {
    if (allTransactions.length > 0) {
      localStorage.setItem('allTransactions', JSON.stringify(allTransactions));
    }
  }, [allTransactions]);

  useEffect(() => {
    localStorage.setItem('projectionSettings', JSON.stringify(projectionSettings));
  }, [projectionSettings]);

  // ============================================
  // CSV PARSING & PROCESSING
  // ============================================
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    setIsLoading(true);
    setUploadStatus('Reading CSV file...');

    try {
      const text = await file.text();
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);
      
      if (lines.length === 0) {
        throw new Error('CSV file is empty');
      }

      setUploadStatus('Parsing data...');
      
      // Parse header
      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      // Find column indices
      const dateIdx = header.findIndex(h => h.toLowerCase().includes('date'));
      const tickerIdx = header.findIndex(h => h.toLowerCase().includes('ticker'));
      const typeIdx = header.findIndex(h => h.toLowerCase().includes('type'));
      const qtyIdx = header.findIndex(h => h.toLowerCase().includes('quantity') || h.toLowerCase().includes('no. of shares'));
      const priceIdx = header.findIndex(h => h.toLowerCase().includes('price per share'));
      const totalIdx = header.findIndex(h => h.toLowerCase().includes('total amount'));

      if (dateIdx === -1 || tickerIdx === -1 || typeIdx === -1) {
        throw new Error('Invalid CSV format. Required columns: Date, Ticker, Type');
      }

      // Parse transactions
      const transactions = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        
        const date = values[dateIdx] || '';
        const ticker = values[tickerIdx] || '';
        const type = values[typeIdx] || '';
        const quantity = qtyIdx !== -1 ? parseFloat(values[qtyIdx]) || 0 : 0;
        const price = priceIdx !== -1 ? parseFloat(values[priceIdx]) || 0 : 0;
        const totalAmount = totalIdx !== -1 ? parseFloat(values[totalIdx]) || 0 : 0;

        if (ticker && type) {
          transactions.push({
            date,
            ticker,
            type,
            quantity,
            price,
            totalAmount
          });
        }
      }

      setAllTransactions(transactions);
      setUploadStatus('Building portfolio...');

      // Build portfolio from transactions
      const portfolioMap = new Map();

      transactions.forEach(tx => {
        if (tx.type.includes('BUY') || tx.type.includes('SELL')) {
          if (!portfolioMap.has(tx.ticker)) {
            portfolioMap.set(tx.ticker, {
              symbol: tx.ticker,
              shares: 0,
              totalCost: 0,
              buyPrice: 0,
              transactions: []
            });
          }

          const holding = portfolioMap.get(tx.ticker);
          holding.transactions.push(tx);

          if (tx.type.includes('BUY')) {
            holding.shares += tx.quantity;
            holding.totalCost += Math.abs(tx.totalAmount);
          } else if (tx.type.includes('SELL')) {
            holding.shares -= tx.quantity;
            holding.totalCost -= Math.abs(tx.totalAmount);
          }
        }
      });

      // Calculate average buy price
      const portfolio = Array.from(portfolioMap.values())
        .filter(holding => holding.shares > 0)
        .map(holding => ({
          ...holding,
          buyPrice: holding.totalCost / holding.shares,
          currentPrice: 0, // Will be fetched
          currentValue: 0,
          profitLoss: 0,
          profitLossPercent: 0,
          dividends: null
        }));

      setPortfolioData(portfolio);
      setUploadStatus('Fetching live prices...');
      
      // Fetch live prices
      await fetchLivePrices(portfolio);
      
      setUploadStatus('Portfolio loaded successfully!');
      setTimeout(() => {
        setIsLoading(false);
        setUploadStatus('');
      }, 1500);

    } catch (error) {
      console.error('CSV parsing error:', error);
      alert(`Error parsing CSV: ${error.message}`);
      setIsLoading(false);
      setUploadStatus('');
    }
  };

  // ============================================
  // FETCH LIVE PRICES (Yahoo Finance API - FREE)
  // ============================================
  const fetchLivePrices = async (portfolio) => {
    const updatedPortfolio = await Promise.all(
      portfolio.map(async (stock) => {
        try {
          // Yahoo Finance API (public endpoint, no key needed)
          const response = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?interval=1d&range=1d`
          );
          
          if (!response.ok) throw new Error('API failed');
          
          const data = await response.json();
          const quote = data.chart.result[0];
          const currentPrice = quote.meta.regularMarketPrice || 0;
          
          // Calculate metrics
          const currentValue = currentPrice * stock.shares;
          const profitLoss = currentValue - stock.totalCost;
          const profitLossPercent = (profitLoss / stock.totalCost) * 100;

          // Try to get dividend info
          let dividends = null;
          try {
            const divResponse = await fetch(
              `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?interval=3mo&range=1y&events=div`
            );
            if (divResponse.ok) {
              const divData = await divResponse.json();
              const events = divData.chart.result[0]?.events?.dividends;
              if (events) {
                const divArray = Object.values(events);
                const annualDiv = divArray.reduce((sum, d) => sum + d.amount, 0);
                dividends = {
                  annual: annualDiv,
                  quarterly: annualDiv / 4,
                  paymentDate: divArray[0]?.date ? new Date(divArray[0].date * 1000).toLocaleDateString() : null
                };
              }
            }
          } catch (e) {
            console.log(`No dividend data for ${stock.symbol}`);
          }

          return {
            ...stock,
            currentPrice,
            currentValue,
            profitLoss,
            profitLossPercent,
            dividends
          };
        } catch (error) {
          console.error(`Error fetching ${stock.symbol}:`, error);
          return stock;
        }
      })
    );

    setPortfolioData(updatedPortfolio);
  };

  // ============================================
  // REFRESH PRICES FUNCTION
  // ============================================
  const refreshPrices = async () => {
    if (portfolioData.length === 0) return;
    
    setIsLoading(true);
    setUploadStatus('Refreshing prices...');
    
    await fetchLivePrices(portfolioData);
    
    setTimeout(() => {
      setIsLoading(false);
      setUploadStatus('');
    }, 1000);
  };

  // ============================================
  // CALCULATE PORTFOLIO METRICS
  // ============================================
  const calculateMetrics = () => {
    if (portfolioData.length === 0) return null;

    const totalInvested = portfolioData.reduce((sum, stock) => sum + stock.totalCost, 0);
    const totalCurrent = portfolioData.reduce((sum, stock) => sum + stock.currentValue, 0);
    const totalProfitLoss = totalCurrent - totalInvested;
    const totalProfitLossPercent = (totalProfitLoss / totalInvested) * 100;
    
    const gainers = portfolioData.filter(s => s.profitLoss > 0).length;
    const losers = portfolioData.filter(s => s.profitLoss < 0).length;
    
    const totalAnnualDividends = portfolioData.reduce((sum, stock) => {
      return sum + (stock.dividends?.annual || 0) * stock.shares;
    }, 0);
    
    const averageYield = totalCurrent > 0 ? (totalAnnualDividends / totalCurrent) * 100 : 0;

    return {
      totalInvested,
      totalCurrent,
      totalProfitLoss,
      totalProfitLossPercent,
      gainers,
      losers,
      totalAnnualDividends,
      averageYield
    };
  };

  const metrics = calculateMetrics();
  // ============================================
  // PROJECTION CALCULATOR - CORE FEATURE
  // ============================================
  const calculateProjections = () => {
    if (!metrics) return;

    const {
      monthlyInvestment,
      targetAnnualDividend,
      investmentHorizon,
      targetDividendYield,
      conservativeGrowth,
      targetGrowth,
      optimisticGrowth
    } = projectionSettings;

    const currentPortfolioValue = metrics.totalCurrent;
    const currentAnnualDividends = metrics.totalAnnualDividends;

    // Calculate 3 scenarios
    const scenarios = ['conservative', 'target', 'optimistic'].map(scenarioName => {
      const growthRate = scenarioName === 'conservative' ? conservativeGrowth :
                         scenarioName === 'target' ? targetGrowth : optimisticGrowth;
      
      const yearlyData = [];
      let portfolioValue = currentPortfolioValue;
      let annualDividends = currentAnnualDividends;

      for (let year = 1; year <= investmentHorizon; year++) {
        // Add monthly investments for the year
        const yearlyInvestment = monthlyInvestment * 12;
        portfolioValue += yearlyInvestment;
        
        // Apply growth rate
        portfolioValue *= (1 + growthRate / 100);
        
        // Calculate dividends based on target yield
        annualDividends = portfolioValue * (targetDividendYield / 100);
        
        yearlyData.push({
          year,
          portfolioValue: Math.round(portfolioValue),
          annualDividends: Math.round(annualDividends),
          monthlyDividends: Math.round(annualDividends / 12),
          totalInvested: Math.round(currentPortfolioValue + (yearlyInvestment * year))
        });
      }

      return {
        name: scenarioName,
        growthRate,
        yearlyData
      };
    });

    // Calculate time to goal
    const portfolioNeededForGoal = targetAnnualDividend / (targetDividendYield / 100);
    const targetScenario = scenarios.find(s => s.name === 'target');
    const finalPortfolioValue = targetScenario.yearlyData[targetScenario.yearlyData.length - 1].portfolioValue;
    
    let yearsToGoal = investmentHorizon;
    let goalReached = false;
    
    if (finalPortfolioValue >= portfolioNeededForGoal) {
      // Find exact year goal is reached
      for (let i = 0; i < targetScenario.yearlyData.length; i++) {
        if (targetScenario.yearlyData[i].portfolioValue >= portfolioNeededForGoal) {
          yearsToGoal = i + 1;
          goalReached = true;
          break;
        }
      }
    } else {
      // Calculate additional years needed
      let tempPortfolio = finalPortfolioValue;
      const yearlyInvestment = monthlyInvestment * 12;
      let additionalYears = 0;
      
      while (tempPortfolio < portfolioNeededForGoal && additionalYears < 50) {
        tempPortfolio += yearlyInvestment;
        tempPortfolio *= (1 + targetGrowth / 100);
        additionalYears++;
      }
      
      yearsToGoal = investmentHorizon + additionalYears;
    }

    const results = {
      scenarios,
      portfolioNeededForGoal: Math.round(portfolioNeededForGoal),
      yearsToGoal,
      goalReached,
      gap: Math.round(portfolioNeededForGoal - finalPortfolioValue)
    };

    setProjectionResults(results);
    generateAIRecommendations(results);
  };

  // ============================================
  // AI RECOMMENDATIONS ENGINE
  // ============================================
  const generateAIRecommendations = (results) => {
    const recommendations = [];
    const { monthlyInvestment, targetAnnualDividend, targetDividendYield } = projectionSettings;
    const currentYield = metrics?.averageYield || 0;

    // Recommendation 1: Time to Goal Analysis
    if (results.goalReached) {
      recommendations.push({
        id: 1,
        type: 'success',
        icon: '🎯',
        title: 'Goal Achievement Timeline',
        message: `Great news! You're on track to reach your €${targetAnnualDividend}/year dividend goal in ${results.yearsToGoal} years with your current ${monthlyInvestment}€/month investment plan.`,
        priority: 'high'
      });
    } else {
      const increaseNeeded = Math.round(results.gap / (projectionSettings.investmentHorizon * 12));
      recommendations.push({
        id: 1,
        type: 'warning',
        icon: '⚠️',
        title: 'Goal Gap Detected',
        message: `You're ${results.gap}€ short of your goal. Consider increasing monthly investment by €${increaseNeeded} to reach your target in ${projectionSettings.investmentHorizon} years.`,
        action: `Increase to €${monthlyInvestment + increaseNeeded}/month`,
        priority: 'high'
      });
    }

    // Recommendation 2: Dividend Yield Optimization
    if (currentYield < targetDividendYield) {
      recommendations.push({
        id: 2,
        type: 'info',
        icon: '📊',
        title: 'Dividend Yield Optimization',
        message: `Your current portfolio yield (${currentYield.toFixed(2)}%) is below target (${targetDividendYield}%). Consider rebalancing towards higher-yield dividend stocks.`,
        action: 'Focus on stocks with 4-6% yield',
        priority: 'medium'
      });
    } else {
      recommendations.push({
        id: 2,
        type: 'success',
        icon: '💎',
        title: 'Strong Dividend Portfolio',
        message: `Your portfolio yield (${currentYield.toFixed(2)}%) exceeds your target (${targetDividendYield}%). Excellent dividend selection!`,
        priority: 'low'
      });
    }

    // Recommendation 3: Diversification Analysis
    if (portfolioData.length < 10) {
      recommendations.push({
        id: 3,
        type: 'warning',
        icon: '🔀',
        title: 'Diversification Opportunity',
        message: `With ${portfolioData.length} holdings, consider adding 5-10 more quality dividend stocks to reduce concentration risk.`,
        action: 'Target 15-20 holdings for optimal diversification',
        priority: 'medium'
      });
    }

    // Recommendation 4: Growth vs Income Balance
    const conservativeEnd = results.scenarios[0].yearlyData[results.scenarios[0].yearlyData.length - 1];
    const optimisticEnd = results.scenarios[2].yearlyData[results.scenarios[2].yearlyData.length - 1];
    const potentialRange = optimisticEnd.portfolioValue - conservativeEnd.portfolioValue;

    recommendations.push({
      id: 4,
      type: 'info',
      icon: '📈',
      title: 'Growth Scenario Analysis',
      message: `Your portfolio could range from €${conservativeEnd.portfolioValue.toLocaleString()} (conservative) to €${optimisticEnd.portfolioValue.toLocaleString()} (optimistic) in ${projectionSettings.investmentHorizon} years.`,
      action: `Potential range: €${potentialRange.toLocaleString()}`,
      priority: 'low'
    });

    // Recommendation 5: Reinvestment Strategy
    const monthlyDividends = Math.round(metrics.totalAnnualDividends / 12);
    if (monthlyDividends > 100) {
      recommendations.push({
        id: 5,
        type: 'success',
        icon: '🔄',
        title: 'Dividend Reinvestment Opportunity',
        message: `You're earning €${monthlyDividends}/month in dividends. Reinvesting these can significantly accelerate growth through compounding.`,
        action: 'Enable DRIP (Dividend Reinvestment Plan)',
        priority: 'high'
      });
    }

    // Recommendation 6: Risk Assessment
    const profitLossPercent = metrics?.totalProfitLossPercent || 0;
    if (Math.abs(profitLossPercent) > 20) {
      recommendations.push({
        id: 6,
        type: 'warning',
        icon: '⚡',
        title: 'Portfolio Volatility Alert',
        message: `Your portfolio has ${profitLossPercent > 0 ? 'gained' : 'lost'} ${Math.abs(profitLossPercent).toFixed(1)}%. High volatility detected.`,
        action: 'Consider adding defensive dividend aristocrats',
        priority: 'medium'
      });
    }

    // Sort by priority
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    setAiRecommendations(recommendations);
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value, decimals = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  };

  const getFilteredTransactions = () => {
    if (transactionFilter === 'ALL') return allTransactions;
    
    return allTransactions.filter(tx => {
      if (transactionFilter === 'BUY') return tx.type.includes('BUY');
      if (transactionFilter === 'SELL') return tx.type.includes('SELL');
      if (transactionFilter === 'DIVIDEND') return tx.type.includes('DIVIDEND');
      if (transactionFilter === 'CASH') return tx.type.includes('CASH') || tx.type.includes('TOP-UP');
      return false;
    });
  };

  const filteredTransactions = getFilteredTransactions();

  // ============================================
  // UPDATE PROJECTION SETTINGS
  // ============================================
  const updateSetting = (key, value) => {
    setProjectionSettings(prev => ({
      ...prev,
      [key]: parseFloat(value) || 0
    }));
  };

  // ============================================
  // AUTO-CALCULATE PROJECTIONS WHEN SETTINGS CHANGE
  // ============================================
  useEffect(() => {
    if (metrics && portfolioData.length > 0) {
      calculateProjections();
    }
  }, [projectionSettings, portfolioData]);

  // ============================================
  // RENDER JSX STARTS HERE (PARTEA 3)
  // ============================================
  return (
    <div className="App">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <div className="loading-text">{uploadStatus}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="header">
        <div className="header__content">
          <div className="header__brand">
            <span className="brand-icon">💎</span>
            <div className="brand-text">
              <h1 className="brand-title">Dividend Planner Pro</h1>
              <p className="brand-subtitle">Your Financial Freedom Journey</p>
            </div>
          </div>
          
          <div className="header__actions">
            {portfolioData.length > 0 && (
              <button 
                className="btn btn--secondary btn--sm"
                onClick={refreshPrices}
                disabled={isLoading}
              >
                <span className="btn-icon">🔄</span>
                <span className="btn-text">Refresh Prices</span>
              </button>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            
            <button 
              className="btn btn--primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="btn-icon">📤</span>
              <span className="btn-text">Upload CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {portfolioData.length === 0 ? (
          /* Empty State */
          <div className="empty-state">
            <div className="empty-state__content">
              <div className="empty-state__icon-wrapper">
                <div className="empty-state__icon-bg"></div>
                <span className="empty-state__icon">📊</span>
              </div>
              
              <h2 className="empty-state__title">Start Your Dividend Journey</h2>
              <p className="empty-state__description">
                Upload your Revolut CSV to track your dividend portfolio, 
                calculate future projections, and receive AI-powered recommendations.
              </p>

              <div className="empty-state__features">
                <div className="feature-item">
                  <span className="feature-icon">💰</span>
                  <span className="feature-text">Monthly Investment Planning</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">📈</span>
                  <span className="feature-text">3 Growth Scenarios</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">🎯</span>
                  <span className="feature-text">Goal Tracking</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">🤖</span>
                  <span className="feature-text">AI Recommendations</span>
                </div>
              </div>

              <button 
                className="btn btn--primary btn--large"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="btn-icon">📤</span>
                <span className="btn-text">Upload Revolut CSV</span>
              </button>

              <div className="empty-state__format">
                <p className="format-title">Expected CSV Format:</p>
                <code className="format-code">
                  Date, Ticker, Type, Quantity, Price per share, Total amount
                </code>
              </div>
            </div>
          </div>
        ) : (
          /* Portfolio Content - PARTEA 3 */
          <>
            {/* View Navigation Tabs */}
            <div className="view-tabs">
              <button 
                className={`view-tab ${viewMode === 'dashboard' ? 'active' : ''}`}
                onClick={() => setViewMode('dashboard')}
              >
                <span className="tab-icon">📊</span>
                <span>Dashboard</span>
              </button>
              
              <button 
                className={`view-tab ${viewMode === 'portfolio' ? 'active' : ''}`}
                onClick={() => setViewMode('portfolio')}
              >
                <span className="tab-icon">💼</span>
                <span>Portfolio</span>
                <span className="tab-badge">{portfolioData.length}</span>
              </button>
              
              <button 
                className={`view-tab ${viewMode === 'transactions' ? 'active' : ''}`}
                onClick={() => setViewMode('transactions')}
              >
                <span className="tab-icon">📝</span>
                <span>Transactions</span>
                <span className="tab-badge">{allTransactions.length}</span>
              </button>
              
              <button 
                className={`view-tab ${viewMode === 'projections' ? 'active' : ''}`}
                onClick={() => setViewMode('projections')}
              >
                <span className="tab-icon">🎯</span>
                <span>Projections</span>
              </button>
            </div>

            {/* Layout: Settings Sidebar + Main View */}
            <div style={{ display: 'flex', gap: '24px', marginTop: '24px' }}>
              {/* Settings Sidebar (Always visible when portfolio loaded) */}
              {showSettings && (
                <div className="settings-panel">
                  <div className="settings-panel__header">
                    <h3 className="settings-title">
                      <span className="settings-icon">⚙️</span>
                      Projection Settings
                    </h3>
                    <button 
                      className="settings-toggle"
                      onClick={() => setShowSettings(false)}
                    >
                      ←
                    </button>
                  </div>

                  <div className="settings-panel__content">
                    {/* Monthly Investment */}
                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="label-icon">💰</span>
                        Monthly Investment
                      </label>
                      <div className="input-with-unit">
                        <input
                          type="number"
                          className="setting-input"
                          value={projectionSettings.monthlyInvestment}
                          onChange={(e) => updateSetting('monthlyInvestment', e.target.value)}
                          min="0"
                          step="50"
                        />
                        <span className="input-unit">€</span>
                      </div>
                    </div>

                    {/* Target Annual Dividend */}
                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="label-icon">🎯</span>
                        Target Annual Dividend
                      </label>
                      <div className="input-with-unit">
                        <input
                          type="number"
                          className="setting-input"
                          value={projectionSettings.targetAnnualDividend}
                          onChange={(e) => updateSetting('targetAnnualDividend', e.target.value)}
                          min="0"
                          step="100"
                        />
                        <span className="input-unit">€/year</span>
                      </div>
                    </div>

                    {/* Investment Horizon */}
                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="label-icon">📅</span>
                        Investment Horizon
                      </label>
                      <div className="input-with-unit">
                        <input
                          type="number"
                          className="setting-input"
                          value={projectionSettings.investmentHorizon}
                          onChange={(e) => updateSetting('investmentHorizon', e.target.value)}
                          min="1"
                          max="30"
                        />
                        <span className="input-unit">years</span>
                      </div>
                    </div>

                    {/* Target Dividend Yield */}
                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="label-icon">📈</span>
                        Target Dividend Yield
                      </label>
                      <div className="input-with-unit">
                        <input
                          type="number"
                          className="setting-input"
                          value={projectionSettings.targetDividendYield}
                          onChange={(e) => updateSetting('targetDividendYield', e.target.value)}
                          min="0"
                          max="15"
                          step="0.1"
                        />
                        <span className="input-unit">%</span>
                      </div>
                    </div>

                    <div className="settings-divider"></div>

                    {/* Growth Scenarios */}
                    <h4 className="settings-subtitle">Growth Scenarios</h4>

                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="label-icon">🐢</span>
                        Conservative Growth
                      </label>
                      <div className="input-with-unit">
                        <input
                          type="number"
                          className="setting-input"
                          value={projectionSettings.conservativeGrowth}
                          onChange={(e) => updateSetting('conservativeGrowth', e.target.value)}
                          min="0"
                          max="15"
                          step="0.5"
                        />
                        <span className="input-unit">%</span>
                      </div>
                    </div>

                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="label-icon">🎯</span>
                        Target Growth
                      </label>
                      <div className="input-with-unit">
                        <input
                          type="number"
                          className="setting-input"
                          value={projectionSettings.targetGrowth}
                          onChange={(e) => updateSetting('targetGrowth', e.target.value)}
                          min="0"
                          max="20"
                          step="0.5"
                        />
                        <span className="input-unit">%</span>
                      </div>
                    </div>

                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="label-icon">🚀</span>
                        Optimistic Growth
                      </label>
                      <div className="input-with-unit">
                        <input
                          type="number"
                          className="setting-input"
                          value={projectionSettings.optimisticGrowth}
                          onChange={(e) => updateSetting('optimisticGrowth', e.target.value)}
                          min="0"
                          max="25"
                          step="0.5"
                        />
                        <span className="input-unit">%</span>
                      </div>
                    </div>

                    <button 
                      className="btn btn--primary btn--full-width"
                      onClick={calculateProjections}
                      style={{ marginTop: '24px' }}
                    >
                      <span className="btn-icon">🔮</span>
                      <span className="btn-text">Calculate Projections</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Show Settings Button (when sidebar hidden) */}
              {!showSettings && (
                <button 
                  className="show-settings-btn"
                  onClick={() => setShowSettings(true)}
                >
                  <span>⚙️</span>
                  <span>Settings</span>
                </button>
              )}

              {/* Main View Content */}
              <div style={{ flex: 1 }}>
                {/* DASHBOARD VIEW */}
                {viewMode === 'dashboard' && metrics && (
                  <div className="dashboard-view">
                    {/* Portfolio Metrics Cards */}
                    <div className="metrics-grid">
                      <div className="metric-card">
                        <div className="metric-card__header">
                          <span className="metric-card__icon">💼</span>
                          <span className="metric-card__label">Total Invested</span>
                        </div>
                        <div className="metric-card__value">
                          {formatCurrency(metrics.totalInvested)}
                        </div>
                      </div>

                      <div className="metric-card">
                        <div className="metric-card__header">
                          <span className="metric-card__icon">💰</span>
                          <span className="metric-card__label">Current Value</span>
                        </div>
                        <div className="metric-card__value">
                          {formatCurrency(metrics.totalCurrent)}
                        </div>
                      </div>

                      <div className={`metric-card ${metrics.totalProfitLoss >= 0 ? 'metric-card--gain' : 'metric-card--loss'}`}>
                        <div className="metric-card__header">
                          <span className="metric-card__icon">
                            {metrics.totalProfitLoss >= 0 ? '📈' : '📉'}
                          </span>
                          <span className="metric-card__label">Profit/Loss</span>
                        </div>
                        <div className="metric-card__value">
                          {formatCurrency(metrics.totalProfitLoss)}
                        </div>
                        <div className="metric-card__percentage">
                          {metrics.totalProfitLoss >= 0 ? '+' : ''}{formatNumber(metrics.totalProfitLossPercent)}%
                        </div>
                      </div>

                      <div className="metric-card metric-card--gain">
                        <div className="metric-card__header">
                          <span className="metric-card__icon">💎</span>
                          <span className="metric-card__label">Annual Dividends</span>
                        </div>
                        <div className="metric-card__value">
                          {formatCurrency(metrics.totalAnnualDividends)}
                        </div>
                        <div className="metric-card__dividend">
                          <span className="dividend-icon">📅</span>
                          <span className="dividend-text">
                            {formatCurrency(metrics.totalAnnualDividends / 12)}/month
                          </span>
                        </div>
                      </div>

                      <div className="metric-card">
                        <div className="metric-card__header">
                          <span className="metric-card__icon">📊</span>
                          <span className="metric-card__label">Average Yield</span>
                        </div>
                        <div className="metric-card__value">
                          {formatNumber(metrics.averageYield)}%
                        </div>
                      </div>

                      <div className="metric-card">
                        <div className="metric-card__header">
                          <span className="metric-card__icon">🎯</span>
                          <span className="metric-card__label">Holdings</span>
                        </div>
                        <div className="metric-card__value">
                          {portfolioData.length}
                        </div>
                        <div className="metric-card__stats">
                          <div className="stat-item stat-item--success">
                            <span className="stat-icon">📈</span>
                            <span className="stat-text">{metrics.gainers} Gainers</span>
                          </div>
                          <div className="stat-item stat-item--danger">
                            <span className="stat-icon">📉</span>
                            <span className="stat-text">{metrics.losers} Losers</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AI Recommendations Section */}
                    {aiRecommendations.length > 0 && (
                      <div className="ai-recommendations-section">
                        <h2 className="section-title">
                          <span className="section-icon">🤖</span>
                          AI Recommendations
                        </h2>
                        
                        <div className="recommendations-grid">
                          {aiRecommendations.map(rec => (
                            <div 
                              key={rec.id} 
                              className={`recommendation-card recommendation-card--${rec.type}`}
                            >
                              <div className="recommendation-header">
                                <span className="recommendation-icon">{rec.icon}</span>
                                <span className={`recommendation-priority priority--${rec.priority}`}>
                                  {rec.priority}
                                </span>
                              </div>
                              <h3 className="recommendation-title">{rec.title}</h3>
                              <p className="recommendation-message">{rec.message}</p>
                              {rec.action && (
                                <div className="recommendation-action">
                                  <span className="action-icon">💡</span>
                                  <span className="action-text">{rec.action}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quick Portfolio Preview */}
                    <div className="quick-portfolio-preview">
                      <div className="section-header">
                        <h2 className="section-title">
                          <span className="section-icon">💼</span>
                          Top Holdings
                        </h2>
                        <button 
                          className="btn btn--secondary btn--sm"
                          onClick={() => setViewMode('portfolio')}
                        >
                          View All →
                        </button>
                      </div>

                      <div className="holdings-preview-grid">
                        {portfolioData.slice(0, 6).map(stock => (
                          <div key={stock.symbol} className="holding-preview-card">
                            <div className="holding-symbol">{stock.symbol}</div>
                            <div className="holding-value">{formatCurrency(stock.currentValue)}</div>
                            <div className={`holding-change ${stock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                              {stock.profitLoss >= 0 ? '+' : ''}{formatNumber(stock.profitLossPercent)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* PORTFOLIO VIEW - PARTEA 4 */}
                {/* PORTFOLIO VIEW */}
                {viewMode === 'portfolio' && (
                  <div className="portfolio-view">
                    <h2 className="section-title">
                      <span className="section-icon">💼</span>
                      Your Holdings ({portfolioData.length})
                    </h2>

                    <div className="stocks-grid">
                      {portfolioData.map(stock => (
                        <div key={stock.symbol} className="stock-card">
                          <div className="stock-card__header">
                            <div className="stock-card__symbol-group">
                              <span className="stock-card__symbol">{stock.symbol}</span>
                              <span className="stock-card__shares">{stock.shares} shares</span>
                            </div>
                            <div className={`stock-card__badge ${stock.profitLoss >= 0 ? 'stock-card__badge--gain' : 'stock-card__badge--loss'}`}>
                              {stock.profitLoss >= 0 ? '↗' : '↘'} {stock.profitLoss >= 0 ? '+' : ''}{formatNumber(stock.profitLossPercent)}%
                            </div>
                          </div>

                          <div className="stock-card__price-section">
                            <div className="price-row">
                              <span className="price-label">Current Price</span>
                              <span className="price-value">
                                {formatCurrency(stock.currentPrice)}
                              </span>
                            </div>
                            <div className="price-row">
                              <span className="price-label">Avg Buy Price</span>
                              <span className="price-value">{formatCurrency(stock.buyPrice)}</span>
                            </div>
                          </div>

                          <div className="stock-card__details">
                            <div className="detail-row">
                              <span className="detail-label">Current Value</span>
                              <span className="detail-value">{formatCurrency(stock.currentValue)}</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">Total Cost</span>
                              <span className="detail-value">{formatCurrency(stock.totalCost)}</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">Profit/Loss</span>
                              <span className={`detail-value ${stock.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                                {formatCurrency(stock.profitLoss)}
                              </span>
                            </div>
                          </div>

                          {stock.dividends && (
                            <div className="stock-card__dividend-info">
                              <div className="dividend-badge">
                                <span className="dividend-badge__icon">💎</span>
                                <div className="dividend-badge__content">
                                  <span className="dividend-badge__label">Annual Dividend</span>
                                  <span className="dividend-badge__value">
                                    {formatCurrency(stock.dividends.annual * stock.shares)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TRANSACTIONS VIEW */}
                {viewMode === 'transactions' && (
                  <div className="transactions-view">
                    <div className="section-header">
                      <h2 className="section-title">
                        <span className="section-icon">📝</span>
                        Transaction History
                      </h2>
                    </div>

                    {/* Transaction Filter */}
                    <div className="transaction-filter">
                      <label className="filter-label">Filter by Type:</label>
                      <div className="filter-buttons">
                        {transactionTypes.map(type => (
                          <button
                            key={type}
                            className={`filter-btn ${transactionFilter === type ? 'active' : ''}`}
                            onClick={() => setTransactionFilter(type)}
                          >
                            <span>{type}</span>
                            <span className="filter-btn__badge">
                              {type === 'ALL' ? allTransactions.length : 
                               allTransactions.filter(tx => {
                                 if (type === 'BUY') return tx.type.includes('BUY');
                                 if (type === 'SELL') return tx.type.includes('SELL');
                                 if (type === 'DIVIDEND') return tx.type.includes('DIVIDEND');
                                 if (type === 'CASH') return tx.type.includes('CASH') || tx.type.includes('TOP-UP');
                                 return false;
                               }).length}
                            </span>
                          </button>
                        ))}
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
                          {filteredTransactions.length > 0 ? (
                            filteredTransactions.map((tx, index) => (
                              <tr key={index} className="transaction-row">
                                <td>{tx.date}</td>
                                <td className="ticker-cell">
                                  <span className="ticker-badge">{tx.ticker || 'N/A'}</span>
                                </td>
                                <td>
                                  <span className={`type-badge ${
                                    tx.type.includes('BUY') ? 'type-badge--buy' :
                                    tx.type.includes('SELL') ? 'type-badge--sell' :
                                    tx.type.includes('DIVIDEND') ? 'type-badge--dividend' :
                                    'type-badge--cash'
                                  }`}>
                                    {tx.type}
                                  </span>
                                </td>
                                <td className="quantity-cell">{tx.quantity || '-'}</td>
                                <td className="price-cell">
                                  {tx.price ? formatCurrency(tx.price) : '-'}
                                </td>
                                <td className={`amount-cell ${tx.totalAmount >= 0 ? 'positive' : 'negative'}`}>
                                  {formatCurrency(Math.abs(tx.totalAmount))}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="6" className="empty-transactions">
                                No {transactionFilter} transactions found
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* PROJECTIONS VIEW - THE MOST IMPORTANT ONE! */}
                {viewMode === 'projections' && projectionResults && (
                  <div className="projections-view">
                    <h2 className="section-title">
                      <span className="section-icon">🎯</span>
                      Portfolio Growth Projections
                    </h2>

                    {/* Goal Summary Card */}
                    <div className="goal-summary-card">
                      <div className="goal-summary__header">
                        <span className="goal-icon">🎯</span>
                        <h3 className="goal-title">Your Financial Goal</h3>
                      </div>
                      
                      <div className="goal-summary__content">
                        <div className="goal-metric">
                          <span className="goal-metric__label">Target Annual Dividend</span>
                          <span className="goal-metric__value">
                            {formatCurrency(projectionSettings.targetAnnualDividend)}
                          </span>
                        </div>
                        
                        <div className="goal-metric">
                          <span className="goal-metric__label">Portfolio Needed</span>
                          <span className="goal-metric__value">
                            {formatCurrency(projectionResults.portfolioNeededForGoal)}
                          </span>
                        </div>
                        
                        <div className="goal-metric">
                          <span className="goal-metric__label">Current Portfolio</span>
                          <span className="goal-metric__value">
                            {formatCurrency(metrics.totalCurrent)}
                          </span>
                        </div>

                        {projectionResults.goalReached ? (
                          <div className="goal-status goal-status--success">
                            <span className="status-icon">✅</span>
                            <div className="status-text">
                              <strong>Goal Achievable!</strong>
                              <span>You'll reach your goal in {projectionResults.yearsToGoal} years</span>
                            </div>
                          </div>
                        ) : (
                          <div className="goal-status goal-status--warning">
                            <span className="status-icon">⚠️</span>
                            <div className="status-text">
                              <strong>Action Needed</strong>
                              <span>Gap: {formatCurrency(projectionResults.gap)} | Est. {projectionResults.yearsToGoal} years</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Scenarios Comparison Table */}
                    <div className="scenarios-section">
                      <h3 className="scenarios-title">
                        <span className="section-icon">📊</span>
                        3 Growth Scenarios Comparison
                      </h3>

                      <div className="scenarios-grid">
                        {projectionResults.scenarios.map(scenario => {
                          const finalYear = scenario.yearlyData[scenario.yearlyData.length - 1];
                          return (
                            <div key={scenario.name} className={`scenario-card scenario-card--${scenario.name}`}>
                              <div className="scenario-header">
                                <span className="scenario-icon">
                                  {scenario.name === 'conservative' ? '🐢' :
                                   scenario.name === 'target' ? '🎯' : '🚀'}
                                </span>
                                <h4 className="scenario-name">
                                  {scenario.name.charAt(0).toUpperCase() + scenario.name.slice(1)}
                                </h4>
                                <span className="scenario-rate">{scenario.growthRate}% growth</span>
                              </div>

                              <div className="scenario-metrics">
                                <div className="scenario-metric">
                                  <span className="metric-label">Final Portfolio Value</span>
                                  <span className="metric-value">
                                    {formatCurrency(finalYear.portfolioValue)}
                                  </span>
                                </div>

                                <div className="scenario-metric">
                                  <span className="metric-label">Annual Dividends</span>
                                  <span className="metric-value">
                                    {formatCurrency(finalYear.annualDividends)}
                                  </span>
                                </div>

                                <div className="scenario-metric">
                                  <span className="metric-label">Monthly Income</span>
                                  <span className="metric-value">
                                    {formatCurrency(finalYear.monthlyDividends)}
                                  </span>
                                </div>

                                <div className="scenario-metric">
                                  <span className="metric-label">Total Invested</span>
                                  <span className="metric-value">
                                    {formatCurrency(finalYear.totalInvested)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Year-by-Year Breakdown (Target Scenario) */}
                    <div className="year-breakdown-section">
                      <h3 className="section-title">
                        <span className="section-icon">📅</span>
                        Year-by-Year Breakdown (Target Scenario)
                      </h3>

                      <div className="year-breakdown-table-container">
                        <table className="year-breakdown-table">
                          <thead>
                            <tr>
                              <th>Year</th>
                              <th>Portfolio Value</th>
                              <th>Annual Dividends</th>
                              <th>Monthly Dividends</th>
                              <th>Total Invested</th>
                            </tr>
                          </thead>
                          <tbody>
                            {projectionResults.scenarios.find(s => s.name === 'target').yearlyData.map(yearData => (
                              <tr key={yearData.year} className="year-row">
                                <td className="year-cell">Year {yearData.year}</td>
                                <td className="value-cell">{formatCurrency(yearData.portfolioValue)}</td>
                                <td className="value-cell">{formatCurrency(yearData.annualDividends)}</td>
                                <td className="value-cell">{formatCurrency(yearData.monthlyDividends)}</td>
                                <td className="value-cell">{formatCurrency(yearData.totalInvested)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Visual Chart Placeholder */}
                    <div className="chart-section">
                      <h3 className="section-title">
                        <span className="section-icon">📈</span>
                        Portfolio Growth Visualization
                      </h3>
                      
                      <div className="chart-placeholder">
                        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '40px' }}>
                          📊 Chart visualization with Chart.js will be added in PARTEA 5
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
/* ============================================
   DIVIDEND PLANNER PRO - COMPLETE STYLES
   ============================================ */

/* CSS VARIABLES */
:root {
  /* Colors - Light Mode */
  --color-primary: #21808d;
  --color-primary-hover: #1d7480;
  --color-primary-active: #1a686f;
  
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-info: #3b82f6;
  
  --color-background: #fafaf9;
  --color-surface: #ffffff;
  --color-surface-elevated: #f5f5f4;
  
  --color-text: #1c1917;
  --color-text-secondary: #78716c;
  --color-text-tertiary: #a8a29e;
  
  --color-border: #e7e5e4;
  --color-border-light: #f5f5f4;
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;
  --space-3xl: 48px;
  
  /* Border Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  
  /* Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);
  
  /* Font */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace;
}

/* Dark Mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #32b8c6;
    --color-primary-hover: #2da3b0;
    --color-primary-active: #298e9a;
    
    --color-background: #0c0a09;
    --color-surface: #1c1917;
    --color-surface-elevated: #292524;
    
    --color-text: #fafaf9;
    --color-text-secondary: #a8a29e;
    --color-text-tertiary: #78716c;
    
    --color-border: #292524;
    --color-border-light: #1c1917;
  }
}

/* RESET & BASE STYLES */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
}

body {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
  background-color: var(--color-background);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* APP CONTAINER */
.App {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ============================================
   HEADER
   ============================================ */
.header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header__content {
  max-width: 1600px;
  margin: 0 auto;
  padding: var(--space-lg) var(--space-xl);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xl);
}

.header__brand {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.brand-icon {
  font-size: 2rem;
}

.brand-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.2;
}

.brand-subtitle {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

/* ============================================
   BUTTONS
   ============================================ */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--color-primary);
  color: white;
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn--secondary {
  background: var(--color-surface-elevated);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--color-border-light);
  border-color: var(--color-text-tertiary);
}

.btn--sm {
  padding: 6px 12px;
  font-size: 0.8125rem;
}

.btn--large {
  padding: var(--space-md) var(--space-xl);
  font-size: 1rem;
}

.btn--full-width {
  width: 100%;
}

.btn-icon {
  font-size: 1.1em;
}

/* ============================================
   LOADING OVERLAY
   ============================================ */
.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.loading-spinner {
  background: var(--color-surface);
  padding: var(--space-2xl);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-lg);
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

/* ============================================
   MAIN CONTENT
   ============================================ */
.main-content {
  flex: 1;
  max-width: 1600px;
  width: 100%;
  margin: 0 auto;
  padding: var(--space-xl);
}

/* ============================================
   EMPTY STATE
   ============================================ */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: var(--space-2xl);
}

.empty-state__content {
  text-align: center;
  max-width: 600px;
}

.empty-state__icon-wrapper {
  position: relative;
  display: inline-block;
  margin-bottom: var(--space-xl);
}

.empty-state__icon {
  font-size: 6rem;
  position: relative;
  z-index: 2;
}

.empty-state__icon-bg {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(50, 184, 198, 0.2) 0%, transparent 70%);
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.8; }
}

.empty-state__title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: var(--space-md);
}

.empty-state__description {
  font-size: 1.1rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2xl);
  line-height: 1.6;
}

.empty-state__features {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
  margin: var(--space-2xl) 0;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.feature-icon {
  font-size: 1.5rem;
}

.feature-text {
  font-size: 0.875rem;
  font-weight: 600;
}

.empty-state__format {
  margin-top: var(--space-xl);
  padding: var(--space-lg);
  background: var(--color-surface-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.format-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.format-code {
  display: block;
  padding: var(--space-sm) var(--space-md);
  background: var(--color-background);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-success);
}

/* ============================================
   VIEW TABS
   ============================================ */
.view-tabs {
  display: flex;
  gap: var(--space-sm);
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 0;
}

.view-tab {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
  font-weight: 600;
  font-family: inherit;
  position: relative;
  transition: all var(--transition-fast);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.view-tab::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--color-primary);
  transform: scaleX(0);
  transition: transform var(--transition-normal);
}

.view-tab.active {
  color: var(--color-primary);
  background: var(--color-surface-elevated);
}

.view-tab.active::after {
  transform: scaleX(1);
}

.view-tab:hover:not(.active) {
  color: var(--color-text);
  background: var(--color-background);
}

.tab-icon {
  font-size: 1.2em;
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 700;
}

.view-tab.active .tab-badge {
  background: var(--color-primary);
  color: white;
}

/* ============================================
   SETTINGS PANEL
   ============================================ */
.settings-panel {
  width: 320px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 100px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

.settings-panel__header {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-title {
  font-size: 1.125rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.settings-icon {
  font-size: 1.3em;
}

.settings-toggle {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: var(--space-xs);
  color: var(--color-text-secondary);
  transition: color var(--transition-fast);
}

.settings-toggle:hover {
  color: var(--color-text);
}

.settings-panel__content {
  padding: var(--space-lg);
}

.setting-group {
  margin-bottom: var(--space-lg);
}

.setting-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-sm);
}

.label-icon {
  font-size: 1.1em;
}

.input-with-unit {
  position: relative;
  display: flex;
  align-items: center;
}

.setting-input {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  padding-right: 50px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-family: inherit;
  background: var(--color-surface-elevated);
  color: var(--color-text);
  transition: border-color var(--transition-fast);
}

.setting-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.input-unit {
  position: absolute;
  right: var(--space-md);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.settings-divider {
  height: 1px;
  background: var(--color-border);
  margin: var(--space-xl) 0;
}

.settings-subtitle {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-lg);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.show-settings-btn {
  position: fixed;
  left: var(--space-xl);
  top: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
  z-index: 50;
}

.show-settings-btn:hover {
  background: var(--color-primary);
  color: white;
  transform: translateX(4px);
}

/* ============================================
   METRICS GRID
   ============================================ */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.metric-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  transition: all var(--transition-normal);
}

.metric-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.metric-card--gain {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, transparent 100%);
  border-color: rgba(16, 185, 129, 0.2);
}

.metric-card--loss {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, transparent 100%);
  border-color: rgba(239, 68, 68, 0.2);
}

.metric-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.metric-card__icon {
  font-size: 1.5rem;
}

.metric-card__label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.metric-card__value {
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1;
}

.metric-card__percentage {
  margin-top: var(--space-sm);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-success);
}

.metric-card--loss .metric-card__percentage {
  color: var(--color-danger);
}

.metric-card__dividend {
  margin-top: var(--space-md);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface-elevated);
  border-radius: var(--radius-sm);
}

.dividend-icon {
  font-size: 1rem;
}

.dividend-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.metric-card__stats {
  margin-top: var(--space-md);
  display: flex;
  gap: var(--space-md);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.stat-icon {
  font-size: 0.875rem;
}

.stat-text {
  font-size: 0.75rem;
  font-weight: 600;
}

.stat-item--success {
  color: var(--color-success);
}

.stat-item--danger {
  color: var(--color-danger);
}

/* ============================================
   AI RECOMMENDATIONS
   ============================================ */
.ai-recommendations-section {
  margin-bottom: var(--space-2xl);
}

.section-title {
  font-size: 1.5rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
}

.section-icon {
  font-size: 1.3em;
}

.recommendations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-lg);
}

.recommendation-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  transition: all var(--transition-normal);
}

.recommendation-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.recommendation-card--success {
  border-left: 4px solid var(--color-success);
}

.recommendation-card--warning {
  border-left: 4px solid var(--color-warning);
}

.recommendation-card--info {
  border-left: 4px solid var(--color-info);
}

.recommendation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.recommendation-icon {
  font-size: 2rem;
}

.recommendation-priority {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  letter-spacing: 0.5px;
}

.priority--high {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-danger);
}

.priority--medium {
  background: rgba(245, 158, 11, 0.1);
  color: var(--color-warning);
}

.priority--low {
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-info);
}

.recommendation-title {
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: var(--space-sm);
}

.recommendation-message {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin-bottom: var(--space-md);
}

.recommendation-action {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface-elevated);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.action-icon {
  font-size: 1rem;
}

.action-text {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
}

/* ============================================
   PORTFOLIO VIEW (Continue in next message due to length...)
   ============================================ */

.stocks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-lg);
}

.stock-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  transition: all var(--transition-normal);
}

.stock-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-4px);
}

.stock-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-md);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--color-border);
}

.stock-card__symbol {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
}

.stock-card__shares {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.stock-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  font-weight: 700;
}

.stock-card__badge--gain {
  background: rgba(16, 185, 129, 0.1);
  color: var(--color-success);
}

.stock-card__badge--loss {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-danger);
}

.stock-card__price-section {
  margin-bottom: var(--space-md);
  padding: var(--space-md);
  background: var(--color-surface-elevated);
  border-radius: var(--radius-md);
}

.price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.price-row:last-child {
  margin-bottom: 0;
}

.price-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.price-value {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text);
}

.stock-card__details {
  margin-bottom: var(--space-md);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--color-border);
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.detail-value {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
}

.detail-value.positive {
  color: var(--color-success);
}

.detail-value.negative {
  color: var(--color-danger);
}

.stock-card__dividend-info {
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-border);
}

.dividend-badge {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, transparent 100%);
  border-radius: var(--radius-md);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.dividend-badge__icon {
  font-size: 1.5rem;
}

.dividend-badge__content {
  display: flex;
  flex-direction: column;
}

.dividend-badge__label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.dividend-badge__value {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-success);
}

/* ============================================
   TRANSACTIONS VIEW
   ============================================ */
.transaction-filter {
  margin-bottom: var(--space-xl);
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  flex-wrap: wrap;
}

.filter-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.filter-buttons {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
  font-family: inherit;
}

.filter-btn:hover {
  background: var(--color-surface-elevated);
  border-color: var(--color-text-tertiary);
}

.filter-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.filter-btn__badge {
  font-size: 0.75rem;
  padding: 2px 6px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  min-width: 20px;
  text-align: center;
}

.filter-btn.active .filter-btn__badge {
  background: rgba(255, 255, 255, 0.3);
}

.transactions-table-container {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

.transactions-table {
  width: 100%;
  border-collapse: collapse;
}

.transactions-table thead {
  background: var(--color-surface-elevated);
  border-bottom: 2px solid var(--color-border);
}

.transactions-table th {
  padding: var(--space-md) var(--space-lg);
  text-align: left;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.transactions-table tbody tr {
  border-bottom: 1px solid var(--color-border);
  transition: background var(--transition-fast);
}

.transactions-table tbody tr:hover {
  background: var(--color-surface-elevated);
}

.transactions-table tbody tr:last-child {
  border-bottom: none;
}

.transactions-table td {
  padding: var(--space-md) var(--space-lg);
  font-size: 0.875rem;
}

.ticker-badge {
  display: inline-block;
  padding: 4px 8px;
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text);
}

.type-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.type-badge--buy {
  background: rgba(16, 185, 129, 0.1);
  color: var(--color-success);
}

.type-badge--sell {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-danger);
}

.type-badge--dividend {
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-info);
}

.type-badge--cash {
  background: rgba(245, 158, 11, 0.1);
  color: var(--color-warning);
}

.amount-cell.positive {
  color: var(--color-success);
  font-weight: 600;
}

.amount-cell.negative {
  color: var(--color-danger);
  font-weight: 600;
}

.empty-transactions {
  padding: var(--space-3xl) var(--space-lg);
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

/* ============================================
   PROJECTIONS VIEW
   ============================================ */
.goal-summary-card {
  background: linear-gradient(135deg, rgba(33, 128, 141, 0.05) 0%, transparent 100%);
  border: 2px solid rgba(33, 128, 141, 0.2);
  border-radius: var(--radius-xl);
  padding: var(--space-2xl);
  margin-bottom: var(--space-2xl);
}

.goal-summary__header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.goal-icon {
  font-size: 2.5rem;
}

.goal-title {
  font-size: 1.5rem;
  font-weight: 700;
}

.goal-summary__content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-lg);
}

.goal-metric {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.goal-metric__label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.goal-metric__value {
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--color-text);
}

.goal-status {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  border-radius: var(--radius-lg);
  margin-top: var(--space-md);
}

.goal-status--success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.goal-status--warning {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.status-icon {
  font-size: 2rem;
}

.status-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-text strong {
  font-size: 1.125rem;
  font-weight: 700;
}

.status-text span {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.scenarios-section {
  margin-bottom: var(--space-2xl);
}

.scenarios-title {
  font-size: 1.25rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
}

.scenarios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-lg);
}

.scenario-card {
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  transition: all var(--transition-normal);
}

.scenario-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-4px);
}

.scenario-card--conservative {
  border-color: rgba(59, 130, 246, 0.3);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, transparent 100%);
}

.scenario-card--target {
  border-color: rgba(16, 185, 129, 0.3);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, transparent 100%);
}

.scenario-card--optimistic {
  border-color: rgba(245, 158, 11, 0.3);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, transparent 100%);
}

.scenario-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
  padding-bottom: var(--space-lg);
  border-bottom: 2px solid var(--color-border);
}

.scenario-icon {
  font-size: 2rem;
}

.scenario-name {
  flex: 1;
  font-size: 1.25rem;
  font-weight: 700;
}

.scenario-rate {
  font-size: 0.875rem;
  font-weight: 700;
  padding: 4px 8px;
  background: var(--color-surface-elevated);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

.scenario-metrics {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.scenario-metric {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.metric-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.metric-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
}

.year-breakdown-section {
  margin-bottom: var(--space-2xl);
}

.year-breakdown-table-container {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

.year-breakdown-table {
  width: 100%;
  border-collapse: collapse;
}

.year-breakdown-table thead {
  background: var(--color-surface-elevated);
  border-bottom: 2px solid var(--color-border);
}

.year-breakdown-table th {
  padding: var(--space-md) var(--space-lg);
  text-align: left;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.year-breakdown-table tbody tr {
  border-bottom: 1px solid var(--color-border);
  transition: background var(--transition-fast);
}

.year-breakdown-table tbody tr:hover {
  background: var(--color-surface-elevated);
}

.year-breakdown-table tbody tr:last-child {
  border-bottom: none;
}

.year-breakdown-table td {
  padding: var(--space-md) var(--space-lg);
  font-size: 0.875rem;
}

.year-cell {
  font-weight: 700;
  color: var(--color-primary);
}

.value-cell {
  font-weight: 600;
  color: var(--color-text);
}

.chart-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-2xl);
  min-height: 400px;
}

.chart-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  background: var(--color-surface-elevated);
  border-radius: var(--radius-md);
  border: 2px dashed var(--color-border);
}

/* ============================================
   RESPONSIVE
   ============================================ */
@media (max-width: 1024px) {
  .settings-panel {
    width: 280px;
  }
  
  .metrics-grid {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
}

@media (max-width: 768px) {
  .header__content {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-md);
  }
  
  .view-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  .settings-panel {
    width: 100%;
    position: relative;
    top: 0;
    max-height: none;
  }
  
  .show-settings-btn {
    position: relative;
    left: 0;
    top: 0;
    width: 100%;
    margin-bottom: var(--space-lg);
  }
  
  .metrics-grid {
    grid-template-columns: 1fr;
  }
  
  .stocks-grid,
  .recommendations-grid,
  .scenarios-grid {
    grid-template-columns: 1fr;
  }
  
  .empty-state__features {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .main-content {
    padding: var(--space-md);
  }
  
  .header__content {
    padding: var(--space-md);
  }
  
  .metric-card__value {
    font-size: 1.5rem;
  }
  
  .goal-metric__value {
    font-size: 1.5rem;
  }
}
