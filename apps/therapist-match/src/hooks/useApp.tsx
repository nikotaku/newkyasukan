import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_THERAPIST_ID, SEED_STORES, seedTherapists } from "@/data/seed";
import { toDateKey } from "@/lib/format";
import type { Application, ApplicationStatus, Stage, Store, StoreStatus, Therapist } from "@/lib/types";

// 試作版：データはこのブラウザの localStorage にだけ保存する（サーバーには送らない）
const STORAGE_KEY = "bloom-prototype-v1";

interface State {
  therapists: Therapist[];
  stores: Store[];
  meId: string | null;
}

export type RegisterInput = Omit<Therapist, "id" | "createdAt" | "stage" | "coachId" | "applications" | "lessonsDone">;

interface AppContextValue extends State {
  me: Therapist | null;
  register: (input: RegisterInput) => void;
  enterDemoAccount: () => void;
  signOut: () => void;
  applyToStore: (storeId: string) => void;
  toggleLesson: (lessonId: string) => void;
  setStage: (therapistId: string, stage: Stage) => void;
  setCoach: (therapistId: string, coachId: string | null) => void;
  setApplicationStatus: (therapistId: string, storeId: string, status: ApplicationStatus) => void;
  setStoreStatus: (storeId: string, status: StoreStatus) => void;
  resetDemo: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function initialState(): State {
  return { therapists: seedTherapists(), stores: SEED_STORES, meId: null };
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as State;
    if (!Array.isArray(parsed.therapists) || !Array.isArray(parsed.stores)) return initialState();
    return parsed;
  } catch {
    return initialState();
  }
}

// 応募の進み具合から、運営の管理画面で見る段階を決める
function stageFromApplications(current: Stage, applications: Application[]): Stage {
  if (current === "定着" || current === "離脱") return current;
  const statuses = applications.map((a) => a.status);
  if (statuses.includes("在籍")) return "在籍";
  if (statuses.includes("体験入店")) return "体験入店";
  if (statuses.some((s) => s === "応募済" || s === "面接調整中")) return "応募中";
  return current;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 保存できない環境（プライベートブラウズなど）でも画面はそのまま使える
    }
  }, [state]);

  const updateTherapist = useCallback((id: string, update: (t: Therapist) => Therapist) => {
    setState((s) => ({ ...s, therapists: s.therapists.map((t) => (t.id === id ? update(t) : t)) }));
  }, []);

  const register = useCallback((input: RegisterInput) => {
    const id = `t-${Date.now().toString(36)}`;
    const therapist: Therapist = {
      ...input,
      id,
      createdAt: toDateKey(new Date()),
      stage: "新規登録",
      coachId: null,
      applications: [],
      lessonsDone: [],
    };
    setState((s) => ({ ...s, therapists: [therapist, ...s.therapists], meId: id }));
  }, []);

  const applyToStore = useCallback(
    (storeId: string) => {
      setState((s) => {
        if (!s.meId) return s;
        return {
          ...s,
          therapists: s.therapists.map((t) => {
            if (t.id !== s.meId || t.applications.some((a) => a.storeId === storeId)) return t;
            const applications = [...t.applications, { storeId, status: "応募済" as const, updatedAt: toDateKey(new Date()) }];
            return { ...t, applications, stage: stageFromApplications(t.stage, applications) };
          }),
        };
      });
    },
    [],
  );

  const toggleLesson = useCallback((lessonId: string) => {
    setState((s) => {
      if (!s.meId) return s;
      return {
        ...s,
        therapists: s.therapists.map((t) =>
          t.id !== s.meId
            ? t
            : {
                ...t,
                lessonsDone: t.lessonsDone.includes(lessonId) ? t.lessonsDone.filter((id) => id !== lessonId) : [...t.lessonsDone, lessonId],
              },
        ),
      };
    });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      me: state.therapists.find((t) => t.id === state.meId) ?? null,
      register,
      enterDemoAccount: () => setState((s) => ({ ...s, meId: DEMO_THERAPIST_ID })),
      signOut: () => setState((s) => ({ ...s, meId: null })),
      applyToStore,
      toggleLesson,
      setStage: (therapistId, stage) => updateTherapist(therapistId, (t) => ({ ...t, stage })),
      setCoach: (therapistId, coachId) =>
        updateTherapist(therapistId, (t) => ({ ...t, coachId, stage: t.stage === "新規登録" && coachId ? "面談予約" : t.stage })),
      setApplicationStatus: (therapistId, storeId, status) =>
        updateTherapist(therapistId, (t) => {
          const applications = t.applications.map((a) => (a.storeId === storeId ? { ...a, status, updatedAt: toDateKey(new Date()) } : a));
          return { ...t, applications, stage: stageFromApplications(t.stage, applications) };
        }),
      setStoreStatus: (storeId, status) =>
        setState((s) => ({ ...s, stores: s.stores.map((store) => (store.id === storeId ? { ...store, status } : store)) })),
      resetDemo: () => setState(initialState()),
    }),
    [state, register, applyToStore, toggleLesson, updateTherapist],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
