"use client";

import { useEffect, useState, useRef } from "react";
import Head from "next/head";
import VideoGridItem from "../components/VideoGridItem";
import { API_BASE_URL, WS_BASE_URL } from "../lib/api";

export default function Home() {
  const [activeTab, setActiveTab] = useState("video"); // 'video', 'i3d', or 'history'
  const [historicalIncidents, setHistoricalIncidents] = useState<any[]>([]);
  
  // Real Video Dataset State
  const [videoList, setVideoList] = useState<any[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<any | null>(null);
  const [analyzingVideo, setAnalyzingVideo] = useState<boolean>(false);
  const [videoAnalysis, setVideoAnalysis] = useState<any | null>(null);
  const [currentDetections, setCurrentDetections] = useState<any[]>([]);
  const [activeOverlay, setActiveOverlay] = useState<any | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0.0);
  const [videoEnded, setVideoEnded] = useState<boolean>(false);
  
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [uploadingVideo, setUploadingVideo] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [isGridView, setIsGridView] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const categories = ["ALL", ...Array.from(new Set(videoList.map(v => v.category || "Anomaly")))];
  const filteredVideos = categoryFilter === "ALL"
    ? videoList
    : videoList.filter(v => (v.category || "Anomaly").toLowerCase() === categoryFilter.toLowerCase());

  // UCF-Crime I3D Feature Simulation State (.npy technical mode)
  const [canvasSrc, setCanvasSrc] = useState<string>("");
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simStatusText, setSimStatusText] = useState<string>("READY");
  const [currentSample, setCurrentSample] = useState<string>("None");
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [totalSamples, setTotalSamples] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [totalProcessed, setTotalProcessed] = useState<number>(0);
  const [anomaliesCount, setAnomaliesCount] = useState<number>(0);
  const [normalCount, setNormalCount] = useState<number>(0);
  const [accuracy, setAccuracy] = useState<number>(100.0);
  const [simSamples, setSimSamples] = useState<any[]>([]);
  const [latestPrediction, setLatestPrediction] = useState<any>(null);
  const [categoryCounts, setCategoryCounts] = useState<{ [key: string]: number }>({});
  const [simSpeed, setSimSpeed] = useState<number>(1.2);

  // Automatic Female Siri Voice Speech Synthesis Engine
  const lastAnnouncedIntervalRef = useRef<string | null>(null);

  const getSiriFemaleVoice = (): SpeechSynthesisVoice | null => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Search priority for Siri & clear female voice profiles
    const preferredPatterns = [
      "siri",
      "samantha",
      "victoria",
      "karen",
      "zira",
      "google us english",
      "google uk english female",
      "microsoft zira",
      "fiona",
      "moira",
      "female"
    ];
    for (const pattern of preferredPatterns) {
      const match = voices.find(v => v.name.toLowerCase().includes(pattern));
      if (match) return match;
    }

    return voices.find(v => v.lang.startsWith("en")) || voices[0] || null;
  };

  // Map & Navigation Directions Modal State
  const [showMapModal, setShowMapModal] = useState<boolean>(false);

  // Police Control Room Telegram Dispatch State
  const [showTelegramModal, setShowTelegramModal] = useState<boolean>(false);
  const [telegramConfig, setTelegramConfig] = useState<{ configured: boolean; chat_id?: string }>({ configured: false });
  const [telegramBotToken, setTelegramBotToken] = useState<string>("");
  const [telegramChatId, setTelegramChatId] = useState<string>("");
  const [telegramSending, setTelegramSending] = useState<boolean>(false);
  const [telegramStatusMsg, setTelegramStatusMsg] = useState<string>("");

  const sendTelegramAlert = async (anomalyData?: any) => {
    setTelegramSending(true);
    setTelegramStatusMsg("");
    try {
      const payload = anomalyData || {
        type: selectedVideo?.category || "ANOMALY DETECTED",
        event_type: selectedVideo?.category || "Security Alert",
        location: selectedVideo?.location || videoAnalysis?.location || "Terminal 2 - Gates 4 & 5",
        city: selectedVideo?.city || videoAnalysis?.city || "Central Airport Complex",
        sample: selectedVideo?.filename || "Abuse041_x264.mp4",
        confidence: 0.885,
        maps_query: selectedVideo?.maps_query || selectedVideo?.location
      };

      const res = await fetch(`${API_BASE_URL}/api/telegram/send-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setTelegramSending(false);
      if (data.success) {
        setTelegramStatusMsg(data.simulated ? "📱 Telegram Alert Dispatched in Police Control Log (Simulation Mode)!" : "✅ Telegram Alert Dispatched to Police Control Room!");
      } else {
        setTelegramStatusMsg(`❌ Dispatch Error: ${data.error || "Failed"}`);
      }
    } catch (e: any) {
      setTelegramSending(false);
      setTelegramStatusMsg(`❌ Connection Error: ${e.message}`);
    }
  };

  const saveTelegramConfig = async () => {
    setTelegramSending(true);
    setTelegramStatusMsg("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/telegram/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_token: telegramBotToken,
          chat_id: telegramChatId
        })
      });
      const data = await res.json();
      setTelegramSending(false);
      if (data.success) {
        setTelegramConfig({ configured: data.configured, chat_id: data.chat_id });
        setTelegramStatusMsg("✅ Telegram Bot credentials saved!");
      }
    } catch (e: any) {
      setTelegramSending(false);
      setTelegramStatusMsg(`❌ Error saving config: ${e.message}`);
    }
  };

  const announceAnomalySpeech = (anomalyType: string, cameraName: string = "this camera", locationName?: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    
    // Stop previous utterance for immediate alert delivery
    window.speechSynthesis.cancel();

    const cleanType = anomalyType || "Security Threat";
    const cameraLabel = cameraName.startsWith("camera") ? cameraName : `camera ${cameraName}`;
    const locLabel = locationName || selectedVideo?.location || "Terminal 2 Security Zone";
    
    const text = `Alert! Anomaly detected in ${cameraLabel}, located at ${locLabel}. Type of anomaly is ${cleanType}.`;
    const utterance = new SpeechSynthesisUtterance(text);
    
    const femaleVoice = getSiriFemaleVoice();
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }
    
    utterance.rate = 1.0; // Natural Siri cadence
    utterance.pitch = 1.25; // Gentle, clear female pitch
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
  };

  const ws = useRef<WebSocket | null>(null);

  // Fetch Available Real UCF-Crime Videos & Telegram Config on Mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/telegram/config`)
      .then((res) => res.json())
      .then((data) => {
        setTelegramConfig(data);
        if (data.chat_id) setTelegramChatId(data.chat_id);
      })
      .catch((err) => console.error("Could not fetch telegram config", err));

    fetch(`${API_BASE_URL}/api/dataset/videos`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.videos && data.videos.length > 0) {
          setVideoList(data.videos);
          setSelectedVideo(data.videos[0]);
          analyzeVideo(data.videos[0].filename);
        }
      })
      .catch((err) => console.error("Could not fetch raw dataset videos", err));
  }, []);

  // Sync I3D Simulation Status & Samples
  const fetchSimulationStatus = () => {
    fetch(`${API_BASE_URL}/api/simulation/status`)
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setSimRunning(data.running || false);
          setSimStatusText(data.status || "READY");
          setCurrentSample(data.current_sample || "None");
          setCurrentIdx(data.current_idx || 0);
          setTotalSamples(data.total_samples || 0);
          setProgress(data.progress || 0);
          setTotalProcessed(data.total_processed || 0);
          setAnomaliesCount(data.anomalies || 0);
          setNormalCount(data.normal || 0);
          setAccuracy(data.accuracy !== undefined ? data.accuracy : 100.0);
          if (data.latest_prediction) setLatestPrediction(data.latest_prediction);
          if (data.category_counts) setCategoryCounts(data.category_counts);
          if (data.step_delay) setSimSpeed(data.step_delay);
        }
      })
      .catch((err) => console.error("Could not sync simulation status", err));
  };

  const fetchSimulationSamples = () => {
    fetch(`${API_BASE_URL}/api/simulation/samples`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.samples) {
          setSimSamples(data.samples);
          if (data.total) setTotalSamples(data.total);
        }
      })
      .catch((err) => console.error("Could not fetch simulation samples", err));
  };

  useEffect(() => {
    fetchSimulationStatus();
    fetchSimulationSamples();
  }, []);

  useEffect(() => {
    if (activeTab === "i3d") {
      fetchSimulationStatus();
      fetchSimulationSamples();
      if (!canvasSrc) {
        setCanvasSrc(`${API_BASE_URL}/api/simulation/frame?t=${Date.now()}`);
      }
    }
  }, [activeTab]);

  useEffect(() => {
    ws.current = new WebSocket(`${WS_BASE_URL}/ws/alerts`);
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "feed" && data.image) {
        setCanvasSrc(data.image);
      }
      
      if (data.alerts && data.alerts.length > 0) {
        // Handled silently for background logs
      }

      if (data.simulation) {
        setSimRunning(data.simulation.running || false);
        setSimStatusText(data.simulation.status || "READY");
        setCurrentSample(data.simulation.current_sample || "None");
        setCurrentIdx(data.simulation.current_idx || 0);
        setTotalSamples(data.simulation.total_samples || 0);
        setProgress(data.simulation.progress || 0);
        setTotalProcessed(data.simulation.total_processed || 0);
        setAnomaliesCount(data.simulation.anomalies || 0);
        setNormalCount(data.simulation.normal || 0);
        setAccuracy(data.simulation.accuracy !== undefined ? data.simulation.accuracy : 100.0);
        if (data.simulation.latest_prediction) setLatestPrediction(data.simulation.latest_prediction);
        if (data.simulation.category_counts) setCategoryCounts(data.simulation.category_counts);
        if (data.simulation.step_delay) setSimSpeed(data.simulation.step_delay);
      }
    };
    return () => ws.current?.close();
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      fetch(`${API_BASE_URL}/api/incidents`)
        .then((res) => res.json())
        .then((data) => {
          if (data.incidents) {
            setHistoricalIncidents(data.incidents);
          }
        })
        .catch((err) => console.error("Failed to fetch history", err));
    }
  }, [activeTab]);

  // Analyze Currently Selected Video Only (Isolate Detections per Video)
  const analyzeVideo = async (filename: string) => {
    setAnalyzingVideo(true);
    setVideoAnalysis(null);
    setCurrentDetections([]); // Clear previous video detections
    setActiveOverlay(null);
    setVideoEnded(false);
    lastAnnouncedIntervalRef.current = null;

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      try {
        await videoRef.current.play();
      } catch (e) {}
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/dataset/analyze-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
      });
      const data = await res.json();
      if (data && data.analysis) {
        setVideoAnalysis(data.analysis);
        // Store ONLY detections belonging to this specific video file
        const videoDetections = data.analysis.intervals || [];
        setCurrentDetections(videoDetections);
      }
    } catch (err) {
      console.error("Video analysis error", err);
    } finally {
      setAnalyzingVideo(false);
    }

  };

  const handleSelectVideo = (video: any) => {
    setSelectedVideo(video);
    analyzeVideo(video.filename);
  };

  const handleUploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    if (!file.name.endsWith('.mp4')) {
      alert("Only .mp4 files are supported.");
      return;
    }
    
    setShowUploadModal(false);
    setUploadingVideo(true);
    setUploadError(null);
    setAnalyzingVideo(true);
    setVideoAnalysis(null);
    setCurrentDetections([]);
    setActiveOverlay(null);
    setVideoEnded(false);
    lastAnnouncedIntervalRef.current = null;

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE_URL}/api/upload-video`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      
      if (data.error) {
        setUploadError(data.error);
        setUploadingVideo(false);
        setAnalyzingVideo(false);
        return;
      }
      
      const newVideo = {
        filename: file.name,
        url: data.url,
        category: data.analysis?.event_type || "Anomaly",
        location: data.analysis?.location || "Custom Upload",
        city: data.analysis?.city || "Unknown",
        maps_query: data.analysis?.maps_query || "Custom Upload",
        duration: data.analysis?.duration || 0,
        is_anomaly: data.analysis?.is_anomaly || false,
      };

      setVideoList(prev => [newVideo, ...prev]);
      setSelectedVideo(newVideo);
      
      if (data.analysis) {
        setVideoAnalysis(data.analysis);
        setCurrentDetections(data.analysis.intervals || []);
      }
    } catch (err: any) {
      console.error("Video upload error", err);
      setUploadError(err.message);
    } finally {
      setUploadingVideo(false);
      setAnalyzingVideo(false);
    }
  };

  // Synchronize In-Video Overlay & Detection Status with HTML5 Video currentTime
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);

    const isAtEnd = videoRef.current.ended || (selectedVideo?.duration && t >= selectedVideo.duration - 0.8);
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

        const intervalKey = `${selectedVideo?.filename}_${matched.start_time}_${matched.end_time}`;
        if (lastAnnouncedIntervalRef.current !== intervalKey) {
          lastAnnouncedIntervalRef.current = intervalKey;
          const tag = matched.label || matched.event_type || selectedVideo?.category || "Anomaly";
          const camName = selectedVideo?.filename
            ? `camera ${selectedVideo.filename.replace('.mp4', '').replace('_x264', '')}`
            : "camera feed";
          const locName = selectedVideo?.location || videoAnalysis?.location || "Terminal 2 Security Zone";
          announceAnomalySpeech(tag, camName, locName);

          // Automatically dispatch Telegram alert to Police Control Room
          sendTelegramAlert({
            type: tag,
            event_type: matched.event_type || selectedVideo?.category,
            location: selectedVideo?.location || videoAnalysis?.location,
            city: selectedVideo?.city || videoAnalysis?.city,
            sample: selectedVideo?.filename,
            confidence: (matched.peak_confidence || 88.5) / 100.0,
            maps_query: selectedVideo?.maps_query || selectedVideo?.location
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

  const toggleSimulation = async () => {
    const endpoint = simRunning
      ? `${API_BASE_URL}/api/simulation/stop`
      : `${API_BASE_URL}/api/simulation/start`;

    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (data && data.status) {
        setSimRunning(data.status.running || false);
        setSimStatusText(data.status.status || (simRunning ? "STOPPED" : "RUNNING"));
      }
      if (!canvasSrc) {
        setCanvasSrc(`${API_BASE_URL}/api/simulation/frame?t=${Date.now()}`);
      }
    } catch (err) {
      console.error("Failed to toggle simulation", err);
    }
  };

  const handleSelectSample = async (idx: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/simulation/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: idx }),
      });
      const data = await res.json();
      if (data && data.status) {
        setCurrentIdx(data.status.current_idx || idx + 1);
        setCurrentSample(data.status.current_sample || "");
        if (data.status.latest_prediction) setLatestPrediction(data.status.latest_prediction);
      }
      setCanvasSrc(`${API_BASE_URL}/api/simulation/frame?t=${Date.now()}`);
    } catch (err) {
      console.error("Failed to select sample", err);
    }
  };

  const handleStepNext = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/simulation/next`, { method: "POST" });
      const data = await res.json();
      if (data && data.status) {
        setCurrentIdx(data.status.current_idx || 0);
        setCurrentSample(data.status.current_sample || "");
        if (data.status.latest_prediction) setLatestPrediction(data.status.latest_prediction);
      }
      setCanvasSrc(`${API_BASE_URL}/api/simulation/frame?t=${Date.now()}`);
    } catch (err) {
      console.error("Failed to step next", err);
    }
  };

  const handleReplay = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/simulation/replay`, { method: "POST" });
      const data = await res.json();
      if (data && data.status) {
        setSimRunning(data.status.running || false);
        setSimStatusText(data.status.status || "RUNNING");
        setCurrentIdx(data.status.current_idx || 1);
      }
      setCanvasSrc(`${API_BASE_URL}/api/simulation/frame?t=${Date.now()}`);
    } catch (err) {
      console.error("Failed to replay simulation", err);
    }
  };

  const handleSetSpeed = async (spd: number) => {
    setSimSpeed(spd);
    try {
      await fetch(`${API_BASE_URL}/api/simulation/speed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speed: spd }),
      });
    } catch (err) {
      console.error("Failed to set speed", err);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans p-6">
      <Head>
        <title>MadhvaMinds - Real UCF-Crime Video Anomaly Intelligence Platform</title>
      </Head>

      {/* Main Header - Police Control Room Incident Monitoring Platform */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 pb-4 border-b border-neutral-800">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl">👮</span>
            <h1 className="text-2xl md:text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400">
              MadhvaMinds Police Control Room
            </h1>
            <span className="text-xs bg-blue-950 text-blue-300 font-mono font-bold px-2.5 py-1 rounded-lg border border-blue-600/50 flex items-center gap-1.5 shadow">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
              🚨 CENTRAL DISPATCH HQ
            </span>
          </div>
          <p className="text-neutral-400 text-xs md:text-sm mt-1">
            Real-Time CCTV Anomaly Monitoring & Automated Police Dispatch via Siri Voice & Telegram Alerts
          </p>
        </div>

        {/* Control Bar & Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Telegram Dispatch Indicator & Modal Trigger */}
          <button
            onClick={() => setShowTelegramModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-950 to-indigo-950 hover:from-blue-900 hover:to-indigo-900 border border-blue-700/60 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-300 transition shadow-lg"
            title="Configure Police Control Room Telegram Bot & Chat ID"
          >
            <span className="text-base">📱</span>
            <span>POLICE TELEGRAM BOT</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${telegramConfig.configured ? "bg-emerald-600 text-white" : "bg-cyan-600 text-white animate-pulse"}`}>
              {telegramConfig.configured ? "ACTIVE" : "READY (SIMULATION)"}
            </span>
          </button>

          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-xl">
            <span className="text-xs text-neutral-400">Status:</span>
            {analyzingVideo ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-lg border border-cyan-500/20">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping"></span>
                ● INFERRING TEMPORAL WINDOWS
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                CONTROL ROOM LIVE STREAM
              </span>
            )}
          </div>

          <div className="flex bg-neutral-900 border border-neutral-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("video")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                activeTab === "video" ? "bg-cyan-600 text-white shadow" : "text-neutral-400 hover:text-white"
              }`}
            >
              🎬 Real Video Player
            </button>
            <button
              onClick={() => setActiveTab("i3d")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                activeTab === "i3d" ? "bg-indigo-600 text-white shadow" : "text-neutral-400 hover:text-white"
              }`}
            >
              📊 Technical Analysis (.npy)
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                activeTab === "history" ? "bg-blue-600 text-white shadow" : "text-neutral-400 hover:text-white"
              }`}
            >
              📜 Incident Audit Log
            </button>
          </div>
        </div>
      </header>

      {/* Verified Model Evaluation Performance Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-between">
          <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">MODEL ACCURACY</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-cyan-400">76.67%</span>
            <span className="text-xs text-cyan-500/80">test eval</span>
          </div>
        </div>
        <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-between">
          <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">PRECISION</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-emerald-400">75.00%</span>
            <span className="text-xs text-emerald-500/80">score</span>
          </div>
        </div>
        <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-between">
          <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">RECALL</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-indigo-400">80.00%</span>
            <span className="text-xs text-indigo-500/80">score</span>
          </div>
        </div>
        <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-between">
          <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">F1 SCORE</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-purple-400">77.42%</span>
            <span className="text-xs text-purple-500/80">harmonic mean</span>
          </div>
        </div>
      </div>

      {activeTab === "video" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Real UCF-Crime HTML5 Video Player Container */}
          <div className={`space-y-4 ${isGridView ? "lg:col-span-3" : "lg:col-span-2"}`}>
            {/* Video Selector & Category Filter Bar */}
            <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-2xl space-y-3">
              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-neutral-400 mr-1 uppercase tracking-wider">FILTER CATEGORY:</span>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      categoryFilter === cat
                        ? "bg-cyan-600 text-white shadow"
                        : "bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Dropdown Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">SELECT DATASET VIDEO:</span>
                  <select
                    value={selectedVideo?.filename || ""}
                    onChange={(e) => {
                      const found = videoList.find((v) => v.filename === e.target.value);
                      if (found) handleSelectVideo(found);
                    }}
                    className="bg-neutral-950 text-white font-mono text-sm px-3 py-1.5 rounded-xl border border-neutral-700 focus:outline-none focus:border-cyan-500"
                  >
                    {filteredVideos.map((v) => (
                      <option key={v.filename} value={v.filename}>
                        {v.filename} ({v.duration}s)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  {uploadError && <span className="text-red-400 text-xs font-bold">{uploadError}</span>}
                  <button
                    onClick={() => setIsGridView(!isGridView)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${isGridView ? "bg-indigo-600 text-white border border-indigo-500" : "bg-neutral-800 hover:bg-neutral-700 text-indigo-400 border border-neutral-700"}`}
                  >
                    {isGridView ? "🔲 SINGLE VIEW" : "▦ GRID VIEW"}
                  </button>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    disabled={uploadingVideo || analyzingVideo}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${uploadingVideo ? "bg-blue-900/50 text-blue-300 border border-blue-500/50 cursor-wait animate-pulse" : "bg-blue-600 hover:bg-blue-500 text-white border border-blue-500"}`}
                  >
                    {uploadingVideo ? "⏳ UPLOADING..." : "⬆️ UPLOAD VIDEO"}
                  </button>
                  <button
                    disabled={analyzingVideo}
                    onClick={() => selectedVideo && analyzeVideo(selectedVideo.filename)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                      analyzingVideo
                        ? "bg-cyan-900/50 text-cyan-300 border border-cyan-500/50 cursor-wait animate-pulse"
                        : "bg-neutral-800 hover:bg-neutral-700 text-cyan-400 border border-neutral-700"
                    }`}
                  >
                    {analyzingVideo ? (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                        ⏳ RUNNING INFERENCE...
                      </>
                    ) : (
                      "↻ RE-ANALYZE VIDEO"
                    )}
                  </button>
                </div>
              </div>
            </div>

            
            {isGridView ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                {filteredVideos.map((v) => (
                  <VideoGridItem 
                    key={v.filename} 
                    video={v} 
                    announceAnomalySpeech={announceAnomalySpeech} 
                    sendTelegramAlert={sendTelegramAlert} 
                  />
                ))}
              </div>
            ) : (
              <>
{/* HTML5 Video Display with Dynamic AI Detection Overlay */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden aspect-video relative flex flex-col justify-between shadow-2xl">
              {/* Header Overlay */}
              <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/90 to-transparent flex justify-between items-center z-10">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm tracking-wide text-cyan-400">SURVEILLANCE AI INFERENCE ENGINE</span>
                  {analyzingVideo ? (
                    <span className="text-[10px] bg-cyan-600 text-white font-bold px-2 py-0.5 rounded animate-pulse">
                      ● INFERRING TEMPORAL WINDOWS
                    </span>
                  ) : (
                    <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded">
                      ● MODEL INFERENCE READY
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-neutral-300 bg-black/70 px-2.5 py-1 rounded border border-neutral-700">
                  SOURCE: UCF-CRIME MP4
                </div>
              </div>

              {/* Synchronized In-Video Surveillance Incident Overlay */}
              {activeOverlay ? (
                <div className="absolute top-14 left-4 z-20 pointer-events-none bg-red-950/90 border-2 border-red-600 text-red-100 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md animate-pulse">
                  <div className="flex items-center gap-2 font-black text-base text-red-400">
                    <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
                    🔴 {activeOverlay.label || (activeOverlay.event_type ? `${activeOverlay.event_type.toUpperCase()} DETECTED` : "ANOMALY DETECTED")}
                  </div>
                  <div className="text-xs font-mono mt-1 text-red-200">
                    Model Confidence: <span className="font-bold text-white">{activeOverlay.peak_confidence}%</span>
                  </div>
                  <div className="text-xs font-mono text-neutral-300">
                    Event Time: <span className="font-bold text-cyan-400">{formatTime(currentTime)}</span> (Window: {activeOverlay.start_time}s - {activeOverlay.end_time}s)
                  </div>
                </div>
              ) : (
                <div className="absolute top-14 left-4 z-20 pointer-events-none bg-emerald-950/90 border-2 border-emerald-600 text-emerald-100 px-4 py-2 rounded-xl shadow-xl backdrop-blur-md">
                  <div className="flex items-center gap-2 font-black text-sm text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    🟢 NORMAL ACTIVITY
                  </div>
                  <div className="text-xs font-mono mt-0.5 text-emerald-300">
                    Status: <span className="font-bold text-white">No Threat Detected</span> | Time: {formatTime(currentTime)}
                  </div>
                </div>
              )}

              {/* Real HTML5 Video Player */}
              <div className="w-full h-full flex items-center justify-center bg-black">
                {selectedVideo ? (
                  <video
                    ref={videoRef}
                    src={selectedVideo.url}
                    controls
                    autoPlay
                    onEnded={() => setVideoEnded(true)}
                    onTimeUpdate={handleTimeUpdate}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-8 text-neutral-500 font-mono text-sm">
                    No MP4 video selected.
                  </div>
                )}
              </div>

              {/* Timeline Indicator Bar */}
              {videoAnalysis && selectedVideo && (
                <div className="bg-neutral-950/90 border-t border-neutral-800 p-3 z-10">
                  <div className="flex justify-between items-center text-xs font-mono mb-1.5 text-neutral-400">
                    <span>TEMPORAL DETECTION TIMELINE ({selectedVideo.filename})</span>
                    <span>
                      Playback: <span className="text-cyan-400 font-bold">{formatTime(currentTime)}</span> / {formatTime(selectedVideo.duration)}
                    </span>
                  </div>

                  <div className="relative w-full bg-neutral-800 h-4 rounded-lg border border-neutral-700 overflow-hidden">
                    {/* Render Detected Anomaly Intervals */}
                    {videoAnalysis.intervals && videoAnalysis.intervals.map((inv: any, idx: number) => {
                      const leftPct = (inv.start_time / selectedVideo.duration) * 100;
                      const widthPct = Math.max(2, ((inv.end_time - inv.start_time) / selectedVideo.duration) * 100);
                      const displayTag = inv.label ? inv.label.replace(" DETECTED", "") : (inv.event_type ? inv.event_type.toUpperCase() : "ANOMALY");
                      return (
                        <div
                          key={idx}
                          onClick={() => seekToTimestamp(inv.start_time)}
                          className="absolute top-0 bottom-0 bg-red-600 hover:bg-red-500 cursor-pointer shadow-lg z-20 flex items-center justify-center text-[9px] font-black text-white px-1 overflow-hidden"
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`
                          }}
                          title={`Click to view incident interval [${inv.start_time}s - ${inv.end_time}s]`}
                        >
                          {displayTag} ({inv.peak_confidence}%)
                        </div>
                      );
                    })}
                    <div className="w-full h-full bg-gradient-to-r from-emerald-900/30 via-neutral-900 to-emerald-900/30"></div>
                  </div>
                </div>
              )}
            </div>

            {/* Camera Location & Emergency Directions Bar */}
            {selectedVideo && (
              <div className="bg-gradient-to-r from-blue-950/70 via-neutral-900 to-indigo-950/70 p-4 rounded-2xl border border-blue-600/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30 text-2xl font-black">
                    📍
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest bg-blue-500/20 px-2 py-0.5 rounded border border-blue-500/30">
                        CAMERA LOCATION & GPS DISPATCH
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">
                        Node: #{selectedVideo.filename.split('_')[0]}
                      </span>
                    </div>
                    <h4 className="text-base font-extrabold text-white mt-0.5">
                      {selectedVideo.location || videoAnalysis?.location || "Terminal 2 - Gates 4 & 5"}
                    </h4>
                    <p className="text-xs text-neutral-300 font-medium">
                      {selectedVideo.city || videoAnalysis?.city || "Central Airport Complex"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => sendTelegramAlert()}
                    className="px-3.5 py-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 shadow-lg shadow-blue-950/50"
                    title="Send immediate Telegram anomaly notification to Police Control Room"
                  >
                    📱 TELEGRAM DISPATCH
                  </button>

                  <button
                    onClick={() => {
                      const query = `${selectedVideo.location || 'Surveillance Location'}, ${selectedVideo.city || ''}`;
                      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-black transition flex items-center gap-2 shadow-lg shadow-cyan-950/50"
                    title="Open Google Maps directions to camera incident location"
                  >
                    🧭 DIRECTIONS
                  </button>

                  <button
                    onClick={() => setShowMapModal(true)}
                    className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-cyan-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-neutral-700"
                    title="View in-app incident location map modal"
                  >
                    🗺️ DISPATCH MAP
                  </button>
                </div>
              </div>
            )}

            {/* Video & Inference Details Panel */}
            {videoAnalysis && (
              <div className="bg-neutral-900 p-4 rounded-2xl border border-neutral-800 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-neutral-400 font-semibold block">CURRENT VIDEO</span>
                  <span className="font-bold font-mono text-cyan-400 text-sm">{videoAnalysis.video}</span>
                </div>
                <div>
                  <span className="text-neutral-400 font-semibold block">RESOLUTION & FPS</span>
                  <span className="font-bold text-neutral-200">{videoAnalysis.resolution} @ {videoAnalysis.fps} FPS</span>
                </div>
                <div>
                  <span className="text-neutral-400 font-semibold block">INPUT TENSOR SHAPE</span>
                  <span className="font-bold font-mono text-indigo-400">(32, 2048) 2048-D</span>
                </div>
                <div>
                  <span className="text-neutral-400 font-semibold block">SIGMOID RAW SCORE</span>
                  <span className="font-bold font-mono text-purple-400">{videoAnalysis.raw_score.toFixed(4)}</span>
                </div>
              </div>
            )}

            {/* Overall Video Classification Result Banner/Card */}
            {videoAnalysis && (
              <div className={`p-4 rounded-2xl border transition-all ${
                videoAnalysis.is_anomaly
                  ? "bg-gradient-to-r from-red-950/80 via-neutral-900 to-red-950/80 border-red-500/80 shadow-lg shadow-red-950/40"
                  : "bg-gradient-to-r from-emerald-950/80 via-neutral-900 to-emerald-950/80 border-emerald-500/80 shadow-lg shadow-emerald-950/40"
              }`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl text-xl font-black ${
                      videoAnalysis.is_anomaly ? "bg-red-900/60 text-red-400 border border-red-500/50" : "bg-emerald-900/60 text-emerald-400 border border-emerald-500/50"
                    }`}>
                      {videoAnalysis.is_anomaly ? "🚨" : "🟢"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-neutral-950/80 text-neutral-400 border border-neutral-800">
                          OVERALL RESULT VERDICT
                        </span>
                        {videoEnded && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 animate-pulse">
                            ✓ PLAYBACK COMPLETED
                          </span>
                        )}
                      </div>
                      <h3 className={`text-base font-black tracking-wide uppercase mt-1 ${
                        videoAnalysis.is_anomaly ? "text-red-300" : "text-emerald-300"
                      }`}>
                        {videoAnalysis.is_anomaly ? "ANOMALY CCTV FOOTAGE DETECTED" : "NORMAL CCTV FOOTAGE VERIFIED"}
                      </h3>
                      <p className="text-xs text-neutral-300 mt-1 font-mono">
                        {videoAnalysis.is_anomaly
                          ? `Overall Result: Classified as Anomaly CCTV Video with ${videoAnalysis.confidence}% model confidence across ${videoAnalysis.total_instances || videoAnalysis.intervals?.length || 1} threat instance window(s).`
                          : `Overall Result: Classified as Normal CCTV Video (0 threat windows detected across full duration).`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono self-end sm:self-center">
                    <div className="bg-neutral-950/90 px-3.5 py-2 rounded-xl border border-neutral-800 text-center">
                      <span className="text-neutral-400 block text-[9px] uppercase font-bold">CATEGORY</span>
                      <span className={`font-extrabold text-sm ${videoAnalysis.is_anomaly ? "text-red-400" : "text-emerald-400"}`}>
                        {videoAnalysis.event_type ? videoAnalysis.event_type.toUpperCase() : (videoAnalysis.is_anomaly ? "ANOMALY" : "NORMAL")}
                      </span>
                    </div>
                    <div className="bg-neutral-950/90 px-3.5 py-2 rounded-xl border border-neutral-800 text-center">
                      <span className="text-neutral-400 block text-[9px] uppercase font-bold">CONFIDENCE</span>
                      <span className="font-extrabold text-sm text-cyan-400">
                        {videoAnalysis.confidence}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          
              </>
            )}

          </div>

          {/* Isolated Live Model Detections Panel for Currently Selected Video */}
          {!isGridView && (
            <div className="space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-neutral-800">
                <div>
                  <h3 className="font-bold text-sm text-neutral-200 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                    LIVE MODEL DETECTIONS
                  </h3>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    Current Video: <span className="text-cyan-400 font-bold">{selectedVideo?.filename}</span>
                  </span>
                </div>
                <span className="text-xs font-mono bg-neutral-800 px-2 py-0.5 rounded text-neutral-400">
                  {currentDetections.filter(d => currentTime >= d.start_time - 0.5).length} / {currentDetections.length} Unfolded
                </span>
              </div>

              {/* Isolated Detections List */}
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {analyzingVideo ? (
                  <div className="bg-neutral-950/80 border border-cyan-500/30 p-4 rounded-xl text-xs space-y-2 animate-pulse">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                      ⏳ INFERRING TEMPORAL WINDOWS...
                    </div>
                    <p className="text-neutral-400 text-[11px] leading-relaxed">
                      Extracting 2048-D temporal features across video frame sequence...
                    </p>
                  </div>
                ) : currentDetections.length === 0 ? (
                  <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-xl text-xs space-y-2 text-center">
                    <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-sm">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      🟢 NORMAL VIDEO VERIFIED
                    </div>
                    <p className="text-neutral-300 text-[11px]">
                      Analysis completed across video duration ({selectedVideo?.duration}s). This is a normal video and no anomaly was detected.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Live Analyzing Card when playback hasn't reached an unreached incident yet */}
                    {!videoEnded && currentDetections.filter(d => currentTime >= d.start_time - 0.5).length < currentDetections.length && (
                      <div className="bg-neutral-950/80 border border-cyan-500/30 p-3.5 rounded-xl text-xs space-y-2">
                        <div className="flex items-center gap-2 text-cyan-400 font-bold">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                          🔍 MONITORING LIVE FRAME STREAM ({formatTime(currentTime)})
                        </div>
                        <p className="text-neutral-400 text-[11px] leading-relaxed">
                          Running PyTorch ResNet50-LSTM sliding temporal window inference across frame sequence...
                        </p>
                        <div className="flex justify-between items-center text-[10px] text-neutral-500 font-mono pt-1 border-t border-neutral-900">
                          <span>Playback Time: {formatTime(currentTime)}</span>
                          <span className="text-emerald-400 font-bold">
                            {currentDetections.filter(d => currentTime >= d.start_time - 0.5).length === 0
                              ? "Baseline Normal Stream"
                              : `${currentDetections.filter(d => currentTime >= d.start_time - 0.5).length} Incident(s) Captured`}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Render Anomaly Cards ONLY when video playback reaches or passes their start timestamp */}
                    {currentDetections
                      .filter(det => currentTime >= det.start_time - 0.5)
                      .map((det, idx) => {
                        const isActive = currentTime >= det.start_time && currentTime <= det.end_time;
                        const startFormatted = formatTime(det.start_time || 0);
                        const endFormatted = formatTime(det.end_time || 0);
                        const rawStart = (det.start_time || 0).toFixed(2);
                        const rawEnd = (det.end_time || 0).toFixed(2);

                        return (
                          <div
                            key={idx}
                            className={`p-3.5 rounded-xl border transition space-y-2.5 ${
                              isActive
                                ? "bg-red-950/60 border-red-500 shadow-lg shadow-red-950/50 animate-pulse"
                                : "bg-neutral-950 border-neutral-800 hover:border-neutral-700"
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <span className={`font-bold text-xs flex items-center gap-1.5 ${isActive ? "text-red-300" : "text-red-400"}`}>
                                <span className={`w-2 h-2 rounded-full ${isActive ? "bg-red-500 animate-ping" : "bg-red-500"}`}></span>
                                🔴 {det.label || (det.event_type ? `${det.event_type.toUpperCase()} DETECTED` : "ANOMALY DETECTED")}
                              </span>
                              <span className="text-[10px] font-mono bg-red-950 text-red-300 px-2 py-0.5 rounded border border-red-800 font-bold">
                                {det.peak_confidence}% Conf
                              </span>
                            </div>

                            <div className="text-xs text-neutral-300 font-mono space-y-1">
                              <div className="flex justify-between">
                                <span className="text-neutral-400">Detected Window:</span>
                                <span className="text-cyan-400 font-bold">{startFormatted} - {endFormatted} ({rawStart}s - {rawEnd}s)</span>
                              </div>
                              {isActive && (
                                <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"></span>
                                  PLAYBACK IS CURRENTLY INSIDE THIS ANOMALY WINDOW
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => seekToTimestamp(det.start_time)}
                              className="w-full py-2 bg-red-600/30 hover:bg-red-600 text-red-200 hover:text-white text-xs font-bold rounded-lg border border-red-500/40 transition flex items-center justify-center gap-1.5 shadow"
                            >
                              ▶ JUMP TO INCIDENT AT {startFormatted} ({rawStart}s)
                            </button>
                          </div>
                        );
                      })}

                    {/* Video Playback End - Final Overall Classification Result Highlight Box */}
                    {(videoEnded || currentTime >= (selectedVideo?.duration || 100) - 0.8) && videoAnalysis && (
                      <div className={`p-4 rounded-xl border-2 space-y-2 mt-2 shadow-2xl transition-all ${
                        videoAnalysis.is_anomaly
                          ? "bg-red-950/90 border-red-500 text-white shadow-red-950/60"
                          : "bg-emerald-950/90 border-emerald-500 text-white shadow-emerald-950/60"
                      }`}>
                        <div className="flex justify-between items-center font-black text-xs uppercase tracking-wider">
                          <span className="flex items-center gap-1.5 text-cyan-300">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                            🏁 PLAYBACK COMPLETE
                          </span>
                          <span className="bg-black/60 px-2 py-0.5 rounded text-[10px] font-mono text-neutral-300">
                            OVERALL RESULT
                          </span>
                        </div>
                        
                        <div className="py-2.5 px-3 rounded-lg bg-black/60 border border-white/10 text-center">
                          <span className="text-[10px] text-neutral-400 uppercase tracking-widest block font-bold">OVERALL VIDEO CLASSIFICATION</span>
                          <span className={`text-sm font-black tracking-wide block mt-1 ${
                            videoAnalysis.is_anomaly ? "text-red-400" : "text-emerald-400"
                          }`}>
                            {videoAnalysis.is_anomaly ? "🚨 THIS IS AN ANOMALY CCTV FOOTAGE" : "🟢 THIS IS A NORMAL CCTV FOOTAGE"}
                          </span>
                        </div>

                        <p className="text-[11px] text-neutral-300 font-mono text-center leading-relaxed">
                          {videoAnalysis.is_anomaly
                            ? `Video analysis finished. Confirmed ANOMALY CCTV FOOTAGE with ${videoAnalysis.total_instances || videoAnalysis.intervals?.length || 1} threat incident window(s) detected.`
                            : `Video analysis finished. Confirmed NORMAL CCTV FOOTAGE with zero security threat windows detected.`}
                        </p>

                        <button
                          onClick={() => seekToTimestamp(0)}
                          className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-cyan-400 text-xs font-bold rounded-lg border border-neutral-700 transition flex items-center justify-center gap-1.5 shadow"
                        >
                          ↺ REPLAY VIDEO FROM 00:00
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      )}

      {activeTab === "i3d" && (
        <div className="space-y-6">
          {/* Studio Control Toolbar */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                simRunning ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse" : "bg-neutral-800 text-neutral-400 border border-neutral-700"
              }`}>
                <span className={`w-2 h-2 rounded-full ${simRunning ? "bg-emerald-400" : "bg-neutral-500"}`} />
                {simRunning ? "Live .npy Evaluation" : simStatusText}
              </span>
              <div className="hidden sm:block text-xs font-mono text-neutral-400">
                Sample <span className="text-cyan-400 font-bold">{currentIdx}</span> of <span className="text-white font-bold">{totalSamples}</span>
              </div>
            </div>

            {/* Quick Action Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={toggleSimulation}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-1.5 ${
                  simRunning
                    ? "bg-amber-600 hover:bg-amber-500 text-white"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                }`}
              >
                {simRunning ? "⏸ PAUSE" : "▶ START EVALUATION"}
              </button>
              
              <button
                onClick={handleStepNext}
                disabled={simRunning}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 transition border border-neutral-700 flex items-center gap-1"
                title="Evaluate next sample"
              >
                ⏭ NEXT
              </button>

              <button
                onClick={handleReplay}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition border border-neutral-700 flex items-center gap-1"
                title="Restart evaluation from sample 1"
              >
                🔄 REPLAY
              </button>

              {/* Playback speed selector */}
              <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl p-0.5 text-[11px] font-bold">
                <button
                  onClick={() => handleSetSpeed(0.6)}
                  className={`px-2.5 py-1 rounded-lg transition ${simSpeed <= 0.8 ? "bg-indigo-600 text-white" : "text-neutral-400 hover:text-white"}`}
                >
                  0.6s
                </button>
                <button
                  onClick={() => handleSetSpeed(1.2)}
                  className={`px-2.5 py-1 rounded-lg transition ${simSpeed > 0.8 && simSpeed <= 1.6 ? "bg-indigo-600 text-white" : "text-neutral-400 hover:text-white"}`}
                >
                  1.2s
                </button>
                <button
                  onClick={() => handleSetSpeed(2.4)}
                  className={`px-2.5 py-1 rounded-lg transition ${simSpeed > 1.6 ? "bg-indigo-600 text-white" : "text-neutral-400 hover:text-white"}`}
                >
                  2.4s
                </button>
              </div>
            </div>

            {/* Sample Selector Dropdown */}
            {simSamples.length > 0 && (
              <div className="w-full sm:w-auto flex items-center gap-2">
                <label className="text-xs text-neutral-400 font-semibold whitespace-nowrap">Jump to Sample:</label>
                <select
                  value={currentIdx > 0 ? currentIdx - 1 : 0}
                  onChange={(e) => handleSelectSample(parseInt(e.target.value))}
                  className="bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500 max-w-[260px] truncate"
                >
                  {simSamples.map((s) => (
                    <option key={s.index} value={s.index}>
                      [{s.index + 1}] {s.category} - {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Waveform & Visual Analysis Canvas */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden aspect-video relative flex flex-col justify-between shadow-2xl">
                <div className="w-full h-full flex items-center justify-center bg-neutral-950">
                  {canvasSrc ? (
                    <img
                      src={canvasSrc}
                      alt="I3D Feature Analysis Signal"
                      className="w-full h-full object-contain"
                      onError={() => {
                        setCanvasSrc(`${API_BASE_URL}/api/simulation/frame?t=${Date.now()}`);
                      }}
                    />
                  ) : (
                    <div className="text-center p-8 text-neutral-400 space-y-4">
                      <div className="inline-block p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/30 text-indigo-400 text-3xl">
                        📊
                      </div>
                      <div>
                        <p className="font-bold text-white text-base">UCF-Crime I3D Feature Engine Ready</p>
                        <p className="text-xs text-neutral-400 mt-1">
                          {totalSamples} verified .npy temporal tensors discovered. Click Start to begin live evaluation.
                        </p>
                      </div>
                      <button
                        onClick={toggleSimulation}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
                      >
                        ▶ START .NPY EVALUATION
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Real-time Diagnostics Strip */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-400 font-semibold">Current Sample:</span>
                    <span className="font-mono font-bold text-cyan-400">{currentSample}</span>
                  </div>
                  <div className="font-mono text-neutral-400">
                    Progress: <span className="text-white font-bold">{progress.toFixed(1)}%</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-neutral-950 rounded-full h-2 overflow-hidden border border-neutral-800">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                  />
                </div>

                {latestPrediction && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs border-t border-neutral-800">
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Ground Truth</span>
                      <span className="font-bold text-neutral-200">{latestPrediction.ground_truth}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Prediction</span>
                      <span className={`font-bold ${latestPrediction.is_anomaly ? "text-red-400" : "text-emerald-400"}`}>
                        {latestPrediction.is_anomaly ? "Anomaly / Threat" : "Normal Clean"}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Confidence</span>
                      <span className="font-mono font-bold text-cyan-400">
                        {(latestPrediction.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Match Verdict</span>
                      <span className={`font-bold inline-flex items-center gap-1 ${
                        latestPrediction.is_correct ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {latestPrediction.is_correct ? "✓ ACCURATE" : "✗ MISMATCH"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Metrics and Info */}
            <div className="space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl space-y-4 text-xs shadow-xl">
                <h3 className="font-bold text-sm text-cyan-400 flex items-center justify-between">
                  <span>Dataset (.npy) Evaluator Metrics</span>
                  <span className="text-[10px] px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-400 font-mono">
                    2048-D
                  </span>
                </h3>

                <div className="space-y-2.5">
                  <div className="flex justify-between py-1.5 border-b border-neutral-800">
                    <span className="text-neutral-400">Total Evaluated:</span>
                    <span className="font-bold text-white font-mono">{totalProcessed} / {totalSamples}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-neutral-800">
                    <span className="text-neutral-400">Anomalies Detected:</span>
                    <span className="font-bold text-red-400 font-mono">{anomaliesCount}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-neutral-800">
                    <span className="text-neutral-400">Normal Clean:</span>
                    <span className="font-bold text-emerald-400 font-mono">{normalCount}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-neutral-400">Evaluation Score:</span>
                    <span className="font-bold text-cyan-400 font-mono text-sm">{accuracy.toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              {/* Anomaly Category Breakdown */}
              {Object.keys(categoryCounts).length > 0 && (
                <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl space-y-3 text-xs shadow-xl">
                  <h4 className="font-bold text-neutral-300 text-xs uppercase tracking-wider">
                    Detected Incident Categories
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(categoryCounts).map(([cat, count]) => (
                      <span
                        key={cat}
                        className="px-2.5 py-1 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-300 font-mono text-[11px] flex items-center gap-1.5"
                      >
                        <span className="text-indigo-400 font-bold">{cat}:</span>
                        <span className="text-red-400 font-bold">{count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Technical Specifications */}
              <div className="bg-neutral-900/60 border border-neutral-800/80 p-4 rounded-2xl space-y-2 text-[11px] text-neutral-400 font-mono">
                <div className="font-bold text-neutral-300 uppercase tracking-wider text-xs mb-1">
                  Architecture Specs
                </div>
                <div className="flex justify-between">
                  <span>Backbone:</span>
                  <span className="text-neutral-200">I3D Inflated 3D Conv</span>
                </div>
                <div className="flex justify-between">
                  <span>Input Tensor:</span>
                  <span className="text-cyan-400">(T, 10, 2048) float32</span>
                </div>
                <div className="flex justify-between">
                  <span>Classifier:</span>
                  <span className="text-neutral-200">Bi-LSTM + Temporal Head</span>
                </div>
                <div className="flex justify-between">
                  <span>Weights File:</span>
                  <span className="text-emerald-400">best_violence_model.pt</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {activeTab === "history" && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-neutral-100 mb-4 flex items-center gap-2">
            <span>📜</span> Incident History Audit Log
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-950 text-neutral-400 uppercase border-b border-neutral-800">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Event Type</th>
                  <th className="p-3">Severity</th>
                  <th className="p-3">Confidence</th>
                  <th className="p-3">Source File</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {historicalIncidents.map((inc, i) => {
                  const dateVal = inc.started_at || inc.timestamp;
                  let formattedDate = "N/A";
                  if (dateVal) {
                    const parsed = typeof dateVal === "number" ? new Date(dateVal < 10000000000 ? dateVal * 1000 : dateVal) : new Date(dateVal);
                    if (!isNaN(parsed.getTime())) {
                      formattedDate = parsed.toLocaleString();
                    }
                  }
                  return (
                    <tr key={i} className="hover:bg-neutral-950/60 transition">
                      <td className="p-3 text-neutral-500">#{inc.id || i + 1}</td>
                      <td className="p-3 font-bold text-red-400">{inc.type || inc.event_type}</td>
                      <td className="p-3">
                        <span className="bg-red-950 text-red-300 px-2 py-0.5 rounded border border-red-800">
                          LEVEL {inc.severity || 5}
                        </span>
                      </td>
                      <td className="p-3 text-cyan-400">{((inc.confidence || 0.94) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-neutral-300">{inc.source || inc.sample || "UCF-Crime MP4"}</td>
                      <td className="p-3 text-neutral-400">{formattedDate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Instructions Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-neutral-900 border border-neutral-700 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex justify-between items-start border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-600/20 text-blue-400 rounded-2xl border border-blue-500/30 text-2xl font-black">
                  ℹ️
                </div>
                <div>
                  <h3 className="text-lg font-black text-white mt-1">Upload Instructions</h3>
                  <p className="text-xs text-neutral-400">Please review model requirements</p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-neutral-400 hover:text-white bg-neutral-800 p-2 rounded-xl text-xs font-bold transition"
              >
                ✕ CLOSE
              </button>
            </div>
            
            <div className="space-y-4 text-sm text-neutral-300">
              <p>To ensure optimal inference and accurate anomaly detection with our trained model, please follow these guidelines:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Supported Format:</strong> Only <span className="text-cyan-400 font-bold">.mp4</span> video files are supported.</li>
                <li><strong>Optimal Resolution:</strong> We highly recommend videos with a resolution of <span className="text-emerald-400 font-bold">340p</span> (or similar low resolutions like 240p/360p) as the model was trained on these dimensions for maximum efficiency and speed.</li>
                <li><strong>Content:</strong> Ensure the video contains clear surveillance-style footage for the best temporal anomaly detection.</li>
              </ul>
            </div>
            
            <div className="pt-4 flex justify-end">
              <label className="cursor-pointer px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl shadow-lg transition">
                I Understand, Select Video
                <input type="file" accept=".mp4" className="hidden" onChange={handleUploadVideo} disabled={uploadingVideo || analyzingVideo} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Emergency Dispatch Map & Location Modal */}
      {showMapModal && selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-neutral-900 border border-neutral-700 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex justify-between items-start border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-cyan-600/20 text-cyan-400 rounded-2xl border border-cyan-500/30 text-2xl font-black">
                  🧭
                </div>
                <div>
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                    DISPATCH MAP & INCIDENT NAVIGATION
                  </span>
                  <h3 className="text-lg font-black text-white mt-1">
                    {selectedVideo.location || "Terminal 2 - Gates 4 & 5"}
                  </h3>
                  <p className="text-xs text-neutral-400">
                    {selectedVideo.city || "Central Airport Complex"} | Camera Node: #{selectedVideo.filename.split('_')[0]}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMapModal(false)}
                className="text-neutral-400 hover:text-white bg-neutral-800 p-2 rounded-xl text-xs font-bold transition"
              >
                ✕ CLOSE
              </button>
            </div>

            {/* Simulated Live Dispatch Map Graphic */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 text-center space-y-4 relative overflow-hidden">
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#06b6d4_1px,transparent_1px)] [background-size:16px_16px]"></div>
              
              <div className="relative z-10 space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-950/80 border border-red-600 text-red-300 rounded-full text-xs font-bold animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  LIVE ANOMALY DISPATCH ROUTE ACTIVE
                </div>

                <div className="p-4 bg-neutral-900/90 border border-neutral-800 rounded-xl max-w-md mx-auto space-y-2 text-left">
                  <div className="flex justify-between items-center text-xs font-mono text-neutral-400">
                    <span>INCIDENT CATEGORY:</span>
                    <span className="text-red-400 font-bold">{selectedVideo.category.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono text-neutral-400">
                    <span>ESTIMATED DISPATCH TIME:</span>
                    <span className="text-emerald-400 font-bold">⏱ 3 - 5 MINS</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono text-neutral-400">
                    <span>PRIMARY RESPONDER UNIT:</span>
                    <span className="text-cyan-400 font-bold">UNIT #42 (PATROL)</span>
                  </div>
                </div>

                <p className="text-xs text-neutral-400 max-w-md mx-auto">
                  GPS Coordinates synchronized with central command. Launch external Google Maps navigation for real-time turn-by-turn routing.
                </p>
              </div>
            </div>

            <div className="flex justify-end items-center gap-3 pt-2">
              <button
                onClick={() => setShowMapModal(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold rounded-xl transition"
              >
                Close Window
              </button>
              <button
                onClick={() => sendTelegramAlert()}
                className="px-4 py-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white text-xs font-black rounded-xl transition shadow-lg flex items-center gap-1.5"
              >
                📱 DISPATCH TELEGRAM ALERT
              </button>
              <button
                onClick={() => {
                  const query = `${selectedVideo.location || 'Surveillance Location'}, ${selectedVideo.city || ''}`;
                  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
                }}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black rounded-xl transition shadow-lg shadow-cyan-950/50 flex items-center gap-2"
              >
                🧭 OPEN IN GOOGLE MAPS ↗
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Police Control Room Telegram Dispatch Settings Modal */}
      {showTelegramModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-neutral-900 border border-blue-600/50 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex justify-between items-start border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-600/20 text-blue-400 rounded-2xl border border-blue-500/30 text-2xl font-black">
                  📱
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest bg-blue-500/20 px-2 py-0.5 rounded border border-blue-500/30">
                    POLICE CONTROL ROOM DISPATCH
                  </span>
                  <h3 className="text-lg font-black text-white mt-1">
                    Telegram Alert Bot Settings
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Connect Police Control Room Telegram Bot & Chat ID for instant incident alert dispatching.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTelegramModal(false)}
                className="text-neutral-400 hover:text-white bg-neutral-800 p-2 rounded-xl text-xs font-bold transition"
              >
                ✕ CLOSE
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-bold block">TELEGRAM BOT TOKEN:</label>
                <input
                  type="text"
                  placeholder="e.g. 7123456789:AAFx... (Optional, defaults to backend simulation)"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  className="w-full bg-neutral-950 text-white p-3 rounded-xl border border-neutral-700 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-neutral-300 font-bold block">POLICE CONTROL ROOM CHAT ID:</label>
                <input
                  type="text"
                  placeholder="e.g. -100123456789 or @police_control_channel"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="w-full bg-neutral-950 text-white p-3 rounded-xl border border-neutral-700 focus:outline-none focus:border-blue-500"
                />
              </div>

              {telegramStatusMsg && (
                <div className={`p-3 rounded-xl text-xs font-bold font-mono ${
                  telegramStatusMsg.includes("✅") ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700" :
                  telegramStatusMsg.includes("📱") ? "bg-blue-950/80 text-blue-300 border border-blue-700" :
                  "bg-red-950/80 text-red-300 border border-red-700"
                }`}>
                  {telegramStatusMsg}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-800">
              <button
                disabled={telegramSending}
                onClick={() => sendTelegramAlert()}
                className="px-4 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white text-xs font-black rounded-xl transition shadow-lg flex items-center gap-2"
              >
                {telegramSending ? "⚡ DISPATCHING..." : "📱 TEST TELEGRAM DISPATCH"}
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowTelegramModal(false)}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold rounded-xl transition"
                >
                  Close
                </button>
                <button
                  onClick={saveTelegramConfig}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition shadow-lg"
                >
                  Save Credentials
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
