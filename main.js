let fileno = 0;
let folderno = 0;
let currentDirectoryHandle = null;
let selectedfile = null;
let previouslySelected = null;

// Navigation history for folder navigation
let navigationHistory = [];
let currentHistoryIndex = -1;

// Open IndexedDB
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('MediaPlayerDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('directories')) {
                db.createObjectStore('directories', { keyPath: 'id' });
            }
        };
    });
}

// Retrieve directory handle from IndexedDB
async function getStoredDirectoryHandle() {
    try {
        const db = await openDatabase();
        const transaction = db.transaction(['directories'], 'readonly');
        const store = transaction.objectStore('directories');
        const request = store.get('main');
        
        return new Promise((resolve, reject) => {
            request.onsuccess = async () => {
                if (request.result && request.result.handle) {
                    const handle = request.result.handle;
                    
                    // Verify permission
                    const permission = await handle.queryPermission({ mode: 'readwrite' });
                    if (permission === 'granted') {
                        resolve(handle);
                    } else {
                        // Request permission again
                        const newPermission = await handle.requestPermission({ mode: 'readwrite' });
                        if (newPermission === 'granted') {
                            resolve(handle);
                        } else {
                            resolve(null);
                        }
                    }
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error retrieving directory handle:", error);
        return null;
    }
}

// Function to retrieve the previously selected directory
async function getDirectoryHandle() {
    const storedHandle = await getStoredDirectoryHandle();
    if (storedHandle) {
        return storedHandle;
    }

    try {
        const directoryHandle = await window.showDirectoryPicker();
        const permission = await directoryHandle.requestPermission({ mode: "readwrite" });
        
        if (permission !== "granted") {
            console.error("Permission not granted");
            return null;
        }

        const db = await openDatabase();
        const transaction = db.transaction(['directories'], 'readwrite');
        const store = transaction.objectStore('directories');
        await store.put({ id: 'main', handle: directoryHandle });
        
        return directoryHandle;
    } catch (error) {
        console.error("Error selecting directory:", error);
        return null;
    }
}

// Update folder navigation buttons state
function updateFolderNavigationButtons() {
    const backBtn = document.getElementById("folderBackBtn");
    const forwardBtn = document.getElementById("folderForwardBtn");
    
    backBtn.disabled = currentHistoryIndex <= 0;
    forwardBtn.disabled = currentHistoryIndex >= navigationHistory.length - 1;
}

// Add directory to history
function addToHistory(directoryHandle) {
    // Remove any forward history if we're navigating to a new folder
    if (currentHistoryIndex < navigationHistory.length - 1) {
        navigationHistory = navigationHistory.slice(0, currentHistoryIndex + 1);
    }
    
    navigationHistory.push(directoryHandle);
    currentHistoryIndex = navigationHistory.length - 1;
    updateFolderNavigationButtons();
}

function getfreq(mediaElement) {
    const audioContext = new AudioContext();
    const sourceNode = audioContext.createMediaElementSource(mediaElement);
    const analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;

    const bufferLength = analyserNode.frequencyBinCount;
    const amplitudeArray = new Uint8Array(bufferLength);

    sourceNode.connect(analyserNode);
    analyserNode.connect(audioContext.destination);

    const canvasElt = document.getElementById("canvas");
    const canvasContext = canvasElt.getContext("2d");

    function draw() {
        requestAnimationFrame(draw);
        analyserNode.getByteFrequencyData(amplitudeArray);
    
        canvasContext.clearRect(0, 0, canvasElt.width, canvasElt.height);
        canvasContext.fillStyle = "yellow";
    
        const barWidth = canvasElt.width / bufferLength;
        const centerX = canvasElt.width / 2;
    
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (amplitudeArray[i] / 256) * canvasElt.height;
            const x = centerX + (i - bufferLength / 2) * barWidth;
            canvasContext.fillRect(x, canvasElt.height - barHeight, barWidth - 1, barHeight);
        }
    }

    draw();
}

// Function to list files in the directory
async function listFiles(directoryHandle = null, addToNav = true) {
    if (!directoryHandle) {
        directoryHandle = await getDirectoryHandle();
        if (!directoryHandle) {
            console.error("No directory handle available.");
            alert("Please select a directory first.");
            window.location.href = "index.html";
            return;
        }
    }

    // Add to navigation history
    if (addToNav) {
        addToHistory(directoryHandle);
    }

    document.getElementById("files").innerHTML = "";
    fileno = 0;
    folderno = 0;
    currentDirectoryHandle = directoryHandle;
    selectedfile = null;
    previouslySelected = null;

    try {
        for await (const entry of directoryHandle.values()) {
            if (entry.kind === "directory") {
                let newFolder = document.createElement("li");
                newFolder.className = "folder";
                newFolder.textContent = "📁 " + entry.name;
                newFolder.id = "folder" + folderno;

                newFolder.addEventListener("click", function () {
                    selectedfile = entry.name;
                    
                    if (previouslySelected) {
                        previouslySelected.style.backgroundColor = "";
                    }
                
                    newFolder.style.backgroundColor = "#00DFA2"; 
                    previouslySelected = newFolder;

                    // Show folder info
                    document.getElementById("filename").innerText = entry.name;
                    document.getElementById("filesize").innerText = "Folder";
                    document.getElementById("filetype").innerText = "Directory";
                    document.getElementById("filedate").innerText = "-";
                });

                newFolder.addEventListener("dblclick", async function () {
                    const subDirectoryHandle = await directoryHandle.getDirectoryHandle(entry.name);
                    await listFiles(subDirectoryHandle, true);
                });

                document.getElementById("files").appendChild(newFolder);
                folderno++;
            } else {
                let newItem = document.createElement("li");
                newItem.textContent = entry.name;
                newItem.className = "file";
                newItem.id = "file" + fileno;
                
                // Store the entry reference
                newItem.entryData = entry;
                
                newItem.addEventListener("click", async function () {
                    selectedfile = entry.name;
                    const file = await entry.getFile();
                    
                    if (previouslySelected) {
                        previouslySelected.style.backgroundColor = "";
                    }
                
                    newItem.style.backgroundColor = "#00DFA2"; 
                    previouslySelected = newItem;
                
                    // Update file info
                    document.getElementById("filename").innerText = entry.name;
                    document.getElementById("filesize").innerText = (file.size / 1024 / 1024).toFixed(2) + " MB";
                    document.getElementById("filetype").innerText = file.type || "Unknown";
                    document.getElementById("filedate").innerText = new Date(file.lastModified).toLocaleString();
                });

                newItem.addEventListener("dblclick", async function () {
                    const file = await entry.getFile();
                    const fileURL = URL.createObjectURL(file);

                    // Hide all viewers first
                    hideAllViewers();

                    // Show/hide controls based on file type
                    const isMediaFile = file.type.startsWith("video/") || file.type.startsWith("audio/");
                    const controlsDiv = document.getElementById("controls");
                    if (controlsDiv) {
                        controlsDiv.style.display = isMediaFile ? "flex" : "none";
                    }

                    let mediaElement;
                    
                    // Handle video files
                    if (file.type.startsWith("video/")) {
                        mediaElement = document.getElementById("video");
                        document.getElementById("canvas").style.display = "none";
                        mediaElement.style.display = "block";
                        mediaElement.src = fileURL;
                        mediaElement.play();
                    } 
                    // Handle audio files
                    else if (file.type.startsWith("audio/")) {
                        mediaElement = document.getElementById("audio");
                        document.getElementById("canvas").style.display = "block";
                        getfreq(mediaElement);
                        mediaElement.style.display = "block";
                        mediaElement.src = fileURL;
                        mediaElement.play();
                    }
                    // Handle PDF files
                    else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith('.pdf')) {
                        let pdfViewer = document.getElementById("pdfViewer");
                        if (!pdfViewer) {
                            pdfViewer = document.createElement("iframe");
                            pdfViewer.id = "pdfViewer";
                            pdfViewer.style.width = "100%";
                            pdfViewer.style.height = "100%";
                            pdfViewer.style.border = "none";
                            pdfViewer.style.borderRadius = "10px";
                            document.getElementById("player").appendChild(pdfViewer);
                        }
                        pdfViewer.src = fileURL;
                        pdfViewer.style.display = "block";
                    }
                    // Handle Office documents (DOCX, XLSX, PPTX)
                    else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                             file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
                             file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
                             file.name.toLowerCase().endsWith('.docx') ||
                             file.name.toLowerCase().endsWith('.xlsx') ||
                             file.name.toLowerCase().endsWith('.pptx') ||
                             file.name.toLowerCase().endsWith('.doc') ||
                             file.name.toLowerCase().endsWith('.xls') ||
                             file.name.toLowerCase().endsWith('.ppt')) {
                        
                        await renderOfficeDocument(file, fileURL);
                    }
                    // Handle text files
                    else if (file.type.startsWith("text/") || 
                             file.name.toLowerCase().endsWith('.txt') ||
                             file.name.toLowerCase().endsWith('.md') ||
                             file.name.toLowerCase().endsWith('.json') ||
                             file.name.toLowerCase().endsWith('.xml') ||
                             file.name.toLowerCase().endsWith('.csv') ||
                             file.name.toLowerCase().endsWith('.log')) {
                        
                        const text = await file.text();
                        let textViewer = document.getElementById("textViewer");
                        if (!textViewer) {
                            textViewer = document.createElement("pre");
                            textViewer.id = "textViewer";
                            textViewer.style.width = "100%";
                            textViewer.style.height = "100%";
                            textViewer.style.backgroundColor = "white";
                            textViewer.style.color = "black";
                            textViewer.style.padding = "20px";
                            textViewer.style.overflow = "auto";
                            textViewer.style.textAlign = "left";
                            textViewer.style.whiteSpace = "pre-wrap";
                            textViewer.style.wordWrap = "break-word";
                            textViewer.style.borderRadius = "10px";
                            textViewer.style.fontFamily = "monospace";
                            textViewer.style.fontSize = "14px";
                            document.getElementById("player").appendChild(textViewer);
                        }
                        textViewer.textContent = text;
                        textViewer.style.display = "block";
                    }
                    // Handle image files
                    else if (file.type.startsWith("image/")) {
                        let imageViewer = document.getElementById("imageViewer");
                        if (!imageViewer) {
                            imageViewer = document.createElement("img");
                            imageViewer.id = "imageViewer";
                            imageViewer.style.maxWidth = "100%";
                            imageViewer.style.maxHeight = "100%";
                            imageViewer.style.objectFit = "contain";
                            imageViewer.style.borderRadius = "10px";
                            document.getElementById("player").appendChild(imageViewer);
                        }
                        imageViewer.src = fileURL;
                        imageViewer.style.display = "block";
                    }
                    // Handle other file types
                    else {
                        window.open(fileURL, '_blank');
                    }
                });

                document.getElementById("files").appendChild(newItem);
                fileno++;
            }
        }
    } catch (error) {
        console.error("Error fetching files:", error);
    }
}

async function deleteFile(directoryHandle, fileName) {
    try {
        await directoryHandle.removeEntry(fileName);
        console.log(`${fileName} deleted successfully`);
        const fileElements = document.querySelectorAll("li.file, li.folder");
        fileElements.forEach(fileElement => {
            if (fileElement.textContent.includes(fileName)) {
                fileElement.remove();
            }
        });
    } catch (error) {
        console.error("Error deleting file:", error);
    }
}

document.getElementById("delete").addEventListener("click", async () => {
    if (!selectedfile || !currentDirectoryHandle) {
        console.error("No file selected or directory unavailable.");
        alert("Please select a file or folder to delete.");
        return;
    }
    
    const confirmDelete = confirm(`Are you sure you want to delete "${selectedfile}"?`);
    if (confirmDelete) {
        await deleteFile(currentDirectoryHandle, selectedfile);
    }
});

// Media seek controls (video/audio forward/backward)
document.getElementById("forward").addEventListener("click", async () => {
    const media = document.querySelector("video:not([style*='display: none']), audio:not([style*='display: none'])");
    if (media) media.currentTime += 10;
});

document.getElementById("backward").addEventListener("click", () => {
    const media = document.querySelector("video:not([style*='display: none']), audio:not([style*='display: none'])");
    if (media) media.currentTime -= 10;
});

// Folder navigation back button
document.getElementById("folderBackBtn").addEventListener("click", async () => {
    if (currentHistoryIndex > 0) {
        currentHistoryIndex--;
        const previousDirectory = navigationHistory[currentHistoryIndex];
        await listFiles(previousDirectory, false);
        updateFolderNavigationButtons();
    }
});

// Folder navigation forward button
document.getElementById("folderForwardBtn").addEventListener("click", async () => {
    if (currentHistoryIndex < navigationHistory.length - 1) {
        currentHistoryIndex++;
        const nextDirectory = navigationHistory[currentHistoryIndex];
        await listFiles(nextDirectory, false);
        updateFolderNavigationButtons();
    }
});

// Auto-load files on page load
window.addEventListener('DOMContentLoaded', async () => {
    await listFiles();
});

// Home button to go to root directory
document.getElementById("listFilesBtn").addEventListener("click", async () => {
    const rootHandle = await getDirectoryHandle();
    if (rootHandle) {
        await listFiles(rootHandle, true);
    }
});

// Function to render Office documents
async function renderOfficeDocument(file, fileURL) {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    
    let officeViewer = document.getElementById("officeViewer");
    if (!officeViewer) {
        officeViewer = document.createElement("iframe");
        officeViewer.id = "officeViewer";
        officeViewer.style.width = "100%";
        officeViewer.style.height = "100%";
        officeViewer.style.border = "none";
        officeViewer.style.borderRadius = "10px";
        document.getElementById("player").appendChild(officeViewer);
    }
    
    // Show loading message
    officeViewer.style.display = "block";
    officeViewer.srcdoc = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
            <div style="text-align: center;">
                <div style="border: 4px solid #f3f3f3; border-top: 4px solid #0079FF; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto;"></div>
                <p style="margin-top: 20px;">Loading ${fileExtension.toUpperCase()} file...</p>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </div>
    `;
    
    // Method 1: Use Microsoft Office Online Viewer (Most reliable for DOCX, XLSX, PPTX)
    // This requires the file to be publicly accessible on the internet
    // For local files, we'll use alternative methods
    
    try {
        // Check if we can use Office Online Viewer (requires public URL)
        // For local files, we'll use alternative rendering methods
        
        if (fileExtension === 'docx' || fileExtension === 'doc') {
            await renderWordDocument(file, officeViewer);
        } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            await renderExcelDocument(file, officeViewer);
        } else if (fileExtension === 'pptx' || fileExtension === 'ppt') {
            await renderPowerPointDocument(file, officeViewer);
        }
    } catch (error) {
        console.error("Error rendering Office document:", error);
        officeViewer.srcdoc = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif; padding: 20px;">
                <div style="text-align: center; max-width: 600px;">
                    <h2 style="color: #FF4444;">Unable to render document</h2>
                    <p>This ${fileExtension.toUpperCase()} file cannot be displayed in the browser.</p>
                    <button onclick="parent.postMessage('download', '*')" style="margin-top: 20px; padding: 10px 20px; background: #0079FF; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">
                        Download File
                    </button>
                </div>
            </div>
        `;
        
        // Listen for download message
        window.addEventListener('message', (event) => {
            if (event.data === 'download') {
                const a = document.createElement('a');
                a.href = fileURL;
                a.download = file.name;
                a.click();
            }
        });
    }
}

// Render Word documents using Mammoth.js
async function renderWordDocument(file, viewer) {
    // Load Mammoth.js library dynamically
    if (!window.mammoth) {
        await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
    
    viewer.srcdoc = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: 'Calibri', 'Arial', sans-serif;
                    padding: 40px;
                    background: white;
                    color: black;
                    line-height: 1.6;
                    max-width: 800px;
                    margin: 0 auto;
                }
                h1, h2, h3, h4, h5, h6 {
                    color: #333;
                    margin-top: 1.5em;
                    margin-bottom: 0.5em;
                }
                p {
                    margin-bottom: 1em;
                }
                img {
                    max-width: 100%;
                    height: auto;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 1em 0;
                }
                table td, table th {
                    border: 1px solid #ddd;
                    padding: 8px;
                }
                table th {
                    background-color: #f2f2f2;
                }
            </style>
        </head>
        <body>
            ${result.value}
        </body>
        </html>
    `;
}

// Render Excel documents using SheetJS
async function renderExcelDocument(file, viewer) {
    // Load SheetJS library dynamically
    if (!window.XLSX) {
        await loadScript('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    let htmlContent = '<div style="padding: 20px; font-family: Arial, sans-serif;">';
    
    // Add sheet selector if multiple sheets
    if (workbook.SheetNames.length > 1) {
        htmlContent += '<div style="margin-bottom: 20px;"><strong>Sheets:</strong> ';
        workbook.SheetNames.forEach((sheetName, index) => {
            htmlContent += `<button onclick="showSheet(${index})" style="margin: 5px; padding: 8px 15px; background: #0079FF; color: white; border: none; border-radius: 5px; cursor: pointer;">${sheetName}</button>`;
        });
        htmlContent += '</div>';
    }
    
    // Convert each sheet to HTML
    workbook.SheetNames.forEach((sheetName, index) => {
        const worksheet = workbook.Sheets[sheetName];
        const html = XLSX.utils.sheet_to_html(worksheet);
        htmlContent += `<div id="sheet-${index}" class="sheet-content" style="${index === 0 ? '' : 'display: none;'}">
            <h2>${sheetName}</h2>
            ${html}
        </div>`;
    });
    
    htmlContent += '</div>';
    
    viewer.srcdoc = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    background: white;
                    color: black;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                    font-size: 12px;
                }
                td, th {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background-color: #0079FF;
                    color: white;
                    font-weight: bold;
                }
                tr:nth-child(even) {
                    background-color: #f2f2f2;
                }
                tr:hover {
                    background-color: #e8f4f8;
                }
            </style>
            <script>
                function showSheet(index) {
                    const sheets = document.querySelectorAll('.sheet-content');
                    sheets.forEach((sheet, i) => {
                        sheet.style.display = i === index ? 'block' : 'none';
                    });
                }
            </script>
        </head>
        <body>
            ${htmlContent}
        </body>
        </html>
    `;
}

// Render PowerPoint documents
async function renderPowerPointDocument(file, viewer) {
    // For PowerPoint, we'll use a combination of approaches
    // Since there's no good free library for full PPTX rendering, we'll show a message
    
    viewer.srcdoc = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .container {
                    text-align: center;
                    background: rgba(255, 255, 255, 0.1);
                    padding: 40px;
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    max-width: 600px;
                }
                h2 {
                    margin-bottom: 20px;
                }
                .info {
                    margin: 20px 0;
                    font-size: 16px;
                }
                .buttons {
                    margin-top: 30px;
                }
                button {
                    margin: 10px;
                    padding: 12px 30px;
                    background: white;
                    color: #667eea;
                    border: none;
                    border-radius: 25px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    transition: all 0.3s;
                }
                button:hover {
                    transform: scale(1.05);
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>📊 PowerPoint Presentation</h2>
                <div class="info">
                    <p><strong>File:</strong> ${file.name}</p>
                    <p><strong>Size:</strong> ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <p>PowerPoint files require external viewer for full rendering.</p>
                <div class="buttons">
                    <button onclick="parent.postMessage('download', '*')">💾 Download File</button>
                    <button onclick="openWithOfficeOnline()">🌐 Open with Office Online</button>
                </div>
            </div>
            <script>
                function openWithOfficeOnline() {
                    alert('To view with Office Online, upload the file to OneDrive, Google Drive, or Dropbox and use their built-in viewers.');
                }
            </script>
        </body>
        </html>
    `;
    
    // Listen for download message
    window.addEventListener('message', (event) => {
        if (event.data === 'download') {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(file);
            a.download = file.name;
            a.click();
        }
    });
}

// Helper function to load external scripts dynamically
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Function to hide all viewers
function hideAllViewers() {
    document.getElementById("video").style.display = "none";
    document.getElementById("audio").style.display = "none";
    document.getElementById("canvas").style.display = "none";
    
    const pdfViewer = document.getElementById("pdfViewer");
    if (pdfViewer) pdfViewer.style.display = "none";
    
    const textViewer = document.getElementById("textViewer");
    if (textViewer) textViewer.style.display = "none";
    
    const imageViewer = document.getElementById("imageViewer");
    if (imageViewer) imageViewer.style.display = "none";
    
    const officeViewer = document.getElementById("officeViewer");
    if (officeViewer) officeViewer.style.display = "none";
    
    // Pause any playing media
    document.getElementById("video").pause();
    document.getElementById("audio").pause();
}

// Toggle file info panel
document.getElementById("toggleFileInfo").addEventListener("click", function() {
    const fileinfo = document.getElementById("fileinfo");
    const body = document.body;
    
    fileinfo.classList.toggle("collapsed");
    body.classList.toggle("fileinfo-collapsed");
});

// Search functionality
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearch");

searchInput.addEventListener("input", function() {
    const searchTerm = this.value.toLowerCase().trim();
    
    // Show/hide clear button
    if (searchTerm) {
        clearSearchBtn.classList.add("visible");
    } else {
        clearSearchBtn.classList.remove("visible");
    }
    
    // Filter files and folders
    const filesList = document.getElementById("files");
    const allItems = filesList.querySelectorAll("li");
    
    let visibleCount = 0;
    
    allItems.forEach(item => {
        const itemName = item.textContent.toLowerCase();
        
        if (itemName.includes(searchTerm)) {
            item.style.display = "";
            visibleCount++;
        } else {
            item.style.display = "none";
        }
    });
    
    // Show message if no results found
    let noResultsMsg = document.getElementById("noResults");
    
    if (visibleCount === 0 && searchTerm) {
        if (!noResultsMsg) {
            noResultsMsg = document.createElement("li");
            noResultsMsg.id = "noResults";
            noResultsMsg.style.textAlign = "center";
            noResultsMsg.style.color = "#FF4444";
            noResultsMsg.style.padding = "20px";
            noResultsMsg.style.fontStyle = "italic";
            noResultsMsg.textContent = `No files or folders found matching "${searchTerm}"`;
            filesList.appendChild(noResultsMsg);
        } else {
            noResultsMsg.textContent = `No files or folders found matching "${searchTerm}"`;
            noResultsMsg.style.display = "";
        }
    } else {
        if (noResultsMsg) {
            noResultsMsg.style.display = "none";
        }
    }
});

// Clear search button
clearSearchBtn.addEventListener("click", function() {
    searchInput.value = "";
    clearSearchBtn.classList.remove("visible");
    
    // Show all files
    const allItems = document.querySelectorAll("#files li");
    allItems.forEach(item => {
        item.style.display = "";
    });
    
    // Hide no results message
    const noResultsMsg = document.getElementById("noResults");
    if (noResultsMsg) {
        noResultsMsg.style.display = "none";
    }
    
    searchInput.focus();
});

// Keyboard shortcut: Ctrl+F or Cmd+F to focus search
document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchInput.focus();
    }
    
    // Escape to clear search
    if (e.key === "Escape" && document.activeElement === searchInput) {
        clearSearchBtn.click();
    }
});


