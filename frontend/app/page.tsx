"use client";

import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Home() {
  const { user, googleToken, loginWithGoogle, logout, loading } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<any>(null);
  const [apiLoading, setApiLoading] = useState(false);

  const handleTriggerPipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiLoading(true);

    try {
      const res = await fetch("http://localhost:8000/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: prompt,
          google_token: googleToken 
        }),
      });

      const data = await res.json();
      setResponse(data);
    } catch (error) {
      setResponse({ status: "error", message: "Failed to communicate with API backend." });
    } finally {
      setApiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-zinc-50 dark:bg-black">
        <p className="text-black dark:text-white">Checking system authentication...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-50 font-sans dark:bg-black p-8">
      <main className="flex w-full max-w-3xl flex-col items-stretch justify-start py-16 px-8 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl">
        <header className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-700 pb-4 mb-8">
          <h2 className="text-2xl font-bold text-black dark:text-white">AI Scheduler Engine</h2>
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-zinc-600 dark:text-zinc-300">Hi, {user.displayName}</span>
              <button onClick={logout} className="text-sm text-red-500 hover:text-red-700">Sign Out</button>
            </div>
          ) : (
            <button 
              onClick={loginWithGoogle} 
              className="px-4 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 transition"
            >
              Sign In with Google
            </button>
          )}
        </header>

        {user ? (
          <form onSubmit={handleTriggerPipeline} className="flex flex-col gap-4">
            <p className="text-sm text-green-500 font-semibold">✓ Authorized with Google Calendar</p>
            <input 
              type="text" 
              value={prompt} 
              onChange={(e) => setPrompt(e.target.value)} 
              placeholder="Ask the AI to parse your schedule..." 
              className="w-full p-4 border border-zinc-300 rounded-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button 
              type="submit" 
              disabled={apiLoading || !prompt.trim()} 
              className="w-full py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {apiLoading ? 'Processing on FastAPI Server...' : 'Execute RocketRide Pipeline'}
            </button>
          </form>
        ) : (
          <div className="mt-8 text-center text-zinc-600 dark:text-zinc-400">
            <p>Please log in above with your Google Account to authorize your workspace and synchronize calendar objects.</p>
          </div>
        )}

        {response && (
          <div className="mt-8 w-full p-6 bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-auto border border-zinc-200 dark:border-zinc-700">
            <h3 className="text-xl font-semibold mb-4 text-black dark:text-white">FastAPI System Output:</h3>
            <pre className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
              {JSON.stringify(response, null, 2)}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
