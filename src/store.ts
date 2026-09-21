import { useEffect, useReducer, useRef, type Dispatch as RDispatch } from "react";
import { AppState } from "./types";
import { createInitialState, reducer } from "./domain";

export type StoreDispatch = RDispatch<Parameters<typeof reducer>[1]>;

const STORAGE_KEY = "hxwl-01-fitting-loop-v1";

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as AppState;
    // 基本结构校验，损坏则回退演示数据
    if (!parsed.appointments || !parsed.counters) return createInitialState();
    return { ...parsed, notice: null };
  } catch {
    return createInitialState();
  }
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储失败不影响内存中的操作
    }
  }, [state]);

  return { state, dispatch };
}
