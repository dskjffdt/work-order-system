import type { FieldSchema } from '../api/type'

// 动态表单纯逻辑（与后端 ticketing.py 同语义，前端渲染与联动校验共用，可单测）：
// - 字段显隐：visible 形如 {"priority": ["P0","P1"]}，字段值命中列表时本字段可见
// - 联动校验：required + 可见时必填

export function computeVisibleFields(
    fields: FieldSchema[],
    values: Record<string, unknown>,
): FieldSchema[] {
    return fields.filter((f) => {
        const cond = f.visible
        if (!cond) return true
        return Object.entries(cond).every(([fieldKey, allowed]) =>
            allowed.includes(String(values[fieldKey] ?? '')),
        )
    })
}

// 校验必填（联动了显隐：不可见字段不参与校验）
// 返回非法字段的中文提示列表，空列表 = 通过
export function validateFields(
    fields: FieldSchema[],
    values: Record<string, unknown>,
): string[] {
    const errors: string[] = []
    for (const f of computeVisibleFields(fields, values)) {
        const val = values[f.key]
        const empty = val == null || (typeof val === 'string' && !val.trim())
        if (f.required && empty) errors.push(`「${f.label}」为必填项`)
    }
    return errors
}