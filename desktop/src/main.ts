import { app, BrowserWindow, globalShortcut, Menu, nativeImage, powerMonitor, shell, Tray } from 'electron'

const WEB_URL = process.env.GRIDPOST_WEB_URL ?? 'https://gridpost.example.com'
const HOTKEY = process.env.GRIDPOST_HOTKEY ?? 'Alt+Shift+P'

let window: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function toggle(): void {
  if (!window) return
  if (window.isVisible() && window.isFocused()) window.hide()
  else {
    window.show()
    window.focus()
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: 'Gridpost',
    backgroundColor: '#121316',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  win.loadURL(WEB_URL)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      win.hide()
    }
  })
  return win
}

app.whenReady().then(() => {
  app.setAppUserModelId('app.gridpost.desktop')
  window = createWindow()

  globalShortcut.register(HOTKEY, toggle)

  tray = new Tray(nativeImage.createFromBuffer(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+7xHDAAAAAElFTkSuQmCC',
    'base64'
  )))
  tray.setToolTip('Gridpost')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Gridpost', click: toggle },
    { label: 'Скрыть', click: () => window?.hide() },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit() } }
  ]))
  tray.on('click', toggle)

  powerMonitor.on('resume', () => window?.webContents.reload())
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) window = createWindow()
  else toggle()
})
