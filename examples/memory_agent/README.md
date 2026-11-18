# Memory Service Example

展示如何使用 AgentArts Memory Service 存储对话历史（对应 Python
`examples/memory_usage/agent_with_memory.py`）。

## 快速开始

```bash
# 安装依赖
pnpm install

# 设置环境变量
export HUAWEICLOUD_SDK_MEMORY_API_KEY="your-api-key"
export HUAWEICLOUD_SDK_REGION="cn-southwest-2"
export AGENTARTS_MEMORY_SPACE_ID="your-space-id"

# 运行 Agent
pnpm start                 # tsx agent.ts
```

Windows PowerShell：

```powershell
$env:HUAWEICLOUD_SDK_MEMORY_API_KEY = "your-api-key"
$env:HUAWEICLOUD_SDK_REGION = "cn-southwest-2"
$env:AGENTARTS_MEMORY_SPACE_ID = "your-space-id"
pnpm start
```

## 测试

```bash
# 发送消息（会自动创建 session）
curl -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}'

# 使用相同 session 继续对话
curl -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"message": "What did I say before?", "session_id": "xxx"}'
```

## 请求参数

| 参数 | 说明 | 必需 |
| --- | --- | --- |
| `message` | 用户消息 | 是 |
| `session_id` | 会话 ID（不传则自动创建） | 否 |
| `space_id` | Memory Space ID（或设置环境变量） | 是 |

## 环境变量

| 变量名 | 说明 | 必需 |
| --- | --- | --- |
| `HUAWEICLOUD_SDK_MEMORY_API_KEY` | Memory Service API Key | 是 |
| `HUAWEICLOUD_SDK_REGION` | 华为云区域 | 否（默认 `cn-southwest-2`） |
| `AGENTARTS_MEMORY_SPACE_ID` | Memory Space ID | 是（或在请求中传递） |

## 代码要点

```ts
const memoryClient = new MemoryClient({
  apiKey: process.env.HUAWEICLOUD_SDK_MEMORY_API_KEY ?? null,
  regionName: process.env.HUAWEICLOUD_SDK_REGION ?? null,
});

// 创建会话：Python create_memory_session(space_id=...)
const session = await memoryClient.createMemorySession(spaceId);

// 写入消息：Python add_messages(space_id=..., session_id=..., messages=[...])
await memoryClient.addMessages(spaceId, sessionId, [new TextMessage({ role: 'user', content: message })]);

// 读取最近 10 条：Python get_last_k_messages(space_id=..., session_id=..., k=10)
const history = await memoryClient.getLastKMessages(sessionId, 10, spaceId);
```

## 类型检查

```bash
pnpm exec tsc -p tsconfig.json
```

## 与 Python 示例的差异

| 项 | Python | TypeScript |
| --- | --- | --- |
| 客户端构造 | `MemoryClient(api_key=...)` | `new MemoryClient({ apiKey, regionName })`（也支持位置参数） |
| 消息类型导入 | `from agentarts.sdk.memory import TextMessage` | `import { TextMessage } from 'agentarts-sdk/sdk/memory'`（包根只导出 `MemoryClient`/`AsyncMemoryClient`） |
| 创建会话 | `create_memory_session(space_id=space_id)` | `createMemorySession(spaceId)` |
| 写入消息 | `add_messages(space_id=..., session_id=..., messages=[...])` | `addMessages(spaceId, sessionId, messages)` |
| 读取历史 | `get_last_k_messages(space_id=..., session_id=..., k=10)` | `getLastKMessages(sessionId, 10, spaceId)`（参数顺序不同，camelCase） |
| 历史序列化 | `[{"role": ..., "content": [m.get("text") ...]}]` | `toHistoryEntries()`，输出相同的 wire 结构 |
| `session_id` 来源 | 只读 payload | 额外回退 `context?.sessionId`（请求头 `x-hw-agentarts-session-id`） |
| 同步/异步 | 同步方法 | 全部返回 `Promise`（`await`） |
