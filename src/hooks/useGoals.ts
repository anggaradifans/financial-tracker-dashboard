import { useCallback, useEffect, useState } from 'react'
import { supabaseRest } from '../lib/supabaseRest'
import {
  EmergencyFundBasis,
  FinancialGoal,
  GoalBasisCategory,
  GoalContribution,
  GoalKind,
  GoalProgress,
  GoalPriority,
  GoalRecommendation,
  ManualGoalFields,
  MonthlySavingsPlan,
} from '../types/financial'

async function loadGoalContributions(userId: string) {
  const rows: GoalContribution[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseRest.select<GoalContribution>('goal_contributions', {
      select: '*', eq: { user_id: userId }, order: 'contributed_on.desc,id.asc', limit: pageSize, offset,
    })
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

export interface GoalData {
  goals: FinancialGoal[]
  progress: Record<string, GoalProgress>
  contributions: GoalContribution[]
  monthlyPlans: Record<string, MonthlySavingsPlan>
  recommendations: Record<string, GoalRecommendation>
  recommendationCategories: Record<string, GoalBasisCategory[]>
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  previewEmergencyFund: (basisMonths: number, categoryIds: string[], multiplier: number, currency?: string, periodStart?: string | null) => Promise<EmergencyFundBasis>
  createEmergencyFund: (input: {
    name: string
    currency: string
    targetDate: string | null
    plannedMonthlyAmount: number | null
    basisMonths: number
    categoryIds: string[]
    multiplier: number
    expectedAverage: number
    targetOverride: number | null
    periodStart: string | null
    initialBalance: number
  }) => Promise<boolean>
  acceptRecommendation: (goalId: string, input: {
    basisMonths: number
    categoryIds: string[]
    multiplier: number
    expectedAverage: number
    targetOverride: number | null
    periodStart: string | null
  }) => Promise<void>
  addManualGoal: (input: ManualGoalFields & { kind: Exclude<GoalKind, 'emergency_fund'>; currency: string }) => Promise<void>
  addContribution: (input: { goalId: string; amount: number; contributedOn: string; description: string | null; transactionId?: string }) => Promise<void>
  saveMonthlyPlan: (input: {
    currency: string
    expectedRevision: string | null
    baselineAmount: number
    baselineMonth: string | null
    allocations: { goal_id: string; expected_updated_at: string; amount: number; priority: GoalPriority }[]
  }) => Promise<void>
  deleteContribution: (contributionId: string) => Promise<void>
  updateGoal: (goalId: string, changes: Record<string, unknown>, expectedUpdatedAt?: string) => Promise<void>
  deleteGoal: (goalId: string) => Promise<void>
}

export const useGoals = (userId: string | undefined): GoalData => {
  const [goals, setGoals] = useState<FinancialGoal[]>([])
  const [progress, setProgress] = useState<Record<string, GoalProgress>>({})
  const [contributions, setContributions] = useState<GoalContribution[]>([])
  const [monthlyPlans, setMonthlyPlans] = useState<Record<string, MonthlySavingsPlan>>({})
  const [recommendations, setRecommendations] = useState<Record<string, GoalRecommendation>>({})
  const [recommendationCategories, setRecommendationCategories] = useState<Record<string, GoalBasisCategory[]>>({})
  const [loading, setLoading] = useState(Boolean(userId))
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (showLoading = true) => {
    if (!userId) {
      setGoals([])
      setProgress({})
      setContributions([])
      setMonthlyPlans({})
      setRecommendations({})
      setRecommendationCategories({})
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const [goalRows, progressRows, contributionRows, recommendationRows, plans] = await Promise.all([
        supabaseRest.select<FinancialGoal>('goals', { select: '*', eq: { user_id: userId }, order: 'created_at.desc' }),
        supabaseRest.select<GoalProgress>('goal_progress', { select: '*', eq: { user_id: userId } }),
        loadGoalContributions(userId),
        supabaseRest.select<GoalRecommendation>('goal_recommendations', { select: '*', eq: { user_id: userId }, is: { superseded_at: null } }),
        supabaseRest.select<MonthlySavingsPlan>('monthly_savings_plans', { select: '*', eq: { user_id: userId } }),
      ])
      const currentRecommendations = Object.fromEntries(recommendationRows.map(row => [row.goal_id, row]))
      const recommendationIds = recommendationRows.map(row => row.id)
      const categoryRows = recommendationIds.length
        ? await supabaseRest.select<GoalBasisCategory & { recommendation_id: string }>('goal_recommendation_categories', {
          select: 'recommendation_id,category_id,category_name,included,avg_monthly_amount',
          eq: { user_id: userId },
        }).then(rows => rows.filter(row => recommendationIds.includes(row.recommendation_id)))
        : []
      const categoriesByGoal: Record<string, GoalBasisCategory[]> = {}
      categoryRows.forEach(row => {
        const goalId = recommendationRows.find(rec => rec.id === row.recommendation_id)?.goal_id
        if (goalId) (categoriesByGoal[goalId] ||= []).push(row)
      })
      setGoals(goalRows)
      setProgress(Object.fromEntries(progressRows.map(row => [row.goal_id, row])))
      setContributions(contributionRows)
      setMonthlyPlans(Object.fromEntries(plans.map(plan => [plan.currency, plan])))
      setRecommendations(currentRecommendations)
      setRecommendationCategories(categoriesByGoal)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load goals.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { void refresh() }, [refresh])

  const previewEmergencyFund: GoalData['previewEmergencyFund'] = async (basisMonths, categoryIds, multiplier, currency = 'IDR', periodStart = null) =>
    supabaseRest.rpc<EmergencyFundBasis>('preview_emergency_fund_basis', {
      p_basis_months: basisMonths,
      p_category_ids: categoryIds.length ? categoryIds : null,
      p_multiplier: multiplier,
      p_currency: currency,
      p_period_start: periodStart,
    })

  const createEmergencyFund: GoalData['createEmergencyFund'] = async input => {
    const goalId = await supabaseRest.rpc<string>('create_emergency_fund_goal', {
      p_name: input.name,
      p_currency: input.currency,
      p_target_date: input.targetDate,
      p_planned_monthly_amount: input.plannedMonthlyAmount,
      p_basis_months: input.basisMonths,
      p_category_ids: input.categoryIds.length ? input.categoryIds : null,
      p_multiplier: input.multiplier,
      p_expected_average: input.expectedAverage,
      p_target_override: input.targetOverride,
      p_period_start: input.periodStart,
    })
    let startingBalanceSaved = true
    if (input.initialBalance > 0) {
      try {
        const today = new Date()
        const contributedOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        await supabaseRest.insert('goal_contributions', {
          goal_id: goalId,
          amount: input.initialBalance,
          contributed_on: contributedOn,
          description: 'Starting balance',
        })
      } catch {
        startingBalanceSaved = false
      }
    }
    await refresh()
    return startingBalanceSaved
  }

  const acceptRecommendation: GoalData['acceptRecommendation'] = async (goalId, input) => {
    await supabaseRest.rpc('accept_emergency_fund_recommendation', {
      p_goal_id: goalId,
      p_basis_months: input.basisMonths,
      p_category_ids: input.categoryIds.length ? input.categoryIds : null,
      p_multiplier: input.multiplier,
      p_expected_average: input.expectedAverage,
      p_target_override: input.targetOverride,
      p_period_start: input.periodStart,
    })
    await refresh()
  }

  const addManualGoal: GoalData['addManualGoal'] = async input => {
    await supabaseRest.insert('goals', input)
    await refresh()
  }

  const addContribution: GoalData['addContribution'] = async input => {
    await supabaseRest.insert('goal_contributions', {
      goal_id: input.goalId, amount: input.amount, contributed_on: input.contributedOn,
      description: input.description, transaction_id: input.transactionId || null,
    })
    await refresh(false)
  }

  const saveMonthlyPlan: GoalData['saveMonthlyPlan'] = async input => {
    await supabaseRest.rpc('save_monthly_savings_plan', {
      p_currency: input.currency,
      p_expected_revision: input.expectedRevision,
      p_baseline_amount: input.baselineAmount,
      p_baseline_month: input.baselineMonth,
      p_allocations: input.allocations,
    })
    await refresh(false)
  }

  const deleteContribution: GoalData['deleteContribution'] = async contributionId => {
    await supabaseRest.delete('goal_contributions', { id: contributionId, user_id: userId })
    await refresh(false)
  }

  const updateGoal: GoalData['updateGoal'] = async (goalId, changes, expectedUpdatedAt) => {
    await supabaseRest.update('goals', changes, {
      id: goalId, user_id: userId, ...(expectedUpdatedAt && { updated_at: expectedUpdatedAt }),
    })
    await refresh()
  }

  const deleteGoal: GoalData['deleteGoal'] = async goalId => {
    await supabaseRest.delete('goals', { id: goalId, user_id: userId })
    await refresh()
  }

  return { goals, progress, contributions, monthlyPlans, recommendations, recommendationCategories, loading, error, refresh, previewEmergencyFund, createEmergencyFund, acceptRecommendation, addManualGoal, addContribution, saveMonthlyPlan, deleteContribution, updateGoal, deleteGoal }
}
