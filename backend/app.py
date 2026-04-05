import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# rooms: maps room_name -> list of connected WebSockets
# e.g. { "my-page": [ws1, ws2, ws3] }
rooms: dict[str, list[WebSocket]] = {}

class PageSaveRequest(BaseModel):
    body: str
    last_edited_by: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/{room_name}")
async def websocket_endpoint(websocket: WebSocket, room_name: str):
    await websocket.accept()

    # Add this socket to the room
    if room_name not in rooms:
        rooms[room_name] = []
    rooms[room_name].append(websocket)

    print(f"[+] Client joined room '{room_name}'. "
          f"Total in room: {len(rooms[room_name])}")

    try:
        while True:
            # Yjs sends binary messages (Uint8Array updates)
            # Receive as bytes, broadcast to everyone else in the room
            data = await websocket.receive_bytes()
            await broadcast(data, websocket, room_name)

    except WebSocketDisconnect:
        await remove_from_room(websocket, room_name)

    except Exception as e:
        print(f"[!] Unexpected error in room '{room_name}': {e}")
        await remove_from_room(websocket, room_name)


@app.put("/api/pages/{slug}")
async def save_page(slug: str, payload: PageSaveRequest):
    # For now just print it - replace with real DB call later
    print(f"Saving page '{slug}' edited by '{payload.last_edited_by}'")
    print(f"Content preview: {payload.body[:100]}")
    return {"status": "saved", "slug": slug}


async def remove_from_room(websocket: WebSocket, room_name: str):
    """Safely remove a websocket from a room, if it exists."""
    if room_name in rooms and websocket in rooms[room_name]:
        rooms[room_name].remove(websocket)
        print(f"[-] Client left '{room_name}'. Remaining: {len(rooms[room_name])}")
        if len(rooms[room_name]) == 0:
            del rooms[room_name]


async def broadcast(data: bytes, sender: WebSocket, room_name: str):
    """Broadcast to all other clients, removing any that have died."""
    dead = []
    for client in rooms.get(room_name, []):
        if client is sender:
            continue

        try:
            await client.send_bytes(data)
        except Exception:
            # This client is dead but did not disconnect cleanly
            dead.append(client)

    # Clean up dead connections after the loop
    for client in dead:
        await remove_from_room(client, room_name)
