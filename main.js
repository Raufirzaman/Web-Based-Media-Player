let fileno = 0;
let folderno = 0;
let currentDirectoryHandle = null;
let selectedfile = null;
let previouslySelected = null;


// Function to retrieve the previously selected directory
async function getDirectoryHandle() {
    if (window.directoryHandle) {
        return window.directoryHandle; // Use stored handle if available
    }

    if (localStorage.getItem("directoryAccessGranted") === "true") {
        try {
            // Wait for the user to click the button to open the directory picker
            const directoryHandle = await window.showDirectoryPicker();
            window.directoryHandle = directoryHandle;
            return directoryHandle;
        } catch (error) {
            console.error("Error retrieving directory handle:", error);
            return null;
        }
    }

    return null;
}

// Function to list files in the directory
async function listFiles(directoryHandle = null) {
    if (!directoryHandle) {
        directoryHandle = await getDirectoryHandle();
        if (!directoryHandle) {
            console.error("No directory handle available.");
            return;
        }
    }

    document.getElementById("files").innerHTML = "";
    fileno = 0;
    folderno = 0;
    currentDirectoryHandle=directoryHandle;
    selectedfile = null;
    previouslySelected = null;
 
   

    try {
        for await (const entry of directoryHandle.values()) {
            if (entry.kind === "directory") {
                let newFolder = document.createElement("li");
                newFolder.className = "folder";
                newFolder.textContent = entry.name;
                newFolder.id = "folder" + folderno;

                newFolder.addEventListener("click", async function () {
                    selectedfile = entry.name;
                    
                    // Reset background color of previously selected item
                    if (previouslySelected) {
                        previouslySelected.style.backgroundColor = ""; // Reset previous item's background color
                    }
                
                    // Set the background color for the selected folder
                    newFolder.style.backgroundColor = "#00DFA2"; 
                
                    // Store the newly selected folder as the previously selected
                    previouslySelected = newFolder;
                });
                

                newFolder.addEventListener("dblclick", async function () {
                    const subDirectoryHandle = await directoryHandle.getDirectoryHandle(entry.name);
                    currentDirectoryHandle = subDirectoryHandle;
                    await listFiles(subDirectoryHandle);
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
                        document.getElementById("audio").style.display = "none" ;
                        document.getElementById("video").style.display = "block";
                    } else if (file.type.startsWith("audio/")) {
                        mediaElement = document.getElementById("audio");
                        document.getElementById("video").style.display = "none";
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
                    
                    // Reset background color of previously selected item
                    if (previouslySelected) {
                        previouslySelected.style.backgroundColor = ""; // Reset previous item's background color
                    }
                
                    // Set the background color for the selected file
                    newItem.style.backgroundColor = "#00DFA2"; 
                
                    // Store the newly selected file as the previously selected
                    previouslySelected = newItem;
                
                    // Update file info
                    document.getElementById("filename").innerText = entry.name;
                    document.getElementById("filesize").innerText = file.size / 1000000 + " MB";
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
         // Correct method
        console.log(`${fileName} deleted successfully`);
        const fileElements = document.querySelectorAll("li.file"); // Select all file items
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
        return;
    }
    await deleteFile(currentDirectoryHandle, selectedfile);
});

document.getElementById("forward").addEventListener("click", async () => {
    const media = document.querySelector("video, audio");
    if (media) media.currentTime += 10;
})
document.getElementById("backward").addEventListener("click", () => {
    const media = document.querySelector("video, audio");
    if (media) media.currentTime -= 10;
});
// **Button click or gesture** to trigger file listing
document.getElementById("listFilesBtn").addEventListener("click", async () => {
    await listFiles();
});


