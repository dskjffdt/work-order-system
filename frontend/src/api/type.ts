// 角色：admin 管理员 / agent 客服 / user 普通用户（多角色切换演示用）
export type Role = 'admin' | 'agent' | 'user'

// 动态表单字段类型：渲染器据此选择控件
export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'date'

// 字段 schema（来自 /ticket-config，前端零硬编码渲染）
export type FieldSchema = {
    key: string
    label: string
    type: FieldType
    required?: boolean
    options?: string[]
    default?: string
    // 显隐条件：{"<字段key>": [可选值...]} 语义 = 该字段值命中列表时本字段可见
    visible?: Record<string, string[]>
    sensitive?: boolean
    readonly?: boolean
}

// 一个状态流转动作（label 展示 / to 目标状态 / roles 可执行角色 / form 附加表单）
export type ActionSpec = {
    label: string
    to: string
    roles: string[]
    form?: FieldSchema[]
}

export type StateSpec = {
    label: string
    actions: Record<string, ActionSpec>
}

// 工单类型配置：状态机 + 表单 + 流程时间线，全部由后端配置驱动
export type TicketTypeConfig = {
    name: string
    fields: FieldSchema[]
    states: Record<string, StateSpec>
    flow: string[]
    initial: string
}

// /me 返回：当前用户 + 角色 + 权限点
export type MeInfo = {
    user_id: number
    username: string | null
    role: Role
    permissions: string[]
}

// /ticket-config 返回：角色 / 权限矩阵 / 工单类型配置（前端渲染全靠它）
export type TicketConfig = {
    roles: string[]
    permissions: Record<string, string[]>
    ticket_types: Record<string, TicketTypeConfig>
}

// 工单（列表项 / 详情，fields 为 JSONB 表单值，详情时已脱敏）
export type Ticket = {
    id: number
    ticket_no: string
    ticket_type: string
    status: string
    title: string
    priority: string | null
    creator_id: number
    assignee_id: number | null
    fields: Record<string, unknown>
    created_at: string
    updated_at: string
}

export type TicketListResponse = {
    total: number
    items: Ticket[]
}

export type TicketEvent = {
    id: number
    ticket_id: number
    action: string
    from_status: string | null
    to_status: string
    operator_id: number
    extra: Record<string, unknown>
    created_at: string
}

// 工单详情：ticket + 事件流 + 当前状态可用操作（已按角色过滤）+ 流程 + 状态文案
export type TicketDetail = {
    ticket: Ticket
    events: TicketEvent[]
    available_actions: Record<string, ActionSpec>
    flow: string[]
    status_labels: Record<string, string>
}

export type Notification = {
    id: number
    ticket_id: number | null
    kind: string
    title: string
    content: string
    read: boolean
    created_at: string
}

export type DashboardStats = {
    total: number
    status: { key: string; value: number }[]
    type: { key: string; value: number }[]
    priority: { key: string; value: number }[]
    trend: { day: string; value: number }[]
}
