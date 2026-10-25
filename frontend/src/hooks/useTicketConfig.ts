import { useQuery } from '@tanstack/react-query'
import { getTicketConfig } from '../api/ticket'

// 工单配置（角色/权限矩阵/工单类型）全局共享：前端渲染状态机/动态表单/权限全靠它。
// 配置基本不变，staleTime 拉长，避免每页重复请求
export function useTicketConfig() {
    return useQuery({
        queryKey: ['ticket-config'],
        queryFn: getTicketConfig,
        staleTime: 5 * 60_000,
    })
}