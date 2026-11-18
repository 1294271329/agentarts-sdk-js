# LangChain Integration Example

展示如何使用 LangChain 创建带工具的 Agent（对应 Python
`examples/integration/langchain/langchain_agent.py`）。

## 快速开始

```bash
# 安装依赖
pnpm install
pnpm add @langchain/openai     # 本仓库未预装 @langchain/openai

# 设置环境变量
export OPENAI_API_KEY="your-api-key"
export OPENAI_MODEL_NAME="gpt-4o-mini"
export OPENAI_BASE_URL="https://api.openai.com/v1"   # 可选

# 运行 Agent
pnpm start                 # tsx agent.ts
```

## 测试

```bash
# 简单计算
curl -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the square root of 144?"}'

# 获取时间
curl -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"message": "What time is it?"}'

# 文本分析
curl -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"message": "Count the words in: Hello World, this is a test."}'

# 查看中间步骤
curl -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"message": "What is 2 ** 10?", "include_intermediate_steps": true}'
```

响应示例（`include_intermediate_steps` 为 true 时）：

```json
{
  "response": "2 ** 10 is 1024.",
  "intermediate_steps": [
    { "tool": "calculate", "input": { "expression": "2 ** 10" }, "output": "1024" }
  ]
}
```

## 请求参数

| 参数 | 说明 | 必需 |
| --- | --- | --- |
| `message` | 用户消息 | 是 |
| `include_intermediate_steps` | 是否包含工具调用步骤 | 否（默认 false） |

## 可用工具

Agent 配备了三个工具：

1. **calculate** - 计算数学表达式（支持 `+ - * / % **` 与 `sqrt, sin, cos, tan, log, log10, exp, pow, abs, round, floor, ceil`、常量 `pi` / `e`）
2. **get_current_time** - 获取当前日期和时间（`YYYY-MM-DD HH:MM:SS`）
3. **word_count** - 统计文本中的单词数

## 环境变量

| 变量名 | 说明 | 必需 |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI API Key | 是 |
| `OPENAI_MODEL_NAME` | 模型名称 | 否（默认 `gpt-4o-mini`） |
| `OPENAI_BASE_URL` | API Base URL | 否 |

## 实现说明：没有 AgentExecutor

Python 示例使用 `create_tool_calling_agent` + `AgentExecutor`。`@langchain/core` 1.x（Node.js 版）
不提供 `AgentExecutor`（该类属于更高层的 `langchain` 包，Node.js 生态没有等价物），因此本示例
用相同的工具调用循环实现等价行为：

```
model.invoke(messages)
  -> 有 tool_calls? -> 执行工具 -> 追加 ToolMessage -> 再次 invoke
  -> 没有 tool_calls -> 返回最终文本
```

`MAX_TOOL_ROUNDS`（默认 8）对应 Python `AgentExecutor` 的迭代上限。

## 类型检查

```bash
pnpm exec tsc -p tsconfig.json
```

## 与 Python 示例的差异

| 项 | Python | TypeScript |
| --- | --- | --- |
| Agent 执行器 | `AgentExecutor` + `create_tool_calling_agent` | 手写工具调用循环（`@langchain/core` 无 `AgentExecutor`） |
| 提示词 | `ChatPromptTemplate` + `{agent_scratchpad}` | `SystemMessage` + `HumanMessage`，工具结果用 `ToolMessage` 追加 |
| 工具定义 | `@tool` 装饰器 | `tool(fn, { name, description, schema })`（JSON Schema） |
| 表达式求值 | `eval(expression, {"__builtins__": {}}, allowed_names)` | 白名单标识符 + `new Function(...)`（仅示例用途，Python 语义：`^` 为异或、`**` 为幂） |
| 中间步骤 | `list[tuple[AgentAction, str]]` | `IntermediateStep[]`：`{ tool, input, output }` |
| 导入 | `langchain.agents` | 无对应包；`@langchain/core/messages` + `@langchain/core/tools` |
| 模型初始化 | 模块级同步构造 | 首次调用时动态 `import('@langchain/openai')` 并缓存 |
