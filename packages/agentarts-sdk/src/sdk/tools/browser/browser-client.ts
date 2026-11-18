/**
 * Client for interacting with the Browser sandbox service.
 *
 * Mirrors `agentarts/sdk/tools/browser/browser_client.py`. Supports creating,
 * listing, updating, getting and deleting browser resources, managing browser
 * profiles, and executing browser automation operations (navigation, clicks,
 * screenshots, etc.) in a managed sandbox environment.
 *
 * Control Plane:
 *     Manages the full lifecycle of browser resources
 *     (create, list, update, get, delete) and browser profiles
 *     (create, list, get, delete)
 *
 * Data Plane:
 *     Manages the full lifecycle of browser sessions
 *     (create, stop, get, invoke, update_stream)
 */

import {
  ControlBrowserHttpClient,
  DataBrowserHttpClient,
} from '../../service/tools-http.js';
import {
  getBrowserDataPlaneEndpoint,
  getControlPlaneEndpoint,
  getRegion,
} from '../../utils/constant.js';
import { getLogger } from '../../utils/logging.js';

const logger = getLogger('sdk.tools.browser.browser_client');

/** Default session timeout: 15 minutes. */
export const DEFAULT_SESSION_TIMEOUT = 900;

const ENV_HUAWEICLOUD_SDK_BROWSER_API_KEY = 'HUAWEICLOUD_SDK_BROWSER_API_KEY';

/** Supported browser action types (mirrors Python `ACTION_TYPES`). */
export const ACTION_TYPES = [
  'mouse_click',
  'mouse_move',
  'mouse_drag',
  'mouse_scroll',
  'key_press',
  'key_type',
  'key_shortcut',
  'navigate',
  'go_back',
  'go_forward',
  'refresh',
  'get_page_info',
  'screenshot',
  'wait',
  'list_tabs',
  'switch_tab',
  'close_tab',
  'new_tab',
] as const;

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const NAME_PATTERN = /^[a-z][a-z0-9-]{0,38}[a-z0-9]$/;
const API_KEY_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const SESSION_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

const NAME_RULE_MESSAGE =
  'Name must start with a lowercase letter, end with a lowercase letter or digit, ' +
  'contain only lowercase letters, digits, and hyphens, and be 2-40 characters long.';

const UUID_RULE_MESSAGE =
  'browser_id must be a valid UUID (e.g., 9ca9f2a6-18e4-4777-b23b-8c21e978a1ad).';

/** Drop `undefined`/`null` values, mirroring Python's dict-comprehension filtering. */
function _withoutNone(params: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}

/** Validate tag uniqueness/count, mirroring Python's tag checks. */
function _validateTags(tags: Array<Record<string, any>> | null): void {
  if (!tags) {
    return;
  }
  if (tags.length > 20) {
    throw new Error('tags must contain at most 20 items.');
  }
  const seenKeys = new Set<any>();
  for (const tag of tags) {
    const key = tag['key'];
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate tag key: ${key}. Tag keys must be unique.`);
    }
    seenKeys.add(key);
  }
}

/**
 * Client for interacting with the Browser sandbox service.
 *
 * This client handles the full lifecycle and method invocations for browser
 * sandbox sessions, providing interfaces for executing browser automation
 * operations, managing browser resources and profiles.
 */
export class Browser {
  /** Client for interacting with control plane API (browsers and profiles, AK/SK signed). */
  readonly controlPlaneClient: ControlBrowserHttpClient;
  /** Client for interacting with data plane API (sessions and operation execution). */
  readonly _dataPlaneClient: DataBrowserHttpClient;

  // Cached session state, populated by startSession and consumed by subsequent
  // data-plane calls so callers do not need to repeat the browser name /
  // session id / stream endpoints on every invocation.
  private _browserName: string | null = null;
  private _sessionId: string | null = null;
  private _automationEndpoint: string | null = null;
  private _liveViewEndpoint: string | null = null;

  /**
   * Initialize the browser client in the specified region.
   *
   * @param region The specified region. Falls back to the region resolved from
   *   environment variables when `null`.
   * @param dataEndpoint Data plane endpoint, optional. If not provided, it is
   *   retrieved from environment variable `AGENTARTS_BROWSER_DATA_ENDPOINT`.
   * @param authType Authentication type for the data plane, `"API_KEY"` or
   *   `"IAM"`. Defaults to `"API_KEY"`.
   * @param verifySsl SSL verification: `true` to verify, `false` to skip, or a
   *   string path to a CA bundle. Defaults to `true`.
   */
  constructor(
    region: string | null,
    dataEndpoint: string | null = null,
    authType = 'API_KEY',
    verifySsl: boolean | string = true,
  ) {
    const effectiveRegion = region || getRegion();

    // Control plane client for managing browser resources and profiles.
    this.controlPlaneClient = new ControlBrowserHttpClient(
      effectiveRegion,
      getControlPlaneEndpoint(effectiveRegion),
      verifySsl,
    );

    // Data plane client for managing browser sessions.
    // Priority: env var > constructor parameter > AGENTARTS_RUNTIME_DATA_ENDPOINT.
    const endpointUrl = getBrowserDataPlaneEndpoint(dataEndpoint);

    if (authType === 'IAM') {
      this._dataPlaneClient = new DataBrowserHttpClient(
        effectiveRegion,
        endpointUrl,
        authType,
        verifySsl,
      );
    } else {
      this._dataPlaneClient = new DataBrowserHttpClient(
        effectiveRegion,
        endpointUrl,
        'API_KEY',
        verifySsl,
      );
    }
  }

  // ------------------------------------------------------------------
  // Session-state accessors
  // ------------------------------------------------------------------

  /** Get the current browser name. */
  get browserName(): string | null {
    return this._browserName;
  }

  /** Set the current browser name. */
  set browserName(name: string | null) {
    this._browserName = name;
  }

  /** Get the current session ID. */
  get sessionId(): string | null {
    return this._sessionId;
  }

  /** Set the current session ID. */
  set sessionId(sessionId: string | null) {
    this._sessionId = sessionId;
  }

  /** Get the automation stream endpoint. */
  get automationEndpoint(): string | null {
    return this._automationEndpoint;
  }

  /** Get the live-view stream endpoint. */
  get liveViewEndpoint(): string | null {
    return this._liveViewEndpoint;
  }

  // ------------------------------------------------------------------
  // Control plane: browser resource management
  // ------------------------------------------------------------------

  /**
   * Create a browser resource through the control plane.
   *
   * @param name Browser name, unique within the account
   *   (`^[a-z][a-z0-9-]{0,38}[a-z0-9]$`, 2-40 chars).
   * @param authType Authentication type, `"API_KEY"` or `"IAM"`. Defaults to `"API_KEY"`.
   * @param apiKeyName API Key name; required when `authType` is `"API_KEY"`
   *   (`^[a-zA-Z0-9_-]{1,64}$`).
   * @param description Browser description, max 4096 characters.
   * @param executionAgencyName IAM agency name for cloud service access, 1-64 chars.
   * @param observability Observability configuration (logs, metrics, tracing).
   * @param networkConfig Outbound network configuration (`network_mode`, `vpc_config`).
   * @param agentGatewayId AgentGateway ID (UUID format); default gateway when omitted.
   * @param tags Resource tags, max 20 items, key must be unique.
   */
  async createBrowser(
    name: string,
    authType = 'API_KEY',
    apiKeyName: string | null = null,
    description: string | null = null,
    executionAgencyName: string | null = null,
    observability: Record<string, any> | null = null,
    networkConfig: Record<string, any> | null = null,
    agentGatewayId: string | null = null,
    tags: Array<Record<string, any>> | null = null,
  ): Promise<Record<string, any>> {
    logger.info(`Creating browser with name: ${name}`);

    // Validate name: same rule as CodeInterpreter resources.
    if (!NAME_PATTERN.test(name)) {
      throw new Error(NAME_RULE_MESSAGE);
    }

    // Validate auth_type is one of the allowed values.
    if (authType !== 'API_KEY' && authType !== 'IAM') {
      throw new Error('auth_type must be "API_KEY" or "IAM".');
    }

    // API_KEY auth requires an api_key_name.
    if (authType === 'API_KEY' && apiKeyName === null) {
      throw new Error('API_KEY auth_type requires api_key_name.');
    }

    // Validate api_key_name format when provided.
    if (apiKeyName && !API_KEY_NAME_PATTERN.test(apiKeyName)) {
      throw new Error(
        'api_key_name must match ^[a-zA-Z0-9_-]{1,64}$ ' +
          '(1-64 chars, alphanumeric, underscore, hyphen).',
      );
    }

    // Validate tags: max 20 items, key must be unique.
    _validateTags(tags);

    const requestParams: Record<string, any> = { name, auth_type: authType };

    if (apiKeyName) {
      requestParams['api_key_name'] = apiKeyName;
    }
    if (description) {
      requestParams['description'] = description;
    }
    if (executionAgencyName) {
      requestParams['execution_agency_name'] = executionAgencyName;
    }
    if (observability) {
      requestParams['observability'] = observability;
    }
    if (networkConfig) {
      requestParams['network_config'] = networkConfig;
    }
    if (agentGatewayId) {
      requestParams['agent_gateway_id'] = agentGatewayId;
    }
    if (tags) {
      requestParams['tags'] = tags;
    }

    return this.controlPlaneClient.createBrowser(requestParams);
  }

  /**
   * List browsers with optional filters and pagination.
   *
   * @param name Filter by browser name, 2-40 characters.
   * @param offset Pagination offset, default 0.
   * @param limit Page size, default 10.
   * @param sortKey Sort field: `"created_at"` or `"updated_at"`, default `"created_at"`.
   * @param sortDir Sort direction: `"asc"` or `"desc"`, default `"desc"`.
   * @param tagKeyExists Filter by tag key existence, max 10 keys.
   * @param tagKeyMatches Tag key match, must pair with `tagValueMatches`, max 10.
   * @param tagValueMatches Tag value match, must pair with `tagKeyMatches`, max 10.
   * @param tagMatchPolicy Tag match policy: `"ALL"` or `"ANY"`, default `"ALL"`.
   */
  async listBrowsers(
    name: string | null = null,
    offset = 0,
    limit = 10,
    sortKey = 'created_at',
    sortDir = 'desc',
    tagKeyExists: string[] | null = null,
    tagKeyMatches: string[] | null = null,
    tagValueMatches: string[] | null = null,
    tagMatchPolicy = 'ALL',
  ): Promise<Record<string, any>> {
    logger.info('Listing browsers');
    if (sortKey && sortKey !== 'created_at' && sortKey !== 'updated_at') {
      throw new Error("sort_key must be either 'created_at' or 'updated_at'");
    }
    if (sortDir && sortDir !== 'asc' && sortDir !== 'desc') {
      throw new Error("sort_dir must be either 'asc' or 'desc'");
    }

    // Validate name length: 2-40 characters.
    if (name != null && !(name.length >= 2 && name.length <= 40)) {
      throw new Error('name must be between 2 and 40 characters.');
    }

    // Validate tag_match_policy is one of the allowed values.
    if (tagMatchPolicy !== 'ALL' && tagMatchPolicy !== 'ANY') {
      throw new Error('tag_match_policy must be "ALL" or "ANY".');
    }

    // Validate tag filter arrays: max 10 items, items must be unique.
    const tagParams: Array<[string[] | null, string]> = [
      [tagKeyExists, 'tag_key_exists'],
      [tagKeyMatches, 'tag_key_matches'],
      [tagValueMatches, 'tag_value_matches'],
    ];
    for (const [tagParam, paramName] of tagParams) {
      if (tagParam != null) {
        if (tagParam.length > 10) {
          throw new Error(`${paramName} must contain at most 10 items.`);
        }
        if (new Set(tagParam).size !== tagParam.length) {
          throw new Error(`${paramName} must not contain duplicate items.`);
        }
      }
    }

    // tag_key_matches and tag_value_matches must be used together with equal length.
    if ((tagKeyMatches == null) !== (tagValueMatches == null)) {
      throw new Error('tag_key_matches and tag_value_matches must be used together.');
    }
    if (
      tagKeyMatches !== null &&
      tagValueMatches !== null &&
      tagKeyMatches.length !== tagValueMatches.length
    ) {
      throw new Error(
        'tag_key_matches and tag_value_matches must have the same number of items.',
      );
    }

    const requestParams: Record<string, any> = {
      name,
      limit,
      offset,
      sort_key: sortKey,
      sort_dir: sortDir,
      tag_key_exists: tagKeyExists,
      tag_key_matches: tagKeyMatches,
      tag_value_matches: tagValueMatches,
    };

    // Only include tag_match_policy when tag filters are actually used.
    const hasTagFilters = [tagKeyExists, tagKeyMatches, tagValueMatches].some(
      (param) => param != null,
    );
    if (hasTagFilters) {
      requestParams['tag_match_policy'] = tagMatchPolicy;
    }

    return this.controlPlaneClient.listBrowsers(_withoutNone(requestParams));
  }

  /** Get browser details by ID. */
  async getBrowser(browserId: string): Promise<Record<string, any>> {
    logger.info(`Getting browser ${browserId}`);
    if (!UUID_PATTERN.test(browserId)) {
      throw new Error(UUID_RULE_MESSAGE);
    }
    return this.controlPlaneClient.getBrowser(browserId);
  }

  /**
   * Update browser configuration. Only observability and tags can be updated.
   *
   * @param browserId Browser ID (UUID format).
   * @param observability Observability configuration, same structure as createBrowser.
   * @param tags Resource tags, max 20 items, key must be unique.
   */
  async updateBrowser(
    browserId: string,
    observability: Record<string, any> | null = null,
    tags: Array<Record<string, any>> | null = null,
  ): Promise<Record<string, any>> {
    logger.info(`Updating browser ${browserId}`);

    // Validate browser_id: UUID format (same as getBrowser).
    if (!UUID_PATTERN.test(browserId)) {
      throw new Error(UUID_RULE_MESSAGE);
    }

    // Validate tags: max 20 items, key must be unique (same as createBrowser).
    _validateTags(tags);

    const requestParams: Record<string, any> = {};
    if (observability) {
      requestParams['observability'] = observability;
    }
    if (tags) {
      requestParams['tags'] = tags;
    }

    return this.controlPlaneClient.updateBrowser(browserId, requestParams);
  }

  /** Delete a browser by ID. */
  async deleteBrowser(browserId: string): Promise<boolean> {
    logger.info(`Deleting browser ${browserId}`);

    // Validate browser_id: UUID format (same as getBrowser).
    if (!UUID_PATTERN.test(browserId)) {
      throw new Error(UUID_RULE_MESSAGE);
    }

    await this.controlPlaneClient.deleteBrowser(browserId);
    return true;
  }

  // ------------------------------------------------------------------
  // Control plane: browser profile management
  // ------------------------------------------------------------------

  /**
   * Create a browser profile.
   *
   * @param name Profile name, unique within the account
   *   (`^[a-z][a-z0-9-]{0,38}[a-z0-9]$`, 2-40 chars).
   * @param description Profile description, max 4096 characters.
   * @param tags Resource tags, max 20 items, key must be unique.
   */
  async createBrowserProfile(
    name: string,
    description: string | null = null,
    tags: Array<Record<string, any>> | null = null,
  ): Promise<Record<string, any>> {
    logger.info(`Creating browser profile with name: ${name}`);

    // Validate name: same rule as browser resources.
    if (!NAME_PATTERN.test(name)) {
      throw new Error(NAME_RULE_MESSAGE);
    }

    // Validate description length: max 4096 characters.
    if (description && description.length > 4096) {
      throw new Error('description must be at most 4096 characters.');
    }

    // Validate tags: max 20 items, key must be unique (same as createBrowser).
    _validateTags(tags);

    const requestParams: Record<string, any> = { name };
    if (description) {
      requestParams['description'] = description;
    }
    if (tags) {
      requestParams['tags'] = tags;
    }

    return this.controlPlaneClient.createBrowserProfile(requestParams);
  }

  /**
   * List browser profiles with optional filters and pagination.
   *
   * @param name Filter by profile name, 2-40 characters.
   * @param offset Pagination offset, default 0.
   * @param limit Page size, default 10.
   * @param sortKey Sort field: `"created_at"` or `"updated_at"`, default `"created_at"`.
   * @param sortDir Sort direction: `"asc"` or `"desc"`, default `"desc"`.
   * @param tagKeyExists Filter by tag key existence, max 10 keys.
   * @param tagKeyMatches Tag key match, must pair with `tagValueMatches`, max 10.
   * @param tagValueMatches Tag value match, must pair with `tagKeyMatches`, max 10.
   * @param tagMatchPolicy Tag match policy: `"ALL"` or `"ANY"`, default `"ALL"`.
   */
  async listBrowserProfiles(
    name: string | null = null,
    offset = 0,
    limit = 10,
    sortKey = 'created_at',
    sortDir = 'desc',
    tagKeyExists: string[] | null = null,
    tagKeyMatches: string[] | null = null,
    tagValueMatches: string[] | null = null,
    tagMatchPolicy = 'ALL',
  ): Promise<Record<string, any>> {
    logger.info('Listing browser profiles');
    if (sortKey && sortKey !== 'created_at' && sortKey !== 'updated_at') {
      throw new Error("sort_key must be either 'created_at' or 'updated_at'");
    }
    if (sortDir && sortDir !== 'asc' && sortDir !== 'desc') {
      throw new Error("sort_dir must be either 'asc' or 'desc'");
    }

    // Validate name length: 2-40 characters.
    if (name != null && !(name.length >= 2 && name.length <= 40)) {
      throw new Error('name must be between 2 and 40 characters.');
    }

    // Validate tag_match_policy is one of the allowed values.
    if (tagMatchPolicy !== 'ALL' && tagMatchPolicy !== 'ANY') {
      throw new Error('tag_match_policy must be "ALL" or "ANY".');
    }

    // Validate tag filter arrays: max 10 items, items must be unique.
    const tagParams: Array<[string[] | null, string]> = [
      [tagKeyExists, 'tag_key_exists'],
      [tagKeyMatches, 'tag_key_matches'],
      [tagValueMatches, 'tag_value_matches'],
    ];
    for (const [tagParam, paramName] of tagParams) {
      if (tagParam != null) {
        if (tagParam.length > 10) {
          throw new Error(`${paramName} must contain at most 10 items.`);
        }
        if (new Set(tagParam).size !== tagParam.length) {
          throw new Error(`${paramName} must not contain duplicate items.`);
        }
      }
    }

    // tag_key_matches and tag_value_matches must be used together with equal length.
    if ((tagKeyMatches == null) !== (tagValueMatches == null)) {
      throw new Error('tag_key_matches and tag_value_matches must be used together.');
    }
    if (
      tagKeyMatches !== null &&
      tagValueMatches !== null &&
      tagKeyMatches.length !== tagValueMatches.length
    ) {
      throw new Error(
        'tag_key_matches and tag_value_matches must have the same number of items.',
      );
    }

    const requestParams: Record<string, any> = {
      name,
      limit,
      offset,
      sort_key: sortKey,
      sort_dir: sortDir,
      tag_key_exists: tagKeyExists,
      tag_key_matches: tagKeyMatches,
      tag_value_matches: tagValueMatches,
    };

    // Only include tag_match_policy when tag filters are actually used.
    const hasTagFilters = [tagKeyExists, tagKeyMatches, tagValueMatches].some(
      (param) => param != null,
    );
    if (hasTagFilters) {
      requestParams['tag_match_policy'] = tagMatchPolicy;
    }

    return this.controlPlaneClient.listBrowserProfiles(_withoutNone(requestParams));
  }

  /** Get browser profile details by ID. */
  async getBrowserProfile(profileId: string): Promise<Record<string, any>> {
    logger.info(`Getting browser profile ${profileId}`);

    // Validate profile_id: UUID format (same as browser_id).
    if (!UUID_PATTERN.test(profileId)) {
      throw new Error(
        'profile_id must be a valid UUID (e.g., 9ca9f2a6-18e4-4777-b23b-8c21e978a1ad).',
      );
    }
    return this.controlPlaneClient.getBrowserProfile(profileId);
  }

  /** Delete a browser profile by ID. */
  async deleteBrowserProfile(profileId: string): Promise<boolean> {
    logger.info(`Deleting browser profile ${profileId}`);

    // Validate profile_id: UUID format (same as browser_id).
    if (!UUID_PATTERN.test(profileId)) {
      throw new Error(
        'profile_id must be a valid UUID (e.g., 9ca9f2a6-18e4-4777-b23b-8c21e978a1ad).',
      );
    }

    await this.controlPlaneClient.deleteBrowserProfile(profileId);
    return true;
  }

  // ------------------------------------------------------------------
  // Data plane: session management
  // ------------------------------------------------------------------

  /**
   * Start a browser session and cache the session metadata.
   *
   * @param browserName Name of the browser resource.
   * @param sessionName Session name specified by the client.
   * @param sessionId Optional session ID specified by the client; the server
   *   generates one when `null`.
   * @param viewport Optional viewport configuration.
   * @param profileConfiguration Optional profile configuration.
   * @param allowedDomains Optional list of allowed domain patterns.
   * @param blockedDomains Optional list of blocked domain patterns.
   * @param proxyConfiguration Optional proxy configuration.
   * @param sessionTimeout Session timeout in seconds, default 900 (15 minutes).
   * @param apiKey API Key for authentication; read from environment variable
   *   `HUAWEICLOUD_SDK_BROWSER_API_KEY` when not provided.
   */
  async startSession(
    browserName: string,
    sessionName: string,
    sessionId: string | null = null,
    viewport: Record<string, any> | null = null,
    profileConfiguration: Record<string, any> | null = null,
    allowedDomains: string[] | null = null,
    blockedDomains: string[] | null = null,
    proxyConfiguration: Record<string, any> | null = null,
    sessionTimeout = DEFAULT_SESSION_TIMEOUT,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    logger.info(`Starting session for browser: ${browserName}`);

    // Validate session_name.
    if (!SESSION_NAME_PATTERN.test(sessionName)) {
      throw new Error(
        'session_name must contain only letters, digits, underscores, and hyphens, ' +
          'and be 1-128 characters long.',
      );
    }

    // allowed_domains and blocked_domains are mutually exclusive.
    if (allowedDomains && blockedDomains) {
      throw new Error('allowed_domains and blocked_domains cannot be set at the same time.');
    }

    const requestParams: Record<string, any> = {
      name: sessionName,
      session_timeout: sessionTimeout,
    };
    if (viewport) {
      requestParams['viewport'] = viewport;
    }
    if (profileConfiguration) {
      requestParams['profile_configuration'] = profileConfiguration;
    }
    if (allowedDomains) {
      requestParams['allowed_domains'] = allowedDomains;
    }
    if (blockedDomains) {
      requestParams['blocked_domains'] = blockedDomains;
    }
    if (proxyConfiguration) {
      requestParams['proxy_configuration'] = proxyConfiguration;
    }

    let result: Record<string, any>;
    if (this._dataPlaneClient.openAkSk) {
      result = await this._dataPlaneClient.startSession(browserName, requestParams, sessionId);
    } else {
      const resolvedApiKey = apiKey || process.env[ENV_HUAWEICLOUD_SDK_BROWSER_API_KEY];
      if (!resolvedApiKey) {
        throw new Error('API Key is not provided and not found in environment variable.');
      }
      result = await this._dataPlaneClient.startSession(
        browserName,
        requestParams,
        sessionId,
        resolvedApiKey,
      );
    }

    this._browserName = (result['browser_name'] ?? null) as string | null;
    this._sessionId = (result['session_id'] ?? null) as string | null;

    const streams = (result['streams'] ?? {}) as Record<string, any>;
    this._automationEndpoint =
      ((streams['automation_stream'] ?? {}) as Record<string, any>)['stream_endpoint'] ?? null;
    this._liveViewEndpoint =
      ((streams['live_view_stream'] ?? {}) as Record<string, any>)['stream_endpoint'] ?? null;

    return result;
  }

  /**
   * Stop the current browser session.
   *
   * If no active session exists, returns `true` immediately (no-op).
   */
  async stopSession(apiKey: string | null = null): Promise<boolean> {
    if (!this._sessionId || !this._browserName) {
      return true;
    }

    logger.info('Stopping browser session...');
    if (this._dataPlaneClient.openAkSk) {
      await this._dataPlaneClient.stopSession(this._browserName, this._sessionId);
    } else {
      const resolvedApiKey = apiKey || process.env[ENV_HUAWEICLOUD_SDK_BROWSER_API_KEY];
      if (!resolvedApiKey) {
        throw new Error('API Key is not provided and not found in environment variable.');
      }
      await this._dataPlaneClient.stopSession(this._browserName, this._sessionId, resolvedApiKey);
    }

    this._sessionId = null;
    this._browserName = null;
    this._automationEndpoint = null;
    this._liveViewEndpoint = null;

    return true;
  }

  /** Get the current browser session details. Requires an active session. */
  async getSession(apiKey: string | null = null): Promise<Record<string, any>> {
    logger.info('Getting browser session...');

    if (!this._sessionId || !this._browserName) {
      throw new Error('No active session. Call start_session first.');
    }
    if (this._dataPlaneClient.openAkSk) {
      return this._dataPlaneClient.getSession(this._browserName, this._sessionId);
    }
    const resolvedApiKey = apiKey || process.env[ENV_HUAWEICLOUD_SDK_BROWSER_API_KEY];
    if (!resolvedApiKey) {
      throw new Error('API Key is not provided and not found in environment variable.');
    }
    return this._dataPlaneClient.getSession(this._browserName, this._sessionId, resolvedApiKey);
  }

  // ------------------------------------------------------------------
  // Data plane: browser operations
  // ------------------------------------------------------------------

  /** Save current browser session state to a profile. */
  async saveProfile(profileId: string, apiKey: string | null = null): Promise<Record<string, any>> {
    logger.info('Saving browser profile...');

    if (!this._sessionId || !this._browserName) {
      throw new Error('No active session. Call start_session first.');
    }

    if (this._dataPlaneClient.openAkSk) {
      return this._dataPlaneClient.saveProfile(this._browserName, this._sessionId, profileId);
    }
    const resolvedApiKey = apiKey || process.env[ENV_HUAWEICLOUD_SDK_BROWSER_API_KEY];
    if (!resolvedApiKey) {
      throw new Error('API Key is not provided and not found in environment variable.');
    }
    return this._dataPlaneClient.saveProfile(
      this._browserName,
      this._sessionId,
      profileId,
      resolvedApiKey,
    );
  }

  // ------------------------------------------------------------------
  // Data plane: stream management
  // ------------------------------------------------------------------

  /**
   * Update the browser session stream status (human handoff control).
   *
   * @param streamStatus Stream status, `"disabled"` or `"enabled"`.
   * @param clientToken Optional client token for idempotency.
   * @param apiKey API Key for authentication.
   */
  async updateStream(
    streamStatus: string,
    clientToken: string | null = null,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    logger.info(`Updating stream status to '${streamStatus}'...`);

    if (!this._sessionId || !this._browserName) {
      throw new Error('No active session. Call start_session first.');
    }

    if (streamStatus !== 'disabled' && streamStatus !== 'enabled') {
      throw new Error('stream_status must be "disabled" or "enabled".');
    }
    if (this._dataPlaneClient.openAkSk) {
      return this._dataPlaneClient.updateStream(
        this._browserName,
        this._sessionId,
        streamStatus,
        clientToken,
      );
    }
    const resolvedApiKey = apiKey || process.env[ENV_HUAWEICLOUD_SDK_BROWSER_API_KEY];
    if (!resolvedApiKey) {
      throw new Error('API Key is not provided and not found in environment variable.');
    }
    return this._dataPlaneClient.updateStream(
      this._browserName,
      this._sessionId,
      streamStatus,
      clientToken,
      resolvedApiKey,
    );
  }

  /** Take human control of the browser (disable automation). */
  async takeControl(
    clientToken: string | null = null,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    return this.updateStream('disabled', clientToken, apiKey);
  }

  /** Release human control of the browser (enable automation). */
  async releaseControl(
    clientToken: string | null = null,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    return this.updateStream('enabled', clientToken, apiKey);
  }

  /**
   * Generate the WebSocket URL and headers for the automation stream.
   *
   * Does not send an HTTP request: the URL is the `stream_endpoint` cached from
   * {@link startSession}'s `streams.automation_stream`.
   */
  async generateAutomationUrl(
    apiKey: string | null = null,
  ): Promise<[string, Record<string, string>]> {
    if (!this._sessionId || !this._automationEndpoint) {
      throw new Error('No active session. Call start_session first.');
    }

    const automationWsUrl = this._automationEndpoint;
    const automationWsHeaders = await this._dataPlaneClient.buildWsHeaders(
      this._sessionId,
      automationWsUrl,
      apiKey,
    );
    return [automationWsUrl, automationWsHeaders];
  }

  /**
   * Generate the WebSocket URL and headers for the live-view stream.
   *
   * Does not send an HTTP request: the URL is the `stream_endpoint` cached from
   * {@link startSession}'s `streams.live_view_stream`.
   */
  async generateLiveViewUrl(apiKey: string | null = null): Promise<[string, Record<string, string>]> {
    if (!this._sessionId || !this._liveViewEndpoint) {
      throw new Error('No active session. Call start_session first.');
    }

    const liveViewWsUrl = this._liveViewEndpoint;
    const liveViewWsHeaders = await this._dataPlaneClient.buildWsHeaders(
      this._sessionId,
      liveViewWsUrl,
      apiKey,
    );
    return [liveViewWsUrl, liveViewWsHeaders];
  }

  // ------------------------------------------------------------------
  // Data plane: browser operations
  // ------------------------------------------------------------------

  /**
   * Invoke a browser operation.
   *
   * All browser operations (navigate, click, screenshot, etc.) are dispatched
   * through this single entry point.
   *
   * @param type Action type, one of {@link ACTION_TYPES}.
   * @param action Action parameters (e.g. `{ x: 312, y: 482 }`).
   * @param apiKey API Key for authentication.
   */
  async invoke(
    type: string,
    action: Record<string, any>,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    logger.info('Invoking browser operation...');

    if (!(ACTION_TYPES as readonly string[]).includes(type)) {
      throw new Error(`Unsupported action type: ${type}.`);
    }

    if (!this._sessionId || !this._browserName) {
      throw new Error('No active session. Call start_session first.');
    }

    if (this._dataPlaneClient.openAkSk) {
      return this._dataPlaneClient.invoke(this._browserName, this._sessionId, type, action);
    }
    const resolvedApiKey = apiKey || process.env[ENV_HUAWEICLOUD_SDK_BROWSER_API_KEY];
    if (!resolvedApiKey) {
      throw new Error('API Key is not provided and not found in environment variable.');
    }
    return this._dataPlaneClient.invoke(
      this._browserName,
      this._sessionId,
      type,
      action,
      resolvedApiKey,
    );
  }

  // ------------------------------------------------------------------
  // Convenience methods — each maps to an invoke action
  // ------------------------------------------------------------------

  /**
   * Click the mouse at the specified position.
   *
   * @param x X coordinate.
   * @param y Y coordinate.
   * @param button Mouse button: `"left"`, `"right"` or `"middle"`.
   * @param clickCount Number of clicks. Defaults to 1.
   * @param apiKey API Key for authentication.
   */
  async mouseClick(
    x: number,
    y: number,
    button = 'left',
    clickCount = 1,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    return this.invoke(
      'mouse_click',
      { x, y, button, click_count: clickCount },
      apiKey,
    );
  }

  /** Left mouse click at the specified position. */
  async leftMouseClick(
    x: number,
    y: number,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    return this.mouseClick(x, y, 'left', 1, apiKey);
  }

  /** Right mouse click at the specified position. */
  async rightMouseClick(
    x: number,
    y: number,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    return this.mouseClick(x, y, 'right', 1, apiKey);
  }

  /** Double mouse click at the specified position. */
  async doubleMouseClick(
    x: number,
    y: number,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    return this.mouseClick(x, y, 'left', 2, apiKey);
  }

  /** Move the mouse to the specified position. */
  async mouseMove(
    x: number,
    y: number,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    return this.invoke('mouse_move', { x, y }, apiKey);
  }

  /**
   * Drag the mouse from one position to another.
   *
   * @param startX Start X coordinate.
   * @param startY Start Y coordinate.
   * @param endX End X coordinate.
   * @param endY End Y coordinate.
   * @param button Mouse button: `"left"`, `"right"` or `"middle"`.
   * @param apiKey API Key for authentication.
   */
  async mouseDrag(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    button = 'left',
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    if (button !== 'left' && button !== 'right' && button !== 'middle') {
      throw new Error('button must be "left", "right", or "middle".');
    }

    return this.invoke(
      'mouse_drag',
      { start_x: startX, start_y: startY, end_x: endX, end_y: endY, button },
      apiKey,
    );
  }

  /**
   * Scroll at the specified position.
   *
   * @param x X coordinate of the scroll position.
   * @param y Y coordinate of the scroll position.
   * @param deltaX Optional horizontal scroll amount in pixels.
   * @param deltaY Optional vertical scroll amount in pixels.
   * @param apiKey API Key for authentication.
   */
  async mouseScroll(
    x: number,
    y: number,
    deltaX: number | null = null,
    deltaY: number | null = null,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    const action: Record<string, any> = { x, y };
    if (deltaX != null) {
      action['delta_x'] = deltaX;
    }
    if (deltaY != null) {
      action['delta_y'] = deltaY;
    }
    return this.invoke('mouse_scroll', action, apiKey);
  }

  /**
   * Press a key.
   *
   * @param key Key name (e.g. `"Enter"`, `"Tab"`, `"a"`).
   * @param presses Number of times to press the key, 1-100. Defaults to 1.
   * @param apiKey API Key for authentication.
   */
  async keyPress(
    key: string,
    presses = 1,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    if (!(presses >= 1 && presses <= 100)) {
      throw new Error('presses must be between 1 and 100.');
    }

    return this.invoke('key_press', { key, presses }, apiKey);
  }

  /** Type text into the focused element. */
  async keyType(text: string, apiKey: string | null = null): Promise<Record<string, any>> {
    return this.invoke('key_type', { text }, apiKey);
  }

  /**
   * Press a key combination (multiple keys simultaneously).
   *
   * @param keys List of key names, max 5 keys (e.g. `["Control", "c"]`).
   * @param apiKey API Key for authentication.
   */
  async keyShortcut(keys: string[], apiKey: string | null = null): Promise<Record<string, any>> {
    if (!keys || keys.length < 1 || keys.length > 5) {
      throw new Error('keys must contain 1 to 5 items.');
    }

    return this.invoke('key_shortcut', { keys }, apiKey);
  }

  /** Navigate to a URL. */
  async navigate(url: string, apiKey: string | null = null): Promise<Record<string, any>> {
    return this.invoke('navigate', { url }, apiKey);
  }

  /** Go back to the previous page. */
  async goBack(apiKey: string | null = null): Promise<Record<string, any>> {
    return this.invoke('go_back', {}, apiKey);
  }

  /** Go forward to the next page. */
  async goForward(apiKey: string | null = null): Promise<Record<string, any>> {
    return this.invoke('go_forward', {}, apiKey);
  }

  /** Refresh the current page. */
  async refresh(apiKey: string | null = null): Promise<Record<string, any>> {
    return this.invoke('refresh', {}, apiKey);
  }

  /** Get information about the current page. */
  async getPageInfo(apiKey: string | null = null): Promise<Record<string, any>> {
    return this.invoke('get_page_info', {}, apiKey);
  }

  /**
   * Take a screenshot of the current page.
   *
   * @param format Image format: `"png"` or `"jpeg"`. Defaults to `"jpeg"`.
   * @param quality JPEG compression quality, 1-100. Only effective when format
   *   is `"jpeg"`. Defaults to 80.
   * @param fullPage Whether to capture the full page. Defaults to `false`.
   * @param apiKey API Key for authentication.
   */
  async screenshot(
    format = 'jpeg',
    quality = 80,
    fullPage = false,
    apiKey: string | null = null,
  ): Promise<Record<string, any>> {
    if (format !== 'png' && format !== 'jpeg') {
      throw new Error('format must be "png" or "jpeg".');
    }
    if (!(quality >= 1 && quality <= 100)) {
      throw new Error('quality must be between 1 and 100.');
    }

    return this.invoke('screenshot', { format, quality, full_page: fullPage }, apiKey);
  }

  /**
   * Wait for a specified duration.
   *
   * @param duration Wait duration in seconds, 0.1 to 30.
   * @param apiKey API Key for authentication.
   */
  async wait(duration: number, apiKey: string | null = null): Promise<Record<string, any>> {
    if (!(duration >= 0.1 && duration <= 30)) {
      throw new Error('duration must be between 0.1 and 30.');
    }

    return this.invoke('wait', { duration }, apiKey);
  }

  /** List all open tabs. */
  async listTabs(apiKey: string | null = null): Promise<Record<string, any>> {
    return this.invoke('list_tabs', {}, apiKey);
  }

  /** Switch to a specific tab. */
  async switchTab(tabId: string, apiKey: string | null = null): Promise<Record<string, any>> {
    return this.invoke('switch_tab', { tab_id: tabId }, apiKey);
  }

  /**
   * Close a tab.
   *
   * @param tabId Target tab ID; closes the current tab when not provided.
   * @param apiKey API Key for authentication.
   */
  async closeTab(tabId: string | null = null, apiKey: string | null = null): Promise<Record<string, any>> {
    const action: Record<string, any> = {};
    if (tabId != null) {
      action['tab_id'] = tabId;
    }
    return this.invoke('close_tab', action, apiKey);
  }

  /**
   * Open a new tab.
   *
   * @param url URL to open in the new tab; opens a blank page when not provided.
   * @param apiKey API Key for authentication.
   */
  async newTab(url: string | null = null, apiKey: string | null = null): Promise<Record<string, any>> {
    const action: Record<string, any> = {};
    if (url != null) {
      action['url'] = url;
    }
    return this.invoke('new_tab', action, apiKey);
  }
}

/**
 * Browser session, the Node.js equivalent of Python's `browser_session`
 * context manager.
 *
 * Python's `with browser_session(...) as browser:` maps to:
 *
 * ```ts
 * for await (const browser of browserSession('cn-southwest-2', 'my-browser', 'my-session')) {
 *   await browser.navigate('https://example.com');
 * }
 * ```
 *
 * or to the explicit lifecycle (`enter()` / `exit()`), or to
 * {@link withBrowserSession} for a callback form.
 */
export class BrowserSession implements AsyncIterable<Browser> {
  /** The browser client bound to this session. */
  readonly client: Browser;

  private readonly _options: BrowserSessionOptions;

  constructor(client: Browser, options: BrowserSessionOptions) {
    this.client = client;
    this._options = options;
  }

  /** Start the session (Python `__enter__`). Starts it only once. */
  async enter(): Promise<Browser> {
    if (!this.client.sessionId) {
      await this.client.startSession(
        this._options.browserName,
        this._options.sessionName,
        this._options.sessionId ?? null,
        this._options.viewport ?? null,
        this._options.profileConfiguration ?? null,
        this._options.allowedDomains ?? null,
        this._options.blockedDomains ?? null,
        this._options.proxyConfiguration ?? null,
        this._options.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT,
        this._options.apiKey ?? null,
      );
    }
    return this.client;
  }

  /** Stop the session (Python `__exit__`); a no-op when no session is active. */
  async exit(): Promise<void> {
    await this.client.stopSession(this._options.apiKey ?? null);
  }

  /** Yield the client, starting the session on enter and stopping it on exit. */
  async *[Symbol.asyncIterator](): AsyncGenerator<Browser, void, undefined> {
    try {
      yield await this.enter();
    } finally {
      await this.exit();
    }
  }
}

/** Options bundle used internally by {@link BrowserSession}. */
export interface BrowserSessionOptions {
  browserName: string;
  sessionName: string;
  sessionId?: string | null;
  viewport?: Record<string, any> | null;
  profileConfiguration?: Record<string, any> | null;
  allowedDomains?: string[] | null;
  blockedDomains?: string[] | null;
  proxyConfiguration?: Record<string, any> | null;
  sessionTimeout?: number;
  apiKey?: string | null;
}

/**
 * Browser session context manager: starts a session on enter and automatically
 * stops it on exit.
 *
 * @param region Region name, e.g. `"cn-southwest-2"`.
 * @param browserName Browser resource name.
 * @param sessionName Session name specified by the client.
 * @param sessionId Optional session ID specified by the client.
 * @param authType Authentication type, `"API_KEY"` or `"IAM"`. Defaults to `"API_KEY"`.
 * @param apiKey API Key for authentication (API_KEY mode).
 * @param verifySsl SSL verification: `true` to verify, `false` to skip, or a
 *   string path to a CA bundle. Defaults to `true`.
 * @param viewport Optional viewport configuration.
 * @param profileConfiguration Optional browser profile configuration.
 * @param allowedDomains Optional list of allowed domain patterns.
 * @param blockedDomains Optional list of blocked domain patterns (mutually
 *   exclusive with `allowedDomains`).
 * @param proxyConfiguration Optional proxy configuration.
 * @param sessionTimeout Session timeout in seconds. Defaults to 900.
 */
export function browserSession(
  region: string,
  browserName: string,
  sessionName: string,
  sessionId: string | null = null,
  authType = 'API_KEY',
  apiKey: string | null = null,
  verifySsl: boolean | string = true,
  viewport: Record<string, any> | null = null,
  profileConfiguration: Record<string, any> | null = null,
  allowedDomains: string[] | null = null,
  blockedDomains: string[] | null = null,
  proxyConfiguration: Record<string, any> | null = null,
  sessionTimeout = DEFAULT_SESSION_TIMEOUT,
): BrowserSession {
  const client = new Browser(region, null, authType, verifySsl);
  return new BrowserSession(client, {
    browserName,
    sessionName,
    sessionId,
    viewport,
    profileConfiguration,
    allowedDomains,
    blockedDomains,
    proxyConfiguration,
    sessionTimeout,
    apiKey,
  });
}

/**
 * Run a callback with an active browser session.
 *
 * Node.js equivalent of Python's `with browser_session(...) as browser:`; the
 * session is stopped when the callback finishes, even if it throws.
 */
export async function withBrowserSession<T>(
  region: string,
  browserName: string,
  sessionName: string,
  fn: (browser: Browser) => Promise<T> | T,
  sessionId: string | null = null,
  authType = 'API_KEY',
  apiKey: string | null = null,
  verifySsl: boolean | string = true,
  viewport: Record<string, any> | null = null,
  profileConfiguration: Record<string, any> | null = null,
  allowedDomains: string[] | null = null,
  blockedDomains: string[] | null = null,
  proxyConfiguration: Record<string, any> | null = null,
  sessionTimeout = DEFAULT_SESSION_TIMEOUT,
): Promise<T> {
  const session = browserSession(
    region,
    browserName,
    sessionName,
    sessionId,
    authType,
    apiKey,
    verifySsl,
    viewport,
    profileConfiguration,
    allowedDomains,
    blockedDomains,
    proxyConfiguration,
    sessionTimeout,
  );
  await session.enter();
  try {
    return await fn(session.client);
  } finally {
    await session.exit();
  }
}
