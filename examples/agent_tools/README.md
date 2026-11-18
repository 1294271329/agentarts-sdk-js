# 使用华为云 AgentArts 代码解释器并集成到 Agent（TypeScript）

对应 Python `examples/agent_tools/integrate_tools.py`。

演示基于 AgentArts 代码解释器（Code Interpreter）开发一个「Python 代码执行」工具，并把工具集成到
LangGraph Agent 中，整体流程：

1. 创建一个沙箱（sandbox）会话（`withCodeSession` 管理会话的启动与停止）；
2. 配置基于 LangGraph 的 Agent，由模型生成代码；
3. 在沙箱中执行代码（`client.invoke('execute_code', ...)`）；
4. Agent 获取执行结果并返回给用户。

## 前置条件

- 拥有华为云 AgentArts Tools 的访问权限，并已创建 Code Interpreter 资源
- 拥有模型访问权限
- 已安装 `agentarts-sdk`、`@langchain/langgraph`、`@langchain/core`、`@langchain/openai`

```bash
pnpm install
pnpm add @langchain/openai     # 本仓库未预装 @langchain/openai
```

## 环境变量

| 变量名 | 说明 | 必需 |
| --- | --- | --- |
| `MODEL_API_KEY` | 模型 API Key（Python 示例变量名） | 是（或用 `OPENAI_API_KEY`） |
| `BASE_URL` | 模型 API Base URL（Python 示例变量名） | 否（或用 `OPENAI_BASE_URL`） |
| `OPENAI_MODEL_NAME` | 模型名，默认 `DeepSeek-V3` | 否 |
| `HUAWEICLOUD_SDK_CODE_INTERPRETER_API_KEY` | Code Interpreter API Key | 是 |
| `HUAWEICLOUD_SDK_REGION` | Code Interpreter 所在区域，默认占位符 `your_region` | 是 |
| `AGENTARTS_CODE_INTERPRETER_NAME` | Code Interpreter 名称，默认占位符 `your_code_interpreter_name` | 是 |

> 代码中的 `your_region` / `your_code_interpreter_name` 沿用 Python 示例的占位符，
> 请通过上面两个环境变量传入真实值。

## 运行

```bash
pnpm start                 # tsx integrate-tools.ts
# 或：pnpm exec tsx integrate-tools.ts
```

```bash
curl -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"message": "告诉我1到100之间最大的质数"}'
```

不传 `message` 时使用默认问题「告诉我1到100之间最大的质数」。

## 代码要点

```ts
// 工具定义：@langchain/core 的 tool() + JSON Schema（无需 zod）
export const executePythonTool = tool(
  async (input) => {
    const response = await withCodeSession(
      region,
      interpreterName,
      (client) =>
        client.invoke(
          'execute_code',
          { code, language: 'python', clear_context: false },
          apiKey,
        ),
      'API_KEY',
      apiKey,
    );
    return JSON.stringify(response['result']);
  },
  { name: 'execute_python_tool', description: 'Execute Python Code in the sandbox', schema: { /* ... */ } },
);

// Agent 图：agent -> (有 tool_calls?) -> tools -> agent -> ... -> END
const workflow = new StateGraph(AgentState)
  .addNode('agent', callModel)
  .addNode('tools', new ToolNode(tools))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', shouldContinue, { tools: 'tools', [END]: END })
  .addEdge('tools', 'agent');
```

## 类型检查

```bash
pnpm exec tsc -p tsconfig.json
```

## 与 Python 示例的差异

| 项 | Python | TypeScript |
| --- | --- | --- |
| 工具定义 | `@tool` 装饰器 + 类型注解 | `tool(fn, { name, description, schema })`，schema 用 JSON Schema |
| 沙箱会话 | `with code_session(...) as client:` | `withCodeSession(region, name, callback, authType, apiKey)`（回调式，等价于 `with`） |
| 调用方式 | `code_client.invoke(operate_type=..., api_key=..., arguments=...)` | `client.invoke('execute_code', args, apiKey)`（位置参数，camelCase 命名） |
| `print` | `print(f"\n Generated Code: {code}")` | `console.log(...)`（示例输出，非 SDK 内部日志） |
| 入口 query | 硬编码问题，忽略 payload | `payload.message` / `payload.query` 可覆盖，默认仍是同一个问题 |
| 模型凭据 | 只读 `MODEL_API_KEY` / `BASE_URL` | 优先这两个变量，回退 `OPENAI_API_KEY` / `OPENAI_BASE_URL` |
| Code Interpreter 区域/名称 | 硬编码 `"your_region"` / `"your_code_interpreter_name"` | 同默认值，可用 `HUAWEICLOUD_SDK_REGION` / `AGENTARTS_CODE_INTERPRETER_NAME` 覆盖 |
