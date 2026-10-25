import { describe, expect, it } from 'vitest'
import { computeVisibleFields, validateFields } from './ticketForm'
import type { FieldSchema } from '../api/type'

// 联动校验核心场景：visible 字段仅在命中条件时显示，且「可见的必填字段」才参与校验。
// 与后端 ticketing.validate_fields 同语义，前端渲染与流转附加表单共用。

const fields: FieldSchema[] = [
    { key: 'title', label: '标题', type: 'text', required: true },
    { key: 'severity', label: '严重度', type: 'select', options: ['high', 'low'], default: 'low' },
    { key: 'impact', label: '影响范围', type: 'textarea', required: true, visible: { severity: ['high'] } },
]

describe('computeVisibleFields 字段显隐', () => {
    it('visible 条件命中时显示该字段', () => {
        const visible = computeVisibleFields(fields, { severity: 'high' })
        expect(visible.map((f) => f.key)).toContain('impact')
    })

    it('visible 条件未命中时隐藏该字段', () => {
        const visible = computeVisibleFields(fields, { severity: 'low' })
        expect(visible.map((f) => f.key)).not.toContain('impact')
    })

    it('无 visible 条件的字段恒显示', () => {
        const visible = computeVisibleFields(fields, {})
        expect(visible.map((f) => f.key)).toEqual(['title', 'severity'])
    })
})

describe('validateFields 联动校验', () => {
    it('必填字段缺失时给出中文提示', () => {
        const errors = validateFields(fields, { severity: 'low' })
        expect(errors.some((e) => e.includes('标题'))).toBe(true)
    })

    it('不可见的必填字段不参与校验（severity=low 时 impact 缺失不报错）', () => {
        const errors = validateFields(fields, { title: 'x', severity: 'low' })
        expect(errors).toEqual([])
    })

    it('可见的必填字段缺失时报错（severity=high 时 impact 缺失）', () => {
        const errors = validateFields(fields, { title: 'x', severity: 'high' })
        expect(errors.some((e) => e.includes('影响范围'))).toBe(true)
    })

    it('空白字符串视为未填', () => {
        const errors = validateFields(fields, { title: '   ', severity: 'low' })
        expect(errors.some((e) => e.includes('标题'))).toBe(true)
    })
})