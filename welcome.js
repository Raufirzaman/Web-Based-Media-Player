async function selectDirectory() {
    try {
        const directoryHandle = await window.showDirectoryPicker();

        // Store the handle in IndexedDB for persistence
        const permission = await directoryHandle.requestPermission({ mode: "read" });
        if (permission !== "granted") {
            console.error("Permission not granted");
            return;
        }

        localStorage.setItem("directoryAccessGranted", "true"); // Mark access granted
        window.directoryHandle = directoryHandle; // Store temporarily in memory

        window.location.href = "main.html"; // Redirect to main page
    } catch (error) {
        console.error("Error selecting directory:", error);
    }
}

document.getElementById("dir").addEventListener("click", selectDirectory);
