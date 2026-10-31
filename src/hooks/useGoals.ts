import { useCallback, useEffect, useState } from 'react'
import { supabaseRest } from '../lib/supabaseRest'
import {
  EmergencyFundBasis,
  FinancialGoal,
  GoalBasisCategory,
  GoalContribution,
  GoalProgress,
  GoalRecommendation,
} from '../types/financial'

export interface GoalData {
  goals: FinancialGoal[]
  progress: Record<string, GoalProgress>
  contributions: GoalContribution[]
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
  addCustomGoal: (input: { name: string; description: string | null; currency: string; targetAmount: number; targetDate: string | null; plannedMonthlyAmount: number | null }) => Promise<void>
  addContribution: (input: { goalId: string; amount: number; contributedOn: string; description: string | null }) => Promise<void>
  deleteContribution: (contributionId: string) => Promise<void>
  updateGoal: (goalId: string, changes: Record<string, unknown>) => Promise<void>
  deleteGoal: (goalId: string) => Promise<void>
}

export const useGoals = (userId: string | undefined): GoalData => {
  const [goals, setGoals] = useState<FinancialGoal[]>([])
  const [progress, setProgress] = useState<Record<string, GoalProgress>>({})
  const [contributions, setContributions] = useState<GoalContribution[]>([])
  const [recommendations, setRecommendations] = useState<Record<string, GoalRecommendation>>({})
  const [recommendationCategories, setRecommendationCategories] = useState<Record<string, GoalBasisCategory[]>>({})
  const [loading, setLoading] = useState(Boolean(userId))
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) {
      setGoals([])
      setProgress({})
      setContributions([])
      setRecommendations({})
      setRecommendationCategories({})
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [goalRows, progressRows, contributionRows, recommendationRows] = await Promise.all([
        supabaseRest.select<FinancialGoal>('goals', { select: '*', eq: { user_id: userId }, order: 'created_at.desc' }),
        supabaseRest.select<GoalProgress>('goal_progress', { select: '*', eq: { user_id: userId } }),
        supabaseRest.select<GoalContribution>('goal_contributions', { select: '*', eq: { user_id: userId }, order: 'contributed_on.desc' }),
        supabaseRest.select<GoalRecommendation>('goal_recommendations', { select: '*', eq: { user_id: userId }, is: { superseded_at: null } }),
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

  const addCustomGoal: GoalData['addCustomGoal'] = async input => {
    await supabaseRest.insert('goals', {
      kind: 'custom', name: input.name, description: input.description, currency: input.currency,
      target_amount: input.targetAmount, target_date: input.targetDate,
      planned_monthly_amount: input.plannedMonthlyAmount,
    })
    await refresh()
  }

  const addContribution: GoalData['addContribution'] = async input => {
    await supabaseRest.insert('goal_contributions', {
      goal_id: input.goalId, amount: input.amount, contributed_on: input.contributedOn,
      description: input.description,
    })
    await refresh()
  }

  const deleteContribution: GoalData['deleteContribution'] = async contributionId => {
    await supabaseRest.delete('goal_contributions', { id: contributionId, user_id: userId })
    await refresh()
  }

  const updateGoal: GoalData['updateGoal'] = async (goalId, changes) => {
    await supabaseRest.update('goals', changes, { id: goalId, user_id: userId })
    await refresh()
  }

  const deleteGoal: GoalData['deleteGoal'] = async goalId => {
    await supabaseRest.delete('goals', { id: goalId, user_id: userId })
    await refresh()
  }

  return { goals, progress, contributions, recommendations, recommendationCategories, loading, error, refresh, previewEmergencyFund, createEmergencyFund, acceptRecommendation, addCustomGoal, addContribution, deleteContribution, updateGoal, deleteGoal }
}
