/**
 * A unique identifier for a workspace.
 */
export type WorkspaceUuid = string & { __workspaceUuid: true }

/**
 * A unique identifier for an account.
 */
export type AccountUuid = string & { __accountUuid: true }

export type NodeUuid = string & { __nodeUuid: true }
