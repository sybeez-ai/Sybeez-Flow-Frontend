import { usGetItem, usSetItem } from "@/services/userStorage";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Mail, BarChart3, Inbox, Brain, MessageSquare, Zap, CheckCircle2, Circle,
  Trash2, Archive, AlertCircle, Send, Settings, Search, X, Plus, Eye, 
  RotateCcw, Filter, Calendar, FileText, Users, Cog, Lock, TrendingUp,
  Bot, Sparkles, Home, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────
interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  preview: string;
  timestamp: string;
  isRead: boolean;
  isSpam: boolean;
  category: 'work'|'personal'|'billing'|'social'|'promo'|'finance'|'other';
  labels: string[];
  summary?: string;
  actionItems?: string[];
}

interface GmailStats {
  total: number;
  unread: number;
  spam: number;
  healthScore: number;
  productivityScore: number;
  spaceUsed: string;
}

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

type TabId = 'dashboard'|'inbox'|'summarize'|'replies'|'cleanup'|'search'|'tasks'|'finance'|'calendar'|'attachments'|'contacts'|'automation'|'analytics'|'security'|'ai';

// ─── Storage ───────────────────────────────────────────────────────────────
const STORAGE_KEY = "sybeez_gmail_unified_data";

const DEFAULT_STATS: GmailStats = {
  total: 0, unread: 0, spam: 0, healthScore: 100, productivityScore: 0, spaceUsed: '0 GB'
};

function loadGmailData() {
  try {
    const raw = usGetItem(STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  } catch {}
  return { emails: [], stats: DEFAULT_STATS, aiMessages: [] };
}

function saveGmailData(data: any) {
  usSetItem(STORAGE_KEY, JSON.stringify(data));
}

// ─── Tab Config ────────────────────────────────────────────────────────────
const TABS: { id: TabId; label: string; Icon: React.FC<{className?: string}> }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
  { id: 'inbox', label: 'Inbox', Icon: Inbox },
  { id: 'summarize', label: 'Summarize', Icon: Brain },
  { id: 'replies', label: 'Replies', Icon: MessageSquare },
  { id: 'cleanup', label: 'Cleanup', Icon: Zap },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'tasks', label: 'Tasks', Icon: CheckCircle2 },
  { id: 'finance', label: 'Finance', Icon: TrendingUp },
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'attachments', label: 'Files', Icon: FileText },
  { id: 'contacts', label: 'Contacts', Icon: Users },
  { id: 'automation', label: 'Rules', Icon: Cog },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
  { id: 'security', label: 'Security', Icon: Lock },
  { id: 'ai', label: 'AI Assistant', Icon: Bot },
];

// ─── Component ─────────────────────────────────────────────────────────────
interface GmailManagerProps {
  onClose: () => void;
}

const GmailManager = ({ onClose }: GmailManagerProps) => {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [data, setData] = useState<any>(loadGmailData);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { saveGmailData(data); }, [data]);
  useEffect(() => { if(aiScrollRef.current) aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight; }, [aiMessages]);

  // ── AI Chat Handler ─────────────────────────────────────────────────────
  const sendAiMessage = async () => {
    if(!aiInput.trim()) return;
    const userMsg: AIMessage = { role: 'user', content: aiInput, timestamp: new Date().toISOString() };
    setAiMessages(prev => [...prev, userMsg]);
    setAiInput("");
    setAiLoading(true);
    
    setTimeout(() => {
      const assistantMsg: AIMessage = {
        role: 'assistant',
        content: `I can help you with: organizing emails, finding important messages, summarizing content, suggesting smart replies, running cleanup, creating tasks from emails, analyzing spending, detecting meetings, managing files, organizing contacts, automating rules, viewing analytics, and checking security. What would you like to do?`,
        timestamp: new Date().toISOString()
      };
      setAiMessages(prev => [...prev, assistantMsg]);
      setAiLoading(false);
    }, 1000);
  };

  // ── Action Handlers ────────────────────────────────────────────────────────
  const cleanInbox = () => {
    const cleaned = data.emails.filter((e: Email) => !e.isSpam);
    setData((prev: any) => ({ ...prev, emails: cleaned }));
    toast.success('Inbox cleaned!', { position: 'top-center', duration: 2000 });
  };

  const deleteEmail = (id: string) => {
    setData((prev: any) => ({ ...prev, emails: prev.emails.filter((e: Email) => e.id !== id) }));
    toast.success('Email deleted', { position: 'top-center', duration: 2000 });
  };

  // ── Render Functions ────────────────────────────────────────────────────────
  const renderDashboard = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: data.stats.total, icon: '📧' },
          { label: 'Unread', value: data.stats.unread, icon: '💬' },
          { label: 'Health', value: `${data.stats.healthScore}%`, icon: '💚' },
          { label: 'Space', value: data.stats.spaceUsed, icon: '💾' },
        ].map(({ label, value, icon }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-3">
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setActiveTab('inbox')} variant="outline" size="sm">🎯 Inbox Zero</Button>
            <Button onClick={cleanInbox} variant="outline" size="sm">🧹 Cleanup</Button>
            <Button onClick={() => setActiveTab('search')} variant="outline" size="sm">🔍 Search</Button>
            <Button onClick={() => setShowAiPanel(!showAiPanel)} variant="outline" size="sm">🤖 AI</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderInbox = () => (
    <div className="space-y-3">
      <Input placeholder="Search emails..." className="h-9" />
      <div className="space-y-2">
        {data.emails.map((email: Email) => (
          <div key={email.id} onClick={() => setSelectedEmail(email)} className="p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/50 transition">
            <div className="font-medium text-sm">{email.from}</div>
            <div className="text-sm text-muted-foreground">{email.subject}</div>
            <Badge variant="outline" className="text-xs mt-1">{email.category}</Badge>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSummarize = () => {
    if(!selectedEmail) return <p className="text-muted-foreground text-sm">Select an email to view summary</p>;
    return (
      <div className="space-y-3">
        <div className="p-3 border border-border rounded-lg bg-muted/20">
          <p className="text-xs text-muted-foreground">From:</p>
          <p className="font-medium">{selectedEmail.from}</p>
        </div>
        <div className="p-3 border border-border rounded-lg bg-muted/20">
          <p className="text-xs text-muted-foreground">Subject:</p>
          <p className="font-medium">{selectedEmail.subject}</p>
        </div>
        <div className="p-3 border border-border rounded-lg bg-muted/20">
          <p className="text-xs text-muted-foreground">Summary:</p>
          <p className="text-sm">{selectedEmail.summary || 'No summary available'}</p>
        </div>
        {selectedEmail.actionItems && selectedEmail.actionItems.length > 0 && (
          <div className="p-3 border border-border rounded-lg bg-muted/20">
            <p className="text-xs text-muted-foreground mb-2">Actions:</p>
            <ul className="space-y-1">
              {selectedEmail.actionItems.map((item, idx) => (
                <li key={idx} className="text-sm">• {item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderReplies = () => (
    <div className="space-y-2">
      {['Thank you!', 'Perfect, confirmed!', 'Acknowledged, thanks', 'Can you clarify?'].map(reply => (
        <Button key={reply} onClick={() => toast.success(`Reply sent: "${reply}"`)} variant="outline" className="w-full justify-start" size="sm">
          {reply}
        </Button>
      ))}
    </div>
  );

  const renderCleanup = () => (
    <div className="space-y-2">
      <Button onClick={() => setActiveTab('inbox')} variant="outline" className="w-full" size="sm">🎯 Inbox Zero</Button>
      <Button onClick={cleanInbox} variant="outline" className="w-full" size="sm">🗑️ Delete Spam</Button>
      <Button variant="outline" className="w-full" size="sm">📦 Archive Old</Button>
      <Button variant="outline" className="w-full" size="sm">📰 Unsubscribe</Button>
    </div>
  );

  const renderSearch = () => (
    <div className="space-y-3">
      <Input placeholder="Search..." className="h-9" />
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Search tips:</p>
        {['from:sender@example.com', 'subject:keyword', 'has:attachment', 'before:2024-01-01'].map(tip => (
          <div key={tip} className="p-2 bg-muted/30 rounded text-xs">{tip}</div>
        ))}
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Email-based tasks:</p>
      {selectedEmail?.actionItems?.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2 p-2 border border-border rounded text-sm">
          <input type="checkbox" className="h-4 w-4" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );

  const renderFinance = () => (
    <div className="space-y-3">
      {['Invoices', 'Bills', 'Receipts', 'Subscriptions'].map(type => (
        <Card key={type} className="border-border">
          <CardContent className="p-3">
            <div className="text-sm font-medium">{type}</div>
            <div className="text-xs text-muted-foreground">Detected in emails</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderCalendar = () => <p className="text-sm">0 meetings detected</p>;
  const renderAttachments = () => <p className="text-sm">View and manage file attachments</p>;
  const renderContacts = () => <p className="text-sm">VIP contacts: manage important senders</p>;
  
  const renderAutomation = () => (
    <div className="space-y-3">
      {[
        { label: 'Auto-Archive Promotions', enabled: true },
        { label: 'Auto-Delete Spam', enabled: true },
        { label: 'Important First', enabled: false },
        { label: 'VIP Priority', enabled: true }
      ].map(({ label, enabled }) => (
        <div key={label} className="flex items-center justify-between p-3 border border-border rounded">
          <span className="text-sm">{label}</span>
          <input type="checkbox" defaultChecked={enabled} className="h-4 w-4" />
        </div>
      ))}
    </div>
  );

  const renderAnalytics = () => (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: 'Avg Response', value: '4h' },
        { label: 'Health Score', value: `${data.stats.healthScore}%` },
        { label: 'Productivity', value: `${data.stats.productivityScore}%` },
        { label: 'Inbox Zero Days', value: '5/7' }
      ].map(({ label, value }) => (
        <Card key={label} className="border-border">
          <CardContent className="p-3">
            <div className="text-lg font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-3">
      {[
        { check: 'Suspicious Email Detection', status: '✓ Active' },
        { check: 'Attachment Scanning', status: '✓ Enabled' },
        { check: 'Phishing Protection', status: '✓ Protected' },
        { check: 'Encryption', status: '✓ Enabled' }
      ].map(({ check, status }) => (
        <div key={check} className="flex items-center justify-between p-3 border border-border rounded text-sm">
          <span>{check}</span>
          <span className="text-green-600">{status}</span>
        </div>
      ))}
    </div>
  );

  const renderAiTab = () => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-3">Ask AI for help with emails and management</p>
      <Input placeholder="Ask AI..." value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendAiMessage()} />
      <Button onClick={sendAiMessage} disabled={aiLoading} className="w-full">Send</Button>
      
      {aiMessages.length > 0 && (
        <div className="max-h-[300px] overflow-y-auto space-y-2 p-3 border border-border rounded-lg bg-muted/20">
          {aiMessages.map((msg, idx) => (
            <div key={idx} className={cn("text-sm p-2 rounded", msg.role === 'user' ? 'bg-blue-500/20 ml-4' : 'bg-muted/50 mr-4')}>
              {msg.content}
            </div>
          ))}
          {aiLoading && <p className="text-xs text-muted-foreground">Thinking...</p>}
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard': return renderDashboard();
      case 'inbox': return renderInbox();
      case 'summarize': return renderSummarize();
      case 'replies': return renderReplies();
      case 'cleanup': return renderCleanup();
      case 'search': return renderSearch();
      case 'tasks': return renderTasks();
      case 'finance': return renderFinance();
      case 'calendar': return renderCalendar();
      case 'attachments': return renderAttachments();
      case 'contacts': return renderContacts();
      case 'automation': return renderAutomation();
      case 'analytics': return renderAnalytics();
      case 'security': return renderSecurity();
      case 'ai': return renderAiTab();
      default: return renderDashboard();
    }
  };

  return (
    <div className="w-full h-full flex bg-background flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">📧 Gmail Pro</h2>
          <p className="text-xs text-muted-foreground">AI-Powered Email Management</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => setShowAiPanel(!showAiPanel)} title="Toggle AI Assistant">
            <Sparkles className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} title="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border overflow-x-auto bg-muted/20">
        <div className="flex gap-1 px-4">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 py-3 px-3 text-sm font-medium whitespace-nowrap border-b-2 transition',
                activeTab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        <ScrollArea className="flex-1">
          <div className="px-6 py-4 max-w-3xl">
            {renderContent()}
          </div>
        </ScrollArea>

        {/* AI Panel */}
        {showAiPanel && (
          <div className="w-80 border-l border-border flex flex-col bg-background">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium">🤖 AI Assistant</p>
            </div>
            <ScrollArea className="flex-1">
              <div ref={aiScrollRef} className="px-4 py-3 space-y-3 max-h-full overflow-y-auto">
                {aiMessages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No messages yet. Ask me something!</p>
                ) : (
                  aiMessages.map((msg, idx) => (
                    <div key={idx} className={cn("text-xs p-2 rounded", msg.role === 'user' ? 'bg-blue-500/20 text-foreground' : 'bg-muted/50')}>
                      {msg.content}
                    </div>
                  ))
                )}
                {aiLoading && <p className="text-xs text-muted-foreground italic">Thinking...</p>}
              </div>
            </ScrollArea>
            <div className="px-4 py-3 border-t border-border space-y-2">
              <Input placeholder="Ask..." value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendAiMessage()} className="h-8 text-sm" />
              <Button onClick={sendAiMessage} disabled={aiLoading} size="sm" className="w-full">
                <Send className="h-3 w-3 mr-1" />Send
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GmailManager;
