import React from "react";

const useRequestAnimationFrame = (callback: (deltaTime: number) => void, deps: React.DependencyList) => {
  const requestRef = React.useRef(0);
  const previousTimeRef = React.useRef(0);

  const animate = (time: DOMHighResTimeStamp) => {
    if (previousTimeRef.current) callback(time - previousTimeRef.current);
    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  React.useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, deps);
};

export default useRequestAnimationFrame;
