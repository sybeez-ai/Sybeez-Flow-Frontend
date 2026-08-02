import { LifeManagementData, Subscription, EMI, Insurance, Bill, PeopleMoneyItem, Task, Meeting, Habit, Reminder, SavingsPlan, SavingsItem, Investment, CreditCard, Budget, Transaction, FinancialSummary } from "@/types/lifeManagement";
import { usGetItem, usSetItem } from "@/services/userStorage";

const STORAGE_KEY = "life_management_data";

export class LifeManagementService {
  
  static getData(): LifeManagementData {
    try {
      const data = usGetItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Ensure new fields exist even if older blobs are partial
        return {
          subscriptions: Array.isArray(parsed?.subscriptions) ? parsed.subscriptions : [],
          emis: Array.isArray(parsed?.emis) ? parsed.emis : [],
          insurances: Array.isArray(parsed?.insurances) ? parsed.insurances : [],
          bills: Array.isArray(parsed?.bills) ? parsed.bills : [],
          peopleMoney: Array.isArray(parsed?.peopleMoney) ? parsed.peopleMoney : [],
          tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : [],
          meetings: Array.isArray(parsed?.meetings) ? parsed.meetings : [],
          habits: Array.isArray(parsed?.habits) ? parsed.habits : [],
          reminders: Array.isArray(parsed?.reminders) ? parsed.reminders : [],
          savingsPlans: Array.isArray(parsed?.savingsPlans) ? parsed.savingsPlans : [],
          savingsItems: Array.isArray(parsed?.savingsItems) ? parsed.savingsItems : [],
          investments: Array.isArray(parsed?.investments) ? parsed.investments : [],
          creditCards: Array.isArray(parsed?.creditCards) ? parsed.creditCards : [],
          budgets: Array.isArray(parsed?.budgets) ? parsed.budgets : [],
          transactions: Array.isArray(parsed?.transactions) ? parsed.transactions : [],
        };
      }
    } catch {
      /* corrupt storage — return empty */
    }
    return {
      subscriptions: [],
      emis: [],
      insurances: [],
      bills: [],
      peopleMoney: [],
      tasks: [],
      meetings: [],
      habits: [],
      reminders: [],
      savingsPlans: [],
      savingsItems: [],
      investments: [],
      creditCards: [],
      budgets: [],
      transactions: [],
    };
  }

  static saveData(data: LifeManagementData): void {
    usSetItem(STORAGE_KEY, JSON.stringify(data));
  }

  // Subscriptions
  static addSubscription(subscription: Subscription): void {
    const data = this.getData();
    data.subscriptions.push(subscription);
    this.saveData(data);
  }

  static updateSubscription(id: string, updates: Partial<Subscription>): void {
    const data = this.getData();
    const index = data.subscriptions.findIndex(s => s.id === id);
    if (index !== -1) {
      data.subscriptions[index] = { ...data.subscriptions[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteSubscription(id: string): void {
    const data = this.getData();
    data.subscriptions = data.subscriptions.filter(s => s.id !== id);
    this.saveData(data);
  }

  // EMIs
  static addEMI(emi: EMI): void {
    const data = this.getData();
    data.emis.push(emi);
    this.saveData(data);
  }

  static updateEMI(id: string, updates: Partial<EMI>): void {
    const data = this.getData();
    const index = data.emis.findIndex(e => e.id === id);
    if (index !== -1) {
      data.emis[index] = { ...data.emis[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteEMI(id: string): void {
    const data = this.getData();
    data.emis = data.emis.filter(e => e.id !== id);
    this.saveData(data);
  }

  // Insurance
  static addInsurance(insurance: Insurance): void {
    const data = this.getData();
    data.insurances.push(insurance);
    this.saveData(data);
  }

  static updateInsurance(id: string, updates: Partial<Insurance>): void {
    const data = this.getData();
    const index = data.insurances.findIndex(i => i.id === id);
    if (index !== -1) {
      data.insurances[index] = { ...data.insurances[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteInsurance(id: string): void {
    const data = this.getData();
    data.insurances = data.insurances.filter(i => i.id !== id);
    this.saveData(data);
  }

  // Bills
  static addBill(bill: Bill): void {
    const data = this.getData();
    data.bills.push(bill);
    this.saveData(data);
  }

  static updateBill(id: string, updates: Partial<Bill>): void {
    const data = this.getData();
    const index = data.bills.findIndex(b => b.id === id);
    if (index !== -1) {
      data.bills[index] = { ...data.bills[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteBill(id: string): void {
    const data = this.getData();
    data.bills = data.bills.filter(b => b.id !== id);
    this.saveData(data);
  }

  // People money (owe / collect) + interest-only then full pay
  static addPeopleMoney(item: PeopleMoneyItem): void {
    const data = this.getData();
    data.peopleMoney = data.peopleMoney || [];
    data.peopleMoney.push(item);
    this.saveData(data);
  }

  static updatePeopleMoney(id: string, updates: Partial<PeopleMoneyItem>): void {
    const data = this.getData();
    data.peopleMoney = data.peopleMoney || [];
    const index = data.peopleMoney.findIndex((p) => p.id === id);
    if (index !== -1) {
      data.peopleMoney[index] = { ...data.peopleMoney[index], ...updates };
      this.saveData(data);
    }
  }

  static deletePeopleMoney(id: string): void {
    const data = this.getData();
    data.peopleMoney = (data.peopleMoney || []).filter((p) => p.id !== id);
    this.saveData(data);
  }

  // Tasks
  static addTask(task: Task): void {
    const data = this.getData();
    data.tasks.push(task);
    this.saveData(data);
  }

  static updateTask(id: string, updates: Partial<Task>): void {
    const data = this.getData();
    const index = data.tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      data.tasks[index] = { ...data.tasks[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteTask(id: string): void {
    const data = this.getData();
    data.tasks = data.tasks.filter(t => t.id !== id);
    this.saveData(data);
  }

  // Meetings
  static addMeeting(meeting: Meeting): void {
    const data = this.getData();
    data.meetings.push(meeting);
    this.saveData(data);
  }

  static updateMeeting(id: string, updates: Partial<Meeting>): void {
    const data = this.getData();
    const index = data.meetings.findIndex(m => m.id === id);
    if (index !== -1) {
      data.meetings[index] = { ...data.meetings[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteMeeting(id: string): void {
    const data = this.getData();
    data.meetings = data.meetings.filter(m => m.id !== id);
    this.saveData(data);
  }

  // Habits
  static addHabit(habit: Habit): void {
    const data = this.getData();
    data.habits.push(habit);
    this.saveData(data);
  }

  static updateHabit(id: string, updates: Partial<Habit>): void {
    const data = this.getData();
    const index = data.habits.findIndex(h => h.id === id);
    if (index !== -1) {
      data.habits[index] = { ...data.habits[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteHabit(id: string): void {
    const data = this.getData();
    data.habits = data.habits.filter(h => h.id !== id);
    this.saveData(data);
  }

  // Reminders
  static addReminder(reminder: Reminder): void {
    const data = this.getData();
    data.reminders.push(reminder);
    this.saveData(data);
  }

  static updateReminder(id: string, updates: Partial<Reminder>): void {
    const data = this.getData();
    const index = data.reminders.findIndex(r => r.id === id);
    if (index !== -1) {
      data.reminders[index] = { ...data.reminders[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteReminder(id: string): void {
    const data = this.getData();
    data.reminders = data.reminders.filter(r => r.id !== id);
    this.saveData(data);
  }

  // Savings Plans
  static addSavingsPlan(plan: SavingsPlan): void {
    const data = this.getData();
    data.savingsPlans.push(plan);
    this.saveData(data);
  }

  static updateSavingsPlan(id: string, updates: Partial<SavingsPlan>): void {
    const data = this.getData();
    const index = data.savingsPlans.findIndex(p => p.id === id);
    if (index !== -1) {
      data.savingsPlans[index] = { ...data.savingsPlans[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteSavingsPlan(id: string): void {
    const data = this.getData();
    data.savingsPlans = data.savingsPlans.filter(p => p.id !== id);
    this.saveData(data);
  }

  // Savings items (bank / emergency / FD / RD / interest products)
  static addSavingsItem(item: SavingsItem): void {
    const data = this.getData();
    if (!data.savingsItems) data.savingsItems = [];
    data.savingsItems.push(item);
    this.saveData(data);
  }

  static updateSavingsItem(id: string, updates: Partial<SavingsItem>): void {
    const data = this.getData();
    if (!data.savingsItems) data.savingsItems = [];
    const index = data.savingsItems.findIndex((s) => s.id === id);
    if (index !== -1) {
      data.savingsItems[index] = { ...data.savingsItems[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteSavingsItem(id: string): void {
    const data = this.getData();
    if (!data.savingsItems) data.savingsItems = [];
    data.savingsItems = data.savingsItems.filter((s) => s.id !== id);
    this.saveData(data);
  }

  // Investments
  static addInvestment(investment: Investment): void {
    const data = this.getData();
    data.investments.push(investment);
    this.saveData(data);
  }

  static updateInvestment(id: string, updates: Partial<Investment>): void {
    const data = this.getData();
    const index = data.investments.findIndex(i => i.id === id);
    if (index !== -1) {
      data.investments[index] = { ...data.investments[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteInvestment(id: string): void {
    const data = this.getData();
    data.investments = data.investments.filter(i => i.id !== id);
    this.saveData(data);
  }

  // Credit Cards
  static addCreditCard(card: CreditCard): void {
    const data = this.getData();
    data.creditCards.push(card);
    this.saveData(data);
  }

  static updateCreditCard(id: string, updates: Partial<CreditCard>): void {
    const data = this.getData();
    const index = data.creditCards.findIndex(c => c.id === id);
    if (index !== -1) {
      data.creditCards[index] = { ...data.creditCards[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteCreditCard(id: string): void {
    const data = this.getData();
    data.creditCards = data.creditCards.filter(c => c.id !== id);
    this.saveData(data);
  }

  // Analytics & Insights
  static getTotalMonthlyExpenses(): number {
    const data = this.getData();
    let total = 0;

    // Subscriptions
    data.subscriptions.forEach(sub => {
      if (sub.frequency === 'monthly') total += sub.amount;
      else if (sub.frequency === 'yearly') total += sub.amount / 12;
      else if (sub.frequency === 'quarterly') total += sub.amount / 3;
    });

    // EMIs
    data.emis.forEach(emi => {
      total += emi.monthlyAmount;
    });

    // Insurance (monthly premium)
    data.insurances.forEach(ins => {
      if (ins.frequency === 'monthly') total += ins.premium;
      else if (ins.frequency === 'yearly') total += ins.premium / 12;
      else if (ins.frequency === 'quarterly') total += ins.premium / 3;
    });

    // Bills (monthly average)
    data.bills.forEach(bill => {
      if (bill.frequency === 'monthly') total += bill.amount;
      else if (bill.frequency === 'yearly') total += bill.amount / 12;
    });

    return total;
  }

  static getUpcomingPayments(days: number = 7): Array<{
    type: string;
    name: string;
    amount: number;
    date: string;
    id?: string;
  }> {
    const data = this.getData();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const upcoming: Array<{ type: string; name: string; amount: number; date: string; id?: string }> = [];

    const withinWindow = (dateStr: string, remindDays: number) => {
      if (!dateStr) return false;
      const due = new Date(dateStr + "T00:00:00");
      due.setHours(0, 0, 0, 0);
      const windowEnd = new Date(start);
      windowEnd.setDate(windowEnd.getDate() + Math.max(remindDays, days));
      return due.getTime() >= start.getTime() - 24 * 60 * 60 * 1000 && due <= windowEnd;
    };

    const clampDay = (n: number) => Math.min(31, Math.max(1, Math.round(Number(n) || 1)));
    const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const resolveNextDue = (dueDay: number, stored?: string): string => {
      if (stored) {
        const d = new Date(stored + "T00:00:00");
        d.setHours(0, 0, 0, 0);
        if (d.getTime() >= start.getTime()) return stored;
      }
      const day = clampDay(dueDay);
      let y = start.getFullYear();
      let m = start.getMonth();
      let candidate = new Date(y, m, Math.min(day, daysInMonth(y, m)));
      candidate.setHours(0, 0, 0, 0);
      if (candidate.getTime() < start.getTime()) {
        m += 1;
        if (m > 11) {
          m = 0;
          y += 1;
        }
        candidate = new Date(y, m, Math.min(day, daysInMonth(y, m)));
      }
      return candidate.toISOString().split("T")[0];
    };

    (data.emis || []).forEach((emi) => {
      if ((emi.remainingMonths || 0) <= 0) return;
      const date = resolveNextDue(emi.dueDay, emi.nextPaymentDate);
      const remind = emi.reminderDays ?? 7;
      if (withinWindow(date, remind)) {
        upcoming.push({
          type: "EMI",
          name: emi.name,
          amount: emi.monthlyAmount,
          date,
          id: emi.id,
        });
      }
    });

    (data.bills || []).forEach((bill) => {
      if (bill.isPaid && bill.frequency === "one-time") return;
      const remind = bill.reminderDays ?? 7;
      const date =
        bill.frequency !== "one-time" && bill.dueDay
          ? resolveNextDue(bill.dueDay, bill.dueDate)
          : bill.dueDate;
      if (withinWindow(date, remind)) {
        upcoming.push({
          type: "Commitment",
          name: bill.name,
          amount: bill.amount,
          date,
          id: bill.id,
        });
      }
    });

    (data.peopleMoney || []).forEach((pm) => {
      if (pm.status === "settled") return;
      const onlyLeft = Math.max(
        0,
        (pm.interestOnlyMonths || 0) - (pm.interestOnlyPaid || 0),
      );
      const payingInterestOnly = onlyLeft > 0 && (pm.monthlyInterest || 0) > 0;
      const amount = payingInterestOnly
        ? pm.monthlyInterest || 0
        : pm.amount;
      const date = payingInterestOnly
        ? pm.nextPaymentDate || pm.fullPayDate || ""
        : pm.fullPayDate || pm.nextPaymentDate || "";
      if (!date) return;
      if (withinWindow(date, 7)) {
        upcoming.push({
          type: pm.direction === "owe" ? "To pay" : "To collect",
          name: pm.personName,
          amount,
          date,
          id: pm.id,
        });
      }
    });

    (data.insurances || []).forEach((ins) => {
      const remind = ins.reminderDays ?? 7;
      if (withinWindow(ins.renewalDate, remind)) {
        upcoming.push({
          type: "Insurance",
          name: ins.name,
          amount: ins.premium,
          date: ins.renewalDate,
          id: ins.id,
        });
      }
    });

    (data.subscriptions || []).forEach((sub) => {
      const remind = sub.reminderDays ?? 3;
      if (withinWindow(sub.nextBillingDate, remind)) {
        upcoming.push({
          type: "Subscription",
          name: sub.name,
          amount: sub.amount,
          date: sub.nextBillingDate,
          id: sub.id,
        });
      }
    });

    return upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // Budgets
  static addBudget(budget: Budget): void {
    const data = this.getData();
    data.budgets.push(budget);
    this.saveData(data);
  }

  static updateBudget(id: string, updates: Partial<Budget>): void {
    const data = this.getData();
    const index = data.budgets.findIndex(b => b.id === id);
    if (index !== -1) {
      data.budgets[index] = { ...data.budgets[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteBudget(id: string): void {
    const data = this.getData();
    data.budgets = data.budgets.filter(b => b.id !== id);
    this.saveData(data);
  }

  static getBudgetsForMonth(month: string): Budget[] {
    const data = this.getData();
    return data.budgets.filter(b => b.month === month);
  }

  // Transactions
  static addTransaction(transaction: Transaction): void {
    const data = this.getData();
    data.transactions.push(transaction);
    this.saveData(data);
  }

  static updateTransaction(id: string, updates: Partial<Transaction>): void {
    const data = this.getData();
    const index = data.transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      data.transactions[index] = { ...data.transactions[index], ...updates };
      this.saveData(data);
    }
  }

  static deleteTransaction(id: string): void {
    const data = this.getData();
    data.transactions = data.transactions.filter(t => t.id !== id);
    this.saveData(data);
  }

  static getTransactionsForMonth(month: string): Transaction[] {
    const data = this.getData();
    return data.transactions.filter(t => t.date.startsWith(month));
  }

  // Financial Summary
  static getFinancialSummary(): FinancialSummary {
    const data = this.getData();
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthTransactions = this.getTransactionsForMonth(currentMonth);

    const totalIncome = monthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = monthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalSavings = data.savingsPlans.reduce((sum, s) => sum + s.currentAmount, 0);
    
    const totalInvestments = data.investments.reduce((sum, i) => sum + i.currentValue, 0);
    
    const totalDebt = data.emis.reduce((sum, e) => sum + (e.monthlyAmount * e.remainingMonths), 0) +
                      data.creditCards.reduce((sum, c) => sum + c.currentBalance, 0);

    const netWorth = totalSavings + totalInvestments - totalDebt;

    return {
      totalIncome,
      totalExpenses,
      totalSavings,
      totalInvestments,
      totalDebt,
      netWorth
    };
  }

  // Spending by category
  static getSpendingByCategory(month: string): { category: string; amount: number; percentage: number }[] {
    const transactions = this.getTransactionsForMonth(month).filter(t => t.type === 'expense');
    const total = transactions.reduce((sum, t) => sum + t.amount, 0);
    
    const byCategory: { [key: string]: number } = {};
    transactions.forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });

    return Object.entries(byCategory).map(([category, amount]) => ({
      category,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 100) : 0
    })).sort((a, b) => b.amount - a.amount);
  }

  // Monthly spending trend
  static getMonthlyTrend(months: number = 6): { month: string; income: number; expenses: number }[] {
    const data = this.getData();
    const result: { month: string; income: number; expenses: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = date.toISOString().slice(0, 7);
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      
      const monthTransactions = data.transactions.filter(t => t.date.startsWith(month));
      const income = monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      const expenses = monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

      result.push({ month: monthName, income, expenses });
    }

    return result;
  }
}
