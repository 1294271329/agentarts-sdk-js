# Basic Agent Example

最简单的 Agent 示例，展示如何使用 AgentArts SDK 创建一个基础 Agent（对应 Python
`examples/basic_agent/agent.py`）。

## 快速开始

```bash
# 安装依赖（仓库内使用方式见 ../README.md）
pnpm install

# 运行 Agent（tsx 直接执行 TypeScript）
pnpm start
# 或：pnpm exec tsx agent.ts
```

服务启动在 `http://0.0.0.0:8080`，端点：

- `POST /invocations` - 调用 Agent
- `GET  /ping` - 健康检查

## 测试

```bash
# 健康检查
curl http://127.0.0.1:8080/ping

# 调用 Agent
curl -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, Agent!"}'
```

响应：

```json
{ "response": "You said: Hello, Agent!", "session_id": "default-session" }
```

## 代码结构

```ts
import { AgentArtsRuntimeApp, type RequestContext } from 'agentarts-sdk';

const app = new AgentArtsRuntimeApp();

// 注册入口（对应 Python 的 @app.entrypoint 装饰器）
const handler = app.entrypoint((payload: Record<string, any>, context?: RequestContext) => {
  return { response: `You said: ${payload?.message ?? ''}` };
});

// 对应 Python 的 handler.run(host="0.0.0.0", port=8080)
handler.run('0.0.0.0', 8080);
```

## 类型检查

```bash
pnpm exec tsc -p tsconfig.json      # noEmit，映射到 ../../packages/agentarts-sdk/src
```

## 本地开发与部署

```bash
# 本地开发服务器（读取 .agentarts_config.yaml，entrypoint: agent:app；TS 入口需用 tsx 启动 CLI）
npx tsx ./node_modules/agentarts-sdk/dist/cli.js dev

# 云端部署（需要当前目录有 Dockerfile，见 ../README.md「云端部署」中的说明）
agentarts config set region cn-southwest-2
agentarts deploy
agentarts invoke '{"message": "Hello, AgentArts!"}'
agentarts destroy
```

## 与 Python 示例的差异

| 项 | Python | TypeScript |
| --- | --- | --- |
| 入口注册 | `@app.entrypoint` 装饰器 | `app.entrypoint(fn)`（返回原函数，附带 `run`） |
| 启动 | `handler.run(host=..., port=...)` | `handler.run('0.0.0.0', 8080)`（位置参数） |
| `__main__` 判断 | `if __name__ == "__main__":` | `import.meta.url === pathToFileURL(process.argv[1]).href` |
| `session_id` | 只读 payload，默认 `default-session` | 额外回退到 `context?.sessionId`（请求头 `x-hw-agentarts-session-id`） |
| 响应字段 | `response`、`session_id` | 保持一致（wire 格式不变） |
