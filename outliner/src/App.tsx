// Lattice Outliner — App shell

import { Sidebar } from './Sidebar';
import { Editor } from './Editor';

export function App() {
  return (
    <div class="app">
      <Sidebar />
      <Editor />
    </div>
  );
}
