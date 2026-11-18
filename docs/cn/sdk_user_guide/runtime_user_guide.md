# Runtime SDK 用户指南

## 概述

AgentArts Runtime SDK 提供了将 Agent 封装为 HTTP/WebSocket 服务的能力。通过 `AgentArtsRuntimeApp` 类，您可以快速构建一个符合华为云 AgentArts 控制面标准的 Agent 服务。

### 核心组件

| 组件 | 说明 |
|------|------|
| `AgentArtsRuntimeApp` | HTTP/WebSocket 应用，提供 `/invocations`、`/ping`、`/ws` 端点（基于 `node:http` 与 `ws`） |
| `RequestContext` | 请求上下文数据模型，包含 sessionId、requestId 等信息 |
| `AgentArtsRuntimeContext` | 全局上下文管理器，基于 `AsyncLocalStorage` 实现，支持异步安全访问 |

### 服务端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/invocations` | POST | Agent 调用入口 |
| `/ping` | GET | 健康检查端点 |
| `/ws` | WebSocket | 双向流式通信端点 |

## 环境要求

- Node.js 20 及以上
- 无需额外安装 ASGI 服务器：`AgentArtsRuntimeApp` 直接使用 Node.js 内置 `http` 模块监听端口

### 环境变量配置

Runtime SDK 依赖以下环境变量：

| 环境变量 | 说明 | 必填 |
|----------|------|------|
| `HUAWEICLOUD_SDK_AK` | 华为云 Access Key | 是（部署到华为云时） |
| `HUAWEICLOUD_SDK_SK` | 华为云 Secret Key | 是（部署到华为云时） |
| `HUAWEICLOUD_SDK_REGION` | 华为云区域 | 是（部署到华为云时） |
| `AGENTARTS_RUNTIME_DATA_ENDPOINT` | Runtime 数据面端点 | 否（自定义端点时） |

> **Note:** 更多环境变量配置请参考 [环境变量配置指南](environment_variables.md)。

### 框架版本要求

使用可选框架依赖时，请确保满足以下最低版本要求：

| 框架 | 最低版本 | 安装命令 |
|------|----------|----------|
| @langchain/langgraph | 1.0.0 | `pnpm add @langchain/langgraph` |
| @langchain/core | 1.0.0 | `pnpm add @langchain/core` |

> **注意：** 上述框架包是 `agentarts-sdk` 的可选 peer 依赖（`peerDependenciesMeta.optional = true`），
> 仅在需要 LangGraph/LangChain 集成时安装。LangGraph 1.0+ 引入了新的 Checkpoint 格式，
> 包含必需字段（`step`、`pending_sends`、`parents`）。SDK 的集成模块兼容 LangGraph 1.0 及以上版本。

> **Notice:** Python 版的 Google ADK 集成（`agentarts.sdk.integration.google_adk`）不在 Node.js 版中移植。

## 快速开始

### 基本示例

```ts
import { AgentArtsRuntimeApp, type RequestContext } from 'agentarts-sdk';

const app = new AgentArtsRuntimeApp();

// 注册 Agent 入口函数（对应 Python 的 @app.entrypoint 装饰器）
app.entrypoint(async (payload: Record<string, any>, context?: RequestContext) => {
  const message = payload.message ?? '';
  return { response: `Received: ${message}` };
});

app.run();
```

### 启动服务

```bash
# 使用 agentarts CLI（自动加载项目入口、注入配置中的环境变量）
agentarts dev

# 或直接运行 TypeScript 入口（需 tsx 等运行时）
npx tsx agent.ts

# 或先编译再运行
pnpm build && node dist/agent.js
```

## AgentArtsRuntimeApp 类

### 初始化参数

```ts
const app = new AgentArtsRuntimeApp({
  debug: false,          // 调试模式
  lifespan: undefined,   // 生命周期管理：{ onStartup?, onShutdown? }
  protocol: 'http',      // 协议类型: 'http' 或 'https'
  maxConcurrency: 15,    // 最大并发请求数
});
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `debug` | `boolean` | `false` | 调试模式 |
| `lifespan` | `{ onStartup?, onShutdown? }` | `undefined` | 生命周期管理 |
| `protocol` | `'http'` \| `'https'` | `'http'` | 协议类型 |
| `maxConcurrency` | `number` | `15` | 最大并发请求数，超出返回 503 错误 |

> **说明：** Python 版的 `middleware`（ASGI 中间件）参数在 Node.js 版中不适用，
> 如需请求级处理请在入口函数内部实现。

### run() 方法

启动 HTTP 服务器（返回 `http.Server` 实例）：

```ts
app.run('0.0.0.0', 8080);
```

参数说明：
- `host`（可选）：绑定地址，默认在 Docker 环境中为 `0.0.0.0`，本地为 `127.0.0.1`
- `port`（可选）：绑定端口，默认 `8080`

`app.entrypoint(...)` 会返回原处理函数，该函数上也挂了 `.run()`，因此也可以写成
`const handle = app.entrypoint(fn); handle.run();`。

## 注册方法（对应 Python 装饰器）

TypeScript 没有装饰器语法，SDK 使用**注册方法**替代 Python 的 `@app.xxx` 装饰器：
把处理函数作为参数传入即可完成注册，返回值就是原函数本身。

### app.entrypoint

注册 Agent 主入口函数，处理 `/invocations` 端点的请求。

#### 基本用法

```ts
// 同步处理函数
app.entrypoint((payload: Record<string, any>) => {
  return { result: String(payload.message).toUpperCase() };
});

// 异步处理函数
app.entrypoint(async (payload: Record<string, any>) => {
  const result = await someAsyncOperation(payload);
  return result;
});
```

#### 使用请求上下文

第二个参数命名为 `context` 时，SDK 会注入 `RequestContext`（与 Python 的第二个参数一致）：

```ts
app.entrypoint(async (payload: Record<string, any>, context?: RequestContext) => {
  const sessionId = context?.sessionId ?? null;
  const requestId = context?.requestId ?? null;

  return {
    response: 'OK',
    session_id: sessionId,
    request_id: requestId,
  };
});
```

#### 流式响应

返回生成器（`Generator`）或异步生成器（`AsyncGenerator` / 任意 `AsyncIterable`）以实现流式输出（SSE 格式）：

```ts
// 异步流式响应
app.entrypoint(async function* (payload: Record<string, any>) {
  const message = String(payload.message ?? '');

  for (const char of message) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    yield { chunk: char };
  }
});

// 同步流式响应
app.entrypoint(function* () {
  for (let i = 0; i < 10; i += 1) {
    yield { count: i };
  }
});
```

返回 `Response` / `JsonResponse` / `StreamingResponse` 包装对象时，SDK 会原样返回（不再做 JSON 序列化）。

### app.ping

注册健康检查处理函数，处理 `/ping` 端点的请求。

```ts
import { PingStatus } from 'agentarts-sdk';

app.ping(() => {
  return isHealthy() ? PingStatus.HEALTHY : PingStatus.UNHEALTHY;
});
```

#### PingStatus 状态值

| 状态 | 值 | 说明 |
|------|-----|------|
| `PingStatus.INITING` | `Initing` | 进程已启动、`/ping` 可应答，但 Agent 仍在初始化（如加载模型/数据），暂不接受调用 |
| `PingStatus.HEALTHY` | `Healthy` | 服务健康，无正在执行的任务 |
| `PingStatus.HEALTHY_BUSY` | `HealthyBusy` | 服务健康，有任务正在执行 |
| `PingStatus.UNHEALTHY` | `Unhealthy` | 服务不健康 |

#### 初始化阶段上报 Init

进程已启动但 Agent 尚未就绪时（例如启动后需要加载模型），可在自定义 `app.ping` 中返回
`INITING`，加载完成后再返回 `HEALTHY`，控制面将据此等待而不会提前路由流量：

```ts
let ready = false; // 后台加载完成后置为 true

app.ping(() => (ready ? PingStatus.HEALTHY : PingStatus.INITING));
```

> 注意：自定义 ping 处理函数抛出异常或返回无法识别的状态值时，`/ping` 会返回
> `UNHEALTHY`（fail-safe），而不会静默回退为 `HEALTHY`。

#### 强制设置状态

```ts
// 设置维护模式
app.forcePingStatus(PingStatus.UNHEALTHY);

// 恢复正常
app.forcePingStatus(null);
```

强制状态设置后优先于自定义 `app.ping` 处理函数生效；传入 `null` 清除强制状态，
恢复正常的健康检查逻辑。

### app.websocket

注册 WebSocket 处理函数，处理 `/ws` 端点的连接。

```ts
import type { WebSocketConnection } from 'agentarts-sdk/sdk/runtime';

app.websocket(async (ws: WebSocketConnection, context?: RequestContext) => {
  await ws.accept();

  try {
    while (true) {
      const data = await ws.receiveJson();
      const response = await processMessage(data);
      await ws.sendJson(response);
    }
  } catch {
    console.log('Client disconnected');
  }
});
```

`WebSocketConnection` 提供：`accept()`、`receiveJson()`、`receiveText()`、`sendJson(v)`、
`sendText(s)`、`send(data)`、`close(code?, reason?)`。

#### WebSocket 示例：聊天应用

```ts
app.websocket(async (ws: WebSocketConnection, context?: RequestContext) => {
  await ws.accept();
  const sessionId = context?.sessionId ?? 'default';

  try {
    while (true) {
      const message = await ws.receiveText();
      const response = await agent.chat(sessionId, message);
      await ws.sendText(response);
    }
  } catch {
    await agent.endSession(sessionId);
  }
});
```

### app.asyncTask

注册异步后台任务，任务执行状态会被自动追踪（仅支持 `async` 函数）。

```ts
const backgroundJob = app.asyncTask(async (payload: Record<string, any>) => {
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  return await processData(payload);
});

app.entrypoint(async (payload: Record<string, any>) => {
  // 启动后台任务
  void backgroundJob(payload);

  // 检查是否有运行中的任务
  if (app.hasRunningTasks()) {
    console.log('有后台任务正在执行');
  }

  return { status: 'accepted' };
});
```

## RequestContext

`RequestContext` 是请求数据的不可变快照，包含请求的元信息。

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `requestId` | `string \| undefined` | 请求唯一标识符 |
| `sessionId` | `string \| undefined` | 会话标识符 |
| `request` | `any` | 原始请求对象 |

### 使用示例

```ts
app.entrypoint(async (payload: Record<string, any>, context?: RequestContext) => {
  if (context) {
    console.log(`Request ID: ${context.requestId}`);
    console.log(`Session ID: ${context.sessionId}`);

    // 访问原始请求对象（Node.js IncomingMessage）
    if (context.request) {
      const headers = context.request.headers;
      const clientHost = context.request.socket?.remoteAddress;
    }
  }

  return { status: 'ok' };
});
```

## AgentArtsRuntimeContext

`AgentArtsRuntimeContext` 是全局上下文管理器，基于 Node.js `AsyncLocalStorage` 实现，
支持异步安全的上下文访问。

### 核心特性

- **协程安全**: 每个异步任务都有独立的上下文视图
- **全局访问**: 在调用栈的任何位置都可以访问上下文数据
- **无需实例化**: 直接使用静态方法访问

### 可用方法

| 方法 | 说明 |
|------|------|
| `getSessionId()` | 获取会话 ID |
| `setSessionId(value)` | 设置会话 ID |
| `getRequestId()` | 获取请求 ID |
| `setRequestId(value)` | 设置请求 ID |
| `getUserId()` | 获取用户 ID |
| `setUserId(value)` | 设置用户 ID |
| `getWorkloadAccessToken()` | 获取工作负载访问令牌 |
| `setWorkloadAccessToken(value)` | 设置工作负载访问令牌 |
| `getUserToken()` | 获取用户令牌 |
| `setUserToken(value)` | 设置用户令牌 |
| `getOauth2CallbackUrl()` | 获取 OAuth2 回调 URL |
| `setOauth2CallbackUrl(value)` | 设置 OAuth2 回调 URL |
| `getOauth2CustomState()` | 获取 OAuth2 自定义 state |
| `setOauth2CustomState(value)` | 设置 OAuth2 自定义 state |
| `fromRequestContext(rc)` | 由 `RequestContext` 初始化上下文 |
| `toRequestContext()` | 导出为 `RequestContext` |
| `clear()` | 清除所有上下文变量 |

### 使用示例

```ts
import { AgentArtsRuntimeContext } from 'agentarts-sdk';

app.entrypoint(async (payload: Record<string, any>, context?: RequestContext) => {
  // 方式一：通过 context 参数获取
  const sessionIdFromContext = context?.sessionId;

  // 方式二：通过全局上下文获取
  const sessionId = AgentArtsRuntimeContext.getSessionId();
  const requestId = AgentArtsRuntimeContext.getRequestId();
  const userId = AgentArtsRuntimeContext.getUserId();

  // 在深层调用中使用
  const result = await processWithContext();

  return { sessionId };
});

async function processWithContext() {
  // 在任意函数中访问上下文
  const sessionId = AgentArtsRuntimeContext.getSessionId();
  return { processed: true, session: sessionId };
}
```

如果需要在一段逻辑中拥有全新的上下文视图，可使用 `await AgentArtsRuntimeContext.runInNewContext(fn)`。

### OAuth2 集成示例

```ts
app.entrypoint(async (payload: Record<string, any>, context?: RequestContext) => {
  // 获取用户令牌
  const userToken = AgentArtsRuntimeContext.getUserToken();

  if (!userToken) {
    // 设置 OAuth2 回调 URL
    AgentArtsRuntimeContext.setOauth2CallbackUrl('https://my-app/callback');
    return { status: 'authorization_required' };
  }

  // 使用用户令牌调用 API
  return await callApiWithToken(userToken);
});
```

## 完整示例

### LangGraph Agent

```ts
import { AgentArtsRuntimeApp, type RequestContext } from 'agentarts-sdk';
import { AgentArtsRuntimeContext } from 'agentarts-sdk';
import { Annotation, END, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

const app = new AgentArtsRuntimeApp();

const State = Annotation.Root({
  messages: Annotation<any[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  query: Annotation<string>(),
  response: Annotation<string>(),
});

class LangGraphAgent {
  private modelName = process.env.OPENAI_MODEL_NAME ?? 'gpt-4o-mini';
  private graph: any = null;

  private buildGraph() {
    const llm = new ChatOpenAI({
      model: this.modelName,
      apiKey: process.env.OPENAI_API_KEY,
      configuration: { baseURL: process.env.OPENAI_BASE_URL },
    });

    const processNode = async (state: typeof State.State) => {
      const query = state.query ?? '';
      const messages = state.messages?.length ? state.messages : [new HumanMessage(query)];
      const response = await llm.invoke(messages);
      return {
        messages: [new AIMessage(String(response.content))],
        response: String(response.content),
      };
    };

    const workflow = new StateGraph(State)
      .addNode('process', processNode)
      .addEdge('__start__', 'process')
      .addEdge('process', END);

    return workflow.compile();
  }

  async run(query: string, sessionId?: string) {
    const graph = this.graph ?? this.buildGraph();
    this.graph = graph;
    const result = await graph.invoke({ messages: [], query, response: '' });
    return { response: result.response ?? '' };
  }
}

const agent = new LangGraphAgent();

app.entrypoint(async (payload: Record<string, any>, context?: RequestContext) => {
  const query = payload.message ?? '';
  const sessionId = AgentArtsRuntimeContext.getSessionId();
  return await agent.run(query, sessionId);
});

app.ping(() => PingStatus.HEALTHY);

app.run();
```

### 流式输出 Agent

```ts
import { AgentArtsRuntimeApp, type RequestContext } from 'agentarts-sdk';

const app = new AgentArtsRuntimeApp();

// 流式输出示例
app.entrypoint(async function* (payload: Record<string, any>, context?: RequestContext) {
  const message = String(payload.message ?? '');
  const words = message.split(/\s+/).filter(Boolean);

  for (const [index, word] of words.entries()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    yield {
      chunk: word,
      index,
      total: words.length,
    };
  }
});
```

### WebSocket Agent

```ts
import { AgentArtsRuntimeApp, type RequestContext } from 'agentarts-sdk';
import type { WebSocketConnection } from 'agentarts-sdk/sdk/runtime';

const app = new AgentArtsRuntimeApp();
const sessions = new Map<string, any>();

app.websocket(async (ws: WebSocketConnection, context?: RequestContext) => {
  await ws.accept();
  const sessionId = context?.sessionId ?? 'default';

  try {
    while (true) {
      const data: any = await ws.receiveJson();
      const message = data?.message ?? '';

      // 处理消息
      const response = await processMessage(sessionId, message);

      await ws.sendJson({
        response,
        session_id: sessionId,
      });
    }
  } catch (e) {
    console.log(`WebSocket error: ${(e as Error).message}`);
  } finally {
    sessions.delete(sessionId);
  }
});

async function processMessage(sessionId: string, message: string): Promise<string> {
  return `Echo: ${message}`;
}
```

## 注意事项

1. **并发限制**: 默认最大并发请求数为 15，可通过 `maxConcurrency` 参数配置，超出返回 503 错误
2. **上下文隔离**: 每个请求的上下文相互隔离，不会互相干扰
3. **流式响应**: 流式输出使用 SSE (Server-Sent Events) 格式，入口函数返回生成器/异步生成器即可
4. **健康检查**: 建议实现自定义健康检查逻辑，特别是有状态 Agent；`/ping` 返回 `{"status": "...", "time_of_last_update": <秒级 Unix 时间戳>}`
5. **WebSocket 生命周期**: 需要自行处理连接的 accept、receive、send、close
6. **注册方式**: TypeScript 版使用 `app.entrypoint(handler)` 等方法注册，不支持装饰器语法
