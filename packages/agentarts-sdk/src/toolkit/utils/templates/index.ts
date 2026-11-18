/**
 * AgentArts project templates.
 *
 * Ported from `agentarts/toolkit/utils/templates/__init__.py`.
 */

export {
  TEMPLATES_DIR,
  TemplateManager,
  TemplateNotFoundError,
  templateManager,
} from './manager.js';
export {
  AGENT_TEMPLATE_TYPES,
  DOCKER_TEMPLATE_TYPE,
  TEMPLATES,
  UNSUPPORTED_TEMPLATE_TYPES,
  getTemplateContent,
  hasTemplate,
  listTemplateTypes,
  type TemplateFiles,
} from './registry.js';
