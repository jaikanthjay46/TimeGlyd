import { useEffect, useRef, useState } from 'react'
import { formatTime, getMinutesFromStartOfDay } from '../../utils/time';
import "./Slider.scss"
import useRequestAnimationFrame from '../../hooks/useRequestAnimationFrame';

type Props = {
  is24Hour: boolean
  onChange: (minuteOffset: number) => void
}

function Slider({ is24Hour, onChange }: Props) {
  const [slider, setSlider] = useState((new Date().getHours() * 60) + new Date().getMinutes());
  const [time, setTime] = useState(formatTime(slider, is24Hour));
  const sliderRef = useRef<HTMLInputElement>(null);
  const userDragging = useRef(false);
 


  const handleOnDrag = (isDragging: boolean) => {    
    if (!isDragging && userDragging.current) {
      const newSliderValue = getMinutesFromStartOfDay();
      setSlider(newSliderValue)
      onChange(0)
      if (sliderRef.current) sliderRef.current.value = newSliderValue.toString();
    }
    
    userDragging.current = isDragging;
  } 

  const handleManualSliderChange = (value: number) => {
    setSlider(value);
    onChange(value - getMinutesFromStartOfDay())
  }

  useEffect(() => {
    setTime(formatTime(slider, is24Hour));
  }, [slider, is24Hour]);


  useRequestAnimationFrame(() => {
    if (userDragging.current) {
      return;
    }
    setSlider(getMinutesFromStartOfDay());
  });


  return (
    <div className='timeTravelSlider'>
      <input ref={sliderRef} onMouseDown={() => handleOnDrag(true)} onMouseLeave={() => handleOnDrag(false)} onChange={(e) => handleManualSliderChange(e.target.valueAsNumber)} name='slider' type='range' min='0' max='1440' step='1'  value={slider}/>
      <span className='now' style={{ left: `${slider / 1440 * 100}%` }}>{ time }</span>      
      <span className='from'>{ is24Hour ? '00:00' : '12:00 AM' }</span>
      <span className='to'>{ is24Hour ? '23:59' : '11:59 PM'  }</span>
      
    </div>
  )
}

export default Slider


