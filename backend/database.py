import asyncpg
import json
import os
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://madhva:password@127.0.0.1:5432/incident_db")
IN_MEMORY_INCIDENTS = []

async def init_db():
    try:
        conn = await asyncpg.connect(DATABASE_URL, timeout=2.0)
        
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS cameras (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                rtsp_url TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now()
            );
        ''')
        
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS incidents (
                id BIGSERIAL PRIMARY KEY,
                camera_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                severity SMALLINT NOT NULL,
                confidence REAL NOT NULL,
                started_at TIMESTAMPTZ NOT NULL,
                metadata JSONB
            );
        ''')
        await conn.close()
        print("PostgreSQL Database schema initialized successfully.")
    except Exception as e:
        print(f"Notice: PostgreSQL DB not connected ({e}). Operating with in-memory storage fallback.")

async def save_incident(incident_data):
    # Store in memory fallback first
    in_mem_record = {
        "id": incident_data.get("id"),
        "camera_id": incident_data.get("camera_id", "demo-cam-1"),
        "event_type": incident_data.get("type", "Unknown"),
        "severity": incident_data.get("severity", 1),
        "confidence": incident_data.get("confidence", 0.0),
        "started_at": datetime.fromtimestamp(incident_data.get("timestamp", datetime.now().timestamp())).isoformat()
    }
    IN_MEMORY_INCIDENTS.append(in_mem_record)

    try:
        conn = await asyncpg.connect(DATABASE_URL, timeout=2.0)
        await conn.execute('''
            INSERT INTO incidents (camera_id, event_type, severity, confidence, started_at, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
        ''', 
        incident_data['camera_id'],
        incident_data['type'],
        incident_data['severity'],
        incident_data['confidence'],
        datetime.fromtimestamp(incident_data['timestamp']),
        json.dumps(incident_data)
        )
        await conn.close()
        print(f"Incident saved to DB: {incident_data['type']}")
    except Exception as e:
        pass

async def get_incidents(limit=50):
    try:
        conn = await asyncpg.connect(DATABASE_URL, timeout=2.0)
        records = await conn.fetch('''
            SELECT id, camera_id, event_type, severity, confidence, started_at
            FROM incidents
            ORDER BY started_at DESC
            LIMIT $1
        ''', limit)
        await conn.close()
        return [dict(r) for r in records]
    except Exception:
        # Return memory list sorted newest first
        return list(reversed(IN_MEMORY_INCIDENTS))[:limit]

