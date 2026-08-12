export interface StorageField {
  key: string
  label: string
  placeholder: string
  required?: boolean
  type?: 'text' | 'password' | 'toggle'
  hint?: string
}

export type AzureAuthMethod = 'account-key' | 'connection-string' | 'sas-token' | 'managed-identity'

export const AZURE_AUTH_TABS = [
  { id: 'account-key', label: 'Account Key' },
  { id: 'connection-string', label: 'Connection String' },
  { id: 'sas-token', label: 'SAS Token' },
  { id: 'managed-identity', label: 'Managed Identity' },
]

export const AZURE_AUTH_FIELDS: Record<AzureAuthMethod, StorageField[]> = {
  'account-key': [
    { key: 'account_name', label: 'Account Name', placeholder: 'mystorageaccount', required: true },
    { key: 'account_key', label: 'Account Key', placeholder: '', type: 'password', required: true },
  ],
  'connection-string': [
    { key: 'connection_string', label: 'Connection String', placeholder: '', type: 'password', required: true },
  ],
  'sas-token': [
    { key: 'account_name', label: 'Account Name', placeholder: 'mystorageaccount', required: true },
    { key: 'sas_token', label: 'SAS Token', placeholder: '', type: 'password', required: true },
  ],
  'managed-identity': [
    { key: 'account_name', label: 'Account Name', placeholder: 'mystorageaccount', required: true, hint: 'Uses DefaultAzureCredential (Managed Identity, Azure CLI, etc.)' },
  ],
}

export const CRED_AUTH_KEY_SET = new Set([
  'account_name', 'account_key', 'connection_string', 'sas_token',
  'access_key_id', 'secret_access_key', 'endpoint',
  'credentials_json', 'credentials_file',
])

export function detectAzureAuth(config?: Record<string, unknown>): AzureAuthMethod {
  if (!config) return 'account-key'
  if (config.connection_string) return 'connection-string'
  if (config.sas_token) return 'sas-token'
  if (config.account_key) return 'account-key'
  if (config.account_name) return 'managed-identity'
  return 'account-key'
}

export function isAzureType(type: string) {
  return type === 'azure-blob' || type === 'azure-file'
}
