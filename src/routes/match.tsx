import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMatch, formatTimer } from "@/store/match";
import { NumberPad } from "@/components/NumberPad";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PostMatchSummary } from "@/components/PostMatchSummary";
import { playBuzzer, playClick, vibrate } from "@/lib/sound";

export const Route = createFileRoute("/match")({
  head: () => ({
    meta: [
      { title: "Match en cours — StreetScore" },
      { name: "description", content: "Tableau d'affichage en direct : score, chrono, shot clock." },
    ],
  }),
  component: MatchPage,
});

function MatchPage() {
  const navigate = useNavigate();
  // Granular selectors — only re-render when the specific value changes
  const hasMatch = useMatch((s) => !!s.current);
  const team1 = useMatch((s) => s.current?.team1);
  const team2 = useMatch((s) => s.current?.team2);
  const isRunning = useMatch((s) => s.current?.timer.isRunning ?? false);
  const scRunning = useMatch((s) => s.current?.shotClock.isRunning ?? false);
  const period = useMatch((s) => s.current?.period ?? 1);
  const totalPeriods = useMatch((s) => s.current?.totalPeriods ?? 4);
  const periodType = useMatch((s) => s.current?.periodType ?? "quarter");
  const matchDate = useMatch((s) => s.current?.date ?? "");
  // finished tracked via getState() in summary handler — no selector needed
  const events = useMatch((s) => s.current?.events);

  const settings = useMatch((s) => s.settings);
  const tick = useMatch((s) => s.tick);
  const addScore = useMatch((s) => s.addScore);
  const setScore = useMatch((s) => s.setScore);
  const setTimerRunning = useMatch((s) => s.setTimerRunning);
  const resetTimer = useMatch((s) => s.resetTimer);
  const setTimerRemaining = useMatch((s) => s.setTimerRemaining);
  const setShotClockRunning = useMatch((s) => s.setShotClockRunning);
  const resetShotClock = useMatch((s) => s.resetShotClock);
  const setShotClockValue = useMatch((s) => s.setShotClockValue);
  const swapTeams = useMatch((s) => s.swapTeams);
  const setTeamName = useMatch((s) => s.setTeamName);
  const addFoul = useMatch((s) => s.addFoul);
  const addTimeout = useMatch((s) => s.addTimeout);
  const nextPeriod = useMatch((s) => s.nextPeriod);
  const undo = useMatch((s) => s.undo);
  const lastUndo = useMatch((s) => s.lastUndo);
  const clearUndo = useMatch((s) => s.clearUndo);
  const endMatch = useMatch((s) => s.endMatch);
  const clearCurrent = useMatch((s) => s.clearCurrent);

  const periodLabelStr = periodType === "quarter" ? `Q${period}` : `Mi-temps ${period}`;

  const [editTeam, setEditTeam] = useState<1 | 2 | null>(null);
  const [tempName, setTempName] = useState("");
  const [scorePadFor, setScorePadFor] = useState<1 | 2 | null>(null);
  const [editTimer, setEditTimer] = useState(false);
  const [tempTimer, setTempTimer] = useState("");
  const [editShotClock, setEditShotClock] = useState(false);
  const [tempSC, setTempSC] = useState("");
  const [locked, setLocked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [interPeriod, setInterPeriod] = useState(false);
  const [interSeconds, setInterSeconds] = useState(60);
  const [flash, setFlash] = useState(false);
  const [pulseTeam, setPulseTeam] = useState<1 | 2 | null>(null);

  const tripleTapRef = useRef<number[]>([]);
  const flashTimerRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

  // Cleanup any pending UI timers on unmount
  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  // Redirect if no match
  useEffect(() => {
    if (!hasMatch) navigate({ to: "/" });
  }, [hasMatch, navigate]);

  // Main tick loop (1s) — single interval, recreated only if `tick` action ref changes (it doesn't)
  useEffect(() => {
    const id = window.setInterval(() => tick(1), 1000);
    return () => window.clearInterval(id);
  }, [tick]);

  // Inter-period rest timer
  useEffect(() => {
    if (!interPeriod) return;
    const id = window.setInterval(() => setInterSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [interPeriod]);

  // Detect timer reaching 0 -> buzzer + flash + auto inter-period (isolated component)
  const handleEndOfPeriod = useCallback(() => {
    playBuzzer(settings.soundEnabled);
    vibrate(settings.vibrationEnabled, [800, 200, 800]);
    setFlash(true);
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setFlash(false);
      flashTimerRef.current = null;
    }, 900);
    setInterSeconds(60);
    setInterPeriod(true);
  }, [settings.soundEnabled, settings.vibrationEnabled]);

  const goNextPeriod = useCallback(() => {
    setInterPeriod(false);
    if (period < totalPeriods) {
      nextPeriod();
    } else {
      endMatch();
      setShowSummary(true);
    }
  }, [period, totalPeriods, nextPeriod, endMatch]);

  // Undo toast
  useEffect(() => {
    if (!lastUndo) return;
    const t = window.setTimeout(() => clearUndo(), 5000);
    const id = toast("Dernière action", {
      action: {
        label: "↩ Annuler",
        onClick: () => undo(),
      },
      duration: 5000,
    });
    return () => {
      window.clearTimeout(t);
      toast.dismiss(id);
    };
  }, [lastUndo, undo, clearUndo]);

  // Orientation detection
  const [isPortrait, setIsPortrait] = useState(false);
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsPortrait(w < h && w < 900);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  const onScore = useCallback(
    (team: 1 | 2, points: number) => {
      if (locked) return;
      addScore(team, points);
      vibrate(settings.vibrationEnabled, points > 0 ? [30, 10, 30] : 40);
      playClick(settings.soundEnabled);
      setPulseTeam(team);
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => {
        setPulseTeam(null);
        pulseTimerRef.current = null;
      }, 250);
    },
    [addScore, locked, settings.vibrationEnabled, settings.soundEnabled]
  );

  const handleEndMatch = () => {
    endMatch();
    setShowSummary(true);
  };

  const requestFullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleLockTap = () => {
    const now = Date.now();
    tripleTapRef.current = tripleTapRef.current.filter((t) => now - t < 800);
    tripleTapRef.current.push(now);
    vibrate(settings.vibrationEnabled, 30);
    if (tripleTapRef.current.length >= 3) {
      setLocked(false);
      tripleTapRef.current = [];
      vibrate(settings.vibrationEnabled, [50, 50, 50]);
    }
  };

  if (!hasMatch || !team1 || !team2) return null;

  if (isPortrait) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div>
          <svg viewBox="0 0 24 24" className="mx-auto h-16 w-16 animate-pulse text-primary" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 2v4M8 18v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
          </svg>
          <p className="mt-4 text-base font-semibold">Tournez votre téléphone</p>
          <p className="mt-1 text-sm text-muted-foreground">Le tableau s'affiche en mode paysage</p>
          <button onClick={() => navigate({ to: "/" })} className="mt-6 rounded-lg bg-secondary px-4 py-2 text-sm">
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  const score1 = team1.score;
  const score2 = team2.score;

  // Momentum: last 5 scoring events for either team, check if 3+ in a row by same team
  const onFireTeam = useMemo(() => {
    if (!events) return null;
    const last5 = events.filter((e) => e.points > 0).slice(-5);
    const lastTeam = last5[last5.length - 1]?.team;
    let streak = 0;
    for (let i = last5.length - 1; i >= 0; i--) {
      if (last5[i].team === lastTeam) streak++;
      else break;
    }
    return streak >= 3 ? lastTeam : null;
  }, [events]);

  const diff = Math.abs(score1 - score2);
  const leading = score1 === score2 ? null : score1 > score2 ? 1 : 2;

  return (
    <div className={`relative h-screen w-screen overflow-hidden bg-background text-foreground ${flash ? "animate-flash" : ""}`}>
      {/* TOP BAR */}
      <div className="flex h-10 items-center justify-between border-b border-border bg-card px-3 text-xs">
        <button
          onClick={() => {
            if (confirm("Terminer le match ?")) handleEndMatch();
          }}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-secondary"
          aria-label="Fin du match"
        >
          ← Fin du match
        </button>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="font-semibold text-foreground">{periodLabelStr}</span>
          <span>·</span>
          <span>{new Date(matchDate).toLocaleDateString("fr-FR")}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings(true)}
            className="rounded p-1.5 text-muted-foreground hover:bg-secondary"
            aria-label="Réglages"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            onClick={() => setLocked((v) => !v)}
            className="rounded p-1.5 text-muted-foreground hover:bg-secondary"
            aria-label="Verrouiller"
          >
            {locked ? "🔒" : "🔓"}
          </button>
          <button
            onClick={requestFullscreen}
            className="rounded p-1.5 text-muted-foreground hover:bg-secondary"
            aria-label="Plein écran"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7V3h4M21 7V3h-4M3 17v4h4M21 17v4h-4" />
            </svg>
          </button>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid h-[calc(100%-40px-72px)] grid-cols-[1fr_minmax(180px,22%)_1fr]">
        {/* TEAM 1 */}
        <TeamPanel
          side="left"
          team={team1}
          color="score"
          onName={() => {
            setTempName(team1.name);
            setEditTeam(1);
          }}
          onScoreTap={() => setScorePadFor(1)}
          onPlus={(p) => onScore(1, p)}
          onMinus={() => onScore(1, -1)}
          pulse={pulseTeam === 1}
          onFire={onFireTeam === 1}
          locked={locked}
        />

        {/* CENTER */}
        <div className="flex flex-col items-center justify-center gap-2 border-x border-border bg-card px-2 py-2">
          {leading && diff > 0 && (
            <div
              className="rounded-full px-3 py-0.5 text-xs font-bold"
              style={{
                backgroundColor: "color-mix(in oklab, var(--color-score) 25%, transparent)",
                color: "var(--color-score)",
              }}
            >
              {leading === 1 ? "←" : "→"} +{diff}
            </div>
          )}

          <TimerDisplay
            locked={locked}
            onEdit={(cur) => {
              setTempTimer(cur);
              setEditTimer(true);
            }}
          />
          <EndOfPeriodWatcher onEndOfPeriod={handleEndOfPeriod} />


          <div className="flex gap-2">
            <button
              onClick={() => {
                if (locked) return;
                setTimerRunning(!isRunning);
              }}
              className="rounded-lg bg-secondary px-4 py-2 text-base font-bold"
              aria-label={isRunning ? "Pause" : "Démarrer"}
            >
              {isRunning ? "⏸" : "▶"}
            </button>
            <button
              onClick={() => {
                if (locked) return;
                resetTimer();
              }}
              className="rounded-lg bg-secondary px-3 py-2 text-sm"
              aria-label="Reset chrono"
            >
              ↺
            </button>
          </div>

          <div className="my-1 h-px w-full bg-border" />

          <ShotClockDisplay
            locked={locked}
            onEdit={(cur) => {
              setTempSC(cur);
              setEditShotClock(true);
            }}
          />

          <div className="flex gap-1">
            <button
              onClick={() => {
                if (locked) return;
                resetShotClock(24);
              }}
              className="rounded bg-secondary px-2 py-1 text-xs font-semibold"
            >
              24s
            </button>
            <button
              onClick={() => {
                if (locked) return;
                resetShotClock(14);
              }}
              className="rounded bg-secondary px-2 py-1 text-xs font-semibold"
            >
              14s
            </button>
            <button
              onClick={() => {
                if (locked) return;
                setShotClockRunning(!scRunning);
              }}
              className="rounded bg-secondary px-2 py-1 text-xs font-semibold"
              aria-label="Toggle shot clock"
            >
              {scRunning ? "⏸" : "▶"}
            </button>
          </div>
        </div>

        {/* TEAM 2 */}
        <TeamPanel
          side="right"
          team={team2}
          color="score"
          onName={() => {
            setTempName(team2.name);
            setEditTeam(2);
          }}
          onScoreTap={() => setScorePadFor(2)}
          onPlus={(p) => onScore(2, p)}
          onMinus={() => onScore(2, -1)}
          pulse={pulseTeam === 2}
          onFire={onFireTeam === 2}
          locked={locked}
        />
      </div>

      {/* BOTTOM BAR */}
      <div className="grid h-[72px] grid-cols-[1fr_auto_1fr] gap-2 border-t border-border bg-card px-3 py-2">
        <TeamStats
          team={team1}
          maxTimeouts={settings.maxTimeouts}
          onFoul={(d) => !locked && addFoul(1, d)}
          onTimeout={(d) => !locked && addTimeout(1, d)}
        />
        <div className="flex flex-col items-center justify-center gap-1">
          <button
            onClick={() => {
              if (locked) return;
              swapTeams();
            }}
            className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold"
          >
            ⇄ Inverser
          </button>
          <button
            onClick={() => {
              if (locked) return;
              if (period < totalPeriods) {
                nextPeriod();
                setInterSeconds(60);
                setInterPeriod(true);
              } else {
                handleEndMatch();
              }
            }}
            className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold"
          >
            {periodLabelStr} →
          </button>
        </div>
        <TeamStats
          team={team2}
          maxTimeouts={settings.maxTimeouts}
          onFoul={(d) => !locked && addFoul(2, d)}
          onTimeout={(d) => !locked && addTimeout(2, d)}
          mirror
        />
      </div>

      {/* LOCK OVERLAY */}
      {locked && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/80"
          onClick={handleLockTap}
        >
          <div className="rounded-xl border border-border bg-card px-6 py-4 text-center">
            <p className="text-sm font-semibold">🔒 Écran verrouillé</p>
            <p className="mt-1 text-xs text-muted-foreground">Appuyez 3× pour déverrouiller</p>
          </div>
        </div>
      )}

      {/* INTER-PERIOD OVERLAY */}
      {interPeriod && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/90">
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {periodType === "quarter" && period === 3 ? "Mi-temps" : "Pause entre périodes"}
            </p>
            <p className="mt-2 font-score text-[10vw] text-shotclock-color">{formatTimer(interSeconds)}</p>
            <button
              onClick={goNextPeriod}
              className="mt-4 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
            >
              {period < totalPeriods ? "Reprendre" : "Terminer le match"}
            </button>
          </div>
        </div>
      )}

      {/* MODALS */}
      {editTeam !== null && (
        <Modal onClose={() => setEditTeam(null)}>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Nom de l'équipe</p>
          <input
            autoFocus
            value={tempName}
            maxLength={14}
            onChange={(e) => setTempName(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="mt-3 flex gap-2">
            <button onClick={() => setEditTeam(null)} className="flex-1 rounded-lg bg-secondary py-3 text-sm">
              Annuler
            </button>
            <button
              onClick={() => {
                setTeamName(editTeam, tempName);
                setEditTeam(null);
              }}
              className="flex-1 rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground"
            >
              OK
            </button>
          </div>
        </Modal>
      )}

      <NumberPad
        open={scorePadFor !== null}
        initial={scorePadFor === 1 ? team1.score : scorePadFor === 2 ? team2.score : 0}
        onClose={() => setScorePadFor(null)}
        onConfirm={(v) => scorePadFor && setScore(scorePadFor, v)}
        title="Score"
      />

      {editTimer && (
        <Modal onClose={() => setEditTimer(false)}>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Chrono (MM:SS)</p>
          <input
            autoFocus
            value={tempTimer}
            onChange={(e) => setTempTimer(e.target.value)}
            placeholder="10:00"
            className="w-full rounded-lg border border-border bg-secondary px-4 py-3 font-mono text-lg outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="mt-3 flex gap-2">
            <button onClick={() => setEditTimer(false)} className="flex-1 rounded-lg bg-secondary py-3 text-sm">
              Annuler
            </button>
            <button
              onClick={() => {
                const [m, s] = tempTimer.split(":").map((x) => Number(x) || 0);
                setTimerRemaining((m || 0) * 60 + (s || 0));
                setEditTimer(false);
              }}
              className="flex-1 rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground"
            >
              OK
            </button>
          </div>
        </Modal>
      )}

      {editShotClock && (
        <Modal onClose={() => setEditShotClock(false)}>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Shot clock (s)</p>
          <input
            autoFocus
            type="number"
            min={0}
            max={24}
            value={tempSC}
            onChange={(e) => setTempSC(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary px-4 py-3 font-mono text-lg outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="mt-3 flex gap-2">
            <button onClick={() => setEditShotClock(false)} className="flex-1 rounded-lg bg-secondary py-3 text-sm">
              Annuler
            </button>
            <button
              onClick={() => {
                setShotClockValue(Number(tempSC) || 0);
                setEditShotClock(false);
              }}
              className="flex-1 rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground"
            >
              OK
            </button>
          </div>
        </Modal>
      )}

      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />
      {showSummary && useMatch.getState().current && (
        <PostMatchSummary
          match={useMatch.getState().current!}
          onClose={() => {
            setShowSummary(false);
            if (!useMatch.getState().current?.finished) return;
            // After summary closes, if user didn't pick rematch/new, send home and clear
            if (useMatch.getState().current?.finished) {
              clearCurrent();
              navigate({ to: "/" });
            }
          }}
        />
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

interface TeamPanelProps {
  side: "left" | "right";
  team: { name: string; score: number };
  color: "score";
  onName: () => void;
  onScoreTap: () => void;
  onPlus: (points: number) => void;
  onMinus: () => void;
  pulse: boolean;
  onFire: boolean;
  locked: boolean;
}
function TeamPanel({ side, team, onName, onScoreTap, onPlus, onMinus, pulse, onFire, locked }: TeamPanelProps) {
  return (
    <div className={`flex flex-col items-center justify-between bg-panel-elevated p-2 ${side === "right" ? "" : ""}`}>
      <button
        onClick={() => !locked && onName()}
        className="w-full truncate rounded px-2 py-1 text-center text-base font-semibold hover:bg-secondary sm:text-lg"
        aria-label={`Modifier nom ${team.name}`}
      >
        {team.name}
      </button>

      <button
        onClick={() => !locked && onScoreTap()}
        className={`my-1 font-score leading-none text-score-color ${pulse ? "animate-pulse-score" : ""}`}
        style={{ fontSize: "clamp(72px, 14vw, 220px)" }}
        aria-live="polite"
        aria-label={`Score ${team.score}`}
      >
        {team.score}
      </button>

      {onFire && (
        <div className="-mt-1 mb-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: "color-mix(in oklab, var(--color-shotclock) 25%, transparent)", color: "var(--color-shotclock)" }}>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4-1 4 3 4 3 0 0-3-1-5 0-7z"/></svg>
          En feu
        </div>
      )}

      <div className="grid w-full grid-cols-3 gap-1.5">
        <button
          onClick={() => onPlus(1)}
          disabled={locked}
          className="rounded-lg py-3 text-lg font-bold text-primary-foreground active:scale-95"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-score) 65%, black)" }}
        >
          +1
        </button>
        <button
          onClick={() => onPlus(2)}
          disabled={locked}
          className="rounded-lg py-3 text-lg font-bold text-primary-foreground active:scale-95"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-score) 80%, black)" }}
        >
          +2
        </button>
        <button
          onClick={() => onPlus(3)}
          disabled={locked}
          className="rounded-lg py-3 text-lg font-bold text-primary-foreground active:scale-95"
          style={{ backgroundColor: "var(--color-score)" }}
        >
          +3
        </button>
      </div>

      <button
        onClick={() => onMinus()}
        disabled={locked}
        className="mt-1.5 w-full rounded-lg border py-1.5 text-sm font-semibold text-destructive active:scale-95"
        style={{ borderColor: "color-mix(in oklab, var(--color-foul-danger) 40%, transparent)", backgroundColor: "color-mix(in oklab, var(--color-foul-danger) 12%, transparent)" }}
      >
        −1
      </button>
    </div>
  );
}

interface TeamStatsProps {
  team: { fouls: number; timeouts: number };
  maxTimeouts: 3 | 5;
  onFoul: (d: number) => void;
  onTimeout: (d: number) => void;
  mirror?: boolean;
}
function TeamStats({ team, maxTimeouts, onFoul, onTimeout, mirror = false }: TeamStatsProps) {
  const dots = Array.from({ length: maxTimeouts }, (_, i) => i < team.timeouts);
  const danger = team.fouls >= 4;
  return (
    <div className={`flex items-center gap-3 ${mirror ? "justify-end" : "justify-start"}`}>
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Fautes</span>
        <div className="flex items-center gap-1">
          <button onClick={() => onFoul(-1)} className="rounded bg-secondary px-2 py-0.5 text-sm">−</button>
          <span className={`min-w-[20px] text-center text-base font-bold ${danger ? "text-destructive" : ""}`}>{team.fouls}</span>
          <button onClick={() => onFoul(1)} className="rounded bg-secondary px-2 py-0.5 text-sm">+</button>
        </div>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Temps-morts</span>
        <div className="flex items-center gap-1">
          <button onClick={() => onTimeout(-1)} className="rounded bg-secondary px-2 py-0.5 text-sm">−</button>
          <div className="flex gap-0.5">
            {dots.map((filled, i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: filled ? "var(--color-timeout-used)" : "var(--color-timeout-empty)" }}
              />
            ))}
          </div>
          <button onClick={() => onTimeout(1)} className="rounded bg-secondary px-2 py-0.5 text-sm">+</button>
        </div>
      </div>
    </div>
  );
}

function TimerDisplay({ locked, onEdit }: { locked: boolean; onEdit: (current: string) => void }) {
  const remaining = useMatch((s) => s.current?.timer.remaining ?? 0);
  return (
    <button
      onClick={() => {
        if (!locked) onEdit(formatTimer(remaining));
      }}
      className="font-score text-[7vw] leading-none text-timer-color sm:text-[5.5vw]"
      aria-live="assertive"
    >
      {formatTimer(remaining)}
    </button>
  );
}

function ShotClockDisplay({ locked, onEdit }: { locked: boolean; onEdit: (current: string) => void }) {
  const scValue = useMatch((s) => s.current?.shotClock.value ?? 24);
  const scLow = scValue <= 5 && scValue > 0;
  return (
    <button
      onClick={() => {
        if (!locked) onEdit(String(scValue));
      }}
      className={`font-score text-[5vw] leading-none text-shotclock-color sm:text-[4vw] ${
        scLow ? "animate-blink-fast" : ""
      }`}
      style={scLow ? { color: "var(--color-foul-danger)" } : undefined}
    >
      {scValue}
    </button>
  );
}

function EndOfPeriodWatcher({ onEndOfPeriod }: { onEndOfPeriod: () => void }) {
  const remaining = useMatch((s) => s.current?.timer.remaining ?? 0);
  const isRunning = useMatch((s) => s.current?.timer.isRunning ?? false);
  const wasRunningRef = useRef(false);
  const firedRef = useRef(false);
  useEffect(() => {
    if (wasRunningRef.current && remaining === 0 && !firedRef.current) {
      firedRef.current = true;
      onEndOfPeriod();
    }
    if (remaining > 0) firedRef.current = false;
    wasRunningRef.current = isRunning;
  }, [remaining, isRunning, onEndOfPeriod]);
  return null;
}
