import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BrainCircuit, ExternalLink, Globe2, History, LayoutPanelTop, Loader2, NotebookTabs, Radar, Save, Search, ShieldCheck, Sparkles, Trash2, WandSparkles, Workflow } from 'lucide-react';
import { API_BASE, browserApi } from '../lib/api';
import '../styles/internalLab.css';

const INTERNAL_USER_ID = 'internal-lab';

const FEATURE_CARDS = [
  {
    name: 'Oracle',
    label: 'Web search + citations',
    status: 'enabled',
    description: 'Search the live web, read URLs, and collect source-backed travel intelligence.',
  },
  {
    name: 'Phantom',
    label: 'Browser automation',
    status: 'enabled',
    description: 'Run headless browser workflows for interactive, multi-step sites.',
  },
  {
    name: 'Mnemo',
    label: 'Memory notes',
    status: 'enabled',
    description: 'Store internal notes and retrieval breadcrumbs for testing and continuity.',
  },
  {
    name: 'Chronicle',
    label: 'Session logs',
    status: 'enabled',
    description: 'Inspect conversation and plan history for reproducibility.',
  },
  {
    name: 'Aegis',
    label: 'Safety layer',
    status: 'optional',
    description: 'Not surfaced here yet; can be added later if we need policy gating.',
  },
  {
    name: 'Watchtower',
    label: 'Ops visibility',
    status: 'optional',
    description: 'Health/metrics views can be added later, but are not required for the travel product.',
  },
];

const TABS = [
  { id: 'research', label: 'Research' },
  { id: 'browser', label: 'Browser' },
  { id: 'memory', label: 'Memory' },
  { id: 'sessions', label: 'Sessions' },
];

function normalizeTags(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function InternalLabPage() {
  const [sessionId, setSessionId] = useState(INTERNAL_USER_ID);
  const [labStatus, setLabStatus] = useState({ ollama: {}, capabilities: {} });
  const [activeTab, setActiveTab] = useState('research');
  const [searchQuery, setSearchQuery] = useState('best time to visit goa');
  const [searchLimit, setSearchLimit] = useState(5);
  const [searchResults, setSearchResults] = useState([]);
  const [searchInsight, setSearchInsight] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [readUrl, setReadUrl] = useState('');
  const [readResult, setReadResult] = useState(null);
  const [readInsight, setReadInsight] = useState(null);
  const [browserUrl, setBrowserUrl] = useState('https://example.com');
  const [browserGoal, setBrowserGoal] = useState('Open the page, review the content, and summarize the result.');
  const [browserActions, setBrowserActions] = useState('[]');
  const [browserResult, setBrowserResult] = useState(null);
  const [browserInsight, setBrowserInsight] = useState(null);
  const [summary, setSummary] = useState({ notes: [], conversations: [], plans: [] });
  const [sessionInsight, setSessionInsight] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteTags, setNoteTags] = useState('oracle,phantom');
  const [noteContent, setNoteContent] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [noteInsight, setNoteInsight] = useState(null);

  const featureSummary = useMemo(() => FEATURE_CARDS, []);
  const searchProviderLabel = searchInsight?.providerLabel || searchInsight?.provider || labStatus?.search?.providerLabel || labStatus?.search?.provider || 'DuckDuckGo HTML';

  const loadSummary = async (currentSessionId = sessionId) => {
    const trimmedSessionId = currentSessionId.trim() || INTERNAL_USER_ID;
    setSummaryLoading(true);
    setSummaryError('');

    try {
      const response = await fetch(`${API_BASE}/internal/summary/${encodeURIComponent(trimmedSessionId)}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load internal summary');
      }

      setSummary({
        notes: data.notes || [],
        conversations: data.conversations || [],
        plans: data.plans || [],
      });
      setSessionInsight(data.insight || {
        summary: data.summary || '',
        highlights: data.highlights || [],
        risks: data.risks || [],
        nextSteps: data.nextSteps || [],
      });
    } catch (error) {
      setSummaryError(error.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/internal/status`);
        const data = await response.json();

        if (response.ok && data.success) {
          setLabStatus(data);
        }
      } catch (error) {
        console.error('Failed to load internal status:', error);
      }
    };

    loadStatus();
  }, []);

  useEffect(() => {
    loadSummary(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const runResearchSearch = async (event) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError('');

    try {
      const response = await fetch(`${API_BASE}/internal/research/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim(), limit: Number(searchLimit) || 5 }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Search failed');
      }

      setSearchResults(data.results || []);
      setSearchInsight(data.synthesis || {
        summary: data.summary || '',
        keyPoints: data.keyPoints || [],
        recommendedSources: data.recommendedSources || [],
        followUpQuery: data.followUpQuery || searchQuery.trim(),
      });
    } catch (error) {
      setSearchError(error.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const readSearchResult = async (targetUrl = readUrl) => {
    if (!targetUrl.trim()) return;

    setSearchLoading(true);
    setSearchError('');

    try {
      const response = await fetch(`${API_BASE}/internal/research/read-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl.trim() }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to read URL');
      }

      setReadResult(data);
      setReadInsight(data.insight || {
        summary: data.summary || '',
        keyFacts: data.keyFacts || [],
        risks: data.risks || [],
        recommendedAction: data.recommendedAction || '',
      });
    } catch (error) {
      setSearchError(error.message);
    } finally {
      setSearchLoading(false);
    }
  };

   const runBrowserWorkflow = async (event) => {
     event.preventDefault();

     let parsedActions = [];
     try {
       parsedActions = browserActions.trim() ? JSON.parse(browserActions) : [];
     } catch (error) {
       setNoteError(`Browser action JSON is invalid: ${error.message}`);
       return;
     }

     setSearchLoading(true);
     setSearchError('');

     try {
       const data = await browserApi.run({
         url: browserUrl.trim(),
         goal: browserGoal.trim(),
         actions: parsedActions,
       });

       setBrowserResult(data);
       setBrowserInsight(data.insight || {
         summary: data.summary || '',
         keyFindings: data.keyFindings || [],
         nextSteps: data.nextSteps || [],
         achieved: data.achieved,
       });
     } catch (error) {
       setSearchError(error.message);
     } finally {
       setSearchLoading(false);
     }
   };

  const saveNote = async (event) => {
    event.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) {
      setNoteError('Title and content are required');
      return;
    }

    setNoteSaving(true);
    setNoteError('');

    try {
      const response = await fetch(`${API_BASE}/internal/memory/${encodeURIComponent(sessionId.trim() || INTERNAL_USER_ID)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: noteTitle.trim(),
          content: noteContent.trim(),
          tags: normalizeTags(noteTags),
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save note');
      }

      setSummary((previous) => ({
        ...previous,
        notes: data.notes || previous.notes,
      }));
      setNoteInsight(data.noteInsight || {
        summary: '',
        suggestedTags: normalizeTags(noteTags),
        importance: 'normal',
        followUp: '',
      });
      setNoteTitle('');
      setNoteContent('');
      setNoteTags('oracle,phantom');
    } catch (error) {
      setNoteError(error.message);
    } finally {
      setNoteSaving(false);
    }
  };

  const deleteNote = async (noteId) => {
    try {
      const response = await fetch(
        `${API_BASE}/internal/memory/${encodeURIComponent(sessionId.trim() || INTERNAL_USER_ID)}/${noteId}`,
        { method: 'DELETE' }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete note');
      }

      setSummary((previous) => ({
        ...previous,
        notes: previous.notes.filter((note) => String(note.id) !== String(noteId)),
      }));
    } catch (error) {
      setNoteError(error.message);
    }
  };

  const openPublicSite = () => {
    window.location.assign('/');
  };

  return (
    <div className="internal-lab-page">
      <div className="internal-lab-shell">
        <header className="internal-lab-header">
          <div>
            <div className="internal-lab-kicker">
              <BrainCircuit size={14} /> Internal Lab
            </div>
            <h1>Arcturus-inspired travel toolkit</h1>
            <p>
              Hidden from the public site. Use this space to test live research, browser workflows,
              memory notes, and session history before promoting anything to the launch UI.
            </p>
            <div className="internal-lab-model-pill">
              <ShieldCheck size={14} />
              {labStatus?.ollama?.model
                ? `Same Ollama model as the agent: ${labStatus.ollama.model}`
                : 'Loading agent model...'}
            </div>
          </div>

          <div className="internal-lab-header-actions">
            <button type="button" className="internal-lab-secondary-btn" onClick={openPublicSite}>
              <ArrowLeft size={14} /> Public site
            </button>
            <button type="button" className="internal-lab-secondary-btn" onClick={() => loadSummary()}>
              <Workflow size={14} /> Refresh
            </button>
          </div>
        </header>

        <section className="internal-lab-feature-grid">
          {featureSummary.map((feature) => (
            <article key={feature.name} className="internal-lab-feature-card">
              <div className="internal-lab-feature-top">
                <span className="internal-lab-feature-name">{feature.name}</span>
                <span className={`internal-lab-feature-status status-${feature.status}`}>{feature.status}</span>
              </div>
              <h3>{feature.label}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="internal-lab-toolbar">
          <div className="internal-lab-session-box">
            <label htmlFor="internal-session">Session ID</label>
            <input
              id="internal-session"
              type="text"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              placeholder="internal-lab"
              className="internal-lab-input"
            />
            <p className="internal-lab-helper">Used for Chronicle-style history and Mnemo-style notes.</p>
          </div>

          <div className="internal-lab-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`internal-lab-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        <section className="internal-lab-content">
          {activeTab === 'research' && (
            <div className="internal-lab-grid two-column">
              <form className="internal-lab-panel" onSubmit={runResearchSearch}>
                <div className="internal-lab-panel-header">
                  <div>
                    <h2><Search size={16} /> Oracle</h2>
                    <p>Search the live web for destination facts, booking context, and timing cues.</p>
                  </div>
                </div>

                <label className="internal-lab-label">Search query</label>
                <textarea
                  className="internal-lab-textarea"
                  rows="4"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="best time to visit goa in april"
                />

                <div className="internal-lab-inline-controls">
                  <div>
                    <label className="internal-lab-label">Limit</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={searchLimit}
                      onChange={(event) => setSearchLimit(event.target.value)}
                      className="internal-lab-input"
                    />
                  </div>

                  <button type="submit" className="internal-lab-primary-btn" disabled={searchLoading}>
                    {searchLoading ? <Loader2 size={14} className="spin" /> : <Globe2 size={14} />}
                    Search
                  </button>
                </div>

                {searchError && <div className="internal-lab-error">{searchError}</div>}

                <div className="internal-lab-results">
                  {searchInsight && (searchInsight.summary || (searchInsight.keyPoints || []).length > 0) && (
                    <div className="internal-lab-insight-card">
                      <div className="internal-lab-insight-header">
                        <h3>Ollama synthesis</h3>
                        <span className="internal-lab-insight-badge">
                          {labStatus?.ollama?.model || 'Ollama'} · {searchProviderLabel}
                          {searchInsight?.ollamaTimedOut ? ' · fallback' : ''}
                        </span>
                      </div>
                      {searchInsight.summary && <p>{searchInsight.summary}</p>}
                      {(searchInsight.keyPoints || []).length > 0 && (
                        <ul>
                          {searchInsight.keyPoints.map((point, index) => (
                            <li key={`${point}-${index}`}>{point}</li>
                          ))}
                        </ul>
                      )}
                      {searchInsight.followUpQuery && (
                        <div className="internal-lab-helper">Follow-up query: {searchInsight.followUpQuery}</div>
                      )}
                    </div>
                  )}

                  {searchResults.length === 0 ? (
                    <div className="internal-lab-empty">Search results will appear here.</div>
                  ) : (
                    searchResults.map((result) => (
                      <article key={`${result.rank}-${result.url}`} className="internal-lab-result-card">
                        <div className="internal-lab-result-head">
                          <div>
                            <div className="internal-lab-result-rank">#{result.rank}</div>
                            <h3>{result.title}</h3>
                          </div>
                          <a className="internal-lab-link" href={result.url} target="_blank" rel="noreferrer">
                            <ExternalLink size={14} /> Open
                          </a>
                        </div>
                        <p className="internal-lab-result-url">{result.url}</p>
                        <p className="internal-lab-result-snippet">{result.snippet || 'No snippet available'}</p>
                        <div className="internal-lab-result-actions">
                          <button
                            type="button"
                            className="internal-lab-ghost-btn"
                            onClick={() => {
                              setReadUrl(result.url);
                              readSearchResult(result.url);
                              setActiveTab('research');
                            }}
                          >
                            Read URL
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </form>

              <div className="internal-lab-panel">
                <div className="internal-lab-panel-header">
                  <div>
                    <h2><NotebookTabs size={16} /> Read URL</h2>
                    <p>Fetch and extract readable content from a specific page.</p>
                  </div>
                </div>

                <label className="internal-lab-label">URL</label>
                <input
                  type="url"
                  className="internal-lab-input"
                  value={readUrl}
                  onChange={(event) => setReadUrl(event.target.value)}
                  placeholder="https://example.com"
                />

                <button type="button" className="internal-lab-primary-btn" onClick={() => readSearchResult()} disabled={searchLoading}>
                  {searchLoading ? <Loader2 size={14} className="spin" /> : <Radar size={14} />}
                  Read page
                </button>

                {readInsight && (readInsight.summary || (readInsight.keyFacts || []).length > 0) && (
                  <div className="internal-lab-insight-card">
                    <div className="internal-lab-insight-header">
                      <h3>Ollama reading</h3>
                        <span className="internal-lab-insight-badge">
                          {labStatus?.ollama?.model || 'Ollama'}
                          {readInsight?.ollamaTimedOut ? ' · fallback' : ''}
                        </span>
                    </div>
                    {readInsight.summary && <p>{readInsight.summary}</p>}
                    {(readInsight.keyFacts || []).length > 0 && (
                      <ul>
                        {readInsight.keyFacts.map((fact, index) => (
                          <li key={`${fact}-${index}`}>{fact}</li>
                        ))}
                      </ul>
                    )}
                    {readInsight.recommendedAction && (
                      <div className="internal-lab-helper">Recommended action: {readInsight.recommendedAction}</div>
                    )}
                  </div>
                )}

                {readResult && (
                  <div className="internal-lab-read-result">
                    <h3>{readResult.title}</h3>
                    <p className="internal-lab-result-url">{readResult.url}</p>
                    <pre className="internal-lab-prewrap">{readResult.content}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'browser' && (
            <div className="internal-lab-grid two-column">
              <form className="internal-lab-panel" onSubmit={runBrowserWorkflow}>
                <div className="internal-lab-panel-header">
                  <div>
                    <h2><WandSparkles size={16} /> Phantom</h2>
                    <p>Run a small headless-browser workflow for a site that needs clicks or form input.</p>
                  </div>
                </div>

                <label className="internal-lab-label">Start URL</label>
                <input
                  type="url"
                  className="internal-lab-input"
                  value={browserUrl}
                  onChange={(event) => setBrowserUrl(event.target.value)}
                  placeholder="https://example.com"
                />

                <label className="internal-lab-label">Goal</label>
                <input
                  type="text"
                  className="internal-lab-input"
                  value={browserGoal}
                  onChange={(event) => setBrowserGoal(event.target.value)}
                  placeholder="What should the browser do?"
                />

                <label className="internal-lab-label">Actions JSON</label>
                <textarea
                  className="internal-lab-textarea internal-lab-textarea-large"
                  rows="12"
                  value={browserActions}
                  onChange={(event) => setBrowserActions(event.target.value)}
                />

                <button type="submit" className="internal-lab-primary-btn" disabled={searchLoading}>
                  {searchLoading ? <Loader2 size={14} className="spin" /> : <Workflow size={14} />}
                  Run browser workflow
                </button>

                <p className="internal-lab-helper">
                  Leave the actions empty to let Ollama plan the workflow. Supported actions: <code>goto</code>, <code>click</code>, <code>type</code>, <code>press</code>, <code>wait</code>, <code>select</code>.
                </p>
              </form>

              <div className="internal-lab-panel">
                <div className="internal-lab-panel-header">
                  <div>
                    <h2><LayoutPanelTop size={16} /> Browser result</h2>
                    <p>Inspect the final page state and the execution log.</p>
                  </div>
                </div>

                {browserResult ? (
                  <div className="internal-lab-read-result">
                    <h3>{browserResult.title}</h3>
                    <p className="internal-lab-result-url">{browserResult.url}</p>
                    {browserInsight && (browserInsight.summary || (browserInsight.keyFindings || []).length > 0) && (
                      <div className="internal-lab-insight-card internal-lab-insight-card--compact">
                        <div className="internal-lab-insight-header">
                          <h3>Ollama analysis</h3>
                          <span className="internal-lab-insight-badge">
                            {labStatus?.ollama?.model || 'Ollama'}
                            {browserInsight?.ollamaTimedOut ? ' · fallback' : ''}
                          </span>
                        </div>
                        {browserInsight.summary && <p>{browserInsight.summary}</p>}
                        {(browserInsight.keyFindings || []).length > 0 && (
                          <ul>
                            {browserInsight.keyFindings.map((finding, index) => (
                              <li key={`${finding}-${index}`}>{finding}</li>
                            ))}
                          </ul>
                        )}
                        {browserInsight.nextSteps && browserInsight.nextSteps.length > 0 && (
                          <div className="internal-lab-helper">Next steps: {browserInsight.nextSteps.join(' · ')}</div>
                        )}
                      </div>
                    )}
                    <div className="internal-lab-chip-row">
                      {(browserResult.executionLog || []).map((entry) => (
                        <span key={entry} className="internal-lab-chip">{entry}</span>
                      ))}
                    </div>
                    <pre className="internal-lab-prewrap">{browserResult.content}</pre>
                  </div>
                ) : (
                  <div className="internal-lab-empty">Run a browser workflow to see the final extracted content here.</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="internal-lab-grid two-column">
              <form className="internal-lab-panel" onSubmit={saveNote}>
                <div className="internal-lab-panel-header">
                  <div>
                    <h2><BrainCircuit size={16} /> Mnemo</h2>
                    <p>Save internal notes, preferences, and research breadcrumbs.</p>
                  </div>
                </div>

                <label className="internal-lab-label">Title</label>
                <input
                  type="text"
                  className="internal-lab-input"
                  value={noteTitle}
                  onChange={(event) => setNoteTitle(event.target.value)}
                  placeholder="Goa hotel preference"
                />

                <label className="internal-lab-label">Tags</label>
                <input
                  type="text"
                  className="internal-lab-input"
                  value={noteTags}
                  onChange={(event) => setNoteTags(event.target.value)}
                  placeholder="oracle,booking,preferences"
                />

                <label className="internal-lab-label">Content</label>
                <textarea
                  className="internal-lab-textarea internal-lab-textarea-large"
                  rows="10"
                  value={noteContent}
                  onChange={(event) => setNoteContent(event.target.value)}
                  placeholder="Store a preference or research note..."
                />

                <button type="submit" className="internal-lab-primary-btn" disabled={noteSaving}>
                  {noteSaving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                  Save note
                </button>

                {noteError && <div className="internal-lab-error">{noteError}</div>}

                {noteInsight && (noteInsight.summary || (noteInsight.suggestedTags || []).length > 0) && (
                  <div className="internal-lab-insight-card">
                    <div className="internal-lab-insight-header">
                      <h3>Ollama note analysis</h3>
                      <span className="internal-lab-insight-badge">
                        {labStatus?.ollama?.model || 'Ollama'}
                        {noteInsight?.ollamaTimedOut ? ' · fallback' : ''}
                      </span>
                    </div>
                    {noteInsight.summary && <p>{noteInsight.summary}</p>}
                    {(noteInsight.suggestedTags || []).length > 0 && (
                      <div className="internal-lab-chip-row">
                        {(noteInsight.suggestedTags || []).map((tag) => (
                          <span key={tag} className="internal-lab-chip">{tag}</span>
                        ))}
                      </div>
                    )}
                    {noteInsight.followUp && <div className="internal-lab-helper">Follow-up: {noteInsight.followUp}</div>}
                  </div>
                )}
              </form>

              <div className="internal-lab-panel">
                <div className="internal-lab-panel-header">
                  <div>
                    <h2><BrainCircuit size={16} /> Saved notes</h2>
                    <p>Stored in SQLite for internal testing only.</p>
                  </div>
                </div>

                <div className="internal-lab-note-grid">
                  {(summary.notes || []).length === 0 ? (
                    <div className="internal-lab-empty">No internal notes saved yet.</div>
                  ) : (
                    summary.notes.map((note) => (
                      <article key={note.id} className="internal-lab-note-card">
                        <div className="internal-lab-note-head">
                          <div>
                            <h3>{note.title}</h3>
                            <p>{new Date(note.createdAt).toLocaleString()}</p>
                          </div>
                          <button type="button" className="internal-lab-icon-btn" onClick={() => deleteNote(note.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <p>{note.content}</p>
                        <div className="internal-lab-chip-row">
                          {(note.tags || []).map((tag) => (
                            <span key={`${note.id}-${tag}`} className="internal-lab-chip">{tag}</span>
                          ))}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="internal-lab-grid two-column">
              <div className="internal-lab-panel">
                <div className="internal-lab-panel-header">
                  <div>
                    <h2><History size={16} /> Chronicle</h2>
                    <p>Conversation history and saved plans for reproducibility.</p>
                  </div>
                </div>

                {summaryLoading ? (
                  <div className="internal-lab-empty">Loading session summary...</div>
                ) : summaryError ? (
                  <div className="internal-lab-error">{summaryError}</div>
                ) : (
                  <>
                    {sessionInsight && (sessionInsight.summary || (sessionInsight.highlights || []).length > 0) && (
                      <div className="internal-lab-insight-card">
                        <div className="internal-lab-insight-header">
                          <h3>Ollama session summary</h3>
                          <span className="internal-lab-insight-badge">
                            {labStatus?.ollama?.model || 'Ollama'}
                            {sessionInsight?.ollamaTimedOut ? ' · fallback' : ''}
                          </span>
                        </div>
                        {sessionInsight.summary && <p>{sessionInsight.summary}</p>}
                        {(sessionInsight.highlights || []).length > 0 && (
                          <ul>
                            {sessionInsight.highlights.map((highlight, index) => (
                              <li key={`${highlight}-${index}`}>{highlight}</li>
                            ))}
                          </ul>
                        )}
                        {(sessionInsight.nextSteps || []).length > 0 && (
                          <div className="internal-lab-helper">Next steps: {sessionInsight.nextSteps.join(' · ')}</div>
                        )}
                      </div>
                    )}

                    <h3 className="internal-lab-section-title">Conversation history</h3>
                    <div className="internal-lab-session-list">
                      {(summary.conversations || []).length === 0 ? (
                        <div className="internal-lab-empty">No conversation history for this session.</div>
                      ) : (
                        summary.conversations.map((message) => (
                          <article key={message.id} className="internal-lab-session-card">
                            <div className="internal-lab-session-meta">
                              <span>{message.sender}</span>
                              <span>{new Date(message.timestamp).toLocaleString()}</span>
                            </div>
                            <p>{message.message}</p>
                          </article>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="internal-lab-panel">
                <div className="internal-lab-panel-header">
                  <div>
                    <h2><Sparkles size={16} /> Stored plans</h2>
                    <p>Use this to verify plan persistence while testing changes.</p>
                  </div>
                </div>

                <div className="internal-lab-session-list">
                  {(summary.plans || []).length === 0 ? (
                    <div className="internal-lab-empty">No plans stored for this session.</div>
                  ) : (
                    summary.plans.map((plan) => (
                      <article key={plan.id || plan.planId} className="internal-lab-session-card">
                        <div className="internal-lab-session-meta">
                          <span>{plan.destination || 'Trip plan'}</span>
                          <span>{new Date(plan.createdAt || plan.updatedAt).toLocaleString()}</span>
                        </div>
                        <p>
                          {plan.planData?.summary?.destination || plan.planData?.summary?.title || 'Stored travel plan'}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}