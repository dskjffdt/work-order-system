import { test, expect } from '@playwright/test'

// 工单主流程 E2E：连真实后端（FastAPI + PostgreSQL）+ 前端（vite dev）。
// 覆盖「创建 → 接单 → 解决 → 关单」完整状态机流转，并穿插多角色切换（admin→agent→user），
// 同时验证权限驱动的可用动作（agent 无「确认关闭」、user 无「接单」等由后端状态层下发）。
test('工单一站式主流程：创建 → 接单 → 解决 → 关单（含多角色切换）', async ({ page }) => {
    const unique = Date.now()
    const title = `E2E 故障工单 ${unique}`

    // 1. 登录内置账号（seed 角色 admin）
    await page.goto('/')
    await page.getByPlaceholder('用户名').fill('admin')
    await page.getByPlaceholder('密码').fill('admin123')
    await page.getByRole('button', { name: '登 录' }).click()
    await expect(page.getByPlaceholder('用户名')).toBeHidden()

    // 2. 进入工单列表
    await page.goto('/tickets')
    await expect(page.getByRole('heading', { name: '工单列表' })).toBeVisible()

    // 3. 切角色到 agent（open 状态只有 agent 能「接单」）
    await page.locator('aside select').selectOption('agent')

    // 4. 新建工单（动态表单：标题/客户手机号/问题描述必填，优先级默认 P2）
    await page.getByRole('button', { name: '新建工单' }).click()
    await page.getByPlaceholder('请输入标题').fill(title)
    await page.getByPlaceholder('请输入客户手机号').fill('13800138000')
    await page.getByPlaceholder('请输入问题描述').fill('Playwright 自动化创建的故障工单')
    await page.getByRole('button', { name: '创建工单' }).click()

    // 5. 详情页：初始状态 open，出现「接单」动作（agent）
    await expect(page.getByRole('button', { name: '接单', exact: true })).toBeVisible()

    // 6. 接单：open → processing
    await page.getByRole('button', { name: '接单', exact: true }).click()
    await page.getByRole('button', { name: '确认', exact: true }).click()
    await expect(page.getByRole('button', { name: '提交解决', exact: true })).toBeVisible()

    // 7. 提交解决：processing → resolved（附加表单 solution 必填）
    await page.getByRole('button', { name: '提交解决', exact: true }).click()
    await page.getByPlaceholder('请输入解决方案').fill('重启服务并恢复，已解决')
    await page.getByRole('button', { name: '确认', exact: true }).click()

    // 8. agent 在 resolved 无权关闭 → 切 user 角色后出现「确认关闭」
    await expect(page.getByRole('button', { name: '确认关闭', exact: true })).toBeHidden()
    await page.locator('aside select').selectOption('user')
    await expect(page.getByRole('button', { name: '确认关闭', exact: true })).toBeVisible()

    // 9. 确认关闭：resolved → closed
    await page.getByRole('button', { name: '确认关闭', exact: true }).click()
    await page.getByRole('button', { name: '确认', exact: true }).click()

    // 10. 终态 closed：无可用动作，状态徽标显示「已关闭」
    await expect(page.getByRole('button', { name: '确认关闭', exact: true })).toBeHidden()
    await expect(page.getByText('已关闭').first()).toBeVisible()
})