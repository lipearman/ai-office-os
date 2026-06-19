import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.websocket.manager import manager
from app.core.security import decode_token

router = APIRouter()

# Typed WebSocket event protocol
# Client → Server:
#   { "type": "chat.message",   "conversation_id": "...", "content": "..." }
#   { "type": "chat.typing",    "conversation_id": "...", "agent_id": "..." }
#   { "type": "chat.typing_stop","conversation_id": "...", "agent_id": "..." }
#   { "type": "presence.ping" }
# Server → Client (broadcast):
#   { "type": "chat.message",   "message": {...}, "user_id": "..." }
#   { "type": "chat.typing",    "user_id": "...", "agent_id": "...", "conversation_id": "..." }
#   { "type": "presence.join",  "user_id": "..." }
#   { "type": "presence.leave", "user_id": "..." }
#   { "type": "agent.status",   "agent_id": "...", "status": "..." }
#   { "type": "notification",   "level": "info|success|warning|error", "message": "..." }


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

    # Announce presence
    await manager.broadcast_workspace(
        workspace_id,
        {"type": "presence.join", "user_id": user_id},
        exclude_user=user_id,
    )

    # Send current online list to the new user
    online = manager.get_online_users(workspace_id)
    await manager.send_to_user(user_id, workspace_id, {
        "type": "presence.list",
        "users": online,
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event_type = data.get("type", "")
            data["user_id"] = user_id

            if event_type in ("chat.typing", "chat.typing_stop"):
                # Broadcast typing status to workspace (others see it)
                await manager.broadcast_workspace(workspace_id, data, exclude_user=user_id)

            elif event_type == "presence.ping":
                await manager.send_to_user(user_id, workspace_id, {"type": "presence.pong"})

            elif event_type == "agent.status":
                # Broadcast agent status change to whole workspace
                await manager.broadcast_workspace(workspace_id, data)

            else:
                # Generic broadcast
                await manager.broadcast_workspace(workspace_id, data, exclude_user=user_id)

    except WebSocketDisconnect:
        manager.disconnect(workspace_id, user_id, websocket)
        if not manager.is_online(workspace_id, user_id):
            await manager.broadcast_workspace(
                workspace_id,
                {"type": "presence.leave", "user_id": user_id},
            )
