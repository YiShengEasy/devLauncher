import { useLayoutEffect, type DependencyList, type RefObject } from "react";
import gsap from "gsap";

export function useGsapContext(
  scope: RefObject<HTMLElement | null>,
  setup: () => void,
  deps: DependencyList,
) {
  useLayoutEffect(() => {
    if (!scope.current) return;
    const context = gsap.context(setup, scope);
    return () => context.revert();
  }, deps);
}
