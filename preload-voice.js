const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voice', {
  offer: (sdp) => ipcRenderer.invoke('voice:offer', sdp),
  tool: (name, args) => ipcRenderer.invoke('voice:tool', name, args),
  state: (state, text) => ipcRenderer.send('voice:state', { state, text }),
  log: (m) => ipcRenderer.send('voice:log', String(m)),
  onCmd: (cb) => ipcRenderer.on('voice:cmd', (_e, c) => cb(c)),
});
