/**
 * Deploy operation implementation.
 *
 * Ported from `agentarts/toolkit/operations/runtime/deploy.py`. Two modes are
 * supported:
 *
 * - `cloud` (default): build the image, push it to SWR and create/update the
 *   AgentArts runtime;
 * - `local`: build the image and run it in local Docker.
 *
 * Java agent support was dropped from the Node.js port, so the Python
 * `_build_java_artifact()` (Maven fat jar) step is gone.
 */

import { existsSync } from 'node:fs';

import { RuntimeClient } from '../../../sdk/service/runtime-client.js';
import { SWRClient } from '../../../sdk/service/swr-client.js';
import { getControlPlaneEndpoint, getRegion } from '../../../sdk/utils/constant.js';
import { console, echoError, echoInfo, echoSuccess } from '../../utils/common.js';
import {
  buildDockerImage,
  checkDockerAvailable,
  checkDockerfileExists,
  loginToRegistry,
  pushImage,
  runContainer,
  tagImage,
} from '../../utils/runtime/container.js';
import type { AgentArtsConfig } from '../../utils/runtime/config.js';
import { getAgent, getConfigFilePath, loadConfig } from './config.js';

export { console };

/** Loose dictionary matching `dict[str, Any]` (JSON/YAML object). */
type Dict = Record<string, any>;

/** Convert an unknown error to a message string. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Deploy mode. */
export enum DeployMode {
  LOCAL = 'local',
  CLOUD = 'cloud',
}

/** Options for {@link createAgentartsRuntime}. */
export interface CreateAgentartsRuntimeOptions {
  /** Agent configuration from the YAML file. */
  agentConfig?: AgentArtsConfig | null;
  /** Agent description (overrides the generated one). */
  description?: string | null;
  /** SSL verification setting (`false` disables verification). */
  verifySsl?: boolean | string;
}

/**
 * Create or update an AgentArts runtime using {@link RuntimeClient}.
 *
 * @param agentName Agent name.
 * @param swrImage SWR image URL.
 * @param region Huawei Cloud region.
 * @returns The agent object when successful, `null` otherwise.
 */
export function createAgentartsRuntime(
  agentName: string,
  swrImage: string,
  region: string,
  options?: CreateAgentartsRuntimeOptions,
): Promise<Dict | null>;
export function createAgentartsRuntime(
  options: CreateAgentartsRuntimeOptions & {
    agentName: string;
    swrImage: string;
    region: string;
  },
): Promise<Dict | null>;
export async function createAgentartsRuntime(
  agentNameOrOptions:
    | string
    | (CreateAgentartsRuntimeOptions & { agentName: string; swrImage: string; region: string }),
  swrImage?: string,
  region?: string,
  options: CreateAgentartsRuntimeOptions = {},
): Promise<Dict | null> {
  const opts: CreateAgentartsRuntimeOptions & {
    agentName?: string;
    swrImage?: string;
    region?: string;
  } =
    typeof agentNameOrOptions === 'string'
      ? { ...options, agentName: agentNameOrOptions, swrImage: swrImage ?? '', region: region ?? '' }
      : agentNameOrOptions;

  const agentName = String(opts.agentName ?? '');
  const image = String(opts.swrImage ?? '');
  const agentRegion = String(opts.region ?? '');
  const agentConfig = opts.agentConfig ?? null;
  const description = opts.description ?? null;
  const verifySsl = opts.verifySsl ?? true;

  console.print(`[bold cyan]Creating AgentArts runtime: [cyan]${agentName}[/cyan]...`);

  try {
    const endpoint = getControlPlaneEndpoint(agentRegion);

    const client = new RuntimeClient({ controlEndpoint: endpoint, verifySsl });

    let artifactSourceConfig: Dict | null = null;
    let invokeConfig: Dict = {};
    let networkConfig: Dict | null = null;
    let identityConfig: Dict | null = null;
    let observabilityConfig: Dict | null = null;
    let storageConfig: Dict | null = null;
    let lifecycleConfig: Dict | null = null;
    let envVars: Dict[] | null = null;
    let tagsConfig: Dict[] | null = null;
    let executionAgencyName: string | null = null;
    let agentGatewayId: string | null = null;
    let arch: string | null = null;

    if (agentConfig !== null) {
      const runtimeCfg = agentConfig.runtime;

      if (runtimeCfg.arch) {
        arch = String(runtimeCfg.arch);
      }

      if (runtimeCfg.artifactSource) {
        artifactSourceConfig = runtimeCfg.artifactSource.toDict();
        artifactSourceConfig['url'] = image;
      }

      if (runtimeCfg.invokeConfig) {
        invokeConfig = {
          protocol: runtimeCfg.invokeConfig.protocol,
          port: runtimeCfg.invokeConfig.port,
        };
        const fileTransfer = runtimeCfg.invokeConfig.fileTransferConfig;
        if (fileTransfer) {
          invokeConfig['file_transfer_config'] = { enabled: fileTransfer.enabled };
        }
        if (runtimeCfg.invokeConfig.urlMatchType) {
          invokeConfig['url_match_type'] = runtimeCfg.invokeConfig.urlMatchType;
        }
      }

      if (runtimeCfg.networkConfig) {
        networkConfig = runtimeCfg.networkConfig.toDict();
      }

      if (runtimeCfg.identityConfiguration) {
        identityConfig = runtimeCfg.identityConfiguration.toDict();
      }

      if (runtimeCfg.observability) {
        observabilityConfig = runtimeCfg.observability.toDict();
      }

      if (runtimeCfg.storageConfig) {
        const sc = runtimeCfg.storageConfig.toDict();
        // Validate sfs_turbo: mount_path is required when sfs_turbo_id is set.
        const sfsTurboList = (sc['sfs_turbo'] as Dict[] | undefined) ?? [];
        if (sfsTurboList.length > 0) {
          const sfsTurbo = sfsTurboList[0];
          if (sfsTurbo['sfs_turbo_id'] && !sfsTurbo['mount_path']) {
            throw new Error(
              'storage_config.sfs_turbo.mount_path is required when sfs_turbo_id is set',
            );
          }
        }
        if (Object.keys(sc).length > 0) {
          storageConfig = sc;
        }
      }

      if (runtimeCfg.lifecycleConfig) {
        const lc = runtimeCfg.lifecycleConfig.toDict();
        if (Object.keys(lc).length > 0) {
          lifecycleConfig = lc;
        }
      }

      if (runtimeCfg.environmentVariables) {
        envVars = runtimeCfg.environmentVariables
          .filter((kv) => Boolean(kv.value))
          .map((kv) => ({ key: kv.key, value: kv.value }));
      }

      if (runtimeCfg.tags) {
        tagsConfig = runtimeCfg.tags
          .filter((kv) => Boolean(kv.value))
          .map((kv) => ({ key: kv.key, value: kv.value }));
      }

      executionAgencyName = runtimeCfg.executionAgencyName;
      agentGatewayId = runtimeCfg.agentGatewayId;
    }

    if (!artifactSourceConfig) {
      artifactSourceConfig = { url: image, commands: [] };
    }

    if (Object.keys(invokeConfig).length === 0) {
      invokeConfig = {
        protocol: 'HTTP',
        port: 8080,
        file_transfer_config: { enabled: false },
        url_match_type: 'ACCURATE_MATCH',
      };
    }

    const agentDescription =
      description || `Agent created by AgentArts SDK Toolkit, deployed from ${image}`;

    const agent = await client.createOrUpdateAgent(agentName, {
      description: agentDescription,
      artifactSourceConfig,
      invokeConfig,
      networkConfig,
      identityConfig,
      observabilityConfig,
      storageConfig,
      lifecycleConfig,
      envVars,
      tagsConfig,
      executionAgencyName,
      agentGatewayId,
      extra: arch ? { arch } : undefined,
    });

    const agentId = agent['id'];
    const latestVersion = agent['latest_version'];

    echoSuccess(
      `Runtime '${agentName}(${latestVersion})'created/updated successfully with [dim]ID: ${agentId}[/dim]`,
    );
    return agent;
  } catch (error) {
    echoError(`Failed to create runtime: ${errorMessage(error)}`);
    return null;
  }
}

/** Options for {@link deployProject} (Python keyword arguments). */
export interface DeployProjectOptions {
  /** Agent name (uses the default agent when omitted). */
  agentName?: string | null;
  /** Deploy mode (local or cloud). */
  mode?: DeployMode;
  /** Docker image tag. */
  imageTag?: string;
  /** Local port (local mode). */
  localPort?: number | null;
  /** SWR organization (overrides the configuration). */
  swrOrg?: string | null;
  /** SWR repository (overrides the configuration). */
  swrRepo?: string | null;
  /** Agent description (overrides the configuration). */
  description?: string | null;
  /** Skip build/push and use the configured artifact URL. */
  skipBuild?: boolean;
  /** Skip SSL certificate verification. */
  skipSslVerification?: boolean;
}

/** Print a cyan "Deploy Progress" panel around `content`. */
function printProgressPanel(content: string): void {
  console.printPanel('[bold cyan]Deploy Progress[/bold cyan]', content, { borderStyle: 'cyan' });
}

/**
 * Deploy a project.
 *
 * @param options Deploy options (all optional, Python keyword arguments).
 * @returns `true` when the deploy succeeded.
 */
export async function deployProject(options: DeployProjectOptions = {}): Promise<boolean> {
  const agentName = options.agentName ?? null;
  const mode = options.mode ?? DeployMode.CLOUD;
  const imageTag = options.imageTag ?? 'latest';
  const localPort = options.localPort ?? null;
  const swrOrg = options.swrOrg ?? null;
  const swrRepo = options.swrRepo ?? null;
  const description = options.description ?? null;
  const skipBuild = options.skipBuild ?? false;
  const skipSslVerification = options.skipSslVerification ?? false;

  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    echoError('Configuration file not found');
    console.print("[dim]Run 'agentarts config' to create configuration first[/dim]");
    return false;
  }

  const agentConfig = getAgent(agentName);
  if (agentConfig === null) {
    echoError(`Agent '${agentName || 'default'}' not found in configuration`);
    return false;
  }

  const actualAgentName = agentConfig.base.name || agentName || 'agent';
  const region = agentConfig.base.region || getRegion();
  const servicePort = agentConfig.runtime.invokeConfig ? agentConfig.runtime.invokeConfig.port : 8080;

  echoInfo(
    'Deploy Configuration',
    `[cyan]Agent:[/cyan] [white]${actualAgentName}[/white]\n[cyan]Mode:[/cyan] [yellow]${mode}[/yellow]\n[cyan]Region:[/cyan] [yellow]${region}[/yellow]`,
  );

  if (skipBuild && mode === DeployMode.LOCAL) {
    echoError('--skip-build is only supported for cloud mode');
    console.print('[dim]For local mode, you need to build the image first[/dim]');
    return false;
  }

  if (!skipBuild) {
    if (!(await checkDockerAvailable())) {
      echoError('Docker is not available or not running');
      console.print('[dim]Please start Docker and try again[/dim]');
      return false;
    }

    if (!checkDockerfileExists()) {
      echoError('Dockerfile not found in current directory');
      console.print("[dim]Run 'agentarts config' to generate Dockerfile first[/dim]");
      return false;
    }
  }

  // Declared here because both cloud branches assign it.
  let finalSwrImage: string;

  if (mode === DeployMode.LOCAL) {
    if (!(await checkDockerAvailable())) {
      echoError('Docker is not available or not running');
      console.print('[dim]Please start Docker and try again[/dim]');
      return false;
    }

    if (!checkDockerfileExists()) {
      echoError('Dockerfile not found in current directory');
      console.print("[dim]Run 'agentarts config' to generate Dockerfile first[/dim]");
      return false;
    }

    const localImageName = `${actualAgentName}`;
    const localFullImage = `${localImageName}:${imageTag}`;

    printProgressPanel(
      `[bold]Step 1/2[/bold] Building Docker image\n[dim]Image: ${localFullImage}[/dim]`,
    );
    if (!(await buildDockerImage(localImageName, imageTag))) {
      return false;
    }

    const localServicePort = localPort || servicePort;
    printProgressPanel(
      `[bold]Step 2/2[/bold] Starting local container\n[dim]Port: ${localServicePort}[/dim]`,
    );
    return runContainer(localImageName, imageTag, localServicePort, actualAgentName);
  }

  const verifySsl = !skipSslVerification;

  let configArtifactUrl: string | null = null;
  if (agentConfig.runtime && agentConfig.runtime.artifactSource) {
    configArtifactUrl = agentConfig.runtime.artifactSource.url;
  }

  if (skipBuild) {
    if (!configArtifactUrl) {
      echoError('No artifact URL found in configuration file');
      console.print(
        '[dim]When using --skip-build, you must set runtime.artifact_source.url in config file[/dim]',
      );
      console.print('[dim]Example:[/dim]');
      console.print('[dim]  runtime:[/dim]');
      console.print('[dim]    artifact_source:[/dim]');
      console.print('[dim]      url: swr.cn-north-4.myhuaweicloud.com/org/repo:v1.0[/dim]');
      return false;
    }

    finalSwrImage = configArtifactUrl;
    printProgressPanel(
      `[bold]Step 1/2[/bold] Using existing image\n[dim]URL: ${finalSwrImage}[/dim]`,
    );
    console.print('[dim]Skipping build and push (--skip-build enabled)[/dim]');
  } else {
    const finalSwrOrg = swrOrg || agentConfig.swrConfig.organization;
    const finalSwrRepo = swrRepo || agentConfig.swrConfig.repository;

    if (!finalSwrOrg || !finalSwrRepo) {
      echoError('SWR organization and repository must be configured');
      console.print('[dim]Specify via --swr-org and --swr-repo options, or configure in yaml[/dim]');
      return false;
    }

    if (configArtifactUrl) {
      finalSwrImage = configArtifactUrl;
      printProgressPanel(
        `[bold]Step 1/5[/bold] Using configured image URL\n[dim]URL: ${finalSwrImage}[/dim]`,
      );
      console.print('[dim]Using artifact_source.url from configuration file[/dim]');
    } else {
      if (!(await checkDockerAvailable())) {
        echoError('Docker is not available or not running');
        console.print('[dim]Please start Docker and try again[/dim]');
        return false;
      }

      if (!checkDockerfileExists()) {
        echoError('Dockerfile not found in current directory');
        console.print("[dim]Run 'agentarts config' to generate Dockerfile first[/dim]");
        return false;
      }

      const localImageName = `${actualAgentName}`;
      const localFullImage = `${localImageName}:${imageTag}`;

      printProgressPanel(
        `[bold]Step 1/5[/bold] Building Docker image\n[dim]Image: ${localFullImage}[/dim]`,
      );
      if (!(await buildDockerImage(localImageName, imageTag))) {
        return false;
      }

      printProgressPanel(
        `[bold]Step 2/5[/bold] Setting up SWR resources\n[dim]Organization: ${finalSwrOrg}\n[dim]Repository: ${finalSwrRepo}[/dim]`,
      );

      try {
        const swrClient = new SWRClient(region, null, verifySsl);

        if (agentConfig.swrConfig.organizationAutoCreate) {
          const orgResult = await swrClient.createOrGetOrganization(finalSwrOrg);
          if (orgResult === null) {
            echoError(`Failed to create/get organization '${finalSwrOrg}'`);
            return false;
          }
          echoSuccess(`Organization [cyan]${finalSwrOrg}[/cyan] ready`);
        } else {
          const orgResult = await swrClient.getOrganization(finalSwrOrg);
          if (orgResult === null) {
            echoError(`Organization '${finalSwrOrg}' not found`);
            console.print('[dim]Set organization_auto_create: true in config to auto-create[/dim]');
            return false;
          }
          echoSuccess(`Using existing organization [cyan]${finalSwrOrg}[/cyan]`);
        }

        if (agentConfig.swrConfig.repositoryAutoCreate) {
          const repoResult = await swrClient.createOrGetRepository(finalSwrOrg, finalSwrRepo);
          if (repoResult === null) {
            echoError(`Failed to create/get repository '${finalSwrOrg}/${finalSwrRepo}'`);
            return false;
          }
          echoSuccess(`Repository [cyan]${finalSwrOrg}/${finalSwrRepo}[/cyan] ready`);
        } else {
          const repoResult = await swrClient.getRepository(finalSwrOrg, finalSwrRepo);
          if (repoResult === null) {
            echoError(`Repository '${finalSwrOrg}/${finalSwrRepo}' not found`);
            console.print('[dim]Set repository_auto_create: true in config to auto-create[/dim]');
            return false;
          }
          echoSuccess(`Using existing repository [cyan]${finalSwrOrg}/${finalSwrRepo}[/cyan]`);
        }

        printProgressPanel(
          `[bold]Step 3/5[/bold] Getting SWR credentials\n[dim]Registry: swr.${region}.myhuaweicloud.com[/dim]`,
        );
        const [loginServer, username, password] = await swrClient.createSwrSecret();
        if (!username || !password) {
          echoError('Failed to get SWR credentials');
          return false;
        }

        if (!(await loginToRegistry(loginServer, username, password))) {
          echoError('Failed to login to SWR');
          return false;
        }

        finalSwrImage = swrClient.getFullImageName(finalSwrOrg, finalSwrRepo, imageTag);

        printProgressPanel(
          `[bold]Step 4/5[/bold] Tagging and pushing image\n[dim]Source: ${localFullImage}\n[dim]Target: ${finalSwrImage}[/dim]`,
        );
        if (!(await tagImage(localFullImage, finalSwrImage))) {
          echoError('Failed to tag image');
          return false;
        }

        if (!(await pushImage(finalSwrImage))) {
          echoError('Failed to push image to SWR');
          return false;
        }

        echoSuccess(`Image deployed to [cyan]${finalSwrImage}[/cyan]`);
      } catch (error) {
        echoError(`SWR deployment failed: ${errorMessage(error)}`);
        return false;
      }
    }
  }

  printProgressPanel(
    `[bold]Step 5/5[/bold] Creating AgentArts runtime\n[dim]Agent: ${actualAgentName}\n[dim]Image: ${finalSwrImage}[/dim]`,
  );
  const agent = await createAgentartsRuntime(actualAgentName, finalSwrImage, region, {
    agentConfig,
    description,
    verifySsl,
  });

  if (agent === null) {
    return false;
  }

  const runtimeId = agent['id'];

  const fullConfig = loadConfig();
  if (fullConfig) {
    const agentKey = agentName || fullConfig.defaultAgent || 'default';
    const existing = fullConfig.agents ?? {};
    if (Object.prototype.hasOwnProperty.call(existing, agentKey)) {
      existing[agentKey].runtime.agentId = runtimeId;
      fullConfig.toYaml(configPath);
    }
  }

  let summary =
    `[cyan]Agent Name:[/cyan] [white]${actualAgentName}[/white]\n` +
    `[cyan]Runtime ID:[/cyan] [white]${runtimeId}[/white]\n` +
    `[cyan]Image:[/cyan] [white]${finalSwrImage}[/white]\n` +
    `[cyan]Region:[/cyan] [yellow]${region}[/yellow]\n`;

  const versionDetail = agent['version_detail'] || {};
  const invokeConfigResponse = versionDetail['invoke_config'] || {};
  const accessEndpoint = invokeConfigResponse['access_endpoint'];
  if (accessEndpoint) {
    summary += `[cyan]Access Endpoint:[/cyan] [white]${accessEndpoint}[/white]`;
  }

  console.printPanel('[bold green] Deployment complete! [/bold green]', summary, {
    borderStyle: 'green',
  });

  return true;
}
