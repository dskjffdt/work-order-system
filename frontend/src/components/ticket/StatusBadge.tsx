// 状态徽标：色系映射（open 待处理 / processing 进行中 / resolved 待确认 / closed 终态）

const STATUS_STYLE: Record<string, string> = {
    open: 'bg-amber-50 text-amber-600 ring-amber-200',
    processing: 'bg-blue-50 text-blue-600 ring-blue-200',
    resolved: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
    closed: 'bg-gray-100 text-gray-500 ring-gray-200',
}

export default function StatusBadge({ status, label }: { status: string; label?: string }) {
    const style = STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-500 ring-gray-200'
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
        >
            {label ?? status}
        </span>
    )
}

// 优先级徽标：P0/P1 高危红，P2 中橙，P3 低灰
const PRIORITY_STYLE: Record<string, string> = {
    P0: 'bg-red-50 text-red-600 ring-red-200',
    P1: 'bg-orange-50 text-orange-600 ring-orange-200',
    P2: 'bg-amber-50 text-amber-600 ring-amber-200',
    P3: 'bg-gray-100 text-gray-500 ring-gray-200',
}

export function PriorityBadge({ priority }: { priority: string | null }) {
    if (!priority) return null
    const style = PRIORITY_STYLE[priority] ?? 'bg-gray-100 text-gray-500 ring-gray-200'
    return (
        <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${style}`}
        >
            {priority}
        </span>
    )
}