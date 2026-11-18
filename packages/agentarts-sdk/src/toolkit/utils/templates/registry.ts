/**
 * Inlined AgentArts project template resources.
 *
 * The Python toolkit ships the templates as `.j2` files next to the template
 * manager and reads them from disk at runtime. `tsc` does not copy non-TS
 * assets into `dist/`, and the porting rules forbid adding a build step to
 * `package.json`, so the exact template text is inlined here as string
 * constants and `TemplateManager` reads it from this registry. The original
 * `.j2` files are kept under `tools/templates-source/` as reference only (they
 * are not read at runtime, and are normalized from CRLF to LF when inlined).
 *
 * Only `basic`, `langchain` and `langgraph` agent templates plus the `docker`
 * Dockerfile template are ported. Google ADK integration and Java agent support
 * are out of scope, so `google-adk`, `java-basic` and `java-agentscope` are
 * intentionally absent: `renderTemplate` throws `TemplateNotFoundError` for
 * them, the counterpart of Python's `FileNotFoundError`.
 */

/** A template filename mapped to its exact template text. */
export type TemplateFiles = Readonly<Record<string, string>>;

/** Template type (directory name) mapped to its template files. */
export const TEMPLATES: Readonly<Record<string, TemplateFiles>> = {
  basic: {
    "agent.py.j2": `"""
{{ name }} - Basic Agent Implementation

A simple agent that processes user queries using AgentArts SDK runtime.

Environment Variables:
    None required for basic template.

Configuration:
    Edit .agentarts_config.yaml to customize runtime settings.
"""

from typing import Dict, Any

from agentarts.sdk import AgentArtsRuntimeApp, RequestContext

app = AgentArtsRuntimeApp()


@app.entrypoint
def handler(payload: Dict[str, Any], context: RequestContext = None) -> Dict[str, Any]:
    """
    Process a query and return a response.

    Args:
        payload: User input payload containing query
        context: Request context with session info (optional)

    Returns:
        Response dictionary
    """
    query = payload.get("message", "")
    
    # TODO: Implement your agent logic here
    
    return {
        "response": f"Processed: {query}",
        "status": "success",
        "agent": "{{ name }}",
    }


if __name__ == "__main__":
    app.run()
`,

    "requirements.txt.j2": `agentarts-sdk
`,

  },
  langchain: {
    "agent.py.j2": `"""
{{ name }} - LangChain Agent Implementation

An agent built using LangChain framework, wrapped with AgentArts SDK runtime.

Environment Variables:
    OPENAI_API_KEY: Your OpenAI API key (required)
        - Get it from: https://platform.openai.com/api-keys
        - Set in .agentarts_config.yaml under runtime.environment_variables
    OPENAI_BASE_URL: Custom API endpoint URL (optional)
        - Use this to connect to OpenAI-compatible APIs (e.g., Azure OpenAI, local LLMs)
        - Example: https://your-api-endpoint.com/v1
        - Leave empty to use default OpenAI API
    OPENAI_MODEL_NAME: Model name to use (optional, default: gpt-4o-mini)
        - Examples: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
        - Or custom model names for OpenAI-compatible APIs

Configuration:
    Edit .agentarts_config.yaml to customize:
    - runtime.environment_variables: Set OPENAI_API_KEY, OPENAI_MODEL_NAME and optionally OPENAI_BASE_URL
    - runtime.invoke_config: Change protocol or port
    - runtime.network_config: Configure VPC if needed

Usage:
    1. Set your OPENAI_API_KEY in .agentarts_config.yaml
    2. (Optional) Set OPENAI_MODEL_NAME to use a different model
    3. (Optional) Set OPENAI_BASE_URL for custom endpoints
    4. Run: agentarts deploy
    5. Invoke: agentarts invoke '{"message": "Hello"}'
"""

import os
from typing import Dict, Any, Optional

from agentarts.sdk import AgentArtsRuntimeApp, RequestContext

app = AgentArtsRuntimeApp()


class LangChainAgent:
    """LangChain-based Agent implementation."""

    def __init__(self):
        self.name = "{{ name }}"
        self.model_name = os.environ.get("OPENAI_MODEL_NAME", "gpt-4o-mini")
        self._llm = None

    def _get_llm(self):
        """Initialize LLM lazily."""
        if self._llm is None:
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                raise ValueError(
                    "OPENAI_API_KEY environment variable is not set. "
                    "Please set it in .agentarts_config.yaml under runtime.environment_variables"
                )

            base_url = os.environ.get("OPENAI_BASE_URL")

            try:
                from langchain_openai import ChatOpenAI
                llm_kwargs = {"model": self.model_name, "api_key": api_key}
                if base_url:
                    llm_kwargs["base_url"] = base_url
                self._llm = ChatOpenAI(**llm_kwargs)
            except ImportError:
                raise ImportError(
                    "langchain-openai is required. Install it with: pip install langchain-openai"
                )
        return self._llm

    async def run(
        self,
        query: str,
        system_prompt: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Process a query using LangChain.

        Args:
            query: User input query
            system_prompt: Optional system prompt
            **kwargs: Additional parameters

        Returns:
            Response dictionary
        """
        from langchain_core.messages import HumanMessage, SystemMessage

        llm = self._get_llm()

        messages = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=query))

        response = await llm.ainvoke(messages)

        return {
            "response": response.content,
            "status": "success",
            "agent": self.name,
            "model": self.model_name,
        }


_agent: Optional[LangChainAgent] = None


def _get_agent() -> LangChainAgent:
    """Get or create the agent instance."""
    global _agent
    if _agent is None:
        _agent = LangChainAgent()
    return _agent


@app.entrypoint
async def handler(payload: Dict[str, Any], context: RequestContext = None) -> Dict[str, Any]:
    """
    Process a query using LangChain.

    Args:
        payload: User input payload containing query
        context: Request context with session info (optional)

    Returns:
        Response dictionary
    """
    query = payload.get("message", "")
    system_prompt = payload.get("system_prompt")
    
    agent = _get_agent()
    return await agent.run(query, system_prompt=system_prompt)


if __name__ == "__main__":
    app.run()
`,

    "requirements.txt.j2": `agentarts-sdk
langchain>=0.1.0
langchain-openai>=0.1.0
langchain-core>=0.1.0
`,

  },
  langgraph: {
    "agent.py.j2": `"""
{{ name }} - LangGraph Agent Implementation

An agent built using LangGraph for stateful workflows, wrapped with AgentArts SDK runtime.

Environment Variables:
    OPENAI_API_KEY: Your OpenAI API key (required)
        - Get it from: https://platform.openai.com/api-keys
        - Set in .agentarts_config.yaml under runtime.environment_variables
    OPENAI_BASE_URL: Custom API endpoint URL (optional)
        - Use this to connect to OpenAI-compatible APIs (e.g., Azure OpenAI, local LLMs)
        - Example: https://your-api-endpoint.com/v1
        - Leave empty to use default OpenAI API
    OPENAI_MODEL_NAME: Model name to use (optional, default: gpt-4o-mini)
        - Examples: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
        - Or custom model names for OpenAI-compatible APIs

Configuration:
    Edit .agentarts_config.yaml to customize:
    - runtime.environment_variables: Set OPENAI_API_KEY, OPENAI_MODEL_NAME and optionally OPENAI_BASE_URL
    - runtime.invoke_config: Change protocol or port
    - runtime.network_config: Configure VPC if needed

Usage:
    1. Set your OPENAI_API_KEY in .agentarts_config.yaml
    2. (Optional) Set OPENAI_MODEL_NAME to use a different model
    3. (Optional) Set OPENAI_BASE_URL for custom endpoints
    4. Run: agentarts deploy
    5. Invoke: agentarts invoke '{"message": "Hello"}'
"""

import os
from typing import Dict, Any, TypedDict, Annotated, Optional
from operator import add

from agentarts.sdk import AgentArtsRuntimeApp, RequestContext

app = AgentArtsRuntimeApp()


class State(TypedDict):
    """Agent state definition."""
    messages: Annotated[list, add]
    query: str
    response: str
    status: str


class LangGraphAgent:
    """LangGraph-based Agent implementation."""

    def __init__(self):
        self.name = "{{ name }}"
        self.model_name = os.environ.get("OPENAI_MODEL_NAME", "gpt-4o-mini")
        self._graph = None

    def _build_graph(self):
        """Build the LangGraph workflow."""
        from langgraph.graph import StateGraph, END
        from langchain_core.messages import HumanMessage, AIMessage

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY environment variable is not set. "
                "Please set it in .agentarts_config.yaml under runtime.environment_variables"
            )

        base_url = os.environ.get("OPENAI_BASE_URL")

        try:
            from langchain_openai import ChatOpenAI
            llm_kwargs = {"model": self.model_name, "api_key": api_key}
            if base_url:
                llm_kwargs["base_url"] = base_url
            llm = ChatOpenAI(**llm_kwargs)
        except ImportError:
            raise ImportError(
                "langchain-openai is required. Install it with: pip install langchain-openai"
            )

        async def process_node(state: State) -> Dict[str, Any]:
            """Process the query using LLM."""
            query = state.get("query", "")
            messages = state.get("messages", [])

            if not messages:
                messages = [HumanMessage(content=query)]

            response = await llm.ainvoke(messages)

            return {
                "messages": [AIMessage(content=response.content)],
                "response": response.content,
                "status": "completed",
            }

        workflow = StateGraph(State)
        workflow.add_node("process", process_node)
        workflow.set_entry_point("process")
        workflow.add_edge("process", END)

        return workflow.compile()

    def _get_graph(self):
        """Get or create the graph."""
        if self._graph is None:
            self._graph = self._build_graph()
        return self._graph

    async def run(self, query: str, **kwargs) -> Dict[str, Any]:
        """
        Process a query using LangGraph workflow.

        Args:
            query: User input query
            **kwargs: Additional parameters

        Returns:
            Response dictionary
        """
        graph = self._get_graph()

        initial_state: State = {
            "messages": [],
            "query": query,
            "response": "",
            "status": "pending",
        }

        result = await graph.ainvoke(initial_state)

        return {
            "response": result.get("response", ""),
            "status": result.get("status", "success"),
            "agent": self.name,
            "model": self.model_name,
        }


_agent: Optional[LangGraphAgent] = None


def _get_agent() -> LangGraphAgent:
    """Get or create the agent instance."""
    global _agent
    if _agent is None:
        _agent = LangGraphAgent()
    return _agent


@app.entrypoint
async def handler(payload: Dict[str, Any], context: RequestContext = None) -> Dict[str, Any]:
    """
    Process a query using LangGraph workflow.

    Args:
        payload: User input payload containing query
        context: Request context with session info (optional)

    Returns:
        Response dictionary
    """
    query = payload.get("message", "")
    agent = _get_agent()
    return await agent.run(query)


if __name__ == "__main__":
    app.run()
`,

    "requirements.txt.j2": `agentarts-sdk
langgraph>=1.0.0
langchain>=0.1.0
langchain-openai>=0.1.0
langchain-core>=0.1.0
`,

  },
  docker: {
    "Dockerfile.j2": `# AgentArts Dockerfile
# Generated by AgentArts CLI

FROM {base_image}

{env_section}

{user_section}

WORKDIR /app

{chown_section}

{dependency_section}

COPY . .

{chown_app_section}

EXPOSE {port}

USER {user_name}

{cmd_section}
`,

  },
};

/** Agent template types ported from the Python toolkit (`docker` excluded). */
export const AGENT_TEMPLATE_TYPES: readonly string[] = ['basic', 'langchain', 'langgraph'];

/** Template type that holds the Dockerfile template. */
export const DOCKER_TEMPLATE_TYPE = 'docker';

/**
 * Python template types that are intentionally not ported (Google ADK and Java
 * agent support were dropped). Rendering one of these types fails with
 * `TemplateNotFoundError`, mirroring Python's `FileNotFoundError`.
 */
export const UNSUPPORTED_TEMPLATE_TYPES: readonly string[] = [
  'google-adk',
  'java-agentscope',
  'java-basic',
];

/**
 * Return the exact template text, or `undefined` when the template does not
 * exist (an unknown or unported template type).
 */
export function getTemplateContent(templateType: string, filename: string): string | undefined {
  const files = TEMPLATES[templateType];
  if (!files) {
    return undefined;
  }
  return files[filename];
}

/** Check whether a template exists in the registry. */
export function hasTemplate(templateType: string, filename: string): boolean {
  return getTemplateContent(templateType, filename) !== undefined;
}

/**
 * List the available template types, sorted.
 *
 * Mirrors Python `TemplateManager.list_templates()`: underscored entries are
 * skipped and the `docker` template directory is excluded from the listing
 * unless `includeDocker` is true.
 */
export function listTemplateTypes(includeDocker = false): string[] {
  return Object.keys(TEMPLATES)
    .filter((name) => !name.startsWith('_'))
    .filter((name) => includeDocker || name !== DOCKER_TEMPLATE_TYPE)
    .sort();
}
