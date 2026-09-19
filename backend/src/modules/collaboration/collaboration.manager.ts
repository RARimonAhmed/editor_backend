import { WebSocket } from 'ws';
import { CollaboratorSession, CollaborationMessage } from './collaboration.types.js';
import { logger } from '../../core/logger.js';

export class CollaborationManager {
  // Map of projectId -> Map of connectionId -> CollaboratorSession
  private rooms = new Map<string, Map<string, CollaboratorSession>>();
  // Track locks: Map of `${projectId}:${trackId}` -> userId
  private trackLocks = new Map<string, string>();

  joinRoom(session: CollaboratorSession) {
    let room = this.rooms.get(session.projectId);
    if (!room) {
      room = new Map<string, CollaboratorSession>();
      this.rooms.set(session.projectId, room);
    }

    room.set(session.connectionId, session);
    logger.info(
      { userId: session.userId, projectId: session.projectId, activeUsers: room.size },
      'Collaborator joined project room'
    );

    // Notify peers in the room
    this.broadcast(
      session.projectId,
      {
        action: 'USER_JOINED',
        projectId: session.projectId,
        senderId: session.userId,
        senderName: session.userName,
        data: {
          activeCollaborators: Array.from(room.values()).map((s) => ({
            userId: s.userId,
            userName: s.userName,
            cursor: s.cursor,
            playhead: s.playhead,
          })),
        },
      },
      session.connectionId
    );
  }

  leaveRoom(connectionId: string, projectId: string) {
    const room = this.rooms.get(projectId);
    if (!room) return;

    const session = room.get(connectionId);
    if (!session) return;

    room.delete(connectionId);
    logger.info({ userId: session.userId, projectId, remaining: room.size }, 'Collaborator left project room');

    // Clean up any track locks owned by this user
    for (const [key, ownerId] of this.trackLocks.entries()) {
      if (key.startsWith(`${projectId}:`) && ownerId === session.userId) {
        this.trackLocks.delete(key);
      }
    }

    if (room.size === 0) {
      this.rooms.delete(projectId);
    } else {
      this.broadcast(projectId, {
        action: 'USER_LEFT',
        projectId,
        senderId: session.userId,
        senderName: session.userName,
        data: { userId: session.userId },
      });
    }
  }

  handleMessage(connectionId: string, message: CollaborationMessage) {
    const room = this.rooms.get(message.projectId);
    if (!room) return;

    const session = room.get(connectionId);
    if (!session) return;

    switch (message.action) {
      case 'CURSOR_MOVE':
        session.cursor = message.data;
        this.broadcast(message.projectId, message, connectionId);
        break;

      case 'SEEK_PLAYHEAD':
        session.playhead = message.data?.time;
        this.broadcast(message.projectId, message, connectionId);
        break;

      case 'TIMELINE_MUTATION':
        // Broadcast timeline change to all other editors in the room
        this.broadcast(message.projectId, message, connectionId);
        break;

      case 'LOCK_TRACK': {
        const lockKey = `${message.projectId}:${message.data?.trackId}`;
        const currentOwner = this.trackLocks.get(lockKey);
        if (!currentOwner || currentOwner === session.userId) {
          this.trackLocks.set(lockKey, session.userId);
          this.broadcast(message.projectId, {
            ...message,
            data: { trackId: message.data?.trackId, lockedBy: session.userId },
          });
        } else {
          // Send error back to requester
          session.socket.send(
            JSON.stringify({
              action: 'ERROR',
              projectId: message.projectId,
              data: { message: `Track is currently locked by another editor` },
            })
          );
        }
        break;
      }

      case 'UNLOCK_TRACK': {
        const lockKey = `${message.projectId}:${message.data?.trackId}`;
        if (this.trackLocks.get(lockKey) === session.userId) {
          this.trackLocks.delete(lockKey);
          this.broadcast(message.projectId, message);
        }
        break;
      }

      default:
        this.broadcast(message.projectId, message, connectionId);
        break;
    }
  }

  broadcast(projectId: string, message: CollaborationMessage, excludeConnectionId?: string) {
    const room = this.rooms.get(projectId);
    if (!room) return;

    const payload = JSON.stringify({
      ...message,
      timestamp: Date.now(),
    });

    for (const [connId, session] of room.entries()) {
      if (excludeConnectionId && connId === excludeConnectionId) continue;
      if (session.socket.readyState === WebSocket.OPEN) {
        session.socket.send(payload);
      }
    }
  }

  getRoomCount(projectId: string): number {
    return this.rooms.get(projectId)?.size || 0;
  }
}

export const collaborationManager = new CollaborationManager();
