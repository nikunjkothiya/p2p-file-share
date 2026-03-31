const ICE = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

const PREVIEW_QR_SIZE = 240;
const DOWNLOAD_QR_SIZE = 1200;
const QR_ERROR_CORRECTION = "L";

let pc = null;
let dc = null;
let incomingFile = null;
let offerQrCanvas = null;
let answerQrCanvas = null;
let offerQrText = "";
let answerQrText = "";
const downloadUrls = new Set();
const qrDetector = createQrDetector();
const jsQrDecoder = typeof jsQR === "function" ? jsQR : null;
const supportsQrImageUpload = Boolean(qrDetector || jsQrDecoder);

const screens = document.querySelectorAll("[data-screen]");
const offerQrContainer = document.getElementById("offer-qr");
const answerQrContainer = document.getElementById("answer-qr");
const offerOutput = document.getElementById("offer-output");
const answerInput = document.getElementById("answer-input");
const creatorStatus = document.getElementById("creator-status");
const joinerStatus = document.getElementById("joiner-status");
const answerPanel = document.getElementById("answer-panel");
const answerOutput = document.getElementById("answer-output");
const qrInput = document.getElementById("qr-input");
const connectionStatus = document.getElementById("connection-status");
const transferStatus = document.getElementById("transfer-status");
const fileInput = document.getElementById("file");
const sentFiles = document.getElementById("sent-files");
const sentFilesEmpty = document.getElementById("sent-files-empty");
const receivedFiles = document.getElementById("received-files");
const receivedFilesEmpty = document.getElementById("received-files-empty");
const activityTitle = document.getElementById("activity-title");
const activityMeta = document.getElementById("activity-meta");
const activityState = document.getElementById("activity-state");
const activityProgress = document.getElementById("activity-progress");
const downloadOfferQrButton = document.getElementById("download-offer-qr");
const downloadAnswerQrButton = document.getElementById("download-answer-qr");
const copyOfferTextButton = document.getElementById("copy-offer-text");
const copyAnswerTextButton = document.getElementById("copy-answer-text");
const answerImageInput = document.getElementById("answer-image-input");
const offerImageInput = document.getElementById("offer-image-input");
const sendFileName = document.getElementById("send-file-name");
const answerImageName = document.getElementById("answer-image-name");
const offerImageName = document.getElementById("offer-image-name");
const answerImageTrigger = document.querySelector('.picker-trigger[for="answer-image-input"]');
const offerImageTrigger = document.querySelector('.picker-trigger[for="offer-image-input"]');

function createQrDetector() {
  if (!("BarcodeDetector" in window) || !("createImageBitmap" in window)) {
    return null;
  }

  try {
    return new BarcodeDetector({ formats: ["qr_code"] });
  } catch (error) {
    return null;
  }
}

function compressText(text) {
  return LZString.compressToEncodedURIComponent(text);
}

function decompressText(text) {
  const normalized = text.replace(/\s+/g, "");
  const decoded = LZString.decompressFromEncodedURIComponent(normalized);

  if (!decoded) {
    throw new Error("That text is empty or not valid.");
  }

  return decoded;
}

function parseCandidateLine(line) {
  if (!line.startsWith("a=candidate:")) {
    return null;
  }

  const parts = line.slice("a=candidate:".length).split(" ");
  const typeIndex = parts.indexOf("typ");

  if (parts.length < 8 || typeIndex === -1 || !parts[typeIndex + 1]) {
    return null;
  }

  return {
    protocol: parts[2].toLowerCase(),
    type: parts[typeIndex + 1].toLowerCase()
  };
}

function filterCandidateLines(candidateLines) {
  const limits = {
    host: 2,
    srflx: 2,
    relay: 1,
    prflx: 1
  };
  const counts = {};
  const filtered = [];

  for (const line of candidateLines) {
    const candidate = parseCandidateLine(line);

    if (!candidate || candidate.protocol !== "udp") {
      continue;
    }

    const limit = limits[candidate.type] || 1;
    const count = counts[candidate.type] || 0;

    if (count >= limit) {
      continue;
    }

    counts[candidate.type] = count + 1;
    filtered.push(line);
  }

  if (filtered.length > 0) {
    return filtered;
  }

  return candidateLines.slice(0, 6);
}

function compactSdp(sdp) {
  const removablePrefixes = [
    "a=extmap-allow-mixed",
    "a=msid-semantic:",
    "a=ice-options:trickle"
  ];
  const baseLines = [];
  const candidateLines = [];
  let hasEndOfCandidates = false;

  for (const line of sdp.split(/\r\n/).filter(Boolean)) {
    if (line === "a=end-of-candidates") {
      hasEndOfCandidates = true;
      continue;
    }

    if (line.startsWith("a=candidate:")) {
      candidateLines.push(line);
      continue;
    }

    if (removablePrefixes.some(prefix => line.startsWith(prefix))) {
      continue;
    }

    baseLines.push(line);
  }

  const filteredCandidates = filterCandidateLines(candidateLines);

  if (hasEndOfCandidates && filteredCandidates.length > 0) {
    filteredCandidates.push("a=end-of-candidates");
  }

  return `${baseLines.concat(filteredCandidates).join("\r\n")}\r\n`;
}

function encodeSignal(description) {
  const typeCode = description.type === "offer" ? "o" : "a";
  const compactedSdp = compactSdp(description.sdp);

  return compressText(`${typeCode}|${compactedSdp}`);
}

function decodeSignal(text) {
  const decoded = decompressText(text);
  const separatorIndex = decoded.indexOf("|");

  if (separatorIndex <= 0) {
    throw new Error("That code is not in the right format.");
  }

  const typeCode = decoded.slice(0, separatorIndex);
  const sdp = decoded.slice(separatorIndex + 1);
  const type = typeCode === "o"
    ? "offer"
    : typeCode === "a"
      ? "answer"
      : "";

  if (!type || !sdp.includes("m=application")) {
    throw new Error("That code is missing some information.");
  }

  return { type, sdp };
}

function show(id) {
  screens.forEach(screen => {
    screen.classList.toggle("active", screen.id === id);
  });
}

function setStatus(element, message, tone = "") {
  element.textContent = message;

  if (tone) {
    element.dataset.tone = tone;
  } else {
    delete element.dataset.tone;
  }
}

function formatBytes(bytes) {
  if (!bytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, exponent);

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function resetIncomingFile() {
  incomingFile = null;
}

function setPickerName(element, text) {
  if (element) {
    element.textContent = text;
  }
}

function setActivity(title, meta, state, progress = 0) {
  activityTitle.textContent = title;
  activityMeta.textContent = meta;
  activityState.textContent = state;
  activityProgress.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

function resetActivity() {
  setActivity(
    "No transfer running",
    "Choose a file to send, or wait for a file from the other device.",
    "Idle",
    0
  );
}

function syncHistoryEmptyStates() {
  sentFilesEmpty.hidden = sentFiles.children.length > 0;
  receivedFilesEmpty.hidden = receivedFiles.children.length > 0;
}

function createHistoryItem({ direction, name, size, summary, actionHref, actionLabel }) {
  const item = document.createElement("article");
  const head = document.createElement("div");
  const text = document.createElement("div");
  const nameEl = document.createElement("div");
  const metaEl = document.createElement("div");
  const chip = document.createElement("span");

  item.className = "history-item";
  head.className = "history-item-head";
  nameEl.className = "history-item-name";
  metaEl.className = "history-item-meta";
  chip.className = `history-chip ${direction}`;

  nameEl.textContent = name;
  metaEl.textContent = `${size} • ${summary} • ${formatTime()}`;
  chip.textContent = direction === "sent" ? "Sent" : "Received";

  text.append(nameEl, metaEl);
  head.append(text, chip);
  item.append(head);

  if (actionHref && actionLabel) {
    const actions = document.createElement("div");
    const link = document.createElement("a");

    actions.className = "history-item-actions";
    link.className = "history-link";
    link.href = actionHref;
    link.textContent = actionLabel;

    if (direction === "received") {
      link.download = name;
    }

    actions.append(link);
    item.append(actions);
  }

  return item;
}

function addSentHistory(name, size) {
  sentFiles.prepend(createHistoryItem({
    direction: "sent",
    name,
    size: formatBytes(size),
    summary: "Sent from this device"
  }));
  syncHistoryEmptyStates();
}

function addReceivedHistory(name, size, url) {
  receivedFiles.prepend(createHistoryItem({
    direction: "received",
    name,
    size: formatBytes(size),
    summary: "Ready to download",
    actionHref: url,
    actionLabel: "Download file"
  }));
  syncHistoryEmptyStates();
}

function clearDownloads() {
  downloadUrls.forEach(url => URL.revokeObjectURL(url));
  downloadUrls.clear();
  sentFiles.replaceChildren();
  receivedFiles.replaceChildren();
  syncHistoryEmptyStates();
}

function setQrActionState(button, enabled) {
  button.disabled = !enabled;
}

function clearQr(container, button) {
  container.replaceChildren();
  setQrActionState(button, false);
}

function closeConnection() {
  resetIncomingFile();

  if (dc) {
    dc.onopen = null;
    dc.onclose = null;
    dc.onmessage = null;
    dc.onerror = null;

    if (dc.readyState !== "closed") {
      dc.close();
    }
  }

  if (pc) {
    pc.ondatachannel = null;

    if (pc.signalingState !== "closed") {
      pc.close();
    }
  }

  pc = null;
  dc = null;
}

function resetUi() {
  offerQrCanvas = null;
  answerQrCanvas = null;
  offerQrText = "";
  answerQrText = "";
  clearQr(offerQrContainer, downloadOfferQrButton);
  clearQr(answerQrContainer, downloadAnswerQrButton);
  offerOutput.value = "";
  answerInput.value = "";
  qrInput.value = "";
  answerOutput.value = "";
  answerPanel.hidden = true;
  fileInput.value = "";
  answerImageInput.value = "";
  offerImageInput.value = "";
  setPickerName(sendFileName, "No file selected");
  setPickerName(answerImageName, "No QR image selected");
  setPickerName(offerImageName, "No QR image selected");
  setStatus(creatorStatus, "");
  setStatus(joinerStatus, "");
  setStatus(connectionStatus, "Data channel ready.", "success");
  setStatus(transferStatus, "");
  resetActivity();
  clearDownloads();
}

function startOver() {
  closeConnection();
  resetUi();
  show("home");
}

async function waitForIceGatheringComplete(connection) {
  if (connection.iceGatheringState === "complete") {
    return;
  }

  await new Promise(resolve => {
    function handleStateChange() {
      if (connection.iceGatheringState === "complete") {
        connection.removeEventListener("icegatheringstatechange", handleStateChange);
        resolve();
      }
    }

    connection.addEventListener("icegatheringstatechange", handleStateChange);
  });
}

async function renderQr(container, text, button) {
  container.replaceChildren();

  try {
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, text, {
      errorCorrectionLevel: QR_ERROR_CORRECTION,
      margin: 1,
      width: PREVIEW_QR_SIZE
    });

    container.appendChild(canvas);
    setQrActionState(button, true);
    return canvas;
  } catch (error) {
    container.replaceChildren();
    setQrActionState(button, false);

    const message = document.createElement("p");
    message.className = "status";
    message.dataset.tone = "error";
    message.textContent = "This QR code image is too detailed to show clearly here. Use the text version instead.";
    container.appendChild(message);

    return null;
  }
}

async function downloadQrText(text, filename) {
  if (!text) {
    return;
  }

  const link = document.createElement("a");
  link.href = await QRCode.toDataURL(text, {
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: 1,
    width: DOWNLOAD_QR_SIZE
  });
  link.download = filename;
  link.click();
}

async function copyText(text, statusElement, successMessage) {
  if (!text) {
    setStatus(statusElement, "There is no text version to copy yet.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus(statusElement, successMessage, "success");
  } catch (error) {
    setStatus(statusElement, "Copy did not work in this browser. Use the text box instead.", "error");
  }
}

async function decodeQrFromImage(file) {
  if (qrDetector) {
    const bitmap = await createImageBitmap(file);

    try {
      const results = await qrDetector.detect(bitmap);

      if (results.length && results[0].rawValue) {
        return results[0].rawValue.trim();
      }
    } catch (error) {
      // Fall back to the bundled decoder when native decoding fails.
    } finally {
      if (typeof bitmap.close === "function") {
        bitmap.close();
      }
    }
  }

  if (!jsQrDecoder) {
    throw new Error("This browser cannot read QR code image files here. Use the text version instead.");
  }

  const image = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Could not read that image on this device.");
  }

  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQrDecoder(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth"
  });

  if (!result || !result.data) {
    throw new Error("No code was found in that image.");
  }

  return result.data.trim();
}

async function loadImageFromFile(file) {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.decoding = "async";

  const loadedImage = await new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not open that image file."));
    image.src = objectUrl;
  });

  try {
    return loadedImage;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function decodeSignalImage(input, targetField, statusElement, label) {
  const file = input.files[0];
  const nameElement = input === offerImageInput ? offerImageName : answerImageName;

  if (!file) {
    return;
  }

  setPickerName(nameElement, file.name);
  setStatus(statusElement, `Reading ${label.toLowerCase()}...`, "info");

  try {
    targetField.value = await decodeQrFromImage(file);
    setPickerName(nameElement, "QR image ready");
    setStatus(statusElement, `You added ${label.toLowerCase()}. You can continue now.`, "success");
  } catch (error) {
    setPickerName(nameElement, "Try another image");
    setStatus(statusElement, error.message || `Could not read ${label.toLowerCase()}.`, "error");
  } finally {
    input.value = "";
  }
}

function createPeerConnection() {
  const connection = new RTCPeerConnection(ICE);

  connection.addEventListener("connectionstatechange", () => {
    if (connection.connectionState === "connected") {
      setStatus(connectionStatus, "Connected. You can send files now.", "success");
    }

    if (connection.connectionState === "failed") {
      setStatus(connectionStatus, "Connection failed. Start over and try again.", "error");
    }

    if (connection.connectionState === "disconnected") {
      setStatus(connectionStatus, "The connection was lost.", "error");
    }
  });

  return connection;
}

function finalizeIncomingFile() {
  if (!incomingFile) {
    return;
  }

  const blob = new Blob(incomingFile.chunks, {
    type: incomingFile.mime || "application/octet-stream"
  });
  const url = URL.createObjectURL(blob);

  downloadUrls.add(url);
  addReceivedHistory(incomingFile.name, incomingFile.size, url);
  setActivity(
    "File received",
    `${incomingFile.name} is ready to download.`,
    "Done",
    100
  );
  setStatus(transferStatus, `${incomingFile.name} is ready to download.`, "success");
  resetIncomingFile();
}

async function handleIncomingMessage(event) {
  if (typeof event.data === "string") {
    let message;

    try {
      message = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    if (message.type === "file-meta") {
      incomingFile = {
        name: message.name || "download.bin",
        size: Number(message.size) || 0,
        mime: message.mime || "application/octet-stream",
        chunks: [],
        receivedBytes: 0
      };
      setActivity(
        "Receiving file",
        `${incomingFile.name} is coming from the other device.`,
        "Receiving",
        0
      );
      setStatus(transferStatus, `Receiving ${incomingFile.name}...`, "info");
    }

    if (message.type === "file-complete") {
      finalizeIncomingFile();
    }

    return;
  }

  if (!incomingFile) {
    return;
  }

  const chunk = event.data instanceof ArrayBuffer
    ? event.data
    : await event.data.arrayBuffer();

  incomingFile.chunks.push(chunk);
  incomingFile.receivedBytes += chunk.byteLength;

  const progress = incomingFile.size
    ? `${formatBytes(incomingFile.receivedBytes)} / ${formatBytes(incomingFile.size)}`
    : formatBytes(incomingFile.receivedBytes);
  const percent = incomingFile.size
    ? (incomingFile.receivedBytes / incomingFile.size) * 100
    : 0;

  setActivity(
    "Receiving file",
    `${incomingFile.name} (${progress})`,
    "Receiving",
    percent
  );
  setStatus(transferStatus, `Receiving ${incomingFile.name} (${progress})`, "info");
}

function attachDataChannel(channel) {
  dc = channel;
  dc.binaryType = "arraybuffer";
  dc.bufferedAmountLowThreshold = 262144;

  dc.onopen = () => {
    show("connected");
    setStatus(connectionStatus, "Connected. Both devices can send files now.", "success");
    setStatus(transferStatus, "");
    resetActivity();
  };

  dc.onclose = () => {
    setStatus(connectionStatus, "The connection has closed.", "error");
    setActivity("Connection closed", "Start over to connect both devices again.", "Closed", 0);
  };

  dc.onerror = () => {
    setStatus(connectionStatus, "Something went wrong with the connection.", "error");
    setActivity("Connection problem", "Try again or reconnect both devices.", "Error", 0);
  };

  dc.onmessage = handleIncomingMessage;
}

async function waitForBufferedAmount(channel) {
  while (channel.bufferedAmount > channel.bufferedAmountLowThreshold) {
    await new Promise(resolve => {
      channel.addEventListener("bufferedamountlow", resolve, { once: true });
    });
  }
}

async function sendFile() {
  const file = fileInput.files[0];

  if (!dc || dc.readyState !== "open") {
    setStatus(transferStatus, "Finish connecting both devices before sending a file.", "error");
    return;
  }

  if (!file) {
    setStatus(transferStatus, "Choose a file first.", "error");
    return;
  }

  setPickerName(sendFileName, file.name);

  const chunkSize = 16384;
  let offset = 0;

  dc.send(JSON.stringify({
    type: "file-meta",
    name: file.name,
    size: file.size,
    mime: file.type
  }));

  setActivity(
    "Sending file",
    `${file.name} is being sent to the other device.`,
    "Sending",
    0
  );
  setStatus(transferStatus, `Sending ${file.name}...`, "info");

  while (offset < file.size) {
    const chunk = await file.slice(offset, offset + chunkSize).arrayBuffer();
    await waitForBufferedAmount(dc);
    dc.send(chunk);
    offset += chunk.byteLength;
    const percent = file.size ? (offset / file.size) * 100 : 0;
    setActivity(
      "Sending file",
      `${file.name} (${formatBytes(offset)} / ${formatBytes(file.size)})`,
      "Sending",
      percent
    );
    setStatus(
      transferStatus,
      `Sending ${file.name} (${formatBytes(offset)} / ${formatBytes(file.size)})`,
      "info"
    );
  }

  dc.send(JSON.stringify({ type: "file-complete" }));
  addSentHistory(file.name, file.size);
  setActivity(
    "File sent",
    `${file.name} was sent from this device.`,
    "Done",
    100
  );
  setStatus(transferStatus, `Sent ${file.name}.`, "success");
  fileInput.value = "";
  setPickerName(sendFileName, "No file selected");
}

document.getElementById("create").addEventListener("click", async () => {
  closeConnection();
  resetUi();
  setStatus(creatorStatus, "Preparing your QR code image...", "info");
  show("creator");

  try {
    pc = createPeerConnection();
    attachDataChannel(pc.createDataChannel("file"));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);

    const encodedOffer = encodeSignal(pc.localDescription);
    offerOutput.value = encodedOffer;
    offerQrText = encodedOffer;
    offerQrCanvas = await renderQr(offerQrContainer, encodedOffer, downloadOfferQrButton);

    setStatus(
      creatorStatus,
      "Your QR code image is ready. Open it on the second device, then bring back the second QR code image here.",
      "info"
    );
  } catch (error) {
    setStatus(creatorStatus, error.message || "Could not create the QR code image.", "error");
  }
});

document.getElementById("apply-answer").addEventListener("click", async () => {
  if (!pc) {
    setStatus(creatorStatus, "Create the first QR code image first.", "error");
    return;
  }

  try {
    const answer = decodeSignal(answerInput.value);
    await pc.setRemoteDescription(answer);
    setStatus(creatorStatus, "The QR code image from the second device was added. Waiting for both devices to connect...", "info");
  } catch (error) {
    setStatus(creatorStatus, error.message || "Could not use that QR code image or text.", "error");
  }
});

document.getElementById("join").addEventListener("click", () => {
  closeConnection();
  resetUi();
  setStatus(joinerStatus, "Add the QR code image from the first device to create your second QR code image here.", "info");
  show("joiner");
});

document.getElementById("connect").addEventListener("click", async () => {
  closeConnection();
  answerPanel.hidden = true;
  answerOutput.value = "";
  answerQrCanvas = null;
  answerQrText = "";
  clearQr(answerQrContainer, downloadAnswerQrButton);
  setStatus(joinerStatus, "Preparing the second QR code image...", "info");

  try {
    const offer = decodeSignal(qrInput.value);

    pc = createPeerConnection();
    pc.ondatachannel = event => {
      attachDataChannel(event.channel);
    };

    await pc.setRemoteDescription(offer);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(pc);

    const encodedAnswer = encodeSignal(pc.localDescription);
    answerOutput.value = encodedAnswer;
    answerQrText = encodedAnswer;
    answerPanel.hidden = false;
    answerQrCanvas = await renderQr(answerQrContainer, encodedAnswer, downloadAnswerQrButton);

    setStatus(
      joinerStatus,
      "Your second QR code image is ready. Send it back to the first device and wait for both devices to connect.",
      "info"
    );
  } catch (error) {
    setStatus(joinerStatus, error.message || "Could not create the second QR code image.", "error");
  }
});

downloadOfferQrButton.addEventListener("click", async () => {
  await downloadQrText(offerQrText, "join-code.png");
});

downloadAnswerQrButton.addEventListener("click", async () => {
  await downloadQrText(answerQrText, "reply-code.png");
});

offerImageInput.addEventListener("change", () => {
  decodeSignalImage(offerImageInput, qrInput, joinerStatus, "the QR code image from the first device");
});

answerImageInput.addEventListener("change", () => {
  decodeSignalImage(answerImageInput, answerInput, creatorStatus, "the QR code image from the second device");
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  setPickerName(sendFileName, file ? file.name : "No file selected");
});

copyOfferTextButton.addEventListener("click", async () => {
  await copyText(offerOutput.value, creatorStatus, "Text version copied.");
});

copyAnswerTextButton.addEventListener("click", async () => {
  await copyText(answerOutput.value, joinerStatus, "Text version copied.");
});

document.getElementById("send-file").addEventListener("click", sendFile);
document.getElementById("back-home-creator").addEventListener("click", startOver);
document.getElementById("creator-reset").addEventListener("click", startOver);
document.getElementById("back-home-joiner").addEventListener("click", startOver);
document.getElementById("joiner-reset").addEventListener("click", startOver);
document.getElementById("back-home-connected").addEventListener("click", startOver);

resetActivity();
syncHistoryEmptyStates();

if (!supportsQrImageUpload) {
  offerImageInput.disabled = true;
  answerImageInput.disabled = true;
  setPickerName(offerImageName, "QR image upload is not available here");
  setPickerName(answerImageName, "QR image upload is not available here");
  offerImageTrigger?.setAttribute("aria-disabled", "true");
  answerImageTrigger?.setAttribute("aria-disabled", "true");
  offerImageInput.title = "This browser cannot read QR code image files here. Use the text version instead.";
  answerImageInput.title = "This browser cannot read QR code image files here. Use the text version instead.";
}
