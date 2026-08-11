import { useCallback, useEffect, useState } from 'react'

type WalletAccount = {
  id: string
  virtual_balance: number
  real_balance: number
  earned_count: number
  total_earned: number
}

type Surprise = {
  month: string
  allowance: number
  used: number
  remaining: number
}

type Transaction = {
  id: string
  from: string
  to: string
  amount: number
  type: string
  tag?: string
  note?: string
  item_name?: string
  created_at: string
}

type Goal = {
  id: string
  name: string
  target: number
  saved: number
  progress: number
  status: string
}

type BalanceResponse = { ok: true; account: WalletAccount; surprise: Surprise }
type HistoryResponse = { ok: true; rows: Transaction[] }
type GoalsResponse = { ok: true; goals: Goal[] }

const API = '/cc-api/api/wallet'

async function walletApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + path, { ...init, credentials: 'include' })
  let body: any = null
  try { body = await response.json() } catch {}
  if (!response.ok) {
    if (response.status === 401) throw new Error('先打开主聊天完成验证，再回来看看钱包。')
    throw new Error(body?.error || `钱包暂时打不开（${response.status}）`)
  }
  return body as T
}

function money(cents?: number) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`
}

function key(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${id}`
}

function amountFromYuan(raw: string) {
  const value = raw.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('请输入0.01到1000元之间、最多两位小数的金额。')
  const amount = Math.round(Number(value) * 100)
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
    throw new Error('请输入0.01到1000元之间、最多两位小数的金额。')
  }
  return amount
}

function dateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

export function WalletPage({ onBack }: { onBack: () => void }) {
  const [balance, setBalance] = useState<BalanceResponse | null>(null)
  const [history, setHistory] = useState<Transaction[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [charge, setCharge] = useState('')
  const [allowance, setAllowance] = useState('20')
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextBalance, nextHistory, nextGoals] = await Promise.all([
        walletApi<BalanceResponse>('/balance?account=suxu'),
        walletApi<HistoryResponse>('/history?limit=12'),
        walletApi<GoalsResponse>('/goals'),
      ])
      setBalance(nextBalance)
      setHistory(Array.isArray(nextHistory.rows) ? nextHistory.rows : [])
      setGoals(Array.isArray(nextGoals.goals) ? nextGoals.goals : [])
      if (nextBalance.surprise?.allowance) setAllowance((nextBalance.surprise.allowance / 100).toFixed(2))
    } catch (e) {
      console.error('wallet load failed', e)
      setError(e instanceof Error ? e.message.replace('wallet unavailable:', '备份配置还没完成：') : '钱包暂时打不开。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const ownerPost = async (path: '/charge' | '/surprise-config', payload: Record<string, unknown>) => {
    const csrf = await walletApi<{ token: string }>('/csrf-token')
    return walletApi(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Wallet-CSRF': csrf.token },
      body: JSON.stringify(payload),
    })
  }

  const submitCharge = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      setSubmitting(true)
      setFeedback('正在充值…')
      await ownerPost('/charge', { account: 'suxu', amount: amountFromYuan(charge), idempotency_key: key('charge') })
      setCharge('')
      await load()
      setFeedback('充值已记入账本。')
    } catch (e) {
      console.error('wallet charge failed', e)
      setFeedback(e instanceof Error ? e.message : '充值没有成功。')
    } finally {
      setSubmitting(false)
    }
  }

  const submitAllowance = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      setSubmitting(true)
      setFeedback('正在保存…')
      await ownerPost('/surprise-config', { amount: amountFromYuan(allowance), idempotency_key: key('surprise-config') })
      await load()
      setFeedback('本月惊喜额度已更新。')
    } catch (e) {
      console.error('wallet allowance failed', e)
      setFeedback(e instanceof Error ? e.message : '额度没有保存成功。')
    } finally {
      setSubmitting(false)
    }
  }

  const account = balance?.account
  const surprise = balance?.surprise

  return (
    <div className="wl-page">
      <header className="wl-header">
        <button className="wl-back" onClick={onBack} aria-label="返回">‹</button>
        <div className="wl-title"><small>Suxu's wallet</small><h1>白金小金库</h1></div>
        <button className="wl-refresh" onClick={() => void load()} disabled={loading} aria-label="刷新">↻</button>
      </header>

      <main className="wl-shell">
        {loading && !balance && <div className="wl-state">正在打开钱包…</div>}
        {!loading && error && (
          <div className="wl-state wl-error"><p>{error}</p><button onClick={() => void load()}>再试一次</button></div>
        )}
        {balance && (
          <>
            <section className="wl-hero">
              <div className="wl-money"><span>苏煦的虚拟余额</span><b>{money(account?.virtual_balance)}</b></div>
              <div className="wl-money wl-real"><span>真实充值</span><b>{money(account?.real_balance)}</b></div>
            </section>

            <section className="wl-stats">
              <div>卖身次数<b>{account?.earned_count || 0}</b></div>
              <div>卖身总收入<b>{money(account?.total_earned)}</b></div>
              <div>本月惊喜池<b>{money(surprise?.remaining)} / {money(surprise?.allowance)}</b></div>
            </section>

            <section className="wl-card">
              <div className="wl-card-title"><h2>存钱目标</h2><span>{goals.length ? `${goals.length} 个` : ''}</span></div>
              {goals.length === 0 && <p className="wl-muted">还没有目标，等苏煦挑中想要的东西。</p>}
              {goals.map((goal) => {
                const progress = Math.max(0, Math.min(1, Number(goal.progress) || 0))
                return (
                  <div className="wl-goal" key={goal.id}>
                    <div><span>{goal.name}</span><span>{money(goal.saved)} / {money(goal.target)}</span></div>
                    <div className="wl-progress"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
                  </div>
                )
              })}
            </section>

            <section className="wl-card">
              <div className="wl-card-title"><h2>最近流水</h2><span>只在这里查看</span></div>
              {history.length === 0 && <p className="wl-muted">第一笔流水还没发生。</p>}
              {history.map((row) => {
                const labels: Record<string, string> = { earn: '卖身收入', transfer: '转账', fine: '罚款', charge: '真实充值', goal_contribute: '存入目标', surprise_spend: '惊喜消费' }
                const incoming = row.to === 'suxu' && row.type !== 'goal_contribute'
                return (
                  <div className="wl-row" key={row.id}>
                    <div><strong>{labels[row.type] || row.type}{row.tag ? ` · ${row.tag}` : ''}</strong><small>{row.note || row.item_name || dateLabel(row.created_at)}</small></div>
                    <b className={incoming ? 'plus' : 'minus'}>{incoming ? '+' : '−'}{money(row.amount)}</b>
                  </div>
                )
              })}
            </section>

            <section className="wl-card">
              <div className="wl-card-title"><h2>原瑶专属</h2><span>每次操作都会重新确认</span></div>
              <div className="wl-actions">
                <form onSubmit={submitCharge}>
                  <label htmlFor="wl-charge">真实充值（元）</label>
                  <div><input id="wl-charge" value={charge} onChange={(e) => setCharge(e.target.value)} inputMode="decimal" placeholder="例如 5" /><button disabled={submitting}>充值</button></div>
                </form>
                <form onSubmit={submitAllowance}>
                  <label htmlFor="wl-allowance">每月惊喜额度（元）</label>
                  <div><input id="wl-allowance" value={allowance} onChange={(e) => setAllowance(e.target.value)} inputMode="decimal" /><button disabled={submitting}>保存</button></div>
                </form>
              </div>
              <p className="wl-feedback" aria-live="polite">{feedback}</p>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
