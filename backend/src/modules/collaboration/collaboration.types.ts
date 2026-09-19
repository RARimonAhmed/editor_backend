import { WebSocket } from 'ws';

export type CollaborationAction =
  | 'JOIN_PROJECT'
  | 'LEAVE_PROJECT'
  | 'CURSOR_MOVE'
  | 'SEEK_PLAYHEAD'
  | 'TIMELINE_MUTATION'
  | 'LOCK_TRACK'
  | 'UNLOCK_TRACK'
  | 'JOB_PROGRESS'
  | 'USER_JOINED'
  | 'USER_LEFT'
  | 'COMMENT_ADDED'
  | 'COMMENT_RESOLVED'
  | 'VERSION_CREATED'
  | 'ERROR'
  | 'PONG';

export interface CollaborationMessage<T = any> {
  action: CollaborationAction;
  projectId: string;
  senderId?: string;
  senderName?: string;
  data: T;
  timestamp?: number;
}

export interface CollaboratorSession {
  connectionId: string;
  userId: string;
  userName: string;
  role?: string;
  projectId: string;
  socket: WebSocket;
  cursor?: { x: number; y: number; trackIndex?: number };
  playhead?: number;
}
