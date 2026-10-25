import { create } from 'zustand'
import type { MeInfo } from '../api/type'

// 当前用户权限上下文：role + permissions 由 /me 下发，供路由守卫与按钮级判断。
// 登录态变化时由 AppShell 重新拉取或清空（这里保持纯 store，不主动关联 auth）。
type MeState = {
    me: MeInfo | null
    setMe: (me: MeInfo) => void
    clearMe: () => void
}

export const useMeStore = create<MeState>((set) => ({
    me: null,
    setMe: (me) => set({ me }),
    clearMe: () => set({ me: null }),
}))

// 非响应式权限判断（路由守卫 / 事件回调等不订阅 store 的场景用）
// 权限白名单模型：me 未加载或未含该权限点，一律视为无权限
export function hasPermission(permission: string): boolean {
    const me = useMeStore.getState().me
    return me?.permissions.includes(permission) ?? false
}