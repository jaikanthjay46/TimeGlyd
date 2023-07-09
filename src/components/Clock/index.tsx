import React, { useEffect } from "react";
import { formatTimeNowLux, isSunUpLux } from "../../utils/time";
import { WallClock, settingsManager } from "../../config/settings-manager";
import useRequestAnimationFrame from "../../hooks/useRequestAnimationFrame";

type Props = {
  globalTimeOffsetMinutes: number;
  timezoneOffsetHours: number;
  timeZoneId: string;
  is24Hour: boolean;
  clockName: string;
  id: string;
  updateNewClocks: (clocks: WallClock[]) => void;
};

function Clock({ globalTimeOffsetMinutes, timezoneOffsetHours, timeZoneId, is24Hour, clockName, id, updateNewClocks }: Props) {

  const timeNow = () => formatTimeNowLux(timeZoneId, globalTimeOffsetMinutes, is24Hour)

  const [timeString, setTimeString] = React.useState(timeNow());
  const [isMorning, setIsMorning] = React.useState(true);

  const handleNameUpdate = (newName: string|null) => {
    if (!newName) return;
    
    const clocks = settingsManager.getCache('clocks');
    clocks[parseInt(id)].clockName = newName;
    settingsManager.setCache('clocks', clocks);
    updateNewClocks(clocks);
  }

  const deleteClock = () => {
    const clocks = settingsManager.getCache('clocks');
    clocks.splice(parseInt(id), 1)
    settingsManager.setCache('clocks', clocks);
    updateNewClocks(clocks)
  }

  const updateLoop = () => {
    setTimeString(timeNow());
    setIsMorning(isSunUpLux(timeZoneId, globalTimeOffsetMinutes))
  }

  useEffect(updateLoop, [globalTimeOffsetMinutes, is24Hour])

  useRequestAnimationFrame(updateLoop);


  return (
      <button>
        <time className={isMorning ? "morning":"evening"}>{timeString}</time>
        <span
          className="name"
          onBlur={(e) => handleNameUpdate(e.currentTarget.textContent)}
          contentEditable="true"
          spellCheck="false"
        >
          {clockName}
        </span>
        <span onClick={deleteClock} className="delete"></span>
        {/* <span className="eye"></span> */}
      </button>
  );
}

export default Clock;
