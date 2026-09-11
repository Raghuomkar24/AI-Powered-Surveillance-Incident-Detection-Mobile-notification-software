import React, { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../lib/api";

const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export default function VideoGridItem({ video, announceAnomalySpeech, sendTelegramAlert }: { video: any, announceAnomalySpeech: any, sendTelegramAlert: any }) {
  const [analyzingVideo, setAnalyzingVideo] = useState(false);
  const [videoAnalysis, setVideoAnalysis] = useState<any | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<any | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0.0);
  const [videoEnded, setVideoEnded] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastAnnouncedIntervalRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const analyzeVideo = async () => {
      setAnalyzingVideo(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/dataset/analyze-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: video.filename })
        });
        const data = await res.json();
        if (isMounted && data && data.analysis) {
          setVideoAnalysis(data.analysis);
        }
      } catch (err) {
        console.error("Video analysis error", err);
      } finally {
        if (isMounted) setAnalyzingVideo(false);
      }
    };
    analyzeVideo();
    return () => { isMounted = false; };
  }, [video.filename]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);

    const isAtEnd = videoRef.current.ended || (video.duration && t >= video.duration - 0.8);
    if (isAtEnd) {
      setVideoEnded(true);
    }

    if (videoAnalysis && videoAnalysis.intervals) {
      const intervals = videoAnalysis.intervals;
      const matched = intervals.find(
        (inv: any) => t >= inv.start_time && t <= inv.end_time
      );

      if (matched && matched.is_anomaly) {
        setActiveOverlay(matched);

        const intervalKey = `${video.filename}_${matched.start_time}_${matched.end_time}`;
        if (lastAnnouncedIntervalRef.current !== intervalKey) {
          lastAnnouncedIntervalRef.current = intervalKey;
          const tag = matched.label || matched.event_type || video.category || "Anomaly";
          const camName = video.filename
            ? `camera ${video.filename.replace('.mp4', '').replace('_x264', '')}`
            : "camera feed";
          const locName = video.location || videoAnalysis.location || "Terminal 2 Security Zone";
          announceAnomalySpeech(tag, camName, locName);

          sendTelegramAlert({
            type: tag,
            event_type: matched.event_type || video.category,
            location: video.location || videoAnalysis.location,
            city: video.city || videoAnalysis.city,
            sample: video.filename,
            confidence: (matched.peak_confidence || 88.5) / 100.0,
            maps_query: video.maps_query || video.location
          });
        }
      } else {
        setActiveOverlay(null);
      }
    } else {
      setActiveOverlay(null);
    }
  };

  const seekToTimestamp = (seconds: number) => {
    setVideoEnded(false);
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden aspect-video relative flex flex-col justify-between shadow-2xl">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/90 to-transparent flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          {analyzingVideo ? (
            <span className="text-[9px] bg-cyan-600 text-white font-bold px-1.5 py-0.5 rounded animate-pulse">
              ● INFERRING
            </span>
          ) : (
            <span className="text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded">
              ● READY
            </span>
          )}
          <span className="text-[10px] font-mono text-neutral-300 truncate w-32 bg-black/70 px-1 rounded" title={video.filename}>{video.filename}</span>
        </div>
      </div>

      {/* Synchronized In-Video Surveillance Incident Overlay */}
      {activeOverlay && (
        <div className="absolute top-8 left-2 z-20 pointer-events-none bg-red-950/90 border border-red-600 text-red-100 px-2 py-1.5 rounded-lg shadow-xl backdrop-blur-md animate-pulse transform scale-75 origin-top-left">
          <div className="flex items-center gap-1.5 font-black text-xs text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
            🔴 {activeOverlay.label || (activeOverlay.event_type ? `${activeOverlay.event_type.toUpperCase()} DETECTED` : "ANOMALY DETECTED")}
          </div>
          <div className="text-[10px] font-mono mt-0.5 text-red-200">
            Confidence: <span className="font-bold text-white">{activeOverlay.peak_confidence}%</span>
          </div>
        </div>
      )}

      {/* Real HTML5 Video Player */}
      <div className="w-full h-full flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          src={video.url}
          autoPlay
          muted
          loop
          onEnded={() => setVideoEnded(true)}
          onTimeUpdate={handleTimeUpdate}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Timeline Indicator Bar */}
      {videoAnalysis && (
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-neutral-900 z-10 opacity-80 hover:opacity-100 transition-opacity">
          <div className="relative w-full h-full bg-neutral-800 border-t border-neutral-700 overflow-hidden">
            {videoAnalysis.intervals && videoAnalysis.intervals.map((inv: any, idx: number) => {
              const leftPct = (inv.start_time / video.duration) * 100;
              const widthPct = Math.max(2, ((inv.end_time - inv.start_time) / video.duration) * 100);
              return (
                <div
                  key={idx}
                  onClick={() => seekToTimestamp(inv.start_time)}
                  className="absolute top-0 bottom-0 bg-red-600 hover:bg-red-500 cursor-pointer shadow-lg z-20"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`
                  }}
                  title={`Incident [${inv.start_time}s - ${inv.end_time}s]`}
                />
              );
            })}
            <div className="w-full h-full bg-gradient-to-r from-emerald-900/30 via-neutral-900 to-emerald-900/30"></div>
          </div>
        </div>
      )}
    </div>
  );
}
