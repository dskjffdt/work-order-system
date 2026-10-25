import { AuthError, handleUnauthorized } from './auth'
import { buildApiError } from '../utils/apiError'
import { API_BASE } from '../config'
import type {
    DashboardStats,
    MeInfo,
    Notification,
    Role,
    Ticket,
    TicketConfig,
    TicketDetail,
    TicketListResponse,
} from './type'

// 401 统一出口：清凭证广播后抛 AuthError（调用方凭 AuthError 静默跳过错误提示）
function unauthorized(): never {
    handleUnauthorized()
    throw new AuthError('登录已过期')
}

// 把 Response 按统一规则处理：401 广播，非 2xx 抛 ApiError，否则解析 JSON
async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}/api${url}`, init)
    if (res.status === 401) unauthorized()
    if (!res.ok) throw await buildApiError(res)
    return (await res.json()) as T
}

// 当前用户 + 角色 + 权限点（登录后首次拉取，权限上下文据此渲染）
export function getMe(): Promise<MeInfo> {
    return request<MeInfo>('/me')
}

// 角色切换（演示多角色）：返回切换后的角色与权限点，前端刷新权限上下文
export function switchRole(role: Role): Promise<{ role: Role; permissions: string[] }> {
    return request('/me/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
    })
}

// 配置下发：角色 / 权限矩阵 / 工单类型（状态机 + 表单 schema + 流程）
// 前端渲染全部由它驱动，新增工单类型前端零改动
export function getTicketConfig(): Promise<TicketConfig> {
    return request<TicketConfig>('/ticket-config')
}

// 工单列表：筛选参数拼进 URL，配合 React Query 按 key 缓存（筛选即缓存键）
export function listTickets(params: {
    status?: string
    ticket_type?: string
    priority?: string
    keyword?: string
    limit?: number
    offset?: number
}): Promise<TicketListResponse> {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v))
    })
    const query = qs.toString()
    return request<TicketListResponse>(`/tickets${query ? `?${query}` : ''}`)
}

export function createTicket(payload: {
    ticket_type: string
    fields: Record<string, unknown>
}): Promise<Ticket> {
    return request<Ticket>('/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
}

// 工单详情：ticket(已脱敏字段) + 事件流 + 当前可执行动作(已按角色过滤) + 流程时间线
export function getTicket(id: number | string): Promise<TicketDetail> {
    return request<TicketDetail>(`/tickets/${id}`)
}

// 状态流转：后端状态层会二次校验动作合法性 + 附加表单必填（前端按钮只是第一道）
export function transitionTicket(
    id: number | string,
    action: string,
    extra: Record<string, unknown> = {},
): Promise<{ status: string }> {
    return request(`/tickets/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, extra }),
    })
}

// ---- 消息中心 ----

export function listNotifications(): Promise<{ items: Notification[]; unread: number }> {
    return request('/notifications')
}

export function unreadCount(): Promise<{ unread: number }> {
    return request('/notifications/unread')
}

export function markRead(ids: number[]): Promise<{ unread: number }> {
    return request('/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids),
    })
}

// ---- 看板 ----

export function dashboardStats(): Promise<DashboardStats> {
    return request('/dashboard')
}