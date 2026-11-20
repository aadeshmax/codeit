import { useEffect, useState } from "react";
import { useMotionValue, useSpring } from "framer-motion";

export function useCountUp(target: number): number {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, {
    stiffness: 180,
    damping: 26,
    mass: 0.8
  });
  const [display, setDisplay] = useState<number>(0);

  useEffect(() => {
    mv.set(target);
  }, [mv, target]);

  useEffect(() => {
    const unsubscribe = spring.on("change", (latest) => {
      setDisplay(Math.round(latest));
    });
    return unsubscribe;
  }, [spring]);

  return display;
}
