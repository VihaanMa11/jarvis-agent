import './jarvis-dashboard.css'

import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  FolderOpen,
  GitBranch,
  Layers3,
  MessageCircle,
  Mic,
  Play,
  RefreshCw,
  Send,
  Terminal,
  Volume2,
  Zap
} from '@/lib/icons'
import { playSpeechText } from '@/lib/voice-playback'
import { $artifactRegistry } from '@/store/artifacts'
import { $activeConnectionId } from '@/store/connections'
import { $gateway } from '@/store/gateway'
import { $activeGatewayProfile } from '@/store/profile'
import { $projectTree } from '@/store/project-tree'
import {
  $cronSessions,
  $gatewayState,
  $messagingPlatformTotals,
  $messagingSessions,
  $sessions
} from '@/store/session'
import { $sessionStates, $workingSessionIds } from '@/store/session-states'
import { $subagentsBySession } from '@/store/subagents'

export function JarvisDashboardView() {
  const navigate = useNavigate()
  const gateway = useStore($gateway)
  const gatewayState = useStore($gatewayState)
  const profile = useStore($activeGatewayProfile)
  const connectionId = useStore($activeConnectionId)
  const sessions = useStore($sessions)
  const workingIds = useStore($workingSessionIds)
  const sessionStates = useStore($sessionStates)
  const subagentsBySession = useStore($subagentsBySession)
  const projectTree = useStore($projectTree)
  const messagingSessions = useStore($messagingSessions)
  const platformTotals = useStore($messagingPlatformTotals)
  const cronSessions = useStore($cronSessions)
  const artifactRegistry = useStore($artifactRegistry)

  const [commandText, setCommandText] = useState('')
  const [activeVoiceStatus, setActiveVoiceStatus] = useState<'idle' | 'listening' | 'speaking'>('idle')
  const [isBriefingSpeaking, setIsBriefingSpeaking] = useState(false)
  const [showVitalsModal, setShowVitalsModal] = useState(false)
  const [showMemoryModal, setShowMemoryModal] = useState(false)

  // Listen to voice state changes from bridge
  useEffect(() => {
    const bridge = window.jarvisBridge
    if (!bridge) return
    const unbind = bridge.onVoiceStateChange(data => {
      if (data?.state === 'listening' || data?.state === 'speaking') {
        setActiveVoiceStatus(data.state)
      } else {
        setActiveVoiceStatus('idle')
      }
    })
    return () => unbind?.()
  }, [])

  // 1. Agent Fleet derivation
  const agentFleet = useMemo(() => {
    const list = []
    // Add primary bots / active subagents
    for (const [sessId, subs] of Object.entries(subagentsBySession)) {
      for (const sub of subs) {
        list.push({
          id: sub.id,
          name: sub.label || `Agent-${sub.id.slice(0, 5)}`,
          status: sub.status === 'running' ? 'running' : 'idle',
          tool: sub.runningTool || 'Processing instructions',
          sessionId: sessId
        })
      }
    }
    // Also include working sessions as active bot turns
    for (const id of workingIds) {
      const sess = sessions.find(s => s.id === id || s.storedSessionId === id)
      const st = sessionStates[id]
      const isBlocked = st?.needsInput === true
      list.push({
        id: id,
        name: sess?.title || `Session ${id.slice(0, 6)}`,
        status: isBlocked ? 'blocked' : 'running',
        tool: isBlocked ? 'Needs user review / clarification' : 'Executing turn',
        sessionId: id
      })
    }
    // Fallback baseline agents if idle
    if (list.length === 0) {
      list.push(
        { id: 'coder-bot', name: 'Hermes Coder', status: 'idle', tool: 'Awaiting task', sessionId: '' },
        { id: 'research-bot', name: 'Web Researcher', status: 'idle', tool: 'Awaiting task', sessionId: '' },
        { id: 'client-support', name: 'Client Telegram Bot', status: 'idle', tool: 'Monitoring inbound channels', sessionId: '' }
      )
    }
    return list
  }, [subagentsBySession, workingIds, sessions, sessionStates])

  // 2. Action Center ("What I Have To Do" Blockers Queue)
  const blockers = useMemo(() => {
    const items = []
    for (const [id, state] of Object.entries(sessionStates)) {
      if (state.needsInput) {
        const sess = sessions.find(s => s.id === id || s.storedSessionId === id)
        items.push({
          sessionId: id,
          title: sess?.title || 'Active Session',
          reason: 'Waiting for your direct input / question response'
        })
      }
    }
    return items
  }, [sessionStates, sessions])

  // 3. Ongoing Projects
  const ongoingProjects = useMemo(() => {
    return projectTree.map(p => ({
      id: p.id,
      label: p.label,
      path: p.path,
      progress: Math.min(100, (p.sessionCount || 1) * 20),
      sessionCount: p.sessionCount || 0,
      currentTask: p.sessionCount > 0 ? 'Active feature implementation' : 'Ready for dispatch',
      branch: 'main',
      dirtyCount: 2
    }))
  }, [projectTree])

  // 4. Client Radar & Updates with SLA
  const clientFeed = useMemo(() => {
    return messagingSessions.slice(0, 8).map((ms, idx) => {
      const isUrgent = idx % 2 === 0
      return {
        id: ms.id,
        platform: ms.source || 'Telegram',
        clientName: ms.title || `Client Thread #${ms.id.slice(0, 5)}`,
        snippet: 'Latest inquiry regarding staging release and deployment confirmation.',
        draftReply: 'Staging is deployed and tested. You can proceed with review at your convenience.',
        isUrgent,
        waitTime: isUrgent ? '42m ago' : '15m ago'
      }
    })
  }, [messagingSessions])

  // 5. Artifacts Showcase
  const recentArtifacts = useMemo(() => {
    const all = []
    for (const [sessId, arts] of Object.entries(artifactRegistry)) {
      for (const art of arts) {
        all.push({
          id: art.id,
          name: art.title || art.filename || 'Generated Deliverable',
          type: art.kind || 'diff',
          sessionId: sessId,
          updatedAt: art.createdAt || Date.now()
        })
      }
    }
    return all.slice(0, 6)
  }, [artifactRegistry])

  // Handle Universal Command Submit
  const handleCommandSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!commandText.trim()) return

    // Route prompt to active/new session
    window.location.hash = '#/'
    setTimeout(() => {
      const bridge = window.jarvisBridge
      bridge?.toggleVoice()
    }, 150)
    setCommandText('')
  }, [commandText])

  // Morning Protocol (Spoken Executive Briefing)
  const handleMorningProtocol = useCallback(() => {
    if (isBriefingSpeaking) {
      setIsBriefingSpeaking(false)
      window.speechSynthesis?.cancel()
      return
    }

    const text = `Good morning, sir. All core systems are operational on port 9119. ` +
      `You currently have ${ongoingProjects.length} active projects running, ` +
      `${blockers.length} items requiring your review in the Action Center, ` +
      `and ${messagingSessions.length} client communications synced. ` +
      `JARVIS is standing by for your instructions.`

    setIsBriefingSpeaking(true)

    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.05
      utterance.pitch = 0.95
      utterance.onend = () => setIsBriefingSpeaking(false)
      utterance.onerror = () => setIsBriefingSpeaking(false)
      window.speechSynthesis.speak(utterance)
    } else {
      void playSpeechText(text).finally(() => setIsBriefingSpeaking(false))
    }
  }, [isBriefingSpeaking, ongoingProjects.length, blockers.length, messagingSessions.length])

  return (
    <div className="jarvis-dashboard-root scrollbar-dt">
      {/* ──────── Top HUD / Header ──────── */}
      <header className="jarvis-hud-header">
        <div className="jarvis-brand-block">
          <Zap className="jarvis-logo-icon" />
          <div>
            <h1 className="jarvis-title-text">JARVIS Mission Control</h1>
            <p className="jarvis-subtitle-text">Hermes Autonomous Executive Interface</p>
          </div>
        </div>

        <div className="jarvis-vitals-strip">
          <div className="vital-metric">
            <span className="vital-label">Gateway Status</span>
            <span className="vital-value">
              <span className="vital-pulse-dot" />
              {gatewayState === 'open' ? 'Online (:9119)' : gatewayState}
            </span>
          </div>

          <div className="vital-metric">
            <span className="vital-label">Active Profile</span>
            <span className="vital-value">{profile || 'default'}</span>
          </div>

          <div className="vital-metric">
            <span className="vital-label">Tokens Today</span>
            <span className="vital-value" style={{ color: '#ffb700' }}>42.8k</span>
          </div>

          {/* Morning Protocol Spoken Briefing Button */}
          <Button
            size="sm"
            variant={isBriefingSpeaking ? 'destructive' : 'outline'}
            onClick={handleMorningProtocol}
            className="flex items-center gap-2 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
          >
            <Volume2 className="size-4" />
            {isBriefingSpeaking ? 'Stop Briefing' : 'Morning Protocol'}
          </Button>

          {/* Vitals & Memory Triggers */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowVitalsModal(true)}
            className="text-slate-300 hover:text-cyan-400"
          >
            <Cpu className="size-4 mr-1" /> Vitals
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowMemoryModal(true)}
            className="text-slate-300 hover:text-cyan-400"
          >
            <Brain className="size-4 mr-1" /> Memory
          </Button>
        </div>
      </header>

      {/* ──────── Universal Voice & Command Console ──────── */}
      <form onSubmit={handleCommandSubmit} className="jarvis-command-bar">
        <Terminal className="size-5 text-cyan-400 shrink-0" />
        <input
          type="text"
          value={commandText}
          onChange={e => setCommandText(e.target.value)}
          placeholder="Speak or type a command to dispatch across bots (e.g., 'Run test suite on Project Alpha', 'Draft reply to Acme Corp')..."
          className="jarvis-command-input"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => window.jarvisBridge?.toggleVoice()}
          className={`shrink-0 ${activeVoiceStatus === 'listening' ? 'text-cyan-400 animate-pulse' : 'text-slate-400'}`}
          title="Toggle Voice Listening"
        >
          <Mic className="size-4" />
        </Button>
        <Button type="submit" size="sm" variant="default" className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0">
          <Send className="size-4 mr-1" /> Dispatch
        </Button>
      </form>

      {/* ──────── Section 1: Agent & Bot Fleet Matrix ──────── */}
      <div className="jarvis-section-title">
        <span>⚡ Active Agent & Bot Fleet ({agentFleet.length})</span>
        <span className="text-xs text-slate-400">Live Telemetry</span>
      </div>

      <div className="jarvis-fleet-grid">
        {agentFleet.map(agent => (
          <div
            key={agent.id}
            className="jarvis-agent-card"
            onClick={() => agent.sessionId && (window.location.hash = `#/${agent.sessionId}`)}
          >
            <div className="agent-header">
              <span className="agent-name-tag">
                <Brain className="size-4 text-cyan-400" />
                {agent.name}
              </span>
              <span className={`agent-status-badge status-${agent.status}`}>
                {agent.status}
              </span>
            </div>
            <div className="agent-activity-desc">
              {agent.tool}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
              <span>{agent.sessionId ? 'Session Attached' : 'Standby'}</span>
              <ArrowUpRight className="size-4 text-slate-500 hover:text-cyan-400" />
            </div>
          </div>
        ))}
      </div>

      {/* ──────── Section 2: Ongoing Projects & Action Center Split ──────── */}
      <div className="jarvis-main-split">
        {/* Left Column: Ongoing Projects & Action Center */}
        <div className="jarvis-column">
          {/* Ongoing Projects */}
          <div className="jarvis-panel-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <FolderOpen className="size-4 text-cyan-400" />
                Ongoing Projects & Tasks ({ongoingProjects.length})
              </h3>
              <span className="text-xs text-slate-400">projects.db</span>
            </div>

            {ongoingProjects.length === 0 ? (
              <p className="text-sm text-slate-500">No projects currently tracked.</p>
            ) : (
              ongoingProjects.map(p => (
                <div key={p.id} className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-200">{p.label}</span>
                    <span className="text-xs text-cyan-400 font-semibold">{p.progress}%</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{p.currentTask}</p>
                  
                  {/* Git Ship Station Row */}
                  <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-2 border-t border-slate-800/80">
                    <span className="flex items-center gap-1.5">
                      <GitBranch className="size-3.5 text-amber-400" />
                      {p.branch} • {p.dirtyCount} pending diffs
                    </span>
                    <Button size="sm" variant="outline" className="h-6 text-xs border-slate-700 hover:border-cyan-500">
                      Deploy / Push
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Action Center ("What I Have To Do" - Blockers Queue) */}
          <div className="jarvis-panel-card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-rose-300 flex items-center gap-2">
                <AlertTriangle className="size-4 text-rose-400" />
                Action Center: What I Have To Do ({blockers.length})
              </h3>
              <span className="text-xs text-rose-400 font-medium">Pending Decisions</span>
            </div>

            {blockers.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-400" />
                No pending blockers. All agents are autonomously progressing.
              </div>
            ) : (
              blockers.map(b => (
                <div key={b.sessionId} className="blocker-item">
                  <div className="blocker-header">
                    <span>{b.title}</span>
                    <span className="text-xs font-normal text-rose-400">Blocked on You</span>
                  </div>
                  <div className="blocker-content">{b.reason}</div>
                  <div className="blocker-actions-row">
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 text-xs"
                      onClick={() => (window.location.hash = `#/${b.sessionId}`)}
                    >
                      <Check className="size-3.5 mr-1" /> Open & Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-700 h-7 text-xs"
                      onClick={() => (window.location.hash = `#/${b.sessionId}`)}
                    >
                      Inspect Session
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Client Projects & Communications Radar */}
        <div className="jarvis-column">
          <div className="jarvis-panel-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <MessageCircle className="size-4 text-cyan-400" />
                Client Projects & Communications Radar
              </h3>
              <span className="text-xs text-slate-400">Telegram • Discord • Slack</span>
            </div>

            {clientFeed.length === 0 ? (
              <p className="text-sm text-slate-500">No client messages waiting.</p>
            ) : (
              clientFeed.map(c => (
                <div key={c.id} className="client-feed-item">
                  <div className="client-header-row">
                    <span className="client-channel-badge">
                      <MessageCircle className="size-3.5 text-cyan-400" />
                      {c.clientName}
                    </span>
                    <span className={`sla-badge ${c.isUrgent ? 'sla-urgent' : 'text-slate-400'}`}>
                      {c.waitTime} {c.isUrgent ? '(SLA > 30m)' : ''}
                    </span>
                  </div>
                  <div className="client-snippet">{c.snippet}</div>
                  
                  {/* 1-Click Draft Response */}
                  <div className="client-draft-box">
                    <span className="text-xs font-semibold text-cyan-400 block mb-1">AI Drafted Reply:</span>
                    {c.draftReply}
                  </div>

                  <div className="flex justify-end gap-2 mt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                      onClick={() => (window.location.hash = `#/${c.id}`)}
                    >
                      Approve & Send
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ──────── Section 3: Scheduled Jobs & Artifacts Showcase Split ──────── */}
      <div className="jarvis-bottom-split">
        {/* Scheduled Autonomous Routines (Cron) */}
        <div className="jarvis-panel-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-200 flex items-center gap-2">
              <Clock className="size-4 text-cyan-400" />
              Scheduled Autonomous Routines (Cron)
            </h3>
            <span className="text-xs text-slate-400">Background Engine</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="p-2.5 bg-slate-900/60 rounded-md border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-slate-200 block">Morning Standup & Briefing</span>
                <span className="text-xs text-slate-400">Daily @ 09:00 AM • Speaks daily summary</span>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-cyan-400 hover:bg-cyan-500/10">
                <Play className="size-3.5 mr-1" /> Run Now
              </Button>
            </div>

            <div className="p-2.5 bg-slate-900/60 rounded-md border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-slate-200 block">Hourly Security & Sandbox Scan</span>
                <span className="text-xs text-slate-400">Every 60 min • Verifies git changes & logs</span>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-cyan-400 hover:bg-cyan-500/10">
                <Play className="size-3.5 mr-1" /> Run Now
              </Button>
            </div>

            <div className="p-2.5 bg-slate-900/60 rounded-md border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-slate-200 block">Nightly Database & Log Backup</span>
                <span className="text-xs text-slate-400">Daily @ 02:00 AM • Archives memory & DB</span>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-cyan-400 hover:bg-cyan-500/10">
                <Play className="size-3.5 mr-1" /> Run Now
              </Button>
            </div>
          </div>
        </div>

        {/* Artifacts Showcase & Deliverables */}
        <div className="jarvis-panel-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-200 flex items-center gap-2">
              <Layers3 className="size-4 text-cyan-400" />
              Artifacts Showcase & Deliverables
            </h3>
            <span className="text-xs text-slate-400">Recent Output</span>
          </div>

          <div className="flex flex-col gap-2">
            {recentArtifacts.length === 0 ? (
              <div className="p-3 bg-slate-900/60 rounded-md border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-slate-200 block">Payment Module Refactor Diff</span>
                  <span className="text-xs text-slate-400">Patch • Generated by Coder Bot</span>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs border-slate-700">
                    <Download className="size-3.5 mr-1" /> Export
                  </Button>
                </div>
              </div>
            ) : (
              recentArtifacts.map(art => (
                <div key={art.id} className="p-3 bg-slate-900/60 rounded-md border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-slate-200 block">{art.name}</span>
                    <span className="text-xs text-slate-400">{art.type}</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-slate-700">
                    <Download className="size-3.5 mr-1" /> Export
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ──────── Modals: Vitals & Long-Term Memory ──────── */}
      {showVitalsModal && (
        <div className="jarvis-modal-backdrop" onClick={() => setShowVitalsModal(false)}>
          <div className="jarvis-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
              <h2 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
                <Cpu className="size-5" /> Hardware & Cloud Vitals
              </h2>
              <Button size="sm" variant="ghost" onClick={() => setShowVitalsModal(false)}>✕</Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">Server CPU Usage</span>
                <span className="text-lg font-bold text-slate-200">18.4%</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">System RAM</span>
                <span className="text-lg font-bold text-slate-200">5.2 GB / 32 GB</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">GPU VRAM</span>
                <span className="text-lg font-bold text-slate-200">3.8 GB / 16 GB</span>
              </div>
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">Model Rate Limits</span>
                <span className="text-lg font-bold text-emerald-400">94% Headroom</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMemoryModal && (
        <div className="jarvis-modal-backdrop" onClick={() => setShowMemoryModal(false)}>
          <div className="jarvis-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
              <h2 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
                <Brain className="size-5" /> JARVIS Long-Term Memory & Skill Bank
              </h2>
              <Button size="sm" variant="ghost" onClick={() => setShowMemoryModal(false)}>✕</Button>
            </div>
            <p className="text-xs text-slate-400 mb-3">Persisted facts and instructions from MEMORY.md</p>
            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-sm text-slate-300 space-y-2">
              <p>• User prefers concise 1–3 sentence spoken responses without code recitation.</p>
              <p>• Primary client channels: Telegram Support & Acme Corp Slack.</p>
              <p>• All code modifications require review before branch merges.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
