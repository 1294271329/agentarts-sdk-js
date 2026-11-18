# Gateway SDK 使用指南

## 概述

Gateway SDK 提供网关管理功能，支持创建、配置和管理 MCP（Model Context Protocol）网关及其目标。本文档介绍如何使用 Gateway SDK 进行网关的创建、配置和目标管理。

## 环境要求

- Node.js 20 及以上
- 已安装 AgentArts SDK：`pnpm add agentarts-sdk`（或 `npm install agentarts-sdk`）

## 认证配置

### 华为云 AK/SK 认证

Gateway SDK 使用华为云 AK/SK 进行身份认证。请通过以下方式配置：

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

## 快速开始

### 基本用法示例

```ts
import { GatewayClient } from 'agentarts-sdk';

// 初始化客户端
const client = new GatewayClient();

// 创建网关
const result = await client.createGateway({
  name: 'my-gateway',
  description: '我的网关',
  protocolType: 'mcp',
  authorizerType: 'iam',
});

let gatewayId: string | null = null;
if (result.success) {
  gatewayId = result.data.gateway_id;
  console.log(`网关创建成功，ID: ${gatewayId}`);
} else {
  console.log(`创建网关失败: ${result.error}`);
}

// 创建目标
if (gatewayId !== null) {
  const targetResult = await client.createGatewayTarget(gatewayId, {
    name: 'my-target',
    description: '我的目标',
    targetConfiguration: {
      mcp_server: {
        endpoint: 'https://example.com/mcp',
        server_type: 'sse',
      },
    },
  });

  if (targetResult.success) {
    const target = targetResult.data.target;
    const targetId = target.target_id;
    console.log(`目标创建成功，ID: ${targetId}`);
  } else {
    console.log(`创建目标失败: ${targetResult.error}`);
  }
}

// 列出网关
const listResult = await client.listGateways({});
if (listResult.success) {
  console.log(`总网关数: ${listResult.data.total ?? 0}`);
  for (const gateway of listResult.data.gateways ?? []) {
    console.log(`- ${gateway.name} (ID: ${gateway.gateway_id})`);
  }
}
```

## API 参考

### GatewayClient 类

#### 初始化

```ts
new GatewayClient(verifySsl: boolean = true)
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| verifySsl | boolean | 否 | true | 是否验证 SSL 证书 |

**默认行为**：
- 默认启用 SSL 验证（verifySsl = true）

### 网关管理方法

#### createGateway

创建新的网关。

```ts
createGateway(options: CreateGatewayOptions = {}): Promise<RequestResult>
// CreateGatewayOptions = {
//   name?, description?, protocolType?, authorizerType?, agencyName?,
//   authorizerConfiguration?, protocolConfiguration?, logDeliveryConfiguration?,
//   outboundNetworkConfiguration?, tags?
// }
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| name | string | 否 | gateway-{random} | 网关名称 |
| description | string | 否 | undefined | 网关描述 |
| protocolType | string | 否 | mcp | 协议类型 |
| authorizerType | string | 否 | iam | 授权器类型（custom_jwt/iam/api_key） |
| agencyName | string | 否 | undefined | 代理名称。未提供时自动创建名为 AgentArtsCoreGateway 的代理 |
| authorizerConfiguration | object | 否 | undefined | 授权器配置 |
| protocolConfiguration | object | 否 | undefined | 协议配置，如 `{ mcp: { search_configuration: {...} } }` |
| logDeliveryConfiguration | object | 否 | `{ enabled: false }` | 日志投递配置 |
| outboundNetworkConfiguration | object | 否 | `{ network_mode: 'public' }` | 出站网络配置 |
| tags | Array<{key, value}> | 否 | undefined | 资源标签列表 |

**返回值**：`RequestResult` 对象

**异常**：`Error` - 如果代理创建失败且未提供 agencyName

#### updateGateway

更新现有的网关。

```ts
updateGateway(gatewayId: string, options: UpdateGatewayOptions): Promise<RequestResult>
// UpdateGatewayOptions = { description?, protocolConfiguration?, logDeliveryConfiguration?, tags? }
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| gatewayId | string | 是 | - | 网关 ID |
| description | string | 否 | undefined | 网关描述 |
| protocolConfiguration | object | 否 | undefined | 协议配置 |
| logDeliveryConfiguration | object | 否 | undefined | 日志投递配置 |
| tags | Array<{key, value}> | 否 | undefined | 资源标签列表 |

**返回值**：`RequestResult` 对象

**异常**：`Error` - 如果所有可选参数均未提供

#### deleteGateway

删除网关。

```ts
deleteGateway(gatewayId: string): Promise<RequestResult>
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| gatewayId | string | 是 | - | 网关 ID |

**返回值**：`RequestResult` 对象

#### getGateway

获取网关的详细信息。

```ts
getGateway(gatewayId: string): Promise<RequestResult>
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| gatewayId | string | 是 | - | 网关 ID |

**返回值**：`RequestResult` 对象

#### listGateways

列出网关，可选择过滤条件。

```ts
listGateways(options: ListGatewaysOptions = {}): Promise<RequestResult>
// ListGatewaysOptions = {
//   name?, status?, gatewayId?, tagKeyExists?, tagKeyMatches?, tagValueMatches?,
//   tagMatchPolicy?, limit?, offset?
// }
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| name | string | 否 | undefined | 网关名称过滤器 |
| status | string | 否 | undefined | 网关状态过滤器 |
| gatewayId | string | 否 | undefined | 网关 ID 过滤器 |
| tagKeyExists | string[] | 否 | undefined | 按标签键存在过滤 |
| tagKeyMatches | string[] | 否 | undefined | 按标签键值对过滤（键） |
| tagValueMatches | string[] | 否 | undefined | 按标签键值对过滤（值） |
| tagMatchPolicy | string | 否 | undefined | 标签匹配模式（ALL/ANY） |
| limit | number | 否 | undefined | 结果的最大数量（1-100） |
| offset | number | 否 | undefined | 分页偏移量 |

**返回值**：`RequestResult` 对象

### 目标管理方法

#### createGatewayTarget

创建新的网关目标。

```ts
createGatewayTarget(gatewayId: string, options: CreateGatewayTargetOptions = {}): Promise<RequestResult>
// options = { name?, description?, targetConfiguration?, credentialProviderConfiguration? }
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| gatewayId | string | 是 | - | 网关 ID |
| name | string | 否 | target-{random} | 目标名称 |
| description | string | 否 | undefined | 目标描述 |
| targetConfiguration | object | 否 | undefined | 目标配置 |
| credentialProviderConfiguration | object | 否 | `{ credential_provider_type: 'none' }` | 凭证提供者配置 |

**返回值**：`RequestResult` 对象

#### updateGatewayTarget

更新现有的网关目标。

```ts
updateGatewayTarget(gatewayId: string, targetId: string, options: UpdateGatewayTargetOptions): Promise<RequestResult>
// options = { name?, description?, targetConfiguration?, credentialProviderConfiguration? }
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| gatewayId | string | 是 | - | 网关 ID |
| targetId | string | 是 | - | 目标 ID |
| name | string | 否 | undefined | 目标名称 |
| description | string | 否 | undefined | 目标描述 |
| targetConfiguration | object | 否 | undefined | 目标配置 |
| credentialProviderConfiguration | object | 否 | undefined | 凭证提供者配置 |

**返回值**：`RequestResult` 对象

**异常**：`Error` - 如果所有可选参数均未提供

#### deleteGatewayTarget

删除网关目标。

```ts
deleteGatewayTarget(gatewayId: string, targetId: string): Promise<RequestResult>
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| gatewayId | string | 是 | - | 网关 ID |
| targetId | string | 是 | - | 目标 ID |

**返回值**：`RequestResult` 对象

#### getGatewayTarget

获取网关目标的详细信息。

```ts
getGatewayTarget(gatewayId: string, targetId: string): Promise<RequestResult>
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| gatewayId | string | 是 | - | 网关 ID |
| targetId | string | 是 | - | 目标 ID |

**返回值**：`RequestResult` 对象

#### listGatewayTargets

列出网关目标，支持分页。

```ts
listGatewayTargets(gatewayId: string, options: ListGatewayTargetsOptions = {}): Promise<RequestResult>
// options = { limit?, offset? }
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| gatewayId | string | 是 | - | 网关 ID |
| limit | number | 否 | undefined | 结果的最大数量 |
| offset | number | 否 | undefined | 分页偏移量 |

**返回值**：`RequestResult` 对象

## 返回类型说明

### RequestResult

所有方法返回的 `RequestResult` 对象具有以下属性：

| 属性 | 类型 | 说明 |
|------|------|------|
| success | boolean | 表示请求是否成功 |
| data | any | 响应数据（对象或数组） |
| error | string \| null | 如果请求失败，则为错误消息 |
| statusCode | number | HTTP 状态码 |
| headers | object | 响应头 |
| streaming | boolean | 是否为流式响应；流式时可用 `await result.iterLines()` / `iterBytes()` |

## 错误处理

```ts
import { GatewayClient } from 'agentarts-sdk';
import { getLogger } from 'agentarts-sdk/sdk/utils/logging';

const logger = getLogger('gateway-example');

try {
  const client = new GatewayClient();
  const result = await client.createGateway({ name: 'my-gateway' });

  if (!result.success) {
    logger.error(`创建网关失败: ${result.error}`);
  }
} catch (e) {
  // 参数验证错误或网络、认证等系统错误
  logger.error(`系统错误: ${(e as Error).message}`);
}
```

## 最佳实践

### 1. 认证信息管理

- 使用环境变量存储 AK/SK，避免硬编码
- 生产环境建议使用密钥管理服务
- 定期轮换访问密钥

### 2. 网关命名规范

- 使用有意义的网关名称，便于识别和管理
- 建议使用格式：`{project}-{environment}-{function}`
- 例如：`myapp-prod-api-gateway`

### 3. 授权器配置

- IAM 授权器：适合华为云内部服务调用
- API Key 授权器：适合外部系统集成
- Custom JWT 授权器：适合自定义认证场景

### 4. 网络配置

- 公网模式：适合公网访问场景
- VPC 内网模式：适合内部服务调用，安全性更高

### 5. 资源管理

- 及时清理不再使用的网关和目标
- 使用标签进行资源分类和管理
- 定期检查网关状态和配置

## 常见问题

### Q1: 创建网关时提示代理创建失败？

**原因**：系统自动创建代理失败，可能是权限不足。

**解决方案**：
1. 检查 AK/SK 是否有 IAM 权限
2. 手动创建代理并提供 `agencyName` 参数

### Q2: 更新网关时提示参数错误？

**原因**：未提供任何更新参数。

**解决方案**：
确保至少提供一个更新参数（description 等）。

### Q3: 如何选择授权器类型？

根据使用场景选择：
- **iam**：华为云内部服务调用
- **api_key**：外部系统集成，简单易用
- **custom_jwt**：需要自定义认证逻辑

### Q4: 网关创建后无法访问？

**检查项**：
1. 网关状态是否为 running
2. 网络配置是否正确
3. 目标配置是否正确
4. 认证信息是否有效

### Q5: 如何删除网关？

删除网关前确保：
1. 网关下没有正在运行的任务
2. 先删除所有关联的目标
3. 使用 `deleteGateway` 方法删除
