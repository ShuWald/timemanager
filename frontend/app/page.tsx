"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function Home() {
  const { user, googleToken, loginWithGoogle, logout, loading } = useAuth();
  const [promptText, setPromptText] = useState("");
  const [response, setResponse] = useState<any>(null);
  const [apiLoading, setApiLoading] = useState(false);
  
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"gantt" | "calendar">("gantt");

  const [containers, setContainers] = useState<any[]>([]);
  const [containersLoading, setContainersLoading] = useState(false);

  // Interaction States
  const [selectedThreads, setSelectedThreads] = useState<string[]>([]);
  const [draggedEvent, setDraggedEvent] = useState<{ eventId: string, sourceContainerId: string } | null>(null);
  const [editingEvent, setEditingEvent] = useState<{ event: any, containerId: string } | null>(null);

  // Modals States
  const [showConfigModal, setShowConfigModal] = useState<"load" | "save" | "settings" | null>(null);
  const [availableConfigs, setAvailableConfigs] = useState<any[]>([]);
  const [showThreadModal, setShowThreadModal] = useState<string | null>(null); // container_id
  const [showAddEventModal, setShowAddEventModal] = useState<string | null>(null); // container_id
  const [threadFormData, setThreadFormData] = useState({ name: "", color: "zinc" });
  
  // Timeline States
  const [timelineStartHour, setTimelineStartHour] = useState(() => Math.max(0, new Date().getHours() - 1));
  const timelineEndHour = Math.min(24, timelineStartHour + 8);
  const totalMinutes = (timelineEndHour - timelineStartHour) * 60;
  
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user) {
      fetchCalendarEvents();
      fetchEventContainers();
    }
  }, [user, googleToken]);

  const getAuthHeaders = (contentType: string = "") => {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${user?.uid || "mock_user_id"}`
    };
    if (googleToken) headers["X-Google-Token"] = googleToken;
    if (contentType) headers["Content-Type"] = contentType;
    return headers;
  };

  const fetchCalendarEvents = async () => {
    setCalendarLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`http://localhost:8000/api/calendar/events?date=${today}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.status === "success") setCalendarEvents(data.events || []);
    } catch (error) {
      console.error("Failed to fetch calendar events", error);
    } finally {
      setCalendarLoading(false);
    }
  };

  const fetchEventContainers = async () => {
    setContainersLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`http://localhost:8000/api/events/containers?date=${today}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.status === "success") setContainers(data.containers || []);
    } catch (error) {
      console.error("Failed to fetch event containers", error);
    } finally {
      setContainersLoading(false);
    }
  };

  const handleTriggerPipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, google_token: googleToken || user?.uid }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (error) {
      setResponse({ status: "error", message: "Failed to communicate with API backend." });
    } finally {
      setApiLoading(false);
    }
  };

  // =====================================================================
  // GANTT CHART LOGIC
  // =====================================================================

  const [localContainers, setLocalContainers] = useState<any[]>([]);

  useEffect(() => {
    if (containers.length > 0) {
      const display = containers.map((c, index) => {
        const colors = ['blue', 'purple', 'green', 'red', 'orange', 'zinc'];
        return {
          container_id: c.container_id,
          sequence_name: c.sequence_name,
          priority: c.priority || "Medium",
          is_flexible: c.is_flexible,
          color: c.color || colors[index % colors.length],
          is_custom_named: c.is_custom_named || false,
          events: c.events.map((evt: any) => {
            const date = new Date(evt.start_time);
            return {
              id: evt.id,
              title: evt.title,
              startHour: date.getHours(),
              startMin: date.getMinutes(),
              duration: evt.duration_minutes || evt.duration || 30,
              priority: evt.priority || "Medium",
              is_flexible: evt.is_flexible ?? true,
              reminder_mins: evt.reminder_mins || 15
            };
          })
        };
      });
      setLocalContainers(display);
    } else {
      setLocalContainers([]);
    }
  }, [containers]);

  // THREAD ACTIONS
  const toggleThreadSelection = (containerId: string) => {
    if (selectedThreads.includes(containerId)) {
      setSelectedThreads(selectedThreads.filter(id => id !== containerId));
    } else {
      setSelectedThreads([...selectedThreads, containerId]);
    }
  };

  const openThreadModal = (containerId: string) => {
    const thread = localContainers.find(c => c.container_id === containerId);
    if (thread) {
      setThreadFormData({ name: thread.sequence_name, color: thread.color });
      setShowThreadModal(containerId);
    }
  };

  const handleModifyThreadSubmit = () => {
    if (!showThreadModal) return;
    
    setLocalContainers(localContainers.map(c => 
      c.container_id === showThreadModal ? { ...c, sequence_name: threadFormData.name, color: threadFormData.color, is_custom_named: true } : c
    ));
    
    fetch(`http://localhost:8000/api/events/containers/${showThreadModal}`, {
      method: "PUT",
      headers: getAuthHeaders("application/json"),
      body: JSON.stringify({ sequence_name: threadFormData.name, color: threadFormData.color })
    }).catch(console.error);
    
    setShowThreadModal(null);
    setSelectedThreads([]);
  };

  const handleDeleteThreads = () => {
    if (selectedThreads.length > 1) {
      if (!window.confirm(`Are you sure you want to delete ${selectedThreads.length} threads?`)) return;
    }
    setLocalContainers(localContainers.filter(c => !selectedThreads.includes(c.container_id)));
    selectedThreads.forEach(id => {
      fetch(`http://localhost:8000/api/events/containers/${id}`, { 
        method: "DELETE",
        headers: getAuthHeaders()
      }).catch(console.error);
    });
    setSelectedThreads([]);
  };

  const getConflictIntervals = (events: any[]) => {
    const sorted = [...events].sort((a, b) => (a.startHour * 60 + a.startMin) - (b.startHour * 60 + b.startMin));
    const overlaps: { startMin: number, duration: number }[] = [];
    
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentStart = sorted[i].startHour * 60 + sorted[i].startMin;
      const currentEnd = currentStart + sorted[i].duration;
      const nextStart = sorted[i+1].startHour * 60 + sorted[i+1].startMin;
      const nextEnd = nextStart + sorted[i+1].duration;
      
      if (currentEnd > nextStart) {
        overlaps.push({ startMin: nextStart, duration: Math.min(currentEnd, nextEnd) - nextStart });
      }
    }
    return overlaps;
  };

  // Global Check for conflicts and return overlapping intervals for visual highlights
  const getAllConflictIntervals = (containers: any[]) => {
    let allEvents: any[] = [];
    containers.forEach(c => allEvents.push(...c.events));
    const sorted = allEvents.sort((a, b) => (a.startHour * 60 + a.startMin) - (b.startHour * 60 + b.startMin));
    const overlaps: { startMin: number, duration: number }[] = [];
    
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentStart = sorted[i].startHour * 60 + sorted[i].startMin;
      const currentEnd = currentStart + sorted[i].duration;
      const nextStart = sorted[i+1].startHour * 60 + sorted[i+1].startMin;
      const nextEnd = nextStart + sorted[i+1].duration;
      
      if (currentEnd > nextStart) {
        // They overlap, log the overlapping region
        const overlapStart = nextStart;
        const overlapEnd = Math.min(currentEnd, nextEnd);
        overlaps.push({ startMin: overlapStart, duration: overlapEnd - overlapStart });
      }
    }
    return overlaps;
  };

  const globalConflictIntervals = getAllConflictIntervals(localContainers);

  const handleMergeThreads = () => {
    if (selectedThreads.length < 2) return;
    const targetId = selectedThreads[0];
    const sourceIds = selectedThreads.slice(1);
    
    let eventsToAdd: any[] = [];
    localContainers.forEach(c => { if (sourceIds.includes(c.container_id)) eventsToAdd.push(...c.events); });
    
    const targetContainer = localContainers.find(c => c.container_id === targetId);
    const simulatedEvents = [...(targetContainer?.events || []), ...eventsToAdd];
    
    if (getAllConflictIntervals([{events: simulatedEvents}]).length > 0) {
      if (!window.confirm("Warning: Merging these threads will result in conflicting events (overlapping times). Overlap resolution will be run on the backend to shift flexible tasks. Continue?")) {
        return;
      }
    }

    setLocalContainers(prev => {
      const updated = [...prev];
      const tIndex = updated.findIndex(c => c.container_id === targetId);
      updated[tIndex].events = simulatedEvents;
      return updated.filter(c => !sourceIds.includes(c.container_id));
    });

    fetch(`http://localhost:8000/api/events/containers/merge`, {
      method: "POST",
      headers: getAuthHeaders("application/json"),
      body: JSON.stringify({ container_ids: selectedThreads })
    }).catch(console.error);

    setSelectedThreads([]);
  };

  // Add Event Flow
  const handleAddNewEventSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!showAddEventModal) return;
    
    const fd = new FormData(e.currentTarget);
    const title = fd.get("title") as string;
    const duration = parseInt(fd.get("duration") as string);
    const timeVal = fd.get("time") as string;
    
    if (!title || !timeVal) return;
    
    const [h, m] = timeVal.split(":");
    const newEvent = {
      id: "e_" + Math.random().toString(36).substr(2, 6),
      title,
      startHour: parseInt(h),
      startMin: parseInt(m),
      duration: duration || 30,
      priority: "Medium",
      is_flexible: true,
      reminder_mins: 15
    };

    setLocalContainers(prev => {
      const updated = [...prev];
      const thread = updated.find(c => c.container_id === showAddEventModal);
      if (thread) thread.events.push(newEvent);
      return updated;
    });

    fetch(`http://localhost:8000/api/events/containers/${showAddEventModal}/events/${newEvent.id}`, {
      method: "PUT",
      headers: getAuthHeaders("application/json"),
      body: JSON.stringify({
        ...newEvent,
        start_time: new Date(new Date().setHours(newEvent.startHour, newEvent.startMin, 0)).toISOString()
      })
    }).catch(console.error);

    setShowAddEventModal(null);
  };

  // Config Modals
  const fetchConfigs = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/events/configurations", { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.status === "success") {
        setAvailableConfigs(data.configurations || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenLoadConfig = async () => {
    await fetchConfigs();
    setShowConfigModal("load");
  };

  const handleOpenSettings = async () => {
    await fetchConfigs();
    setShowConfigModal("settings");
  };

  const handleSelectConfig = async (configId: string) => {
    try {
      const switchRes = await fetch("http://localhost:8000/api/events/configurations/active", {
        method: "PUT",
        headers: getAuthHeaders("application/json"),
        body: JSON.stringify({ config_id: configId })
      });
      const switchData = await switchRes.json();
      if (switchData.status === "success") {
        fetchEventContainers();
        setShowConfigModal(null);
      } else {
        alert(`Failed to load: ${switchData.message}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!window.confirm("Are you sure you want to delete this configuration?")) return;
    try {
      const res = await fetch(`http://localhost:8000/api/events/configurations/${configId}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.status === "success") {
        setAvailableConfigs(prev => prev.filter(c => c.config_id !== configId));
      } else {
        alert("Failed to delete.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveState = () => {
    alert("Your state is auto-saved in the background! Use 'Save As...' to create a copy.");
  };

  const handleSaveConfigSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const configName = (new FormData(e.currentTarget).get("configName") as string) || "Custom Config";
    
    const mappedContainers = localContainers.map(c => ({
      container_id: c.container_id,
      sequence_name: c.sequence_name,
      priority: c.priority,
      is_flexible: c.is_flexible,
      is_custom_named: c.is_custom_named,
      color: c.color,
      events: c.events.map((evt: any) => {
        const date = new Date(new Date().setHours(evt.startHour, evt.startMin, 0));
        return {
          id: evt.id,
          title: evt.title,
          start_time: date.toISOString(),
          duration_minutes: evt.duration,
          priority: evt.priority,
          is_flexible: evt.is_flexible,
          reminder_mins: evt.reminder_mins || 15
        };
      })
    }));

    fetch("http://localhost:8000/api/events/configurations", {
      method: "POST",
      headers: getAuthHeaders("application/json"),
      body: JSON.stringify({ name: configName, containers: mappedContainers })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        setShowConfigModal(null);
      }
    })
    .catch(console.error);
  };

  const handleAddThread = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/events/containers", {
          method: "POST",
          headers: getAuthHeaders("application/json"),
          body: JSON.stringify({ sequence_name: "New Thread", color: "zinc" })
      });
      const data = await res.json();
      if (data.status === "success") {
          setLocalContainers([...localContainers, { ...data.container, events: [] }]);
      }
    } catch (err) {
      console.error("Failed to add thread", err);
    }
  };

  const handleUpdateCalendar = () => {
    if (!window.confirm("Sync active custom timeline back to Google Calendar?")) return;
    
    fetch("http://localhost:8000/api/calendar/sync", {
      method: "POST",
      headers: getAuthHeaders()
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        alert("Sync Complete!");
        fetchCalendarEvents();
      } else {
        alert("Failed to sync calendar: " + data.message);
      }
    })
    .catch(err => alert("Error syncing: " + err.message));
  };

  // Shift + scroll timeline horizontally
  const handleWheel = (e: React.WheelEvent) => {
    if (e.shiftKey) {
      if (e.deltaY > 0 || e.deltaX > 0) {
        setTimelineStartHour(prev => Math.min(24 - 8, prev + 1));
      } else if (e.deltaY < 0 || e.deltaX < 0) {
        setTimelineStartHour(prev => Math.max(0, prev - 1));
      }
    }
  };

  // DRAG AND DROP EVENTS 
  const handleDragStart = (e: any, eventId: string, containerId: string) => {
    // Determine where inside the event block the user clicked so we don't jump it
    const rect = e.currentTarget.getBoundingClientRect();
    const dragOffsetX = e.clientX - rect.left;
    
    setDraggedEvent({ eventId, sourceContainerId: containerId });
    e.dataTransfer.setData("text/plain", eventId);
    e.dataTransfer.setData("dragOffsetX", dragOffsetX.toString());
  };

  const handleDrop = (e: any, targetContainerId: string) => {
    e.preventDefault();
    if (!draggedEvent) return;
    e.currentTarget.classList.remove("bg-zinc-200/50", "dark:bg-zinc-700/50");
    
    const { eventId, sourceContainerId } = draggedEvent;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const rawDragOffsetX = parseFloat(e.dataTransfer.getData("dragOffsetX")) || 0;
    
    // Offset the target position by where they grabbed the element to align perfectly
    let offsetX = e.clientX - rect.left - rawDragOffsetX;
    offsetX = Math.max(0, Math.min(rect.width, offsetX));
    const percent = offsetX / rect.width;
    
    const dropTimeInMinutes = Math.round((percent * totalMinutes) / 5) * 5;
    const newStartHour = timelineStartHour + Math.floor(dropTimeInMinutes / 60);
    const newStartMin = dropTimeInMinutes % 60;

    setLocalContainers(prev => {
      let updated = [...prev];
      const sourceThread = updated.find(c => c.container_id === sourceContainerId);
      const targetThread = updated.find(c => c.container_id === targetContainerId);
      
      if (!sourceThread || !targetThread) return prev;

      const evtIndex = sourceThread.events.findIndex((ev: any) => ev.id === eventId);
      if (evtIndex === -1) return prev;

      const [movedEvent] = sourceThread.events.splice(evtIndex, 1);
      
      movedEvent.startHour = newStartHour;
      movedEvent.startMin = newStartMin;
      
      targetThread.events.push(movedEvent);

      if (sourceThread.events.length === 0 && !sourceThread.is_custom_named) {
        updated = updated.filter(c => c.container_id !== sourceContainerId);
      }

      return updated;
    });

    fetch(`http://localhost:8000/api/events/containers/${sourceContainerId}/events/${eventId}`, {
      method: "PUT",
      headers: getAuthHeaders("application/json"),
      body: JSON.stringify({ 
        new_container_id: targetContainerId,
        new_start_hour: newStartHour,
        new_start_min: newStartMin
      })
    }).catch(console.error);

    setDraggedEvent(null);
  };

  const handleDragOver = (e: any) => {
    e.preventDefault();
    e.currentTarget.classList.add("bg-zinc-200/50", "dark:bg-zinc-700/50");
  };

  const handleDragLeave = (e: any) => {
    e.currentTarget.classList.remove("bg-zinc-200/50", "dark:bg-zinc-700/50");
  };

  const handleSaveEvent = (updatedEvent: any) => {
    if (!editingEvent || !updatedEvent || !updatedEvent.id) return;

    const currentContainerId = editingEvent.containerId;
    const currentEventId = updatedEvent.id;

    setLocalContainers(prev => {
      const updated = [...prev];
      const thread = updated.find(c => c.container_id === currentContainerId);
      if (thread) {
        const evtIndex = thread.events.findIndex((e: any) => e.id === currentEventId);
        if (evtIndex > -1) {
          thread.events[evtIndex] = updatedEvent;
        }
      }
      return updated;
    });

    fetch(`http://localhost:8000/api/events/containers/${currentContainerId}/events/${currentEventId}`, {
      method: "PUT",
      headers: getAuthHeaders("application/json"),
      body: JSON.stringify(updatedEvent)
    }).catch(console.error);

    setEditingEvent(null);
  };

  const handleAddGhostTask = (containerId: string, startMin: number) => {
    const newEvent = {
      id: "ghost_" + Math.random().toString(36).substr(2, 6),
      title: "Spacing",
      startHour: Math.floor(startMin / 60),
      startMin: startMin % 60,
      duration: 15,
      priority: "Low",
      is_flexible: false,
      is_start_time_locked: true,
      is_duration_locked: true,
      is_ghost: true,
      reminder_mins: 0
    };

    setLocalContainers(prev => {
      const updated = [...prev];
      const thread = updated.find(c => c.container_id === containerId);
      if (thread) thread.events.push(newEvent);
      return updated;
    });

    fetch(`http://localhost:8000/api/events/containers/${containerId}/events/${newEvent.id}`, {
      method: "PUT",
      headers: getAuthHeaders("application/json"),
      body: JSON.stringify({
        ...newEvent,
        start_time: new Date(new Date().setHours(newEvent.startHour, newEvent.startMin, 0)).toISOString()
      })
    }).catch(console.error);
  };

  const calculateLeft = (hour: number, min: number) => {
    const elapsed = (hour - timelineStartHour) * 60 + min;
    return (elapsed / totalMinutes) * 100;
  };

  const calculateWidth = (duration: number) => {
    return (duration / totalMinutes) * 100;
  };

  const getColorClasses = (color: string) => {
    switch(color) {
      case 'blue': return "bg-blue-500 border-blue-600 text-blue-50";
      case 'purple': return "bg-purple-500 border-purple-600 text-purple-50";
      case 'green': return "bg-emerald-500 border-emerald-600 text-emerald-50";
      case 'red': return "bg-red-500 border-red-600 text-red-50";
      case 'orange': return "bg-orange-500 border-orange-600 text-orange-50";
      default: return "bg-zinc-500 border-zinc-600 text-zinc-50";
    }
  };

  const currentHour = currentTime.getHours();
  const currentMin = currentTime.getMinutes();
  const isCurrentTimeVisible = currentHour >= timelineStartHour && currentHour < timelineEndHour;
  const currentTimeLeft = isCurrentTimeVisible ? calculateLeft(currentHour, currentMin) : -1;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-zinc-50 dark:bg-black">
        <p className="text-black dark:text-white animate-pulse">Checking authentication...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-100 dark:bg-black font-sans" onWheel={handleWheel}>
      <header className="flex justify-between items-center px-8 py-6 bg-white dark:bg-zinc-900 shadow-sm z-10 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
          <span className="text-blue-500">Opti</span>Time
        </h1>
        {user ? (
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{user.displayName}</span>
            <button onClick={handleOpenSettings} className="px-3 py-1.5 bg-zinc-800 dark:bg-zinc-700 text-white rounded-lg shadow-sm hover:bg-zinc-900 font-bold text-xs transition">Settings</button>
            <button onClick={logout} className="text-sm text-red-500 hover:text-red-600 transition font-semibold">Sign Out</button>
          </div>
        ) : (
          <button onClick={loginWithGoogle} className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full shadow-md transition">
            Sign In with Google
          </button>
        )}
      </header>

      <main className="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full flex flex-col gap-6">
        
        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-xl md:text-3xl font-bold mb-4 text-zinc-800 dark:text-zinc-100">Welcome to OptiTime</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-8 max-w-md text-center">Please sign in with your Google account to connect your calendar and let the AI manage your schedule.</p>
            <button onClick={loginWithGoogle} className="px-8 py-4 text-lg font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition">Connect Calendar</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 w-full h-full flex-1">
            <div className="flex items-center gap-4 mb-2">
              <button onClick={() => setActiveTab("gantt")} className={`px-6 py-3 rounded-full font-bold transition ${activeTab === "gantt" ? "bg-zinc-900 text-white dark:bg-white dark:text-black shadow-md" : "bg-white text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"}`}>Gantt Logic Board</button>
              <button onClick={() => setActiveTab("calendar")} className={`px-6 py-3 rounded-full font-bold transition ${activeTab === "calendar" ? "bg-zinc-900 text-white dark:bg-white dark:text-black shadow-md" : "bg-white text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"}`}>Classic Calendar</button>
            </div>

            {activeTab === "gantt" && (
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-x-auto min-h-[400px]">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-3 mb-1">
                      <span className="w-3 h-3 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span>
                      Flexible Collections Board
                    </h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Shift+Scroll to move timeline. Drag events to modify times.</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {selectedThreads.length > 0 && (
                      <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-xl mr-2">
                        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300 ml-2">{selectedThreads.length} Selected</span>
                        {selectedThreads.length === 1 && (
                          <>
                            <button onClick={() => setShowAddEventModal(selectedThreads[0])} className="px-2.5 py-1.5 text-xs bg-emerald-500 text-white rounded-lg shadow-sm hover:bg-emerald-600 font-bold">+ Add Event</button>
                            <button onClick={() => openThreadModal(selectedThreads[0])} className="px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg shadow-sm hover:bg-zinc-50">Modify Thread</button>
                          </>
                        )}
                        {selectedThreads.length >= 2 && (
                          <button onClick={handleMergeThreads} className="px-2.5 py-1.5 text-xs bg-blue-500 text-white rounded-lg shadow-sm hover:bg-blue-600">Merge</button>
                        )}
                        <button onClick={handleDeleteThreads} className="px-2.5 py-1.5 text-xs bg-red-500 text-white rounded-lg shadow-sm hover:bg-red-600">Delete</button>
                      </div>
                    )}
                    
                    <button onClick={handleAddThread} className="px-3 py-1.5 bg-zinc-800 dark:bg-zinc-700 text-white rounded-lg shadow-sm hover:bg-zinc-900 font-bold text-xs transition">+ Add Thread</button>
                    <button onClick={handleOpenLoadConfig} className="px-3 py-1.5 bg-zinc-800 dark:bg-zinc-700 text-white rounded-lg shadow-sm hover:bg-zinc-900 font-bold text-xs transition">Configs</button>
                    
                    <div className="relative group inline-block">
                      <button onClick={handleSaveState} className="px-3 py-1.5 bg-green-500 text-white rounded-lg shadow-sm hover:bg-green-600 font-bold text-xs transition">
                        Save State
                      </button>
                      <div className="absolute top-full right-0 mt-1 hidden group-hover:block bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-xl rounded-lg overflow-hidden w-32 z-50">
                        <button onClick={() => setShowConfigModal("save")} className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-700 dark:text-white">Save As...</button>
                      </div>
                    </div>
                    
                    <button onClick={handleUpdateCalendar} className="px-3 py-1.5 bg-blue-500 text-white rounded-lg shadow-sm hover:bg-blue-600 font-bold text-xs transition">Sync to Google</button>
                  </div>
                </div>

                <div className="flex-1 min-w-[800px] mt-4 relative">
                  {/* Timeline Header */}
                  <div className="flex border-b border-zinc-200 dark:border-zinc-700 pb-2 mb-4 relative ml-48 items-center">
                    {Array.from({ length: timelineEndHour - timelineStartHour + 1 }).map((_, i) => {
                      const hour = timelineStartHour + i;
                      const timeString = `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? 'PM' : 'AM'}`;
                      return (
                        <div key={i} className="absolute text-xs font-bold text-zinc-400 dark:text-zinc-500 -translate-x-1/2" style={{ left: `${(i / (timelineEndHour - timelineStartHour)) * 100}%` }}>
                          {timeString}
                        </div>
                      );
                    })}
                  </div>

                  {/* Gantt Threads */}
                  <div className="space-y-6 relative pb-10">
                    
                    {/* Global Visual Overlap Red Highlights */}
                    <div className="absolute top-0 bottom-0 left-48 right-0 overflow-hidden pointer-events-none z-0">
                      {globalConflictIntervals.map((oi, idx) => {
                          const left = calculateLeft(Math.floor(oi.startMin / 60), oi.startMin % 60);
                          const width = calculateWidth(oi.duration);
                          return (
                            <div key={`gconflict-${idx}`} className="absolute top-0 bottom-0 bg-red-500/10 border-x border-red-500/30"
                                style={{ left: `${left}%`, width: `${width}%` }} />
                          )
                      })}
                    </div>

                    {isCurrentTimeVisible && (
                      <div className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-20 pointer-events-none" style={{ left: `calc(12rem + ${currentTimeLeft}%)` }}>
                        <div className="absolute -top-2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1 rounded">NOW</div>
                      </div>
                    )}

                    <div className="absolute top-0 bottom-0 left-48 right-0 flex pointer-events-none z-0 opacity-20 dark:opacity-10">
                      {Array.from({ length: timelineEndHour - timelineStartHour }).map((_, i) => (
                        <div key={i} className="flex-1 border-l border-dashed border-zinc-400 h-full"></div>
                      ))}
                      <div className="border-l border-dashed border-zinc-400 h-full"></div>
                    </div>

                    {localContainers.map((container) => {
                      const isSelected = selectedThreads.includes(container.container_id);
                      const hasThreadConflicts = getConflictIntervals(container.events).length > 0;

                      return (
                        <div key={container.container_id} className={`flex items-center relative z-10 group rounded-xl transition p-1 border-2 ${isSelected ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/10" : "border-transparent"} ${hasThreadConflicts ? "bg-red-50/30 dark:bg-red-900/10 border-red-300" : ""}`}>
                          <div className="w-48 pr-4 flex flex-col justify-center cursor-pointer p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => toggleThreadSelection(container.container_id)}>
                            <h3 className="font-bold text-zinc-800 dark:text-zinc-200 text-sm truncate flex items-center gap-1">
                              {hasThreadConflicts && <span className="text-red-500 text-xs" title="Thread has overlapping events">⚠️</span>}
                              {container.sequence_name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                                {container.priority}
                              </span>
                            </div>
                          </div>

                          {/* Thread Timeline Row */}
                          <div 
                            className={`flex-1 h-16 bg-zinc-50 dark:bg-zinc-800/30 rounded-xl relative overflow-hidden border border-zinc-100 dark:border-zinc-800/50 transition-colors`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, container.container_id)}
                          >
                            {container.events.map((evt: any, idx: number) => {
                              const leftPercent = calculateLeft(evt.startHour, evt.startMin);
                              const widthPercent = calculateWidth(evt.duration);
                              const reminderLeftPercent = calculateLeft(evt.startHour, evt.startMin - evt.reminder_mins);

                              if (leftPercent + widthPercent < -10 || leftPercent > 110) return null;

                              // Use a composite key because Google Tasks or overlapping events might share the same base ID
                              return (
                                <div key={`${evt.id}-${idx}`} className="absolute top-0 bottom-0 z-10" style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}>
                                  {evt.reminder_mins > 0 && (
                                    <div className="absolute w-px bg-yellow-400 border-l border-dashed border-yellow-500 opacity-80 pointer-events-none" style={{ left: `${(reminderLeftPercent - leftPercent) * (100 / widthPercent)}%`, top: 0, bottom: 0 }}>
                                      <span className="absolute -top-1 -translate-x-1/2 text-[8px]">🔔</span>
                                    </div>
                                  )}

                                  <div 
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, evt.id, container.container_id)}
                                    onClick={() => setEditingEvent({ event: evt, containerId: container.container_id })}
                                    className={`absolute top-2 bottom-2 left-0 right-0 rounded-lg border flex flex-col justify-center px-3 shadow-sm hover:opacity-90 cursor-pointer transition-transform hover:scale-[1.02] ${getColorClasses(container.color)}`}
                                    title={`Click to edit ${evt.title}`}
                                  >
                                    <span className="text-xs font-bold truncate">{evt.title}</span>
                                    <span className="text-[10px] opacity-80 truncate">{evt.duration}m</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: CALENDAR PANEL */}
            {activeTab === "calendar" && (
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col min-h-[400px]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
                    Today's Calendar
                  </h2>
                </div>
                {calendarLoading && calendarEvents.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center"><p className="animate-pulse">Loading...</p></div>
                ) : calendarEvents.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center"><span className="text-2xl opacity-80">📅</span><p className="text-zinc-500">No events</p></div>
                ) : (
                  <div className="flex-1 overflow-y-auto pr-2 space-y-4 max-h-[500px]">
                    {calendarEvents.map((evt: any, i: number) => {
                      const startDate = new Date(evt.start?.dateTime || evt.start?.date);
                      const endDate = new Date(evt.end?.dateTime || evt.end?.date);
                      const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
                      return (
                        <div key={evt.id || i} className="group relative bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-700/50 p-5 rounded-2xl">
                          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{evt.summary || "(No title)"}</h3>
                          <p className="text-sm text-zinc-500">{startDate.toLocaleTimeString(undefined, timeOptions)} - {endDate.toLocaleTimeString(undefined, timeOptions)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Input Bento Panel (Bottom) */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col mt-4">
              <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-6 flex items-center gap-2">
                <span className="text-xl">✨</span> AI Assistant
              </h2>
              <form onSubmit={handleTriggerPipeline} className="flex flex-col gap-4 relative">
                <textarea 
                  value={promptText} onChange={(e) => setPromptText(e.target.value)} 
                  placeholder="E.g., Can you fit a 30m run in my schedule today? Shift my laundry to the afternoon if needed." rows={3}
                  className="w-full p-5 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-zinc-800 transition resize-none shadow-inner"
                />
                <button type="submit" disabled={apiLoading || !promptText.trim()} className="self-end px-8 py-3 bg-zinc-900 dark:bg-white text-white dark:text-black font-bold rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-100 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
                  {apiLoading ? 'Processing...' : 'Ask AI'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* MODALS */}

      {/* Modify Thread Modal */}
      {showThreadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-xl max-w-sm w-full border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-xl font-bold mb-4 dark:text-white">Modify Thread</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-1">Thread Name</label>
                <input type="text" className="w-full p-2 rounded-lg border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white" value={threadFormData.name} onChange={(e) => setThreadFormData({...threadFormData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-1">Color Palette</label>
                <select className="w-full p-2 rounded-lg border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white" value={threadFormData.color} onChange={(e) => setThreadFormData({...threadFormData, color: e.target.value})}>
                  <option value="blue">Blue</option>
                  <option value="purple">Purple</option>
                  <option value="green">Green</option>
                  <option value="red">Red</option>
                  <option value="orange">Orange</option>
                  <option value="zinc">Gray/Zinc</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setShowThreadModal(null)} className="flex-1 py-2 rounded-lg font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition">Cancel</button>
              <button onClick={handleModifyThreadSubmit} className="flex-1 py-2 rounded-lg font-bold bg-blue-500 text-white hover:bg-blue-600 transition">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Config Modals */}
      {showConfigModal === "load" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-xl max-w-sm w-full border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-xl font-bold mb-4 dark:text-white">Load Configuration</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
              {availableConfigs.length === 0 ? <p className="text-zinc-500">No custom configurations found.</p> : null}
              {availableConfigs.map(c => (
                <button key={c.config_id} onClick={() => handleSelectConfig(c.config_id)} className="w-full text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">
                  <div className="font-bold dark:text-white">{c.name}</div>
                  <div className="text-xs text-zinc-500">{c.config_id}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowConfigModal(null)} className="w-full py-2 rounded-lg font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition">Cancel</button>
          </div>
        </div>
      )}
      
      {showConfigModal === "settings" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-xl max-w-sm w-full border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-xl font-bold mb-4 dark:text-white">Settings: Manage Configs</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
              {availableConfigs.length === 0 ? <p className="text-zinc-500">No custom configurations found.</p> : null}
              {availableConfigs.map(c => (
                <div key={c.config_id} className="flex justify-between items-center p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <div>
                    <div className="font-bold dark:text-white">{c.name}</div>
                    <div className="text-xs text-zinc-500">{c.config_id}</div>
                  </div>
                  <button onClick={() => handleDeleteConfig(c.config_id)} className="px-3 py-1 bg-red-500 hover:bg-red-600 transition text-white rounded font-bold text-xs">Delete</button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowConfigModal(null)} className="w-full py-2 rounded-lg font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition">Close</button>
          </div>
        </div>
      )}

      {showConfigModal === "save" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveConfigSubmit} className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-xl max-w-sm w-full border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-xl font-bold mb-4 dark:text-white">Save Configuration As...</h3>
            <label className="block text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-1">Configuration Name</label>
            <input type="text" name="configName" placeholder="My Custom Timeline" className="w-full p-2 mb-8 rounded-lg border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white" required />
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowConfigModal(null)} className="flex-1 py-2 rounded-lg font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition">Cancel</button>
              <button type="submit" className="flex-1 py-2 rounded-lg font-bold bg-green-500 text-white hover:bg-green-600 transition">Save As New</button>
            </div>
          </form>
        </div>
      )}

      {/* Add Event Modal */}
      {showAddEventModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddNewEventSubmit} className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-xl max-w-sm w-full border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-xl font-bold mb-4 dark:text-white">Add Event to Thread</h3>
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-1">Event Title</label>
                <input type="text" name="title" className="w-full p-2 rounded-lg border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white" required placeholder="Team Meeting" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-1">Time</label>
                  <input type="time" name="time" className="w-full p-2 rounded-lg border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white" required />
                </div>
                <div className="w-24">
                  <label className="block text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-1">Duration</label>
                  <input type="number" name="duration" defaultValue={30} className="w-full p-2 rounded-lg border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white" />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAddEventModal(null)} className="flex-1 py-2 rounded-lg font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition">Cancel</button>
              <button type="submit" className="flex-1 py-2 rounded-lg font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition">Add Event</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Event Modal */}
      {editingEvent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-xl max-w-sm w-full border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-xl font-bold mb-4 dark:text-white">Edit: {editingEvent.event.title}</h3>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-2">
                  <input type="checkbox" checked={editingEvent.event.is_start_time_locked || false} onChange={(e) => setEditingEvent({ ...editingEvent, event: { ...editingEvent.event, is_start_time_locked: e.target.checked }})} />
                  Lock Start Time (Hardcode)
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-1">
                  <input type="checkbox" checked={editingEvent.event.is_duration_locked || false} onChange={(e) => setEditingEvent({ ...editingEvent, event: { ...editingEvent.event, is_duration_locked: e.target.checked }})} />
                  Lock Duration (Hardcode)
                </label>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-1">Flexibility</label>
                <select className="w-full p-2 rounded-lg border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white" value={editingEvent.event.is_flexible ? "true" : "false"} onChange={(e) => setEditingEvent({ ...editingEvent, event: { ...editingEvent.event, is_flexible: e.target.value === "true" }})}>
                  <option value="true">Flexible (AI can shift)</option>
                  <option value="false">Strict (Hardcoded time)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-1">Duration (mins)</label>
                <input type="number" disabled={editingEvent.event.is_duration_locked} className={`w-full p-2 rounded-lg border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white ${editingEvent.event.is_duration_locked ? 'opacity-50' : ''}`} value={editingEvent.event.duration} onChange={(e) => setEditingEvent({ ...editingEvent, event: { ...editingEvent.event, duration: parseInt(e.target.value) }})} />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-1">Reminder (mins before)</label>
                <input type="number" className="w-full p-2 rounded-lg border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white" value={editingEvent.event.reminder_mins} onChange={(e) => setEditingEvent({ ...editingEvent, event: { ...editingEvent.event, reminder_mins: parseInt(e.target.value) || 0 }})} />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setEditingEvent(null)} className="flex-1 py-2 rounded-lg font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition">Cancel</button>
              <button onClick={() => handleSaveEvent(editingEvent.event)} className="flex-1 py-2 rounded-lg font-bold bg-blue-500 text-white hover:bg-blue-600 transition">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
