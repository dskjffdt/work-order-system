import { describe, expect, it, beforeEach } from 'vitest'
import { hasPermission, useMeStore } from './useMeStore'

// 权限白名单模型：权限点是否在 me.permissions 里决定，未知/未加载一律无权限。
// 与后端 has_permission 同语义（后端为路由级必达，前端为路由守卫/按钮级第一道）。

describe('hasPermission 权限判断', () => {
    beforeEach(() => {
        useMeStore.setState({ me: null })
    })

    it('me 未加载时一律无权限（白名单模型，防权限未知时闪现越权）', () => {
        expect(hasPermission('ticket:view')).toBe(false)
        expect(hasPermission('dashboard:view')).toBe(false)
    })

    it('按角色权限点判断：admin 有看板权限', () => {
        useMeStore.setState({
            me: { user_id: 1, username: 'admin', role: 'admin', permissions: ['ticket:view', 'dashboard:view'] },
        })
        expect(hasPermission('dashboard:view')).toBe(true)
    })

    it('user 无看板/导出权限（权限矩阵隔离）', () => {
        useMeStore.setState({
            me: { user_id: 2, username: 'u', role: 'user', permissions: ['ticket:view', 'ticket:create'] },
        })
        expect(hasPermission('dashboard:view')).toBe(false)
        expect(hasPermission('ticket:export')).toBe(false)
        expect(hasPermission('ticket:create')).toBe(true)
    })

    it('未知权限点返回 false', () => {
        useMeStore.setState({
            me: { user_id: 1, username: 'admin', role: 'admin', permissions: ['ticket:view'] },
        })
        expect(hasPermission('not-exists:perm')).toBe(false)
    })
})