export interface Subscription {
  id: string;
  name: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  nextBillingDate: string;
  category: string;
  autoRenew: boolean;
  reminderDays: number;
}

export interface EMI {
  id: string;
  name: string;
  totalAmount: number;
  monthlyAmount: number;
  startDate: string;
  dueDay: number; // Day of month (1-31)
  tenure: number; // Total months
  remainingMonths: number;
  interestRate?: number;
  /** Original loan principal (without interest) — used for paid/interest breakdown */
  principalAmount?: number;
  /** Next installment due date (YYYY-MM-DD) */
  nextPaymentDate?: string;
  /** Days before due date to remind (default 7) */
  reminderDays?: number;
  lastPaidDate?: string;
  lender: string;
  category: 'home' | 'car' | 'personal' | 'education' | 'business' | 'other';
}

export interface Insurance {
  id: string;
  name: string;
  type: 'life' | 'health' | 'car' | 'home' | 'travel' | 'other';
  provider: string;
  policyNumber: string;
  premium: number;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  renewalDate: string;
  coverageAmount: number;
  beneficiaries?: string[];
  reminderDays: number;
}

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  frequency: 'one-time' | 'monthly' | 'quarterly' | 'yearly';
  category: 'electricity' | 'water' | 'gas' | 'internet' | 'phone' | 'rent' | 'tax' | 'other';
  isPaid: boolean;
  reminderDays: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  isCompleted: boolean;
  createdAt: string;
  completedAt?: string;
  recurring?: boolean;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly';
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees?: string[];
  reminderMinutes: number;
  isRecurring: boolean;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly';
}

export interface Habit {
  id: string;
  name: string;
  description?: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  targetDays?: number[]; // Days of week (0-6) or month (1-31)
  streak: number;
  bestStreak: number;
  lastCompleted?: string;
  reminderTime?: string;
}

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  isRecurring: boolean;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly';
  isCompleted: boolean;
}

export interface SavingsPlan {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  startDate: string;
  targetDate: string;
  category: 'emergency' | 'vacation' | 'purchase' | 'retirement' | 'education' | 'other';
  autoDebit: boolean;
}

/** Where money is parked: bank cash, emergency fund, FD / RD / interest products */
export type SavingsKind =
  | 'bank_account'
  | 'emergency_fund'
  | 'fixed_deposit'
  | 'recurring_deposit'
  | 'savings_account'
  | 'investment'
  | 'bonds'
  | 'other';

export type SavingsCompounding =
  | 'simple'
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly';

export interface SavingsItem {
  id: string;
  name: string;
  kind: SavingsKind;
  /** Current balance / principal deposited */
  principal: number;
  /** Annual interest rate % — used to project maturity / growth */
  interestRate?: number;
  compounding?: SavingsCompounding;
  startDate: string;
  tenureMonths?: number;
  maturityDate?: string;
  /** Cached maturity / projected value from rate + tenure */
  maturityAmount?: number;
  monthlyContribution?: number;
  /** Goal target (emergency fund, purchase, etc.) */
  targetAmount?: number;
  provider?: string;
  notes?: string;
  currency?: string;
}

export interface Investment {
  id: string;
  name: string;
  type: 'stocks' | 'mutual_funds' | 'bonds' | 'real_estate' | 'crypto' | 'fixed_deposit' | 'gold' | 'pension' | 'other';
  investedAmount: number;
  currentValue: number;
  startDate: string;
  returns: number; // percentage
  maturityDate?: string;
  provider: string;
  sipAmount?: number; // Monthly SIP if applicable
  interestRate?: number;
  compounding?: SavingsCompounding;
  tenureMonths?: number;
}

export interface CreditCard {
  id: string;
  cardName: string;
  bank: string;
  last4Digits: string;
  creditLimit: number;
  currentBalance: number;
  availableCredit: number;
  billingDate: number; // Day of month
  dueDate: number; // Day of month
  interestRate: number;
  rewardPoints?: number;
  annualFee?: number;
  cardType: 'visa' | 'mastercard' | 'amex' | 'rupay' | 'other';
  expiryDate: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  type?: "text" | "command" | "summary";
  data?: any;
}

// Budget tracking
export interface Budget {
  id: string;
  category: string;
  monthlyLimit: number;
  spent: number;
  month: string; // YYYY-MM format
}

// Transaction for tracking daily expenses
export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: string;
  paymentMethod?: string;
  notes?: string;
}

// Financial summary
export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  totalInvestments: number;
  totalDebt: number;
  netWorth: number;
}

export interface LifeManagementData {
  subscriptions: Subscription[];
  emis: EMI[];
  insurances: Insurance[];
  bills: Bill[];
  tasks: Task[];
  meetings: Meeting[];
  habits: Habit[];
  reminders: Reminder[];
  savingsPlans: SavingsPlan[];
  /** Bank accounts, emergency fund, FDs, RDs, interest savings */
  savingsItems: SavingsItem[];
  investments: Investment[];
  creditCards: CreditCard[];
  budgets: Budget[];
  transactions: Transaction[];
}
