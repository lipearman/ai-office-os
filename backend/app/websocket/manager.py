import json
from fastapi import WebSocket
from typing import Any


class ConnectionManager:
    def __init__(self):
        # workspace_id -> {user_id -> set[WebSocket]}
        self._connections: dict[str, dict[str, set[WebSocket]]] = {}

    async def connect(self, websocket: WebSocket, workspace_id: str, user_id: str):
        await websocket.accept()
        if workspace_id not in self._connections:
            self._connections[workspace_id] = {}
        if user_id not in self._connections[workspace_id]:
            self._connections[workspace_id][user_id] = set()
        self._connections[workspace_id][user_id].add(websocket)

    def disconnect(self, workspace_id: str, user_id: str, websocket: WebSocket | None = None):
        if workspace_id not in self._connections:
            return
        user_sockets = self._connections[workspace_id].get(user_id)
        if not user_sockets:
            return
        if websocket:
            user_sockets.discard(websocket)
        else:
            user_sockets.clear()
        if not user_sockets:
            del self._connections[workspace_id][user_id]
            if not self._connections[workspace_id]:
                del self._connections[workspace_id]

    async def send_to_user(self, user_id: str, workspace_id: str, data: Any):
        user_sockets = self._connections.get(workspace_id, {}).get(user_id)
        if not user_sockets:
            return
        payload = json.dumps(data)
        for ws in list(user_sockets):
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(workspace_id, user_id, ws)

    async def broadcast_workspace(self, workspace_id: str, data: Any, exclude_user: str | None = None):
        connections = self._connections.get(workspace_id, {})
        payload = json.dumps(data)
        for uid, user_sockets in list(connections.items()):
            if uid == exclude_user:
                continue
            for ws in list(user_sockets):
                try:
                    await ws.send_text(payload)
                except Exception:
                    self.disconnect(workspace_id, uid, ws)

    def is_online(self, workspace_id: str, user_id: str) -> bool:
        user_sockets = self._connections.get(workspace_id, {}).get(user_id)
        return bool(user_sockets)

    def get_online_users(self, workspace_id: str) -> list[str]:
        return list(self._connections.get(workspace_id, {}).keys())


manager = ConnectionManager()
