const VAPID_PUBLIC = 'BJkBMrUe0oQNNwTGUYdPslnbDRWkRDE47rNWYCbZEjfQtR6dWEIGd3U0_iZ3ydKDrILzoSCxv2nGKm1-DPAnQVk'

function urlBase64ToUint8Array(b: string) {
  const pad = '='.repeat((4 - (b.length % 4)) % 4)
  const raw = atob((b + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const a = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i)
  return a
}

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'error'

export async function enablePush(send: (msg: any) => void): Promise<PushResult> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
    const reg = await navigator.serviceWorker.register('/sea/sw.js', { scope: '/sea/' })
    await navigator.serviceWorker.ready
    let perm = Notification.permission
    if (perm === 'default') perm = await Notification.requestPermission()
    if (perm !== 'granted') return 'denied'
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
      })
    }
    send({ type: 'push_subscribe', subscription: sub.toJSON() })
    return 'ok'
  } catch (e) {
    console.error('[push] enable failed', e)
    return 'error'
  }
}
