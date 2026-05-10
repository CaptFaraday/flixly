import './Settings.css';
import { useFocusable } from '../nav/useFocusable';
import { settings, setSetting } from '../state/store';
import type { Settings as SettingsT } from '../types';
import { TopNav } from '../components/TopNav';

export function Settings({ onNavigate }: { onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void }) {
  const s = settings.value;
  return (
    <>
      <TopNav current="settings" onNavigate={onNavigate} />
      <div className="settings">
        <h1 className="settings__title">Settings</h1>
        <RDKeyField value={s.rd_api_key} />
        <ToggleField label="Prefer 4K when available" value={s.prefer_4k} onChange={(v) => setSetting('prefer_4k', v)} />
        <SelectField
          label="Audio language"
          value={s.audio_language}
          options={[['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['ja', '日本語'], ['any', 'Any']]}
          onChange={(v) => setSetting('audio_language', v as SettingsT['audio_language'])}
        />
        <ToggleField
          label="Require subtitles"
          value={s.require_subtitles}
          onChange={(v) => setSetting('require_subtitles', v)}
        />
      </div>
    </>
  );
}

function RDKeyField({ value }: { value: string }) {
  const { ref, ...rest } = useFocusable({
    id: 'set-rd-key',
    onActivate: () => {
      const next = window.prompt('Real-Debrid API key', value);
      if (next != null) setSetting('rd_api_key', next.trim());
    },
  });
  const masked = value ? `${value.slice(0, 4)}…${value.slice(-4)}` : '(not set)';
  return (
    <div className="settings__field">
      <div className="settings__label">Real-Debrid API key</div>
      <div ref={ref as any} {...rest} className="settings__value">{masked}</div>
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { ref, ...rest } = useFocusable({ id: `toggle-${label}`, onActivate: () => onChange(!value) });
  return (
    <div className="settings__field">
      <div className="settings__label">{label}</div>
      <div ref={ref as any} {...rest} className="settings__value">{value ? 'On' : 'Off'}</div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (v: string) => void;
}) {
  const { ref, ...rest } = useFocusable({
    id: `select-${label}`,
    onActivate: () => {
      const idx = options.findIndex(([v]) => v === value);
      const next = options[(idx + 1) % options.length];
      onChange(next[0]);
    },
  });
  const display = options.find(([v]) => v === value)?.[1] ?? value;
  return (
    <div className="settings__field">
      <div className="settings__label">{label}</div>
      <div ref={ref as any} {...rest} className="settings__value">{display}</div>
    </div>
  );
}
