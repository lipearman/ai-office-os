import json
import uuid
from fastapi import WebSocket
from typing import Any


class ConnectionManager:
    def __init__(self):
        # workspace_id -> {user_id -> WebSocket}
        self._connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, workspace_id: str, user_id: str):
        await websocket.accept()
        if workspace_id not in self._connections:
            self._connections[workspace_id] = {}
        self._connections[workspace_id][user_id] = websocket

    def disconnect(self, workspace_id: str, user_id: str):
        if workspace_id in self._connections:
            self._connections[workspace_id].pop(user_id, None)
            if not self._connections[workspace_id]:
                del self._connections[workspace_id]

    async def send_to_user(self, user_id: str, workspace_id: str, data: Any):
        ws = self._connections.get(workspace_id, {}).get(user_id)
        if ws:
            await ws.send_text(json.dumps(data))

    async def broadcast_workspace(self, workspace_id: str, data: Any, exclude_user: str | None = None):
        connections = self._connections.get(workspace_id, {})
        for uid, ws in list(connections.items()):
            if uid != exclude_user:
                try:
                    await ws.send_text(json.dumps(data))
                except Exception:
                    self.disconnect(workspace_id, uid)

    def get_online_users(self, workspace_id: str) -> list[str]:
        return list(self._connections.get(workspace_id, {}).keys())


manager = ConnectionManager()
