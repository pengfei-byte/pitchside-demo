import { useCallback, useEffect, useRef, useState } from "react";
import { R2Client } from "../lib/r2.js";
import { closeSession, fetchHealth, fetchMatch, heartbeat, startBroadcast } from "../lib/api.js";

const LEAD_SEC = 2.6;
const CONNECT_TIMEOUT_MS = 20_000;
const HIDDEN_CLOSE_MS = 25_000;

function viewerMessage(text) {
  const clean = String(text || "")
    .replace(/pop\s*vid/gi, "Reverie")
    .replace(/\s+/g, " ")
    .trim();
  return clean || "The live booth didn't connect. Try again.";
}

function clock(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function loadYoutube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
}

export default function Booth() {
  const videoHost = useRef(null);
  const remoteVideo = useRef(null);
  const playerRef = useRef(null);
  const clientRef = useRef(null);
  const sessionRef = useRef(null);
  const cuesRef = useRef([]);
  const sentRef = useRef(new Set());
  const aheadRef = useRef(false);
  const expectedTurnRef = useRef("");
  const holdUntilRef = useRef(0);
  const currentCueRef = useRef(null);
  const liveRef = useRef(false);
  const continueRef = useRef(false);
  const connectTimerRef = useRef(null);
  const hiddenTimerRef = useRef(null);
  const showFailRef = useRef(() => {});

  const [match, setMatch] = useState(null);
  const [health, setHealth] = useState(null);
  const [phase, setPhase] = useState("lobby");
  const [status, setStatus] = useState("Booth closed");
  const [fail, setFail] = useState(null);
  const [live, setLive] = useState(false);
  const [filmTime, setFilmTime] = useState(0);
  const [onAir, setOnAir] = useState(null);

  const connecting = phase === "joining" || (phase === "onair" && !live);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth({ realtime: false }));
    fetchMatch().then(setMatch).catch(() => {});
  }, []);

  const clearTimers = () => {
    clearTimeout(connectTimerRef.current);
    clearTimeout(hiddenTimerRef.current);
  };

  const shutdown = useCallback((reason = "client_closed") => {
    clearTimers();
    const id = sessionRef.current;
    clientRef.current?.close(reason);
    clientRef.current = null;
    if (id) closeSession(id);
    sessionRef.current = null;
    aheadRef.current = false;
    expectedTurnRef.current = "";
    holdUntilRef.current = 0;
    liveRef.current = false;
    setLive(false);
    try {
      playerRef.current?.pauseVideo?.();
    } catch {
      /* player not ready */
    }
  }, []);

  const sayCue = useCallback((cue) => {
    const client = clientRef.current;
    if (!client || !cue || sentRef.current.has(cue.id)) return;
    if (aheadRef.current && !cue.cut) return;
    sentRef.current.add(cue.id);
    aheadRef.current = true;
    expectedTurnRef.current = client.say(cue.cue);
    currentCueRef.current = cue;
    setOnAir(cue);
    setStatus(cue.label);
  }, []);

  const syncToFilm = useCallback(() => {
    const player = playerRef.current;
    if (!player?.getCurrentTime || !liveRef.current) return;
    let playing = true;
    try {
      playing = player.getPlayerState?.() === window.YT?.PlayerState?.PLAYING;
      player.mute?.();
      player.setVolume?.(0);
    } catch {
      return;
    }
    const time = player.getCurrentTime();
    setFilmTime(time);
    if (!playing) return;
    const due = cuesRef.current.filter((cue) => !sentRef.current.has(cue.id) && time >= cue.at - LEAD_SEC);
    if (!due.length) return;
    const next = due[due.length - 1];
    due.slice(0, -1).forEach((cue) => sentRef.current.add(cue.id));
    if (aheadRef.current && !next.cut) return;
    if (Date.now() < holdUntilRef.current && !next.cut) return;
    sayCue(next);
  }, [sayCue]);

  useEffect(() => {
    const timer = setInterval(syncToFilm, 250);
    return () => clearInterval(timer);
  }, [syncToFilm]);

  const showFail = useCallback((body) => {
    continueRef.current = false;
    shutdown("connect_failed");
    setPhase("lobby");
    setStatus("Booth closed");
    setFail({ title: "Couldn't open the booth", body: viewerMessage(body) });
  }, [shutdown]);

  showFailRef.current = showFail;

  const attachClient = useCallback((data) => {
    sessionRef.current = data.session.session_id;
    cuesRef.current = data.match?.cues || [];
    sentRef.current = new Set();
    aheadRef.current = false;
    const client = new R2Client({
      credentials: data.credentials,
      remoteVideo: remoteVideo.current,
      onEvent: (msg) => {
        const body = msg.data || {};
        if (msg.type === "session.ready") {
          setStatus("Booth open");
          try {
            playerRef.current?.mute?.();
            playerRef.current?.seekTo?.(0, true);
            playerRef.current?.playVideo?.();
          } catch {
            /* player still loading */
          }
        }
        if (msg.type === "turn.visible") {
          if (body.turn_id && expectedTurnRef.current && body.turn_id !== expectedTurnRef.current) return;
          aheadRef.current = false;
          const words = currentCueRef.current?.words || 160;
          const playback = Math.max(7000, Math.round((words / 13) * 1000));
          holdUntilRef.current = Date.now() + playback;
          setStatus("On the call");
        }
      },
      onError: (err) => {
        if (!liveRef.current) showFailRef.current(err.message || err.code || "The live booth dropped.");
      },
      onEnded: () => {
        if (clientRef.current !== client) return;
        liveRef.current = false;
        setLive(false);
        if (continueRef.current) {
          setStatus("The reel is still running");
          setPhase("lobby");
        }
      },
    });
    clientRef.current = client;
    client.start();
    setPhase("onair");
    setStatus("Opening the booth");
  }, []);

  const ensurePlayer = useCallback(async (videoId) => {
    const YT = await loadYoutube();
    if (playerRef.current) {
      playerRef.current.mute();
      return playerRef.current;
    }
    return new Promise((resolve) => {
      playerRef.current = new YT.Player(videoHost.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          mute: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            event.target.mute();
            event.target.setVolume(0);
            resolve(event.target);
          },
        },
      });
    });
  }, []);

  const start = useCallback(async () => {
    if (phase === "joining") return;
    setFail(null);
    setPhase("joining");
    setStatus("Opening the booth");
    continueRef.current = true;
    shutdown("restart");
    continueRef.current = true;
    try {
      const film = match || (await fetchMatch());
      setMatch(film);
      await ensurePlayer(film.videoId);
      const data = await startBroadcast();
      if (data.match) setMatch(data.match);
      if (data.mode === "realtime" && data.credentials) {
        attachClient(data);
        clearTimeout(connectTimerRef.current);
        connectTimerRef.current = setTimeout(() => {
          if (!liveRef.current) showFailRef.current("The commentator didn't come up. Try again.");
        }, CONNECT_TIMEOUT_MS);
      } else {
        showFail(data.error?.message || data.message);
      }
    } catch (err) {
      if (err.payload?.match) setMatch(err.payload.match);
      showFail(err.message);
    }
  }, [attachClient, ensurePlayer, match, phase, shutdown]);

  useEffect(() => {
    const beat = setInterval(() => {
      if (sessionRef.current) heartbeat(sessionRef.current);
    }, 10_000);
    const onHide = () => {
      if (document.visibilityState !== "hidden") {
        clearTimeout(hiddenTimerRef.current);
        return;
      }
      hiddenTimerRef.current = setTimeout(() => {
        continueRef.current = false;
        shutdown("viewer_hidden");
        setPhase("lobby");
        setStatus("Booth closed");
      }, HIDDEN_CLOSE_MS);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      continueRef.current = false;
      clearInterval(beat);
      document.removeEventListener("visibilitychange", onHide);
      shutdown("unmount");
    };
  }, [shutdown]);

  const leave = () => {
    continueRef.current = false;
    shutdown("client_closed");
    setPhase("lobby");
    setStatus("You left the booth");
    setOnAir(null);
    setFail(null);
  };

  const activeId = onAir?.id;

  return (
    <div className="booth">
      <header className="mast">
        <div className="brand">
          <span>PITCHSIDE</span>
          <small>LIVE CALL</small>
        </div>
        <div className="mast-center">
          <span className={`pill ${phase === "onair" && live ? "on" : ""}`}>
            {phase === "onair" && live ? "ON AIR" : connecting ? "OPENING" : "STANDBY"}
          </span>
          <strong>{match?.title || "Match film"}</strong>
        </div>
        <div className="clock">{clock(filmTime)}</div>
      </header>

      <main className="floor">
        <section className="film">
          <div className="screen">
            <div ref={videoHost} className="yt" />
            {phase === "lobby" && (
              <button type="button" className="start" onClick={start}>
                Start commentary
              </button>
            )}
            {connecting && <div className="opening">Opening the booth</div>}
          </div>
          <div className="film-meta">
            <p>{match?.competition || "Football"}</p>
            <span>{match ? `${match.venue} · ${match.kickoff}` : "Loading the reel"}</span>
          </div>
          <p className="mute-note">The match film stays muted. Martin Hale calls what is on the screen.</p>
        </section>

        <aside className="caller">
          <div className="portrait">
            <video ref={remoteVideo} autoPlay playsInline onPlaying={() => { liveRef.current = true; setLive(true); clearTimeout(connectTimerRef.current); }} />
            {!live && <img src="/commentator.jpg" alt="Martin Hale in the Pitchside booth" />}
            <em>{live ? "MARTIN HALE" : "BOOTH"}</em>
          </div>
          <div className="call-card">
            <span>{onAir ? `${clock(onAir.at)} · ${onAir.label}` : status}</span>
            <p>{onAir?.caption || "He starts when the film does. No typing."}</p>
          </div>
          {phase === "onair" && (
            <button type="button" className="leave" onClick={leave}>Leave</button>
          )}
          <ol className="rundown">
            {(match?.cues || []).map((cue) => (
              <li key={cue.id} className={cue.id === activeId ? "now" : ""}>
                <b>{clock(cue.at)}</b>
                <div>
                  <small>{cue.label}</small>
                  <strong>{cue.caption}</strong>
                </div>
              </li>
            ))}
          </ol>
          <p className="fine">
            {health?.realtime ? "Booth ready." : "Booth updating."} {match?.filmed}
          </p>
        </aside>
      </main>
      <p className="powered">Powered by Reverie R2 API</p>
      {fail && (
        <div className="fail" role="dialog" aria-modal="true">
          <div>
            <h2>{fail.title}</h2>
            <p>{fail.body}</p>
            <button type="button" onClick={start}>Try again</button>
            <button type="button" className="ghost" onClick={() => setFail(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
