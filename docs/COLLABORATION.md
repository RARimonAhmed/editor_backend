# Real-Time Collaboration & Multiplayer Sync Specification

## 1. Overview
The `my_editor` collaboration subsystem empowers creative teams to edit video projects simultaneously across Windows and Android devices without destructive timeline collisions.

---

## 2. Connection Lifecycle

### Establishing Connection
Connect to the project room via secure WebSocket:
```
ws://<HOST>:<PORT>/ws/v1/collaboration/<PROJECT_ID>?token=<JWT_ACCESS_TOKEN>
```
If token validation succeeds, the user is joined with their identity and assigned permissions.

---

## 3. Message Framing

All messages exchanged over the WebSocket must be JSON objects formatted as:
```json
{
  "action": "ACTION_NAME",
  "projectId": "uuid",
  "senderId": "user-uuid",
  "senderName": "Display Name",
  "data": { ... },
  "timestamp": 1716163200000
}
```

---

## 4. Supported Action Types

### 4.1 Presence & Telemetry
- `USER_JOINED`: Broadcast by server when a collaborator enters the room.
- `USER_LEFT`: Broadcast by server when a collaborator exits.
- `CURSOR_MOVE`: Live mouse or touch position over the timeline canvas.
  ```json
  {
    "action": "CURSOR_MOVE",
    "projectId": "...",
    "data": {
      "x": 420.5,
      "y": 180.0,
      "trackIndex": 1
    }
  }
  ```
- `SEEK_PLAYHEAD`: Synchronizes video playback head scrubbing across preview monitors.
  ```json
  {
    "action": "SEEK_PLAYHEAD",
    "projectId": "...",
    "data": {
      "time": 14.85
    }
  }
  ```

### 4.2 Timeline Mutations
- `TIMELINE_MUTATION`: Dispatched when an editor performs non-conflicting actions (e.g. adding B-roll, moving a clip, or modifying effects).
  ```json
  {
    "action": "TIMELINE_MUTATION",
    "projectId": "...",
    "data": {
      "mutationType": "MOVE_CLIP",
      "trackId": "track-v1",
      "clipId": "clip-123",
      "newStart": 5.0,
      "version": 4
    }
  }
  ```

### 4.3 Track Locking (Collision Avoidance)
To guarantee safe editing of complex video/audio tracks during tight cuts, users can acquire an exclusive track lock:
- `LOCK_TRACK`:
  ```json
  {
    "action": "LOCK_TRACK",
    "projectId": "...",
    "data": {
      "trackId": "track-v1"
    }
  }
  ```
  If another user holds the lock, the server responds with an `ERROR` message.
- `UNLOCK_TRACK`: Releases the track for editing by other team members.
