from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.websocket.manager import manager
from app.core.security import decode_token
import json

router = APIRouter()


@router.websocket("/ws/{workspace_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    workspace_id: str,
    token: str = Query(...),
):
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    user_id = payload["sub"]
    await manager.connect(websocket, workspace_id, user_id)

    # Notify others
    await manager.broadcast_workspace(
        workspace_id,
        {"type": "presence", "event": "join", "user_id": user_id},
        exclude_user=user_id,
    )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                data["user_id"] = user_id
                await manager.broadcast_workspace(workspace_id, data, exclude_user=user_id)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(workspace_id, user_id)
        await manager.broadcast_workspace(
            workspace_id,
            {"type": "presence", "event": "leave", "user_id": user_id},
        )
