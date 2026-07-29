import { usGetItem, usSetItem } from "@/services/userStorage";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, UserCircle, Settings, ToggleLeft, Mail, Zap, BookOpen,
  Bell, Code, Award, ChevronRight, Check, Plug, CreditCard,
  ShoppingCart, Share2, BarChart3, Mail as MailIcon,
  Truck, Globe, Palette, MessageSquare, Camera, Music,
  Database, Cloud, Lock, Smartphone, Webhook, Bot,
  Calendar, FileText, Image, Video, MapPin, Package, Search,
  Sparkles, Play, PenTool, Users, Snowflake as SnowflakeIcon, HardDrive,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { currencyService } from "@/services/currencyService";
import { netWorthService } from "@/services/netWorthService";
import { appCurrencyCode } from "@/services/regionService";
import { toast } from "sonner";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: string;
  inline?: boolean;
}

type SettingsSection = 
  | "account" 
  | "preferences" 
  | "personalization" 
  | "assistant" 
  | "shortcuts" 
  | "tasks" 
  | "notifications" 
  | "connectors" 
  | "api" 
  | "properks"
  | "viewplans";

interface Connector {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  enabled: boolean;
  connected: boolean;
}

interface SettingsData {
  account: {
    displayName: string;
    email: string;
    avatar: string;
    twoFactorEnabled: boolean;
  };
  preferences: {
    theme: 'light' | 'dark' | 'system';
    language: string;
    currency: string;
    notifications: boolean;
    soundEffects: boolean;
    autoSave: boolean;
  };
  personalization: {
    stylePreferences: string[];
    sizePreferences: {
      tops: string;
      bottoms: string;
      shoes: string;
    };
    colorPreferences: string[];
    budgetRange: { min: number; max: number };
  };
  assistant: {
    voiceEnabled: boolean;
    responseStyle: 'concise' | 'detailed';
    proactiveMode: boolean;
    shoppingAssistant: boolean;
    trendAlerts: boolean;
    priceDropAlerts: boolean;
  };
  shortcuts: {
    search: string;
    newChat: string;
    voiceCommand: string;
    quickBuy: string;
    wishlist: string;
  };
  tasks: {
    showCompleted: boolean;
    sortBy: 'date' | 'priority' | 'name';
    defaultView: 'list' | 'board' | 'calendar';
    reminders: boolean;
  };
  notifications: {
    inApp: boolean;
    push: boolean;
    finance: boolean;
    planner: boolean;
    gmail: boolean;
    diary: boolean;
    focus: boolean;
    // legacy keys (ignored if present)
    email?: boolean;
    sms?: boolean;
    orderUpdates?: boolean;
    priceDrops?: boolean;
    newArrivals?: boolean;
    promotions?: boolean;
    recommendations?: boolean;
  };
  connectors: Connector[];
  api: {
    apiKey: string;
    webhookUrl: string;
    rateLimitEnabled: boolean;
    sandboxMode: boolean;
  };
}

const defaultConnectors: Connector[] = [
  // Popular
  { id: "gmail", name: "Gmail with Calendar", description: "Search, create, and manage your emails and calendar events", icon: MailIcon, category: "Popular", enabled: true, connected: false },
  { id: "outlook", name: "Outlook", description: "Search your emails and calendar events", icon: MailIcon, category: "Popular", enabled: true, connected: false },
  { id: "google-drive", name: "Google Drive", description: "Get in-depth answers from your Google Drive content", icon: HardDrive, category: "Popular", enabled: true, connected: false },
  { id: "notion-pop", name: "Notion", description: "Access and search your Notion workspace", icon: FileText, category: "Popular", enabled: true, connected: false },
  { id: "dropbox", name: "Dropbox", description: "Search and manage your Dropbox files", icon: Cloud, category: "Popular", enabled: true, connected: false },
  
  // Creative
  { id: "biorender", name: "BioRender", description: "Create professional scientific figures, diagrams, and posters in BioRender", icon: PenTool, category: "Creative", enabled: true, connected: false },
  { id: "twitch", name: "Twitch", description: "Twitch is an interactive livestreaming service for content spanning gaming...", icon: Play, category: "Creative", enabled: true, connected: false },
  { id: "canva", name: "Canva Enterprise", description: "Enable your organization to create, collaborate, and publish visual...", icon: Palette, category: "Creative", enabled: true, connected: false },
  { id: "figma", name: "Figma", description: "Design and collaborate on UI/UX projects", icon: PenTool, category: "Creative", enabled: true, connected: false },
  { id: "adobe", name: "Adobe Creative Cloud", description: "Access Photoshop, Illustrator, and more", icon: Sparkles, category: "Creative", enabled: true, connected: false },
  
  // Communication
  { id: "outlook-comm", name: "Outlook", description: "Search your emails and calendar events", icon: MailIcon, category: "Communication", enabled: true, connected: false },
  { id: "slack", name: "Slack", description: "Search and post messages across your Slack workspace", icon: MessageSquare, category: "Communication", enabled: true, connected: false },
  { id: "teams", name: "Microsoft Teams", description: "Search and send messages in Microsoft Teams", icon: Users, category: "Communication", enabled: true, connected: false },
  { id: "discord", name: "Discord", description: "Connect with your Discord servers and channels", icon: MessageSquare, category: "Communication", enabled: true, connected: false },
  { id: "zoom", name: "Zoom", description: "Schedule and manage video meetings", icon: Video, category: "Communication", enabled: true, connected: false },
  
  // Data & Analytics
  { id: "snowflake", name: "Snowflake", description: "Ask questions about your Snowflake data", icon: SnowflakeIcon, category: "Data & Analytics", enabled: true, connected: false },
  { id: "motherduck", name: "MotherDuck", description: "Search and analyze data across your MotherDuck-powered DuckDB...", icon: Database, category: "Data & Analytics", enabled: true, connected: false },
  { id: "tableau", name: "Tableau", description: "Connect to your Tableau dashboards and data", icon: BarChart3, category: "Data & Analytics", enabled: true, connected: false },
  { id: "powerbi", name: "Power BI", description: "Access Microsoft Power BI reports and analytics", icon: BarChart3, category: "Data & Analytics", enabled: true, connected: false },
  { id: "looker", name: "Looker", description: "Query and analyze your Looker data models", icon: BarChart3, category: "Data & Analytics", enabled: true, connected: false },
  
  // Development
  { id: "github", name: "GitHub", description: "Access repositories, issues, and pull requests", icon: Code, category: "Development", enabled: true, connected: false },
  { id: "gitlab", name: "GitLab", description: "Connect to your GitLab projects and CI/CD", icon: Code, category: "Development", enabled: true, connected: false },
  { id: "jira", name: "Jira", description: "Manage issues and track project progress", icon: FileText, category: "Development", enabled: true, connected: false },
  { id: "linear", name: "Linear", description: "Streamlined issue tracking for modern teams", icon: FileText, category: "Development", enabled: true, connected: false },
  { id: "vercel", name: "Vercel", description: "Deploy and manage your web applications", icon: Globe, category: "Development", enabled: true, connected: false },
  
  // Productivity
  { id: "gcal", name: "Google Calendar", description: "Manage your schedule and events", icon: Calendar, category: "Productivity", enabled: true, connected: false },
  { id: "asana", name: "Asana", description: "Track work and manage projects", icon: FileText, category: "Productivity", enabled: true, connected: false },
  { id: "todoist", name: "Todoist", description: "Organize tasks and boost productivity", icon: Check, category: "Productivity", enabled: true, connected: false },
  { id: "trello", name: "Trello", description: "Visual project management boards", icon: FileText, category: "Productivity", enabled: true, connected: false },
  { id: "monday", name: "Monday.com", description: "Work OS for teams to manage projects", icon: Calendar, category: "Productivity", enabled: true, connected: false },
  
  // E-commerce & Payment
  { id: "shopify", name: "Shopify", description: "Sync products and manage your online store", icon: ShoppingCart, category: "E-commerce", enabled: true, connected: false },
  { id: "stripe", name: "Stripe", description: "Accept payments and manage subscriptions", icon: CreditCard, category: "E-commerce", enabled: true, connected: false },
  { id: "woocommerce", name: "WooCommerce", description: "WordPress e-commerce integration", icon: ShoppingCart, category: "E-commerce", enabled: true, connected: false },
  { id: "paypal", name: "PayPal", description: "Worldwide payment processing", icon: CreditCard, category: "E-commerce", enabled: true, connected: false },
  { id: "square", name: "Square", description: "Point of sale and payment solutions", icon: CreditCard, category: "E-commerce", enabled: true, connected: false },
];

const defaultSettings: SettingsData = {
  account: {
    displayName: "",
    email: "",
    avatar: "",
    twoFactorEnabled: false,
  },
  preferences: {
    theme: 'dark',
    language: 'English',
    currency: 'USD',
    notifications: true,
    soundEffects: true,
    autoSave: true,
  },
  personalization: {
    stylePreferences: [],
    sizePreferences: { tops: '', bottoms: '', shoes: '' },
    colorPreferences: [],
    budgetRange: { min: 0, max: 0 },
  },
  assistant: {
    voiceEnabled: false,
    responseStyle: 'detailed',
    proactiveMode: true,
    shoppingAssistant: false,
    trendAlerts: false,
    priceDropAlerts: false,
  },
  shortcuts: {
    search: '⌘ + K',
    newChat: '⌘ + N',
    voiceCommand: '⌘ + Shift + V',
    quickBuy: '⌘ + B',
    wishlist: '⌘ + W',
  },
  tasks: {
    showCompleted: true,
    sortBy: 'priority',
    defaultView: 'list',
    reminders: true,
  },
  notifications: {
    inApp: true,
    push: true,
    finance: true,
    planner: true,
    gmail: true,
    diary: true,
    focus: true,
  },
  connectors: defaultConnectors.map((c) => ({ ...c, enabled: false, connected: false })),
  api: {
    apiKey: "",
    webhookUrl: "",
    rateLimitEnabled: true,
    sandboxMode: true,
  },
};

const SettingsPanel = ({ isOpen, onClose, initialSection = "account", inline = false }: SettingsPanelProps) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection as SettingsSection);
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [connectorTab, setConnectorTab] = useState<'connectors' | 'skills'>('connectors');
  const [connectorFilterMode, setConnectorFilterMode] = useState<'discover' | 'all'>('discover');
  const [selectedConnectorCategory, setSelectedConnectorCategory] = useState<string>('All categories');

  useEffect(() => {
    const saved = usGetItem("sybeez_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const n = parsed?.notifications || {};
        parsed.notifications = {
          inApp: typeof n.inApp === "boolean" ? n.inApp : true,
          push: typeof n.push === "boolean" ? n.push : true,
          finance: typeof n.finance === "boolean" ? n.finance : true,
          planner: typeof n.planner === "boolean" ? n.planner : true,
          gmail: typeof n.gmail === "boolean" ? n.gmail : true,
          diary: typeof n.diary === "boolean" ? n.diary : true,
          focus: typeof n.focus === "boolean" ? n.focus : true,
        };
        const merged = { ...defaultSettings, ...parsed, notifications: parsed.notifications };
        merged.preferences = {
          ...merged.preferences,
          currency: parsed?.preferences?.currency || appCurrencyCode(),
        };
        setSettings(merged);
      } catch (e) {
        console.error('Failed to load settings');
      }
    } else {
      setSettings((prev) => ({
        ...prev,
        preferences: { ...prev.preferences, currency: appCurrencyCode() },
      }));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setSettings((prev) => ({
      ...prev,
      account: {
        ...prev.account,
        displayName: user.name || prev.account.displayName,
        email: user.email || prev.account.email,
        avatar: user.picture || prev.account.avatar,
      },
    }));
  }, [user]);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection as SettingsSection);
    }
  }, [initialSection]);

  const saveSettings = () => {
    usSetItem("sybeez_settings", JSON.stringify(settings));
    setHasChanges(false);
  };

  const updateSetting = <K extends keyof SettingsData>(
    section: K,
    key: keyof SettingsData[K],
    value: any
  ) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
    setHasChanges(true);
  };

  const toggleConnector = (connectorId: string, field: 'enabled' | 'connected') => {
    setSettings(prev => ({
      ...prev,
      connectors: prev.connectors.map(c =>
        c.id === connectorId ? { ...c, [field]: !c[field] } : c
      )
    }));
    setHasChanges(true);
  };

  const menuItems = [
    { id: "account", icon: UserCircle, label: "Account" },
    { id: "preferences", icon: Settings, label: "Preferences" },
    { id: "personalization", icon: ToggleLeft, label: "Personalization" },
    { id: "assistant", icon: Mail, label: "Assistant" },
    { id: "shortcuts", icon: Zap, label: "Shortcuts" },
    { id: "tasks", icon: BookOpen, label: "Tasks" },
    { id: "notifications", icon: Bell, label: "Notifications" },
    { id: "connectors", icon: Plug, label: "Connectors" },
    { id: "viewplans", icon: ChevronRight, label: "View Plans" },
  ];

  const filteredConnectors = settings.connectors.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Ordered categories for display
  const categoryOrder = ["Popular", "Creative", "Communication", "Data & Analytics", "Development", "Productivity", "E-commerce"];
  const connectorCategories = categoryOrder.filter(cat => 
    filteredConnectors.some(c => c.category === cat)
  );

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activeSection) {
      case "account":
        return (
          <div className="space-y-8">
            <p className="text-sm text-muted-foreground">Manage your account settings and profile information</p>
            
            {/* Profile Section */}
            <div className="p-6 bg-foreground/5 rounded-xl space-y-6">
              <div className="flex items-center gap-6">
                {settings.account.avatar || user?.picture ? (
                  <img
                    src={settings.account.avatar || user?.picture || ""}
                    alt={settings.account.displayName || "Profile"}
                    className="w-24 h-24 rounded-full object-cover ring-1 ring-white/10"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-foreground/20 to-foreground/5 flex items-center justify-center text-3xl font-bold">
                    {(settings.account.displayName || "U").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">{settings.account.displayName || "Your name"}</h3>
                  <p className="text-sm text-muted-foreground">{settings.account.email || "Add your email in settings"}</p>
                </div>
              </div>
            </div>

            {/* Personal Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-medium">Display Name</span>
                  <Input
                    value={settings.account.displayName}
                    onChange={(e) => updateSetting('account', 'displayName', e.target.value)}
                    className="mt-2 bg-foreground/5 border-border"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium">Email Address</span>
                  <Input
                    value={settings.account.email}
                    onChange={(e) => updateSetting('account', 'email', e.target.value)}
                    className="mt-2 bg-foreground/5 border-border"
                  />
                </label>
              </div>
            </div>

            <Separator />

            {/* Security */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Security</h3>
              
              <div className="flex items-center justify-between p-4 bg-foreground/5 rounded-xl">
                <div>
                  <div className="font-medium">Two-Factor Authentication</div>
                  <div className="text-sm text-muted-foreground">Add extra security to your account</div>
                </div>
                <Button variant={settings.account.twoFactorEnabled ? "outline" : "default"} size="sm">
                  {settings.account.twoFactorEnabled ? "Disable" : "Enable"}
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-foreground/5 rounded-xl">
                <div>
                  <div className="font-medium">Change Password</div>
                  <div className="text-sm text-muted-foreground">Update your password regularly</div>
                </div>
                <Button variant="outline" size="sm">Update</Button>
              </div>
            </div>

            <Separator />

            {/* Session */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Session</h3>
              <div className="flex items-center justify-between p-4 bg-foreground/5 rounded-xl">
                <div>
                  <div className="font-medium">Sign out</div>
                  <div className="text-sm text-muted-foreground">End your session on this device</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    signOut();
                    toast.success("Signed out");
                    navigate("/signin", { replace: true });
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </div>

            <Separator />

            {/* Danger Zone */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-red-500">Danger Zone</h3>
              <div className="flex items-center justify-between p-4 border border-red-500/20 rounded-xl bg-red-500/5">
                <div>
                  <div className="font-medium text-red-500">Delete Account</div>
                  <div className="text-sm text-muted-foreground">Permanently delete your account and all data</div>
                </div>
                <Button variant="destructive" size="sm">Delete Account</Button>
              </div>
            </div>
          </div>
        );

      case "preferences":
        return (
          <div className="space-y-8">
            <p className="text-sm text-muted-foreground">Customize your app experience and appearance</p>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Appearance</h3>
              
              <div className="p-4 bg-foreground/5 rounded-xl">
                <label className="block">
                  <span className="text-sm font-medium">Theme</span>
                  <select
                    value={settings.preferences.theme}
                    onChange={(e) => updateSetting('preferences', 'theme', e.target.value)}
                    className="mt-2 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="system">System</option>
                  </select>
                </label>
              </div>

              <div className="p-4 bg-foreground/5 rounded-xl">
                <label className="block">
                  <span className="text-sm font-medium">Language</span>
                  <select
                    value={settings.preferences.language}
                    onChange={(e) => updateSetting('preferences', 'language', e.target.value)}
                    className="mt-2 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="ja">Japanese</option>
                    <option value="zh">Chinese</option>
                  </select>
                </label>
              </div>

              <div className="p-4 bg-foreground/5 rounded-xl">
                <label className="block">
                  <span className="text-sm font-medium">Currency</span>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    Set automatically from your country when you register
                  </p>
                  <select
                    value={settings.preferences.currency}
                    onChange={(e) => {
                      const code = e.target.value;
                      updateSetting("preferences", "currency", code);
                      currencyService.setBaseCurrency(code);
                      netWorthService.setDisplayCurrency(code);
                    }}
                    className="mt-2 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  >
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="INR">INR — Indian Rupee</option>
                    <option value="JPY">JPY — Japanese Yen</option>
                    <option value="CNY">CNY — Chinese Yuan</option>
                    <option value="CAD">CAD — Canadian Dollar</option>
                    <option value="AUD">AUD — Australian Dollar</option>
                    <option value="CHF">CHF — Swiss Franc</option>
                    <option value="AED">AED — UAE Dirham</option>
                    <option value="SGD">SGD — Singapore Dollar</option>
                    <option value="HKD">HKD — Hong Kong Dollar</option>
                    <option value="SEK">SEK — Swedish Krona</option>
                    <option value="NZD">NZD — New Zealand Dollar</option>
                    <option value="ZAR">ZAR — South African Rand</option>
                    <option value="BRL">BRL — Brazilian Real</option>
                  </select>
                </label>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Display</h3>
              
              <div className="flex items-center justify-between p-4 bg-foreground/5 rounded-xl">
                <div>
                  <div className="font-medium">Compact Mode</div>
                  <div className="text-sm text-muted-foreground">Show more content with less spacing</div>
                </div>
                <Button 
                  variant={settings.preferences.compactMode ? "default" : "outline"} 
                  size="sm"
                  onClick={() => updateSetting('preferences', 'compactMode', !settings.preferences.compactMode)}
                >
                  {settings.preferences.compactMode ? "On" : "Off"}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-foreground/5 rounded-xl">
                <div>
                  <div className="font-medium">Show Prices</div>
                  <div className="text-sm text-muted-foreground">Display prices in product listings</div>
                </div>
                <Button 
                  variant={settings.preferences.showPrices ? "default" : "outline"} 
                  size="sm"
                  onClick={() => updateSetting('preferences', 'showPrices', !settings.preferences.showPrices)}
                >
                  {settings.preferences.showPrices ? "On" : "Off"}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-foreground/5 rounded-xl">
                <div>
                  <div className="font-medium">Auto-play Videos</div>
                  <div className="text-sm text-muted-foreground">Automatically play product videos</div>
                </div>
                <Button 
                  variant={settings.preferences.autoPlayVideos ? "default" : "outline"} 
                  size="sm"
                  onClick={() => updateSetting('preferences', 'autoPlayVideos', !settings.preferences.autoPlayVideos)}
                >
                  {settings.preferences.autoPlayVideos ? "On" : "Off"}
                </Button>
              </div>
            </div>
          </div>
        );

      case "personalization":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Personalization</h2>
              <p className="text-sm text-muted-foreground">Tailor your shopping experience</p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="font-medium mb-2">Style Preferences</div>
                <div className="flex flex-wrap gap-2">
                  {['Casual', 'Formal', 'Streetwear', 'Modern', 'Minimalist', 'Vintage', 'Athletic', 'Bohemian'].map(style => (
                    <button
                      key={style}
                      onClick={() => {
                        const current = settings.personalization.stylePreferences;
                        const updated = current.includes(style)
                          ? current.filter(s => s !== style)
                          : [...current, style];
                        updateSetting('personalization', 'stylePreferences', updated);
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        settings.personalization.stylePreferences.includes(style)
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border hover:border-foreground'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <div className="font-medium mb-2">Size Preferences</div>
                <div className="grid grid-cols-3 gap-4">
                  <label className="block">
                    <span className="text-sm text-muted-foreground">Tops</span>
                    <select
                      value={settings.personalization.sizePreferences.tops}
                      onChange={(e) => updateSetting('personalization', 'sizePreferences', {
                        ...settings.personalization.sizePreferences,
                        tops: e.target.value
                      })}
                      className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm text-muted-foreground">Bottoms</span>
                    <select
                      value={settings.personalization.sizePreferences.bottoms}
                      onChange={(e) => updateSetting('personalization', 'sizePreferences', {
                        ...settings.personalization.sizePreferences,
                        bottoms: e.target.value
                      })}
                      className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      {['28', '30', '32', '34', '36', '38', '40'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm text-muted-foreground">Shoes</span>
                    <select
                      value={settings.personalization.sizePreferences.shoes}
                      onChange={(e) => updateSetting('personalization', 'sizePreferences', {
                        ...settings.personalization.sizePreferences,
                        shoes: e.target.value
                      })}
                      className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      {['7', '8', '9', '10', '11', '12', '13'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <Separator />

              <div>
                <div className="font-medium mb-2">Color Preferences</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { name: 'Black', color: '#000000' },
                    { name: 'White', color: '#FFFFFF' },
                    { name: 'Navy', color: '#1E3A5F' },
                    { name: 'Gray', color: '#6B7280' },
                    { name: 'Beige', color: '#D4C4B0' },
                    { name: 'Brown', color: '#8B4513' },
                    { name: 'Blue', color: '#3B82F6' },
                    { name: 'Green', color: '#22C55E' },
                  ].map(({ name, color }) => (
                    <button
                      key={name}
                      onClick={() => {
                        const current = settings.personalization.colorPreferences;
                        const updated = current.includes(name)
                          ? current.filter(c => c !== name)
                          : [...current, name];
                        updateSetting('personalization', 'colorPreferences', updated);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        settings.personalization.colorPreferences.includes(name)
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border hover:border-foreground'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: color }}
                      />
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <div className="font-medium mb-2">Budget Range</div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Min:</span>
                    <Input
                      type="number"
                      value={settings.personalization.budgetRange.min}
                      onChange={(e) => updateSetting('personalization', 'budgetRange', {
                        ...settings.personalization.budgetRange,
                        min: parseInt(e.target.value) || 0
                      })}
                      className="w-24 bg-background"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Max:</span>
                    <Input
                      type="number"
                      value={settings.personalization.budgetRange.max}
                      onChange={(e) => updateSetting('personalization', 'budgetRange', {
                        ...settings.personalization.budgetRange,
                        max: parseInt(e.target.value) || 0
                      })}
                      className="w-24 bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "assistant":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Assistant</h2>
              <p className="text-sm text-muted-foreground">Configure your AI shopping assistant</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Voice Enabled</div>
                  <div className="text-sm text-muted-foreground">Enable voice commands and responses</div>
                </div>
                <Switch
                  checked={settings.assistant.voiceEnabled}
                  onCheckedChange={(v) => updateSetting('assistant', 'voiceEnabled', v)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Response Style</div>
                  <div className="text-sm text-muted-foreground">How the assistant responds</div>
                </div>
                <select
                  value={settings.assistant.responseStyle}
                  onChange={(e) => updateSetting('assistant', 'responseStyle', e.target.value as any)}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="concise">Concise</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>

              <Separator />

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Proactive Mode</div>
                  <div className="text-sm text-muted-foreground">Get suggestions without asking</div>
                </div>
                <Switch
                  checked={settings.assistant.proactiveMode}
                  onCheckedChange={(v) => updateSetting('assistant', 'proactiveMode', v)}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Shopping Assistant</div>
                  <div className="text-sm text-muted-foreground">Help with product recommendations</div>
                </div>
                <Switch
                  checked={settings.assistant.shoppingAssistant}
                  onCheckedChange={(v) => updateSetting('assistant', 'shoppingAssistant', v)}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Trend Alerts</div>
                  <div className="text-sm text-muted-foreground">Get notified about fashion trends</div>
                </div>
                <Switch
                  checked={settings.assistant.trendAlerts}
                  onCheckedChange={(v) => updateSetting('assistant', 'trendAlerts', v)}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Price Drop Alerts</div>
                  <div className="text-sm text-muted-foreground">Notify when items go on sale</div>
                </div>
                <Switch
                  checked={settings.assistant.priceDropAlerts}
                  onCheckedChange={(v) => updateSetting('assistant', 'priceDropAlerts', v)}
                />
              </div>
            </div>
          </div>
        );

      case "shortcuts":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Shortcuts</h2>
              <p className="text-sm text-muted-foreground">Keyboard shortcuts for quick actions</p>
            </div>

            <div className="space-y-4">
              {Object.entries(settings.shortcuts).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between py-2">
                  <div className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                  <div className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm font-mono">
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-4 bg-foreground/5 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Contact support to customize keyboard shortcuts for your workflow.
              </p>
            </div>
          </div>
        );

      case "tasks":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Tasks</h2>
              <p className="text-sm text-muted-foreground">Configure task management settings</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Show Completed</div>
                  <div className="text-sm text-muted-foreground">Display completed tasks</div>
                </div>
                <Switch
                  checked={settings.tasks.showCompleted}
                  onCheckedChange={(v) => updateSetting('tasks', 'showCompleted', v)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Sort By</div>
                  <div className="text-sm text-muted-foreground">Default task sorting</div>
                </div>
                <select
                  value={settings.tasks.sortBy}
                  onChange={(e) => updateSetting('tasks', 'sortBy', e.target.value as any)}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="date">Date</option>
                  <option value="priority">Priority</option>
                  <option value="name">Name</option>
                </select>
              </div>

              <Separator />

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Default View</div>
                  <div className="text-sm text-muted-foreground">How tasks are displayed</div>
                </div>
                <select
                  value={settings.tasks.defaultView}
                  onChange={(e) => updateSetting('tasks', 'defaultView', e.target.value as any)}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="list">List</option>
                  <option value="board">Board</option>
                  <option value="calendar">Calendar</option>
                </select>
              </div>

              <Separator />

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Reminders</div>
                  <div className="text-sm text-muted-foreground">Get notified about due tasks</div>
                </div>
                <Switch
                  checked={settings.tasks.reminders}
                  onCheckedChange={(v) => updateSetting('tasks', 'reminders', v)}
                />
              </div>
            </div>
          </div>
        );

      case "notifications":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Notifications</h2>
              <p className="text-sm text-muted-foreground">
                Control your inbox and browser alerts across Sybeez Flow
              </p>
            </div>

            <div className="space-y-4">
              <div className="font-medium">Channels</div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div>In-app notifications</div>
                    <div className="text-xs text-muted-foreground">Show alerts in the sidebar inbox</div>
                  </div>
                </div>
                <Switch
                  checked={settings.notifications.inApp}
                  onCheckedChange={(v) => updateSetting("notifications", "inApp", v)}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div>Browser notifications</div>
                    <div className="text-xs text-muted-foreground">Alert when the tab is in the background</div>
                  </div>
                </div>
                <Switch
                  checked={settings.notifications.push}
                  onCheckedChange={async (v) => {
                    updateSetting("notifications", "push", v);
                    if (v && "Notification" in window && Notification.permission === "default") {
                      await Notification.requestPermission();
                    }
                  }}
                />
              </div>

              <Separator />

              <div className="font-medium">Modules</div>

              {(
                [
                  ["finance", "Finance", "Bills, EMIs, budgets, renewals"],
                  ["planner", "Life Planner", "Tasks, habits, and today’s plan"],
                  ["gmail", "Gmail", "Important and unread mail"],
                  ["diary", "Life Diary", "Daily writing reminders"],
                  ["focus", "Focus / Pomodoro", "Timer completion alerts"],
                ] as const
              ).map(([key, label, desc]) => (
                <div key={key} className="flex items-center justify-between py-2">
                  <div>
                    <div>{label}</div>
                    <div className="text-xs text-muted-foreground">{desc}</div>
                  </div>
                  <Switch
                    checked={Boolean(settings.notifications[key])}
                    onCheckedChange={(v) => updateSetting("notifications", key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        );

      case "connectors":
        const iconBgColors: Record<string, string> = {
          "gmail": "bg-red-500/20",
          "outlook": "bg-blue-500/20",
          "outlook-comm": "bg-blue-500/20",
          "google-drive": "bg-yellow-500/20",
          "notion-pop": "bg-neutral-500/20",
          "dropbox": "bg-blue-400/20",
          "biorender": "bg-purple-500/20",
          "twitch": "bg-purple-600/20",
          "canva": "bg-cyan-500/20",
          "figma": "bg-pink-500/20",
          "adobe": "bg-red-600/20",
          "slack": "bg-purple-500/20",
          "teams": "bg-indigo-500/20",
          "discord": "bg-indigo-600/20",
          "zoom": "bg-blue-500/20",
          "snowflake": "bg-cyan-400/20",
          "motherduck": "bg-yellow-400/20",
          "tableau": "bg-blue-600/20",
          "powerbi": "bg-yellow-500/20",
          "looker": "bg-green-500/20",
          "github": "bg-neutral-600/20",
          "gitlab": "bg-orange-500/20",
          "jira": "bg-blue-500/20",
          "linear": "bg-purple-500/20",
          "vercel": "bg-neutral-500/20",
          "gcal": "bg-blue-400/20",
          "asana": "bg-orange-400/20",
          "todoist": "bg-red-400/20",
          "trello": "bg-blue-500/20",
          "monday": "bg-red-500/20",
          "shopify": "bg-green-500/20",
          "stripe": "bg-purple-500/20",
          "woocommerce": "bg-purple-400/20",
          "paypal": "bg-blue-600/20",
          "square": "bg-neutral-600/20",
        };
        const iconColors: Record<string, string> = {
          "gmail": "text-red-500",
          "outlook": "text-blue-500",
          "outlook-comm": "text-blue-500",
          "google-drive": "text-yellow-500",
          "notion-pop": "text-neutral-400",
          "dropbox": "text-blue-400",
          "biorender": "text-purple-500",
          "twitch": "text-purple-600",
          "canva": "text-cyan-500",
          "figma": "text-pink-500",
          "adobe": "text-red-600",
          "slack": "text-purple-500",
          "teams": "text-indigo-500",
          "discord": "text-indigo-600",
          "zoom": "text-blue-500",
          "snowflake": "text-cyan-400",
          "motherduck": "text-yellow-400",
          "tableau": "text-blue-600",
          "powerbi": "text-yellow-500",
          "looker": "text-green-500",
          "github": "text-neutral-400",
          "gitlab": "text-orange-500",
          "jira": "text-blue-500",
          "linear": "text-purple-500",
          "vercel": "text-neutral-400",
          "gcal": "text-blue-400",
          "asana": "text-orange-400",
          "todoist": "text-red-400",
          "trello": "text-blue-500",
          "monday": "text-red-500",
          "shopify": "text-green-500",
          "stripe": "text-purple-500",
          "woocommerce": "text-purple-400",
          "paypal": "text-blue-600",
          "square": "text-neutral-400",
        };

        const displayCategories = selectedConnectorCategory === 'All categories' 
          ? connectorCategories 
          : connectorCategories.filter(c => c === selectedConnectorCategory);

        return (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex items-center gap-6">
              <button
                onClick={() => setConnectorTab('connectors')}
                className={`text-lg font-semibold pb-2 border-b-2 transition-colors ${
                  connectorTab === 'connectors' 
                    ? 'border-foreground text-foreground' 
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Connectors
              </button>
              <button
                onClick={() => setConnectorTab('skills')}
                className={`text-lg font-semibold pb-2 border-b-2 transition-colors ${
                  connectorTab === 'skills' 
                    ? 'border-foreground text-foreground' 
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Skills
              </button>
            </div>

            {connectorTab === 'connectors' ? (
              <>
                {/* Subtitle */}
                <p className="text-sm text-muted-foreground">
                  Connect your apps and services so Sybeez Flow can access and act on your data.
                </p>

                {/* Filters Row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Discover / All Toggle */}
                    <div className="flex bg-foreground/5 rounded-lg p-1">
                      <button
                        onClick={() => setConnectorFilterMode('discover')}
                        className={`px-4 py-2 text-sm rounded-md transition-colors font-medium ${
                          connectorFilterMode === 'discover' 
                            ? 'bg-foreground text-background' 
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Discover
                      </button>
                      <button
                        onClick={() => setConnectorFilterMode('all')}
                        className={`px-4 py-2 text-sm rounded-md transition-colors font-medium ${
                          connectorFilterMode === 'all' 
                            ? 'bg-foreground text-background' 
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        All
                      </button>
                    </div>

                    {/* Category Dropdown */}
                    <select
                      value={selectedConnectorCategory}
                      onChange={(e) => setSelectedConnectorCategory(e.target.value)}
                      className="bg-foreground/5 border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 cursor-pointer"
                    >
                      <option>All categories</option>
                      {connectorCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Search */}
                  <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search all connectors"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-foreground/5 border-border w-full sm:w-[280px]"
                    />
                  </div>
                </div>

                {/* Category Rows */}
                <div className="space-y-8">
                  {displayCategories.map(category => {
                    const categoryConnectors = filteredConnectors.filter(c => c.category === category);
                    if (categoryConnectors.length === 0) return null;
                    return (
                      <div key={category} className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">{category}</h3>
                          <div className="flex items-center gap-2">
                            <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                              View all <ChevronRight className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {categoryConnectors.map(connector => {
                            const Icon = connector.icon;
                            return (
                              <div
                                key={connector.id}
                                className="p-4 bg-foreground/5 rounded-xl hover:bg-foreground/10 transition-all cursor-pointer border border-transparent hover:border-foreground/20 hover:shadow-lg group"
                                onClick={() => toggleConnector(connector.id, 'connected')}
                              >
                                <div className={`w-11 h-11 rounded-xl ${iconBgColors[connector.id] || 'bg-foreground/10'} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                                  <Icon className={`h-5 w-5 ${iconColors[connector.id] || ''}`} />
                                </div>
                                <div className="font-medium text-sm mb-1 flex items-center gap-2">
                                  {connector.name}
                                  {connector.connected && (
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground line-clamp-2">{connector.description}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* Skills Tab Content */
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Skills extend what Computer can do. Add custom workflows and automations.
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { name: "Web Search", description: "Search the web for real-time information", icon: Globe, active: true },
                    { name: "Code Execution", description: "Run code snippets in various languages", icon: Code, active: true },
                    { name: "Image Generation", description: "Create images from text descriptions", icon: Image, active: false },
                    { name: "Data Analysis", description: "Analyze spreadsheets and datasets", icon: BarChart3, active: true },
                    { name: "Email Drafting", description: "Compose professional emails", icon: MailIcon, active: false },
                    { name: "Meeting Notes", description: "Summarize and organize meeting content", icon: FileText, active: false },
                  ].map(skill => {
                    const SkillIcon = skill.icon;
                    return (
                      <div
                        key={skill.name}
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          skill.active 
                            ? 'bg-foreground/5 border-foreground/20 hover:border-foreground/40' 
                            : 'bg-foreground/5 border-border hover:border-foreground/20'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className={`w-10 h-10 rounded-lg ${skill.active ? 'bg-foreground/10' : 'bg-foreground/5'} flex items-center justify-center`}>
                            <SkillIcon className="h-5 w-5" />
                          </div>
                          <div className={`w-2 h-2 rounded-full ${skill.active ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                        </div>
                        <div className="font-medium text-sm mb-1">{skill.name}</div>
                        <div className="text-xs text-muted-foreground">{skill.description}</div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="pt-4 border-t border-border">
                  <Button variant="outline" className="gap-2">
                    <Zap className="h-4 w-4" />
                    Create Custom Skill
                  </Button>
                </div>
              </div>
            )}
          </div>
        );

      case "api":
        return (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">Manage API access and developer integrations</p>

            <div className="space-y-6">
              <div className="p-4 bg-foreground/5 rounded-xl">
                <label className="block">
                  <span className="text-sm font-medium">API Key</span>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={settings.api.apiKey}
                      readOnly
                      className="bg-background font-mono text-sm"
                    />
                    <Button variant="outline" onClick={() => navigator.clipboard.writeText(settings.api.apiKey)}>
                      Copy
                    </Button>
                  </div>
                </label>
                <p className="mt-2 text-xs text-muted-foreground">
                  Keep this key secret. Don't share it publicly.
                </p>
              </div>

              <Separator />

              <div>
                <label className="block">
                  <span className="text-sm text-muted-foreground">Webhook URL</span>
                  <Input
                    value={settings.api.webhookUrl}
                    onChange={(e) => updateSetting('api', 'webhookUrl', e.target.value)}
                    placeholder="https://your-server.com/webhook"
                    className="mt-1 bg-background"
                  />
                </label>
              </div>

              <Separator />

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Rate Limiting</div>
                  <div className="text-sm text-muted-foreground">Limit API requests per minute</div>
                </div>
                <Switch
                  checked={settings.api.rateLimitEnabled}
                  onCheckedChange={(v) => updateSetting('api', 'rateLimitEnabled', v)}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">Sandbox Mode</div>
                  <div className="text-sm text-muted-foreground">Use test environment</div>
                </div>
                <Switch
                  checked={settings.api.sandboxMode}
                  onCheckedChange={(v) => updateSetting('api', 'sandboxMode', v)}
                />
              </div>

              <div className="mt-4">
                <Button variant="outline" className="w-full">
                  <Code className="h-4 w-4 mr-2" />
                  View API Documentation
                </Button>
              </div>
            </div>
          </div>
        );

      case "properks":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Pro Perks</h2>
              <p className="text-sm text-muted-foreground">Exclusive benefits for Pro members</p>
            </div>

            <div className="p-6 bg-gradient-to-br from-foreground/10 to-foreground/5 rounded-xl border border-foreground/20">
              <div className="flex items-center gap-3 mb-4">
                <Award className="h-8 w-8" />
                <div>
                  <div className="font-semibold text-lg">Pro Member</div>
                  <div className="text-sm text-muted-foreground">Active subscription</div>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  'Unlimited AI conversations',
                  'Priority customer support',
                  'Early access to new features',
                  'Exclusive discounts up to 25%',
                  'Free shipping on all orders',
                  'Personal styling consultations',
                  'Advanced analytics dashboard',
                  'Custom integrations'
                ].map((perk, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm">{perk}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              Your subscription renews on May 20, 2026
            </div>
          </div>
        );

      case "viewplans":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Plans</h2>
              <p className="text-sm text-muted-foreground">Choose the plan that works for you</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  name: 'Free',
                  price: '$0',
                  period: '/month',
                  features: ['Basic AI assistant', '5 conversations/day', 'Standard support'],
                  current: false
                },
                {
                  name: 'Pro',
                  price: '$19',
                  period: '/month',
                  features: ['Unlimited AI', 'Priority support', 'All connectors', 'Analytics'],
                  current: true
                },
                {
                  name: 'Enterprise',
                  price: 'Custom',
                  period: '',
                  features: ['Custom integrations', 'Dedicated support', 'SLA guarantee', 'White label'],
                  current: false
                }
              ].map(plan => (
                <div
                  key={plan.name}
                  className={`p-5 rounded-xl border transition-colors ${
                    plan.current 
                      ? 'bg-foreground text-background border-foreground' 
                      : 'bg-foreground/5 border-border hover:border-foreground/50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-semibold text-lg">{plan.name}</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">{plan.price}</span>
                        <span className={`text-sm ${plan.current ? 'text-background/70' : 'text-muted-foreground'}`}>
                          {plan.period}
                        </span>
                      </div>
                    </div>
                    {plan.current && (
                      <span className="px-2 py-1 bg-background text-foreground text-xs rounded-full font-medium">
                        Current
                      </span>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!plan.current && (
                    <Button variant="outline" className="w-full mt-4" size="sm">
                      {plan.name === 'Enterprise' ? 'Contact Sales' : 'Select Plan'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Inline mode - renders just the content without modal wrapper
  if (inline) {
    return (
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-border">
          <h2 className="text-lg font-semibold capitalize">
            {menuItems.find(m => m.id === activeSection)?.label || activeSection}
          </h2>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <Button onClick={saveSettings} size="sm" className="gap-2">
                <Check className="h-4 w-4" />
                Save Changes
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-8">
            {renderContent()}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="h-full w-full flex">
        {/* Sidebar */}
        <div className="w-60 bg-card border-r border-border flex flex-col shrink-0">
          <div className="p-6 border-b border-border">
            <h1 className="text-xl font-bold">Settings</h1>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1">
              {menuItems.map(item => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id as SettingsSection)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <div className="flex items-center justify-between px-8 py-4 border-b border-border bg-card/50">
            <h2 className="text-lg font-semibold capitalize">
              {menuItems.find(m => m.id === activeSection)?.label || activeSection}
            </h2>
            <div className="flex items-center gap-3">
              {hasChanges && (
                <Button onClick={saveSettings} size="sm" className="gap-2">
                  <Check className="h-4 w-4" />
                  Save Changes
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-foreground/10">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-8">
              {renderContent()}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
