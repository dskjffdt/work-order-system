import { create } from 'zustand'
import { listNotifications, markRead } from '../api/ticket'
import { handleUnauthorized } from '../api/auth'
import { buildApiError } from '../utils/apiError'
import { API_BASE } from '../config'
import type { Notification } from '../api/type'

// 消息中心 store + SSE 客户端：断线重连（按 after_id 补发）+ 前端按 id 去重 + 未读数聚合。
// SSE 用 fetch + ReadableStream 手写（沿用 chat.ts 风格），心跳行 `: ping` 忽略；数据行 `data: {json}`。

type NotificationState = {
    items: Notification[]
    unread: number
    // 初始拉取（列表倒序 + 未读数）
    setItems: (items: Notification[], unread: number) => void
    // 推送一条通知：按 id 去重（幂等），未读则 unread+1
    pushItem: (n: Notification) => void
    // 全部标为已读：调后端 + 本地更新未读数
    markAllAsRead: () => Promise<void>
    reset: () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
    items: [],
    unread: 0,
    setItems: (items, unread) => set({ items, unread }),
    pushItem: (n) => {
        const { items } = get()
        if (items.some((i) => i.id === n.id)) return // 幂等去重（断线补发可能重）
        set({
            items: [n, ...items],
            unread: get().unread + (n.read ? 0 : 1),
        })
    },
    markAllAsRead: async () => {
        const unreadIds = get()
            .items.filter((i) => !i.read)
            .map((i) => i.id)
        if (unreadIds.length === 0) return
        await markRead(unreadIds)
        set((s) => ({ unread: 0, items: s.items.map((i) => ({ ...i, read: true })) }))
    },
    reset: () => set({ items: [], unread: 0 }),
}))

// ---- SSE 连接生命周期 ----

let streamAbort: AbortController | null = null
// 已收到的最大通知 id：断线重连时作为 after_id 向服务端索要之后的通知（幂等）
let lastId = 0

function backoffMs(attempt: number): number {
    return Math.min(500 * 2 ** attempt, 8000)
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// 逐行读流：`data: {json}` 处理通知，`: ping` 心跳忽略。跨 chunk 的粘包按 \n 拆分。
async function readStream(res: Response): Promise<void> {
    if (!res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!
        for (const raw of lines) handleLine(raw.trim())
    }
    if (buffer.trim()) handleLine(buffer.trim())
}

function handleLine(line: string): void {
    if (!line || line.startsWith(':')) return // 心跳 / 空行
    if (!line.startsWith('data:')) return
    try {
        const n = JSON.parse(line.slice(5).trim()) as Notification
        lastId = Math.max(lastId, n.id)
        useNotificationStore.getState().pushItem(n)
    } catch {
        // 非法 JSON 行静默跳过
    }
}

// 启动流：循环连接，连接断开/网络错误时指数退避重连（after_id 保证补发不丢、去重不重）
export function startNotificationStream(): void {
    stopNotificationStream()
    lastId = 0
    streamAbort = new AbortController()
    void runStream()
}

export function stopNotificationStream(): void {
    streamAbort?.abort()
    streamAbort = null
}

async function runStream(): Promise<void> {
    let attempt = 0
    while (streamAbort && !streamAbort.signal.aborted) {
        try {
            const res = await fetch(`${API_BASE}/api/notifications/stream?after_id=${lastId}`, {
                signal: streamAbort.signal,
            })
            if (res.status === 401) {
                handleUnauthorized()
                break
            }
            if (!res.ok) throw await buildApiError(res)
            attempt = 0
            await readStream(res)
        } catch (e) {
            if (streamAbort?.signal.aborted) break
            // 连接中断：退避后重连（DomException AbortError 由上方 abort 判断兜底）
            if (e instanceof DOMException && e.name === 'AbortError') break
            await delay(backoffMs(attempt++))
        }
    }
}

// 拉初始列表 + 启动流：登录后调用一次（AppShell 顶层），登出时 stop + reset
export async function initNotificationCenter(): Promise<void> {
    useNotificationStore.getState().reset()
    lastId = 0
    try {
        const { items, unread } = await listNotifications()
        // 用初始列表里最大的 id 作为 SSE 补发起点，避免重复推送已读旧通知
        if (items.length > 0) lastId = items[0].id
        useNotificationStore.getState().setItems(items, unread)
    } catch {
        // 初始拉取失败不阻断：SSE 仍可推送实时通知
    }
    startNotificationStream()
}