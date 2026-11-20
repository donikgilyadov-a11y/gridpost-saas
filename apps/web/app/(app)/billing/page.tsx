'use client'

import { useEffect, useState } from 'react'
import { billing, type PlanInfo, type Subscription } from '@/lib/api'

const PRICES: Record<string, string> = {
  free: '€0',
  starter: '€12/мес',
  pro: '€29/мес',
  business: '€79/мес',
  agency: '€199/мес',
  enterprise: 'по запросу'
}

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [plans, setPlans] = useState<PlanInfo[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      setSubscription(await billing.subscription())
      setPlans(await billing.plans())
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  useEffect(() => { void load() }, [])

  async function checkout(plan: string) {
    setBusy(true)
    try {
      const result = await billing.checkout(plan)
      window.location.href = result.url
    } catch (err) {
      setMessage((err as Error).message)
      setBusy(false)
    }
  }

  async function portal() {
    try {
      const result = await billing.portal()
      window.location.href = result.url
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  return (
    <>
      <h1>Billing</h1>
      {subscription && (
        <div className="card">
          <h2>Текущий тариф: <span className="pill">{subscription.plan}</span></h2>
          <div className="row small dim">
            <span>Статус: <strong>{subscription.status}</strong></span>
            <span>Аккаунтов: {subscription.limits.accounts}</span>
            <span>Публикаций: {subscription.limits.postsPerMonth}/мес</span>
            {subscription.cancelAtPeriodEnd && <span className="pill warn">отмена в конце периода</span>}
          </div>
          <button className="ghost small" style={{ marginTop: 12 }} onClick={() => void portal()}>Управление подпиской →</button>
        </div>
      )}
      {message && <div className="card small">{message}</div>}

      <h2>Тарифы</h2>
      <div className="stats">
        {plans.map((plan) => (
          <div className="card" key={plan.id}>
            <div className="row"><strong>{plan.id}</strong><span className="grow" /> <span className="dim small">{PRICES[plan.id]}</span></div>
            <p className="small dim">{plan.accounts === Number.MAX_SAFE_INTEGER ? 'без лимита' : plan.accounts} аккаунтов · {plan.postsPerMonth === Number.MAX_SAFE_INTEGER ? 'без лимита' : plan.postsPerMonth} публикаций/мес</p>
            {subscription?.plan === plan.id ? (
              <span className="pill ok">текущий</span>
            ) : plan.id === 'free' || plan.id === 'enterprise' ? (
              <span className="dim small">по запросу</span>
            ) : (
              <button className="primary small" disabled={busy} onClick={() => void checkout(plan.id)}>Выбрать</button>
            )}
          </div>
        ))}
      </div>
      <p className="dim small">Цены — гипотеза для тестирования рынка. Оплата через Stripe Checkout; лимиты проверяются сервером.</p>
    </>
  )
}
