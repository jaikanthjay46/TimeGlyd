import "./ToggleButton.scss";

type Props = {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void | Promise<void>;
};

const ToggleButton = ({ label, checked, disabled = false, onChange }: Props) => {
  return (
    <button
      type="button"
      onClick={() => void onChange(!checked)}
      className="button-toggle"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
    >
      <span>{label}</span>
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </button>
  );
};

export default ToggleButton;
