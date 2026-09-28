/** Acciones sobre un nodo que decide `PermissionResolver` (plan 003 §6.5). */
export enum Action {
  VIEW = 'VIEW',
  PREVIEW = 'PREVIEW',
  DOWNLOAD = 'DOWNLOAD',
  QUERY_AGENT = 'QUERY_AGENT',
  EDIT = 'EDIT',
  CREATE_VERSION = 'CREATE_VERSION',
  SHARE = 'SHARE',
  CREATE_PUBLIC_LINK = 'CREATE_PUBLIC_LINK',
  VIEW_ACCESS_LIST = 'VIEW_ACCESS_LIST',
  MOVE = 'MOVE',
  DELETE = 'DELETE',
}
