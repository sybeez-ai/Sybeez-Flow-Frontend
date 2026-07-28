/**
 * AI Coach Panel Component
 * Claude-powered productivity coaching interface
 */

import { useState, useRef, useEffect } from "react";
import { 
  Brain, 
  Send, 
  Sparkles, 
  Lightbulb,
  Target,
  Zap,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AICoachingMessage, AICoachingContext } from "@/types/dailyLife";
import { productivityAI, ProductivityAIResponse } from "@/services/productivityAIService";
import { cn } from "@/lib/utils";

interface AICoachPanelProps {
  context: AICoachingContext;
  onSuggestionApply?: (suggestion: string) => void;
}

const QUICK_PROMPTS = [
  { label: "Daily Plan", prompt: "Help me plan my day for maximum productivity", icon: Target },
  { label: "Energy Tips", prompt: "I'm feeling low energy. What can I do right now?", icon: Zap },
  { label: "Focus Help", prompt: "I'm struggling to focus. How can I concentrate better?", icon: Brain },
  { label: "Motivation", prompt: "I need some motivation to get started", icon: Sparkles }
];

const AICoachPanel = ({ context, onSuggestionApply }: AICoachPanelProps) => {
  const [messages, setMessages] = useState<AICoachingMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showQuickPrompts, setShowQuickPrompts] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize AI service with context
  useEffect(() => {
    productivityAI.setContext(context);
    // Load conversation history
    const history = productivityAI.getHistory();
    if (history.length > 0) {
      setMessages(history);
    }
  }, [context]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send message
  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    setInput("");
    setShowQuickPrompts(false);
    setIsLoading(true);

    // Add user message immediately
    const userMessage: AICoachingMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      type: 'chat'
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await productivityAI.chat(text);
      
      const assistantMessage: AICoachingMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        type: 'chat',
        metadata: {
          productivityTips: response.productivityTips,
          habitRecommendations: response.habitRecommendations
        }
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI Coach error:', error);
      const errorMessage: AICoachingMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I'm having trouble connecting right now. Try again in a moment, or check your connection.",
        timestamp: new Date().toISOString(),
        type: 'chat'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Get daily insights
  const handleGetInsights = async () => {
    setIsLoading(true);
    setShowQuickPrompts(false);
    
    try {
      const response = await productivityAI.getDailyInsights();
      
      const insightMessage: AICoachingMessage = {
        id: `insight-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        type: 'insight',
        metadata: {
          productivityTips: response.productivityTips
        }
      };
      setMessages(prev => [...prev, insightMessage]);
    } catch (error) {
      console.error('Insights error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear chat history
  const handleClearHistory = () => {
    productivityAI.clearHistory();
    setMessages([]);
    setShowQuickPrompts(true);
  };

  // Format message with markdown-like styling
  const formatMessage = (content: string) => {
    // Split by newlines and format
    const lines = content.split('\n');
    return lines.map((line, i) => {
      // Headers
      if (line.startsWith('###')) {
        return <h4 key={i} className="font-semibold text-xs mt-2 mb-1">{line.replace(/^###\s*/, '')}</h4>;
      }
      if (line.startsWith('##')) {
        return <h3 key={i} className="font-semibold text-sm mt-2 mb-1">{line.replace(/^##\s*/, '')}</h3>;
      }
      // Bullet points
      if (line.match(/^[\-\*\•]\s/)) {
        return <li key={i} className="text-[11px] ml-3 list-disc">{line.replace(/^[\-\*\•]\s*/, '')}</li>;
      }
      // Numbered lists
      if (line.match(/^\d+\.\s/)) {
        return <li key={i} className="text-[11px] ml-3 list-decimal">{line.replace(/^\d+\.\s*/, '')}</li>;
      }
      // Bold text
      if (line.includes('**')) {
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <p key={i} className="text-[11px]">
            {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
          </p>
        );
      }
      // Regular text
      if (line.trim()) {
        return <p key={i} className="text-[11px]">{line}</p>;
      }
      return null;
    });
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-purple-500/10 to-blue-500/10 hover:from-purple-500/20 hover:to-blue-500/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-xs font-medium text-foreground">AI Productivity Coach</p>
            <p className="text-[10px] text-muted-foreground">Powered by Claude</p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <>
          {/* Quick Actions */}
          <div className="p-2 border-b border-border bg-muted/20 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] flex-1"
              onClick={handleGetInsights}
              disabled={isLoading}
            >
              <Lightbulb className="h-3 w-3 mr-1" />
              Daily Insights
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              onClick={handleClearHistory}
              disabled={isLoading || messages.length === 0}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="h-[250px] p-3" ref={scrollRef}>
            {messages.length === 0 && showQuickPrompts ? (
              <div className="space-y-3">
                <div className="text-center py-4">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 text-purple-500 opacity-60" />
                  <p className="text-xs text-foreground font-medium">Hi! I'm your AI productivity coach</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Ask me anything about productivity, habits, or time management
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_PROMPTS.map(({ label, prompt, icon: Icon }) => (
                    <button
                      key={label}
                      onClick={() => handleSend(prompt)}
                      className="p-2 border border-border rounded-lg hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-left"
                    >
                      <Icon className="h-4 w-4 text-purple-500 mb-1" />
                      <p className="text-[10px] font-medium text-foreground">{label}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map(message => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg p-2.5",
                        message.role === 'user'
                          ? "bg-foreground text-background"
                          : "bg-muted/50 border border-border"
                      )}
                    >
                      {message.type === 'insight' && (
                        <div className="flex items-center gap-1 mb-1.5">
                          <Lightbulb className="h-3 w-3 text-yellow-500" />
                          <span className="text-[10px] font-medium text-yellow-600">Daily Insight</span>
                        </div>
                      )}
                      
                      <div className={cn(
                        "space-y-1",
                        message.role === 'user' ? "text-background" : "text-foreground"
                      )}>
                        {formatMessage(message.content)}
                      </div>
                      
                      {/* Suggestions */}
                      {message.metadata?.productivityTips && message.metadata.productivityTips.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                          <p className="text-[10px] font-medium text-muted-foreground">Quick Actions:</p>
                          {message.metadata.productivityTips.slice(0, 3).map((tip, i) => (
                            <button
                              key={i}
                              onClick={() => onSuggestionApply?.(tip)}
                              className="block w-full text-left text-[10px] p-1.5 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                            >
                              {tip}
                            </button>
                          ))}
                        </div>
                      )}
                      
                      <p className="text-[9px] text-muted-foreground mt-1.5">
                        {new Date(message.timestamp).toLocaleTimeString('en-US', { 
                          hour: 'numeric', 
                          minute: '2-digit' 
                        })}
                      </p>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted/50 border border-border rounded-lg p-2.5">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-3 w-3 animate-spin text-purple-500" />
                        <span className="text-[11px] text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="p-2 border-t border-border">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask your AI coach..."
                className="h-8 text-xs"
                disabled={isLoading}
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AICoachPanel;
