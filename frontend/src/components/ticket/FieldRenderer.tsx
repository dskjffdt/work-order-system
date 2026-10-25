import type { FieldSchema } from '../../api/type'
import { computeVisibleFields } from '../../utils/ticketForm'

// 统一输入控件样式：与登录框风格一致，聚焦描边 + 柔和光圈
const controlClass =
    'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5 text-sm text-gray-900 transition-all placeholder:text-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400'

// 单个字段控件：Schema 驱动，type 决定渲染哪种控件（新增字段类型只需在此加一个分支）
export function FieldRenderer({
    field,
    value,
    onChange,
    disabled,
}: {
    field: FieldSchema
    value: unknown
    onChange: (value: unknown) => void
    disabled?: boolean
}) {
    const { type, key, options } = field
    const val = value == null ? '' : String(value)

    if (type === 'textarea') {
        return (
            <textarea
                value={val}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                rows={4}
                placeholder={`请输入${field.label}`}
                className={`${controlClass} resize-y`}
            />
        )
    }

    if (type === 'number') {
        return (
            <input
                type="number"
                value={val}
                onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={disabled}
                placeholder={`请输入${field.label}`}
                className={controlClass}
            />
        )
    }

    if (type === 'select') {
        return (
            <select
                value={val}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={controlClass}
            >
                <option value="">请选择{field.label}</option>
                {options?.map((o) => (
                    <option key={o} value={o}>
                        {o}
                    </option>
                ))}
            </select>
        )
    }

    if (type === 'radio') {
        return (
            <div className="flex flex-wrap gap-3 pt-1">
                {options?.map((o) => (
                    <label
                        key={o}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                            val === o
                                ? 'border-blue-500 bg-blue-50 text-blue-600'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
                    >
                        <input
                            type="radio"
                            name={key}
                            value={o}
                            checked={val === o}
                            onChange={() => onChange(o)}
                            disabled={disabled}
                            className="sr-only"
                        />
                        {o}
                    </label>
                ))}
            </div>
        )
    }

    if (type === 'date') {
        return (
            <input
                type="date"
                value={val}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={controlClass}
            />
        )
    }

    // text 与未知类型兜底
    return (
        <input
            type="text"
            value={val}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={`请输入${field.label}`}
            className={controlClass}
        />
    )
}

// 完整动态表单：先按 visible 条件过滤可见字段（显隐联动），再逐个渲染控件。
// 创建工单 / 流转附加表单 / 详情只读回填 三处共用（disabled 控制只读）。
export function DynamicForm({
    fields,
    values,
    onChange,
    disabled,
    errors,
}: {
    fields: FieldSchema[]
    values: Record<string, unknown>
    onChange: (values: Record<string, unknown>) => void
    disabled?: boolean
    // 校验错误 map：key -> 中文提示（为空不显示）
    errors?: Record<string, string>
}) {
    const visible = computeVisibleFields(fields, values)

    const setField = (key: string, value: unknown) => onChange({ ...values, [key]: value })

    return (
        <div className="space-y-4">
            {visible.map((field) => (
                <div key={field.key}>
                    <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700">
                        {field.label}
                        {field.required && <span className="text-red-500">*</span>}
                    </label>
                    <FieldRenderer
                        field={field}
                        value={values[field.key]}
                        onChange={(v) => setField(field.key, v)}
                        disabled={disabled}
                    />
                    {errors?.[field.key] && (
                        <p className="mt-1 text-xs text-red-500">{errors[field.key]}</p>
                    )}
                </div>
            ))}
        </div>
    )
}