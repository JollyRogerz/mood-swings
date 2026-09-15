import React, { createContext, type ReactNode } from "react";
import { EffectContext, type EffectChange } from "./effects";
import type { Option } from "../game/types";
export interface Targets {
  options: Option[];
  selected: string[];
  toggle: (id: string) => void;
}
export const Targeting = createContext<Targets | undefined>(undefined);

export function TableFrame({
  children,
  targets,
  className,
  reduced,
  effects = [],
}: {
  children: ReactNode;
  targets?: Targets;
  className: string;
  reduced: boolean;
  effects?: EffectChange[];
}) {
  return (
    <div className={className} data-reduced-motion={reduced || undefined}>
      <EffectContext.Provider value={effects}>
        <Targeting.Provider value={targets}>{children}</Targeting.Provider>
      </EffectContext.Provider>
    </div>
  );
}
