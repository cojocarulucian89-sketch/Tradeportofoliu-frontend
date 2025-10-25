const API_BASE_URL = 'https://tradeportofoliu-backend.onrender.com';

export const fetchPortfolio = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/portfolio`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    throw error;
  }
};

export const optimizePortfolio = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/optimize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error optimizing portfolio:', error);
    throw error;
  }
};
