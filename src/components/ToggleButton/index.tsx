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
      aria-pressed={checked}
      disabled={disabled}
    >
      <span
        className={checked ? "icon icon-check" : "icon"}
        aria-hidden="true"
      />
      {label}
    </button>
  );
};

export default ToggleButton;
