# Wanderlust Agentic System Map

## High-Level Flow

```mermaid
flowchart LR
  A[User / Frontend] --> B[API Gateway<br/>server.js]
  B --> C[Router<br/>services/router.js]
  C --> D[Orchestrator<br/>services/orchestrator.js]
  D --> E[Tool Execution Layer]
  E --> F[External Data Providers]
  F --> G[LLM Synthesis]
  G --> H[Structured Travel Package]
  H --> A
```

## Orchestrator Phases

```mermaid
flowchart TD
  A[User Request] --> B[Phase 1: Perception]
  B --> B1[Extract intent, entities, constraints, steps]
  B1 --> C[Phase 2: Tool Execution]
  C --> C1[Router decides domain, complexity, providers]
  C1 --> C2[Execute tools / subagents / browser]
  C2 --> D[Phase 3: Synthesis]
  D --> D1[LLM builds final JSON response]
  D1 --> E[Response + tool results + audit trail]
```

## Core Components

```mermaid
flowchart LR
  subgraph Frontend
    F1[Landing Page]
    F2[Dashboard]
    F3[Agent Chat]
    F4[Internal Lab]
  end

  subgraph Backend
    B1[Express Server]
    B2[Travel Routes]
    B3[Agent Routes]
    B4[Internal Routes]
    B5[Browser Routes]
  end

  subgraph AgenticCore
    A1[Router]
    A2[Orchestrator]
    A3[Tool Registry]
    A4[MCP Client Pool]
    A5[RAG Store]
    A6[AI Evaluation]
    A7[Fusion Layer]
    A8[Cache]
  end

  subgraph DataSources
    D1[Google Places]
    D2[Ola Maps]
    D3[OpenStreetMap]
    D4[Web Search]
    D5[Browser Automation]
    D6[LLM Providers]
  end

  Frontend --> Backend
  Backend --> AgenticCore
  AgenticCore --> DataSources
```

## Tool Execution Path

```mermaid
flowchart TD
  A[Tool Call Requested] --> B{Tool Type}
  B -->|Local| C[Local Handler]
  B -->|MCP Remote| D[MCP Client Pool]
  D --> E[Stdio / HTTP / SSE Transport]
  E --> F[Remote MCP Server]
  C --> G[Tool Result]
  F --> G
  G --> H[Orchestrator collects results]
  H --> I[Synthesis Prompt]
  I --> J[LLM produces final JSON]
```

## Fallback Chain

```mermaid
flowchart LR
  A[Primary API] --> B{Success?}
  B -->|Yes| C[Use Result]
  B -->|No| D[Secondary API]
  D --> E{Success?}
  E -->|Yes| C
  E -->|No| F[Browser Automation]
  F --> G{Success?}
  G -->|Yes| C
  G -->|No| H[Web Search]
  H --> I{Success?}
  I -->|Yes| C
  I -->|No| J[Internal Knowledge / Estimated]
  J --> C
```

## Data Flow for a Plan Request

```mermaid
sequenceDiagram
  participant U as User
  participant F as Frontend
  participant B as Backend
  participant R as Router
  participant O as Orchestrator
  participant T as Tools / Subagents
  participant L as LLM
  participant D as DB / RAG

  U->>F: Submit trip form
  F->>B: POST /api/travel/plan
  B->>O: Forward request
  O->>L: Perception prompt
  L-->>O: Intent + entities + steps
  O->>R: Map steps to actions
  R-->>O: Domain, complexity, providers
  O->>T: Execute tool plan
  T->>D: Check past plans / context
  D-->>T: RAG results
  T->>T: Live API / browser / web calls
  T-->>O: Tool results
  O->>L: Synthesis prompt
  L-->>O: Final travel package JSON
  O-->>B: Response + meta
  B-->>F: JSON payload
  F->>U: Render dashboard
```

## Agent Chat Flow

```mermaid
sequenceDiagram
  participant U as User
  participant F as Frontend
  participant B as Backend
  participant A as Agent
  participant R as RAG
  participant T as Tools
  participant L as LLM

  U->>F: Send message
  F->>B: POST /api/agent/chat
  B->>A: Load/create agent instance
  A->>R: Retrieve relevant context
  R-->>A: Past plans / preferences
  A->>L: Tool selection prompt
  L-->>A: toolCalls[]
  A->>T: Execute tools
  T-->>A: Observations
  A->>L: Synthesis prompt
  L-->>A: Final assistant message
  A-->>B: SSE stream
  B-->>F: Streamed events
  F->>U: Render chat + sources
```

## Key Files Reference

| Layer | File | Role |
|-------|------|------|
| Entry | `backend/server.js` | Express app, CORS, routes, health |
| Routes | `backend/routes/travel.js` | Travel plan + details endpoints |
| Routes | `backend/routes/agent.js` | Agent chat + SSE streaming |
| Routes | `backend/routes/internal.js` | Research, memory, browser |
| Routes | `backend/routes/browser.js` | Browser automation API |
| Router | `backend/services/router.js` | Domain classification, provider priority |
| Orchestrator | `backend/services/orchestrator.js` | Perception → tools → synthesis |
| LLM | `backend/services/ollamaClient.js` | Cloud LLM JSON calls |
| Tools | `backend/agents/tools/planTools.js` | Plan modify/search/email tools |
| Agent | `backend/agents/emailAgent.js` | Specialized plan assistant |
| RAG | `backend/rag/ragStore.js` | Plan memory + search |
| MCP | `backend/assistant/mcpClient.js` | Remote MCP server connections |
| Registry | `backend/assistant/toolRegistry.js` | Unified tool catalog |
| Fusion | `backend/services/fusion.js` | Multi-provider merge/normalize |
| Cache | `backend/services/cache.js` | In-memory / Redis cache |
| Eval | `backend/services/aiEvaluation.js` | Intent + save gates |
