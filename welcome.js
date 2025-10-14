// Store directory handle in IndexedDB
async function storeDirectoryHandle(directoryHandle) {
    const db = await openDatabase();
    const transaction = db.transaction(['directories'], 'readwrite');
    const store = transaction.objectStore('directories');
    await store.put({ id: 'main', handle: directoryHandle });
}

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

async function selectDirectory() {
    try {
        const directoryHandle = await window.showDirectoryPicker();

        // Request permission
        const permission = await directoryHandle.requestPermission({ mode: "readwrite" });
        if (permission !== "granted") {
            console.error("Permission not granted");
            alert("Permission denied. Please grant access to continue.");
            return;
        }

        // Store the handle in IndexedDB
        await storeDirectoryHandle(directoryHandle);
        localStorage.setItem("directoryAccessGranted", "true");

        // Redirect to main page
        window.location.href = "main.html";
    } catch (error) {
        console.error("Error selecting directory:", error);
        alert("Error selecting directory. Please try again.");
    }
}

document.getElementById("dir").addEventListener("click", selectDirectory);
