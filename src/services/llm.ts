const API_URL = import.meta.env.VITE_API_URL;

export interface FashionAdviceResponse {
  advice: string;
  action: string;
  jobId: string;
}

export interface GarmentSpecs {
  name?: string;
  size?: string;
  chest?: number;
  waist?: number;
  shoulders?: number;
  length?: number;
  sleeves?: number;
  [key: string]: any;
}

/**
 * Get fashion advice from LLM
 */
async function getFashionAdvice(
  jobId: string,
  action: string,
  data?: any
): Promise<string> {
  const response = await fetch(`${API_URL}/fashion-advice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, action, data })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get fashion advice');
  }

  const result: FashionAdviceResponse = await response.json();
  return result.advice;
}

/**
 * Analyze user's body type and get fashion recommendations
 */
export async function analyzeBodyType(jobId: string): Promise<string> {
  return getFashionAdvice(jobId, 'analyze');
}

/**
 * Check if a garment will fit the user
 */
export async function checkGarmentFit(
  jobId: string,
  garmentSpecs: GarmentSpecs
): Promise<string> {
  return getFashionAdvice(jobId, 'check-fit', { garmentSpecs });
}

/**
 * Get outfit recommendations for an occasion
 */
export async function getOutfitRecommendations(
  jobId: string,
  occasion: string,
  preferences?: {
    style?: string;
    colors?: string[];
    budget?: string;
    [key: string]: any;
  }
): Promise<string> {
  return getFashionAdvice(jobId, 'recommend-outfits', { occasion, preferences });
}

/**
 * Chat with the AI fashion stylist
 */
export async function chatWithStylist(
  jobId: string,
  message: string
): Promise<string> {
  return getFashionAdvice(jobId, 'chat', { message });
}

/**
 * Get personalized color palette
 */
export async function getColorPalette(jobId: string): Promise<string> {
  return getFashionAdvice(jobId, 'color-palette');
}

/**
 * Analyze an uploaded garment photo
 */
export async function analyzeGarment(
  jobId: string,
  garmentPhotoBase64: string
): Promise<string> {
  return getFashionAdvice(jobId, 'analyze-garment', { garmentPhotoBase64 });
}

/**
 * Get wardrobe building advice
 */
export async function buildWardrobe(
  jobId: string,
  budget: string,
  lifestyle: string,
  currentWardrobe?: string[]
): Promise<string> {
  return getFashionAdvice(jobId, 'build-wardrobe', { 
    budget, 
    lifestyle, 
    currentWardrobe 
  });
}

/**
 * Helper: Convert File to base64
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:image/jpeg;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
}

// ============ Web Search Integration ============

export interface WebSearchResult {
  title: string;
  snippet: string;
  link: string;
  position?: number;
}

export interface ProductSearchResult {
  title: string;
  price?: string;
  link: string;
  source?: string;
  thumbnail?: string;
}

export interface TravelSearchResult {
  title: string;
  description?: string;
  link: string;
  price?: string;
  rating?: string;
}

/**
 * Perform web search using SerpAPI
 */
export async function searchWeb(
  query: string,
  numResults: number = 5
): Promise<WebSearchResult[]> {
  const response = await fetch(`${API_URL}/api/search/web`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, num_results: numResults })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Web search failed');
  }

  const result = await response.json();
  return result.results || [];
}

/**
 * Search for products with optional price filter
 */
export async function searchProducts(
  query: string,
  maxPrice?: number
): Promise<ProductSearchResult[]> {
  const response = await fetch(`${API_URL}/api/search/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, max_price: maxPrice })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Product search failed');
  }

  const result = await response.json();
  return result.products || [];
}

/**
 * Search for travel destinations (hotels, flights, attractions)
 */
export async function searchTravel(
  destination: string,
  travelType: 'hotels' | 'flights' | 'attractions' = 'hotels'
): Promise<TravelSearchResult[]> {
  const response = await fetch(`${API_URL}/api/search/travel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination, travel_type: travelType })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Travel search failed');
  }

  const result = await response.json();
  return result.results || [];
}

/**
 * Scrape content from a URL
 */
export async function scrapeUrl(url: string): Promise<any> {
  const response = await fetch(`${API_URL}/api/search/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(url)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'URL scraping failed');
  }

  const result = await response.json();
  return result.data;
}

/**
 * Chat with AI (with optional web search)
 */
export async function chatWithAI(
  message: string,
  useWebSearch: boolean = false
): Promise<string> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      message,
      use_web_search: useWebSearch 
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Chat failed');
  }

  const result = await response.json();
  return result.response;
}

