import os
import cv2
import multiprocessing as mp
import time
import numpy as np

def create_synthetic_frame(seq):
    # Create 640x480 dark CCTV style idle canvas
    h, w = 480, 640
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    frame[:, :] = (15, 18, 24)
    cv2.putText(frame, "AI ENGINE IDLE — START SIMULATION TO EVALUATE DATASET", (30, h // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (150, 150, 150), 1, cv2.LINE_AA)
    return frame


def camera_worker_process(source, out_queue, max_queue=30):
    """
    Dedicated process to grab frames and push to a queue, bypassing the GIL.
    WEBCAM ACCESS REMOVED COMPLETELY. Uses synthetic feed if source is 0 or non-file.
    """
    print(f"Starting camera worker for source: {source}")
    use_synthetic = True
    cap = None
    if isinstance(source, str) and os.path.exists(source):
        cap = cv2.VideoCapture(source)
        use_synthetic = False
        
    seq = 0
    while True:
        if not use_synthetic and cap is not None:
            ret, frame = cap.read()
            if not ret or frame is None:
                use_synthetic = True
        else:
            frame = create_synthetic_frame(seq)
            time.sleep(0.033) # ~30 FPS

            
        # Backpressure: drop oldest if queue is full
        if out_queue.qsize() >= max_queue:
            try:
                out_queue.get_nowait() 
            except Exception:
                pass
                
        out_queue.put({
            "cam_id": "demo-cam-1",
            "seq": seq,
            "frame": frame,
            "ts": time.time()
        })
        seq += 1

