import { useState } from 'react'
import { transitionTicket } from '../../api/ticket'
import { buildNetworkError } from '../../utils/apiError'
import { AuthError } from '../../api/auth'
import { validateFields } from '../../utils/ticketForm'
import { DynamicForm } from './FieldRenderer'
import { ModalShell } from './TicketCreateModal'
import type { ActionSpec } from '../../api/type'

// 状态流转弹窗：渲染 action 的附加表单（如 close 的 note / resolve 的 solution），提交走真实后端。
// 动作合法性与角色权限由后端状态层二次校验（前端这一步只是收集表单值）
export default function TransitionModal({
    ticketId,
    actionKey,
    spec,
    onClose,
    onDone,
}: {
    ticketId: number
    actionKey: string
    spec: ActionSpec
    onClose: () => void
    onDone: () => void
}) {
    const fields = spec.form ?? []
    const [values, setValues] = useState<Record<string, unknown>>({})
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [serverError, setServerError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async () => {
        const list = validateFields(fields, values)
        if (list.length > 0) {
            const map: Record<string, string> = {}
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
            await transitionTicket(ticketId, actionKey, values)
            onDone()
        } catch (e) {
            if (e instanceof AuthError) return
            setServerError(buildNetworkError(e).message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <ModalShell onClose={onClose}>
            <h2 className="text-base font-semibold text-gray-900">{spec.label}</h2>
            {fields.length > 0 && (
                <div className="mt-5">
                    <DynamicForm
                        fields={fields}
                        values={values}
                        onChange={setValues}
                        errors={errors}
                    />
                </div>
            )}
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
                    {submitting ? '提交中…' : '确认'}
                </button>
            </div>
        </ModalShell>
    )
}