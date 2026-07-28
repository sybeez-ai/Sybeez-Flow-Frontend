/**
 * Daily Journal Component
 * Quick notes, reflections, and thoughts
 */

import { useState } from "react";
import { 
  BookOpen, 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Check,
  Calendar,
  Tag,
  ChevronDown,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { JournalEntry } from "@/types/dailyLife";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DailyJournalProps {
  entries: JournalEntry[];
  onAddEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateEntry: (entryId: string, updates: Partial<JournalEntry>) => void;
  onDeleteEntry: (entryId: string) => void;
}

const WRITING_PROMPTS = [
  "What are you grateful for today?",
  "What's one thing you learned today?",
  "How are you feeling right now?",
  "What's your biggest goal this week?",
  "What made you smile today?",
  "What challenge did you overcome?",
  "What are you looking forward to?",
  "Describe your perfect day."
];

const DailyJournal = ({ 
  entries, 
  onAddEntry, 
  onUpdateEntry,
  onDeleteEntry 
}: DailyJournalProps) => {
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryContent, setEntryContent] = useState('');
  const [entryTags, setEntryTags] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().split('T')[0];
  const todayEntries = entries.filter(e => e.date === today).length;
  
  // Calculate streak
  const calculateStreak = (): number => {
    const dates = [...new Set(entries.map(e => e.date))].sort().reverse();
    if (dates.length === 0) return 0;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    if (dates[0] !== todayStr && dates[0] !== yesterdayStr) return 0;
    
    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
      const current = new Date(dates[i - 1]);
      const prev = new Date(dates[i]);
      const diff = (current.getTime() - prev.getTime()) / 86400000;
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  };

  const streak = calculateStreak();

  // Get random prompt
  const getRandomPrompt = () => {
    const prompt = WRITING_PROMPTS[Math.floor(Math.random() * WRITING_PROMPTS.length)];
    setEntryContent(prompt + "\n\n");
    setShowNewEntry(true);
  };

  // Toggle expand
  const toggleExpand = (entryId: string) => {
    setExpandedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  };

  // Handle add entry
  const handleAddEntry = () => {
    if (!entryContent.trim()) {
      toast.error('Please write something');
      return;
    }

    const tags = entryTags.split(',').map(t => t.trim()).filter(t => t);
    
    onAddEntry({
      date: today,
      title: entryTitle || undefined,
      content: entryContent,
      tags: tags.length > 0 ? tags : undefined
    });

    setEntryTitle('');
    setEntryContent('');
    setEntryTags('');
    setShowNewEntry(false);
    toast.success('Entry saved!');
  };

  // Handle edit entry
  const handleSaveEdit = (entryId: string) => {
    if (!editContent.trim()) return;
    onUpdateEntry(entryId, { content: editContent });
    setEditingEntryId(null);
    setEditContent('');
    toast.success('Entry updated!');
  };

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      entry.content.toLowerCase().includes(query) ||
      entry.title?.toLowerCase().includes(query) ||
      entry.tags?.some(t => t.toLowerCase().includes(query))
    );
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Group entries by date
  const groupedEntries = filteredEntries.reduce((groups, entry) => {
    const date = entry.date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
    return groups;
  }, {} as Record<string, JournalEntry[]>);

  // Format date display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const todayDate = new Date();
    const yesterday = new Date(todayDate);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (dateStr === todayDate.toISOString().split('T')[0]) return 'Today';
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-3 border border-border rounded-lg">
          <p className="text-2xl font-bold text-foreground">{entries.length}</p>
          <p className="text-[10px] text-muted-foreground">Total Entries</p>
        </div>
        <div className="text-center p-3 border border-border rounded-lg">
          <p className="text-2xl font-bold text-foreground">{todayEntries}</p>
          <p className="text-[10px] text-muted-foreground">Today</p>
        </div>
        <div className="text-center p-3 border border-border rounded-lg">
          <p className="text-2xl font-bold text-foreground">{streak}</p>
          <p className="text-[10px] text-muted-foreground">Day Streak</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          className="flex-1"
          onClick={() => setShowNewEntry(!showNewEntry)}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Entry
        </Button>
        <Button 
          variant="outline"
          onClick={getRandomPrompt}
          title="Get writing prompt"
        >
          <Sparkles className="h-4 w-4" />
        </Button>
      </div>

      {/* New Entry Form */}
      {showNewEntry && (
        <div className="p-4 border border-border rounded-lg space-y-3 bg-muted/30">
          <Input
            placeholder="Title (optional)"
            value={entryTitle}
            onChange={(e) => setEntryTitle(e.target.value)}
          />
          
          <textarea
            placeholder="Write your thoughts..."
            value={entryContent}
            onChange={(e) => setEntryContent(e.target.value)}
            className="w-full min-h-[120px] px-3 py-2 rounded-md border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
          
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tags (comma separated)"
              value={entryTags}
              onChange={(e) => setEntryTags(e.target.value)}
              className="flex-1"
            />
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleAddEntry} className="flex-1">
              <Check className="h-4 w-4 mr-2" />
              Save Entry
            </Button>
            <Button variant="outline" onClick={() => setShowNewEntry(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search entries..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Entries List */}
      <div className="space-y-4">
        {Object.keys(groupedEntries).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No entries yet</p>
            <p className="text-xs">Start journaling to track your thoughts!</p>
          </div>
        ) : (
          Object.entries(groupedEntries).map(([date, dateEntries]) => (
            <div key={date}>
              {/* Date Header */}
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{formatDate(date)}</span>
                <Badge variant="outline" className="text-[10px]">{dateEntries.length}</Badge>
              </div>
              
              {/* Entries for this date */}
              <div className="space-y-2 pl-5">
                {dateEntries.map(entry => {
                  const isExpanded = expandedEntries.has(entry.id);
                  const isEditing = editingEntryId === entry.id;
                  const preview = entry.content.slice(0, 100);
                  const hasMore = entry.content.length > 100;
                  
                  return (
                    <div 
                      key={entry.id}
                      className="p-3 border border-border rounded-lg bg-background"
                    >
                      {/* Entry Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {entry.title && (
                            <span className="font-medium text-sm">{entry.title}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingEntryId(entry.id);
                              setEditContent(entry.content);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => onDeleteEntry(entry.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Entry Content */}
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full min-h-[80px] px-3 py-2 rounded-md border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveEdit(entry.id)}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingEntryId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-foreground whitespace-pre-wrap">
                            {isExpanded ? entry.content : preview}
                            {hasMore && !isExpanded && '...'}
                          </p>
                          {hasMore && (
                            <button
                              onClick={() => toggleExpand(entry.id)}
                              className="text-xs text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1"
                            >
                              {isExpanded ? (
                                <>Show less <ChevronDown className="h-3 w-3" /></>
                              ) : (
                                <>Read more <ChevronRight className="h-3 w-3" /></>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                      
                      {/* Tags */}
                      {entry.tags && entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entry.tags.map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-[10px]">
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DailyJournal;
