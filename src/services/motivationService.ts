// Daily motivation quotes database
const MOTIVATION_QUOTES = [
  {
    text: "The only way to do great work is to love what you do.",
    author: "Steve Jobs",
    theme: "achievement",
  },
  {
    text: "Don't watch the clock; do what it does. Keep going.",
    author: "Sam Levenson",
    theme: "persistence",
  },
  {
    text: "The future belongs to those who believe in the beauty of their dreams.",
    author: "Eleanor Roosevelt",
    theme: "dreams",
  },
  {
    text: "Success is not final, failure is not fatal.",
    author: "Winston Churchill",
    theme: "resilience",
  },
  {
    text: "You are capable of amazing things.",
    author: "Unknown",
    theme: "confidence",
  },
  {
    text: "Every day is a new beginning. Take a deep breath and start again.",
    author: "Unknown",
    theme: "renewal",
  },
  {
    text: "Your only limit is you.",
    author: "Unknown",
    theme: "potential",
  },
  {
    text: "Progress, not perfection.",
    author: "Unknown",
    theme: "growth",
  },
  {
    text: "Be the change you wish to see in the world.",
    author: "Mahatma Gandhi",
    theme: "impact",
  },
  {
    text: "The best time to plant a tree was 20 years ago. The second best time is now.",
    author: "Chinese Proverb",
    theme: "action",
  },
  {
    text: "Believe you can and you're halfway there.",
    author: "Theodore Roosevelt",
    theme: "mindset",
  },
  {
    text: "Do something today that your future self will thank you for.",
    author: "Unknown",
    theme: "initiative",
  },
  {
    text: "Your potential is endless. Your excuses are temporary.",
    author: "Unknown",
    theme: "motivation",
  },
  {
    text: "Let today be the day you stop feeling sorry for yourself.",
    author: "Steve Maraboli",
    theme: "empowerment",
  },
  {
    text: "Life is 10% what happens and 90% how you react to it.",
    author: "Charles R. Swindoll",
    theme: "perspective",
  },
  {
    text: "Great things never came from comfort zones.",
    author: "Unknown",
    theme: "challenge",
  },
  {
    text: "You've survived 100% of your worst days.",
    author: "Unknown",
    theme: "strength",
  },
  {
    text: "Success is the sum of small efforts repeated day in and day out.",
    author: "Robert Collier",
    theme: "consistency",
  },
];

// Inspiring image URLs from Unsplash (optimized for dashboard)
const MOTIVATIONAL_IMAGES = [
  "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=400&fit=crop", // success
  "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&h=400&fit=crop", // achievement
  "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=400&fit=crop", // mountain
  "https://images.unsplash.com/photo-1491438639081-d282ec19a4ab?w=800&h=400&fit=crop", // strength
  "https://images.unsplash.com/photo-1469022563149-aa64dbd37dae?w=800&h=400&fit=crop", // sunrise
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&h=400&fit=crop", // inspiration
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&h=400&fit=crop", // goals
  "https://images.unsplash.com/photo-1522202176988-696ce0213907?w=800&h=400&fit=crop", // growth
  "https://images.unsplash.com/photo-1505228395891-9a51e7e86e81?w=800&h=400&fit=crop", // dreams
  "https://images.unsplash.com/photo-1517694712983-6f777867acf9?w=800&h=400&fit=crop", // journey
  "https://images.unsplash.com/photo-1503455637927-730bce30954d?w=800&h=400&fit=crop", // ocean
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=400&fit=crop", // portrait
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&h=400&fit=crop", // nature
  "https://images.unsplash.com/photo-1495567720989-cebdbdd97913?w=800&h=400&fit=crop", // focus
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=800&h=400&fit=crop", // perspective
];

export interface DailyMotivation {
  quote: string;
  author: string;
  theme: string;
  imageUrl: string;
}

/**
 * Get today's motivation quote based on date
 * Ensures same quote for entire day
 */
export const getTodayMotivation = (): DailyMotivation => {
  // Use date as seed to ensure same quote all day
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
  );

  const quoteIndex = dayOfYear % MOTIVATION_QUOTES.length;
  const imageIndex = (dayOfYear + 3) % MOTIVATIONAL_IMAGES.length; // offset to vary images

  const quote = MOTIVATION_QUOTES[quoteIndex];

  return {
    quote: quote.text,
    author: quote.author,
    theme: quote.theme,
    imageUrl: MOTIVATIONAL_IMAGES[imageIndex],
  };
};

/**
 * Get a random motivation quote
 */
export const getRandomMotivation = (): DailyMotivation => {
  const randomQuoteIndex = Math.floor(Math.random() * MOTIVATION_QUOTES.length);
  const randomImageIndex = Math.floor(Math.random() * MOTIVATIONAL_IMAGES.length);

  const quote = MOTIVATION_QUOTES[randomQuoteIndex];

  return {
    quote: quote.text,
    author: quote.author,
    theme: quote.theme,
    imageUrl: MOTIVATIONAL_IMAGES[randomImageIndex],
  };
};

/**
 * Cache today's motivation
 */
let cachedMotivation: DailyMotivation | null = null;
let cachedDate: string = "";

export const getCachedMotivation = (): DailyMotivation => {
  const today = new Date().toDateString();

  if (cachedMotivation && cachedDate === today) {
    return cachedMotivation;
  }

  const motivation = getTodayMotivation();
  cachedMotivation = motivation;
  cachedDate = today;

  return motivation;
};
