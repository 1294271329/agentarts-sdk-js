/**
 * Docker templates for AgentArts.
 *
 * Ported from `agentarts/toolkit/utils/templates/docker/__init__.py`. The
 * Java Dockerfile renderer (`render_java_dockerfile`) is intentionally not
 * ported: Java agent support was dropped from the Node.js port.
 */

import { TemplateNotFoundError } from '../manager.js';
import { getTemplateContent } from '../registry.js';

const DOCKERFILE_TEMPLATE = 'Dockerfile.j2';

/** Get the Dockerfile template content. */
export function getDockerfileTemplate(): string {
  const content = getTemplateContent('docker', DOCKERFILE_TEMPLATE);
  if (content === undefined) {
    throw new TemplateNotFoundError(
      `Template file not found: agentarts-sdk/toolkit/utils/templates/docker/${DOCKERFILE_TEMPLATE}`,
    );
  }
  return content;
}

/**
 * Render a Dockerfile from the template.
 *
 * @param baseImage Base Docker image.
 * @param dependencyFile Path to the dependency file (e.g. requirements.txt).
 * @param entrypoint Entrypoint in `module:function` form (e.g. `app:main`).
 * @param port Port to expose.
 * @param userName Non-root user name.
 * @param userId Non-root user ID.
 * @param groupId Non-root group ID.
 * @param region Huawei Cloud region (e.g. `cn-southwest-2`).
 */
export function renderDockerfile(
  baseImage = 'node:22-slim',
  dependencyFile: string | null = null,
  entrypoint: string | null = null,
  port = 8080,
  userName = 'appuser',
  userId = 1000,
  groupId = 1000,
  region: string | null = null,
): string {
  const template = getDockerfileTemplate();

  const envLines = ['# Set container environment marker', 'ENV DOCKER_CONTAINER=true'];
  if (region) {
    envLines.push(`ENV HUAWEICLOUD_SDK_REGION=${region}`);
  }
  const envSection = envLines.join('\n');

  const userSection = `# Create non-root user for security
RUN groupadd -g ${groupId} ${userName} && \\
    useradd -u ${userId} -g ${groupId} -m -s /bin/bash ${userName}`;

  const chownSection = `RUN chown ${userName}:${userName} /app`;

  const dependencySection = dependencyFile
    ? `COPY ${dependencyFile} .
RUN npm install --omit=dev`
    : '# No dependency file specified';

  // `COPY . .` keeps the build context's permission bits, so the modes come from
  // the build host's umask (EulerOS 0027 -> 0640/0750, Ubuntu 0022 -> 0644/0755).
  // chown alone only fixes ownership; without widening the modes, a runtime UID
  // other than appuser cannot read /app and the container fails to start.
  const chownAppSection = `RUN chown -R ${userName}:${userName} /app && \\
    chmod -R a+rX /app`;

  let cmdSection: string;
  if (entrypoint) {
    const module = entrypoint.includes(':') ? entrypoint.split(':')[0] : entrypoint;
    cmdSection = `CMD ["node", "--experimental-strip-types", "${module}.ts"]`;
  } else {
    cmdSection = `CMD ["node", "--experimental-strip-types", "agent.ts"]`;
  }

  const replacements: Readonly<Record<string, string>> = {
    base_image: baseImage,
    env_section: envSection,
    user_section: userSection,
    chown_section: chownSection,
    dependency_section: dependencySection,
    chown_app_section: chownAppSection,
    port: String(port),
    user_name: userName,
    cmd_section: cmdSection,
  };

  let content = template.replace(/\{([a-z_]+)\}/g, (match, key: string) =>
    key in replacements ? replacements[key] : match,
  );

  const lines = content.split('\n');
  const cleanedLines: string[] = [];
  let prevEmpty = false;
  for (const line of lines) {
    if (line.trim() === '') {
      if (!prevEmpty) {
        cleanedLines.push(line);
      }
      prevEmpty = true;
    } else {
      cleanedLines.push(line);
      prevEmpty = false;
    }
  }
  content = cleanedLines.join('\n');

  return content;
}
