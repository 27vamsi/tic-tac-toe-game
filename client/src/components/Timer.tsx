import { useState, useEffect } from "react";

interface TimerProps {
  deadline: number; // epoch ms
  active: boolean;
  label?: string;
  urgent?: boolean;
}

export function Timer({ deadline, active, label, urgent: forceUrgent }: TimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!active || deadline === 0) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };

    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [deadline, active]);

  if (!active || deadline === 0) return null;

  const urgent = forceUrgent || secondsLeft <= 10;

  return (
    <div className={`timer ${urgent ? "timer-urgent" : ""}`}>
      <span className="timer-icon">⏱</span>
      {label && <span className="timer-label">{label}</span>}
      <span className="timer-value">{secondsLeft}s</span>
    </div>
  );
}
