import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { getMe, switchRole } from '../../api/ticket'
import { logout } from '../../api/auth'
import { buildNetworkError } from '../../utils/apiError'
import { AuthError } from '../../api/auth'
import { useAuthStore } from '../../stores/useAuthStore'
import { useMeStore } from '../../stores/useMeStore'
import { useToast } from '../../stores/useToast'
import {
    initNotificationCenter,
    stopNotificationStream,
    useNotificationStore,
} from '../../stores/useNotificationStore'
import type { Role } from '../../api/type'
import LoginModal from '../LoginModal/LoginModal'

// 主导航项：label + 路由 + 所需权限点（无权限的入口直接不渲染）
const NAV_ITEMS = [
    { to: '/tickets', label: '工单', permission: 'ticket:view' },
    { to: '/dashboard', label: '看板', permission: 'dashboard:view' },
    { to: '/notifications', label: '消息中心', permission: 'notification:view' },
] as const

const ROLE_OPTIONS: { value: Role; label: string }[] = [
    { value: 'admin', label: '管理员' },
    { value: 'agent', label: '客服' },
    { value: 'user', label: '普通用户' },
]

// 左侧导航图标（stroke 继承 currentColor）
function NavIcon({ kind }: { kind: string }) {
    const common = {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        className: 'h-5 w-5',
    }
    if (kind === 'ticket')
        return (
            <svg {...common}>
                <path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9Z" />
                <path d="M14 3v6h6" />
                <path d="M8 13h8M8 17h5" />
            </svg>
        )
    if (kind === 'dashboard')
        return (
            <svg {...common}>
                <rect x="3" y="3" width="7" height="9" rx="1" />
                <rect x="14" y="3" width="7" height="5" rx="1" />
                <rect x="14" y="12" width="7" height="9" rx="1" />
                <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
        )
    if (kind === 'notification')
        return (
            <svg {...common}>
                <path d="M6 13V8a6 6 0 0 1 12 0v5l2 4H4Z" />
                <path d="M10 21h4" />
            </svg>
        )
    return null
}

// 工单系统顶层布局：左侧主导航 + 角色切换 + 权限上下文装载。
export default function AppShell() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const authed = useAuthStore((s) => s.authed)
    const username = useAuthStore((s) => s.username)
    const login = useAuthStore((s) => s.login)
    const me = useMeStore((s) => s.me)
    const setMe = useMeStore((s) => s.setMe)
    const clearMe = useMeStore((s) => s.clearMe)
    const addToast = useToast((s) => s.addMessage)
    const unread = useNotificationStore((s) => s.unread)

    // 登录态 → 权限上下文：登录成功后拉 /me，登出/过期则清空 me
    useEffect(() => {
        if (!authed) {
            clearMe()
            return
        }
        getMe()
            .then(setMe)
            .catch(() => {
                // 401 已由 request 统一广播（弹登录框），此处静默
            })
    }, [authed, setMe, clearMe])

    // 登录态 → 消息中心：登录后拉初始列表 + 建立 SSE 流，登出/过期断开并清空
    useEffect(() => {
        if (!authed) {
            stopNotificationStream()
            useNotificationStore.getState().reset()
            return
        }
        initNotificationCenter()
        return () => stopNotificationStream()
    }, [authed])

    // 多角色切换：调 /me/role 后仅刷新 role/permissions，不动登录态
    const handleSwitchRole = async (role: Role) => {
        try {
            const res = await switchRole(role)
            setMe({ ...me!, role: res.role, permissions: res.permissions })
            // 角色变了：可用动作/字段脱敏/数据可见范围都变，失效工单相关缓存重新拉取
            queryClient.invalidateQueries({ queryKey: ['tickets'] })
            queryClient.invalidateQueries({ queryKey: ['ticket'] })
        } catch (e) {
            if (e instanceof AuthError) return
            addToast(buildNetworkError(e).message)
        }
    }

    const handleLogout = async () => {
        try {
            await logout()
        } catch (e) {
            if (e instanceof AuthError) return
            addToast(buildNetworkError(e).message)
            return
        }
        clearMe()
        navigate('/tickets', { replace: true })
    }

    if (!authed) return <LoginModal onSuccess={login} />

    // 权限白名单：me 未加载完成前不渲染入口，避免权限未知时闪现越权入口
    const permissions = me?.permissions ?? []

    return (
        <div className="flex h-[100dvh] overflow-hidden bg-gray-50">
            {/* 左侧主导航 */}
            <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
                {/* 品牌区 */}
                <div className="flex items-center gap-2.5 px-5 py-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white">
                        <NavIcon kind="ticket" />
                    </div>
                    <div className="leading-tight">
                        <div className="text-sm font-semibold text-gray-900">工单管理</div>
                        <div className="text-xs text-gray-400">Ticket Ops</div>
                    </div>
                </div>

                {/* 导航项：按当前角色权限过滤渲染 */}
                <nav className="flex-1 space-y-1 px-3">
                    {NAV_ITEMS.filter((item) => permissions.includes(item.permission)).map(
                        (item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                                        isActive
                                            ? 'bg-blue-50 text-blue-600'
                                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                    }`
                                }
                            >
                                <NavIcon kind={item.to.slice(1)} />
                                <span className="flex-1">{item.label}</span>
                                {item.to === '/notifications' && unread > 0 && (
                                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-medium text-white">
                                        {unread > 99 ? '99+' : unread}
                                    </span>
                                )}
                            </NavLink>
                        ),
                    )}
                    </nav>

                {/* 底部：角色切换 + 用户 + 登出 */}
                <div className="border-t border-gray-100 p-3">
                    {me && (
                        <div className="mb-2">
                            <div className="mb-1 px-1 text-xs text-gray-400">当前角色（切换演示）</div>
                            <select
                                value={me.role}
                                onChange={(e) => handleSwitchRole(e.target.value as Role)}
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                            >
                                {ROLE_OPTIONS.map((r) => (
                                    <option key={r.value} value={r.value}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="flex items-center gap-2 px-1 py-1.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-sm font-medium text-white">
                            {username?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-600">{username}</span>
                        <button
                            onClick={handleLogout}
                            title="退出登录"
                            className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                                <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
                                <path d="m16 17 5-5-5-5" />
                                <path d="M21 12H9" />
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>

            {/* 内容区：子路由渲染 */}
            <main className="flex-1 overflow-hidden">
                <Outlet />
            </main>
        </div>
    )
}