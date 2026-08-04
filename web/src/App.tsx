import { useState, useEffect, useCallback, useRef } from 'react'
import { setToken, clearToken, fetchHealth, getMe, logout, adminImportWorkspace, adminUpdateWorkspace, adminCreateStandaloneEnv, adminCreateStandaloneService, listWorkspaces, listEnvironments, listServices, listStandaloneEnvs, listStandaloneEnvServices, standaloneEnvStreamURL, standaloneServiceStreamURL, resourceStreamURL, storageObjectStreamURL, adminGetResource, fetchConfig } from './lib/api'
import type { AuthUser } from './lib/api'
import { useTheme } from './lib/useTheme'
import type { Workspace, Environment, Service, StandaloneEnvironment, StandaloneService } from './lib/types'
import Header from './components/Layout/Header'
import AppSidebar from './components/Layout/AppSidebar'
import StatusIndicator from './components/Layout/StatusIndicator'
import WorkspacesView from './components/Views/WorkspacesView'
import EnvironmentsView from './components/Views/EnvironmentsView'
import ServicesView from './components/Views/ServicesView'
import WorkspaceServicesView from './components/Views/WorkspaceServicesView'
import ServiceEnvironmentsView from './components/Views/ServiceEnvironmentsView'
import StandaloneEnvServicesView from './components/Views/StandaloneEnvServicesView'
import ResourceNamespacesView from './components/Views/ResourceNamespacesView'
import ResourceWorkloadsView from './components/Views/ResourceWorkloadsView'
import StorageObjectsView from './components/Views/StorageObjectsView'
import LogConsole from './components/LogConsole/LogConsole'
import LogsPage from './components/Views/LogsPage'
import LoginPage from './components/Views/LoginPage'
import RegisterPage from './components/Views/RegisterPage'
import AdminPage from './components/Views/AdminPage'
import ConfigBuilder from './components/ConfigBuilder/ConfigBuilder'
import FileBrowser from './components/FileBrowser/FileBrowser'

type View =
  | { page: 'login' }
  | { page: 'register' }
  | { page: 'workspaces' }
  | { page: 'environments'; workspace: Workspace }
  | { page: 'services'; workspace: Workspace; environment: Environment }
  | { page: 'console'; workspace: Workspace; environment: Environment; service: Service }
  | { page: 'logs' }
  | { page: 'admin' }
  | { page: 'create-workspace' }
  | { page: 'create-environment' }
  | { page: 'create-service' }
  | { page: 'edit-workspace'; workspaceName: string }
  | { page: 'files'; workspace: Workspace; environment: Environment; service: Service }
  | { page: 'standalone-env-services'; env: StandaloneEnvironment }
  | { page: 'standalone-env-console'; envName: string; service: Service }
  | { page: 'standalone-svc-console'; service: StandaloneService }
  | { page: 'workspace-services'; workspace: Workspace }
  | { page: 'service-environments'; workspace: Workspace; serviceName: string; serviceLabel: string }
  | { page: 'sf-console'; workspace: Workspace; serviceName: string; serviceLabel: string; environment: Environment }
  | { page: 'sf-files'; workspace: Workspace; serviceName: string; serviceLabel: string; environment: Environment; service: Service }
  | { page: 'resource-namespaces'; resourceName: string; resourceDescription: string; resourceType: string }
  | { page: 'resource-workloads'; resourceName: string; namespace: string }
  | { page: 'resource-console'; resourceName: string; namespace: string; kind: string; workload: string }
  | { page: 'resource-storage-console'; resourceName: string; resourceType: string; objectKey: string }

function viewToHash(view: View): string {
  switch (view.page) {
    case 'workspaces': return '#/'
    case 'login': return '#/login'
    case 'register': return '#/register'
    case 'admin': return '#/admin'
    case 'logs': return '#/logs'
    case 'create-workspace': return '#/create-workspace'
    case 'create-environment': return '#/create-environment'
    case 'create-service': return '#/create-service'
    case 'edit-workspace': return `#/edit-workspace/${encodeURIComponent(view.workspaceName)}`
    case 'environments': return `#/ws/${encodeURIComponent(view.workspace.name)}`
    case 'workspace-services': return `#/ws/${encodeURIComponent(view.workspace.name)}`
    case 'services': return `#/ws/${encodeURIComponent(view.workspace.name)}/${encodeURIComponent(view.environment.name)}`
    case 'service-environments': return `#/ws/${encodeURIComponent(view.workspace.name)}/svc/${encodeURIComponent(view.serviceName)}`
    case 'console': return `#/ws/${encodeURIComponent(view.workspace.name)}/${encodeURIComponent(view.environment.name)}/${encodeURIComponent(view.service.name)}`
    case 'files': return `#/ws/${encodeURIComponent(view.workspace.name)}/${encodeURIComponent(view.environment.name)}/${encodeURIComponent(view.service.name)}/files`
    case 'sf-console': return `#/ws/${encodeURIComponent(view.workspace.name)}/svc/${encodeURIComponent(view.serviceName)}/env/${encodeURIComponent(view.environment.name)}`
    case 'sf-files': return `#/ws/${encodeURIComponent(view.workspace.name)}/svc/${encodeURIComponent(view.serviceName)}/env/${encodeURIComponent(view.environment.name)}/files`
    case 'standalone-env-services': return `#/env/${encodeURIComponent(view.env.name)}`
    case 'standalone-env-console': return `#/env/${encodeURIComponent(view.envName)}/${encodeURIComponent(view.service.name)}`
    case 'standalone-svc-console': return `#/svc/${encodeURIComponent(view.service.name)}`
    case 'resource-namespaces': return `#/resources/${encodeURIComponent(view.resourceName)}`
    case 'resource-workloads': return `#/resources/${encodeURIComponent(view.resourceName)}/${encodeURIComponent(view.namespace)}`
    case 'resource-console': return `#/resources/${encodeURIComponent(view.resourceName)}/${encodeURIComponent(view.namespace)}/${encodeURIComponent(view.kind)}/${encodeURIComponent(view.workload)}`
    case 'resource-storage-console': return `#/resources/${encodeURIComponent(view.resourceName)}/object/${encodeURIComponent(view.objectKey)}`
  }
}

async function resolveHash(hash: string): Promise<View> {
  const path = (hash || '#/').replace(/^#\/?/, '')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)

  if (parts.length === 0) return { page: 'workspaces' }

  switch (parts[0]) {
    case 'login': return { page: 'login' }
    case 'register': return { page: 'register' }
    case 'admin': return { page: 'admin' }
    case 'logs': return { page: 'logs' }
    case 'create-workspace': return { page: 'create-workspace' }
    case 'create-environment': return { page: 'create-environment' }
    case 'create-service': return { page: 'create-service' }
    case 'edit-workspace': return parts.length >= 2
      ? { page: 'edit-workspace', workspaceName: parts[1] }
      : { page: 'workspaces' }
    case 'ws': {
      if (parts.length < 2) return { page: 'workspaces' }
      try {
        const workspaces = await listWorkspaces()
        const ws = (workspaces || []).find(w => w.name === parts[1])
        if (!ws) return { page: 'workspaces' }

        const isServiceFirst = ws.hierarchy?.name === 'service-first'

        if (parts.length === 2) {
          return isServiceFirst
            ? { page: 'workspace-services', workspace: ws }
            : { page: 'environments', workspace: ws }
        }

        if (parts[2] === 'svc' && parts.length >= 4) {
          if (parts.length >= 6 && parts[4] === 'env') {
            const envs = await listEnvironments(ws.name)
            const env = envs.find(e => e.name === parts[5])
            if (!env) return { page: 'service-environments', workspace: ws, serviceName: parts[3], serviceLabel: parts[3] }
            if (parts.length >= 7 && parts[6] === 'files') {
              const svcs = await listServices(ws.name, env.name)
              const svc = svcs.find(s => s.name === parts[3])
              if (!svc) return { page: 'sf-console', workspace: ws, serviceName: parts[3], serviceLabel: parts[3], environment: env }
              return { page: 'sf-files', workspace: ws, serviceName: parts[3], serviceLabel: parts[3], environment: env, service: svc }
            }
            return { page: 'sf-console', workspace: ws, serviceName: parts[3], serviceLabel: parts[3], environment: env }
          }
          return { page: 'service-environments', workspace: ws, serviceName: parts[3], serviceLabel: parts[3] }
        }

        const envs = await listEnvironments(ws.name)
        const env = envs.find(e => e.name === parts[2])
        if (!env) {
          return isServiceFirst
            ? { page: 'workspace-services', workspace: ws }
            : { page: 'environments', workspace: ws }
        }
        if (parts.length === 3) return { page: 'services', workspace: ws, environment: env }

        const svcs = await listServices(ws.name, env.name)
        const svc = svcs.find(s => s.name === parts[3])
        if (!svc) return { page: 'services', workspace: ws, environment: env }

        if (parts.length >= 5 && parts[4] === 'files') {
          return { page: 'files', workspace: ws, environment: env, service: svc }
        }

        return { page: 'console', workspace: ws, environment: env, service: svc }
      } catch {
        return { page: 'workspaces' }
      }
    }
    case 'env': {
      if (parts.length < 2) return { page: 'workspaces' }
      try {
        const envs = await listStandaloneEnvs()
        const env = (envs || []).find(e => e.name === parts[1])
        if (!env) return { page: 'workspaces' }
        if (parts.length === 2) return { page: 'standalone-env-services', env }

        const svcs = await listStandaloneEnvServices(env.name)
        const svc = svcs.find(s => s.name === parts[2])
        if (!svc) return { page: 'standalone-env-services', env }
        return { page: 'standalone-env-console', envName: env.name, service: svc }
      } catch {
        return { page: 'workspaces' }
      }
    }
    case 'svc': {
      if (parts.length < 2) return { page: 'workspaces' }
      return { page: 'standalone-svc-console', service: { name: parts[1], description: '', provider: '' } }
    }
    case 'resources': {
      if (parts.length < 2) return { page: 'workspaces' }
      const resName = parts[1]
      if (parts[2] === 'object' && parts.length >= 4) {
        try {
          const res = await adminGetResource(resName)
          return { page: 'resource-storage-console', resourceName: resName, resourceType: res.type, objectKey: parts.slice(3).join('/') }
        } catch { return { page: 'workspaces' } }
      }
      if (parts.length === 2) {
        try {
          const res = await adminGetResource(resName)
          return { page: 'resource-namespaces', resourceName: resName, resourceDescription: res.description || '', resourceType: res.type }
        } catch {
          return { page: 'resource-namespaces', resourceName: resName, resourceDescription: '', resourceType: 'kubernetes' }
        }
      }
      if (parts.length === 3) return { page: 'resource-workloads', resourceName: resName, namespace: parts[2] }
      if (parts.length >= 5) return { page: 'resource-console', resourceName: resName, namespace: parts[2], kind: parts[3], workload: parts[4] }
      return { page: 'resource-namespaces', resourceName: resName, resourceDescription: '', resourceType: 'kubernetes' }
    }
    default: return { page: 'workspaces' }
  }
}

function isConfigMode() {
  const params = new URLSearchParams(window.location.search)
  return params.get('mode') === 'config'
}

export default function App() {
  const { theme, setTheme } = useTheme()
  const [view, setView] = useState<View>({ page: 'workspaces' })
  const [connected] = useState(true)
  const [serverMode, setServerMode] = useState(false)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [logBufferLines, setLogBufferLines] = useState(10000)
  const isPopState = useRef(false)

  const navigate = useCallback((newView: View) => {
    setView(newView)
    window.history.pushState(null, '', viewToHash(newView))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      setToken(token)
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }

    fetchHealth()
      .then(async h => {
        const isServer = h.mode === 'server'
        setServerMode(isServer)
        if (isServer) {
          try {
            const user = await getMe()
            setCurrentUser(user)
            const restored = await resolveHash(window.location.hash)
            if (restored.page === 'login' || restored.page === 'register') {
              setView({ page: 'workspaces' })
              window.history.replaceState(null, '', '#/')
            } else {
              setView(restored)
              window.history.replaceState(null, '', viewToHash(restored))
            }
          } catch {
            clearToken()
            setView({ page: 'login' })
            window.history.replaceState(null, '', '#/login')
          }
        } else {
          const restored = await resolveHash(window.location.hash)
          if (restored.page !== 'login' && restored.page !== 'register' && restored.page !== 'admin') {
            setView(restored)
            window.history.replaceState(null, '', viewToHash(restored))
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    fetchConfig()
      .then(c => { if (c.log_buffer_lines > 0) setLogBufferLines(c.log_buffer_lines) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function onPopState() {
      isPopState.current = true
      resolveHash(window.location.hash).then(restored => {
        setView(restored)
        isPopState.current = false
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-app)]">
        <div className="text-sm text-[var(--text-muted)]">Loading...</div>
      </div>
    )
  }

  if (isConfigMode()) {
    return <ConfigBuilder />
  }

  if (view.page === 'create-workspace') {
    return (
      <ConfigBuilder
        onBack={() => navigate({ page: 'workspaces' })}
        onImportToServer={async (yaml) => {
          await adminImportWorkspace(yaml)
          navigate({ page: 'workspaces' })
        }}
        serverMode={serverMode}
        isAdmin={currentUser?.role === 'admin'}
      />
    )
  }

  if (view.page === 'create-environment') {
    return (
      <ConfigBuilder
        mode="environment"
        onBack={() => navigate({ page: 'workspaces' })}
        onImportToServer={async (_yaml, cfg) => {
          const targets = (cfg.environments[0]?.targets ?? []).map(t => ({
            name: t.name,
            type: t.type,
            ...t.connection,
            service_names: t.service_names,
            services: t.service_overrides.length > 0 ? t.service_overrides : undefined,
          }))
          const services = cfg.services.map(s => ({
            name: s.name,
            provider: s.provider,
            friendly_name: s.friendly_name || undefined,
            config: Object.fromEntries(Object.entries(s.config).filter(([, v]) => v)),
          }))
          await adminCreateStandaloneEnv({ name: cfg.name, description: cfg.description || undefined, services, targets })
          navigate({ page: 'workspaces' })
        }}
        serverMode={serverMode}
        isAdmin={currentUser?.role === 'admin'}
      />
    )
  }

  if (view.page === 'create-service') {
    return (
      <ConfigBuilder
        mode="service"
        onBack={() => navigate({ page: 'workspaces' })}
        onImportToServer={async (_yaml, cfg) => {
          const svc = cfg.services[0]
          const t = cfg.environments[0]?.targets[0]
          const target = t ? {
            name: t.name,
            type: t.type,
            ...t.connection,
          } : undefined
          await adminCreateStandaloneService({
            name: cfg.name,
            description: cfg.description || undefined,
            provider: svc?.provider || 'file',
            config: svc ? Object.fromEntries(Object.entries(svc.config).filter(([, v]) => v)) : undefined,
            target,
          })
          navigate({ page: 'workspaces' })
        }}
        serverMode={serverMode}
        isAdmin={currentUser?.role === 'admin'}
      />
    )
  }

  if (view.page === 'edit-workspace') {
    return (
      <ConfigBuilder
        editWorkspace={view.workspaceName}
        onBack={() => navigate({ page: 'workspaces' })}
        onImportToServer={async (yaml, _cfg) => {
          await adminUpdateWorkspace(view.workspaceName, yaml)
          navigate({ page: 'workspaces' })
        }}
        serverMode={serverMode}
        isAdmin={currentUser?.role === 'admin'}
      />
    )
  }

  if (serverMode && !currentUser) {
    if (view.page === 'register') {
      return <RegisterPage onBack={() => navigate({ page: 'login' })} />
    }
    return (
      <LoginPage
        onLogin={async user => {
          setCurrentUser(user)
          const restored = await resolveHash(window.location.hash)
          if (restored.page === 'login' || restored.page === 'register') {
            navigate({ page: 'workspaces' })
          } else {
            navigate(restored)
          }
        }}
        onRegister={() => navigate({ page: 'register' })}
      />
    )
  }

  function handleLogout() {
    logout().catch(() => {}).finally(() => {
      clearToken()
      setCurrentUser(null)
      setView({ page: 'login' })
      window.history.replaceState(null, '', '#/login')
    })
  }

  function handleSelectWorkspace(ws: Workspace) {
    if (ws.hierarchy?.name === 'service-first') {
      navigate({ page: 'workspace-services', workspace: ws })
    } else {
      navigate({ page: 'environments', workspace: ws })
    }
  }

  function breadcrumbs() {
    const crumbs: { label: string; onClick?: () => void }[] = []

    if (view.page === 'workspaces' || view.page === 'login' || view.page === 'register'
      || view.page === 'create-workspace' || view.page === 'edit-workspace'
      || view.page === 'create-environment' || view.page === 'create-service') return undefined
    if (view.page === 'logs') return [{ label: 'Logs' }]
    if (view.page === 'admin') return [{ label: 'Administration' }]

    if (view.page === 'standalone-env-services') {
      crumbs.push({ label: 'Home', onClick: () => navigate({ page: 'workspaces' }) })
      crumbs.push({ label: view.env.name })
      return crumbs
    }

    if (view.page === 'standalone-env-console') {
      crumbs.push({ label: 'Home', onClick: () => navigate({ page: 'workspaces' }) })
      crumbs.push({
        label: view.envName,
        onClick: () => navigate({ page: 'standalone-env-services', env: { name: view.envName, description: '', services: 0 } }),
      })
      crumbs.push({ label: view.service.friendly_name || view.service.name })
      return crumbs
    }

    if (view.page === 'standalone-svc-console') {
      crumbs.push({ label: 'Home', onClick: () => navigate({ page: 'workspaces' }) })
      crumbs.push({ label: view.service.name })
      return crumbs
    }

    if (view.page === 'resource-namespaces') {
      crumbs.push({ label: 'Home', onClick: () => navigate({ page: 'workspaces' }) })
      crumbs.push({ label: view.resourceName })
      return crumbs
    }

    if (view.page === 'resource-workloads') {
      crumbs.push({ label: 'Home', onClick: () => navigate({ page: 'workspaces' }) })
      crumbs.push({
        label: view.resourceName,
        onClick: () => navigate({ page: 'resource-namespaces', resourceName: view.resourceName, resourceDescription: '', resourceType: 'kubernetes' }),
      })
      crumbs.push({ label: view.namespace })
      return crumbs
    }

    if (view.page === 'resource-console') {
      crumbs.push({ label: 'Home', onClick: () => navigate({ page: 'workspaces' }) })
      crumbs.push({
        label: view.resourceName,
        onClick: () => navigate({ page: 'resource-namespaces', resourceName: view.resourceName, resourceDescription: '', resourceType: 'kubernetes' }),
      })
      crumbs.push({
        label: view.namespace,
        onClick: () => navigate({ page: 'resource-workloads', resourceName: view.resourceName, namespace: view.namespace }),
      })
      crumbs.push({ label: view.workload })
      return crumbs
    }

    if (view.page === 'resource-storage-console') {
      crumbs.push({ label: 'Home', onClick: () => navigate({ page: 'workspaces' }) })
      crumbs.push({
        label: view.resourceName,
        onClick: () => navigate({ page: 'resource-namespaces', resourceName: view.resourceName, resourceDescription: '', resourceType: view.resourceType }),
      })
      crumbs.push({ label: view.objectKey.split('/').pop() || view.objectKey })
      return crumbs
    }

    crumbs.push({
      label: 'Home',
      onClick: () => navigate({ page: 'workspaces' }),
    })

    if (view.page === 'workspace-services') {
      crumbs.push({ label: view.workspace.name })
      return crumbs
    }

    if (view.page === 'service-environments') {
      crumbs.push({
        label: view.workspace.name,
        onClick: () => navigate({ page: 'workspace-services', workspace: view.workspace }),
      })
      crumbs.push({ label: view.serviceLabel })
      return crumbs
    }

    if (view.page === 'sf-console') {
      crumbs.push({
        label: view.workspace.name,
        onClick: () => navigate({ page: 'workspace-services', workspace: view.workspace }),
      })
      crumbs.push({
        label: view.serviceLabel,
        onClick: () => navigate({ page: 'service-environments', workspace: view.workspace, serviceName: view.serviceName, serviceLabel: view.serviceLabel }),
      })
      crumbs.push({ label: view.environment.name })
      return crumbs
    }

    if (view.page === 'sf-files') {
      crumbs.push({
        label: view.workspace.name,
        onClick: () => navigate({ page: 'workspace-services', workspace: view.workspace }),
      })
      crumbs.push({
        label: view.serviceLabel,
        onClick: () => navigate({ page: 'service-environments', workspace: view.workspace, serviceName: view.serviceName, serviceLabel: view.serviceLabel }),
      })
      crumbs.push({
        label: view.environment.name,
        onClick: () => navigate({ page: 'sf-console', workspace: view.workspace, serviceName: view.serviceName, serviceLabel: view.serviceLabel, environment: view.environment }),
      })
      crumbs.push({ label: 'Files' })
      return crumbs
    }

    if (view.page === 'environments') {
      crumbs.push({ label: view.workspace.name })
      return crumbs
    }

    crumbs.push({
      label: view.workspace.name,
      onClick: () => navigate({ page: 'environments', workspace: view.workspace }),
    })

    if (view.page === 'services') {
      crumbs.push({ label: view.environment.name })
      return crumbs
    }

    if (view.page === 'console') {
      crumbs.push({
        label: view.environment.name,
        onClick: () => navigate({ page: 'services', workspace: view.workspace, environment: view.environment }),
      })
      crumbs.push({ label: view.service.friendly_name || view.service.name })
    }

    if (view.page === 'files') {
      crumbs.push({
        label: view.environment.name,
        onClick: () => navigate({ page: 'services', workspace: view.workspace, environment: view.environment }),
      })
      crumbs.push({
        label: view.service.friendly_name || view.service.name,
        onClick: () => navigate({ page: 'console', workspace: view.workspace, environment: view.environment, service: view.service }),
      })
      crumbs.push({ label: 'Files' })
    }

    return crumbs
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-app)] bg-premium">
      <Header
        theme={theme}
        onThemeChange={setTheme}
        breadcrumbs={breadcrumbs()}
        connected={view.page === 'console' || view.page === 'sf-console' || view.page === 'resource-console' ? connected : undefined}
        onNavigateHome={() => navigate({ page: 'workspaces' })}
        onLogout={serverMode ? handleLogout : undefined}
        currentUser={currentUser}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <AppSidebar
          currentPage={view.page}
          onNavigate={page => {
            if (page === 'workspaces') navigate({ page: 'workspaces' })
            else if (page === 'logs') navigate({ page: 'logs' })
            else if (page === 'admin') navigate({ page: 'admin' })
          }}
          showAdmin={serverMode && !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager')}
        />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {view.page === 'workspaces' && (
            <WorkspacesView
              onSelect={handleSelectWorkspace}
              onSelectEnv={env => navigate({ page: 'standalone-env-services', env })}
              onSelectService={svc => navigate({ page: 'standalone-svc-console', service: svc })}
              onSelectResource={serverMode && (currentUser?.role === 'admin' || (currentUser?.scope || []).some(s => s.startsWith('res:')))
                ? (name, desc, type) => navigate({ page: 'resource-namespaces', resourceName: name, resourceDescription: desc, resourceType: type })
                : undefined}
              userRole={currentUser?.role}
              userScope={currentUser?.scope}
              serverMode={serverMode}
              onCreateWorkspace={serverMode && currentUser?.role === 'admin'
                ? () => navigate({ page: 'create-workspace' })
                : undefined}
              onCreateEnvironment={serverMode && currentUser?.role === 'admin'
                ? () => navigate({ page: 'create-environment' })
                : undefined}
              onCreateService={serverMode && currentUser?.role === 'admin'
                ? () => navigate({ page: 'create-service' })
                : undefined}
              onEditWorkspace={serverMode && currentUser?.role === 'admin'
                ? (name) => navigate({ page: 'edit-workspace', workspaceName: name })
                : undefined}
            />
          )}

          {view.page === 'environments' && (
            <EnvironmentsView
              workspace={view.workspace}
              onSelect={env => navigate({ page: 'services', workspace: view.workspace, environment: env })}
            />
          )}

          {view.page === 'workspace-services' && (
            <WorkspaceServicesView
              workspace={view.workspace}
              onSelectService={(svcName, svcLabel) => navigate({
                page: 'service-environments', workspace: view.workspace, serviceName: svcName, serviceLabel: svcLabel,
              })}
            />
          )}

          {view.page === 'service-environments' && (
            <ServiceEnvironmentsView
              workspace={view.workspace}
              serviceName={view.serviceName}
              serviceLabel={view.serviceLabel}
              onSelectEnv={env => navigate({ page: 'sf-console', workspace: view.workspace, serviceName: view.serviceName, serviceLabel: view.serviceLabel, environment: env })}
            />
          )}

          {view.page === 'services' && (
            <ServicesView
              workspace={view.workspace}
              environment={view.environment}
              onViewLogs={svc => navigate({ page: 'console', workspace: view.workspace, environment: view.environment, service: svc })}
              onBrowseFiles={svc => navigate({ page: 'files', workspace: view.workspace, environment: view.environment, service: svc })}
            />
          )}

          {view.page === 'console' && (
            <LogConsole
              workspace={view.workspace.name}
              environment={view.environment.name}
              service={view.service.name}
              label={view.service.friendly_name || view.service.name}
              onBack={() => navigate({ page: 'services', workspace: view.workspace, environment: view.environment })}
              hasLogDir={view.service.has_log_dir}
              onBrowseFiles={view.service.has_log_dir
                ? () => navigate({ page: 'files', workspace: view.workspace, environment: view.environment, service: view.service })
                : undefined}
              maxLines={logBufferLines}
            />
          )}

          {view.page === 'sf-console' && (
            <LogConsole
              workspace={view.workspace.name}
              environment={view.environment.name}
              service={view.serviceName}
              label={view.serviceLabel}
              onBack={() => navigate({ page: 'service-environments', workspace: view.workspace, serviceName: view.serviceName, serviceLabel: view.serviceLabel })}
              maxLines={logBufferLines}
            />
          )}

          {view.page === 'files' && (
            <FileBrowser
              workspace={view.workspace.name}
              environment={view.environment.name}
              service={view.service.name}
              label={view.service.friendly_name || view.service.name}
              onBack={() => navigate({ page: 'console', workspace: view.workspace, environment: view.environment, service: view.service })}
            />
          )}

          {view.page === 'sf-files' && (
            <FileBrowser
              workspace={view.workspace.name}
              environment={view.environment.name}
              service={view.service.name}
              label={view.service.friendly_name || view.service.name}
              onBack={() => navigate({ page: 'sf-console', workspace: view.workspace, serviceName: view.serviceName, serviceLabel: view.serviceLabel, environment: view.environment })}
            />
          )}

          {view.page === 'standalone-env-services' && (
            <StandaloneEnvServicesView
              envName={view.env.name}
              envDescription={view.env.description}
              onViewLogs={svc => navigate({ page: 'standalone-env-console', envName: view.env.name, service: svc })}
            />
          )}

          {view.page === 'standalone-env-console' && (
            <LogConsole
              streamUrl={standaloneEnvStreamURL(view.envName, view.service.name)}
              label={view.service.friendly_name || view.service.name}
              onBack={() => navigate({ page: 'standalone-env-services', env: { name: view.envName, description: '', services: 0 } })}
              maxLines={logBufferLines}
            />
          )}

          {view.page === 'standalone-svc-console' && (
            <LogConsole
              streamUrl={standaloneServiceStreamURL(view.service.name)}
              label={view.service.name}
              onBack={() => navigate({ page: 'workspaces' })}
              maxLines={logBufferLines}
            />
          )}

          {view.page === 'resource-namespaces' && view.resourceType !== 'kubernetes' && (
            <StorageObjectsView
              resourceName={view.resourceName}
              resourceType={view.resourceType}
              onViewObject={key => navigate({ page: 'resource-storage-console', resourceName: view.resourceName, resourceType: view.resourceType, objectKey: key })}
            />
          )}

          {view.page === 'resource-namespaces' && view.resourceType === 'kubernetes' && (
            <ResourceNamespacesView
              resourceName={view.resourceName}
              onSelect={ns => navigate({ page: 'resource-workloads', resourceName: view.resourceName, namespace: ns })}
            />
          )}

          {view.page === 'resource-workloads' && (
            <ResourceWorkloadsView
              resourceName={view.resourceName}
              namespace={view.namespace}
              onViewLogs={(kind, workload) => navigate({ page: 'resource-console', resourceName: view.resourceName, namespace: view.namespace, kind, workload })}
            />
          )}

          {view.page === 'resource-console' && (
            <LogConsole
              streamUrl={resourceStreamURL(view.resourceName, view.namespace, view.kind, view.workload)}
              label={view.workload}
              onBack={() => navigate({ page: 'resource-workloads', resourceName: view.resourceName, namespace: view.namespace })}
              maxLines={logBufferLines}
            />
          )}

          {view.page === 'resource-storage-console' && (
            <LogConsole
              streamUrl={storageObjectStreamURL(view.resourceName, view.objectKey)}
              label={view.objectKey.split('/').pop() || view.objectKey}
              onBack={() => navigate({ page: 'resource-namespaces', resourceName: view.resourceName, resourceDescription: '', resourceType: view.resourceType })}
              maxLines={logBufferLines}
            />
          )}

          {view.page === 'logs' && (
            <LogsPage onBack={() => navigate({ page: 'workspaces' })} userRole={currentUser?.role} userScope={currentUser?.scope} serverMode={serverMode} logBufferLines={logBufferLines} />
          )}

          {view.page === 'admin' && currentUser && (
            <AdminPage userRole={currentUser.role} />
          )}
        </main>
      </div>

      <StatusIndicator connected={connected} />
    </div>
  )
}
