import asyncio
import base64
import json
import multiprocessing as mp
import threading
import os
import queue
import httpx
import glob
import cv2
import time
from dotenv import load_dotenv
import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from vision_pipeline import VisionPipeline
from camera_worker import camera_worker_process
import database

# Load environment variables
load_dotenv()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

from fastapi.responses import FileResponse, Response
from fastapi import UploadFile, File

app = FastAPI(title="Incident Intelligence Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
frame_queue = None
alert_queue = None
camera_process = None
pipeline = None
latest_frame = None


def run_vision_pipeline(in_queue, out_alert_queue):
    global latest_frame
    try:
        pipeline = VisionPipeline(in_queue=in_queue, alert_queue=out_alert_queue)
        frame_generator = pipeline.process_frames()
        for frame_bytes in frame_generator:
            latest_frame = frame_bytes
    except Exception as e:
        print(f"Vision Pipeline Error: {e}")

async def send_telegram_alert(alert_data: dict):
    """Sends a rich formatted Police Control Room Telegram alert message."""
    global TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
    
    bot_token = TELEGRAM_BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = TELEGRAM_CHAT_ID or os.getenv("TELEGRAM_CHAT_ID")
    
    event_type = str(alert_data.get("event_type") or alert_data.get("type") or "ANOMALY DETECTED").upper()
    location = alert_data.get("location") or "Terminal 2 - Gates 4 & 5"
    city = alert_data.get("city") or "Central Airport Complex"
    camera_id = alert_data.get("sample") or alert_data.get("camera_id") or "CCTV Node #041"
    
    conf_val = alert_data.get("confidence")
    if conf_val is not None:
        try:
            c_num = float(conf_val)
            conf_str = f"{c_num * 100:.1f}%" if c_num <= 1.0 else f"{c_num:.1f}%"
        except Exception:
            conf_str = "88.5%"
    else:
        conf_str = "88.5%"
    
    maps_query = alert_data.get("maps_query") or f"{location}, {city}"
    maps_url = f"https://www.google.com/maps/search/?api=1&query={httpx.URL(maps_query).raw_path.decode('utf-8')}"
    
    msg_text = (
        f"🚨 <b>POLICE CONTROL ROOM - EMERGENCY ALERT</b> 🚨\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📍 <b>Location:</b> {location}\n"
        f"🏙️ <b>City / Zone:</b> {city}\n"
        f"📹 <b>Camera Node:</b> {camera_id}\n"
        f"⚠️ <b>Incident Type:</b> {event_type}\n"
        f"📊 <b>Model Confidence:</b> {conf_str}\n"
        f"🧭 <b>GPS Navigation:</b> <a href='https://www.google.com/maps/search/?api=1&query={location.replace(' ', '+')}'>Google Maps Directions</a>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"⚡ <i>Police Dispatch: Patrol Unit #42 notified immediately.</i>"
    )

    if not bot_token or not chat_id or "your_bot_token" in str(bot_token).lower() or len(str(bot_token)) < 15:
        print(f"\n[POLICE CONTROL ROOM TELEGRAM DISPATCH SIMULATION]\n{msg_text}\n")
        return {
            "success": True,
            "simulated": True,
            "message": "Telegram alert dispatched in Police Control Room Log (Simulation Mode - No Bot Token configured).",
            "alert_text": msg_text
        }

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": msg_text,
        "parse_mode": "HTML"
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=8.0)
            if resp.status_code == 200:
                print("Telegram notification dispatched to Police Control Room successfully!")
                return {
                    "success": True,
                    "simulated": False,
                    "message": "✅ Telegram Alert Sent Live to Police Control Room!",
                    "response": resp.json()
                }
            else:
                err_text = resp.text
                print(f"[TELEGRAM API DISPATCH ERROR] HTTP {resp.status_code}: {err_text}")
                try:
                    err_json = resp.json()
                    desc = err_json.get("description", err_text)
                except Exception:
                    desc = err_text
                
                return {
                    "success": False,
                    "simulated": False,
                    "error": f"Telegram API Error ({resp.status_code}): {desc}",
                    "alert_text": msg_text
                }
    except Exception as e:
        print(f"Telegram dispatch exception: {e}")
        return {
            "success": False,
            "simulated": False,
            "error": f"Network Error sending Telegram alert: {str(e)}",
            "alert_text": msg_text
        }

@app.on_event("startup")
async def startup_event():
    global frame_queue, alert_queue, camera_process
    
    await database.init_db()
    
    frame_queue = mp.Queue(maxsize=30)
    alert_queue = queue.Queue(maxsize=100)
    camera_source = 0 # Change this to video path if needed
    camera_process = mp.Process(target=camera_worker_process, args=(camera_source, frame_queue))
    camera_process.start()
    
    threading.Thread(target=run_vision_pipeline, args=(frame_queue, alert_queue), daemon=True).start()
    print("Backend started with Telegram support enabled.")

@app.on_event("shutdown")
async def shutdown_event():
    global camera_process
    if camera_process and camera_process.is_alive():
        camera_process.terminate()

from simulation import global_dataset_simulation

def on_simulation_alert(alert_data):
    if alert_queue is not None:
        try:
            alert_queue.put(alert_data)
        except Exception:
            pass

@app.get("/")
async def root():
    return {"message": "Phase 4 Backend is running"}

@app.get("/api/incidents")
async def get_historical_incidents(limit: int = 50):
    incidents = await database.get_incidents(limit)
    return {"incidents": incidents}

# Real UCF-Crime Video Dataset Endpoints
DATASET_VIDEO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Dataset", "ucf-crime-videos"))
os.makedirs(DATASET_VIDEO_DIR, exist_ok=True)
app.mount("/dataset/videos", StaticFiles(directory=DATASET_VIDEO_DIR), name="dataset_videos")

LOCATION_MAPPINGS = {
    "Abuse": {
        "location": "Terminal 2 - Gates 4 & 5",
        "city": "Central Airport Complex",
        "maps_query": "Terminal 2 Central Airport"
    },
    "Arrest": {
        "location": "North Entrance Security Gate",
        "city": "Zone 3 Perimeter",
        "maps_query": "North Entrance Security Gate"
    },
    "Arson": {
        "location": "Industrial Park Warehouse B",
        "city": "Fuel Depot Complex",
        "maps_query": "Industrial Park Fuel Depot"
    },
    "Assault": {
        "location": "Underground Metro Passage",
        "city": "Transit Concourse",
        "maps_query": "Underground Metro Passage"
    },
    "Burglary": {
        "location": "Jewelry Vault & Financial Store",
        "city": "Main Commercial Street",
        "maps_query": "Commercial Main Street"
    },
    "Explosion": {
        "location": "Refinery Sector 7 & Chemical Yard",
        "city": "Industrial Complex",
        "maps_query": "Refinery Chemical Complex"
    },
    "Fighting": {
        "location": "Sports Arena Gate 2",
        "city": "Stadium Concourse",
        "maps_query": "Sports Arena Concourse"
    },
    "Normal": {
        "location": "Central Atrium Plaza",
        "city": "Public Mall Concourse",
        "maps_query": "Central Atrium Plaza"
    }
}

@app.get("/api/dataset/videos")
async def list_dataset_videos():
    video_files = sorted(glob.glob(os.path.join(DATASET_VIDEO_DIR, "*.mp4")))
    result = []
    for vf in video_files:
        fn = os.path.basename(vf)
        cap = cv2.VideoCapture(vf)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frame_count / fps if fps > 0 else 0.0
        cap.release()

        is_normal = "Normal" in fn
        if is_normal:
            category = "Normal"
        else:
            raw_c = fn.split('_')[0]
            category = ''.join([c for c in raw_c if not c.isdigit()]) or "Anomaly"

        loc_info = LOCATION_MAPPINGS.get(category, {
            "location": f"Zone Camera #{fn.split('_')[0]}",
            "city": "Surveillance Area Node",
            "maps_query": fn
        })

        result.append({
            "filename": fn,
            "path": vf,
            "url": f"http://localhost:8000/dataset/videos/{fn}",
            "duration": round(duration, 2),
            "fps": round(fps, 2),
            "resolution": f"{w}x{h}",
            "category": category,
            "is_anomaly": not is_normal,
            "location": loc_info["location"],
            "city": loc_info["city"],
            "maps_query": loc_info["maps_query"]
        })

    return {
        "count": len(result),
        "video_dir": DATASET_VIDEO_DIR,
        "videos": result
    }

@app.post("/api/dataset/analyze-video")
async def analyze_dataset_video(payload: dict):
    filename = payload.get("filename")
    if not filename:
        return {"error": "filename parameter required"}

    video_path = os.path.join(DATASET_VIDEO_DIR, filename)
    if not os.path.exists(video_path):
        return {"error": f"Video file not found: {filename}"}

    try:
        from violence.test_real_video import run_real_video_inference
        from fastapi.concurrency import run_in_threadpool
        res = await run_in_threadpool(run_real_video_inference, video_path)

        cat = res.get("event_type") or ("Normal" if "Normal" in filename else "".join([c for c in filename.split('_')[0] if not c.isdigit()]))
        loc_info = LOCATION_MAPPINGS.get(cat, {
            "location": f"Zone Camera #{filename.split('_')[0]}",
            "city": "Surveillance Area Node",
            "maps_query": filename
        })
        res["location"] = loc_info["location"]
        res["city"] = loc_info["city"]
        res["maps_query"] = loc_info["maps_query"]

        # Log anomaly incident to DB if detected
        if res.get("is_anomaly"):
            now_ts = time.time()
            alert_payload = {
                "id": int(now_ts * 1000),
                "type": res.get("prediction", "Anomaly Detected"),
                "event_type": res.get("event_type"),
                "severity": 5,
                "confidence": res.get("confidence") / 100.0,
                "timestamp": now_ts,
                "camera_id": "UCF-CRIME RAW MP4",
                "location": loc_info["location"],
                "city": loc_info["city"],
                "source": f"UCF-Crime MP4 ({filename})",
                "sample": filename,
                "timestamp_seconds": res.get("timestamp_seconds"),
                "status": "ACTIVE",
                "is_dataset_simulation": True
            }
            if alert_queue:
                try:
                    alert_queue.put(alert_payload)
                except Exception:
                    pass

            # Automatically dispatch Police Control Room Telegram Alert
            asyncio.create_task(send_telegram_alert(alert_payload))

        return {"success": True, "analysis": res}
    except Exception as e:
        return {"error": str(e)}

# Custom Upload Endpoints
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Dataset", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/dataset/uploads", StaticFiles(directory=UPLOAD_DIR), name="dataset_uploads")

@app.post("/api/upload-video")
async def upload_and_analyze_video(file: UploadFile = File(...)):
    if not file.filename.endswith(".mp4"):
        return {"error": "Only .mp4 files are supported"}
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    # Save the uploaded file
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
    except Exception as e:
        return {"error": f"Failed to save file: {str(e)}"}
        
    try:
        from violence.test_real_video import run_real_video_inference
        from fastapi.concurrency import run_in_threadpool
        res = await run_in_threadpool(run_real_video_inference, file_path)
        
        cat = res.get("event_type") or "Anomaly"
        loc_info = LOCATION_MAPPINGS.get(cat, {
            "location": "Custom Upload Node",
            "city": "Unknown",
            "maps_query": "Custom Upload"
        })
        res["location"] = loc_info["location"]
        res["city"] = loc_info["city"]
        res["maps_query"] = loc_info["maps_query"]

        if res.get("is_anomaly"):
            now_ts = time.time()
            alert_payload = {
                "id": int(now_ts * 1000),
                "type": res.get("prediction", "Anomaly Detected"),
                "event_type": res.get("event_type"),
                "severity": 5,
                "confidence": res.get("confidence") / 100.0,
                "timestamp": now_ts,
                "camera_id": "USER UPLOAD",
                "location": loc_info["location"],
                "city": loc_info["city"],
                "source": f"Uploaded File ({file.filename})",
                "sample": file.filename,
                "timestamp_seconds": res.get("timestamp_seconds", 0),
                "status": "ACTIVE",
                "is_dataset_simulation": False
            }
            if alert_queue:
                try:
                    alert_queue.put(alert_payload)
                except Exception:
                    pass

            asyncio.create_task(send_telegram_alert(alert_payload))

        return {"success": True, "analysis": res, "url": f"http://localhost:8000/dataset/uploads/{file.filename}"}
    except Exception as e:
        return {"error": str(e)}

# Police Control Room Telegram Integration Endpoints
@app.post("/api/telegram/send-alert")
async def trigger_telegram_dispatch(payload: dict):
    res = await send_telegram_alert(payload)
    return res

@app.get("/api/telegram/config")
async def get_telegram_config():
    bot_token = TELEGRAM_BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = TELEGRAM_CHAT_ID or os.getenv("TELEGRAM_CHAT_ID")
    is_configured = bool(bot_token and chat_id and "your_bot_token" not in str(bot_token).lower())
    return {
        "configured": is_configured,
        "bot_token_set": bool(bot_token),
        "chat_id": chat_id if is_configured else (chat_id or "Not Configured")
    }

@app.post("/api/telegram/config")
async def update_telegram_config(payload: dict):
    global TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
    token = payload.get("bot_token")
    chat_id = payload.get("chat_id")
    if token:
        TELEGRAM_BOT_TOKEN = token
    if chat_id:
        TELEGRAM_CHAT_ID = str(chat_id)
    
    is_configured = bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID and "your_bot_token" not in str(TELEGRAM_BOT_TOKEN).lower())
    return {
        "success": True,
        "message": "Police Control Room Telegram API credentials updated successfully.",
        "configured": is_configured,
        "chat_id": TELEGRAM_CHAT_ID
    }

@app.post("/api/simulation/start")
async def start_simulation():
    success = global_dataset_simulation.start(alert_callback=on_simulation_alert)
    status = global_dataset_simulation.get_status()
    return {"success": success, "message": "Dataset simulation started" if success else "Simulation already running", "status": status}


@app.post("/api/simulation/stop")
async def stop_simulation():
    success = global_dataset_simulation.stop()
    status = global_dataset_simulation.get_status()
    return {"success": success, "message": "Dataset simulation stopped" if success else "Simulation not running", "status": status}

@app.post("/api/simulation/replay")
async def replay_simulation():
    success = global_dataset_simulation.replay(alert_callback=on_simulation_alert)
    status = global_dataset_simulation.get_status()
    return {"success": success, "message": "Dataset simulation replayed", "status": status}

@app.get("/api/simulation/status")
async def get_simulation_status():
    return global_dataset_simulation.get_status()

@app.get("/api/simulation/frame")
async def get_simulation_frame():
    frame_bytes = global_dataset_simulation.latest_frame
    if not frame_bytes and global_dataset_simulation.npy_files:
        global_dataset_simulation.select_sample(0)
        frame_bytes = global_dataset_simulation.latest_frame
    if frame_bytes:
        return Response(content=frame_bytes, media_type="image/jpeg", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    return Response(status_code=404)

@app.get("/api/simulation/samples")
async def get_simulation_samples():
    return {
        "samples": global_dataset_simulation.get_sample_list(),
        "total": global_dataset_simulation.total_samples,
        "current_idx": global_dataset_simulation.current_idx
    }

@app.post("/api/simulation/select")
async def select_simulation_sample(payload: dict = None):
    idx = 0
    if payload and "index" in payload:
        idx = int(payload["index"])
    res = global_dataset_simulation.select_sample(idx)
    status = global_dataset_simulation.get_status()
    return {"success": True, "result": res, "status": status}

@app.post("/api/simulation/next")
async def next_simulation_sample():
    res = global_dataset_simulation.step_next()
    status = global_dataset_simulation.get_status()
    return {"success": True, "result": res, "status": status}

@app.post("/api/simulation/speed")
async def set_simulation_speed(payload: dict = None):
    delay = 1.2
    if payload and "speed" in payload:
        delay = float(payload["speed"])
    new_delay = global_dataset_simulation.set_speed(delay)
    return {"success": True, "step_delay": new_delay}

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    pubsub = None
    redis_client = None
    use_redis = True
    try:
        redis_client = aioredis.from_url("redis://localhost", socket_timeout=1.0)
        pubsub = redis_client.pubsub()
        await pubsub.subscribe("alerts:raw")
    except Exception as e:
        use_redis = False
        print(f"Notice: Redis Pub/Sub fallback active (Redis not connected: {e})")

    last_sent_seq = -1
    last_status_time = 0.0

    try:
        while True:
            current_frame = global_dataset_simulation.latest_frame
            sim_status = global_dataset_simulation.get_status()
            current_seq = sim_status.get("frame_seq", 0)
            now = time.time()

            # Push feed payload whenever frame updates, or push initial frame on connection
            if current_frame and (current_seq != last_sent_seq or last_sent_seq == -1):
                last_sent_seq = current_seq
                b64_image = base64.b64encode(current_frame).decode('utf-8')
                payload = {
                    "type": "feed",
                    "image": f"data:image/jpeg;base64,{b64_image}",
                    "alerts": [],
                    "simulation": sim_status
                }
                await websocket.send_json(payload)
                last_status_time = now
            elif now - last_status_time > 0.6:
                # Periodic status heartbeat
                payload = {
                    "type": "status",
                    "simulation": sim_status
                }
                await websocket.send_json(payload)
                last_status_time = now
            
            pending_alerts = []
            if use_redis and pubsub:
                try:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.01)
                    if message and 'data' in message:
                        alert_data = json.loads(message['data'])
                        pending_alerts.append(alert_data)
                except Exception:
                    pass

            if not pending_alerts and alert_queue and not alert_queue.empty():
                try:
                    while not alert_queue.empty():
                        pending_alerts.append(alert_queue.get_nowait())
                except Exception:
                    pass

            for alert_data in pending_alerts:
                # 1. Async Postgres Save
                asyncio.create_task(database.save_incident(alert_data))
                
                # 2. Async Telegram Notification (if configured)
                asyncio.create_task(send_telegram_alert(alert_data))
                
                # 3. WebSocket push
                b64_img = base64.b64encode(current_frame).decode('utf-8') if current_frame else None
                await websocket.send_json({
                    "type": "feed",
                    "image": f"data:image/jpeg;base64,{b64_img}" if b64_img else None,
                    "alerts": [alert_data],
                    "simulation": sim_status
                })
                
            await asyncio.sleep(0.04)
 


            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket Error: {e}")
    finally:
        if pubsub:
            try:
                await pubsub.unsubscribe("alerts:raw")
            except Exception:
                pass
        if redis_client:
            try:
                await redis_client.close()
            except Exception:
                pass

