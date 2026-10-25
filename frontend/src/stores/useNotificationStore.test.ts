import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { useNotificationStore } from './useNotificationStore'
import type { Notification } from '../api/type'

function notif(id: number, read = false): Notification {
    return {
        id,
        ticket_id: 1,
        kind: 'transition',
        title: `通知 ${id}`,
        content: 'open → processing',
        read,
        created_at: '2026-10-25T00:00:00',
    }
}

// SSE 客户端核心：按 id 幂等去重（断线补发可能重）+ 未读数聚合 + 全部已读
describe('消息中心 store：去重与未读聚合', () => {
    beforeEach(() => {
        useNotificationStore.setState({ items: [], unread: 0 })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('pushItem 按 id 幂等去重：重复推送只进一次、未读只加一次', () => {
        useNotificationStore.getState().pushItem(notif(1))
        useNotificationStore.getState().pushItem(notif(1))
        expect(useNotificationStore.getState().items).toHaveLength(1)
        expect(useNotificationStore.getState().unread).toBe(1)
    })

    it('未读聚合：未读 +1，已读不加', () => {
        useNotificationStore.getState().pushItem(notif(1, false))
        useNotificationStore.getState().pushItem(notif(2, true))
        expect(useNotificationStore.getState().unread).toBe(1)
    })

    it('新通知插入列表头部', () => {
        useNotificationStore.getState().pushItem(notif(1))
        useNotificationStore.getState().pushItem(notif(2))
        expect(useNotificationStore.getState().items.map((i) => i.id)).toEqual([2, 1])
    })

    it('全部标为已读：清未读并标记所有项', async () => {
        // markRead 走 fetch → 后端返回 unread=0
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(JSON.stringify({ unread: 0 }), { status: 200 })),
        )
        useNotificationStore.getState().pushItem(notif(1, false))
        useNotificationStore.getState().pushItem(notif(2, false))
        await useNotificationStore.getState().markAllAsRead()
        expect(useNotificationStore.getState().unread).toBe(0)
        expect(useNotificationStore.getState().items.every((i) => i.read)).toBe(true)
    })
})