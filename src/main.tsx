import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Clock3,
  Flag,
  Play,
  RotateCcw,
  Save,
  Settings,
  Square,
  Trophy,
} from 'lucide-react';
import { createRoot } from 'react-dom/client';
import './index.css';

type TeamStatus = 'idle' | 'running' | 'finished';
type ViewMode = 'main' | 'settings';

type Team = {
  id: number;
  name: string;
  pullTime: number | null;
  totalTime: number | null;
  status: TeamStatus;
};

const createInitialTeams = (): Team[] =>
  Array.from({ length: 16 }, (_, index) => ({
    id: index + 1,
    name: `Team ${index + 1}`,
    pullTime: null,
    totalTime: null,
    status: 'idle',
  }));

type StoredAppState = {
  teams: Team[];
  activeTeamId: number;
};

const STORAGE_KEY = 'feuerwehr-wettkampf-state';

const isTeamStatus = (status: unknown): status is TeamStatus =>
  status === 'idle' || status === 'running' || status === 'finished';

const normalizeStoredTeams = (value: unknown): Team[] | null => {
  if (!Array.isArray(value)) return null;

  const initialTeams = createInitialTeams();

  return initialTeams.map((fallbackTeam, index) => {
    const storedTeam = value[index];

    if (typeof storedTeam !== 'object' || storedTeam === null) {
      return fallbackTeam;
    }

    const team = storedTeam as Partial<Team>;

    return {
      id: fallbackTeam.id,
      name:
        typeof team.name === 'string' && team.name.trim() !== ''
          ? team.name
          : fallbackTeam.name,
      pullTime: typeof team.pullTime === 'number' ? team.pullTime : null,
      totalTime: typeof team.totalTime === 'number' ? team.totalTime : null,
      status:
        isTeamStatus(team.status) && team.status !== 'running'
          ? team.status
          : 'idle',
    };
  });
};

const loadStoredAppState = (): StoredAppState => {
  const fallbackState: StoredAppState = {
    teams: createInitialTeams(),
    activeTeamId: 1,
  };

  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);

    if (!storedValue) return fallbackState;

    const parsedValue = JSON.parse(storedValue) as Partial<StoredAppState>;
    const teams = normalizeStoredTeams(parsedValue.teams);

    if (!teams) return fallbackState;

    const activeTeamId =
      typeof parsedValue.activeTeamId === 'number' &&
      teams.some((team) => team.id === parsedValue.activeTeamId)
        ? parsedValue.activeTeamId
        : 1;

    return {
      teams,
      activeTeamId,
    };
  } catch {
    return fallbackState;
  }
};

// Hilfsfunktion zur Formatierung der Millisekunden in mm:ss.hh
const formatTime = (ms: number | null | undefined): string => {
  if (ms == null) return '--:--.--';

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);

  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
};

const formatTimeInput = (ms: number | null): string => (ms == null ? '' : formatTime(ms));

const parseTimeInput = (value: string): number | null => {
  const normalizedValue = value.trim().replace(',', '.');

  if (normalizedValue === '') return null;

  const match = normalizedValue.match(/^(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/);

  if (!match) return Number.NaN;

  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = Number(match[2]);
  const milliseconds = match[3] ? Number(match[3].padEnd(3, '0')) : 0;

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(milliseconds)) {
    return Number.NaN;
  }

  if (match[1] && seconds > 59) return Number.NaN;

  return minutes * 60_000 + seconds * 1000 + milliseconds;
};

export default function App() {
  const [storedAppState] = useState(loadStoredAppState);
  const [teams, setTeams] = useState<Team[]>(storedAppState.teams);
  const [activeTeamId, setActiveTeamId] = useState(storedAppState.activeTeamId);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [currentSplitTime, setCurrentSplitTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [view, setView] = useState<ViewMode>('main');
  const [manualPullInput, setManualPullInput] = useState('');
  const [manualTotalInput, setManualTotalInput] = useState('');
  const [isManualTimeEntryOpen, setIsManualTimeEntryOpen] = useState(false);

  const timerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const activeTeam = teams.find((team) => team.id === activeTeamId);

  useEffect(() => {
    const stateToStore: StoredAppState = {
      teams: teams.map((team) =>
        team.status === 'running' ? { ...team, status: 'idle' } : team,
      ),
      activeTeamId,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToStore));
  }, [activeTeamId, teams]);

  const handleStop = useCallback(() => {
    if (startTime === null) return;

    const total = Date.now() - startTime;

    setIsTimerRunning(false);
    setStartTime(null);

    setTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id === activeTeamId
          ? { ...team, totalTime: total, status: 'finished' }
          : team,
      ),
    );
  }, [activeTeamId, startTime]);

  useEffect(() => {
    const handleBuzzerKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;

      event.preventDefault();

      if (isTimerRunning && currentSplitTime !== null) {
        handleStop();
      }
    };

    window.addEventListener('keydown', handleBuzzerKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleBuzzerKeyDown, { capture: true });
    };
  }, [currentSplitTime, handleStop, isTimerRunning]);

  useEffect(() => {
    if (!isTimerRunning || startTime === null) {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }

      return;
    }

    timerRef.current = window.setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 30);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isTimerRunning, startTime]);

  const handleStart = () => {
    if (activeTeam?.status === 'finished') return;

    const now = Date.now();

    setStartTime(now);
    setIsTimerRunning(true);
    setCurrentSplitTime(null);
    setElapsedTime(0);

    setTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id === activeTeamId
          ? { ...team, status: 'running', pullTime: null, totalTime: null }
          : team,
      ),
    );
  };

  const handleSplit = () => {
    if (startTime === null || currentSplitTime !== null) return;

    const split = Date.now() - startTime;

    setCurrentSplitTime(split);

    setTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id === activeTeamId ? { ...team, pullTime: split } : team,
      ),
    );
  };

  const handleResetTeam = (id: number) => {
    if (activeTeamId === id && isTimerRunning) {
      alert('Bitte stoppe zuerst die Zeitmessung!');
      return;
    }

    setTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id === id
          ? { ...team, pullTime: null, totalTime: null, status: 'idle' }
          : team,
      ),
    );

    if (activeTeamId === id) {
      setElapsedTime(0);
      setCurrentSplitTime(null);
      setStartTime(null);
      setManualPullInput('');
      setManualTotalInput('');
      setIsManualTimeEntryOpen(false);
    }
  };

  const handleManualTimeEntryToggle = () => {
    setIsManualTimeEntryOpen((isOpen) => {
      if (!isOpen) {
        setManualPullInput(formatTimeInput(activeTeam?.pullTime ?? null));
        setManualTotalInput(formatTimeInput(activeTeam?.totalTime ?? null));
      }

      return !isOpen;
    });
  };

  const handleManualTimeSave = () => {
    const pullTime = parseTimeInput(manualPullInput);
    const totalTime = parseTimeInput(manualTotalInput);

    if (Number.isNaN(pullTime) || Number.isNaN(totalTime) || totalTime === null) {
      alert('Bitte gib eine gültige Gesamtzeit ein, z. B. 1:23.45 oder 83,45.');
      return;
    }

    if (pullTime !== null && pullTime > totalTime) {
      alert('Die TLF-Zeit darf nicht größer als die Gesamtzeit sein.');
      return;
    }

    setTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id === activeTeamId
          ? { ...team, pullTime, totalTime, status: 'finished' }
          : team,
      ),
    );

    setCurrentSplitTime(pullTime);
    setElapsedTime(totalTime);
    setIsManualTimeEntryOpen(false);
  };

  const sortedTeams = [...teams].sort((a, b) => {
    if (a.totalTime !== null && b.totalTime !== null) {
      return a.totalTime - b.totalTime;
    }

    if (a.totalTime !== null) return -1;
    if (b.totalTime !== null) return 1;

    if (a.status === 'running') return -1;
    if (b.status === 'running') return 1;

    return a.id - b.id;
  });
  const displayedSplitTime = isTimerRunning ? currentSplitTime : activeTeam?.pullTime ?? null;

  if (view === 'settings') {
    return (
      <div className="min-h-screen bg-gray-900 p-6 font-sans text-white md:p-12">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-900/30 bg-gray-800 p-8 shadow-2xl">
          <div className="mb-8 flex items-center justify-between border-b border-gray-700 pb-4">
            <h1 className="flex items-center text-3xl font-bold text-red-500">
              <Settings className="mr-3" size={32} />
              Teamnamen bearbeiten
            </h1>

            <button
              type="button"
              onClick={() => setView('main')}
              className="flex items-center rounded-lg bg-red-600 px-6 py-2 font-semibold text-white shadow-md transition-colors hover:bg-red-700"
            >
              <Save className="mr-2" size={20} />
              Zurück & Speichern
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {teams.map((team) => (
              <div
                key={team.id}
                className="flex flex-col rounded-xl border border-gray-600 bg-gray-700/50 p-4"
              >
                <label className="mb-1 text-sm font-medium text-gray-400">
                  Team {team.id}
                </label>

                <input
                  type="text"
                  value={team.name}
                  onChange={(event) =>
                    setTeams((currentTeams) =>
                      currentTeams.map((currentTeam) =>
                        currentTeam.id === team.id
                          ? { ...currentTeam, name: event.target.value }
                          : currentTeam,
                      ),
                    )
                  }
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2 text-white transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-gray-900 p-4 font-sans text-gray-100 selection:bg-red-500/30 md:p-6">
      <button
        type="button"
        onClick={() => setView('settings')}
        className="absolute bottom-2 left-2 z-50 rounded-full p-2 text-gray-800 transition-colors hover:text-gray-500"
        title="Teams verwalten"
      >
        <Settings size={20} />
      </button>

      <div className="grid h-full min-h-0 w-full max-w-[100vw] grow grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex h-full flex-col lg:col-span-4 xl:col-span-5">
          <div className="flex h-full flex-col rounded-3xl border border-gray-700/50 bg-gray-800 p-5 shadow-xl md:p-6">
            <h2 className="mb-6 flex shrink-0 items-center border-b border-gray-700 pb-4 text-2xl font-black uppercase tracking-tight text-white xl:text-3xl">
              <Trophy className="mr-3 text-red-500" size={32} />
              Zug auf Zeit
            </h2>

            <div className="mb-4 shrink-0">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Aktuelles Team auswählen
              </label>

              <select
                value={activeTeamId}
                onChange={(event) => {
                  setActiveTeamId(Number(event.target.value));
                  setIsManualTimeEntryOpen(false);
                }}
                disabled={isTimerRunning}
                className="w-full appearance-none rounded-xl border-2 border-gray-700 bg-gray-900 px-4 py-2 text-lg text-white transition-all focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} {team.totalTime !== null ? '(Fertig)' : ''}
                  </option>
                ))}
              </select>

              {isTimerRunning && (
                <p className="mt-1 flex items-center text-xs text-red-400">
                  <AlertCircle size={12} className="mr-1" />
                  Wechseln gesperrt.
                </p>
              )}
            </div>

            <div className="relative mb-6 flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-gray-800 bg-gray-900 p-4 shadow-inner md:p-6">
              {isTimerRunning && (
                <div className="absolute inset-0 animate-pulse rounded-2xl bg-red-600/5" />
              )}

              <span className="relative z-10 py-2 font-mono text-6xl font-bold leading-none tracking-tighter text-white drop-shadow-md lg:text-7xl xl:text-8xl">
                {formatTime(isTimerRunning ? elapsedTime : activeTeam?.totalTime ?? 0)}
              </span>

              <div className="relative z-10 mt-2 flex flex-col items-center gap-1">
                <span className="text-xs font-medium uppercase tracking-widest text-gray-400">
                  Zwischenzeit (TLF)
                </span>

                <span
                  className={`font-mono text-xl font-bold lg:text-2xl ${
                    displayedSplitTime !== null ? 'text-yellow-400' : 'text-gray-600'
                  }`}
                >
                  {formatTime(displayedSplitTime)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-3">
              {!isTimerRunning ? (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={activeTeam?.status === 'finished'}
                  className="group flex w-full items-center justify-center rounded-xl bg-green-600 py-4 text-2xl font-bold text-white shadow-[0_0_20px_rgba(22,163,74,0.3)] transition-all hover:bg-green-500 hover:shadow-[0_0_25px_rgba(22,163,74,0.5)] active:scale-[0.98] disabled:bg-gray-700 disabled:text-gray-500"
                >
                  <Play className="mr-3 transition-transform group-hover:scale-110" size={28} />
                  START
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSplit}
                    disabled={currentSplitTime !== null}
                    className="flex w-full items-center justify-center rounded-xl bg-yellow-600 py-3 text-lg font-bold text-white shadow-lg transition-all hover:bg-yellow-500 active:scale-[0.98] disabled:bg-gray-700 disabled:text-gray-500"
                  >
                    <Flag className="mr-3" size={24} />
                    AUTO GEZOGEN
                  </button>

                  <button
                    type="button"
                    onClick={handleStop}
                    disabled={currentSplitTime === null}
                    className="group flex w-full items-center justify-center rounded-xl bg-red-600 py-4 text-2xl font-bold text-white shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all hover:bg-red-500 hover:shadow-[0_0_25px_rgba(220,38,38,0.5)] active:scale-[0.98] disabled:bg-gray-700 disabled:text-gray-500"
                    title={currentSplitTime === null ? 'Bitte erst Zwischenzeit stoppen!' : ''}
                  >
                    <Square className="mr-3 transition-transform group-hover:scale-110" size={28} />
                    STOPP
                  </button>
                </>
              )}
            </div>

            {activeTeam?.status !== 'idle' && !isTimerRunning && (
              <div className="mt-auto border-t border-gray-700 pt-4">
                <button
                  type="button"
                  onClick={() => handleResetTeam(activeTeamId)}
                  className="flex w-full items-center justify-center rounded-lg border border-gray-600 bg-gray-800 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
                >
                  <RotateCcw className="mr-2" size={14} />
                  Zeit zurücksetzen
                </button>
              </div>
            )}

            <div className="mt-3 shrink-0">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleManualTimeEntryToggle}
                  disabled={isTimerRunning}
                  aria-label="Manuelle Zeiteingabe umschalten"
                  title="Manuelle Zeiteingabe"
                  className="rounded-full border border-gray-700 bg-gray-900/70 p-2 text-gray-600 transition-colors hover:border-gray-600 hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Clock3 size={18} />
                </button>
              </div>

              {isManualTimeEntryOpen && (
                <div className="mt-3 rounded-2xl border border-gray-700 bg-gray-900/80 p-4">
                  <h3 className="mb-3 flex items-center text-sm font-bold uppercase tracking-wider text-gray-300">
                    <Clock3 className="mr-2 text-red-400" size={16} />
                    Zeiten manuell eintragen
                  </h3>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                      TLF-Zeit
                      <input
                        type="text"
                        inputMode="decimal"
                        value={manualPullInput}
                        onChange={(event) => setManualPullInput(event.target.value)}
                        disabled={isTimerRunning}
                        placeholder="optional"
                        className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-base text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </label>

                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Gesamtzeit
                      <input
                        type="text"
                        inputMode="decimal"
                        value={manualTotalInput}
                        onChange={(event) => setManualTotalInput(event.target.value)}
                        disabled={isTimerRunning}
                        placeholder="z. B. 1:23.45"
                        className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-base text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleManualTimeSave}
                    disabled={isTimerRunning}
                    className="mt-3 flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-md transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
                  >
                    <Save className="mr-2" size={16} />
                    Zeit eintragen
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex h-full min-h-0 flex-col lg:col-span-8 xl:col-span-7">
          <div className="flex grow flex-col overflow-hidden rounded-3xl border border-gray-700/50 bg-gray-800 shadow-xl">
            <div className="shrink-0 p-5 pb-2 md:p-6">
              <h2 className="flex items-center text-2xl font-bold text-white">
                <Trophy className="mr-3 text-yellow-500" size={28} />
                Live Tabelle
              </h2>
            </div>

            <div className="grow overflow-hidden px-5 pb-4 md:px-6">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-gray-700 text-xs uppercase tracking-wider text-gray-400">
                    <th className="w-16 pb-2 pl-4 font-semibold">Pl.</th>
                    <th className="pb-2 font-semibold">Team Name</th>
                    <th className="pb-2 text-right font-semibold">Ziehen (TLF)</th>
                    <th className="pb-2 pr-4 text-right font-semibold text-white">
                      Gesamtzeit
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-700/50">
                  {sortedTeams.map((team, index) => {
                    const isRunning = team.status === 'running';
                    const isFinished = team.status === 'finished';
                    const isFirst = index === 0 && isFinished;

                    return (
                      <tr
                        key={team.id}
                        className={`group border-l-4 transition-colors duration-300 ${
                          isRunning ? 'bg-red-900/30' : 'hover:bg-gray-700/40'
                        } ${
                          activeTeamId === team.id
                            ? 'border-l-red-500'
                            : 'border-l-transparent'
                        }`}
                      >
                        <td className="py-2.5 pl-4">
                          {isFinished ? (
                            isFirst ? (
                              <span className="inline-flex size-7 items-center justify-center rounded-full bg-yellow-500/20 text-sm font-bold text-yellow-500">
                                1
                              </span>
                            ) : (
                              <span className="ml-2 text-sm font-bold text-gray-300">
                                {index + 1}
                              </span>
                            )
                          ) : (
                            <span className="ml-2 text-gray-600">-</span>
                          )}
                        </td>

                        <td className="py-2.5">
                          <span
                            className={`text-base font-semibold xl:text-lg ${
                              isRunning
                                ? 'text-red-400'
                                : isFinished
                                  ? 'text-white'
                                  : 'text-gray-500'
                            }`}
                          >
                            {team.name}
                          </span>

                          {isRunning && (
                            <span className="ml-3 inline-flex items-center rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-red-400 animate-pulse">
                              Läuft
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 text-right font-mono text-sm text-gray-400 xl:text-base">
                          {isRunning && currentSplitTime === null ? (
                            <span className="opacity-50">--:--.--</span>
                          ) : (
                            formatTime(team.pullTime)
                          )}
                        </td>

                        <td className="py-2.5 pr-4 text-right">
                          <span
                            className={`font-mono text-lg font-bold xl:text-xl ${
                              isRunning
                                ? 'text-white'
                                : isFinished
                                  ? 'text-yellow-400'
                                  : 'text-gray-600'
                            }`}
                          >
                            {isRunning ? formatTime(elapsedTime) : formatTime(team.totalTime)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);