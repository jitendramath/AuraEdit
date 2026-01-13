// --- STATE MANAGEMENT ---
let files = [];
let activeFileId = null;
let editor;
let fileHandle = null; 
const DB_NAME = "AuraEditDB";
const STORE_NAME = "projects";

window.onload = async () => {
    initEditor();
    await loadFilesFromDB();
};

function initEditor() {
    editor = CodeMirror(document.getElementById("editor-container"), {
        mode: "htmlmixed", theme: "dracula", lineNumbers: true,
        autoCloseBrackets: true, autoCloseTags: true, inputStyle: "contenteditable",  lineWrapping: true, tabSize: 2,  viewportMargin: Infinity
    });
    editor.on("change", () => {
        if (activeFileId) {
            const f = files.find(f => f.id === activeFileId);
            if (f) f.content = editor.getValue();
            document.getElementById("file-status").innerText = "Unsaved...";
        }
    });
    editor.on("cursorActivity", () => {
        const pos = editor.getCursor();
        document.getElementById("cursor-pos").innerText = `Ln ${pos.line + 1}, Col ${pos.ch + 1}`;
    });
}

function renderTabs() {
    const tabContainer = document.getElementById("tab-bar");
    tabContainer.innerHTML = "";
    files.forEach(file => {
        const tab = document.createElement("div");
        tab.className = `tab ${file.id === activeFileId ? "active" : ""}`;
        tab.innerHTML = `<span>${file.name}</span><span class="close-tab" onclick="deleteFile(${file.id}, event)">×</span>`;
        tab.onclick = (e) => { if (!e.target.classList.contains("close-tab")) switchFile(file.id); };
        tabContainer.appendChild(tab);
    });
}

function switchFile(id) {
    activeFileId = id;
    const file = files.find(f => f.id === id);
    if (file) {
        const mode = file.name.endsWith(".css") ? "css" : (file.name.endsWith(".js") ? "javascript" : "htmlmixed");
        editor.setOption("mode", mode);
        editor.setValue(file.content);
        renderTabs();
    }
}

function addNewFile() {
    showPrompt("Enter new file name:", "untitled.html", (name) => {
        const newFile = { id: Date.now(), name: name, content: "" };
        files.push(newFile);
        switchFile(newFile.id);
        saveProject();
        showAlert("SUCCESS", "New file created! 🚀");
    });
}

function deleteFile(id, e) {
    e.stopPropagation();
    showConfirm("Delete this file permanently?", () => {
        files = files.filter(f => f.id !== id);
        if (files.length > 0) switchFile(files[files.length-1].id);
        else { activeFileId = null; editor.setValue(""); renderTabs(); }
        saveProject();
    });
}

function openDB() {
    return new Promise((resolve, reject) => {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
        r.onsuccess = (e) => resolve(e.target.result);
        r.onerror = (e) => reject(e);
    });
}

async function saveProject() {
    if (activeFileId) {
        const f = files.find(file => file.id === activeFileId);
        if (f) f.content = editor.getValue();
    }
    if (fileHandle) {
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(editor.getValue());
            await writable.close();
            showAlert("FILE UPDATED", "Original file updated! 💾");
            return;
        } catch (err) {}
    }
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(files, "currentProject");
    document.getElementById("file-status").innerText = "DB SAVED ✅";
    setTimeout(() => document.getElementById("file-status").innerText = "Ready", 2000);
}

async function loadFilesFromDB() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get("currentProject");
    request.onsuccess = () => {
        if (request.result && request.result.length > 0) {
            files = request.result;
            switchFile(files[0].id);
        } else {
            files = [{ id: 1, name: "index.html", content: "<h1>Welcome</h1>" }];
            switchFile(1);
        }
    };
}

async function downloadProject() {
    if (!activeFileId) return;
    const file = files.find(f => f.id === activeFileId);
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({ suggestedName: file.name });
            const writable = await handle.createWritable();
            await writable.write(file.content);
            await writable.close();
            return;
        } catch (err) {}
    }
    const blob = new Blob([file.content], {type: "text/plain"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = file.name;
    document.body.appendChild(link); link.click();
    setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 100);
}

async function openFile(input) {
    if (input && input.files) { readFileContent(input.files[0]); return; }
    if (window.showOpenFilePicker) {
        try {
            const [handle] = await window.showOpenFilePicker();
            fileHandle = handle;
            const file = await handle.getFile();
            readFileContent(file);
        } catch (err) {}
    } else {
        document.getElementById('fileInput').click();
    }
}

function readFileContent(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const newFile = { id: Date.now(), name: file.name, content: e.target.result };
        files.push(newFile); switchFile(newFile.id); saveProject();
    };
    reader.readAsText(file);
}

// --- UI FUNCTIONS (Sidebar, Search, Modal) ---
function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
        overlay.classList.remove("active");
        setTimeout(() => overlay.style.display = "none", 300);
    } else {
        overlay.style.display = "block";
        setTimeout(() => { sidebar.classList.add("open"); overlay.classList.add("active"); }, 10);
    }
}

let lastSearchQuery = "";
function triggerSearch() {
    showPrompt("Find Text:", lastSearchQuery, (query) => {
        if (!query) return;
        lastSearchQuery = query;
        if (!editor.getSearchCursor) { showAlert("ERROR", "Search addon missing"); return; }
        const cursor = editor.getSearchCursor(query, editor.getCursor());
        if (cursor.findNext()) {
            editor.setSelection(cursor.from(), cursor.to());
            editor.scrollIntoView({from: cursor.from(), to: cursor.to()}, 20);
        } else {
            const start = editor.getSearchCursor(query, {line: 0, ch: 0});
            if (start.findNext()) {
                editor.setSelection(start.from(), start.to());
                editor.scrollIntoView({from: start.from(), to: start.to()}, 20);
                showAlert("WRAPPED", "Restarted from top.");
            } else showAlert("NOT FOUND", "Text not found.");
        }
    });
}

function triggerGoToLine() {
    showPrompt("Enter Line Number:", "", (val) => {
        const line = parseInt(val);
        if (!isNaN(line) && line > 0) {
            editor.setCursor(line - 1, 0); editor.focus();
        } else showAlert("ERROR", "Invalid Line!");
    });
}

// --- MODAL SYSTEM ---
const modal = document.getElementById('custom-modal');
const modalTitle = document.getElementById('modal-title');
const modalMsg = document.getElementById('modal-message');
const modalInput = document.getElementById('modal-input');
const btnConfirm = document.getElementById('btn-confirm');
const btnCancel = document.getElementById('btn-cancel');

function closeModal() { modal.style.display = 'none'; }

function showAlert(title, msg) {
    modalTitle.innerText = title; modalTitle.style.color = "var(--accent)";
    modalMsg.innerText = msg; modalInput.style.display = 'none';
    btnCancel.style.display = 'none'; btnConfirm.innerText = "OK";
    btnConfirm.onclick = closeModal; modal.style.display = 'flex';
}

function showConfirm(msg, onYes) {
    modalTitle.innerText = "CONFIRM"; modalTitle.style.color = "var(--danger)";
    modalMsg.innerText = msg; modalInput.style.display = 'none';
    btnCancel.style.display = 'block'; btnConfirm.innerText = "YES";
    btnConfirm.onclick = () => { closeModal(); onYes(); };
    modal.style.display = 'flex';
}

function showPrompt(msg, defaultVal, onEnter) {
    modalTitle.innerText = "INPUT"; modalTitle.style.color = "#00ccff";
    modalMsg.innerText = msg; modalInput.style.display = 'block';
    modalInput.value = defaultVal; btnCancel.style.display = 'block';
    btnConfirm.innerText = "GO"; setTimeout(() => modalInput.focus(), 100);
    btnConfirm.onclick = () => { if(modalInput.value.trim()) { closeModal(); onEnter(modalInput.value.trim()); }};
    modal.style.display = 'flex';
}
