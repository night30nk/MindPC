const { BrowserWindow, app } = require("electron");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 400,
    height: 400,
  });

  // win.loadFile("http://localhost:5173/");
  win.loadURL("http://localhost:5173/");
};

app.whenReady().then(() => {
  createWindow();
});
