import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertCircle, ArrowDown, ArrowRight, ArrowUpRight, Bell, BriefcaseBusiness,
  CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown, CircleHelp, Clock3,
  Columns3, Command, FileImage, Filter, Flag, FolderKanban, Gauge, ImagePlus,
  LayoutDashboard, LoaderCircle, LogOut, Mail, MoreHorizontal, Pencil, Plus,
  Search, Settings2, ShieldCheck, Sparkles, Star, Trash2, UserPlus, Users,
  X, XCircle,
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './supabase.js'

const STATUSES = [
  'Note started', 'In progress', 'Processing', 'Under review', 'Blocked',
  'On hold', 'Completed', 'Delivered', 'Final check', 'Closed', 'Resolved',
]
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical']
const SIZES = ['XS', 'S', 'M', 'L', 'XL']
const COLORS = ['#5b67e8', '#238b75', '#df8c46', '#9b68ce', '#d85c73', '#4886c7']
const DONE = new Set(['Completed', 'Delivered', 'Closed', 'Resolved'])

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value, options = { month: 'short', day: 'numeric' }) {
  if (!value) return 'No due date'
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('en', options).format(new Date(year, month - 1, day))
}

function startOfWeek(date = new Date()) {
  const day = date.getDay() || 7
  const monday = new Date(date)
  monday.setDate(date.getDate() - day + 1)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function isDueThisWeek(value) {
  if (!value) return false
  const monday = startOfWeek()
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return value.slice(0, 10) >= localDateString(monday) && value.slice(0, 10) <= localDateString(sunday)
}

function dateIsOverdue(task) {
  return Boolean(task.due_date && task.due_date < localDateString() && !DONE.has(task.status))
}

function reminderTimes(task) {
  if (!task.due_date || DONE.has(task.status)) return []
  const dueAt = new Date(`${task.due_date}T${task.due_time || '23:59'}:00`)
  if (Number.isNaN(dueAt.getTime())) return []
  const createdAt = new Date(task.created_at || Date.now())
  const times = []
  if (task.due_date > localDateString(createdAt)) times.push({ kind: 'day', at: new Date(dueAt.getTime() - 24 * 60 * 60 * 1000), text: `${task.title} is due tomorrow` })
  if (task.due_time) times.push({ kind: 'time', at: new Date(dueAt.getTime() - 3 * 60 * 60 * 1000), text: `${task.title} is due in 3 hours` })
  return times.filter((item) => item.at >= createdAt && item.at < dueAt)
}

function statusClass(status) {
  return status.toLowerCase().replaceAll(' ', '-')
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U'
}

function displayName(profile, user) {
  return profile?.display_name || user?.email?.split('@')[0] || 'there'
}

function errorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.'
}

function taskRank(task) {
  const priority = { Critical: 0, High: 1, Medium: 2, Low: 3 }
  return [dateIsOverdue(task) ? -1 : priority[task.severity] ?? 4, task.due_date ?? '9999-99-99']
}

function sortedTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const [rankA, dueA] = taskRank(a)
    const [rankB, dueB] = taskRank(b)
    return rankA - rankB || dueA.localeCompare(dueB)
  })
}

export default function App() {
  const [session, setSession] = useState(null)
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [passwordSetupComplete, setPasswordSetupComplete] = useState(false)
  const [profile, setProfile] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [projectStatuses, setProjectStatuses] = useState([])
  const [checklists, setChecklists] = useState([])
  const [events, setEvents] = useState([])
  const [signedImages, setSignedImages] = useState({})
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [pageError, setPageError] = useState('')
  const [activeView, setActiveView] = useState('dashboard')
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [modal, setModal] = useState(null)

  const user = session?.user ?? null
  const isAdmin = profile?.role === 'admin'
  const activeProject = projects.find((project) => project.id === activeProjectId)
  const nameFor = useCallback((id) => {
    const person = profiles.find((item) => item.id === id)
    return person?.display_name || person?.email?.split('@')[0] || 'Team member'
  }, [profiles])

  const notify = useCallback((message, tone = 'success') => {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 3600)
  }, [])

  useEffect(() => {
    if (!user || !tasks.length) return undefined
    const checkReminders = () => {
      const now = Date.now()
      const seen = JSON.parse(localStorage.getItem('flowboard-reminders') || '{}')
      for (const task of tasks) for (const reminder of reminderTimes(task)) {
        const key = `${task.id}:${reminder.kind}:${task.due_date}:${task.due_time || ''}`
        if (seen[key] || reminder.at.getTime() > now || new Date(`${task.due_date}T${task.due_time || '23:59'}:00`).getTime() <= now) continue
        seen[key] = true
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Flowboard reminder', { body: reminder.text })
        else notify(reminder.text, 'success')
      }
      localStorage.setItem('flowboard-reminders', JSON.stringify(seen))
    }
    checkReminders()
    const timer = window.setInterval(checkReminders, 60_000)
    return () => window.clearInterval(timer)
  }, [user?.id, tasks, notify])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return undefined
    }
    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (!nextSession) {
        setPasswordRecovery(false)
        setPasswordSetupComplete(false)
        setProfile(null)
        setProfiles([])
        setProjects([])
        setTasks([])
        setEvents([])
      }
      setLoading(false)
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setPageError(error.message)
      setSession(data.session)
      setLoading(false)
    })
    return () => authListener.subscription.unsubscribe()
  }, [])

  const refreshData = useCallback(async (showSpinner = false) => {
    if (!supabase || !user) return
    if (showSpinner) setDataLoading(true)
    setPageError('')
    const [profileResult, peopleResult, projectResult, taskResult, eventResult, statusResult, checklistResult] = await Promise.all([
      supabase.from('profiles').select('id,email,display_name,role,created_at').order('created_at'),
      supabase.from('profiles').select('id,email,display_name,role').order('display_name'),
      supabase.from('projects').select('*').order('updated_at', { ascending: false }),
      supabase.from('tasks').select('*').order('updated_at', { ascending: false }),
      supabase.from('activity_events').select('*').order('created_at', { ascending: false }).limit(14),
      supabase.from('project_statuses').select('*').order('position'),
      supabase.from('checklist_items').select('*').order('position'),
    ])
    const resultError = [profileResult, peopleResult, projectResult, taskResult, eventResult, statusResult, checklistResult].find((result) => result.error)?.error
    if (resultError) {
      setPageError(errorMessage(resultError))
      setDataLoading(false)
      return
    }
    setProfiles(peopleResult.data ?? [])
    setProfile((profileResult.data ?? []).find((item) => item.id === user.id) ?? null)
    setProjects(projectResult.data ?? [])
    setTasks(taskResult.data ?? [])
    setEvents(eventResult.data ?? [])
    setProjectStatuses(statusResult.data ?? [])
    setChecklists(checklistResult.data ?? [])
    const imageRows = (taskResult.data ?? []).filter((item) => item.image_path)
    const imagePairs = await Promise.all(imageRows.map(async (item) => {
      const { data, error } = await supabase.storage.from('activity-attachments').createSignedUrl(item.image_path, 3600)
      return [item.id, error ? '' : data?.signedUrl ?? '']
    }))
    setSignedImages(Object.fromEntries(imagePairs.filter(([, url]) => url)))
    setDataLoading(false)
  }, [user])

  useEffect(() => {
    if (user) refreshData(true)
    else {
      setProfile(null)
      setDataLoading(false)
    }
  }, [user, refreshData])

  useEffect(() => {
    if (!supabase || !user) return undefined
    const channel = supabase.channel(`flowboard-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => refreshData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => refreshData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => refreshData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_events' }, () => refreshData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, refreshData])

  useEffect(() => {
    if (activeProjectId && !projects.some((project) => project.id === activeProjectId)) setActiveProjectId(null)
  }, [activeProjectId, projects])

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return tasks
    return tasks.filter((task) => {
      const project = projects.find((item) => item.id === task.project_id)
      return `${task.title} ${task.description} ${task.status} ${project?.name ?? ''} ${nameFor(task.owner_id)}`.toLowerCase().includes(query)
    })
  }, [tasks, projects, search, nameFor])

  const updateTaskStatus = async (task, status) => {
    if (!supabase || !user) return
    const { error } = await supabase.from('tasks').update({ status }).eq('id', task.id)
    if (error) notify(errorMessage(error), 'error')
    else {
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item))
      notify(`Moved to ${status}`)
      refreshData()
    }
  }

  const manageStatus = async (projectId, status, action) => {
    if (!supabase || !user) return
    const current = projectStatuses.filter((item) => item.project_id === projectId).sort((a, b) => a.position - b.position)
    if (action === 'add') {
      const name = window.prompt('New column name')?.trim()
      if (!name) return
      const { error } = await supabase.from('project_statuses').insert({ project_id: projectId, name, position: current.length })
      if (error) notify(errorMessage(error), 'error'); else { await refreshData(); notify('Column added') }
      return
    }
    if (action === 'rename') {
      if (status.is_resolved) { notify('Resolved is a permanent column.', 'error'); return }
      const nextName = window.prompt('Rename column', status.name)?.trim()
      if (!nextName || nextName === status.name) return
      const { error } = await supabase.from('project_statuses').update({ name: nextName }).eq('id', status.id)
      if (error) notify(errorMessage(error), 'error')
      else {
        await supabase.from('tasks').update({ status: nextName }).eq('project_id', projectId).eq('status', status.name)
        await refreshData(); notify('Column renamed')
      }
      return
    }
    if (action === 'delete') {
      if (status.is_resolved) { notify('Resolved is a protected column.', 'error'); return }
      if (!window.confirm(`Delete “${status.name}”? Cards in it will move to Resolved.`)) return
      const { error: moveError } = await supabase.from('tasks').update({ status: 'Resolved' }).eq('project_id', projectId).eq('status', status.name)
      if (moveError) { notify(errorMessage(moveError), 'error'); return }
      const { error } = await supabase.from('project_statuses').delete().eq('id', status.id)
      if (error) notify(errorMessage(error), 'error'); else { await refreshData(); notify('Column deleted') }
    }
  }

  const saveTask = async ({ values, file, removeImage, task }) => {
    if (!supabase || !user) return
    const projectId = values.project_id
    const project = projects.find((item) => item.id === projectId)
    if (!project) throw new Error('Choose a project before saving this card.')
    if (file && (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024)) {
      throw new Error('Choose an image smaller than 5 MB.')
    }
    const payload = {
      project_id: projectId,
      owner_id: isAdmin ? project.created_by : user.id,
      title: values.title.trim(),
      description: values.description.trim(),
      status: values.status,
      severity: values.severity,
      size: values.size,
      due_date: values.due_date || null,
      due_time: values.due_time || null,
      important: Boolean(values.important),
    }
    if (!payload.title) throw new Error('Add a title for this card.')
    let savedTask
    if (task) {
      const { data, error } = await supabase.from('tasks').update(payload).eq('id', task.id).select().single()
      if (error) throw error
      savedTask = data
    } else {
      const { data, error } = await supabase.from('tasks').insert(payload).select().single()
      if (error) throw error
      savedTask = data
    }

    let nextImagePath = removeImage ? null : task?.image_path ?? null
    let movedStoredImage = false
    if (task?.image_path && task.project_id !== projectId && !file && !removeImage) {
      nextImagePath = `${projectId}/${savedTask.id}/${task.image_path.split('/').at(-1)}`
      const { error } = await supabase.storage.from('activity-attachments').move(task.image_path, nextImagePath)
      if (error) throw error
      movedStoredImage = true
    }
    if (file) {
      const cleanName = file.name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').slice(-90) || 'attachment'
      nextImagePath = `${projectId}/${savedTask.id}/${crypto.randomUUID()}-${cleanName}`
      const { error } = await supabase.storage.from('activity-attachments').upload(nextImagePath, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      })
      if (error) throw error
    }
    if (nextImagePath !== (task?.image_path ?? null)) {
      const { error } = await supabase.from('tasks').update({ image_path: nextImagePath }).eq('id', savedTask.id)
      if (error) throw error
      if (task?.image_path && !movedStoredImage) await supabase.storage.from('activity-attachments').remove([task.image_path])
    }
    if (Array.isArray(values.checklist)) {
      if (task) await supabase.from('checklist_items').delete().eq('task_id', savedTask.id)
      const rows = values.checklist.map((item, position) => ({ task_id: savedTask.id, title: item.title.trim(), is_done: Boolean(item.is_done), position })).filter((item) => item.title)
      if (rows.length) {
        const { error } = await supabase.from('checklist_items').insert(rows)
        if (error) throw error
      }
    }
    setModal(null)
    await refreshData()
    notify(task ? 'Card updated' : 'Card created')
  }

  const saveProject = async (values, project) => {
    if (!supabase || !user) return
    const payload = {
      name: values.name.trim(),
      description: values.description.trim(),
      color: values.color,
      created_by: project?.created_by ?? (isAdmin ? values.created_by : user.id),
    }
    if (!payload.name) throw new Error('Add a project name.')
    const query = project
      ? supabase.from('projects').update(payload).eq('id', project.id)
      : supabase.from('projects').insert(payload)
    const { error } = await query
    if (error) throw error
    setModal(null)
    await refreshData()
    notify(project ? 'Project updated' : 'Project created')
  }

  const deleteTask = async (task) => {
    if (!supabase) return
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return
    if (task.image_path) await supabase.storage.from('activity-attachments').remove([task.image_path])
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) notify(errorMessage(error), 'error')
    else {
      setModal(null)
      await refreshData()
      notify('Card deleted')
    }
  }

  const deleteProject = async (project) => {
    if (!supabase) return
    const childCount = tasks.filter((task) => task.project_id === project.id).length
    if (!window.confirm(`Delete “${project.name}” and its ${childCount} ${childCount === 1 ? 'card' : 'cards'}? This cannot be undone.`)) return
    const imagePaths = tasks.filter((task) => task.project_id === project.id && task.image_path).map((task) => task.image_path)
    if (imagePaths.length) await supabase.storage.from('activity-attachments').remove(imagePaths)
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    if (error) notify(errorMessage(error), 'error')
    else {
      setActiveProjectId(null)
      setModal(null)
      await refreshData()
      notify('Project deleted')
    }
  }

  const inviteUser = async ({ email, displayName: invitedName }) => {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email, display_name: invitedName },
    })
    if (error) {
      if (error.context instanceof Response) {
        try {
          const responseBody = await error.context.json()
          if (responseBody?.error) throw new Error(responseBody.error)
        } catch (responseError) {
          if (responseError instanceof Error && responseError.message !== error.message) throw responseError
        }
      }
      throw error
    }
    if (data?.error) throw new Error(data.error)
    setModal(null)
    notify(`Invite sent to ${email}`)
    await refreshData()
  }

  const adminUserAction = async (payload) => {
    const { data, error } = await supabase.functions.invoke('admin-users', { body: payload })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    await refreshData()
    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setActiveView('dashboard')
    setActiveProjectId(null)
  }

  if (!isSupabaseConfigured) return <SetupScreen />
  if (loading) return <LoadingScreen label="Opening your workspace…" />
  if (!session) return <LoginScreen notify={notify} />
  if (passwordRecovery || (!passwordSetupComplete && user?.invited_at && user?.user_metadata?.password_initialized !== true)) {
    return <PasswordSetupScreen recovery={passwordRecovery} onComplete={() => { setPasswordRecovery(false); setPasswordSetupComplete(true) }} />
  }
  if (dataLoading && !profile) return <LoadingScreen label="Loading your workspace…" />

  const taskById = Object.fromEntries(tasks.map((task) => [task.id, task]))
  const modalTask = modal?.type === 'task' ? taskById[modal.taskId] ?? null : null

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><Columns3 size={18} strokeWidth={2.4} /></div>
          <span>flowboard<span className="brand-period">.</span></span>
        </div>
        <div className="workspace-switcher">
          <div className="workspace-icon">W</div>
          <div className="workspace-text"><strong>{isAdmin ? 'Workspace' : 'My workspace'}</strong><span>{isAdmin ? 'Admin view' : 'Personal board'}</span></div>
          <ChevronDown size={15} />
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="main-nav">
          <NavButton icon={LayoutDashboard} label="Overview" active={activeView === 'dashboard'} onClick={() => { setActiveView('dashboard'); setActiveProjectId(null) }} />
          <NavButton icon={FolderKanban} label="Projects" active={activeView === 'projects' || activeView === 'board'} onClick={() => { setActiveView('projects'); setActiveProjectId(null) }} badge={projects.length || null} />
          <NavButton icon={Sparkles} label="Insights" active={activeView === 'insights'} onClick={() => { setActiveView('insights'); setActiveProjectId(null) }} />
          {isAdmin && <NavButton icon={Users} label="Team" active={activeView === 'team'} onClick={() => { setActiveView('team'); setActiveProjectId(null) }} />}
        </nav>
        <div className="sidebar-label project-nav-label">{isAdmin ? 'ALL PROJECTS' : 'MY PROJECTS'} <button className="tiny-icon-button" title="Create a project" onClick={() => setModal({ type: 'project' })}><Plus size={14} /></button></div>
        <div className="project-nav-list">
          {projects.slice(0, 7).map((project) => (
            <button key={project.id} className={`project-nav-item ${activeProjectId === project.id ? 'selected' : ''}`} onClick={() => { setActiveProjectId(project.id); setActiveView('board') }}>
              <span className="project-dot" style={{ backgroundColor: project.color }} />
              <span className="project-nav-name">{project.name}</span>
              <span className="project-nav-count">{tasks.filter((task) => task.project_id === project.id && !DONE.has(task.status)).length}</span>
            </button>
          ))}
          {projects.length > 7 && <button className="sidebar-see-all" onClick={() => setActiveView('projects')}>See all projects</button>}
          {projects.length === 0 && <p className="sidebar-empty">Your project list will show here.</p>}
        </div>
        <div className="sidebar-spacer" />
        <button className="help-link" onClick={() => setActiveView('insights')}><CircleHelp size={16} /><span>Help &amp; insights</span></button>
        <div className="sidebar-profile">
          <div className="avatar avatar-purple">{initials(displayName(profile, user))}</div>
          <div className="sidebar-profile-text"><strong>{displayName(profile, user)}</strong><span>{isAdmin ? 'Administrator' : 'Member'}</span></div>
          <button className="tiny-icon-button" title="Sign out" onClick={signOut}><LogOut size={15} /></button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeProject && activeView === 'board' ? activeProject.name : pageTitle(activeView, isAdmin)}</strong></div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search anything…" /><kbd>⌘ K</kbd></label>
            <button className="icon-button notification-button" title="Open insights and enable reminders" onClick={() => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); setActiveView('insights'); setActiveProjectId(null) }}><Bell size={17} />{tasks.some((task) => dateIsOverdue(task) || task.due_date === localDateString()) && <i />}</button>
            <div className="topbar-divider" />
            <button className="avatar avatar-purple topbar-avatar" title={user.email}>{initials(displayName(profile, user))}</button>
          </div>
        </header>

        {pageError && <div className="page-error"><AlertCircle size={17} /><span>{pageError}</span><button className="tiny-icon-button" onClick={() => refreshData(true)}><span>Retry</span></button></div>}

        <main className="main-content">
          {activeView === 'dashboard' && <DashboardView user={user} profile={profile} projects={projects} tasks={visibleTasks} allTasks={tasks} profiles={profiles} events={events} nameFor={nameFor} onOpenProject={(project) => { setActiveProjectId(project.id); setActiveView('board') }} onNewTask={(projectId, status) => setModal({ type: 'task', projectId, status })} onNewProject={() => setModal({ type: 'project' })} onOpenTask={(task) => setModal({ type: 'task', taskId: task.id })} onOpenInsights={() => setActiveView('insights')} />}
          {activeView === 'projects' && <ProjectsView projects={projects} tasks={visibleTasks} onOpen={(project) => { setActiveProjectId(project.id); setActiveView('board') }} onNew={() => setModal({ type: 'project' })} onEdit={(project) => setModal({ type: 'project', projectId: project.id })} onNewTask={(projectId) => setModal({ type: 'task', projectId })} />}
          {activeView === 'board' && activeProject && <BoardView project={activeProject} statuses={projectStatuses.filter((item) => item.project_id === activeProject.id).sort((a, b) => a.position - b.position)} onManageStatus={manageStatus} tasks={visibleTasks.filter((task) => task.project_id === activeProject.id)} profiles={profiles} isAdmin={isAdmin} userId={user.id} imageFor={(task) => signedImages[task.id]} onStatus={updateTaskStatus} onNew={(status) => setModal({ type: 'task', projectId: activeProject.id, status })} onOpen={(task) => setModal({ type: 'task', taskId: task.id })} onEditProject={() => setModal({ type: 'project', projectId: activeProject.id })} onDeleteProject={() => deleteProject(activeProject)} />}
          {activeView === 'board' && !activeProject && <ProjectsView projects={projects} tasks={visibleTasks} onOpen={(project) => { setActiveProjectId(project.id); setActiveView('board') }} onNew={() => setModal({ type: 'project' })} onEdit={(project) => setModal({ type: 'project', projectId: project.id })} onNewTask={(projectId) => setModal({ type: 'task', projectId })} />}
          {activeView === 'insights' && <InsightsView tasks={visibleTasks} profiles={profiles} isAdmin={isAdmin} onOpenTask={(task) => setModal({ type: 'task', taskId: task.id })} />}
          {activeView === 'team' && isAdmin && <TeamView profiles={profiles} projects={projects} tasks={tasks} userId={user.id} onInvite={() => setModal({ type: 'invite' })} onCreate={() => setModal({ type: 'create-member' })} onManage={async (payload) => { try { await adminUserAction(payload); notify('Member updated') } catch (error) { notify(errorMessage(error), 'error') } }} />}
          {activeView === 'team' && !isAdmin && <DashboardView user={user} profile={profile} projects={projects} tasks={visibleTasks} allTasks={tasks} profiles={profiles} events={events} nameFor={nameFor} onOpenProject={(project) => { setActiveProjectId(project.id); setActiveView('board') }} onNewTask={(projectId, status) => setModal({ type: 'task', projectId, status })} onNewProject={() => setModal({ type: 'project' })} onOpenTask={(task) => setModal({ type: 'task', taskId: task.id })} onOpenInsights={() => setActiveView('insights')} />}
        </main>
        <footer className="app-footer"><span>Flowboard <span className="footer-dot">•</span> Activity tracker</span><span><ShieldCheck size={13} /> Private workspace</span></footer>
      </div>

      {modal?.type === 'task' && <TaskModal task={modalTask} projects={projects} profiles={profiles} isAdmin={isAdmin} user={user} statuses={projectStatuses.filter((item) => item.project_id === (modalTask?.project_id ?? modal.projectId))} checklist={checklists.filter((item) => item.task_id === modalTask?.id)} initialProjectId={modal.projectId} initialStatus={modal.status} imageUrl={modalTask ? signedImages[modalTask.id] : ''} onClose={() => setModal(null)} onSave={saveTask} onDelete={modalTask ? () => deleteTask(modalTask) : null} />}
      {modal?.type === 'project' && <ProjectModal project={projects.find((item) => item.id === modal.projectId) ?? null} profiles={profiles} isAdmin={isAdmin} user={user} onClose={() => setModal(null)} onSave={saveProject} onDelete={modal.projectId ? () => deleteProject(projects.find((item) => item.id === modal.projectId)) : null} />}
      {modal?.type === 'invite' && <InviteModal onClose={() => setModal(null)} onInvite={inviteUser} />}
      {modal?.type === 'create-member' && <CreateMemberModal onClose={() => setModal(null)} onCreate={async (values) => { await adminUserAction({ action: 'create', ...values }); setModal(null); notify('Member account created') }} />}
      {toast && <div className={`toast toast-${toast.tone}`}><span className="toast-icon">{toast.tone === 'error' ? <XCircle size={18} /> : <CheckCircle2 size={18} />}</span><span>{toast.message}</span><button className="toast-close" onClick={() => setToast(null)}><X size={15} /></button></div>}
    </div>
  )
}

function pageTitle(view, isAdmin) {
  if (view === 'dashboard') return 'Overview'
  if (view === 'projects') return 'Projects'
  if (view === 'insights') return 'Insights'
  if (view === 'team') return isAdmin ? 'Team' : 'Overview'
  return 'Workspace'
}

function NavButton({ icon: Icon, label, active, onClick, badge }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{badge != null && <span className="nav-badge">{badge}</span>}</button>
}

function SetupScreen() {
  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="brand-lockup setup-brand"><div className="brand-mark"><Columns3 size={18} /></div><span>flowboard<span className="brand-period">.</span></span></div>
        <div className="setup-icon"><Settings2 size={23} /></div>
        <p className="eyebrow">ONE QUICK SETUP</p>
        <h1>Connect your workspace</h1>
        <p className="setup-copy">Add your Supabase project URL and publishable key to the local <code>.env</code> file. The step-by-step guide is included in <code>README.md</code>.</p>
        <div className="setup-code"><span>VITE_SUPABASE_URL=</span> your-project-url<br /><span>VITE_SUPABASE_PUBLISHABLE_KEY=</span> your-key</div>
        <p className="setup-safe"><ShieldCheck size={15} /> Keep secret and service-role keys out of this file.</p>
      </div>
    </div>
  )
}

function LoadingScreen({ label }) {
  return <div className="loading-screen"><div className="loading-brand"><div className="brand-mark"><Columns3 size={18} /></div><span>flowboard<span className="brand-period">.</span></span></div><LoaderCircle className="spin" size={24} /><span>{label}</span></div>
}

function LoginScreen({ notify }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [notice, setNotice] = useState('')

  const signIn = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) setError(signInError.message)
    setBusy(false)
  }

  const resetPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email address first, then select “Forgot password”.')
      return
    }
    setBusy(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    if (resetError) setError(resetError.message)
    else setNotice('Password reset link sent. Check your inbox.')
    setBusy(false)
  }

  return (
    <div className="login-screen">
      <div className="login-decoration login-decoration-one" /><div className="login-decoration login-decoration-two" />
      <div className="login-panel">
        <div className="brand-lockup"><div className="brand-mark"><Columns3 size={18} /></div><span>flowboard<span className="brand-period">.</span></span></div>
        <div className="login-illustration"><div className="illus-card illus-card-back"><i /><i /><i /></div><div className="illus-card illus-card-front"><div className="illus-check"><Check size={15} /></div><span /><span /><div className="illus-footer"><b /><b /><b /></div></div><div className="illus-spark illus-spark-a">✦</div><div className="illus-spark illus-spark-b">✳</div></div>
        <div className="login-heading"><p className="eyebrow">YOUR WORK, IN FLOW</p><h1>Welcome back</h1><p>Sign in to pick up where you left off.</p></div>
        <form onSubmit={signIn} className="login-form">
          <label>Email address<div className="input-icon-wrap"><Mail size={16} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></div></label>
          <label>Password<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
          {error && <div className="form-error"><AlertCircle size={15} />{error}</div>}
          {notice && <div className="login-success-note"><CheckCircle2 size={15} />{notice}</div>}
          <button className="primary-button login-submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : null}Sign in <ArrowRight size={16} /></button>
          <button type="button" className="forgot-button" onClick={resetPassword} disabled={busy}>Forgot password?</button>
        </form>
        <div className="login-note"><ShieldCheck size={15} /><span>Invited members only. Ask your admin for access.</span></div>
      </div>
      <div className="login-caption"><span>Clear the clutter.</span><span>Keep the momentum.</span></div>
    </div>
  )
}

function PasswordSetupScreen({ recovery, onComplete }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (password.length < 8) { setError('Use at least 8 characters for your password.'); return }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { password_initialized: true },
    })
    if (updateError) setError(updateError.message)
    else onComplete()
    setBusy(false)
  }
  return <div className="login-screen"><div className="login-panel password-panel"><div className="brand-lockup"><div className="brand-mark"><Columns3 size={18} /></div><span>flowboard<span className="brand-period">.</span></span></div><div className="setup-icon"><ShieldCheck size={21} /></div><div className="login-heading"><p className="eyebrow">{recovery ? 'ACCOUNT RECOVERY' : 'ONE LAST STEP'}</p><h1>{recovery ? 'Choose a new password' : 'Set your password'}</h1><p>{recovery ? 'Pick a new password to get back into your workspace.' : 'Create a password so you can sign in again next time.'}</p></div><form onSubmit={submit} className="login-form"><label>Password<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required minLength={8} /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></label><label>Confirm password<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" required minLength={8} /></div></label>{error && <div className="form-error"><AlertCircle size={15} />{error}</div>}<button className="primary-button login-submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : null}Save password <ArrowRight size={16} /></button></form><div className="login-note"><ShieldCheck size={15} /><span>Your password is secured by Supabase Auth.</span></div></div></div>
}

function DashboardView({ user, profile, projects, tasks, allTasks, profiles, events, nameFor, onOpenProject, onNewTask, onNewProject, onOpenTask, onOpenInsights }) {
  const today = localDateString()
  const openTasks = tasks.filter((task) => !DONE.has(task.status))
  const todayTasks = sortedTasks(openTasks.filter((task) => task.due_date === today))
  const overdueTasks = sortedTasks(openTasks.filter(dateIsOverdue))
  const dueThisWeek = openTasks.filter((task) => isDueThisWeek(task.due_date)).length
  const completed = tasks.filter((task) => DONE.has(task.status)).length
  const thisMonthStart = `${today.slice(0, 7)}-01`
  const completedThisMonth = tasks.filter((task) => DONE.has(task.status) && task.updated_at?.slice(0, 10) >= thisMonthStart).length
  const statusCounts = STATUSES.map((status) => ({ status, count: tasks.filter((task) => task.status === status).length }))
  const activeCount = Math.max(1, tasks.length)
  const criticalCount = openTasks.filter((task) => task.severity === 'Critical' || task.severity === 'High').length
  const currentHour = new Date().getHours()
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening'
  const shownProjects = projects.slice(0, 3)
  const projectBars = shownProjects.map((project) => ({ ...project, count: tasks.filter((task) => task.project_id === project.id).length }))

  return (
    <div className="page-view dashboard-view">
      <div className="page-heading dashboard-heading">
        <div><p className="eyebrow">{new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()}</p><h1>{greeting}, {displayName(profile, user).split(' ')[0]} <span className="heading-wave">✦</span></h1><p className="page-subtitle">Here’s the latest on your activity board.</p></div>
        <div className="heading-actions"><button className="secondary-button" onClick={onNewProject}><Plus size={16} /> New project</button><button className="primary-button" onClick={() => projects.length ? onNewTask(projects[0].id) : onNewProject()}><Plus size={16} /> Add activity</button></div>
      </div>

      <div className="stats-grid">
        <StatCard label="Open activities" value={openTasks.length} hint={`${tasks.length} total across projects`} icon={Activity} tone="indigo" trend={<span className="stat-neutral"><ArrowUpRight size={13} /> Active</span>} />
        <StatCard label="Due today" value={todayTasks.length} hint={todayTasks.length ? 'Keep these moving today' : 'Your day is clear'} icon={CalendarDays} tone="amber" trend={todayTasks.length ? <span className="stat-warn"><Clock3 size={12} /> Focus</span> : <span className="stat-good"><Check size={12} /> Clear</span>} />
        <StatCard label="Overdue" value={overdueTasks.length} hint={overdueTasks.length ? 'Needs your attention' : 'Nothing overdue'} icon={AlertCircle} tone="rose" trend={overdueTasks.length ? <span className="stat-danger">Needs attention</span> : <span className="stat-good"><Check size={12} /> On track</span>} />
        <StatCard label="Due this week" value={dueThisWeek} hint="Plan ahead and stay on track" icon={Flag} tone="mint" trend={<span className="stat-neutral">{completedThisMonth} done this month</span>} />
      </div>

      <div className="dashboard-grid">
        <section className="surface focus-panel">
          <div className="section-heading"><div><div className="section-title-row"><h2>Today’s focus</h2><span className="count-pill">{todayTasks.length}</span></div><p>Activities that need your attention today.</p></div><button className="text-button" onClick={onOpenInsights}>View insights <ArrowRight size={14} /></button></div>
          {todayTasks.length === 0 ? <EmptyState icon={CheckCheck} title="You’re all caught up" text="No activities are due today. Add a new activity or review what’s coming up." actionLabel={projects.length ? 'Add activity' : 'Create a project'} onAction={() => projects.length ? onNewTask(projects[0].id) : onNewProject()} /> : <div className="focus-list">{todayTasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} project={projects.find((project) => project.id === task.project_id)} onClick={() => onOpenTask(task)} />)}</div>}
          {overdueTasks.length > 0 && <button className="overdue-banner" onClick={onOpenInsights}><span className="overdue-icon"><AlertCircle size={16} /></span><span><strong>{overdueTasks.length} overdue {overdueTasks.length === 1 ? 'activity' : 'activities'}</strong><small>Open insights to review and reschedule</small></span><ArrowRight size={16} /></button>}
        </section>

        <section className="surface status-panel">
          <div className="section-heading"><div><h2>Work by status</h2><p>How your activities are moving.</p></div><div className="status-total">{tasks.length}<small>total</small></div></div>
          <div className="status-bars">{statusCounts.map(({ status, count }) => <div className="status-bar-row" key={status}><span className={`mini-status-dot status-${statusClass(status)}`} /><span className="status-bar-name">{status}</span><div className="status-bar-track"><span className={`status-bar-fill status-${statusClass(status)}`} style={{ width: `${count === 0 ? 0 : Math.max(5, (count / activeCount) * 100)}%` }} /></div><span className="status-bar-count">{count}</span></div>)}</div>
          <div className="status-panel-foot"><div className="avatar-stack">{profiles.slice(0, 3).map((person, index) => <span className={`avatar avatar-stack-item avatar-tone-${index % 4}`} key={person.id}>{initials(person.display_name || person.email)}</span>)}</div><span>{isNaN(profiles.length) ? '' : `${profiles.length} ${profiles.length === 1 ? 'member' : 'members'}`}</span><span className="status-foot-spacer" /><strong>{completed} done</strong></div>
        </section>
      </div>

      <div className="section-heading project-section-heading"><div><div className="section-title-row"><h2>{projects.length ? 'Your projects' : 'Get started'}</h2><span className="section-muted">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span></div><p>Keep your work organized, one project at a time.</p></div><button className="text-button" onClick={onNewProject}><Plus size={15} /> New project</button></div>
      {projects.length ? <div className="project-cards-grid">{projectBars.map((project) => <ProjectCard key={project.id} project={project} tasks={tasks.filter((task) => task.project_id === project.id)} onClick={() => onOpenProject(project)} />)}<button className="add-project-card" onClick={onNewProject}><span><Plus size={19} /></span><strong>Create a project</strong><small>Start a fresh board for your work</small></button></div> : <div className="surface first-project-card"><div className="first-project-art"><FolderKanban size={28} /><span /><span /></div><div><h3>Start with a project</h3><p>Create a project board, then add cards to move your work from first note to closed.</p></div><button className="primary-button" onClick={onNewProject}><Plus size={16} /> Create project</button></div>}

      <div className="lower-grid">
        <section className="surface activity-panel"><div className="section-heading"><div><h2>Recent activity</h2><p>A timeline of changes across your workspace.</p></div><Activity size={17} className="section-muted-icon" /></div>{events.length ? <div className="activity-feed">{events.slice(0, 5).map((event) => <ActivityItem key={event.id} event={event} nameFor={nameFor} onOpen={() => { const found = allTasks.find((task) => task.id === event.task_id); if (found) onOpenTask(found) }} />)}</div> : <div className="activity-empty"><span><Activity size={17} /></span><p>Activity updates will appear here as you work.</p></div>}</section>
        <section className="surface momentum-panel"><div className="momentum-top"><div><p className="eyebrow">A LITTLE MOMENTUM</p><h2>Small steps add up.</h2><p>You’ve completed <strong>{completedThisMonth}</strong> {completedThisMonth === 1 ? 'activity' : 'activities'} this month.</p></div><div className="momentum-art"><span className="momentum-orbit orbit-one" /><span className="momentum-orbit orbit-two" /><Sparkles size={21} /></div></div><div className="momentum-progress"><div><span>This month</span><strong>{completedThisMonth} complete</strong></div><div className="progress-track"><span style={{ width: `${Math.min(100, completedThisMonth * 12)}%` }} /></div></div></section>
      </div>
    </div>
  )
}

function StatCard({ label, value, hint, icon: Icon, tone, trend }) {
  return <div className="surface stat-card"><div className={`stat-icon stat-icon-${tone}`}><Icon size={18} strokeWidth={1.8} /></div><div className="stat-trend">{trend}</div><p className="stat-label">{label}</p><div className="stat-value">{value}</div><p className="stat-hint">{hint}</p></div>
}

function ProjectCard({ project, tasks, onClick }) {
  const open = tasks.filter((task) => !DONE.has(task.status)).length
  const progress = tasks.length ? Math.round((tasks.filter((task) => DONE.has(task.status)).length / tasks.length) * 100) : 0
  const nextTask = sortedTasks(tasks.filter((task) => !DONE.has(task.status)))[0]
  return <button className="surface project-card" onClick={onClick}>
    <div className="project-card-top"><span className="project-cover" style={{ '--project-color': project.color }}><FolderKanban size={19} /></span><span className="project-card-menu"><MoreHorizontal size={18} /></span></div>
    <h3>{project.name}</h3><p className="project-card-description">{project.description || 'A focused space for this project.'}</p>
    <div className="project-card-stats"><span><Activity size={14} /> {open} open</span><span><CheckCircle2 size={14} /> {progress}% done</span></div>
    <div className="progress-track project-progress"><span style={{ width: `${progress}%`, background: project.color }} /></div>
    <div className="project-card-footer"><span className="project-owner-dot" style={{ background: project.color }} />{nextTask ? <span className="project-next">Next: {nextTask.title}</span> : <span className="project-next">No open activities</span>}<ArrowUpRight size={15} /></div>
  </button>
}

function EmptyState({ icon: Icon, title, text, actionLabel, onAction }) {
  return <div className="empty-state"><div className="empty-state-icon"><Icon size={19} /></div><strong>{title}</strong><p>{text}</p>{actionLabel && <button className="text-button" onClick={onAction}>{actionLabel}<ArrowRight size={14} /></button>}</div>
}

function TaskRow({ task, project, onClick }) {
  return <button className="task-row" onClick={onClick}><span className={`task-row-marker task-marker-${statusClass(task.status)}`} /><span className="task-row-main"><strong>{task.title}</strong><small>{project?.name || 'Project'} <span>·</span> {task.status}</small></span><span className={`severity-chip severity-${task.severity.toLowerCase()}`}>{task.severity}</span><span className="task-row-date"><CalendarDays size={13} />{formatDate(task.due_date)}</span><ChevronDown size={14} className="task-row-arrow" /></button>
}

function ActivityItem({ event, nameFor, onOpen }) {
  const details = event.details || {}
  const changedStatus = details.previous_status && details.status !== details.previous_status
  const action = event.action === 'card_created' ? 'created a card' : changedStatus ? `moved a card to ${details.status}` : 'updated a card'
  const time = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(event.created_at))
  return <button className="activity-item" onClick={onOpen}><span className="activity-avatar">{initials(nameFor(event.actor_id))}</span><span className="activity-copy"><strong>{nameFor(event.actor_id)}</strong> {action}<small>{details.title || 'Activity card'} <span>·</span> {time}</small></span><ArrowUpRight size={14} /></button>
}

function ProjectsView({ projects, tasks, onOpen, onNew, onEdit, onNewTask }) {
  const openCount = tasks.filter((task) => !DONE.has(task.status)).length
  return <div className="page-view">
    <div className="page-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Projects</h1><p className="page-subtitle">Every project gets its own board and activity flow.</p></div><button className="primary-button" onClick={onNew}><Plus size={16} /> New project</button></div>
    <div className="projects-overview-strip"><span className="overview-strip-icon"><FolderKanban size={18} /></span><div><strong>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</strong><small>{openCount} open activities across your boards</small></div><div className="strip-spacer" /><span className="strip-pill"><Gauge size={14} /> Boards stay in sync</span></div>
    {projects.length ? <div className="projects-page-grid">{projects.map((project) => <article className="surface project-page-card" key={project.id}><button className="project-page-main" onClick={() => onOpen(project)}><span className="project-cover" style={{ '--project-color': project.color }}><FolderKanban size={20} /></span><h3>{project.name}</h3><p>{project.description || 'A clear space for your next set of activities.'}</p></button><div className="project-page-meta"><span>{tasks.filter((task) => task.project_id === project.id && !DONE.has(task.status)).length} open</span><span>·</span><span>{tasks.filter((task) => task.project_id === project.id).length} total</span><button className="tiny-icon-button" title="Edit project" onClick={() => onEdit(project)}><Pencil size={14} /></button></div><button className="project-open-button" onClick={() => onOpen(project)}>Open board <ArrowRight size={14} /></button><button className="project-quick-add" onClick={() => onNewTask(project.id)}><Plus size={14} /> Add activity</button></article>)}<button className="add-project-card large-add-project" onClick={onNew}><span><Plus size={19} /></span><strong>Make room for something new</strong><small>Create a project board</small></button></div> : <div className="surface projects-empty"><div className="projects-empty-art"><FolderKanban size={27} /></div><h2>Your first project starts here</h2><p>Projects give each set of activities a clear home. Open a project to add cards, set due dates, and move work through each stage.</p><button className="primary-button" onClick={onNew}><Plus size={16} /> Create a project</button></div>}
  </div>
}

function BoardView({ project, statuses, onManageStatus, tasks, profiles, isAdmin, userId, imageFor, onStatus, onNew, onOpen, onEditProject, onDeleteProject }) {
  const [severityFilter, setSeverityFilter] = useState('All priorities')
  const [menuOpen, setMenuOpen] = useState(false)
  const filteredTasks = tasks.filter((task) => severityFilter === 'All priorities' || task.severity === severityFilter)
  const doneCount = tasks.filter((task) => DONE.has(task.status)).length
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0
  const profileFor = (id) => profiles.find((person) => person.id === id)

  return <div className="page-view board-page">
    <div className="board-heading"><div className="board-title-group"><span className="project-cover board-project-cover" style={{ '--project-color': project.color }}><FolderKanban size={21} /></span><div><div className="board-title-line"><h1>{project.name}</h1><span className="board-private"><ShieldCheck size={13} /> Private</span></div><p>{project.description || 'Move your work from the first note to the final check.'}</p></div></div><div className="board-heading-actions"><button className="secondary-button" onClick={() => onManageStatus(project.id, null, 'add')}><Plus size={15} /> Add column</button><button className="secondary-button" onClick={onEditProject}><Pencil size={15} /> Edit project</button><div className="menu-wrap"><button className="icon-button" onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={18} /></button>{menuOpen && <div className="floating-menu"><button className="danger-menu-item" onClick={() => { setMenuOpen(false); onDeleteProject() }}><Trash2 size={15} /> Delete project</button></div>}</div><button className="primary-button" onClick={() => onNew(statuses[0]?.name || 'Note started')}><Plus size={16} /> Add activity</button></div></div>
    <div className="board-summary-strip"><div><span className="summary-point point-blue" />{tasks.length} activities</div><span className="summary-separator" /><div><span className="summary-point point-amber" />{tasks.filter((task) => !DONE.has(task.status)).length} in progress</div><span className="summary-separator" /><div><span className="summary-point point-green" />{doneCount} completed</div><div className="board-progress-summary"><span>{progress}% complete</span><span className="board-progress-track"><i style={{ width: `${progress}%` }} /></span></div><div className="board-controls"><button className="filter-button" onClick={() => setSeverityFilter((current) => current === 'All priorities' ? 'High' : current === 'High' ? 'Critical' : current === 'Critical' ? 'Medium' : current === 'Medium' ? 'Low' : 'All priorities')}><Filter size={14} /> {severityFilter} <ChevronDown size={13} /></button><div className="avatar-stack board-avatar-stack">{profiles.slice(0, 4).map((person, index) => <span className={`avatar avatar-stack-item avatar-tone-${index % 4}`} title={person.display_name || person.email} key={person.id}>{initials(person.display_name || person.email)}</span>)}</div></div></div>
    <div className="board-scroll"><div className="kanban-board">{statuses.map((status) => {
      const columnTasks = filteredTasks.filter((task) => task.status === status.name).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
      return <BoardColumn key={status.id} status={status.name} statusRecord={status} tasks={columnTasks} project={project} userId={userId} isAdmin={isAdmin} imageFor={imageFor} profileFor={profileFor} onManageStatus={onManageStatus} onStatus={onStatus} onNew={onNew} onOpen={onOpen} />
    })}</div></div>
  </div>
}

function BoardColumn({ status, statusRecord, tasks, project, userId, isAdmin, imageFor, profileFor, onManageStatus, onStatus, onNew, onOpen }) {
  const [isOver, setIsOver] = useState(false)
  return <section className={`board-column ${isOver ? 'column-drop-over' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsOver(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsOver(false) }} onDrop={(event) => { event.preventDefault(); setIsOver(false); const taskId = event.dataTransfer.getData('text/plain'); const task = document.getElementById(`task-${taskId}`); if (taskId && task?.dataset.status !== status) onStatus({ id: taskId }, status) }}>
    <div className="column-header"><div className={`column-status-icon status-${statusClass(status)}`}><ColumnIcon status={status} /></div><strong>{status}</strong><span className="column-count">{tasks.length}</span><button className="tiny-icon-button column-add" title={`Add to ${status}`} onClick={() => onNew(status)}><Plus size={15} /></button><button className="tiny-icon-button column-add" title="Manage column" onClick={() => { const action = window.prompt('Type: rename or delete', statusRecord.is_resolved ? 'rename' : 'rename'); if (action === 'rename' || action === 'delete') onManageStatus(project.id, statusRecord, action) }}><MoreHorizontal size={15} /></button></div>
    <div className="column-cards">{tasks.map((task) => <BoardTaskCard key={task.id} task={task} project={project} userId={userId} isAdmin={isAdmin} imageUrl={imageFor(task)} person={profileFor(task.owner_id)} onOpen={() => onOpen(task)} />)}{tasks.length === 0 && <div className="column-empty">Drop a card here</div>}</div>
    <button className="column-add-card" onClick={() => onNew(status)}><Plus size={15} /> Add card</button>
  </section>
}

function ColumnIcon({ status }) {
  if (status === 'Completed' || status === 'Delivered' || status === 'Closed') return <Check size={14} />
  if (status === 'Blocked' || status === 'On hold') return <AlertCircle size={14} />
  if (status === 'Under review' || status === 'Final check') return <Search size={14} />
  return <span className="column-dot" />
}

function BoardTaskCard({ task, project, userId, isAdmin, imageUrl, person, onOpen }) {
  const canMove = isAdmin || task.owner_id === userId
  return <article id={`task-${task.id}`} data-status={task.status} className={`board-task-card ${dateIsOverdue(task) ? 'task-card-overdue' : ''}`} draggable={canMove} onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)} onClick={onOpen}>
    {imageUrl && <img className="task-image-thumb" src={imageUrl} alt="Card attachment" />}
    <div className="task-card-topline"><span className={`severity-chip severity-${task.severity.toLowerCase()}`}><i />{task.severity}</span>{task.important && <span className="important-mark" title="Important"><Star size={13} fill="currentColor" /></span>}<button className="task-card-more" onClick={(event) => { event.stopPropagation(); onOpen() }}><MoreHorizontal size={15} /></button></div>
    <strong className="task-card-title">{task.title}</strong>
    {task.description && <p className="task-card-description">{task.description}</p>}
    <div className="task-card-footer"><span className={`task-card-due ${dateIsOverdue(task) ? 'is-overdue' : ''}`}>{task.due_date ? <><CalendarDays size={13} />{formatDate(task.due_date)}</> : <span className="no-date-label">No date</span>}</span><span className="task-card-size">{task.size}</span><span className={`avatar task-card-avatar ${person?.id === userId ? 'avatar-purple' : 'avatar-tone-1'}`} title={person?.display_name || person?.email}>{initials(person?.display_name || person?.email)}</span></div>
  </article>
}

function InsightsView({ tasks, profiles, isAdmin, onOpenTask }) {
  const [range, setRange] = useState('Today')
  const openTasks = tasks.filter((task) => !DONE.has(task.status))
  const today = localDateString()
  const dueToday = sortedTasks(openTasks.filter((task) => task.due_date === today))
  const overdue = sortedTasks(openTasks.filter(dateIsOverdue))
  const dueWeek = sortedTasks(openTasks.filter((task) => isDueThisWeek(task.due_date)))
  const dueMonth = sortedTasks(openTasks.filter((task) => task.due_date && task.due_date >= today && task.due_date.slice(0, 7) === today.slice(0, 7)))
  const important = sortedTasks(openTasks.filter((task) => task.important || ['Critical', 'High'].includes(task.severity)))
  const selected = range === 'Today' ? dueToday : range === 'This week' ? dueWeek : range === 'This month' ? dueMonth : range === 'Overdue' ? overdue : important
  const tabs = ['Today', 'This week', 'This month', 'Overdue', 'Important']
  const isAdminWorkspace = isAdmin && profiles.length > 1
  return <div className="page-view insights-view">
    <div className="page-heading"><div><p className="eyebrow">STAY A STEP AHEAD</p><h1>Insights</h1><p className="page-subtitle">A clear look at what’s due, what’s important, and what needs a nudge.</p></div><div className="insights-header-note"><Sparkles size={16} /><span>{isAdminWorkspace ? 'Across your whole team' : 'Just your activities'}</span></div></div>
    <div className="insight-summary-grid"><InsightSummary label="Due today" count={dueToday.length} icon={CalendarDays} tone="amber" active={range === 'Today'} onClick={() => setRange('Today')} /><InsightSummary label="Due this week" count={dueWeek.length} icon={Clock3} tone="blue" active={range === 'This week'} onClick={() => setRange('This week')} /><InsightSummary label="Due this month" count={dueMonth.length} icon={CalendarDays} tone="blue" active={range === 'This month'} onClick={() => setRange('This month')} /><InsightSummary label="Overdue" count={overdue.length} icon={AlertCircle} tone="rose" active={range === 'Overdue'} onClick={() => setRange('Overdue')} /><InsightSummary label="Important" count={important.length} icon={Star} tone="purple" active={range === 'Important'} onClick={() => setRange('Important')} /></div>
    <div className="surface insight-list-panel"><div className="insight-list-heading"><div><h2>What needs your attention</h2><p>Use the quick filters to plan your next move.</p></div><span className="insight-total"><Gauge size={14} />{selected.length} activities</span></div><div className="insight-tabs">{tabs.map((tab) => <button key={tab} className={range === tab ? 'active' : ''} onClick={() => setRange(tab)}>{tab}{tab === 'Overdue' && overdue.length > 0 && <i className="tab-alert-dot" />}</button>)}</div>
      {selected.length ? <div className="insight-rows">{selected.map((task) => <InsightTaskRow key={task.id} task={task} profiles={profiles} isAdmin={isAdmin} onClick={() => onOpenTask(task)} />)}</div> : <div className="insight-empty"><div className="insight-empty-icon"><CheckCheck size={22} /></div><h3>{range === 'Overdue' ? 'Nothing is overdue' : `All clear for ${range.toLowerCase()}`}</h3><p>When something needs attention, it’ll be easy to find it here.</p></div>}
    </div>
    <div className="insight-tip"><span><Sparkles size={16} /></span><div><strong>Keep the next step visible</strong><p>Set a due date and mark high-priority activities as important to keep your board focused.</p></div><ArrowRight size={16} /></div>
  </div>
}

function InsightSummary({ label, count, icon: Icon, tone, active, onClick }) {
  return <button className={`surface insight-summary-card ${active ? 'selected' : ''}`} onClick={onClick}><span className={`insight-summary-icon insight-${tone}`}><Icon size={17} /></span><span className="insight-summary-label">{label}</span><strong>{count}</strong><ArrowUpRight size={15} className="insight-summary-arrow" /></button>
}

function InsightTaskRow({ task, profiles, isAdmin, onClick }) {
  const person = profiles.find((item) => item.id === task.owner_id)
  return <button className={`insight-task-row ${dateIsOverdue(task) ? 'insight-overdue-row' : ''}`} onClick={onClick}><span className="insight-row-status"><span className={`task-row-marker task-marker-${statusClass(task.status)}`} /></span><span className="insight-row-title"><strong>{task.title}</strong><small>{task.status} <span>·</span> {task.severity}</small></span>{task.important && <span className="important-badge"><Star size={12} fill="currentColor" /> Important</span>}<span className={`severity-chip severity-${task.severity.toLowerCase()}`}>{task.severity}</span>{isAdmin && person && <span className="insight-owner">{initials(person.display_name || person.email)} {person.display_name || person.email.split('@')[0]}</span>}<span className={`insight-due ${dateIsOverdue(task) ? 'is-overdue' : ''}`}><CalendarDays size={13} />{task.due_date ? formatDate(task.due_date, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date'}</span><ArrowUpRight size={15} className="insight-row-arrow" /></button>
}

function TeamView({ profiles, projects, tasks, userId, onInvite, onCreate, onManage }) {
  const manage = (person) => {
    const action = window.prompt('Type edit, reset-password, or delete', 'edit')?.trim().toLowerCase();
    if (action === 'edit') { const display_name = window.prompt('Member name', person.display_name || ''); if (display_name !== null) onManage({ action, id: person.id, display_name }); }
    else if (action === 'reset-password') { const password = window.prompt('New password (at least 8 characters)'); if (password) onManage({ action, id: person.id, password }); }
    else if (action === 'delete' && window.confirm('Delete this member and their account?')) onManage({ action, id: person.id });
  }
  const members = [...profiles].sort((a, b) => (a.role === 'admin' ? -1 : 1) - (b.role === 'admin' ? -1 : 1) || (a.display_name || a.email).localeCompare(b.display_name || b.email))
  const memberTasks = (id) => tasks.filter((task) => task.owner_id === id)
  const openTasks = tasks.filter((task) => !DONE.has(task.status)).length
  const doneTasks = tasks.filter((task) => DONE.has(task.status)).length
  return <div className="page-view team-view">
    <div className="page-heading"><div><p className="eyebrow">ADMIN CONSOLE</p><h1>Your team</h1><p className="page-subtitle">Invite members and keep an eye on activity across the workspace.</p></div><button className="secondary-button" onClick={onCreate}><Plus size={15} /> Add directly</button><button className="primary-button" onClick={onInvite}><UserPlus size={16} /> Invite member</button></div>
    <div className="stats-grid team-stats-grid"><StatCard label="Team members" value={profiles.length} hint="Invited to this workspace" icon={Users} tone="indigo" trend={<span className="stat-neutral">People</span>} /><StatCard label="Active projects" value={projects.length} hint="Across all team boards" icon={BriefcaseBusiness} tone="mint" trend={<span className="stat-neutral">Projects</span>} /><StatCard label="Open activities" value={openTasks} hint="Cards still moving through stages" icon={Activity} tone="amber" trend={<span className="stat-warn"><Clock3 size={12} /> In motion</span>} /><StatCard label="Completed" value={doneTasks} hint="Completed, delivered or closed" icon={CheckCircle2} tone="rose" trend={<span className="stat-good"><Check size={12} /> Shipped</span>} /></div>
    <section className="surface team-table-panel"><div className="section-heading"><div><h2>People</h2><p>Members can manage their own projects and cards.</p></div><span className="count-pill">{members.length}</span></div><div className="team-table"><div className="team-table-head"><span>MEMBER</span><span>ROLE</span><span>PROJECTS</span><span>ACTIVITIES</span><span>JOINED</span><span /></div>{members.map((person, index) => { const ownedTasks = memberTasks(person.id); const ownedProjects = projects.filter((project) => project.created_by === person.id); return <div className="team-table-row" key={person.id}><span className="team-person-cell"><span className={`avatar avatar-tone-${index % 4}`}>{initials(person.display_name || person.email)}</span><span><strong>{person.display_name || person.email.split('@')[0]}</strong><small>{person.email}</small></span>{person.id === userId && <span className="you-chip">YOU</span>}</span><span><span className={`role-chip ${person.role === 'admin' ? 'role-admin' : ''}`}>{person.role === 'admin' ? <ShieldCheck size={12} /> : <Users size={12} />}{person.role === 'admin' ? 'Admin' : 'Member'}</span></span><span className="table-count">{ownedProjects.length}</span><span className="table-count">{ownedTasks.length}<small> · {ownedTasks.filter((task) => !DONE.has(task.status)).length} open</small></span><span className="table-date">{formatDate(person.created_at?.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}</span><span><button className="team-row-more" title="Manage member" onClick={() => manage(person)}><MoreHorizontal size={17} /></button></span></div> })}</div><div className="team-table-foot"><ShieldCheck size={14} /> Roles are managed securely in Supabase. Admin access is not editable from the member directory.</div></section>
    <div className="invite-callout"><div className="invite-callout-icon"><Mail size={18} /></div><div><strong>Need to add someone?</strong><p>Send an invite link. They’ll set their password and join as a member.</p></div><button className="secondary-button" onClick={onInvite}><UserPlus size={15} /> Invite member</button></div>
  </div>
}

function TaskModal({ task, projects, profiles, isAdmin, user, statuses, checklist: initialChecklist, initialProjectId, initialStatus, imageUrl, onClose, onSave, onDelete }) {
  const [checklistDraft, setChecklistDraft] = useState(() => initialChecklist ?? [])
  const [checklistTitle, setChecklistTitle] = useState('')
  const [values, setValues] = useState(() => ({
    project_id: task?.project_id ?? initialProjectId ?? projects[0]?.id ?? '',
    owner_id: task?.owner_id ?? (isAdmin && projects.find((project) => project.id === (task?.project_id ?? initialProjectId))?.created_by) ?? user.id,
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? initialStatus ?? statuses?.[0]?.name ?? 'Note started',
    severity: task?.severity ?? 'Medium',
    size: task?.size ?? 'M',
    due_date: task?.due_date ?? '',
    due_time: task?.due_time?.slice(0, 5) ?? '',
    important: task?.important ?? false,
  }))
  const [file, setFile] = useState(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [filePreview, setFilePreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!file) { setFilePreview(''); return undefined }
    const url = URL.createObjectURL(file)
    setFilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }))
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await onSave({ values: { ...values, checklist: checklistDraft }, file, removeImage, task }) }
    catch (saveError) { setError(errorMessage(saveError)) }
    setBusy(false)
  }
  const shownImage = filePreview || (!removeImage ? imageUrl : '')
  return <ModalShell onClose={onClose} wide>
    <form className="task-modal modal-form" onSubmit={submit}>
      <div className="modal-heading"><div><p className="eyebrow">{task ? 'ACTIVITY CARD' : 'NEW ACTIVITY'}</p><h2>{task ? 'Update activity' : 'Create a card'}</h2><p>{task ? 'Keep details current as the work moves forward.' : 'Capture the next piece of work and give it a place on the board.'}</p></div><button type="button" className="modal-close" onClick={onClose}><X size={18} /></button></div>
      {projects.length === 0 ? <div className="form-notice"><FolderKanban size={17} /><span>Create a project first, then add activity cards to its board.</span></div> : <>
        <div className="task-form-top-grid"><label className="field-label">Card title<input autoFocus value={values.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Prepare launch checklist" maxLength={180} required /></label><label className="field-label">Project<select value={values.project_id} onChange={(event) => { update('project_id', event.target.value); if (isAdmin && !task) update('owner_id', projects.find((project) => project.id === event.target.value)?.created_by ?? user.id) }}>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label></div>
        <div className="task-form-select-grid"><label className="field-label">Status<select value={values.status} onChange={(event) => update('status', event.target.value)}>{(statuses?.length ? statuses.map((item) => item.name) : STATUSES).map((status) => <option key={status}>{status}</option>)}</select></label><label className="field-label">Severity<select value={values.severity} onChange={(event) => update('severity', event.target.value)}>{SEVERITIES.map((severity) => <option key={severity}>{severity}</option>)}</select></label><label className="field-label">Size<select value={values.size} onChange={(event) => update('size', event.target.value)}>{SIZES.map((size) => <option key={size}>{size}</option>)}</select></label><label className="field-label">Due date<input type="date" value={values.due_date || ''} onChange={(event) => update('due_date', event.target.value)} /></label><label className="field-label">Due time (optional)<input type="time" value={values.due_time || ''} disabled={!values.due_date} onChange={(event) => update('due_time', event.target.value)} /></label></div>
        <label className="field-label description-label">Description<textarea value={values.description} onChange={(event) => update('description', event.target.value)} placeholder="Add context, next steps, or useful links…" rows={4} /></label>
        <section className="checklist-editor"><div className="section-heading"><div><h3>Checklist</h3><p>{checklistDraft.filter((item) => item.is_done).length} of {checklistDraft.length} complete</p></div></div>{checklistDraft.map((item, index) => <label className="checklist-row" key={item.id || `draft-${index}`}><input type="checkbox" checked={item.is_done} onChange={(event) => setChecklistDraft((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, is_done: event.target.checked } : row))} /><span>{item.title}</span><button type="button" className="tiny-icon-button" title="Remove checklist item" onClick={() => setChecklistDraft((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><X size={14} /></button></label>)}<div className="checklist-add"><input value={checklistTitle} onChange={(event) => setChecklistTitle(event.target.value)} placeholder="Add a checklist item" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (checklistTitle.trim()) { setChecklistDraft((rows) => [...rows, { title: checklistTitle.trim(), is_done: false }]); setChecklistTitle('') } } }} /><button type="button" className="secondary-button" onClick={() => { if (checklistTitle.trim()) { setChecklistDraft((rows) => [...rows, { title: checklistTitle.trim(), is_done: false }]); setChecklistTitle('') } }}><Plus size={14} /> Add</button></div></section>
        {isAdmin && <div className="assigned-owner-row"><span className="avatar avatar-purple">{initials(profiles.find((person) => person.id === (projects.find((project) => project.id === values.project_id)?.created_by ?? values.owner_id))?.display_name || profiles.find((person) => person.id === (projects.find((project) => project.id === values.project_id)?.created_by ?? values.owner_id))?.email)}</span><span><small>CARD OWNER</small><strong>{profiles.find((person) => person.id === (projects.find((project) => project.id === values.project_id)?.created_by ?? values.owner_id))?.display_name || profiles.find((person) => person.id === (projects.find((project) => project.id === values.project_id)?.created_by ?? values.owner_id))?.email || 'Project owner'}</strong></span><span className="owner-note">Based on project</span></div>}
        <div className="task-form-bottom"><button type="button" className={`important-toggle ${values.important ? 'is-important' : ''}`} onClick={() => update('important', !values.important)}><Star size={15} fill={values.important ? 'currentColor' : 'none'} />{values.important ? 'Marked important' : 'Mark as important'}</button><label className="attachment-button"><ImagePlus size={15} />{shownImage ? 'Change image' : 'Attach image'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setRemoveImage(false) }} /></label></div>
        {shownImage && <div className="attachment-preview"><img src={shownImage} alt="Card attachment preview" /><div><strong>{file?.name || 'Image attachment'}</strong><small>Visible to people who can access this project.</small></div><button type="button" className="tiny-icon-button" title="Remove image" onClick={() => { setFile(null); setRemoveImage(true) }}><X size={15} /></button></div>}
        {error && <div className="form-error"><AlertCircle size={15} />{error}</div>}
        <div className="modal-footer"><div>{onDelete && <button type="button" className="danger-text-button" onClick={onDelete}><Trash2 size={15} /> Delete card</button>}</div><div><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy && <LoaderCircle size={15} className="spin" />}{task ? 'Save changes' : 'Create card'} <ArrowRight size={15} /></button></div></div>
      </>}
    </form>
  </ModalShell>
}

function ProjectModal({ project, profiles, isAdmin, user, onClose, onSave, onDelete }) {
  const [values, setValues] = useState({ name: project?.name ?? '', description: project?.description ?? '', color: project?.color ?? COLORS[0], created_by: project?.created_by ?? user.id })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await onSave(values, project) } catch (saveError) { setError(errorMessage(saveError)) }
    setBusy(false)
  }
  return <ModalShell onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <div className="modal-heading"><div><p className="eyebrow">PROJECT BOARD</p><h2>{project ? 'Edit project' : 'Create a project'}</h2><p>Give a set of activities a clear home.</p></div><button type="button" className="modal-close" onClick={onClose}><X size={18} /></button></div>
      <label className="field-label">Project name<input autoFocus maxLength={100} value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Website refresh" required /></label>
      <label className="field-label">Short description<textarea value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} placeholder="What is this project about?" rows={3} /></label>
      {isAdmin && !project && <label className="field-label">Project owner<select value={values.created_by} onChange={(event) => setValues((current) => ({ ...current, created_by: event.target.value }))}>{profiles.map((person) => <option value={person.id} key={person.id}>{person.display_name || person.email.split('@')[0]} · {person.role}</option>)}</select><small className="field-help">The owner sees and manages this project’s board.</small></label>}
      {isAdmin && project && <div className="assigned-owner-row"><span className="avatar avatar-purple">{initials(profiles.find((person) => person.id === project.created_by)?.display_name || profiles.find((person) => person.id === project.created_by)?.email)}</span><span><small>PROJECT OWNER</small><strong>{profiles.find((person) => person.id === project.created_by)?.display_name || profiles.find((person) => person.id === project.created_by)?.email || 'Project owner'}</strong></span></div>}
      <div className="field-label">Board color<div className="color-options">{COLORS.map((color) => <button type="button" key={color} className={`color-option ${values.color === color ? 'chosen' : ''}`} style={{ '--swatch': color }} onClick={() => setValues((current) => ({ ...current, color }))}><span />{values.color === color && <Check size={13} />}</button>)}</div></div>
      {error && <div className="form-error"><AlertCircle size={15} />{error}</div>}
      <div className="modal-footer"><div>{onDelete && <button type="button" className="danger-text-button" onClick={onDelete}><Trash2 size={15} /> Delete project</button>}</div><div><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy && <LoaderCircle size={15} className="spin" />}{project ? 'Save project' : 'Create project'}<ArrowRight size={15} /></button></div></div>
    </form>
  </ModalShell>
}

function CreateMemberModal({ onClose, onCreate }) {
  const [email, setEmail] = useState('')
  const [display_name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await onCreate({ email: email.trim(), display_name: display_name.trim(), password }) } catch (e) { setError(errorMessage(e)) }
    setBusy(false)
  }
  return <ModalShell onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="modal-heading"><div><p className="eyebrow">ADD TEAM MEMBER</p><h2>Create account</h2><p>Set an initial password and share it with the member securely.</p></div><button type="button" className="modal-close" onClick={onClose}><X size={18} /></button></div><label className="field-label">Name<input value={display_name} onChange={(e) => setName(e.target.value)} required /></label><label className="field-label">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label className="field-label">Initial password<input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /><small className="field-help">The current password cannot be viewed later. Admins can reset it.</small></label>{error && <div className="form-error"><AlertCircle size={15} />{error}</div>}<div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create member'}</button></div></form></ModalShell>
}

function InviteModal({ onClose, onInvite }) {
  const [email, setEmail] = useState('')
  const [displayNameValue, setDisplayNameValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await onInvite({ email: email.trim(), displayName: displayNameValue.trim() }) }
    catch (inviteError) { setError(errorMessage(inviteError)) }
    setBusy(false)
  }
  return <ModalShell onClose={onClose}>
    <form className="modal-form invite-form" onSubmit={submit}>
      <div className="invite-modal-icon"><UserPlus size={20} /></div>
      <div className="modal-heading"><div><p className="eyebrow">GROW YOUR WORKSPACE</p><h2>Invite a teammate</h2><p>They’ll receive an email with a secure link to join as a member.</p></div><button type="button" className="modal-close" onClick={onClose}><X size={18} /></button></div>
      <label className="field-label">Name<input value={displayNameValue} onChange={(event) => setDisplayNameValue(event.target.value)} placeholder="Teammate’s name" maxLength={80} /></label>
      <label className="field-label">Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" required /></label>
      <div className="invite-role-note"><Users size={15} /><span>New invites start with member access. Admin permissions are managed separately.</span></div>
      {error && <div className="form-error"><AlertCircle size={15} />{error}</div>}
      <div className="modal-footer"><span className="invite-secure-note"><ShieldCheck size={14} /> Secure invitation</span><div><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy && <LoaderCircle size={15} className="spin" />}Send invite <ArrowRight size={15} /></button></div></div>
    </form>
  </ModalShell>
}

function ModalShell({ children, onClose, wide = false }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open') }
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className={`modal-dialog ${wide ? 'modal-dialog-wide' : ''}`}>{children}</div></div>
}
