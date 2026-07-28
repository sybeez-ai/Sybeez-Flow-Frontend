import { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from "react";

interface BookingCategory {
  id: number;
  icon: string;
  name: string;
  image: string;
  services: string[];
}

interface BookingResult {
  id: string;
  name: string;
  category: string;
  image: string;
  description: string;
  price: number;
  priceUnit: string;
  rating: number;
  reviewCount: number;
  location?: string;
  amenities?: string[];
  highlights?: string[];
  url?: string;
  available?: boolean;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  products?: any[];
  bookingCategories?: BookingCategory[];
  bookingResults?: BookingResult[];
  analysis?: any;
  travelPlan?: any;
  metadata?: {
    sources?: any[];
    insights?: any;
    productivity_mode?: boolean;
    productivity_score?: number;
    finance_mode?: boolean;
    intent?: string;
    web_intel_used?: boolean;
    has_affiliate?: boolean;
  };
  timestamp: Date;
}

interface ChatContextType {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  addMessage: (message: ChatMessage) => void;
  chatStarted: boolean;
  setChatStarted: (started: boolean) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatStarted, setChatStarted] = useState(false);

  const addMessage = (message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  };

  return (
    <ChatContext.Provider value={{ messages, setMessages, addMessage, chatStarted, setChatStarted }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return context;
};
