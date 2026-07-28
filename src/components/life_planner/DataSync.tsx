/**
 * Data Sync Component
 * Export, import, and backup productivity data
 */

import { useState, useRef } from "react";
import { 
  Cloud, 
  Download, 
  Upload, 
  RefreshCw,
  Check,
  AlertCircle,
  HardDrive,
  Trash2,
  Copy,
  FileJson,
  Calendar,
  Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DataSyncProps {
  onDataImport: (data: any) => void;
  onDataExport: () => any;
  onDataClear: () => void;
}

interface BackupInfo {
  date: string;
  size: string;
  items: {
    tasks: number;
    habits: number;
    goals: number;
    journals: number;
    moods: number;
    sessions: number;
  };
}

const DataSync = ({ onDataImport, onDataExport, onDataClear }: DataSyncProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [lastBackup, setLastBackup] = useState<BackupInfo | null>(() => {
    const saved = localStorage.getItem('productivity_last_backup');
    return saved ? JSON.parse(saved) : null;
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate storage usage
  const getStorageUsage = (): { used: string; items: number } => {
    let totalSize = 0;
    let totalItems = 0;
    
    const keys = [
      'daily_tasks', 'gym_workouts', 'diet_plan', 'water_intake',
      'productivity_habits', 'productivity_goals', 'calendar_events',
      'pomodoro_sessions', 'pomodoro_settings', 'daily_stats',
      'mood_entries', 'journal_entries'
    ];
    
    keys.forEach(key => {
      const item = localStorage.getItem(key);
      if (item) {
        totalSize += item.length * 2; // UTF-16 characters = 2 bytes
        try {
          const data = JSON.parse(item);
          if (Array.isArray(data)) totalItems += data.length;
        } catch {}
      }
    });
    
    const sizeStr = totalSize < 1024 
      ? `${totalSize} B` 
      : totalSize < 1024 * 1024 
        ? `${(totalSize / 1024).toFixed(1)} KB`
        : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
    
    return { used: sizeStr, items: totalItems };
  };

  const storageUsage = getStorageUsage();

  // Export all data
  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate async
      
      const data = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: {
          tasks: JSON.parse(localStorage.getItem('daily_tasks') || '[]'),
          gymWorkouts: JSON.parse(localStorage.getItem('gym_workouts') || '[]'),
          dietPlan: JSON.parse(localStorage.getItem('diet_plan') || '[]'),
          waterIntake: parseInt(localStorage.getItem('water_intake') || '0'),
          habits: JSON.parse(localStorage.getItem('productivity_habits') || '[]'),
          goals: JSON.parse(localStorage.getItem('productivity_goals') || '[]'),
          calendarEvents: JSON.parse(localStorage.getItem('calendar_events') || '[]'),
          pomodoroSessions: JSON.parse(localStorage.getItem('pomodoro_sessions') || '[]'),
          pomodoroSettings: JSON.parse(localStorage.getItem('pomodoro_settings') || '{}'),
          dailyStats: JSON.parse(localStorage.getItem('daily_stats') || '[]'),
          moods: JSON.parse(localStorage.getItem('mood_entries') || '[]'),
          journals: JSON.parse(localStorage.getItem('journal_entries') || '[]')
        }
      };
      
      // Create and download file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `productivity-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      // Save backup info
      const backupInfo: BackupInfo = {
        date: new Date().toISOString(),
        size: storageUsage.used,
        items: {
          tasks: data.data.tasks.length,
          habits: data.data.habits.length,
          goals: data.data.goals.length,
          journals: data.data.journals.length,
          moods: data.data.moods.length,
          sessions: data.data.pomodoroSessions.length
        }
      };
      localStorage.setItem('productivity_last_backup', JSON.stringify(backupInfo));
      setLastBackup(backupInfo);
      
      toast.success('Data exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    }
    
    setIsExporting(false);
  };

  // Import data from file
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        // Validate data structure
        if (!data.version || !data.data) {
          throw new Error('Invalid backup file format');
        }
        
        // Import data
        if (data.data.tasks) localStorage.setItem('daily_tasks', JSON.stringify(data.data.tasks));
        if (data.data.gymWorkouts) localStorage.setItem('gym_workouts', JSON.stringify(data.data.gymWorkouts));
        if (data.data.dietPlan) localStorage.setItem('diet_plan', JSON.stringify(data.data.dietPlan));
        if (data.data.waterIntake) localStorage.setItem('water_intake', data.data.waterIntake.toString());
        if (data.data.habits) localStorage.setItem('productivity_habits', JSON.stringify(data.data.habits));
        if (data.data.goals) localStorage.setItem('productivity_goals', JSON.stringify(data.data.goals));
        if (data.data.calendarEvents) localStorage.setItem('calendar_events', JSON.stringify(data.data.calendarEvents));
        if (data.data.pomodoroSessions) localStorage.setItem('pomodoro_sessions', JSON.stringify(data.data.pomodoroSessions));
        if (data.data.pomodoroSettings) localStorage.setItem('pomodoro_settings', JSON.stringify(data.data.pomodoroSettings));
        if (data.data.dailyStats) localStorage.setItem('daily_stats', JSON.stringify(data.data.dailyStats));
        if (data.data.moods) localStorage.setItem('mood_entries', JSON.stringify(data.data.moods));
        if (data.data.journals) localStorage.setItem('journal_entries', JSON.stringify(data.data.journals));
        
        onDataImport(data.data);
        toast.success('Data imported successfully! Refresh to see changes.');
      } catch (error) {
        console.error('Import error:', error);
        toast.error('Failed to import data. Invalid file format.');
      }
      
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    
    reader.onerror = () => {
      toast.error('Failed to read file');
      setIsImporting(false);
    };
    
    reader.readAsText(file);
  };

  // Copy data to clipboard
  const handleCopyToClipboard = async () => {
    try {
      const data = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: {
          tasks: JSON.parse(localStorage.getItem('daily_tasks') || '[]'),
          habits: JSON.parse(localStorage.getItem('productivity_habits') || '[]'),
          goals: JSON.parse(localStorage.getItem('productivity_goals') || '[]'),
          journals: JSON.parse(localStorage.getItem('journal_entries') || '[]'),
          moods: JSON.parse(localStorage.getItem('mood_entries') || '[]')
        }
      };
      
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      toast.success('Data copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  // Clear all data
  const handleClearData = () => {
    const keys = [
      'daily_tasks', 'gym_workouts', 'diet_plan', 'water_intake',
      'productivity_habits', 'productivity_goals', 'calendar_events',
      'pomodoro_sessions', 'pomodoro_settings', 'daily_stats',
      'mood_entries', 'journal_entries', 'productivity_last_backup'
    ];
    
    keys.forEach(key => localStorage.removeItem(key));
    setLastBackup(null);
    setShowClearConfirm(false);
    onDataClear();
    toast.success('All data cleared. Refresh to reset completely.');
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      {/* Storage Status */}
      <div className="p-4 border border-border rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Local Storage</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {storageUsage.used}
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Items</span>
            <span className="font-medium">{storageUsage.items}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="text-green-500 flex items-center gap-1">
              <Check className="h-3 w-3" />
              Synced
            </span>
          </div>
        </div>
      </div>

      {/* Last Backup Info */}
      {lastBackup && (
        <div className="p-4 border border-border rounded-lg bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Last Backup</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            {formatDate(lastBackup.date)}
          </p>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[10px]">
              {lastBackup.items.tasks} tasks
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {lastBackup.items.habits} habits
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {lastBackup.items.goals} goals
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {lastBackup.items.journals} journals
            </Badge>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        <Button 
          className="w-full" 
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Export All Data
            </>
          )}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
        
        <Button 
          variant="outline" 
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
        >
          {isImporting ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Import from Backup
            </>
          )}
        </Button>

        <Button 
          variant="outline" 
          className="w-full"
          onClick={handleCopyToClipboard}
        >
          <Copy className="h-4 w-4 mr-2" />
          Copy to Clipboard
        </Button>
      </div>

      {/* Data Format Info */}
      <div className="p-3 border border-border rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <FileJson className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">Backup Format</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Your data is exported as a JSON file that includes all tasks, habits, goals, 
          journal entries, mood logs, and settings. Keep this file safe for data recovery.
        </p>
      </div>

      {/* Security Notice */}
      <div className="p-3 border border-border rounded-lg bg-yellow-500/5">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-medium">Privacy</span>
        </div>
        <p className="text-xs text-muted-foreground">
          All data is stored locally on your device. Backups are created as downloadable 
          files. No data is sent to external servers.
        </p>
      </div>

      {/* Danger Zone */}
      <div className="p-4 border border-red-500/30 rounded-lg bg-red-500/5">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium text-red-500">Danger Zone</span>
        </div>
        
        {showClearConfirm ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              This will permanently delete all your productivity data. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleClearData}
              >
                Yes, Delete Everything
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button 
            variant="outline" 
            size="sm"
            className="text-red-500 border-red-500/30 hover:bg-red-500/10"
            onClick={() => setShowClearConfirm(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All Data
          </Button>
        )}
      </div>
    </div>
  );
};

export default DataSync;
