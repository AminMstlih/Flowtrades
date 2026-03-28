import asyncio
import websockets
async def run():
    async with websockets.connect('ws://localhost:8000/ws/footprint') as ws:
        print(await ws.recv())
asyncio.run(run())
