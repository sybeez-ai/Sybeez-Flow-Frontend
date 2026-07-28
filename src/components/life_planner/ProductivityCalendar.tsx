/**
 * Productivity Calendar Component
 * Month and Week views with event management
 */

import { useState, useMemo } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Plus,
  Clock,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CalendarEvent, DailyScheduleBlock } from "@/types/dailyLife";
import { cn } from "@/lib/utils";

interface ProductivityCalendarProps {
  events: CalendarEvent[];
  scheduleBlocks: DailyScheduleBlock[];
  onAddEvent?: (event: Omit<CalendarEvent, 'id'>) => void;
  onSelectDate?: (date: Date) => void;
  selectedDate?: Date;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const ProductivityCalendar = ({ 
  events, 
  scheduleBlocks, 
  onAddEvent,
  onSelectDate,
  selectedDate: propSelectedDate 
}: ProductivityCalendarProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(propSelectedDate || new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    startTime: '09:00',
    endTime: '10:00',
    category: 'work' as CalendarEvent['category']
  });

  // Get calendar grid for current month
  const calendarGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const grid: Date[][] = [];
    let currentWeek: Date[] = [];
    const current = new Date(startDate);
    
    while (current <= lastDay || currentWeek.length > 0) {
      currentWeek.push(new Date(current));
      if (currentWeek.length === 7) {
        grid.push(currentWeek);
        currentWeek = [];
        if (current > lastDay) break;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return grid;
  }, [currentDate]);

  // Get week dates
  const weekDates = useMemo(() => {
    const dates: Date[] = [];
    const start = new Date(selectedDate);
    start.setDate(start.getDate() - start.getDay());
    
    for (let i = 0; i < 7; i++) {
      dates.push(new Date(start));
      start.setDate(start.getDate() + 1);
    }
    
    return dates;
  }, [selectedDate]);

  // Get events for a specific date
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(e => e.date === dateStr);
  };

  // Get schedule blocks for a specific date (if today)
  const getScheduleForDate = (date: Date): DailyScheduleBlock[] => {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return scheduleBlocks;
    }
    return [];
  };

  // Check if date is today
  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Check if date is selected
  const isSelected = (date: Date): boolean => {
    return date.toDateString() === selectedDate.toDateString();
  };

  // Check if date is in current month
  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentDate.getMonth();
  };

  // Navigate months
  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
      return newDate;
    });
  };

  // Navigate weeks
  const navigateWeek = (direction: 'prev' | 'next') => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      return newDate;
    });
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      return newDate;
    });
  };

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    onSelectDate?.(date);
  };

  // Handle add event
  const handleAddEvent = () => {
    if (!newEvent.title.trim()) return;
    
    onAddEvent?.({
      title: newEvent.title,
      startTime: newEvent.startTime,
      endTime: newEvent.endTime,
      date: selectedDate.toISOString().split('T')[0],
      isAllDay: false,
      category: newEvent.category,
      isRecurring: false,
      source: 'manual'
    });
    
    setNewEvent({ title: '', startTime: '09:00', endTime: '10:00', category: 'work' });
    setShowAddEvent(false);
  };

  // Get category color
  const getCategoryColor = (category: CalendarEvent['category']): string => {
    const colors = {
      work: 'bg-blue-500',
      personal: 'bg-green-500',
      health: 'bg-red-500',
      social: 'bg-purple-500',
      other: 'bg-gray-500'
    };
    return colors[category] || colors.other;
  };

  // Time slots for week view
  const timeSlots = Array.from({ length: 24 }, (_, i) => 
    `${i.toString().padStart(2, '0')}:00`
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-foreground" />
          <span className="font-medium text-sm text-foreground">
            {view === 'month' 
              ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
              : `Week of ${weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            }
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={() => view === 'month' ? navigateMonth('prev') : navigateWeek('prev')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={() => view === 'month' ? navigateMonth('next') : navigateWeek('next')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex border border-border rounded-md ml-2">
            <Button
              variant={view === 'month' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs rounded-r-none"
              onClick={() => setView('month')}
            >
              Month
            </Button>
            <Button
              variant={view === 'week' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs rounded-l-none"
              onClick={() => setView('week')}
            >
              Week
            </Button>
          </div>
        </div>
      </div>

      {/* Month View */}
      {view === 'month' && (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 bg-muted/50">
            {DAYS.map(day => (
              <div key={day} className="text-center py-2 text-xs font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar grid */}
          <div className="divide-y divide-border">
            {calendarGrid.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 divide-x divide-border">
                {week.map((date, dayIndex) => {
                  const dayEvents = getEventsForDate(date);
                  const daySchedule = getScheduleForDate(date);
                  const hasItems = dayEvents.length > 0 || daySchedule.length > 0;
                  
                  return (
                    <button
                      key={dayIndex}
                      onClick={() => handleDateSelect(date)}
                      className={cn(
                        "min-h-[60px] p-1 text-left transition-colors hover:bg-muted/50",
                        !isCurrentMonth(date) && "bg-muted/20 text-muted-foreground",
                        isSelected(date) && "bg-foreground/10 ring-1 ring-foreground",
                        isToday(date) && "bg-primary/10"
                      )}
                    >
                      <div className={cn(
                        "text-xs font-medium mb-1",
                        isToday(date) && "text-primary font-bold"
                      )}>
                        {date.getDate()}
                      </div>
                      
                      {/* Event indicators */}
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 2).map(event => (
                          <div
                            key={event.id}
                            className={cn(
                              "text-[10px] px-1 rounded truncate text-white",
                              getCategoryColor(event.category)
                            )}
                          >
                            {event.title}
                          </div>
                        ))}
                        {daySchedule.length > 0 && dayEvents.length < 2 && (
                          <div className="flex gap-0.5">
                            {daySchedule.filter(s => s.isCompleted).length > 0 && (
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            )}
                            {daySchedule.filter(s => !s.isCompleted).length > 0 && (
                              <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            )}
                          </div>
                        )}
                        {(dayEvents.length > 2) && (
                          <div className="text-[10px] text-muted-foreground">
                            +{dayEvents.length - 2} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Week View */}
      {view === 'week' && (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-8 bg-muted/50 border-b border-border">
            <div className="text-center py-2 text-xs font-medium text-muted-foreground border-r border-border">
              Time
            </div>
            {weekDates.map((date, i) => (
              <button
                key={i}
                onClick={() => handleDateSelect(date)}
                className={cn(
                  "text-center py-2 transition-colors hover:bg-muted",
                  isToday(date) && "bg-primary/10",
                  isSelected(date) && "bg-foreground/10"
                )}
              >
                <div className="text-xs font-medium text-muted-foreground">{DAYS[i]}</div>
                <div className={cn(
                  "text-sm font-bold",
                  isToday(date) && "text-primary"
                )}>
                  {date.getDate()}
                </div>
              </button>
            ))}
          </div>
          
          {/* Time grid */}
          <div className="max-h-[300px] overflow-y-auto">
            {timeSlots.filter((_, i) => i >= 6 && i <= 22).map(time => (
              <div key={time} className="grid grid-cols-8 divide-x divide-border border-b border-border">
                <div className="text-xs text-muted-foreground p-1 text-center bg-muted/20">
                  {time}
                </div>
                {weekDates.map((date, i) => {
                  const dayEvents = getEventsForDate(date).filter(e => e.startTime?.startsWith(time.split(':')[0]));
                  const daySchedule = isToday(date) 
                    ? scheduleBlocks.filter(s => s.startTime?.startsWith(time.split(':')[0]))
                    : [];
                  
                  return (
                    <div key={i} className="min-h-[40px] p-0.5 hover:bg-muted/30 transition-colors">
                      {dayEvents.map(event => (
                        <div
                          key={event.id}
                          className={cn(
                            "text-[10px] px-1 py-0.5 rounded text-white mb-0.5",
                            getCategoryColor(event.category)
                          )}
                        >
                          {event.title}
                        </div>
                      ))}
                      {daySchedule.map(block => (
                        <div
                          key={block.id}
                          className={cn(
                            "text-[10px] px-1 py-0.5 rounded mb-0.5 border",
                            block.isCompleted 
                              ? "bg-green-500/20 border-green-500/40 text-green-700" 
                              : "bg-orange-500/20 border-orange-500/40 text-orange-700"
                          )}
                        >
                          {block.title}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected Date Events */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">
            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 text-xs"
            onClick={() => setShowAddEvent(!showAddEvent)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Event
          </Button>
        </div>

        {/* Add Event Form */}
        {showAddEvent && (
          <div className="p-3 border border-border rounded-lg space-y-2 bg-muted/20">
            <Input
              placeholder="Event title..."
              value={newEvent.title}
              onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              className="h-8 text-xs"
            />
            <div className="flex gap-2">
              <Input
                type="time"
                value={newEvent.startTime}
                onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                className="h-8 text-xs flex-1"
              />
              <Input
                type="time"
                value={newEvent.endTime}
                onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                className="h-8 text-xs flex-1"
              />
            </div>
            <div className="flex gap-2">
              {(['work', 'personal', 'health', 'social'] as const).map(cat => (
                <Button
                  key={cat}
                  variant={newEvent.category === cat ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px] flex-1"
                  onClick={() => setNewEvent({ ...newEvent, category: cat })}
                >
                  {cat}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs flex-1" onClick={handleAddEvent}>
                Add
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => setShowAddEvent(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Events list */}
        <div className="space-y-1">
          {getEventsForDate(selectedDate).map(event => (
            <div 
              key={event.id} 
              className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-muted/30 transition-colors"
            >
              <div className={cn("w-2 h-2 rounded-full", getCategoryColor(event.category))} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{event.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3 inline mr-1" />
                  {event.startTime} - {event.endTime}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px]">{event.category}</Badge>
            </div>
          ))}
          
          {getEventsForDate(selectedDate).length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">
              No events for this day
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductivityCalendar;
