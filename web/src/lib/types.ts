export interface Workspace {
  name: string
  description: string
  environments: number
  services: number
  hierarchy?: { name: string; levels: string[] }
}

export interface Environment {
  name: string
  targets: number
}

export interface Service {
  name: string
  friendly_name: string
  provider: string
  target: string
  resource?: string
  has_log_dir?: boolean
}

export interface Instance {
  ID: string
  Name: string
  Status: string
  Metadata: Record<string, string> | null
}

export interface LogEntry {
  type: string
  timestamp: string
  source: string
  instance: string
  line: string
  error?: string
  _blinkAt?: number
  _lineNum?: number
}

export interface ServiceStatus {
  workspace: string
  environment: string
  service: string
  provider: string
  status: 'up' | 'down'
}

export interface Tab {
  id: string
  workspace: string
  environment: string
  service: string
  label: string
}

export interface LogFile {
  name: string
  size: number
  mod_time: string
  is_compressed: boolean
  compression?: string
}

export interface FilePage {
  lines: string[]
  page: number
  page_size: number
  total_lines: number
  total_pages: number
  has_more: boolean
  file_size: number
  file_name: string
  warning?: string
}

export interface FileSearchResult {
  file: string
  line: number
  content: string
}

export interface StandaloneEnvironment {
  name: string
  description: string
  services: number
}

export interface StandaloneService {
  name: string
  description: string
  provider: string
}

export interface AppConfig {
  enable_workspaces: boolean
  enable_environments: boolean
  enable_services: boolean
  log_buffer_lines: number
}

export interface GroupStats {
  count: number
  environments?: number
  services: number
  up: number
  down: number
}

export interface GroupedStats {
  workspace_stats: GroupStats
  environment_stats: GroupStats
  service_stats: GroupStats
}
