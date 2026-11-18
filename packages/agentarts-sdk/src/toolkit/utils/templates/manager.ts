/**
 * Template manager for AgentArts projects.
 *
 * Ported from `agentarts/toolkit/utils/templates/manager.py`. Python reads the
 * `.j2` files from the package directory at runtime; because `tsc` does not copy
 * non-TS assets (and `package.json` must not gain an asset-copy build step), the
 * template text lives in `registry.ts` and is looked up there instead.
 */

import { posix } from 'node:path';

import { NODE_TEMPLATES } from './node-templates.js';
import { getTemplateContent, listTemplateTypes } from './registry.js';

/**
 * Logical template directory, used for `getTemplatePath()` and error messages.
 *
 * The templates are inlined (see `registry.ts`), so this path is descriptive
 * rather than a real directory on disk.
 */
export const TEMPLATES_DIR = 'agentarts-sdk/toolkit/utils/templates';

/**
 * Raised when a template is not available.
 *
 * Counterpart of Python's `FileNotFoundError`: `code` is `ENOENT` so callers can
 * detect it the same way Node reports a missing file.
 */
export class TemplateNotFoundError extends Error {
  readonly code = 'ENOENT';

  constructor(message: string) {
    super(message);
    this.name = 'TemplateNotFoundError';
  }
}

/** Manager for project templates. */
export class TemplateManager {
  readonly templatesDir: string;

  constructor(templatesDir: string = TEMPLATES_DIR) {
    this.templatesDir = templatesDir;
  }

  /**
   * Get the (logical) path to a template file.
   *
   * @param templateType Template type (basic, langchain, langgraph, docker).
   * @param filename Template filename (e.g. `agent.py.j2`).
   */
  getTemplatePath(templateType: string, filename: string): string {
    return posix.join(this.templatesDir, templateType, filename);
  }

  /**
   * Load a template file content.
   *
   * @throws {TemplateNotFoundError} When the template is not available.
   */
  loadTemplate(templateType: string, filename: string): string {
    const content = getTemplateContent(templateType, filename);
    if (content === undefined) {
      throw new TemplateNotFoundError(
        `Template file not found: ${this.getTemplatePath(templateType, filename)}`,
      );
    }
    return content;
  }

  /**
   * Render a template with context variables.
   *
   * Python's "Jinja2" usage is a plain `{{ key }}` string replacement (see
   * `manager.py`), so the same substitution is implemented here — no template
   * engine is involved.
   *
   * @param templateType Template type.
   * @param filename Template filename.
   * @param context Variables to substitute (in `{{ key }}` form).
   */
  renderTemplate(
    templateType: string,
    filename: string,
    context?: Record<string, any> | null,
  ): string {
    let content = this.loadTemplate(templateType, filename);
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        content = content.split(`{{ ${key} }}`).join(pythonStr(value));
      }
    }
    return content;
  }

  /**
   * Render the `agent.py` template.
   *
   * @param templateType Template type.
   * @param agentName Agent name.
   */
  renderAgentTemplate(templateType: string, agentName: string): string {
    return this.renderTemplate(templateType, 'agent.py.j2', { name: agentName });
  }

  /**
   * Render the `requirements.txt` template.
   *
   * @param templateType Template type.
   */
  renderRequirementsTemplate(templateType: string): string {
    return this.renderTemplate(templateType, 'requirements.txt.j2');
  }

  /**
   * Render the TypeScript `agent.ts` template (`agentarts init` output).
   *
   * @param templateType Template type (basic, langchain, langgraph).
   * @param agentName Agent name.
   */
  renderNodeAgentTemplate(templateType: string, agentName: string): string {
    const template = NODE_TEMPLATES[templateType];
    if (!template) {
      throw new TemplateNotFoundError(
        `Template file not found: ${this.getTemplatePath(templateType, 'agent.ts')}`,
      );
    }
    return template.agentTs.split('{{ name }}').join(agentName);
  }

  /**
   * Render the `package.json` template (`agentarts init` output).
   *
   * @param templateType Template type (basic, langchain, langgraph).
   * @param agentName Agent name.
   */
  renderPackageJsonTemplate(templateType: string, agentName: string): string {
    const template = NODE_TEMPLATES[templateType];
    if (!template) {
      throw new TemplateNotFoundError(
        `Template file not found: ${this.getTemplatePath(templateType, 'package.json')}`,
      );
    }
    return template.packageJson.split('{{ name }}').join(agentName);
  }

  /**
   * List available template types (sorted, `docker` excluded).
   *
   * Only the ported template types are listed: `google-adk`, `java-basic` and
   * `java-agentscope` were dropped from the Node.js port.
   */
  listTemplates(): string[] {
    return listTemplateTypes();
  }
}

/** Convert a context value the way Python's `str()` does for primitives. */
function pythonStr(value: any): string {
  if (value === null || value === undefined) {
    return 'None';
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  return String(value);
}

/** Shared template manager (Python `template_manager`). */
export const templateManager = new TemplateManager();
