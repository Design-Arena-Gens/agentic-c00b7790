// This page hosts the entire party controller interface, so it must run on the client.
"use client";

import { useCallback, useMemo, useState } from "react";
import styles from "./page.module.css";

type Phase = "lobby" | "reveal" | "mission" | "meeting" | "ended";
type Role = "Crewmate" | "Impostor" | "Analyst";
type TaskKind = "crew" | "impostor" | "support";

type Task = {
  id: string;
  name: string;
  kind: TaskKind;
  completed: boolean;
};

type Player = {
  id: string;
  name: string;
  role: Role;
  tasks: Task[];
  status: "alive" | "eliminated";
  cardSeen: boolean;
};

type Outcome =
  | {
      winner: "Crewmates" | "Impostors";
      reason: string;
    }
  | null;

const CREW_TASK_BANK = [
  "Calibrate hydroponics valves",
  "Align telescope array and report spectra",
  "Prime navigation thrusters",
  "Divert power to security grid",
  "Reset reactor coolant equilibrator",
  "Refuel the landing shuttle",
  "Run diagnostics on med-scanner",
  "Patch hull microfractures",
  "Reboot comms uplink",
  "Secure cargo bay manifests",
  "Sweep ventilation ducts",
  "Sync shipboard chronometer",
] as const;

const IMPOSTOR_OBJECTIVES = [
  "Sabotage oxygen recyclers unnoticed",
  "Stage a false security alert",
  "Shadow the analyst and gain trust",
  "Plant decoy clues in electrical",
  "Force a strategic split-up",
  "Fake a task completion convincingly",
  "Trigger lights out mid-mission",
  "Frame a crewmate near a vent",
] as const;

const SUPPORT_ROUTINES = [
  "Scan the field deck for anomalies",
  "Verify DNA tags for the crew",
  "Audit task completion logs",
  "Run probability matrix on accusations",
  "Coordinate safe routes between zones",
  "Ping silent players for status",
  "Check security feeds for patterns",
] as const;

const PROMPT_DECK = [
  "Flash mission: everyone share their location in under 5 seconds.",
  "Quiet round: complete a task without saying a word.",
  "Mini-challenge: swap a task card with the player on your left.",
  "Truth pull: each player states who they trust the most this round.",
  "Speed check: complete any task within 30 seconds or call a meeting.",
  "Silent signal: analysts can secretly approve one crewmate this cycle.",
  "Saboteur stunt: impostors must orchestrate a distraction in 2 minutes.",
  "Paranoia push: vote to lock a room for the next minute.",
] as const;

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Crewmate: "Complete critical ship tasks and keep an eye out for sabotage.",
  Analyst:
    "Support the crew with intel, track alibis, and confirm suspicious activity.",
  Impostor:
    "Blend in, derail task completion, and eliminate the crew without exposure.",
};

const PHASE_LABELS: Record<Phase, string> = {
  lobby: "Player Lobby",
  reveal: "Card Reveal",
  mission: "Mission Control",
  meeting: "Emergency Meeting",
  ended: "Round Summary",
};

const ROLE_CLASS_MAP: Record<Role, string> = {
  Crewmate: styles.roleCrewmate,
  Impostor: styles.roleImpostor,
  Analyst: styles.roleAnalyst,
};

const PHASE_BADGE_TONE: Partial<Record<Phase, string>> = {
  meeting: styles.badgeToneWarning,
  ended: styles.badgeToneSuccess,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const getRandomItems = <T,>(source: readonly T[], count: number): T[] => {
  if (!source.length || count <= 0) return [];
  const safeCount = Math.min(count, source.length);
  const pool = [...source];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, safeCount);
};

const buildTask = (name: string, kind: TaskKind): Task => ({
  id: crypto.randomUUID(),
  name,
  kind,
  completed: false,
});

const getMaxImpostors = (playerCount: number) =>
  clamp(Math.floor(playerCount / 3) || 1, 1, 3);

const computeCrewTaskTotals = (playerList: Player[]) =>
  playerList.reduce(
    (acc, player) => {
      player.tasks.forEach((task) => {
        if (task.kind === "impostor") return;
        acc.total += 1;
        if (task.completed) acc.completed += 1;
      });
      return acc;
    },
    { total: 0, completed: 0 },
  );

const evaluateOutcome = (playerList: Player[]): Outcome => {
  if (!playerList.length) {
    return null;
  }
  const aliveCrew = playerList.filter(
    (player) =>
      player.status === "alive" &&
      (player.role === "Crewmate" || player.role === "Analyst"),
  ).length;
  const aliveImpostors = playerList.filter(
    (player) => player.status === "alive" && player.role === "Impostor",
  ).length;
  if (aliveImpostors === 0 && aliveCrew > 0) {
    return { winner: "Crewmates", reason: "All impostors were neutralized." };
  }
  if (aliveCrew === 0 || aliveImpostors >= aliveCrew) {
    return {
      winner: "Impostors",
      reason: "Impostors reached player parity and seized control.",
    };
  }
  const totals = computeCrewTaskTotals(playerList);
  if (totals.total > 0 && totals.completed === totals.total) {
    return {
      winner: "Crewmates",
      reason: "Every critical task was completed before sabotage spiked.",
    };
  }
  return null;
};

export default function Home() {
  const [playerName, setPlayerName] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [impostorCount, setImpostorCount] = useState(1);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [showRole, setShowRole] = useState(false);
  const [missionLog, setMissionLog] = useState<string[]>([]);
  const [selectedSuspect, setSelectedSuspect] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const logEvent = useCallback((entry: string) => {
    const stamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    setMissionLog((prev) => [`[${stamp}] ${entry}`, ...prev].slice(0, 18));
  }, []);

  const aliveCrew = useMemo(
    () =>
      players.filter(
        (player) =>
          player.status === "alive" &&
          (player.role === "Crewmate" || player.role === "Analyst"),
      ),
    [players],
  );

  const aliveImpostors = useMemo(
    () =>
      players.filter(
        (player) => player.status === "alive" && player.role === "Impostor",
      ),
    [players],
  );

  const crewTaskTotals = useMemo(() => {
    const totals = computeCrewTaskTotals(players);
    const percent =
      totals.total === 0
        ? 0
        : Math.round((totals.completed / totals.total) * 100);
    return { ...totals, percent };
  }, [players]);
  const maximumImpostors = getMaxImpostors(players.length);
  const impostorOptions = Array.from({ length: maximumImpostors }, (_, index) => index + 1);
  const impostorValue = Math.min(impostorCount, maximumImpostors);
  const effectivePhase: Phase =
    outcome && phase !== "lobby" && phase !== "reveal" ? "ended" : phase;

  const syncOutcome = useCallback(
    (nextPlayers: Player[], nextPhase: Phase = phase) => {
      if (nextPhase === "lobby" || nextPhase === "reveal") {
        if (outcome) {
          setOutcome(null);
        }
        return;
      }
      const evaluated = evaluateOutcome(nextPlayers);
      if (
        evaluated &&
        (!outcome ||
          evaluated.winner !== outcome.winner ||
          evaluated.reason !== outcome.reason)
      ) {
        setOutcome(evaluated);
        logEvent(
          `${evaluated.winner} locked the round — ${evaluated.reason}`,
        );
      } else if (!evaluated && outcome) {
        setOutcome(null);
      }
    },
    [phase, outcome, logEvent],
  );

  const handleAddPlayer = () => {
    const trimmed = playerName.trim();
    if (!trimmed) {
      setError("Enter a player name before adding.");
      return;
    }
    if (
      players.some(
        (player) => player.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      setError("That player name is already in the lobby.");
      return;
    }
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      name: trimmed,
      role: "Crewmate",
      tasks: [],
      status: "alive",
      cardSeen: false,
    };
    setPlayers((prev) => [...prev, newPlayer]);
    setPlayerName("");
    setError(null);
  };

  const handleRemovePlayer = (id: string) => {
    const nextPlayers = players.filter((player) => player.id !== id);
    setPlayers(nextPlayers);
    const nextMax = getMaxImpostors(nextPlayers.length);
    if (impostorCount > nextMax) {
      setImpostorCount(nextMax);
    }
    if (!nextPlayers.length) {
      setPhase("lobby");
      setOutcome(null);
      setMissionLog([]);
      setPrompt(null);
      setSelectedSuspect(null);
      setActiveCardIndex(0);
      setShowRole(false);
    } else {
      syncOutcome(nextPlayers, phase);
    }
  };

  const handleResetLobby = () => {
    setPlayers([]);
    setMissionLog([]);
    setPhase("lobby");
    setOutcome(null);
    setActiveCardIndex(0);
    setShowRole(false);
    setPrompt(null);
    setSelectedSuspect(null);
    setError(null);
    setImpostorCount(1);
  };

  const handleStartRound = () => {
    if (players.length < 4) {
      setError("You need at least 4 players to start a deduction round.");
      return;
    }
    const maxImpostors = getMaxImpostors(players.length);
    const impostorTarget = clamp(impostorCount, 1, maxImpostors);
    const shuffledIds = [...players.map((player) => player.id)].sort(
      () => Math.random() - 0.5,
    );
    const impostorIds = new Set(
      shuffledIds.slice(0, impostorTarget),
    );
    const crewCandidates = shuffledIds.filter((id) => !impostorIds.has(id));
    const analystId =
      players.length >= 6 && crewCandidates.length
        ? crewCandidates[Math.floor(Math.random() * crewCandidates.length)]
        : null;

    const roundPlayers = players.map((player) => {
      let role: Role = impostorIds.has(player.id) ? "Impostor" : "Crewmate";
      if (analystId === player.id) {
        role = "Analyst";
      }
      const tasks =
        role === "Impostor"
          ? getRandomItems(IMPOSTOR_OBJECTIVES, 3).map((item) =>
              buildTask(item, "impostor"),
            )
          : role === "Analyst"
            ? getRandomItems(SUPPORT_ROUTINES, 3).map((item) =>
                buildTask(item, "support"),
              )
            : getRandomItems(CREW_TASK_BANK, 4).map((item) =>
                buildTask(item, "crew"),
              );
      return {
        ...player,
        role,
        tasks,
        status: "alive" as const,
        cardSeen: false,
      };
    });

    setPlayers(roundPlayers);
    setPhase("reveal");
    setOutcome(null);
    setActiveCardIndex(0);
    setShowRole(false);
    setSelectedSuspect(null);
    setPrompt(null);
    setMissionLog([
      `Round armed with ${impostorTarget} impostor${impostorTarget > 1 ? "s" : ""}. Reveal cards privately before continuing.`,
    ]);
    setError(null);
    setImpostorCount(impostorTarget);
  };

  const currentPlayer =
    phase === "reveal" ? players[activeCardIndex] ?? null : null;

  const handleNextCard = () => {
    if (!currentPlayer) return;
    const nextPlayers = players.map((player) =>
      player.id === currentPlayer.id ? { ...player, cardSeen: true } : player,
    );
    setPlayers(nextPlayers);
    setShowRole(false);
    if (activeCardIndex + 1 >= players.length) {
      setPhase("mission");
      logEvent("All cards viewed. Mission control live.");
      syncOutcome(nextPlayers, "mission");
    } else {
      setActiveCardIndex((prev) => prev + 1);
    }
  };

  const skipRemainingReveal = () => {
    if (phase !== "reveal") return;
    const nextPlayers = players.map((player) =>
      player.cardSeen ? player : { ...player, cardSeen: true },
    );
    setPlayers(nextPlayers);
    setPhase("mission");
    setShowRole(false);
    logEvent("Card reveal skipped. Mission control live.");
    syncOutcome(nextPlayers, "mission");
  };

  const handleToggleTask = (playerId: string, taskId: string) => {
    if (effectivePhase === "ended") return;
    const targetPlayer = players.find((player) => player.id === playerId);
    if (!targetPlayer) return;
    const targetTask = targetPlayer.tasks.find((task) => task.id === taskId);
    if (!targetTask) return;
    const updatedTask = { ...targetTask, completed: !targetTask.completed };
    const nextPlayers = players.map((player) => {
      if (player.id !== playerId) return player;
      return {
        ...player,
        tasks: player.tasks.map((task) =>
          task.id === taskId ? updatedTask : task,
        ),
      };
    });
    setPlayers(nextPlayers);
    logEvent(
      `${targetPlayer.name} ${
        updatedTask.completed ? "completed" : "reopened"
      } "${targetTask.name}".`,
    );
    syncOutcome(nextPlayers, phase);
  };

  const handleToggleStatus = (playerId: string) => {
    if (effectivePhase === "ended") return;
    const targetPlayer = players.find((player) => player.id === playerId);
    if (!targetPlayer) return;
    const nextStatus: Player["status"] =
      targetPlayer.status === "alive" ? "eliminated" : "alive";
    const nextPlayers = players.map((player) =>
      player.id === playerId ? { ...player, status: nextStatus } : player,
    );
    setPlayers(nextPlayers);
    logEvent(
      `${targetPlayer.name} is now marked ${
        nextStatus === "alive" ? "safe" : "eliminated"
      }.`,
    );
    syncOutcome(nextPlayers, phase);
  };

  const handleCallMeeting = () => {
    if (phase !== "mission" || outcome) return;
    setPhase("meeting");
    setSelectedSuspect(null);
    logEvent("Emergency meeting called. Resolve accusations swiftly.");
    syncOutcome(players, "meeting");
  };

  const handleEjectSuspect = () => {
    if (!selectedSuspect) {
      setError("Select a suspect before confirming the vote.");
      return;
    }
    let ejectedName = "";
    const nextPlayers = players.map((player) => {
      if (player.id !== selectedSuspect) return player;
      ejectedName = player.name;
      return { ...player, status: "eliminated" as Player["status"] };
    });
    if (ejectedName) {
      setPlayers(nextPlayers);
      logEvent(`${ejectedName} was ejected during the meeting.`);
      syncOutcome(nextPlayers, "mission");
    }
    setSelectedSuspect(null);
    setPhase("mission");
    setError(null);
  };

  const handleSkipVote = () => {
    logEvent("Vote skipped. Mission resumes.");
    setSelectedSuspect(null);
    setPhase("mission");
    syncOutcome(players, "mission");
  };

  const handlePrompt = () => {
    const card =
      PROMPT_DECK[Math.floor(Math.random() * PROMPT_DECK.length)] ?? null;
    setPrompt(card);
    if (card) {
      logEvent(`New prompt drawn: ${card}`);
    }
  };

  const handleResetRound = () => {
    setPlayers((prev) =>
      prev.map((player) => ({
        ...player,
        role: "Crewmate",
        tasks: [],
        status: "alive",
        cardSeen: false,
      })),
    );
    setPhase("lobby");
    setOutcome(null);
    setActiveCardIndex(0);
    setShowRole(false);
    setMissionLog([]);
    setSelectedSuspect(null);
    setPrompt(null);
    setError(null);
  };

  const sortedRoster = useMemo(
    () =>
      [...players].sort((a, b) => {
        if (a.role === b.role) {
          return a.name.localeCompare(b.name);
        }
        if (a.role === "Impostor") return -1;
        if (b.role === "Impostor") return 1;
        if (a.role === "Analyst") return -1;
        if (b.role === "Analyst") return 1;
        return a.name.localeCompare(b.name);
      }),
    [players],
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>Imposter Relay Control Center</h1>
          <p className={styles.heroSubtitle}>
            Host a full social deduction session from a single screen. Add
            players, assign hidden roles, track progress, and resolve emergency
            meetings without a separate rulebook.
          </p>
        </div>
        <div className={styles.phaseBar}>
          <span
            className={cx(
              "tag",
              styles.phaseBadge,
              PHASE_BADGE_TONE[effectivePhase] ?? "",
            )}
          >
            {PHASE_LABELS[effectivePhase]}
          </span>
          {effectivePhase === "mission" && (
            <span className={cx("tag", styles.badgeToneSuccess)}>
              {crewTaskTotals.percent}% crew tasks complete
            </span>
          )}
          {effectivePhase === "meeting" && (
            <span className={cx("tag", styles.badgeToneDanger)}>
              Emergency Meeting
            </span>
          )}
        </div>
        <div className={styles.statsRow}>
          <article className={styles.statBlock}>
            <span className={styles.statLabel}>Players</span>
            <span className={styles.statValue}>{players.length}</span>
          </article>
          <article className={styles.statBlock}>
            <span className={styles.statLabel}>Alive Crew</span>
            <span className={styles.statValue}>{aliveCrew.length}</span>
          </article>
          <article className={styles.statBlock}>
            <span className={styles.statLabel}>Alive Impostors</span>
            <span className={styles.statValue}>{aliveImpostors.length}</span>
          </article>
          <article className={styles.statBlock}>
            <span className={styles.statLabel}>Crew Task %</span>
            <span className={styles.statValue}>
              {crewTaskTotals.percent}%
            </span>
          </article>
        </div>
      </header>

      <div className={styles.mainGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                {effectivePhase === "lobby" && "Build Your Lobby"}
                {effectivePhase === "reveal" && "Card Reveal Deck"}
                {effectivePhase === "mission" && "Mission Control Tracker"}
                {effectivePhase === "meeting" && "Emergency Voting Console"}
                {effectivePhase === "ended" && "Round Summary"}
              </h2>
              <p className={styles.panelDescription}>
                {effectivePhase === "lobby" &&
                  "Add each player, choose your impostor count, and lock in the next social deduction round."}
                {effectivePhase === "reveal" &&
                  "Hand the device to each player privately so they can reveal their role card."}
                {effectivePhase === "mission" &&
                  "Track task completion, mark eliminations, and pull prompt cards to add tension."}
                {effectivePhase === "meeting" &&
                  "Discuss the sabotage, select a suspect, and decide whether to eject or skip."}
                {effectivePhase === "ended" &&
                  "Celebrate victory, review the roster, and reset for the next round."}
              </p>
            </div>
            {effectivePhase === "mission" && (
              <div className={styles.cardControls}>
                <button onClick={handleCallMeeting} disabled={!!outcome}>
                  Call Meeting
                </button>
                <button
                  className="secondary"
                  onClick={handlePrompt}
                  disabled={!!outcome}
                >
                  Draw Prompt
                </button>
              </div>
            )}
            {effectivePhase === "lobby" && players.length > 0 && (
              <div className={styles.cardControls}>
                <button onClick={handleStartRound}>Start Round</button>
                <button className="secondary" onClick={handleResetLobby}>
                  Clear Lobby
                </button>
              </div>
            )}
            {effectivePhase === "ended" && (
              <div className={styles.cardControls}>
                <button onClick={handleResetRound}>Reset for New Round</button>
              </div>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {effectivePhase === "lobby" && (
            <>
              <div className={styles.lobbyForm}>
                <input
                  placeholder="Enter player name"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddPlayer();
                    }
                  }}
                />
                <button onClick={handleAddPlayer}>Add Player</button>
              </div>

              <div className={styles.lobbyControls}>
                <div className={styles.counter}>
                  <label htmlFor="impostor-count">Impostors</label>
                  <select
                    id="impostor-count"
                    value={impostorValue}
                    onChange={(event) =>
                      setImpostorCount(
                        Number.parseInt(event.target.value, 10) || 1,
                      )
                    }
                  >
                    {impostorOptions.map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.counter}>
                  <label>Round Status</label>
                  <div className="tag">Awaiting launch</div>
                </div>
              </div>

              {players.length === 0 ? (
                <div className={styles.emptyState}>
                  No players yet. Add at least four names to launch a round.
                </div>
              ) : (
                <div className={styles.playerGrid}>
                  {players.map((player) => (
                    <article className={styles.playerCard} key={player.id}>
                      <div className={styles.playerName}>
                        <span>{player.name}</span>
                        <button
                          className="secondary"
                          onClick={() => handleRemovePlayer(player.id)}
                        >
                          Remove
                        </button>
                      </div>
                      <p className={styles.panelDescription}>
                        Ready for role assignment.
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {phase === "reveal" && currentPlayer && (
            <div className={styles.revealCard}>
              <div>
                <p className={styles.revealHeadline}>
                  Pass device to <strong>{currentPlayer.name}</strong>
                </p>
                <p className={styles.revealHint}>
                  Tap reveal to show their secret role, then continue to the next
                  player.
                </p>
              </div>
              {showRole ? (
                <div>
                  <p className={styles.revealRole}>{currentPlayer.role}</p>
                  <p className={styles.revealHint}>
                    {ROLE_DESCRIPTIONS[currentPlayer.role]}
                  </p>
                </div>
              ) : (
                <button onClick={() => setShowRole(true)}>Reveal Role</button>
              )}
              <div className={styles.cardControls}>
                <button
                  className="secondary"
                  onClick={() => setShowRole(false)}
                  disabled={!showRole}
                >
                  Hide Role
                </button>
                <button onClick={handleNextCard}>Next Player</button>
                <button className="secondary" onClick={skipRemainingReveal}>
                  Skip Remainder
                </button>
              </div>
            </div>
          )}

          {effectivePhase === "mission" && (
            <>
              {players.length === 0 ? (
                <div className={styles.emptyState}>
                  No players available. Reset to lobby and add players.
                </div>
              ) : (
                <>
                  <div className={styles.progressStack}>
                    <div className={styles.utilityRow}>
                      <span>Mission status</span>
                      <span>
                        {crewTaskTotals.completed} / {crewTaskTotals.total} tasks
                        complete
                      </span>
                    </div>
                    <div className={styles.progressBar}>
                      <span
                        className={styles.progressValue}
                        style={{ width: `${crewTaskTotals.percent}%` }}
                      />
                    </div>
                  </div>
                  <div className={styles.playerGrid}>
                    {players.map((player) => (
                      <article className={styles.playerCard} key={player.id}>
                        <div className={styles.playerName}>
                          <span>{player.name}</span>
                          <span
                            className={cx(
                              styles.roleBadge,
                              ROLE_CLASS_MAP[player.role],
                            )}
                          >
                            {player.role}
                          </span>
                        </div>
                        <div className={styles.taskMeta}>
                          <span
                            className={cx(
                              styles.status,
                              player.status === "alive"
                                ? styles.statusAlive
                                : styles.statusEliminated,
                            )}
                          >
                            {player.status === "alive"
                              ? "On mission"
                              : "Eliminated"}
                          </span>
                          <button
                            className="secondary"
                            onClick={() => handleToggleStatus(player.id)}
                            disabled={!!outcome}
                          >
                            Toggle status
                          </button>
                        </div>
                        {player.tasks.length === 0 ? (
                          <p className={styles.muted}>
                            No objectives assigned for this role.
                          </p>
                        ) : (
                          <div className={styles.taskList}>
                            {player.tasks.map((task) => (
                              <label className={styles.taskItem} key={task.id}>
                                <input
                                  type="checkbox"
                                  className={styles.taskAction}
                                  checked={task.completed}
                                  onChange={() =>
                                    handleToggleTask(player.id, task.id)
                                  }
                                  disabled={
                                    player.status !== "alive" || !!outcome
                                  }
                                />
                                <div>
                                  <p
                                    className={cx(
                                      styles.taskName,
                                      task.completed && styles.taskNameCompleted,
                                    )}
                                  >
                                    {task.name}
                                  </p>
                                  <div className={styles.taskMeta}>
                                    <span>
                                      {task.kind === "crew" && "Crew Task"}
                                      {task.kind === "support" && "Intel Task"}
                                      {task.kind === "impostor" && "Secret Play"}
                                    </span>
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {effectivePhase === "meeting" && (
            <>
              <div className={styles.meetingGrid}>
                {players.map((player) => (
                  <button
                    key={player.id}
                    className={cx(
                      styles.suspectButton,
                      selectedSuspect === player.id && styles.suspectButtonSelected,
                    )}
                    onClick={() =>
                      setSelectedSuspect(
                        selectedSuspect === player.id ? null : player.id,
                      )
                    }
                    disabled={!!outcome}
                  >
                    <strong>{player.name}</strong>
                    <span className={styles.muted}>
                      {player.status === "alive"
                        ? "Currently active"
                        : "Marked eliminated"}
                    </span>
                    <span
                      className={cx(
                        styles.roleBadge,
                        ROLE_CLASS_MAP[player.role],
                      )}
                    >
                      {player.role}
                    </span>
                  </button>
                ))}
              </div>
              <div className={styles.meetingActions}>
                <button onClick={handleEjectSuspect} disabled={!!outcome}>
                  Confirm ejection
                </button>
                <button
                  className="secondary"
                  onClick={handleSkipVote}
                  disabled={!!outcome}
                >
                  Skip vote
                </button>
              </div>
            </>
          )}

          {effectivePhase === "ended" && outcome && (
            <div className={styles.outcomeCard}>
              <div>
                <p className={styles.outcomeWinner}>{outcome.winner} win</p>
                <p className={styles.outcomeReason}>{outcome.reason}</p>
              </div>
              <div className={styles.outcomeRoster}>
                {sortedRoster.map((player) => (
                  <span key={player.id}>
                    <strong>{player.name}</strong> — {player.role},{" "}
                    {player.status === "alive" ? "survived" : "eliminated"}
                  </span>
                ))}
              </div>
              <div className={styles.cardControls}>
                <button onClick={handleResetRound}>Set up next round</button>
                <button className="secondary" onClick={handleResetLobby}>
                  Back to empty lobby
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className={styles.panel}>
          <div>
            <h3 className={styles.panelTitle}>Mission Log</h3>
            <p className={styles.panelDescription}>
              Snapshot of critical events. The newest entries sit at the top.
            </p>
          </div>
          {missionLog.length === 0 ? (
            <div className={styles.emptyState}>
              Mission feed idle. Progress updates will appear here once the
              round is in motion.
            </div>
          ) : (
            <div className={styles.logList}>
              {missionLog.map((entry, index) => (
                <div className={styles.logEntry} key={entry + index}>
                  {entry}
                </div>
              ))}
            </div>
          )}

          <div>
            <h3 className={styles.panelTitle}>Prompt Deck</h3>
            <p className={styles.panelDescription}>
              Pull a tension card to shake up the mission flow.
            </p>
            <div className={styles.promptCard}>
              <p>{prompt ?? "No prompt drawn yet. Press the button below."}</p>
              <button onClick={handlePrompt}>Draw prompt</button>
            </div>
          </div>

          <div>
            <h3 className={styles.panelTitle}>Quick Reset</h3>
            <p className={styles.panelDescription}>
              Need a fresh start? Reset the current round or wipe the lobby.
            </p>
            <div className={styles.cardControls}>
              <button className="secondary" onClick={handleResetRound}>
                Reset round
              </button>
              <button className="secondary" onClick={handleResetLobby}>
                Clear lobby
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
