/**
 * Finance API Service
 * Syncs local finance data with backend RAG system
 */

import { LifeManagementService } from "./lifeManagement";

const FINANCE_API_BASE = 'http://localhost:8000/api/finance';
const DEFAULT_USER_ID = 'default_user';

export interface DailyTransaction {
  name: string;
  amount: number;
  date: string;
  type: 'income' | 'expense';
}

export class FinanceService {
  
  /**
   * Sync all finance data to backend
   */
  static async syncFinanceData(dailyTransactions: DailyTransaction[] = []): Promise<void> {
    try {
      const lifeData = LifeManagementService.getData();
      
      // Calculate monthly expenses
      const subscriptions = lifeData.subscriptions.reduce((sum, s) => sum + (s.amount || 0), 0);
      const emis = lifeData.emis.reduce((sum, e) => sum + (e.amount || 0), 0);
      const bills = lifeData.bills.reduce((sum, b) => sum + (b.amount || 0), 0);
      const monthlyExpenses = subscriptions + emis + bills;
      
      // Calculate income and expenses from daily transactions
      const dailyIncome = dailyTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const dailyExpenses = dailyTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Calculate savings
      const savings = lifeData.savingsPlans.reduce((sum, s) => sum + (s.currentAmount || 0), 0);
      
      // Build expense breakdown
      const expense_breakdown: Record<string, number> = {};
      dailyTransactions.forEach(t => {
        if (t.type === 'expense') {
          const category = t.name.toLowerCase();
          expense_breakdown[category] = (expense_breakdown[category] || 0) + t.amount;
        }
      });
      
      // Update budget in backend
      const budgetData = {
        monthly_income: dailyIncome,
        monthly_expenses: monthlyExpenses + dailyExpenses,
        savings: savings,
        taxes_due: 0,
        pension_monthly: 0,
        expense_breakdown
      };
      
      await fetch(`${FINANCE_API_BASE}/budget/${DEFAULT_USER_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(budgetData)
      });
      
      // Add savings goals
      for (const plan of lifeData.savingsPlans) {
        await fetch(`${FINANCE_API_BASE}/savings-goal/${DEFAULT_USER_ID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: plan.name,
            target_amount: plan.targetAmount || 0,
            current_amount: plan.currentAmount || 0,
            deadline: plan.deadline,
            monthly_contribution: plan.monthlyContribution || 0
          })
        });
      }
      
      // Add loans/EMIs
      for (const emi of lifeData.emis) {
        await fetch(`${FINANCE_API_BASE}/loan/${DEFAULT_USER_ID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loan_name: emi.name,
            principal_amount: emi.amount * (emi.remainingMonths || 12),
            interest_rate: 5.0, // Default
            emi_amount: emi.amount,
            remaining_amount: emi.amount * (emi.remainingMonths || 1),
            start_date: new Date().toISOString(),
            end_date: new Date(Date.now() + (emi.remainingMonths || 12) * 30 * 24 * 60 * 60 * 1000).toISOString()
          })
        });
      }
      
      console.log('✅ Finance data synced successfully');
    } catch (error) {
      console.error('❌ Error syncing finance data:', error);
    }
  }
  
  /**
   * Query the finance assistant
   */
  static async queryFinanceAssistant(question: string): Promise<any> {
    try {
      const response = await fetch(`${FINANCE_API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: DEFAULT_USER_ID,
          question: question
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error querying finance assistant:', error);
      throw error;
    }
  }
  
  /**
   * Get financial snapshot
   */
  static async getFinancialSnapshot(): Promise<any> {
    try {
      const response = await fetch(`${FINANCE_API_BASE}/snapshot/${DEFAULT_USER_ID}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error getting financial snapshot:', error);
      throw error;
    }
  }
}
