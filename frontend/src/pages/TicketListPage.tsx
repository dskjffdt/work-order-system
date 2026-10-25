import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { listTickets } from '../api/ticket'
import { useTicketConfig } from '../hooks/useTicketConfig'
import { useMeStore } from '../stores/useMeStore'
import VirtualList from '../components/ticket/VirtualList'
import StatusBadge, { PriorityBadge } from '../components/ticket/StatusBadge'
import TicketCreateModal from '../components/ticket/TicketCreateModal'
import type { Ticket } from '../api/type'

const PAGE_SIZE = 200
const ROW_HEIGHT = 64

// 列表表格列布局（表头与虚拟行共用，保证对齐）
const GRID_COLS = 'grid-cols-[130px_1fr_100px_80px_90px_160px]'

// 时间展示：ISO 截取到分钟（2026-10-25T14:30）
function fmtTime(iso: string): string {
    return iso ? iso.slice(0, 16).replace('T', ' ') : ''
}

// 工单列表页：筛选状态同步 URL query + React Query 按筛选 key 缓存 + 自研虚拟滚动。
// 三处配合：URL 是可分享/可回退的筛选事实源，React Query 避免来回切换筛选重复请求，
// 虚拟滚动让万级数据只渲染可视行（DOM 节点数大幅下降、首屏渲染更快）。
export default function TicketListPage() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const config = useTicketConfig()
    const me = useMeStore((s) => s.me)

    // URL query 是筛选事实源：select 直接回写，keyword 走本地 state + 确认提交
    const [searchParams, setSearchParams] = useSearchParams()
    const status = searchParams.get('status') ?? ''
    const ticketType = searchParams.get('ticket_type') ?? ''
    const priority = searchParams.get('priority') ?? ''
    const keyword = searchParams.get('keyword') ?? ''
    const [keywordInput, setKeywordInput] = useState(keyword)
    const [showCreate, setShowCreate] = useState(false)

    const updateFilter = (key: string, value: string) => {
        const next = new URLSearchParams(searchParams)
        if (value) next.set(key, value)
        else next.delete(key)
        setSearchParams(next)
    }

    const submitKeyword = () => updateFilter('keyword', keywordInput.trim())

    const resetFilters = () => {
        setKeywordInput('')
        setSearchParams({})
    }

    // 筛选即缓存键：同一筛选下的分页共用同一个 infinite query，切换筛选自动命中/失效缓存
    const query = useInfiniteQuery({
        queryKey: ['tickets', { status, ticket_type: ticketType, priority, keyword }],
        queryFn: ({ pageParam }) =>
            listTickets({
                status,
                ticket_type: ticketType,
                priority,
                keyword,
                limit: PAGE_SIZE,
                offset: pageParam as number,
            }),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            const loaded = allPages.reduce((n, p) => n + p.items.length, 0)
            return loaded < lastPage.total ? loaded : undefined
        },
    })

    const items = query.data?.pages.flatMap((p) => p.items) ?? []
    const total = query.data?.pages[query.data.pages.length - 1]?.total ?? 0

    // 状态/类型文案按工单自身类型取配置（不同类型同名状态文案不同）
    const stateLabel = (ticket: Ticket) =>
        config.data?.ticket_types[ticket.ticket_type]?.states[ticket.status]?.label ?? ticket.status
    const typeName = (t: Ticket) => config.data?.ticket_types[t.ticket_type]?.name ?? t.ticket_type

    const canCreate = me?.permissions.includes('ticket:create') ?? false

    const renderRow = (ticket: Ticket) => (
        <div
            key={ticket.id}
            onClick={() => navigate(`/tickets/${ticket.id}`)}
            style={{ height: ROW_HEIGHT }}
            className={`grid ${GRID_COLS} cursor-pointer items-center border-b border-gray-100 px-4 transition-colors hover:bg-blue-50/40`}
        >
            <span className="truncate font-mono text-xs text-gray-400">{ticket.ticket_no}</span>
            <span className="truncate pr-4 text-sm font-medium text-gray-800">{ticket.title}</span>
            <span className="truncate text-xs text-gray-500">{typeName(ticket)}</span>
            <span>
                <PriorityBadge priority={ticket.priority} />
            </span>
            <span>
                <StatusBadge status={ticket.status} label={stateLabel(ticket)} />
            </span>
            <span className="truncate text-xs text-gray-400">{fmtTime(ticket.updated_at)}</span>
        </div>
    )

    return (
        <div className="flex h-full flex-col">
            {/* 筛选栏（筛选状态同步 URL，可刷新/分享/回退） */}
            <header className="border-b border-gray-200 bg-white px-6 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">工单列表</h1>
                        <p className="mt-0.5 text-xs text-gray-400">
                            共 {total} 条工单 · 列表虚拟滚动 + 筛选 URL 同步 + 缓存
                        </p>
                    </div>
                    {canCreate && (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                        >
                            新建工单
                        </button>
                    )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <FilterSelect
                        value={status}
                        onChange={(v) => updateFilter('status', v)}
                        placeholder="全部状态"
                        options={statusOptions(config.data?.ticket_types ?? {})}
                    />
                    <FilterSelect
                        value={ticketType}
                        onChange={(v) => updateFilter('ticket_type', v)}
                        placeholder="全部类型"
                        options={Object.entries(config.data?.ticket_types ?? {}).map(([k, v]) => ({
                            value: k,
                            label: v.name,
                        }))}
                    />
                    <FilterSelect
                        value={priority}
                        onChange={(v) => updateFilter('priority', v)}
                        placeholder="全部优先级"
                        options={['P0', 'P1', 'P2', 'P3'].map((p) => ({ value: p, label: p }))}
                    />
                    <input
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitKeyword()}
                        placeholder="关键字搜索标题"
                        className="w-52 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm focus:border-blue-500 focus:bg-white focus:outline-none"
                    />
                    <button
                        onClick={submitKeyword}
                        className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-white transition-colors hover:bg-gray-700"
                    >
                        搜索
                    </button>
                    {(status || ticketType || priority || keyword) && (
                        <button
                            onClick={resetFilters}
                            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                        >
                            重置
                        </button>
                    )}
                </div>
            </header>

            {/* 表头 */}
            <div
                className={`grid ${GRID_COLS} border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500`}
            >
                <span>工单号</span>
                <span>标题</span>
                <span>类型</span>
                <span>优先级</span>
                <span>状态</span>
                <span>更新时间</span>
            </div>

            {/* 虚拟滚动列表：占满剩余高度 */}
            <div className="min-h-0 flex-1">
                {query.isLoading ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400">加载中…</div>
                ) : query.isError ? (
                    <div className="flex h-full items-center justify-center text-sm text-red-400">
                        加载失败，请稍后重试
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400">
                        暂无匹配工单
                    </div>
                ) : (
                    <VirtualList
                        items={items}
                        rowHeight={ROW_HEIGHT}
                        className="h-full"
                        renderRow={renderRow}
                        onEndReached={() => {
                            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage()
                        }}
                    />
                )}
            </div>

            {/* 分页加载中提示 */}
            {query.isFetchingNextPage && (
                <div className="border-t border-gray-100 py-2 text-center text-xs text-gray-400">加载更多…</div>
            )}

            {showCreate && (
                <TicketCreateModal
                    onClose={() => setShowCreate(false)}
                    onCreated={(ticket) => {
                        setShowCreate(false)
                        // 新工单进入列表：失效当前筛选缓存并跳详情
                        queryClient.invalidateQueries({ queryKey: ['tickets'] })
                        navigate(`/tickets/${ticket.id}`)
                    }}
                />
            )}
        </div>
    )
}

// 筛选下拉：占位项 value 为空 = 不筛选
function FilterSelect({
    value,
    onChange,
    placeholder,
    options,
}: {
    value: string
    onChange: (v: string) => void
    placeholder: string
    options: { value: string; label: string }[]
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:bg-white focus:outline-none"
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    )
}

// 状态筛选选项：汇总所有类型的状态（同 key 不同 label 的取第一个，筛选用状态 key 即可）
function statusOptions(types: Record<string, { name: string; states: Record<string, { label: string }> }>) {
    const seen = new Map<string, string>()
    for (const cfg of Object.values(types)) {
        for (const [key, s] of Object.entries(cfg.states)) {
            if (!seen.has(key)) seen.set(key, s.label)
        }
    }
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }))
}