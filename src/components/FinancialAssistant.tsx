/**
 * Finance Manager Component
 * Production-level implementation for complete financial control
 * Features: EMIs, Loans, Insurance, Subscriptions, Savings, Tax, Pension,
 *           Credit Score, Budget Categories (Monthly Tracking), Income Dashboard, Financial Health, Debt Tracker, Side Income,
 *           Expense Charts (Week/Month/Year), Reports with Analytics, Net Worth Tracking
 */

import { usGetItem, usSetItem } from "@/services/userStorage";
import { useState, useCallback, useMemo, useEffect } from "react";
import { 
  CreditCard, PiggyBank, TrendingUp, Shield, 
  Trash2, Pencil, Plus, ArrowUpCircle, ArrowDownCircle, Wallet, 
  Building, Target, Landmark, Receipt, Activity, Award, 
  Briefcase, DollarSign, AlertCircle, BarChart3, Heart,
  ShoppingCart, Car, Film, Coffee, Users, Utensils, Home, Zap,
  PieChart, FileText, Calendar, TrendingDown, Coins, CalendarDays
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Legend
} from "recharts";
import { LifeManagementService } from "@/services/lifeManagement";
import CurrencyConverter from "@/components/CurrencyConverter";
import NetWorthTracker from "@/components/NetWorthTracker";
import InvestmentHub from "@/components/InvestmentHub";
import SavingsHub from "@/components/SavingsHub";
import DailyInOutHub from "@/components/DailyInOutHub";
import BillsHub from "@/components/BillsHub";
import FinanceDashboard from "@/components/FinanceDashboard";
import { formatAppMoney, appCurrencySymbol } from "@/services/regionService";
import { 
  EMI, 
  Insurance, 
  Subscription, 
  SavingsPlan, 
  Investment, 
  Transaction,
  Bill
} from "@/types/lifeManagement";

const money = (n: number | string) => {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return formatAppMoney(Number.isFinite(v) ? (v as number) : 0);
};
const moneySym = () => appCurrencySymbol();

interface FinancialAssistantProps {
  onClose: () => void;
  onSwitchToPlanner?: () => void;
}

// Extended types for new features
type CreditScore = {
  id: string;
  score: number;
  date: string;
  provider: string;
};

type BudgetCategory = {
  id: string;
  name: string;
  limit: number;
  spent: number;
  period: 'monthly' | 'weekly' | 'yearly';
  monthlyHistory?: { [month: string]: number }; // Track spending by month (YYYY-MM)
};

type Debt = {
  id: string;
  name: string;
  type: 'credit_card' | 'mortgage' | 'student_loan' | 'personal_loan' | 'other';
  principal: number;
  remaining: number;
  interestRate: number;
  monthlyPayment: number;
  dueDate: string;
};

type SideIncome = {
  id: string;
  source: string;
  monthlyAmount: number;
  type: 'freelance' | 'rental' | 'investment' | 'business' | 'other';
  active: boolean;
};

// Expense category with color mapping
type ExpenseCategory = {
  name: string;
  amount: number;
  color: string;
  icon: React.ReactNode;
};

type TimePeriod = 'week' | 'month' | 'year';
type ViewTab = 'networth' | 'dashboard' | 'daily_inout' | 'bills' | 'charts' | 'investments' | 'savings' | 'reports' | 'currency';

type FormType = 'emi' | 'insurance' | 'subscription' | 'savings' | 'tax' | 'pension' | 'income' | 'expense' | 'credit_score' | 'budget' | 'debt' | 'side_income' | 'asset' | null;

// Asset type for net worth tracking  
type Asset = {
  id: string;
  name: string;
  type: 'cash' | 'property' | 'investment' | 'vehicle' | 'other';
  value: number;
  date: string;
};

interface FormData {
  name?: string;
  amount?: string;
  dueDate?: string;
  bank?: string;
  remainingMonths?: string;
  interestRate?: string;
  type?: string;
  premium?: string;
  renewalDate?: string;
  provider?: string;
  description?: string;
  targetAmount?: string;
  currentAmount?: string;
  deadline?: string;
  category?: string;
  taxType?: string;
  monthlyContribution?: string;
  totalValue?: string;
  returnRate?: string;
  startDate?: string;
  score?: string;
  limit?: string;
  spent?: string;
  period?: string;
  principal?: string;
  remaining?: string;
  monthlyPayment?: string;
  source?: string;
  monthlyAmount?: string;
  active?: string;
  assetType?: string;
  assetValue?: string;
  value?: string;
  date?: string;
}

// Category colors for donut chart
const CATEGORY_COLORS: { [key: string]: string } = {
  'Shopping': '#FFD700',
  'Savings': '#4FC3F7',
  'Entertainment': '#F06292',
  'Transportation': '#81C784',
  'Food & Dining': '#FF8A65',
  'Social': '#BA68C8',
  'Housing': '#7986CB',
  'Healthcare': '#4DB6AC',
  'Other': '#90A4AE'
};

// Category icons mapping
const getCategoryIcon = (category: string, color?: string) => {
  const style = color ? { color } : {};
  switch (category) {
    case 'Shopping': return <ShoppingCart className="h-4 w-4" style={style} />;
    case 'Savings': return <PiggyBank className="h-4 w-4" style={style} />;
    case 'Entertainment': return <Film className="h-4 w-4" style={style} />;
    case 'Transportation': return <Car className="h-4 w-4" style={style} />;
    case 'Food & Dining': return <Utensils className="h-4 w-4" style={style} />;
    case 'Social': return <Users className="h-4 w-4" style={style} />;
    case 'Housing': return <Home className="h-4 w-4" style={style} />;
    case 'Healthcare': return <Heart className="h-4 w-4" style={style} />;
    default: return <Coins className="h-4 w-4" style={style} />;
  }
};

const FinancialAssistant = ({ onClose, onSwitchToPlanner }: FinancialAssistantProps) => {
  const [showAddForm, setShowAddForm] = useState<FormType>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedBudgetMonth, setSelectedBudgetMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Refresh when AI assistant writes expenses/income
  useEffect(() => {
    const onDataChanged = (e: Event) => {
      const domains = (e as CustomEvent<{ domains?: string[] }>).detail?.domains;
      if (!domains || domains.includes("finance")) {
        setRefreshKey((prev) => prev + 1);
      }
    };
    window.addEventListener("sybeez:data-changed", onDataChanged);
    return () => window.removeEventListener("sybeez:data-changed", onDataChanged);
  }, []);

  // Backend connection setup
  useEffect(() => {
    const connectToBackend = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const response = await fetch(`${API_URL}/api/features/finance/data`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
      } catch (error) {
        console.warn('Finance backend unavailable:', error);
        setIsConnected(false);
      } finally {
        setIsLoading(false);
      }
    };
    connectToBackend();
  }, []);

  // Auto-refresh finance data from backend periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      if (isConnected) {
        try {
          const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
          // LocalStorage is source of truth; just re-read (backend is backup)
          setRefreshKey((prev) => prev + 1);
        } catch (error) {
          console.warn('Error refreshing finance data:', error);
        }
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [isConnected]);

  // View & navigation state
  const [activeViewTab, setActiveViewTab] = useState<ViewTab>(() => {
    try {
      const saved = localStorage.getItem("sybeez_finance_tab");
      if (
        saved === "dashboard" ||
        saved === "daily_inout" ||
        saved === "networth" ||
        saved === "bills" ||
        saved === "charts" ||
        saved === "investments" ||
        saved === "savings" ||
        saved === "reports" ||
        saved === "currency"
      ) {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return "dashboard";
  });
  const [extrasHydrated, setExtrasHydrated] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0); // 0 = current period

  // New feature state
  const [creditScores, setCreditScores] = useState<CreditScore[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [sideIncomes, setSideIncomes] = useState<SideIncome[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

  // Persist selected Finance tab (Dashboard, Daily In & Out, …)
  useEffect(() => {
    try {
      localStorage.setItem("sybeez_finance_tab", activeViewTab);
    } catch {
      /* ignore */
    }
  }, [activeViewTab]);

  // Load/save extra features from localStorage (never overwrite before hydrate)
  useEffect(() => {
    const saved = usGetItem("finance_extra_features");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCreditScores(parsed.creditScores || []);
        setBudgetCategories(parsed.budgetCategories || []);
        setDebts(parsed.debts || []);
        setSideIncomes(parsed.sideIncomes || []);
        setAssets(parsed.assets || []);
      } catch {
        setBudgetCategories([]);
      }
    }
    setExtrasHydrated(true);
  }, []);

  useEffect(() => {
    if (!extrasHydrated) return;
    const dataToSave = { creditScores, budgetCategories, debts, sideIncomes, assets };
    usSetItem("finance_extra_features", JSON.stringify(dataToSave));
    // Sync dashboard extras to durable backend store
    import("@/services/persistSync").then(({ scheduleFinancePersist }) => {
      scheduleFinancePersist();
    });
  }, [creditScores, budgetCategories, debts, sideIncomes, assets, extrasHydrated]);

  // Get available months for budget tracking
  const availableBudgetMonths = useMemo(() => {
    const months: string[] = [];
    const today = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    return months;
  }, []);

  // Get spending for selected month
  const getBudgetSpentForMonth = useCallback((budget: BudgetCategory, month: string): number => {
    if (budget.monthlyHistory && budget.monthlyHistory[month] !== undefined) {
      return budget.monthlyHistory[month];
    }
    // Fallback to current spent if monthlyHistory doesn't exist
    return month === new Date().toISOString().slice(0, 7) ? budget.spent : 0;
  }, []);

  // Get fresh data on each render or refresh
  const data = useMemo(() => LifeManagementService.getData(), [refreshKey]);

  // Force refresh data
  const refreshData = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Reset form
  const resetForm = useCallback(() => {
    setShowAddForm(null);
    setEditingId(null);
    setFormData({});
  }, []);

  // Calculated values using useMemo for performance
  const financialSummary = useMemo(() => {
    const subscriptions = data.subscriptions.reduce((sum, s) => {
      if (s.frequency === 'monthly') return sum + s.amount;
      if (s.frequency === 'yearly') return sum + s.amount / 12;
      if (s.frequency === 'quarterly') return sum + s.amount / 3;
      return sum + s.amount;
    }, 0);

    const emis = data.emis.reduce((sum, e) => sum + (e.monthlyAmount || 0), 0);
    
    const bills = data.bills.filter(b => !['income', 'expense', 'tax'].includes(b.category || '')).reduce((sum, b) => {
      if (b.frequency === 'monthly') return sum + b.amount;
      if (b.frequency === 'yearly') return sum + b.amount / 12;
      return sum + b.amount;
    }, 0);

    const insurances = data.insurances.reduce((sum, i) => {
      if (i.frequency === 'monthly') return sum + i.premium;
      if (i.frequency === 'yearly') return sum + i.premium / 12;
      return sum + i.premium;
    }, 0);

    const currentMonth = new Date().toISOString().slice(0, 7);
    const txnExpenses = (data.transactions || [])
      .filter((t) => t.type === "expense" && t.date?.startsWith(currentMonth))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const totalMonthlyExpenses = subscriptions + emis + bills + insurances + txnExpenses;
    const totalSavings =
      data.savingsPlans.reduce((sum, s) => sum + (s.currentAmount || 0), 0) +
      (data.savingsItems || []).reduce((sum, s) => sum + (s.principal || 0), 0);
    const totalTaxes = data.bills.filter(b => b.category === 'tax').reduce((sum, b) => sum + b.amount, 0);
    const totalPensionContributions = data.investments.filter(i => i.type === 'pension').reduce((sum, i) => sum + (i.sipAmount || 0), 0);

    return {
      totalMonthlyExpenses,
      totalSavings,
      totalTaxes,
      totalPensionContributions
    };
  }, [data]);

  // Calculate Total Monthly Income (instead of Net Worth)
  const totalMonthlyIncome = useMemo(() => {
    // Income from transactions (this month)
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const transactionIncome = (data.transactions || [])
      .filter(t => t.type === 'income' && t.date?.startsWith(currentMonth))
      .reduce((sum, t) => sum + t.amount, 0);

    // Active side income
    const sideIncomeTotal = sideIncomes.filter(s => s.active).reduce((sum, s) => sum + s.monthlyAmount, 0);

    return transactionIncome + sideIncomeTotal;
  }, [data, sideIncomes]);

  // Current month key for budget tracking
  const currentMonthKey = useMemo(() => new Date().toISOString().slice(0, 7), []);

  // Calculate Financial Health Score (0-100)
  const financialHealthScore = useMemo(() => {
    let score = 50; // Base score

    // Credit score factor (max +20)
    const latestCredit = creditScores[creditScores.length - 1];
    if (latestCredit) {
      score += Math.min(20, (latestCredit.score - 500) / 20);
    }

    // Savings rate factor (max +15)
    const savingsTotal =
      data.savingsPlans.reduce((sum, s) => sum + (s.currentAmount || 0), 0) +
      (data.savingsItems || []).reduce((sum, s) => sum + (s.principal || 0), 0);
    score += Math.min(15, savingsTotal / 5000);

    // Debt-to-income factor (max +15)
    const totalDebt = debts.reduce((sum, d) => sum + d.remaining, 0);
    const totalIncome = sideIncomes.filter(s => s.active).reduce((sum, s) => sum + s.monthlyAmount * 12, 0);
    if (totalIncome > 0 && totalDebt < totalIncome * 0.3) {
      score += 15;
    } else if (totalIncome > 0 && totalDebt < totalIncome * 0.5) {
      score += 10;
    }

    // Budget adherence factor
    const overBudgetCount = budgetCategories.filter(b => b.spent > b.limit).length;
    score -= overBudgetCount * 3;

    return Math.max(0, Math.min(100, Math.round(score)));
  }, [creditScores, data, debts, sideIncomes, budgetCategories]);

  // Monthly side income total
  const totalSideIncome = useMemo(() => {
    return sideIncomes.filter(s => s.active).reduce((sum, s) => sum + s.monthlyAmount, 0);
  }, [sideIncomes]);

  // Get periods for time selection  
  const timePeriods = useMemo(() => {
    const periods: { label: string; start: Date; end: Date }[] = [];
    const today = new Date();
    
    if (timePeriod === 'week') {
      for (let i = 0; i < 6; i++) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() - (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const weekNum = Math.ceil((weekStart.getDate() + 1) / 7);
        periods.push({
          label: i === 0 ? `Week ${weekNum}` : `Week ${weekNum}`,
          start: weekStart,
          end: weekEnd
        });
      }
    } else if (timePeriod === 'month') {
      for (let i = 0; i < 6; i++) {
        const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
        periods.push({
          label: i === 0 ? 'This Month' : monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          start: monthDate,
          end: monthEnd
        });
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const yearStart = new Date(today.getFullYear() - i, 0, 1);
        const yearEnd = new Date(today.getFullYear() - i, 11, 31);
        periods.push({
          label: i === 0 ? 'This Year' : yearStart.getFullYear().toString(),
          start: yearStart,
          end: yearEnd
        });
      }
    }
    return periods;
  }, [timePeriod]);

  // Calculate expenses for selected period
  const periodExpenses = useMemo(() => {
    const period = timePeriods[selectedPeriodIndex];
    if (!period) return { categories: [], total: 0 };

    const transactions = data.transactions || [];
    const periodTransactions = transactions.filter(t => {
      if (t.type !== 'expense') return false;
      const txDate = new Date(t.date);
      return txDate >= period.start && txDate <= period.end;
    });

    // Also include budget category spending
    const categoryTotals: { [key: string]: number } = {};
    
    // Add from transactions
    periodTransactions.forEach(t => {
      const cat = t.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + t.amount;
    });

    // Add from budget categories for current month
    if (timePeriod === 'month' && selectedPeriodIndex === 0) {
      budgetCategories.forEach(b => {
        const spent = getBudgetSpentForMonth(b, selectedBudgetMonth);
        if (spent > 0) {
          categoryTotals[b.name] = (categoryTotals[b.name] || 0) + spent;
        }
      });
    }

    const total = Object.values(categoryTotals).reduce((sum, v) => sum + v, 0);
    
    const categories: ExpenseCategory[] = Object.entries(categoryTotals)
      .map(([name, amount]) => ({
        name,
        amount,
        color: CATEGORY_COLORS[name] || CATEGORY_COLORS['Other'],
        icon: getCategoryIcon(name)
      }))
      .sort((a, b) => b.amount - a.amount);

    return { categories, total };
  }, [data.transactions, timePeriods, selectedPeriodIndex, budgetCategories, getBudgetSpentForMonth, selectedBudgetMonth, timePeriod]);

  // Calculate period income
  const periodIncome = useMemo(() => {
    const period = timePeriods[selectedPeriodIndex];
    if (!period) return 0;

    const transactions = data.transactions || [];
    return transactions
      .filter(t => {
        if (t.type !== 'income') return false;
        const txDate = new Date(t.date);
        return txDate >= period.start && txDate <= period.end;
      })
      .reduce((sum, t) => sum + t.amount, 0);
  }, [data.transactions, timePeriods, selectedPeriodIndex]);

  // Net Worth calculation (Assets - Liabilities)
  const netWorthData = useMemo(() => {
    const totalAssets = 
      assets.reduce((sum, a) => sum + a.value, 0) +
      data.savingsPlans.reduce((sum, s) => sum + (s.currentAmount || 0), 0) +
      (data.savingsItems || []).reduce((sum, s) => sum + (s.principal || 0), 0) +
      data.investments.reduce((sum, i) => sum + (i.currentValue || 0), 0);

    const totalLiabilities = 
      debts.reduce((sum, d) => sum + d.remaining, 0) +
      data.emis.reduce((sum, e) => sum + (e.monthlyAmount || 0) * (e.remainingMonths || 0), 0);

    return {
      netWorth: totalAssets - totalLiabilities,
      assets: totalAssets,
      liabilities: totalLiabilities
    };
  }, [assets, data, debts]);

  // Monthly statistics for reports
  const monthlyStats = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const transactions = data.transactions || [];
    
    const monthTxs = transactions.filter(t => t.date?.startsWith(currentMonth));
    const expenses = monthTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const income = monthTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    
    // Add budget spending to expenses
    const budgetSpent = budgetCategories.reduce((sum, b) => sum + getBudgetSpentForMonth(b, currentMonth), 0);
    
    return {
      expenses: expenses + budgetSpent,
      income: income + totalSideIncome,
      balance: (income + totalSideIncome) - (expenses + budgetSpent)
    };
  }, [data.transactions, budgetCategories, getBudgetSpentForMonth, totalSideIncome]);

  // Handlers for EMI
  const handleAddEMI = useCallback(() => {
    if (!formData.name?.trim() || !formData.amount || !formData.dueDate) {
      toast.error("Please fill all required fields");
      return;
    }

    const remainingMonths = parseInt(formData.remainingMonths || '12');
    const monthlyAmount = parseFloat(formData.amount);
    const fields: Partial<EMI> = {
      name: formData.name.trim(),
      totalAmount: monthlyAmount * remainingMonths,
      monthlyAmount,
      dueDay: parseInt(formData.dueDate),
      tenure: remainingMonths,
      remainingMonths,
      interestRate: formData.interestRate ? parseFloat(formData.interestRate) : undefined,
      lender: formData.bank || '',
      category: 'other',
    };

    if (editingId) {
      LifeManagementService.updateEMI(editingId, fields);
      toast.success("EMI updated");
    } else {
      LifeManagementService.addEMI({
        id: `emi-${Date.now()}`,
        startDate: new Date().toISOString().split('T')[0],
        name: fields.name!,
        totalAmount: fields.totalAmount!,
        monthlyAmount: fields.monthlyAmount!,
        dueDay: fields.dueDay!,
        tenure: fields.tenure!,
        remainingMonths: fields.remainingMonths!,
        interestRate: fields.interestRate,
        lender: fields.lender,
        category: 'other',
      });
      toast.success("EMI added successfully!");
    }
    resetForm();
    refreshData();
  }, [formData, editingId, resetForm, refreshData]);

  const openEditEMI = useCallback((emi: EMI) => {
    setEditingId(emi.id);
    setShowAddForm("emi");
    setFormData({
      name: emi.name,
      amount: String(emi.monthlyAmount),
      dueDate: String(emi.dueDay),
      bank: emi.lender || "",
      remainingMonths: String(emi.remainingMonths),
      interestRate: emi.interestRate != null ? String(emi.interestRate) : "",
    });
  }, []);

  // Handlers for Insurance
  const handleAddInsurance = useCallback(() => {
    if (!formData.name?.trim() || !formData.premium) {
      toast.error("Please fill all required fields");
      return;
    }

    const fields: Partial<Insurance> = {
      name: formData.name.trim(),
      type: (formData.type as Insurance['type']) || 'health',
      provider: formData.provider || '',
      premium: parseFloat(formData.premium),
      frequency: 'yearly',
      renewalDate: formData.renewalDate || new Date().toISOString().split('T')[0],
      reminderDays: 7,
    };

    if (editingId) {
      LifeManagementService.updateInsurance(editingId, fields);
      toast.success("Insurance updated");
    } else {
      LifeManagementService.addInsurance({
        id: `insurance-${Date.now()}`,
        policyNumber: '',
        startDate: new Date().toISOString().split('T')[0],
        coverageAmount: 0,
        name: fields.name!,
        type: fields.type!,
        provider: fields.provider!,
        premium: fields.premium!,
        frequency: 'yearly',
        renewalDate: fields.renewalDate!,
        reminderDays: 7,
      });
      toast.success("Insurance added successfully!");
    }
    resetForm();
    refreshData();
  }, [formData, editingId, resetForm, refreshData]);

  const openEditInsurance = useCallback((insurance: Insurance) => {
    setEditingId(insurance.id);
    setShowAddForm("insurance");
    setFormData({
      name: insurance.name,
      type: insurance.type,
      premium: String(insurance.premium),
      renewalDate: insurance.renewalDate || "",
      provider: insurance.provider || "",
    });
  }, []);

  // Handlers for Subscription
  const handleAddSubscription = useCallback(() => {
    if (!formData.name?.trim() || !formData.amount) {
      toast.error("Please fill all required fields");
      return;
    }

    const fields: Partial<Subscription> = {
      name: formData.name.trim(),
      amount: parseFloat(formData.amount),
      frequency: 'monthly',
      nextBillingDate: formData.renewalDate || new Date().toISOString().split('T')[0],
      category: formData.category || 'entertainment',
      autoRenew: true,
      reminderDays: 3,
    };

    if (editingId) {
      LifeManagementService.updateSubscription(editingId, fields);
      toast.success("Subscription updated");
    } else {
      LifeManagementService.addSubscription({
        id: `sub-${Date.now()}`,
        startDate: new Date().toISOString().split('T')[0],
        name: fields.name!,
        amount: fields.amount!,
        frequency: 'monthly',
        nextBillingDate: fields.nextBillingDate!,
        category: fields.category!,
        autoRenew: true,
        reminderDays: 3,
      });
      toast.success("Subscription added successfully!");
    }
    resetForm();
    refreshData();
  }, [formData, editingId, resetForm, refreshData]);

  const openEditSubscription = useCallback((sub: Subscription) => {
    setEditingId(sub.id);
    setShowAddForm("subscription");
    setFormData({
      name: sub.name,
      amount: String(sub.amount),
      renewalDate: sub.nextBillingDate || "",
      category: sub.category || "",
    });
  }, []);

  // Handlers for Daily Transaction
  const handleAddDailyTransaction = useCallback(() => {
    if (!formData.description?.trim() || !formData.amount) {
      toast.error("Please fill all required fields");
      return;
    }

    const isIncome = showAddForm === 'income';
    const transaction: Transaction = {
      id: `txn-${Date.now()}`,
      description: formData.description.trim(),
      amount: parseFloat(formData.amount),
      type: isIncome ? 'income' : 'expense',
      category: isIncome ? 'income' : 'expense',
      date: new Date().toISOString().split('T')[0]
    };

    // Store as transaction (persists local + backend via LifeManagementService patch)
    const currentData = LifeManagementService.getData();
    if (!currentData.transactions) currentData.transactions = [];
    currentData.transactions.push(transaction);
    LifeManagementService.saveData(currentData);

    toast.success(`${isIncome ? 'Income' : 'Expense'} recorded!`);
    resetForm();
    refreshData();
  }, [formData, showAddForm, resetForm, refreshData]);

  // Handlers for Savings Goal
  const handleAddSavingsGoal = useCallback(() => {
    if (!formData.name?.trim() || !formData.targetAmount) {
      toast.error("Please fill all required fields");
      return;
    }

    const savingsPlan: SavingsPlan = {
      id: `savings-${Date.now()}`,
      name: formData.name.trim(),
      targetAmount: parseFloat(formData.targetAmount),
      currentAmount: parseFloat(formData.currentAmount || '0'),
      monthlyContribution: 0,
      startDate: new Date().toISOString().split('T')[0],
      targetDate: formData.deadline || '',
      category: 'other',
      autoDebit: false
    };

    LifeManagementService.addSavingsPlan(savingsPlan);
    toast.success("Savings goal added!");
    resetForm();
    refreshData();
  }, [formData, resetForm, refreshData]);

  // Update savings amount
  const handleUpdateSavings = useCallback((id: string, amount: number) => {
    const saving = data.savingsPlans.find(s => s.id === id);
    if (saving) {
      LifeManagementService.updateSavingsPlan(id, {
        currentAmount: (saving.currentAmount || 0) + amount
      });
      toast.success(`Added ${money(amount)} to savings!`);
      refreshData();
    }
  }, [data.savingsPlans, refreshData]);

  // Handlers for Tax
  const handleAddTax = useCallback(() => {
    if (!formData.taxType || !formData.amount) {
      toast.error("Please fill all required fields");
      return;
    }

    const bill: Bill = {
      id: `tax-${Date.now()}`,
      name: `${formData.taxType} Tax`,
      amount: parseFloat(formData.amount),
      dueDate: new Date().toISOString().split('T')[0],
      frequency: 'one-time',
      category: 'tax',
      isPaid: false,
      reminderDays: 7
    };

    LifeManagementService.addBill(bill);
    toast.success("Tax record added!");
    resetForm();
    refreshData();
  }, [formData, resetForm, refreshData]);

  // Handlers for Pension
  const handleAddPension = useCallback(() => {
    if (!formData.name?.trim() || !formData.monthlyContribution) {
      toast.error("Please fill all required fields");
      return;
    }

    const investment: Investment = {
      id: `pension-${Date.now()}`,
      name: formData.name.trim(),
      type: 'pension',
      investedAmount: parseFloat(formData.totalValue || '0'),
      currentValue: parseFloat(formData.totalValue || '0'),
      startDate: formData.startDate || new Date().toISOString().split('T')[0],
      returns: parseFloat(formData.returnRate || '0'),
      provider: 'Self',
      sipAmount: parseFloat(formData.monthlyContribution)
    };

    LifeManagementService.addInvestment(investment);
    toast.success("Pension plan added!");
    resetForm();
    refreshData();
  }, [formData, resetForm, refreshData]);

  // Delete handlers
  const handleDelete = useCallback((type: string, id: string) => {
    if (editingId === id) resetForm();
    switch (type) {
      case 'emi':
        LifeManagementService.deleteEMI(id);
        break;
      case 'insurance':
        LifeManagementService.deleteInsurance(id);
        break;
      case 'subscription':
        LifeManagementService.deleteSubscription(id);
        break;
      case 'bill':
        LifeManagementService.deleteBill(id);
        break;
      case 'savings':
        LifeManagementService.deleteSavingsPlan(id);
        break;
      case 'investment':
        LifeManagementService.deleteInvestment(id);
        break;
      case 'transaction': {
        const currentData = LifeManagementService.getData();
        currentData.transactions = (currentData.transactions || []).filter(t => t.id !== id);
        LifeManagementService.saveData(currentData);
        break;
      }
      case 'credit_score':
        setCreditScores(prev => prev.filter(c => c.id !== id));
        break;
      case 'budget':
        setBudgetCategories(prev => prev.filter(b => b.id !== id));
        break;
      case 'debt':
        setDebts(prev => prev.filter(d => d.id !== id));
        break;
      case 'side_income':
        setSideIncomes(prev => prev.filter(s => s.id !== id));
        break;
    }
    toast.success("Deleted successfully!");
    refreshData();
  }, [editingId, resetForm, refreshData]);

  // Handler for Credit Score
  const handleAddCreditScore = useCallback(() => {
    if (!formData.score || !formData.provider) {
      toast.error("Please fill all required fields");
      return;
    }

    const newScore: CreditScore = {
      id: `credit-${Date.now()}`,
      score: parseInt(formData.score),
      date: new Date().toISOString().split('T')[0],
      provider: formData.provider.trim()
    };

    setCreditScores(prev => [...prev, newScore]);
    toast.success("Credit score recorded!");
    resetForm();
  }, [formData, resetForm]);

  // Handler for Budget Category
  const handleAddBudget = useCallback(() => {
    if (!formData.name?.trim() || !formData.limit) {
      toast.error("Please fill all required fields");
      return;
    }

    const newBudget: BudgetCategory = {
      id: `budget-${Date.now()}`,
      name: formData.name.trim(),
      limit: parseFloat(formData.limit),
      spent: parseFloat(formData.spent || '0'),
      period: (formData.period as BudgetCategory['period']) || 'monthly'
    };

    setBudgetCategories(prev => [...prev, newBudget]);
    toast.success("Budget category added!");
    resetForm();
  }, [formData, resetForm]);

  // Update budget spending for specific month
  const handleUpdateBudgetSpending = useCallback((id: string, spent: number, month: string = selectedBudgetMonth) => {
    setBudgetCategories(prev => prev.map(b => {
      if (b.id !== id) return b;
      const newMonthlyHistory = { ...(b.monthlyHistory || {}), [month]: spent };
      // Update current spent if it's current month
      const isCurrentMonth = month === new Date().toISOString().slice(0, 7);
      return { 
        ...b, 
        spent: isCurrentMonth ? spent : b.spent,
        monthlyHistory: newMonthlyHistory 
      };
    }));
    toast.success("Budget updated!");
  }, [selectedBudgetMonth]);

  // Handler for Debt
  const handleAddDebt = useCallback(() => {
    if (!formData.name?.trim() || !formData.remaining || !formData.monthlyPayment) {
      toast.error("Please fill all required fields");
      return;
    }

    const newDebt: Debt = {
      id: `debt-${Date.now()}`,
      name: formData.name.trim(),
      type: (formData.type as Debt['type']) || 'other',
      principal: parseFloat(formData.principal || formData.remaining),
      remaining: parseFloat(formData.remaining),
      interestRate: parseFloat(formData.interestRate || '0'),
      monthlyPayment: parseFloat(formData.monthlyPayment),
      dueDate: formData.dueDate || ''
    };

    setDebts(prev => [...prev, newDebt]);
    toast.success("Debt tracker added!");
    resetForm();
  }, [formData, resetForm]);

  // Handler for Side Income
  const handleAddSideIncome = useCallback(() => {
    if (!formData.source?.trim() || !formData.monthlyAmount) {
      toast.error("Please fill all required fields");
      return;
    }

    const newIncome: SideIncome = {
      id: `income-${Date.now()}`,
      source: formData.source.trim(),
      monthlyAmount: parseFloat(formData.monthlyAmount),
      type: (formData.type as SideIncome['type']) || 'other',
      active: formData.active !== 'false'
    };

    setSideIncomes(prev => [...prev, newIncome]);
    toast.success("Side income added!");
    resetForm();
  }, [formData, resetForm]);

  // Handler for Assets
  const handleAddAsset = useCallback(() => {
    if (!formData.name?.trim() || !formData.assetValue) {
      toast.error("Please fill all required fields");
      return;
    }

    const newAsset: Asset = {
      id: `asset-${Date.now()}`,
      name: formData.name.trim(),
      type: (formData.assetType as Asset['type']) || 'other',
      value: parseFloat(formData.assetValue),
      date: new Date().toISOString().split('T')[0]
    };

    setAssets(prev => [...prev, newAsset]);
    toast.success("Asset added!");
    resetForm();
  }, [formData, resetForm]);

  // Delete asset
  const handleDeleteAsset = useCallback((id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id));
    toast.success("Asset removed");
  }, []);

  // Toggle side income active status
  const toggleSideIncomeActive = useCallback((id: string) => {
    setSideIncomes(prev => prev.map(s => 
      s.id === id ? { ...s, active: !s.active } : s
    ));
  }, []);

  // Get daily transactions
  const dailyTransactions = useMemo(() => {
    return (data.transactions || []).slice(-10).reverse();
  }, [data.transactions]);

  // Get taxes
  const taxes = useMemo(() => {
    return data.bills.filter(b => b.category === 'tax');
  }, [data.bills]);

  // Get pensions
  const pensions = useMemo(() => {
    return data.investments.filter(i => i.type === 'pension');
  }, [data.investments]);

  return (
    <div className="w-full h-full bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-background overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-lg text-foreground">Finance Manager</h2>
            <p className="text-xs text-muted-foreground">Complete financial control</p>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex gap-1 mt-3 bg-muted rounded-lg p-1 overflow-x-auto">
          <Button 
            variant={activeViewTab === 'dashboard' ? 'default' : 'ghost'}
            size="sm"
            className="flex-shrink-0"
            onClick={() => setActiveViewTab('dashboard')}
          >
            <Home className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
          <Button 
            variant={activeViewTab === 'daily_inout' ? 'default' : 'ghost'}
            size="sm"
            className="flex-shrink-0"
            onClick={() => setActiveViewTab('daily_inout')}
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            Daily In & Out
          </Button>
          <Button 
            variant={activeViewTab === 'networth' ? 'default' : 'ghost'}
            size="sm"
            className="flex-shrink-0"
            onClick={() => setActiveViewTab('networth')}
          >
            <Landmark className="h-4 w-4 mr-1" />
            Net Worth
          </Button>
          <Button 
            variant={activeViewTab === 'bills' ? 'default' : 'ghost'}
            size="sm"
            className="flex-shrink-0"
            onClick={() => setActiveViewTab('bills')}
          >
            <Receipt className="h-4 w-4 mr-1" />
            Bills
          </Button>
          <Button 
            variant={activeViewTab === 'charts' ? 'default' : 'ghost'}
            size="sm"
            className="flex-shrink-0"
            onClick={() => setActiveViewTab('charts')}
          >
            <PieChart className="h-4 w-4 mr-1" />
            Charts
          </Button>
          <Button 
            variant={activeViewTab === 'investments' ? 'default' : 'ghost'}
            size="sm"
            className="flex-shrink-0"
            onClick={() => setActiveViewTab('investments')}
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            Investments
          </Button>
          <Button 
            variant={activeViewTab === 'savings' ? 'default' : 'ghost'}
            size="sm"
            className="flex-shrink-0"
            onClick={() => setActiveViewTab('savings')}
          >
            <PiggyBank className="h-4 w-4 mr-1" />
            Savings
          </Button>
          <Button 
            variant={activeViewTab === 'reports' ? 'default' : 'ghost'}
            size="sm"
            className="flex-shrink-0"
            onClick={() => setActiveViewTab('reports')}
          >
            <FileText className="h-4 w-4 mr-1" />
            Reports
          </Button>
          <Button 
            variant={activeViewTab === 'currency' ? 'default' : 'ghost'}
            size="sm"
            className="flex-shrink-0"
            onClick={() => setActiveViewTab('currency')}
          >
            <Coins className="h-4 w-4 mr-1" />
            Currency
          </Button>
        </div>
      </div>
      {/* Net Worth View */}
      {activeViewTab === 'networth' && <NetWorthTracker />}

      {/* Currency View */}
      {activeViewTab === 'currency' && <CurrencyConverter />}

      {/* Charts View */}
      {activeViewTab === 'charts' && (
        <div className="flex-1 overflow-y-auto p-4">
          {/* Time Period Toggle */}
          <div className="flex gap-1 bg-muted rounded-lg p-1 mb-4">
            {(['week', 'month', 'year'] as TimePeriod[]).map(p => (
              <Button 
                key={p}
                variant={timePeriod === p ? 'default' : 'ghost'}
                size="sm"
                className="flex-1 capitalize"
                onClick={() => { setTimePeriod(p); setSelectedPeriodIndex(0); }}
              >
                {p}
              </Button>
            ))}
          </div>

          {/* Period Selector */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {timePeriods.map((p, i) => (
              <Button
                key={i}
                variant={selectedPeriodIndex === i ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPeriodIndex(i)}
                className="whitespace-nowrap"
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Donut Chart */}
          <Card className="border-border mb-4">
            <CardContent className="p-6">
              <div className="flex items-center justify-center">
                <div className="relative">
                  <svg width="200" height="200" viewBox="0 0 200 200">
                    {(() => {
                      const { categories, total } = periodExpenses;
                      if (total === 0) {
                        return (
                          <circle
                            cx="100"
                            cy="100"
                            r="80"
                            fill="none"
                            stroke="#e5e7eb"
                            strokeWidth="20"
                          />
                        );
                      }
                      
                      let cumulativePercent = 0;
                      return categories.map((cat, i) => {
                        const percent = cat.amount / total;
                        const startAngle = cumulativePercent * 360;
                        cumulativePercent += percent;
                        const endAngle = cumulativePercent * 360;
                        
                        const startRad = (startAngle - 90) * Math.PI / 180;
                        const endRad = (endAngle - 90) * Math.PI / 180;
                        
                        const x1 = 100 + 80 * Math.cos(startRad);
                        const y1 = 100 + 80 * Math.sin(startRad);
                        const x2 = 100 + 80 * Math.cos(endRad);
                        const y2 = 100 + 80 * Math.sin(endRad);
                        
                        const largeArc = percent > 0.5 ? 1 : 0;
                        
                        return (
                          <path
                            key={i}
                            d={`M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`}
                            fill={cat.color}
                          />
                        );
                      });
                    })()}
                    <circle cx="100" cy="100" r="50" fill="hsl(var(--background))" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-2xl font-bold">{money(periodExpenses.total.toFixed(0))}</p>
                    <p className="text-sm text-muted-foreground">Total</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Category Breakdown */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Expense Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {periodExpenses.categories.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No expenses for this period</p>
              ) : (
                periodExpenses.categories.map((cat, i) => {
                  const percent = periodExpenses.total > 0 
                    ? ((cat.amount / periodExpenses.total) * 100).toFixed(1) 
                    : '0';
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div 
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: cat.color + '20' }}
                      >
                        {getCategoryIcon(cat.name, cat.color)}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">{cat.name}</span>
                          <span className="text-sm font-semibold">{money(cat.amount.toFixed(2))}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all"
                              style={{ 
                                width: `${percent}%`,
                                backgroundColor: cat.color 
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">{percent}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Investments View */}
      {activeViewTab === 'investments' && <InvestmentHub />}

      {/* Savings View — bank, emergency fund, FD / RD with % calc */}
      {activeViewTab === 'savings' && <SavingsHub />}

      {/* Reports View */}
      {activeViewTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: '0', overflow: 'hidden', backgroundColor: '#0f0f0f' }}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Analytics</p>
              <p className="text-xs text-muted-foreground">Complete analytics and account overview</p>
            </div>
          </div>

          <div style={{ display: 'flex', flex: '1 1 0', minHeight: '0', overflowX: 'auto', overflowY: 'auto' }}>
            <div style={{ padding: '1rem', minWidth: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="space-y-4 pb-4">
                <Card className="border-border">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm">Income vs Expenses</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={[{ name: 'This Month', income: monthlyStats.income, expenses: monthlyStats.expenses }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                        <XAxis dataKey="name" stroke="#666" />
                        <YAxis stroke="#666" />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #4b5563' }} formatter={(value: number) => `${money(value.toFixed(2))}`} />
                        <Legend />
                        <Bar dataKey="income" fill="#4ade80" name="Income" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="expenses" fill="#f87171" name="Expenses" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm">Monthly Statistics</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-red-500" />
                        <span className="text-sm">Expenses</span>
                      </div>
                      <span className="font-semibold text-red-500">{money(monthlyStats.expenses.toFixed(2))}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-sm">Income</span>
                      </div>
                      <span className="font-semibold text-green-500">{money(monthlyStats.income.toFixed(2))}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-blue-500" />
                        <span className="text-sm">Balance</span>
                      </div>
                      <span className={`font-semibold ${monthlyStats.balance >= 0 ? 'text-green-500' : 'text-red-500'}`}>{money(monthlyStats.balance.toFixed(2))}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm">Monthly Budget</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {budgetCategories.slice(0, 4).map(cat => {
                        const spent = getBudgetSpentForMonth(cat, selectedBudgetMonth);
                        const percent = Math.min((spent / cat.limit) * 100, 100);
                        const isOver = spent > cat.limit;
                        return (
                          <div key={cat.id}>
                            <div className="flex justify-between text-sm mb-1">
                              <span>{cat.name}</span>
                              <span className={isOver ? 'text-red-500' : ''}>{money(spent.toFixed(0))} / {money(cat.limit)}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      {budgetCategories.length === 0 && <p className="text-center text-muted-foreground py-2">No budget categories set</p>}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-3">
                  <Card className="border-border">
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">{creditScores.length > 0 ? creditScores[creditScores.length - 1].score : '-'}</p>
                      <p className="text-xs text-muted-foreground">Credit Score</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border">
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">{financialHealthScore}</p>
                      <p className="text-xs text-muted-foreground">Health Score</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border bg-gradient-to-r from-blue-500/10 to-purple-500/10">
                  <CardContent className="p-6 text-center">
                    <p className="text-sm text-muted-foreground mb-1">Net Worth</p>
                    <p className={`text-3xl font-bold ${netWorthData.netWorth >= 0 ? 'text-green-500' : 'text-red-500'}`}>{money(netWorthData.netWorth.toFixed(2))}</p>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-3">
                  <Card className="border-border border-green-500/30">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-muted-foreground">Assets</span>
                      </div>
                      <p className="text-xl font-bold text-green-500">{money(netWorthData.assets.toFixed(2))}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border border-red-500/30">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="h-4 w-4 text-red-500" />
                        <span className="text-sm text-muted-foreground">Liabilities</span>
                      </div>
                      <p className="text-xl font-bold text-red-500">{money(netWorthData.liabilities.toFixed(2))}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Assets</CardTitle>
                      <Button size="sm" variant="outline" onClick={() => setShowAddForm("asset")}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {showAddForm === "asset" && (
                      <div className="mb-3 p-3 border border-border rounded-lg space-y-2">
                        <Input placeholder="Asset Name" value={formData.name || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })} />
                        <select className="w-full p-2 border border-border rounded-md bg-background text-foreground text-sm" value={formData.assetType || "property"} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, assetType: e.target.value })}>
                          <option value="property">Property</option>
                          <option value="vehicle">Vehicle</option>
                          <option value="investment">Investment</option>
                          <option value="savings">Savings</option>
                          <option value="other">Other</option>
                        </select>
                        <Input type="number" placeholder={`Value (${moneySym()})`} value={formData.assetValue || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, assetValue: e.target.value })} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleAddAsset} className="flex-1">Add Asset</Button>
                          <Button size="sm" variant="outline" onClick={resetForm}>Cancel</Button>
                        </div>
                      </div>
                    )}
                    {assets.length === 0 && showAddForm !== "asset" ? (
                      <p className="text-center text-muted-foreground py-4">No assets added</p>
                    ) : (
                      <div className="space-y-2">
                        {assets.map(asset => (
                          <div key={asset.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                            <div className="flex items-center gap-2">
                              <Landmark className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">{asset.name}</p>
                                <p className="text-xs text-muted-foreground capitalize">{asset.type}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-green-500">{money(asset.value.toFixed(2))}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteAsset(asset.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Liabilities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {debts.length === 0 && data.emis.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">No liabilities</p>
                    ) : (
                      <div className="space-y-2">
                        {debts.map(debt => (
                          <div key={debt.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                            <div>
                              <p className="text-sm font-medium">{debt.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">{debt.type}</p>
                            </div>
                            <span className="font-semibold text-red-500">{money(debt.remaining.toFixed(2))}</span>
                          </div>
                        ))}
                        {data.emis.map(emi => (
                          <div key={emi.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                            <div>
                              <p className="text-sm font-medium">{emi.name}</p>
                              <p className="text-xs text-muted-foreground">EMI - {emi.remainingMonths} months left</p>
                            </div>
                            <span className="font-semibold text-red-500">{money(((emi.monthlyAmount || 0) * (emi.remainingMonths || 0)).toFixed(2))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard View */}
      {activeViewTab === 'dashboard' && (
        <FinanceDashboard
          onNavigate={(tab) => setActiveViewTab(tab)}
          healthScore={financialHealthScore}
          sideIncome={totalSideIncome}
        />
      )}

      {/* Daily In & Out View — monthly filters + create per month */}
      {activeViewTab === 'daily_inout' && <DailyInOutHub />}

      {/* Bills — EMIs, insurance, subscriptions + reminders */}
      {activeViewTab === 'bills' && <BillsHub />}

    </div>
  );
};

export default FinancialAssistant;
