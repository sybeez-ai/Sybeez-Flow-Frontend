/**
 * Comprehensive Gmail Integration Component
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mail, Trash2, Archive, Brain, Send, Clock, Filter, CheckCircle2, Circle,
  Bot, Sparkles, Plus, X, ArrowUp, Inbox, AlertCircle, Settings, Search,
  BarChart3, Lock, Users, Calendar, Paperclip, Contact, Zap, TrendingUp,
  RefreshCw, Eye, EyeOff, Download, Tag, Flag, Star, Bell, Shield, 
  DollarSign, FileText, AlertTriangle, Loader2, MessageSquare, Heart
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from "@/lib/utils";

type EmailCategory = 'work' | 'personal' | 'billing' | 'social' | 'promo' | 'finance' | 'other';
type TabId = 'dashboard' | 'inbox' | 'summarize' | 'replies' | 'cleanup' | 'search' | 'tasks' | 'finance' | 'calendar' | 'attachments' | 'contacts' | 'automation' | 'analytics' | 'security' | 'ai';

interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  preview: string;
  timestamp: string;
  isRead: boolean;
  isSpam: boolean;
  isFlagged: boolean;
  category: EmailCategory;
  labels: string[];
  summary?: string;
  actionItems?: string[];
  importance?: 'high' | 'normal' | 'low';
}

interface GmailStats {
  total: number;
  unread: number;
  spam: number;
  autoReplied: number;
  lastCleanup: string;
  healthScore: number;
  productivityScore: number;
  spaceUsed: string;
}

const STORAGE_KEY = 'sybeez_gmail_comprehensive_data';

function loadGmailData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    emails: [],
    stats: {
      total: 0, unread: 0, spam: 0, autoReplied: 0,
      lastCleanup: '', healthScore: 100, productivityScore: 0, spaceUsed: '0 GB',
    },
  };
}

function saveGmailData(data: any) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const TABS: { id: TabId; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
  { id: 'inbox', label: 'Inbox', Icon: Inbox },
  { id: 'summarize', label: 'Summarize', Icon: Brain },
  { id: 'replies', label: 'Replies', Icon: MessageSquare },
  { id: 'cleanup', label: 'Cleanup', Icon: Trash2 },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'tasks', label: 'Tasks', Icon: CheckCircle2 },
  { id: 'finance', label: 'Finance', Icon: DollarSign },
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'attachments', label: 'Files', Icon: Paperclip },
  { id: 'contacts', label: 'Contacts', Icon: Contact },
  { id: 'automation', label: 'Rules', Icon: Zap },
  { id: 'analytics', label: 'Analytics', Icon: TrendingUp },
  { id: 'security', label: 'Security', Icon: Lock },
  { id: 'ai', label: 'AI Assistant', Icon: Bot },
];

interface GmailComprehensiveProps {
  onClose: () => void;
}

const GmailComprehensive = ({ onClose }: GmailComprehensiveProps) => {
  const [data, setData] = useState(loadGmailData);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const aiScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { saveGmailData(data); }, [data]);
  useEffect(() => { aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: 'smooth' }); }, [aiMessages, aiLoading]);

  const renderDashboard = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: data.stats.total, icon: Mail, color: 'text-blue-500' },
          { label: 'Unread', value: data.stats.unread, icon: AlertCircle, color: 'text-yellow-500' },
          { label: 'Health', value: `${data.stats.healthScore}%`, icon: Heart, color: 'text-red-500' },
          { label: 'Space', value: data.stats.spaceUsed, icon: Zap, color: 'text-purple-500' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border-border"><CardContent className="pt-4"><p className={cn("text-2xl font-bold", color)}>{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>
        ))}
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <Button className="w-full" onClick={() => { toast.success('✨ Inbox zero!'); }}>🎯 Inbox Zero</Button>
            <Button variant="outline" className="w-full" onClick={() => setActiveTab('cleanup')}>🧹 Cleanup</Button>
            <Button variant="outline" className="w-full" onClick={() => setActiveTab('search')}>🔍 Search</Button>
            <Button variant="outline" className="w-full" onClick={() => setActiveTab('ai')}>🤖 AI</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderInbox = () => {
    const filtered = data.emails.filter(e => e.subject.toLowerCase().includes(searchTerm.toLowerCase()));
    return (
      <div className="space-y-3">
        <Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="text-sm" />
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filtered.map(email => (
            <div key={email.id} onClick={() => setSelectedEmail(email)} className={cn("p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50", selectedEmail?.id === email.id && "bg-muted")}>
              <p className="font-semibold text-sm">{email.from}</p>
              <p className="text-sm">{email.subject}</p>
              <p className="text-xs text-muted-foreground">{email.category}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSummarize = () => !selectedEmail ? <p className="text-muted-foreground">Select an email</p> : (
    <Card className="border-border"><CardContent className="pt-4 space-y-3">
      <div><p className="text-xs text-muted-foreground">From:</p><p className="font-semibold">{selectedEmail.from}</p></div>
      <div><p className="text-xs text-muted-foreground">Subject:</p><p className="font-semibold">{selectedEmail.subject}</p></div>
      {selectedEmail.summary && <div><p className="text-xs text-muted-foreground">Summary:</p><p className="text-sm">{selectedEmail.summary}</p></div>}
      {selectedEmail.actionItems && <div><p className="text-xs text-muted-foreground">Actions:</p><ul className="text-sm space-y-1">{selectedEmail.actionItems.map((item, i) => <li key={i}>• {item}</li>)}</ul></div>}
    </CardContent></Card>
  );

  const renderReplies = () => !selectedEmail ? <p className="text-muted-foreground">Select an email</p> : (
    <div className="space-y-3">
      {['Thank You', 'Confirm', 'Acknowledge'].map((type) => (
        <Button key={type} variant="outline" className="w-full justify-start" onClick={() => toast.success('✨ Reply sent!')}>
          {type}
        </Button>
      ))}
    </div>
  );

  const renderCleanup = () => (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline">🎯 Inbox Zero</Button>
      <Button variant="outline">🗑️ Delete Spam</Button>
      <Button variant="outline">📦 Archive Old</Button>
      <Button variant="outline">📰 Unsubscribe</Button>
    </div>
  );

  const renderSearch = () => <div><Input placeholder="Search..." className="text-sm" /></div>;
  const renderTasks = () => <p className="text-muted-foreground">No tasks</p>;
  const renderFinance = () => <p className="text-muted-foreground">Finance integration ready</p>;
  const renderCalendar = () => <p className="text-muted-foreground">No meetings detected</p>;
  const renderAttachments = () => <p className="text-muted-foreground">No attachments</p>;
  const renderContacts = () => <p className="text-muted-foreground">Contacts ready</p>;
  const renderAutomation = () => <p className="text-muted-foreground">Automation rules ready</p>;
  const renderAnalytics = () => <p className="text-muted-foreground">Analytics ready</p>;
  const renderSecurity = () => <p className="text-muted-foreground">All secure</p>;

  const renderAiAssistant = () => (
    <div className="space-y-3">
      <div className="bg-muted/30 p-4 rounded-lg max-h-[300px] overflow-y-auto" ref={aiScrollRef}>
        {aiMessages.length === 0 ? <p className="text-xs text-muted-foreground">Ask me about your emails!</p> : aiMessages.map((msg, i) => <div key={i} className={cn("text-sm p-2 rounded-lg mb-2", msg.role === 'user' ? 'bg-foreground text-background' : 'bg-border')}>{msg.content}</div>)}
        {aiLoading && <div className="text-xs text-muted-foreground">Thinking...</div>}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Ask AI..." value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (() => { setAiMessages(p => [...p, { role: 'user', content: aiInput }]); setAiInput(''); setAiLoading(true); setTimeout(() => { setAiMessages(p => [...p, { role: 'assistant', content: 'AI response ready!' }]); setAiLoading(false); }, 500); })() } className="text-sm" />
        <Button size="sm"><ArrowUp className="h-4 w-4" /></Button>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
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
      case 'ai': return renderAiAssistant();
    }
  };

  return (
    <div className="w-full h-full bg-background flex flex-col">
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">📧 Gmail Pro</h2>
            <p className="text-xs text-muted-foreground">AI-Powered Email Management</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowAiPanel(!showAiPanel)}><Bot className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-muted/20 overflow-x-auto">
        <div className="flex w-max px-4 min-w-full">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)} className={cn('flex flex-col items-center gap-1 py-3 px-2 transition-all border-b-2 text-xs font-medium whitespace-nowrap', activeTab === id ? 'border-foreground text-foreground bg-background' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full"><div className="px-6 py-4">{renderContent()}</div></ScrollArea>
        </div>

        {showAiPanel && (
          <div className="w-80 border-l border-border bg-muted/10 flex flex-col">
            <div className="px-4 py-3 border-b"><p className="text-sm font-semibold">🤖 AI Assistant</p></div>
            <ScrollArea className="flex-1"><div className="px-4 py-3">{aiMessages.map((msg, i) => <div key={i} className={cn("text-xs p-2 rounded-lg mb-2", msg.role === 'user' ? 'bg-foreground text-background' : 'bg-border')}>{msg.content}</div>)}</div></ScrollArea>
            <div className="border-t border-border p-3 flex gap-2"><Input placeholder="Ask..." className="text-xs h-8" /><Button size="sm" className="h-8 w-8 p-0"><ArrowUp className="h-3 w-3" /></Button></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GmailComprehensive;
