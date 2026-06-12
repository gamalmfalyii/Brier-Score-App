const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('brierApp', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  dataPath: () => ipcRenderer.invoke('data:path'),
  exportCsv: (csv) => ipcRenderer.invoke('csv:export', csv),
  searchNews: (payload) => ipcRenderer.invoke('news:search', payload),
  openLink: (url) => ipcRenderer.invoke('link:open', url)
});
