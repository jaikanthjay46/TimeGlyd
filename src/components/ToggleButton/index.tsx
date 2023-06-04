import React, { useEffect } from 'react'
import './ToggleButton.scss'



type Props = {
  label: string
  defaultValue: boolean | Promise<boolean>
  onEnable: () => void
  onDisable: () => void
}

const ToggleButton = ({label, onEnable, onDisable, defaultValue}: Props) => {

  const [isEnabled, setIsEnabled] = React.useState(false)
  const toggle = () => {
    setIsEnabled(!isEnabled);
    isEnabled ? onDisable() : onEnable();
  }

  useEffect(() => {
    Promise.resolve(defaultValue).then(function(value) {
      setIsEnabled(value)
    })
  }, [defaultValue])

  return (
    <div>
      <button onClick={toggle} className='button-toggle'>
      <span className={isEnabled ? 'icon icon-check' : 'icon'} ></span>
      {label}</button>
    </div>
  )
}

export default ToggleButton