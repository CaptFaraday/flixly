import './Keyboard.css';
import { useFocusable } from '../nav/useFocusable';

interface Props {
  onChar: (c: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSpace: () => void;
}

const ROW_1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
const ROW_2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
const ROW_3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];

export function Keyboard({ onChar, onBackspace, onClear, onSpace }: Props) {
  return (
    <div className="keyboard">
      <div className="keyboard__row">{ROW_1.map((c) => <Key key={c} char={c} onActivate={() => onChar(c)} />)}</div>
      <div className="keyboard__row">{ROW_2.map((c) => <Key key={c} char={c} onActivate={() => onChar(c)} />)}</div>
      <div className="keyboard__row">{ROW_3.map((c) => <Key key={c} char={c} onActivate={() => onChar(c)} />)}</div>
      <div className="keyboard__row keyboard__row--special">
        <SpecialKey id="kbd-backspace" label="⌫" onActivate={onBackspace} />
        <SpecialKey id="kbd-space" label="Space" wide onActivate={onSpace} />
        <SpecialKey id="kbd-clear" label="Clear" onActivate={onClear} />
      </div>
    </div>
  );
}

function Key({ char, onActivate }: { char: string; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ id: `kbd-${char}`, onActivate });
  return <span ref={ref as any} {...rest} className="keyboard__key">{char}</span>;
}

function SpecialKey({ id, label, wide, onActivate }: { id: string; label: string; wide?: boolean; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ id, onActivate });
  return (
    <span ref={ref as any} {...rest} className={`keyboard__key keyboard__key--special${wide ? ' keyboard__key--wide' : ''}`}>
      {label}
    </span>
  );
}
