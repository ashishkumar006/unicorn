# Wanderlust AI Travel Planner - Architecture Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Backend Architecture](#backend-architecture)
4. [Frontend Architecture](#frontend-architecture)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Agent System Workflow](#agent-system-workflow)
7. [Database Schema](#database-schema)
8. [API Routes](#api-routes)

---

## Overview

Wanderlust AI is a comprehensive travel planning application that uses AI agents to create personalized travel itineraries. The system combines multiple travel data providers, RAG (Retrieval-Augmented Generation) for context, and a ReAct pattern-based agent system for interactive travel plan management.

```
┌─────────────────────────────────────────────────────────────────┐
│                        WANDERLUST AI SYSTEM                      │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React)   │  Backend (Node.js)   │  Data Providers   │
│                     │                      │                   │
│  Landing Page       │  Express Server      │  Google Places    │
│  Dashboard          │  SSE Endpoints       │  Ola Maps         │
│  Agent Chat         │  Agent System        │  OpenStreetMap    │
│  Budget Charts      │  RAG Store           │  Web Search       │
└─────────────────────────────────────────────────────────────────┘
```

---

## System Architecture

```
                    ┌─────────────────┐
                    │   Frontend      │
                    │   (React SPA)   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Backend       │
                    │   (Express)     │
                    │                 │
                    │ ┌─────────────┐ │
                    │ │ Agent       │ │
                    │ │ System      │ │
                    │ └──────┬──────┘ │
                    │        │        │
                    │ ┌──────▼──────┐ │
                    │ │ RAG Store   │ │
                    │ └──────┬──────┘ │
                    │        │        │
                    └────────┼────────┬┘
                             │        │
           ┌─────────────────┘        └─────────────────┐
           │                                            │
┌──────────▼──────────┐                    ┌────────────▼──────────┐
│   SQLite Database   │                    │   External APIs       │
│   (Travel Plans)    │                    │   - Google Places     │
│                     │                    │   - Ola Maps          │
│   - trips           │                    │   - OpenStreetMap     │
│   - activities      │                    │   - Web Search        │
│   - accommodations  │                    └───────────────────────┘
│   - budgets         │
│   - research_docs   │
└─────────────────────┘
```

---

## Backend Architecture

### File Structure

```
backend/
├── server.js                    # Main Express server entry point
├── package.json                 # Backend dependencies
├── db/
│   └── database.js             # SQLite connection and schema
├── agents/
│   ├── baseAgent.js            # Base agent class with ReAct loop
│   ├── emailAgent.js           # Specialized plan modification agent
│   └── tools/
│       └── planTools.js        # 12 tools for plan access/modification
├── services/
│   ├── ollamaClient.js         # Gemma Cloud LLM interface
│   ├── travelPlanner.js        # Multi-provider trip generation
│   └── internalLab.js          # Web search and URL reading
├── routes/
│   ├── agent.js                # Agent API routes (SSE streaming)
│   └── travel.js               # Travel planning API routes
└── rag/
    └── ragStore.js             # RAG system for travel context
```

### Key Components

#### `server.js` (Entry Point)
- Express server configuration
- SSE endpoint setup at `/api/agent/stream`
- CORS middleware for frontend communication
- JSON body parsing
- Route mounting

#### `database.js` (Persistence Layer)
- SQLite connection with serialization
- Schema initialization (CREATE TABLE IF NOT EXISTS)
- CRUD operations for:
  - `trips` table
  - `activities` table
  - `accommodations` table
  - `budgets` table
  - `research_docs` table

#### `ollamaClient.js` (LLM Interface)
- Gemma Cloud API integration
- Chat completion endpoint
- Error handling for rate limits
- JSON response parsing

#### `travelPlanner.js` (Trip Generation)
- Multi-provider orchestration:
  - `buildTripPlan()` - Main trip generation
  - `generateAccommodationPlan()` - Hotel/Airbnb search
  - `generateActivityPlan()` - Points of interest
  - `generateTransitPlan()` - Transportation options
  - `generateFoodPlan()` - Restaurant recommendations
- Budget calculation integration

#### `internalLab.js` (Data Enrichment)
- `webSearch()` - Search for travel information
- `readUrl()` - Extract content from web pages
- Research data persistence

#### `ragStore.js` (Context Retrieval)
- `retrieveRelevantContext()` - Vector similarity search
- `embedQuery()` - Query embedding
- `formatResults()` - Context formatting for LLM

#### `baseAgent.js` (Agent Core)
- ReAct pattern implementation:
  ```
  1. LLM decides next action
  2. Execute tool if needed
  3. Return observation to LLM
  4. Repeat until completion
  ```
- Tool execution loop
- SSE streaming for real-time updates
- Conversation state management

---

## Frontend Architecture

### File Structure

```
frontend/
├── package.json                # Frontend dependencies
├── src/
│   ├── App.js                 # React Router app
│   ├── index.js               # Entry point
│   ├── hooks/
│   │   └── useAgent.js        # SSE streaming hook
│   ├── pages/
│   │   ├── LandingPage.jsx    # Trip form input
│   │   ├── DashboardPage.jsx  # Plan visualization
│   │   └── AgentPage.jsx      # Chat interface
│   └── styles/
│       └── cinematicOverrides.css
└── public/
```

### Key Components

#### `App.js` (Router)
```javascript
Routes:
├── /              → LandingPage
├── /dashboard     → DashboardPage
└── /agent/:tripId → AgentPage
```

#### `LandingPage.jsx` (Trip Creation)
- Form for trip details (destination, dates, budget, preferences)
- Form submission to `/api/travel/explore`
- Loading states and error handling

#### `DashboardPage.jsx` (Plan Visualization)
- Trip details display
- Budget breakdown charts
- Day-by-day itinerary view
- Activity cards with details

#### `AgentPage.jsx` (Chat Interface)
- Message history display
- User input form
- SSE connection to agent
- Real-time message streaming

#### `useAgent.js` (Streaming Hook)
- SSE connection management
- Message parsing and state updates
- Auto-scroll to bottom
- Connection error handling

---

## Data Flow Diagrams

### Trip Creation Flow

```
User Input → LandingPage → POST /api/travel/explore
                                    ↓
                           travelPlanner.buildTripPlan()
                                    ↓
                    ┌─────────────────────────────────────┐
                    │         Data Collection             │
                    ├─────────────────────────────────────┤
                    │ 1. Accommodation (Ola/GMaps)          │
                    │ 2. Activities (Google Places)       │
                    │ 3. Transit (Ola Maps)               │
                    │ 4. Restaurants (Google Places)      │
                    │ 5. Research (Web Search)            │
                    └─────────────────────────────────────┘
                                    ↓
                            SQLite Persistence
                                    ↓
                        Redirect to /dashboard/:tripId
```

### Agent Interaction Flow

```
User Message → AgentPage → POST /api/agent/start
                                    ↓
                              baseAgent.run()
                                    ↓
                    ┌─────────────────────────────────────┐
                    │          ReAct Loop                 │
                    ├─────────────────────────────────────┤
                    │ LLM decides → Tool call → Observation│
                    │ LLM decides → Tool call → Observation│
                    │        ... (repeat until complete)   │
                    └─────────────────────────────────────┘
                                    ↓
                           SSE Stream Response
                                    ↓
                        Real-time UI Updates
```

### RAG Context Flow

```
User Query → baseAgent → ragStore.retrieveRelevantContext()
                                          ↓
                                   Top K Documents
                                          ↓
                                 Embedded + Formatted
                                          ↓
                                    LLM Context
```

---

## Agent System Workflow

### ReAct Pattern Implementation

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT EXECUTION CYCLE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐                                                │
│  │ User Input  │                                                │
│  └──────┬──────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐    1. Prepare Messages                          │
│  │ baseAgent   │ ──────────────────────────────────────────►  │
│  │   .run()    │                                              │
│  └─────────────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐    2. Call LLM                                  │
│  │ ollama      │ ◄──────────────────────────────────────────  │
│  │  Client     │                                                │
│  └─────────────┘                                                │
│         │                                                       │
│         ▼                      ┌─────────────┐                  │
│  ┌─────────────┐               │      NO     │                  │
│  │  Response   │ ◄──────────── │ Has Tool    │                  │
│  │ has tool?   │              └─────┬───────┘                  │
│  └──────┬──────┘                    │ Yes                        │
│         │ No                        ▼                            │
│         ▼                   ┌─────────────┐                     │
│  ┌─────────────┐            │ Execute     │                     │
│  │   Return    │            │ Tool        │                     │
│  │   Final     │            │   params    │                     │
│  │  Response   │            └──────┬──────┘                     │
│  └─────────────┘                   │                             │
│                                    ▼                             │
│                           ┌─────────────┐                        │
│                           │ Tool Result │                        │
│                           └──────┬──────┘                        │
│                                  │                               │
│                                  ▼                               │
│                           ┌─────────────┐                        │
│                           │ Append      │                        │
│                           │ Observation │                        │
│                           └──────┬──────┘                        │
│                                  │                               │
│                                  └──────► Loop back to Step 2   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Available Agent Tools (12 Total)

| Tool | Purpose | Category |
|------|---------|----------|
| `getTripDetails` | Retrieve trip information | Read |
| `getDayPlan` | Get activities for specific day | Read |
| `getBudgetBreakdown` | Get budget details | Read |
| `getAccommodationDetails` | Get hotel information | Read |
| `searchActivities` | Find activities by location/type | Read/Search |
| `modifyBudget` | Update budget allocations | Write |
| `addActivity` | Add new activity to plan | Write |
| `removeActivity` | Remove activity from plan | Write |
| `updateActivity` | Modify existing activity | Write |
| `addNote` | Add notes to plan | Write |
| `suggestSimilarPlaces` | Find similar destinations | Search |
| `researchDestination` | Get destination information | Search/RAG |

---

## Database Schema

### Table Definitions

```sql
-- Trips table
CREATE TABLE trips (
    id TEXT PRIMARY KEY,
    destination TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    budget REAL,
    travelers INTEGER,
    preferences TEXT,  -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activities table
CREATE TABLE activities (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    day INTEGER,
    name TEXT,
    description TEXT,
    location TEXT,
    time TEXT,
    cost REAL,
    category TEXT,  -- accommodation, food, transit, activity
    FOREIGN KEY (trip_id) REFERENCES trips(id)
);

-- Accommodations table
CREATE TABLE accommodations (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    name TEXT,
    address TEXT,
    check_in DATE,
    check_out DATE,
    price REAL,
    FOREIGN KEY (trip_id) REFERENCES trips(id)
);

-- Budgets table
CREATE TABLE budgets (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    category TEXT,
    allocated REAL,
    spent REAL,
    FOREIGN KEY (trip_id) REFERENCES trips(id)
);

-- Research documents table
CREATE TABLE research_docs (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    type TEXT,  -- transit, places, accommodation, gastronomy
    content TEXT,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trip_id) REFERENCES trips(id)
);
```

---

## API Routes

### Travel Routes (`routes/travel.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/travel/explore` | Create new trip plan |
| GET | `/api/travel/:tripId` | Get trip details |

### Agent Routes (`routes/agent.js`)

| Endpoint | Description |
|----------|-------------|
| POST `/api/agent/start` | Start agent conversation with message |
| GET `/api/agent/stream/:sessionId` | SSE stream for real-time agent responses |

### Request/Response Examples

#### POST `/api/travel/explore`
```json
Request:
{
  "destination": "Paris, France",
  "startDate": "2024-06-01",
  "endDate": "2024-06-07",
  "budget": 2000,
  "travelers": 2,
  "preferences": ["adventure", "food"]
}

Response:
{
  "tripId": "trip-mpiuxu73-dd1ccc",
  "message": "Trip plan created successfully",
  "redirectUrl": "/dashboard/trip-mpiuxu73-dd1ccc"
}
```

#### POST `/api/agent/start`
```json
Request:
{
  "tripId": "trip-mpiuxu73-dd1ccc",
  "message": "Can you add more food options?"
}

Response (SSE Stream):
data: {"type": "thinking", "content": "Let me analyze your request..."}
data: {"type": "tool_call", "tool": "getTripDetails", "params": {...}}
data: {"type": "observation", "content": "..."}
data: {"type": "final", "content": "I've added 5 more restaurant options..."}
```

---

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND LAYERS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PAGES                                                              │    │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐  │    │
│  │  │ LandingPage   │  │DashboardPage  │  │    AgentPage          │  │    │
│  │  │               │  │               │  │                       │  │    │
│  │  │ - Trip Form   │  │ - Plan View   │  │ - Chat Interface      │  │    │
│  │  │ - Submit      │  │ - Budget Chart│  │ - Message History     │  │    │
│  │  └───────┬───────┘  └───────┬───────┘  └──────────┬────────────┘  │    │
│  └──────────┼──────────────────┼─────────────────────┼───────────────┘    │
│             │                  │                     │                   │
│             ▼                  ▼                     ▼                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  HOOKS & UTILITIES                                               │    │
│  │  ┌─────────────────────────────────────────────────────────┐  │    │
│  │  │ useAgent.js                                                │  │    │
│  │  │ - SSE connection management                                │  │    │
│  │  │ - Message handling                                         │  │    │
│  │  │ - Auto-scroll                                              │  │    │
│  │  └─────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                             │                                             │
└─────────────────────────────┼─────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             BACKEND LAYERS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ROUTES                                                              │    │
│  │  ┌───────────────┐                   ┌──────────────────────────┐  │    │
│  │  │ agent.js      │                   │ travel.js                │  │    │
│  │  │               │                   │                          │  │    │
│  │  │ - POST /start │                   │ - POST /explore         │  │    │
│  │  │ - GET /stream │                   │ - GET /:tripId          │  │    │
│  │  └───────┬───────┘                   └──────────┬───────────────┘  │    │
│  └──────────┼─────────────────────────────────────┼─────────────────┘    │
│             │                                     │                     │
│             ▼                                     ▼                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  AGENTS & SERVICES                                                │    │
│  │  ┌───────────────┐  ┌───────────────┐  ┌──────────────────────┐  │    │
│  │  │ BaseAgent     │  │ TravelPlanner │  │ InternalLab           │  │    │
│  │  │               │  │               │  │                      │  │    │
│  │  │ - ReAct Loop  │  │ - Plan Gen    │  │ - Web Search         │  │    │
│  │  │ - SSE Output  │  │ - Multi-API   │  │ - URL Reading        │  │    │
│  │  │ - Tool Calls  │  │ - Budget Calc │  │                      │  │    │
│  │  └───────┬───────┘  └───────────────┘  └──────────────────────┘  │    │
│            │                                                          │
│            ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  TOOLS                                                              │    │
│  │  ┌─────────────────────────────────────────────────────────┐  │    │
│  │  │ planTools.js                                              │  │    │
│  │  │                                                           │  │    │
│  │  │ Read: getTripDetails, getDayPlan, getBudgetBreakdown      │  │    │
│  │  │       getAccommodationDetails, searchActivities            │  │    │
│  │  │ Write: modifyBudget, addActivity, removeActivity,          │  │    │
│  │  │        updateActivity, addNote                            │  │    │
│  │  │ Search: suggestSimilarPlaces, researchDestination          │  │    │
│  │  └─────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│             │                                     │                     │
│             ▼                                     ▼                     │
│  ┌─────────────────┐              ┌──────────────────────────────┐     │
│  │    RAG Store    │              │      SQLite Database         │     │
│  │                 │              │                              │     │
│  │ - Context       │              │ - trips                      │     │
│  │   Retrieval     │              │ - activities                 │     │
│  │ - Embedding     │              │ - accommodations             │     │
│  │                 │              │ - budgets                    │     │
│  └─────────────────┘              │ - research_docs              │     │
│                                 └──────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

Wanderlust AI is structured as a modern full-stack application with:

- **Frontend**: React SPA with three main views (landing, dashboard, agent chat)
- **Backend**: Express server with SSE streaming for real-time agent interaction
- **Agent System**: ReAct pattern-based AI with 12 tools for plan management
- **Data Layer**: SQLite for persistence, RAG for context retrieval
- **External Services**: Multiple travel APIs for enriched data