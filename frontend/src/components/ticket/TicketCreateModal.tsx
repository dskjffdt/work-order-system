import { useState } from 'react'
import { createTicket } from '../../api/ticket'
import { buildNetworkError } from '../../utils/apiError'
import { AuthError } from '../../api/auth'
import { validateFields } from '../../utils/ticketForm'
import { useTicketConfig } from '../../hooks/useTicketConfig'
import { DynamicForm } from './FieldRenderer'
import type { FieldSchema, Ticket } from '../../api/type'

// 用字段 schema 的 default 构造初始值（无 default 的字段不预置，显隐字段由联动决定）
function buildInitialValues(fields: FieldSchema[]): Record<string, unknown> {
    const v: Record<string, unknown> = {}
    for (const f of fields) {
        if (f.default !== undefined) v[f.key] = f.default
    }
    return v
}

// 新建工单弹窗：类型选择 + Schema 驱动动态表单（显隐/联动校验），提交走真实后端
export default function TicketCreateModal({
    onClose,
    onCreated,
}: {
    onClose: () => void
    onCreated: (ticket: Ticket) => void
}) {
    const config = useTicketConfig()
    const types = config.data?.ticket_types ?? {}

    const [ticketType, setTicketType] = useState('incident')
    const [values, setValues] = useState<Record<string, unknown>>(() =>
        buildInitialValues(types['incident']?.fields ?? []),
    )
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [submitting, setSubmitting] = useState(false)
    const [serverError, setServerError] = useState('')

    if (config.isLoading) {
        return (
            <ModalShell onClose={onClose}>
                <div className="py-8 text-center text-sm text-gray-400">正在加载表单配置…</div>
            </ModalShell>
        )
    }

    const fields = types[ticketType]?.fields ?? []

    const switchType = (next: string) => {
        setTicketType(next)
        setValues(buildInitialValues(types[next]?.fields ?? []))
        setErrors({})
        setServerError('')
    }

    const handleSubmit = async () => {
        const list = validateFields(fields, values)
        if (list.length > 0) {
            const map: Record<string, string> = {}
            // 按 label 匹配到字段 key（提示文案含 label，前端用 key 定位）
            for (const f of fields) {
                const hit = list.find((e) => e.includes(`「${f.label}」`))
                if (hit) map[f.key] = hit
            }
            setErrors(map)
            return
        }
        setErrors({})
        setServerError('')
        setSubmitting(true)
        try {
            const ticket = await createTicket({ ticket_type: ticketType, fields: values })
            onCreated(ticket)
        } catch (e) {
            if (e instanceof AuthError) return
            setServerError(buildNetworkError(e).message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <ModalShell onClose={onClose} width="w-[560px]">
            <h2 className="text-base font-semibold text-gray-900">新建工单</h2>

            {/* 工单类型选择：配置驱动，新增类型自动出现 */}
            <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">工单类型</label>
                <div className="flex gap-2">
                    {Object.entries(types).map(([key, cfg]) => (
                        <button
                            key={key}
                            onClick={() => switchType(key)}
                            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                                ticketType === key
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {cfg.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* 动态表单：字段显隐/必填由 schema 驱动 */}
            <div className="mt-5">
                <DynamicForm
                    fields={fields}
                    values={values}
                    onChange={setValues}
                    errors={errors}
                />
            </div>

            {serverError && (
                <div className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-500">{serverError}</div>
            )}

            <div className="mt-6 flex justify-end gap-2">
                <button
                    onClick={onClose}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                    取消
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                >
                    {submitting ? '提交中…' : '创建工单'}
                </button>
            </div>
        </ModalShell>
    )
}

// 弹窗外壳：遮罩 + 卡片入场动画（复用登录弹窗的动效类）
export function ModalShell({
    children,
    onClose,
    width = 'w-[480px]',
}: {
    children: React.ReactNode
    onClose: () => void
    width?: string
}) {
    return (
        <div
            className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={`modal-in max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl shadow-black/20 ${width}`}
            >
                {children}
            </div>
        </div>
    )
}