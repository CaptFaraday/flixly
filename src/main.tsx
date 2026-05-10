import './theme/tokens.css';
import './theme/animations.css';
import { render } from 'preact';
import { App } from './App';

render(<App />, document.getElementById('app')!);
