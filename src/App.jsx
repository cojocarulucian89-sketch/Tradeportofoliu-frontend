import React, { useState, useEffect } from 'react';
import { fetchPortfolio, optimizePortfolio } from './services/api';

function App() {
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPortfolio();
  }, []);

  const loadPortfolio = async () => {
    try {
      setLoading(true);
      const data = await fetchPortfolio();
      setPortfolio(data);
      setError(null);
    } catch (err) {
      setError('Failed to load portfolio');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    try {
      setLoading(true);
      const optimized = await optimizePortfolio();
      setPortfolio(optimized);
      setError(null);
    } catch (err) {
      setError('Failed to optimize portfolio');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">
          NEWTRADE Pro AI Sentinel
        </h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="flex justify-center mb-6">
          <button
            onClick={handleOptimize}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Optimize Portfolio'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {portfolio.map((item, index) => (
            <div key={index} className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-2">{item.symbol}</h2>
              <p className="text-gray-600">Shares: {item.shares}</p>
              <p className="text-gray-600">Value: ${item.value?.toFixed(2) || 'N/A'}</p>
            </div>
          ))}
        </div>

        {!loading && portfolio.length === 0 && (
          <p className="text-center text-gray-500 mt-8">No portfolio data available</p>
        )}
      </div>
    </div>
  );
}

export default App;
