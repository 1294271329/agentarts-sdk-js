# Memory SDK 使用指南

## 概述

AgentArts Memory SDK 提供记忆管理功能，支持创建、存储和检索对话记忆。本文档介绍如何使用 Memory SDK 进行记忆空间的创建、会话管理和记忆操作。

## 环境要求

- Node.js 20 及以上
- 已安装 AgentArts SDK：`pnpm add agentarts-sdk`（或 `npm install agentarts-sdk`）

## 认证配置

### 华为云 AK/SK 认证

Memory SDK 使用华为云 AK/SK 进行身份认证。请通过以下方式配置：

**方式一：环境变量配置（推荐）**

```bash
# 设置华为云 AK/SK
export HUAWEICLOUD_SDK_AK="your-access-key"
export HUAWEICLOUD_SDK_SK="your-secret-key"
```

### 获取 AK/SK

1. 登录华为云控制台
2. 进入"我的凭证"页面
3. 在"访问密钥"标签页创建或查看 AK/SK

### 数据面端点配置

Memory 数据面端点可以通过以下方式配置（按优先级排序）：

1. **环境变量**（最高优先级）：
   ```bash
   export AGENTARTS_MEMORY_DATA_ENDPOINT="https://memory.cn-north-4.huaweicloud-agentarts.com"
   ```

2. **初始化参数**：
   ```ts
   const client = new MemoryClient({
     regionName: 'cn-north-4',
     endpoint: 'https://your-custom-endpoint.com',
   });
   ```

3. **默认值**：SDK 内置默认端点 `https://memory.{region}.huaweicloud-agentarts.com`

> **Note:** 更多环境变量配置请参考 [环境变量配置指南](environment_variables.md)。

### API Key 配置

创建 Space 后会生成 API Key，用于数据面操作。配置方式：

**方式一：环境变量配置**

```bash
export HUAWEICLOUD_SDK_MEMORY_API_KEY="your-memory-api-key"
```

**方式二：代码中直接传入**

```ts
import { MemoryClient } from 'agentarts-sdk/sdk/memory';

const client = new MemoryClient({ apiKey: 'your-memory-api-key' });
```

## SDK 架构

Memory SDK 提供两种使用模式：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| Client 模式 | 功能完整的客户端 | 需要控制所有操作的应用场景 |
| Session 模式 | 基于绑定的会话进行记忆管理 | 特定用户/对话场景 |

## 快速开始

### Client 模式示例

```ts
import { MemoryClient, MemorySearchFilter, TextMessage } from 'agentarts-sdk/sdk/memory';
import { setTimeout as sleep } from 'node:timers/promises';

// 验证环境变量
if (!process.env.HUAWEICLOUD_SDK_AK) throw new Error('请设置 HUAWEICLOUD_SDK_AK');
if (!process.env.HUAWEICLOUD_SDK_SK) throw new Error('请设置 HUAWEICLOUD_SDK_SK');

/** Client 模式完整示例 */
async function clientModeExample() {
  const client = new MemoryClient();
  try {
    // 1. 创建 Space
    console.log('创建记忆空间...');
    const space = await client.createSpace('my-memory-space', {
      messageTtlHours: 168,
      description: '示例记忆空间',
      memoryStrategiesBuiltin: ['semantic', 'user_preference', 'episodic'],
    });
    const spaceId = space.id;
    console.log(`Space ID: ${spaceId}`);
    console.log(`API Key ID: ${space.apiKeyId}`);

    // 2. 创建会话
    console.log('\n创建会话...');
    // 第二个参数为可选的自定义 Session ID，留空由服务端生成
    const sessionData = await client.createMemorySession(spaceId, undefined, 'user-001', 'assistant-001');
    const sessionId = sessionData.id;
    console.log(`Session ID: ${sessionId}`);

    // 3. 添加消息
    console.log('\n添加对话消息...');
    const messages = [
      new TextMessage({
        role: 'user',
        content: '你好，我想了解机器学习的基础知识',
        actorId: 'user-001',
      }),
      new TextMessage({
        role: 'assistant',
        content: '机器学习是人工智能的一个分支，主要研究如何让计算机从数据中学习规律。',
        actorId: 'assistant-001',
      }),
    ];

    await client.addMessages(spaceId, sessionId, messages);
    console.log('消息添加成功');

    // 4. 等待记忆生成
    console.log('\n等待记忆系统处理...');
    await sleep(30_000);

    // 5. 查询记忆
    console.log('\n查询记忆列表...');
    const memories = await client.listMemories(spaceId, 10);
    console.log(`发现 ${memories.items.length} 条记忆`);

    // 6. 搜索记忆
    console.log('\n搜索相关记忆...');
    const searchResults = await client.searchMemories(
      spaceId,
      new MemorySearchFilter({ query: '机器学习', topK: 3 }),
    );
    console.log(`找到 ${searchResults.results.length} 条相关记忆`);

    return { spaceId, sessionId };
  } finally {
    // 释放资源（对应 Python 的 with 语句）
    await client.close();
  }
}

await clientModeExample();
```

### Session 模式示例

```ts
import { MemoryClient, MemorySession, TextMessage, MemorySearchFilter } from 'agentarts-sdk/sdk/memory';
import { setTimeout as sleep } from 'node:timers/promises';

// 验证环境变量
if (!process.env.HUAWEICLOUD_SDK_AK) throw new Error('请设置 HUAWEICLOUD_SDK_AK');
if (!process.env.HUAWEICLOUD_SDK_SK) throw new Error('请设置 HUAWEICLOUD_SDK_SK');

/** Session 模式完整示例 */
async function sessionModeExample() {
  // 1. 创建 Space
  const client = new MemoryClient();
  let spaceId: string;
  try {
    console.log('创建记忆空间...');
    const space = await client.createSpace('session-mode-space', {
      messageTtlHours: 168,
      description: 'Session 模式示例空间',
      memoryStrategiesBuiltin: ['semantic', 'user_preference'],
    });
    spaceId = space.id;
    console.log(`Space ID: ${spaceId}`);
  } finally {
    await client.close();
  }

  // 2. 创建并绑定会话（会自动创建 Session）
  console.log('\n创建并绑定会话...');
  const session = await MemorySession.of({ spaceId, actorId: 'user-002' });
  console.log(`Session ID: ${session.sessionId}`);

  try {
    // 3. 添加消息
    console.log('\n添加对话消息...');
    const messages = [
      new TextMessage({ role: 'user', content: '我是一名 Node.js 开发者' }),
      new TextMessage({ role: 'assistant', content: 'TypeScript 是 Node.js 生态中很流行的语言！' }),
    ];

    await session.addMessages(messages);
    console.log('消息添加成功');

    // 4. 等待记忆生成
    console.log('\n等待记忆系统处理...');
    await sleep(30_000);

    // 5. 查询记忆
    console.log('\n查询记忆列表...');
    const memories = await session.listMemories(10);
    console.log(`发现 ${memories.items.length} 条记忆`);

    // 6. 搜索记忆
    console.log('\n搜索相关记忆...');
    const searchResults = await session.searchMemories(
      new MemorySearchFilter({ query: 'TypeScript', topK: 3 }),
    );
    console.log(`找到 ${searchResults.results.length} 条相关记忆`);

    return { spaceId, sessionId: session.sessionId };
  } finally {
    await session.close();
  }
}

await sessionModeExample();
```

## API 参考

### MemoryClient 类

#### 初始化

```ts
new MemoryClient(options?: MemoryClientOptions)
// MemoryClientOptions = { regionName?: string; apiKey?: string; verifySsl?: boolean | string }
```

也兼容按位置参数构造（顺序与 Python 一致）：`new MemoryClient(regionName?, apiKey?, verifySsl?)`。

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| regionName | string | 否 | cn-southwest-2 | 华为云区域名称 |
| apiKey | string | 否 | undefined | 数据面 API 密钥，不传入则从环境变量读取 |
| verifySsl | boolean \| string | 否 | true | 是否校验 SSL 证书；字符串表示 CA 证书包路径 |

**环境变量要求**：
- `HUAWEICLOUD_SDK_AK`：华为云 Access Key
- `HUAWEICLOUD_SDK_SK`：华为云 Secret Key
- `HUAWEICLOUD_SDK_MEMORY_API_KEY`：数据面 API 密钥（可选，也可通过参数传入）

**资源释放**：Python 使用 `with` 语句，TypeScript 请调用 `await client.close()`（建议放在 `finally` 中）。

#### Space 管理方法

##### createSpace

创建记忆空间。

```ts
createSpace(name: string, messageTtlHours?: number, description?: string, tags?: Record<string, any>[],
            memoryExtractIdleSeconds?: number, memoryExtractMaxTokens?: number,
            memoryExtractMaxMessages?: number, publicAccessEnable?: boolean,
            privateVpcId?: string, privateSubnetId?: string,
            memoryStrategiesBuiltin?: string[], memoryStrategiesCustomized?: string[]): Promise<SpaceInfo>

// 也支持 options 形式
createSpace(name: string, options?: CreateSpaceOptions): Promise<SpaceInfo>
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| name | string | 是 | - | Space 名称，长度 1-128 |
| messageTtlHours | number | 否 | 168 | 消息 TTL 时间（小时），范围 1-8760 |
| description | string | 否 | undefined | 描述信息 |
| tags | Array | 否 | undefined | 标签列表 |
| memoryStrategiesBuiltin | string[] | 否 | undefined | 内置记忆策略列表 |
| publicAccessEnable | boolean | 否 | true | 是否开启公网访问 |

**返回值**：`SpaceInfo` 对象

| 属性 | 类型 | 说明 |
|------|------|------|
| id | string | Space ID |
| name | string | Space 名称 |
| apiKey | string | API Key（仅创建时可见） |
| apiKeyId | string | API Key ID |
| status | string | Space 状态 |
| createdAt | string | 创建时间戳 |

##### listSpaces

列出所有 Space。

```ts
listSpaces(limit?: number, offset?: number): Promise<SpaceListResponse>
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| limit | number | 否 | 20 | 每页数量，范围 1-100 |
| offset | number | 否 | 0 | 偏移量 |

**返回值**：`SpaceListResponse` 对象（`items` / `total` / `limit` / `offset`）

##### getSpace

获取 Space 详情。

```ts
getSpace(spaceId: string): Promise<SpaceInfo>
```

##### updateSpace

更新 Space 配置。

```ts
updateSpace(spaceId: string, name?: string, description?: string, messageTtlHours?: number): Promise<SpaceInfo>

// 也支持 options 形式
updateSpace(spaceId: string, options?: UpdateSpaceOptions): Promise<SpaceInfo>
```

##### deleteSpace

删除 Space。

```ts
deleteSpace(spaceId: string): Promise<void>
```

#### Session 管理方法

##### createMemorySession

创建 Memory Session。

```ts
createMemorySession(spaceId: string, id?: string, actorId?: string,
                    assistantId?: string, meta?: Record<string, any>): Promise<SessionInfo>
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| spaceId | string | 是 | - | Space ID |
| id | string | 否 | undefined | 自定义 Session ID，不传则由服务端生成 |
| actorId | string | 否 | undefined | 参与者 ID |
| assistantId | string | 否 | undefined | 助手 ID |
| meta | object | 否 | undefined | 元数据 |

**返回值**：`SessionInfo` 对象

#### 消息管理方法

##### addMessages

添加消息。

```ts
addMessages(spaceId: string, sessionId: string, messages: Message[],
            options?: AddMessagesOptions): Promise<MessageBatchResponse>
// AddMessagesOptions = { timestamp?: number; idempotencyKey?: string; isForceExtract?: boolean }
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| spaceId | string | 是 | - | Space ID |
| sessionId | string | 是 | - | Session ID |
| messages | Array | 是 | - | 消息列表 |
| options.timestamp | number | 否 | undefined | 客户端时间戳（毫秒） |
| options.idempotencyKey | string | 否 | undefined | 幂等键 |
| options.isForceExtract | boolean | 否 | false | 是否强制触发记忆抽取 |

**消息类型**：

- `TextMessage`：文本消息
  ```ts
  new TextMessage({
    role: 'user', // 'user' | 'assistant' | 'system'
    content: '消息内容',
    actorId: '用户ID',
    assistantId: '助手ID',
  });
  ```

- `ToolCallMessage`：工具调用消息
  ```ts
  new ToolCallMessage({
    id: '调用ID',
    name: '工具名称',
    arguments: { 参数: '值' },
  });
  ```

- `ToolResultMessage`：工具结果消息
  ```ts
  new ToolResultMessage({
    toolCallId: '调用ID',
    content: '结果内容',
  });
  ```

##### listMessages

列出消息。

```ts
listMessages(spaceId: string, sessionId?: string, limit?: number, offset?: number): Promise<MessageListResponse>
```

#### 记忆管理方法

##### searchMemories

搜索记忆。

```ts
searchMemories(spaceId: string, filters?: MemorySearchFilter): Promise<MemorySearchResponse>
```

**MemorySearchFilter 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| query | string | 否 | undefined | 搜索查询字符串 |
| strategyType | string | 否 | undefined | 策略类型过滤 |
| actorId | string | 否 | undefined | 参与者 ID 过滤 |
| sessionId | string | 否 | undefined | 会话 ID 过滤 |
| topK | number | 否 | 10 | 返回前 K 个结果 |
| minScore | number | 否 | 0.5 | 最小相关性分数（0-1） |
| onlyActived | boolean | 否 | false | 是否仅返回当前活跃的记忆；false 返回搜索到的全量记忆 |
| rerank | boolean | 否 | true | 搜索记忆时是否开启重排序，默认开启 |

##### listMemories

列出记忆记录。

```ts
listMemories(spaceId: string, limit?: number, offset?: number, filters?: MemoryListFilter): Promise<MemoryListResponse>
```

##### getMemory

获取记忆详情。

```ts
getMemory(spaceId: string, memoryId: string): Promise<MemoryInfo>
```

##### deleteMemory

删除记忆记录。

```ts
deleteMemory(spaceId: string, memoryId: string): Promise<void>
```

### MemorySession 类

#### 初始化

```ts
await MemorySession.of({
  spaceId: string,
  actorId: string,
  sessionId?: string,
  regionName?: string,
  apiKey?: string,
});

// 也可以直接 new（首次操作时惰性创建 Session）
const session = new MemorySession({ spaceId, actorId });
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| spaceId | string | 是 | - | Space ID |
| actorId | string | 是 | - | 参与者 ID |
| sessionId | string | 否 | undefined | Session ID，不提供时自动创建 |
| regionName | string | 否 | undefined | 区域名称 |
| apiKey | string | 否 | undefined | 数据面 API 密钥 |

#### 方法列表

Session 模式下的方法与 Client 模式类似，但自动使用绑定的 spaceId 和 sessionId：

| 方法 | 说明 |
|------|------|
| `addMessages(messages, options?)` | 添加消息到当前会话 |
| `listMessages(limit, offset)` | 列出当前会话的消息 |
| `searchMemories(filters?)` | 搜索当前会话的记忆 |
| `listMemories(limit, offset, filters?)` | 列出当前会话的记忆 |
| `getMemory(memoryId)` | 获取记忆详情 |
| `deleteMemory(memoryId)` | 删除记忆记录 |
| `close()` | 释放资源 |

## 返回类型说明

### SpaceInfo

| 属性 | 类型 | 说明 |
|------|------|------|
| id | string | Space ID |
| name | string | Space 名称 |
| apiKey | string | API Key（仅创建时可见） |
| apiKeyId | string | API Key ID |
| description | string | 描述信息 |
| status | string | Space 状态 |
| createdAt | string | 创建时间戳 |
| updatedAt | string | 更新时间戳 |

### SessionInfo

| 属性 | 类型 | 说明 |
|------|------|------|
| id | string | Session ID |
| spaceId | string | Space ID |
| actorId | string | 参与者 ID |
| assistantId | string | 助手 ID |
| createdAt | string | 创建时间戳 |

### MemoryInfo

| 属性 | 类型 | 说明 |
|------|------|------|
| id | string | 记忆 ID |
| spaceId | string | Space ID |
| content | string | 记忆内容 |
| strategyType | string | 策略类型 |
| createdAt | string | 创建时间戳 |

### MessageInfo

| 属性 | 类型 | 说明 |
|------|------|------|
| id | string | 消息 ID |
| sessionId | string | 会话 ID |
| role | string | 消息角色 |
| parts | Array | 消息内容 |
| createdAt | string | 创建时间戳 |

## 错误处理

```ts
import { MemoryClient } from 'agentarts-sdk/sdk/memory';
import { getLogger } from 'agentarts-sdk/sdk/utils/logging';

const logger = getLogger('memory-example');
const client = new MemoryClient();

try {
  const space = await client.createSpace('test-space');
  console.log(`Space: ${space.id}`);
} catch (e) {
  if (e instanceof TypeError || e instanceof RangeError) {
    // 参数校验错误
    logger.error(`参数错误: ${(e as Error).message}`);
  } else {
    // 网络、认证或其他系统错误
    logger.error(`系统错误: ${(e as Error).message}`);
  }
} finally {
  await client.close();
}
```

## 最佳实践

### 1. 认证信息管理

- 使用环境变量存储 AK/SK，避免硬编码
- 创建 Space 后妥善保存 API Key
- 生产环境建议使用密钥管理服务

### 2. 记忆生成延迟

- 系统需要时间从对话消息中生成记忆
- 发送消息后建议等待 30 秒再进行查询
- 搜索功能需要记忆生成完成才能返回结果

### 3. 资源管理

- 使用 `try/finally` 调用 `await client.close()` / `await session.close()` 释放资源
- 开发测试完成后及时清理测试数据
- 删除不再使用的 Space 释放资源

### 4. 参数验证

- Space 名称长度 1-128 字符
- 消息内容最大长度 10000 字符
- actorId、assistantId 长度不超过 64 字符

## 常见问题

### Q1: 如何获取 API Key？

创建 Space 时会自动生成 API Key，仅在创建响应中返回一次。请妥善保存。

### Q2: 记忆搜索无结果？

确保：
1. 已等待足够时间让系统生成记忆（建议 30 秒以上）
2. 搜索关键词与对话内容相关
3. Space 状态为 running

### Q3: 认证失败怎么办？

检查：
1. AK/SK 是否正确配置
2. API Key 是否有效
3. 区域配置是否正确

### Q4: 如何选择 Client 或 Session 模式？

- **Client 模式**：需要管理多个 Space 或 Session，或需要完整的控制能力
- **Session 模式**：单一会话场景，代码更简洁
