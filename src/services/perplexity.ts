const PERPLEXITY_API_KEY = (import.meta.env.VITE_PERPLEXITY_API_KEY || "").trim();
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PerplexityResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Search using Perplexity AI
 */
export async function searchWithPerplexity(
  query: string,
  conversationHistory: PerplexityMessage[] = []
): Promise<string> {
  if (!PERPLEXITY_API_KEY) {
    throw new Error(
      "Perplexity API key missing. Set VITE_PERPLEXITY_API_KEY in frontend/.env.local",
    );
  }
  try {
    const messages: PerplexityMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful AI assistant with access to real-time information. Provide accurate, well-researched answers with sources when possible.'
      },
      ...conversationHistory,
      {
        role: 'user',
        content: query
      }
    ];

    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: messages,
        temperature: 0.2,
        top_p: 0.9,
        search_domain_filter: ["perplexity.ai"],
        return_images: false,
        return_related_questions: false,
        search_recency_filter: "month",
        top_k: 0,
        stream: false,
        presence_penalty: 0,
        frequency_penalty: 1
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Perplexity API error: ${response.status}`);
    }

    const data: PerplexityResponse = await response.json();
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from Perplexity AI');
    }

    return data.choices[0].message.content;
  } catch (error: any) {
    console.error('Perplexity search error:', error);
    throw new Error(`Failed to search: ${error.message}`);
  }
}

/**
 * Search for fashion-related information
 */
export async function searchFashionInfo(query: string): Promise<string> {
  const fashionSystemMessage: PerplexityMessage = {
    role: 'system',
    content: 'You are a fashion expert AI assistant. Provide fashion advice, style tips, and trend information. Include current fashion trends and styling suggestions.'
  };

  return searchWithPerplexity(query, [fashionSystemMessage]);
}

/**
 * Search for room design and interior decoration information
 */
export async function searchRoomDesignInfo(query: string): Promise<string> {
  const designSystemMessage: PerplexityMessage = {
    role: 'system',
    content: 'You are an interior design expert. Provide room design ideas, decoration tips, furniture recommendations, and spatial planning advice.'
  };

  return searchWithPerplexity(query, [designSystemMessage]);
}
