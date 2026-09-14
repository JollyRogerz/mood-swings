import React, { createContext, type ReactNode } from "react";
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
}: {
  children: ReactNode;
  targets?: Targets;
  className: string;
  reduced: boolean;
}) {
  return (
    <div className={className} data-reduced-motion={reduced || undefined}>
      <Targeting.Provider value={targets}>{children}</Targeting.Provider>
    </div>
  );
}
