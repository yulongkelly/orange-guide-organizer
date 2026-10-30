const status = document.querySelector("#status");
const connectButton = document.querySelector("#connect");
connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  status.textContent = "正在连接…如果 Chrome 询问权限，请选择“允许”。";
  try {
    const granted = await chrome.permissions.request({ origins: ["http://localhost/*"], permissions: ["scripting"] });
    if (!granted) {
      status.textContent = "还没有允许连接。这不会影响原来的攻略功能；准备好时重新点按钮并选择“允许”即可。";
      return;
    }
    const response = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Ollama 没有正常响应");
    const data = await response.json();
    const found = (data.models || []).some((model) => model.name === "qwen3:4b" || model.name.startsWith("qwen3:4b:"));
    if (!found) {
      status.textContent = "连接成功！回到橙光作品页，点击“AI 去重整理”。如果尚未下载模型，回到扩展点“一键下载模型（约 2.5 GB）”，扩展会替你下载。";
      return;
    }
    await chrome.storage.local.set({ ogoLocalAiReadyV1: true });
    status.textContent = "连接成功！回到橙光作品页面，点击“AI 去重整理”就可以开始。";
    setTimeout(() => window.close(), 2200);
  } catch {
    status.textContent = "暂时连不上 Ollama。请确认已安装 Ollama，并从 Windows“开始”菜单打开它。等应用打开后，再回来点“连接 Ollama”。如果还没有安装，可以用上面的下载按钮。";
  } finally {
    connectButton.disabled = false;
  }
});
