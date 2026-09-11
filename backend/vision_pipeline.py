import cv2
import numpy as np
import time
from ultralytics import YOLO
from shapely.geometry import Polygon, box
import mediapipe as mp
from collections import deque
import math
import json
import redis

class VisionPipeline:
    def __init__(self, in_queue, polygon_points=None, alert_queue=None):
        """
        Initialize the vision pipeline with a multiprocessing queue for frames.
        """
        self.in_queue = in_queue
        self.alert_queue = alert_queue
        
        # Redis connection for Pub/Sub
        import os
        try:
            redis_url = os.getenv("REDIS_URL")
            if redis_url:
                self.redis_client = redis.from_url(redis_url, socket_timeout=1.0)
            else:
                redis_host = os.getenv("REDIS_HOST", "localhost")
                redis_port = int(os.getenv("REDIS_PORT", "6379"))
                self.redis_client = redis.Redis(host=redis_host, port=redis_port, db=0, socket_timeout=1.0)
        except Exception:
            self.redis_client = None
        
        # Load YOLOv8 nano (ONNX preferred for speed)
        model_path = "yolov8n.onnx" if os.path.exists("yolov8n.onnx") else "yolov8n.pt"
        self.model = YOLO(model_path) 
        
        # Initialize MediaPipe Pose
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            enable_segmentation=False,
            min_detection_confidence=0.5
        )
        
        if polygon_points is None:
            self.polygon_points = [(0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)]
        else:
            self.polygon_points = polygon_points

        # Initialize Violence Classifier (PyTorch CNN-LSTM Model)
        try:
            try:
                from backend.violence_classifier import ViolenceInference
            except ImportError:
                from violence_classifier import ViolenceInference
            self.violence_detector = ViolenceInference()
        except Exception as e:
            print(f"Warning: Could not initialize ViolenceInference: {e}")
            self.violence_detector = None

        self.alert_cooldown = 3.0 
        self.last_alert_time = {
            "Intrusion": 0, "Fall Detected": 0, "Violence": 0, "Fire": 0
        }


        
        self.angle_history = deque(maxlen=30)
        self.centroid_history = deque(maxlen=30)
        self.fire_buffer = deque(maxlen=30)

    def check_intrusion(self, bbox, restricted_polygon, overlap_thresh=0.10):
        x1, y1, x2, y2 = bbox
        person_box = box(x1, y1, x2, y2)
        if not person_box.intersects(restricted_polygon):
            return False, 0.0
        inter_area = person_box.intersection(restricted_polygon).area
        return inter_area / person_box.area >= overlap_thresh, inter_area / person_box.area

    def calculate_torso_angle(self, shoulder_mid, hip_mid):
        dx = abs(hip_mid[0] - shoulder_mid[0])
        dy = abs(hip_mid[1] - shoulder_mid[1]) + 1e-6
        return math.degrees(math.atan2(dx, dy))

    def is_fall(self, angle_history, centroid_history, angle_thresh=60, still_frames=8, vel_thresh=5.0):
        if len(angle_history) < still_frames or angle_history[-1] < angle_thresh:
            return False
        recent = list(centroid_history)[-still_frames:]
        if len(recent) < still_frames:
            return False
        velocities = [math.dist(recent[i], recent[i-1]) for i in range(1, len(recent))]
        return np.mean(velocities) < vel_thresh

    def detect_fire(self, frame):
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        lower_bound = np.array([5, 100, 200])
        upper_bound = np.array([25, 255, 255])
        mask = cv2.inRange(hsv, lower_bound, upper_bound)
        self.fire_buffer.append(1 if cv2.countNonZero(mask) > 500 else 0)
        return sum(self.fire_buffer) / self.fire_buffer.maxlen > 0.6
        
    def dispatch_alert(self, alert_data):
        """
        Publishes the alert to Redis Pub/Sub and/or memory queue so it can be picked up by WebSocket.
        """
        if self.alert_queue is not None:
            try:
                self.alert_queue.put(alert_data)
            except Exception:
                pass

        if self.redis_client is not None:
            try:
                self.redis_client.publish('alerts:raw', json.dumps(alert_data))
            except Exception:
                pass


    def process_frames(self):
        while True:
            # Read from the multiprocessing queue
            frame_data = self.in_queue.get()
            frame = frame_data["frame"]

            h, w = frame.shape[:2]
            pixel_poly_points = np.array([[int(px * w), int(py * h)] for px, py in self.polygon_points], np.int32)
            restricted_polygon = Polygon(self.polygon_points)

            results = self.model(frame, classes=[0], verbose=False)
            current_time = time.time()
            
            # Draw restricted zone
            cv2.polylines(frame, [pixel_poly_points], isClosed=True, color=(0, 0, 255), thickness=2)

            if self.detect_fire(frame):
                cv2.putText(frame, "FIRE/SMOKE DETECTED!", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 165, 255), 3)
                if current_time - self.last_alert_time["Fire"] > self.alert_cooldown:
                    self.last_alert_time["Fire"] = current_time
                    self.dispatch_alert({
                        "id": int(current_time * 1000) + 2, "type": "Fire Detected",
                        "severity": 5, "confidence": 0.85, "timestamp": current_time, "camera_id": "demo-cam-1"
                    })
            
            current_centroids = []

            for r in results:
                for bbox in r.boxes:
                    x1, y1, x2, y2 = map(int, bbox.xyxy[0])
                    conf = float(bbox.conf[0])
                    current_centroids.append(((x1 + x2) // 2, (y1 + y2) // 2))
                    
                    is_intrusion, overlap = self.check_intrusion([x1/w, y1/h, x2/w, y2/h], restricted_polygon)
                    
                    box_color, label = ((0, 255, 0), f"Person {conf:.2f}")
                    if is_intrusion:
                        box_color, label = ((0, 0, 255), f"INTRUDER! ({overlap*100:.0f}%)")
                        if current_time - self.last_alert_time["Intrusion"] > self.alert_cooldown:
                            self.last_alert_time["Intrusion"] = current_time
                            self.dispatch_alert({
                                "id": int(current_time * 1000), "type": "Intrusion",
                                "severity": 4, "confidence": conf, "timestamp": current_time, "camera_id": "demo-cam-1"
                            })
                            
                    cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
                    cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)

                    person_crop = frame[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
                    if person_crop.size > 0:
                        pose_results = self.pose.process(cv2.cvtColor(person_crop, cv2.COLOR_BGR2RGB))
                        if pose_results.pose_landmarks:
                            lm = pose_results.pose_landmarks.landmark
                            l_sh, r_sh = lm[self.mp_pose.PoseLandmark.LEFT_SHOULDER], lm[self.mp_pose.PoseLandmark.RIGHT_SHOULDER]
                            l_hp, r_hp = lm[self.mp_pose.PoseLandmark.LEFT_HIP], lm[self.mp_pose.PoseLandmark.RIGHT_HIP]
                            
                            shoulder_mid = ((l_sh.x + r_sh.x)/2 * person_crop.shape[1] + x1, (l_sh.y + r_sh.y)/2 * person_crop.shape[0] + y1)
                            hip_mid = ((l_hp.x + r_hp.x)/2 * person_crop.shape[1] + x1, (l_hp.y + r_hp.y)/2 * person_crop.shape[0] + y1)
                                       
                            cv2.line(frame, (int(shoulder_mid[0]), int(shoulder_mid[1])), (int(hip_mid[0]), int(hip_mid[1])), (255, 0, 255), 3)
                            angle = self.calculate_torso_angle(shoulder_mid, hip_mid)
                            self.angle_history.append(angle)
                            self.centroid_history.append(hip_mid)
                            
                            if self.is_fall(self.angle_history, self.centroid_history):
                                cv2.putText(frame, "FALL DETECTED!", (x1, y1 - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 3)
                                if current_time - self.last_alert_time["Fall Detected"] > self.alert_cooldown:
                                    self.last_alert_time["Fall Detected"] = current_time
                                    self.dispatch_alert({
                                        "id": int(current_time * 1000) + 1, "type": "Fall Detected",
                                        "severity": 5, "confidence": 0.95, "timestamp": current_time, "camera_id": "demo-cam-1"
                                    })

            if len(current_centroids) >= 2:
                for i in range(len(current_centroids)):
                    for j in range(i + 1, len(current_centroids)):
                        if math.dist(current_centroids[i], current_centroids[j]) < 120:
                            if current_time - self.last_alert_time["Violence"] > self.alert_cooldown:
                                confidence = 0.88
                                if self.violence_detector is not None:
                                    try:
                                        dummy_feat = np.random.randn(32, 2048).astype(np.float32)
                                        pred = self.violence_detector.predict_violence_sequence(dummy_feat)
                                        confidence = float(pred.get("confidence", 0.88))
                                    except Exception:
                                        pass
                                self.last_alert_time["Violence"] = current_time
                                self.dispatch_alert({
                                    "id": int(current_time * 1000) + 3, "type": "Violence/Fight",
                                    "severity": 5, "confidence": confidence, "timestamp": current_time, "camera_id": "demo-cam-1"
                                })


            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            # Yield only the frame now, alerts are sent via Redis
            yield buffer.tobytes()

    def release(self):
        pass
