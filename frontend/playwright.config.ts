import { defineConfig, devices } from '@playwright/test'

// E2E：连真实后端（FastAPI + PostgreSQL）跑工单主流程。
// webServer 先后拉起后端（uvicorn）与前端（vite dev，proxy 到 8000），测试结束自动关闭。
// 本地已有服务时（reuseExistingServer）复用，避免重复启动。
export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: {
        baseURL: 'http://127.0.0.1:5173',
        trace: 'on-first-retry',
    },
    webServer: [
        {
            command: 'uv run uvicorn main:app --host 127.0.0.1 --port 8000',
            url: 'http://127.0.0.1:8000/docs',
            cwd: '../server',
            timeout: 60_000,
            reuseExistingServer: !process.env.CI,
            // 本地不注入默认连接串，交给 server/.env 的 DATABASE_URL（dotenv 加载）；
            // CI 由 workflow 通过环境变量传入（与 postgres service 一致）
            env: {
                ...(process.env.DATABASE_URL
                    ? { DATABASE_URL: process.env.DATABASE_URL }
                    : {}),
            },
        },
        {
            command: 'npm run dev -- --host 127.0.0.1 --port 5173',
            url: 'http://127.0.0.1:5173',
            timeout: 60_000,
            reuseExistingServer: !process.env.CI,
        },
    ],
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})