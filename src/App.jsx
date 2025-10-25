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
