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

                newFolder.addEventListener("click", async function () {
                    selectedfile = entry.name;
                    
                    if (previouslySelected) {
                        previouslySelected.style.backgroundColor = "";
                    }
                
                    newFolder.style.backgroundColor = "#00DFA2"; 
                    previouslySelected = newFolder;
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
                
                newItem.addEventListener("dblclick", async function () {
                    const file = await entry.getFile();
                    const fileURL = URL.createObjectURL(file);

                    let mediaElement;
                    if (file.type.startsWith("video/")) {
                        mediaElement = document.getElementById("video");
                        document.getElementById("audio").style.display = "none";
                        document.getElementById("audio").pause();
                        document.getElementById("video").style.display = "block";
                        document.getElementById("canvas").style.display = "none";
                    } else if (file.type.startsWith("audio/")) {
                        mediaElement = document.getElementById("audio");
                        document.getElementById("canvas").style.display = "block";
                        getfreq(mediaElement);
                        document.getElementById("video").style.display = "none";
                        document.getElementById("video").pause();
                        document.getElementById("audio").style.display = "block";
                    }

                    if (mediaElement) {
                        mediaElement.src = fileURL;
                        mediaElement.style.display = "block";
                        mediaElement.play();
                    } else {
                        window.open(fileURL);
                    }
                });
                
                newItem.addEventListener("click", async function () {
                    selectedfile = entry.name;
                    const file = await entry.getFile();
                    
                    if (previouslySelected) {
                        previouslySelected.style.backgroundColor = "";
                    }
                
                    newItem.style.backgroundColor = "#00DFA2"; 
                    previouslySelected = newItem;
                
                    document.getElementById("filename").innerText = entry.name;
                    document.getElementById("filesize").innerText = (file.size / 1000000).toFixed(2) + " MB";
                    document.getElementById("filetype").innerText = file.type;
                    document.getElementById("filedate").innerText = new Date(file.lastModified).toLocaleString();
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


