# LangGraph Integration Example

展示如何将 LangGraph 与 AgentArts Memory Service 集成，实现持久化的对话状态（对应 Python
`examples/integration/langgraph/langgraph_agent.py`）。

## 快速开始

```bash
# 安装依赖
pnpm install
pnpm add @langchain/openai     # 本仓库未预装 @langchain/openai

# 设置 OpenAI 环境变量
export OPENAI_API_KEY="your-api-key"
export OPENAI_MODEL_NAME="gpt-4o-mini"
export OPENAI_BASE_URL="https://api.openai.com/v1"   # 可选

# 本地模式（内存 Checkpoint，不依赖 Memory Service）
pnpm start

# 使用 AgentArts Memory 持久化
export AGENTARTS_MEMORY_SPACE_ID="your-space-id"
export HUAWEICLOUD_SDK_MEMORY_API_KEY="your-api-key"
pnpm start
```

## 测试

```bash
# 发送消息
curl -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, who are you?"}'

# 使用相同 thread 继续对话
curl -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"message": "What did we talk about?", "thread_id": "xxx"}'
```

## 请求参数

| 参数 | 说明 | 必需 |
| --- | --- | --- |
| `message` | 用户消息 | 是 |
| `thread_id` | 线程 ID（不传则自动创建） | 否 |

## 环境变量

### 基础配置（必需）

| 变量名 | 说明 | 必需 |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI API Key | 是 |
| `OPENAI_MODEL_NAME` | 模型名称 | 否（默认 `gpt-4o-mini`） |
| `OPENAI_BASE_URL` | API Base URL | 否 |

### AgentArts Memory 配置（可选）

| 变量名 | 说明 | 必需 |
| --- | --- | --- |
| `AGENTARTS_MEMORY_SPACE_ID` | Memory Space ID（设置后启用云上 Checkpoint） | 使用 Memory 时必需 |
| `HUAWEICLOUD_SDK_MEMORY_API_KEY` | Memory API Key | 使用 Memory 时必需 |
| `HUAWEICLOUD_SDK_REGION` | 华为云区域 | 否 |

## 两种模式对比

| 特性 | 本地模式（`MemorySaver`） | AgentArts Memory |
| --- | --- | --- |
| 触发条件 | 未设置 `AGENTARTS_MEMORY_SPACE_ID` | 设置了 `AGENTARTS_MEMORY_SPACE_ID` |
| 状态存储 | 进程内存 | 云端持久化 |
| 跨进程共享 | 不支持 | 支持 |
| 适用场景 | 开发测试 | 生产环境 |

## 代码要点

```ts
const model = await createChatModel({ model, apiKey, configuration: { baseURL } });

const callModel = async (state: typeof MessagesAnnotation.State) => {
  const response = await model.invoke(state.messages);
  return { messages: [response] };
};

const workflow = new StateGraph(MessagesAnnotation)
  .addNode('agent', callModel)
  .addEdge(START, 'agent')      // set_entry_point("agent")
  .addEdge('agent', END);       // set_finish_point("agent")

// AgentArts Memory 作为 Checkpoint Saver
const checkpointer = new AgentArtsMemorySessionSaver({
  spaceId: process.env.AGENTARTS_MEMORY_SPACE_ID,
  apiKey: process.env.HUAWEICLOUD_SDK_MEMORY_API_KEY,
});

const agent = workflow.compile({ checkpointer });
const result = await agent.invoke(
  { messages: [new HumanMessage(message)] },
  { configurable: { thread_id: threadId } },
);
```

## 类型检查

```bash
pnpm exec tsc -p tsconfig.json
```

## 与 Python 示例的差异

| 项 | Python | TypeScript |
| --- | --- | --- |
| 状态定义 | `MessagesState` | `MessagesAnnotation`（`@langchain/langgraph`） |
| 图入口/出口 | `set_entry_point` / `set_finish_point` | `addEdge(START, 'agent')` / `addEdge('agent', END)` |
| 调用图 | `agent.invoke(..., config=config)` | `agent.invoke(input, { configurable: { thread_id } })` |
| Checkpointer | 始终使用 `AgentArtsMemorySessionSaver` | 设置了 Space ID 时使用云上 Saver，否则回退 `MemorySaver`（对应 Python README 的「本地模式」） |
| Saver 导入 | `agentarts.sdk.integration.langgraph` | `agentarts-sdk/sdk/integration/langgraph` |
| 构建时机 | 模块级 `agent = create_agent()` | 首次调用时构建（`getGraph()` 缓存），因为 `@langchain/openai` 是动态 `import()` |
| `thread_id` 生成 | `os.urandom(8).hex()` | `crypto.randomUUID()` 去掉 `-` 后取 16 位十六进制 |
| 模型调用 | `model.invoke(...)`（同步） | `await model.invoke(...)`（异步） |
