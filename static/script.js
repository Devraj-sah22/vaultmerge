// File management state
let filesArray = [];
let draggedIndex = null;
let selectedIndices = new Set();
let lastClickedIndex = -1;
let isMultiSelectMode = false;
let insertPosition = null; // For showing insert indicator

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileListContainer = document.getElementById('fileListContainer');
const fileCounter = document.getElementById('fileCounter');
const totalFilesSpan = document.getElementById('totalFilesSpan');
const totalSizeSpan = document.getElementById('totalSizeSpan');
const clearAllBtn = document.getElementById('clearAllBtn');
const sortNameBtn = document.getElementById('sortNameBtn');
const mergeBtn = document.getElementById('mergeBtn');

// Calculate total size
function updateTotalSize() {
    const totalBytes = filesArray.reduce((sum, item) => sum + item.size, 0);
    totalSizeSpan.textContent = formatFileSize(totalBytes);
}

// Helper Functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(type, name) {
    if (type.includes('pdf') || name.toLowerCase().endsWith('.pdf')) {
        return 'fa-file-pdf pdf-icon';
    } else if (type.includes('word') || type.includes('docx') || name.toLowerCase().endsWith('.docx')) {
        return 'fa-file-word docx-icon';
    }
    return 'fa-file';
}

// Render file list with insert indicators
function renderFileList() {
    if (filesArray.length === 0) {
        fileListContainer.innerHTML = `
            <div class="empty-message">
                <i class="far fa-folder-open"></i>
                <p>No files added yet</p>
                <span style="font-size:0.8rem; opacity:0.7;">drop PDF or DOCX files here</span>
            </div>
        `;
        fileCounter.innerText = '0 files';
        totalFilesSpan.innerText = '0';
        updateTotalSize();
        selectedIndices.clear();
        updateActionButtons();
        return;
    }

    let html = '';
    
    // Add insert indicator at the beginning if needed
    if (insertPosition === 0) {
        html += `<div class="insert-indicator" data-position="0">
            <i class="fas fa-arrow-down"></i> Insert here
        </div>`;
    }
    
    filesArray.forEach((item, index) => {
        const isPdf = item.type.includes('pdf') || item.name.toLowerCase().endsWith('.pdf');
        const isDocx = item.type.includes('word') || item.name.toLowerCase().endsWith('.docx');
        const iconClass = getFileIcon(item.type, item.name);
        const fileSize = formatFileSize(item.size);
        const fileType = isPdf ? 'PDF' : 'DOCX';
        const isSelected = selectedIndices.has(index);

        html += `
            <div class="file-item ${isSelected ? 'selected' : ''}" 
                 draggable="true" 
                 data-index="${index}" 
                 data-id="${item.id}"
                 onclick="handleFileClick(event, ${index})">
                <div class="selection-checkbox" onclick="event.stopPropagation()">
                    <i class="fas ${isSelected ? 'fa-check-square' : 'fa-square'}"></i>
                </div>
                <div class="file-icon"><i class="fas ${iconClass}"></i></div>
                <div class="file-info">
                    <span class="file-name" title="${item.name}">${item.name}</span>
                    <div class="file-meta">
                        <span class="file-size">${fileSize}</span>
                        <span class="file-type-badge">${fileType}</span>
                    </div>
                </div>
                <div class="position-badge" onclick="event.stopPropagation()" title="Click to insert before">
                    <i class="fas fa-plus-circle"></i>
                    <span class="position-number">#${index + 1}</span>
                </div>
                <div class="drag-handle" onclick="event.stopPropagation()">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                <div class="item-actions" onclick="event.stopPropagation()">
                    <button class="item-action-btn" onclick="removeFile(${index})" title="Remove file">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Add insert indicator after each file except the last one
        if (insertPosition === index + 1) {
            html += `<div class="insert-indicator" data-position="${index + 1}">
                <i class="fas fa-arrow-down"></i> Insert here
            </div>`;
        }
    });
    
    fileListContainer.innerHTML = html;
    fileCounter.innerText = `${filesArray.length} file${filesArray.length > 1 ? 's' : ''}`;
    totalFilesSpan.innerText = filesArray.length;
    updateTotalSize();
    
    // Attach click handlers to position badges
    document.querySelectorAll('.position-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(badge.closest('.file-item').dataset.index);
            showInsertMenu(index);
        });
    });
    
    // Attach click handlers to insert indicators
    document.querySelectorAll('.insert-indicator').forEach(indicator => {
        indicator.addEventListener('click', () => {
            insertPosition = null;
            renderFileList();
        });
    });
    
    updateActionButtons();
    attachDragListeners();
}

// Show insert menu at specific position
function showInsertMenu(position) {
    const menu = document.createElement('div');
    menu.className = 'insert-menu';
    menu.innerHTML = `
        <div class="insert-menu-content">
            <h4>Insert at position ${position + 1}</h4>
            <button onclick="insertFilesBefore(${position})">
                <i class="fas fa-arrow-up"></i> Insert before
            </button>
            <button onclick="insertFilesAfter(${position})">
                <i class="fas fa-arrow-down"></i> Insert after
            </button>
            <button onclick="replaceAtPosition(${position})">
                <i class="fas fa-sync-alt"></i> Replace
            </button>
            <button onclick="closeInsertMenu()">
                <i class="fas fa-times"></i> Cancel
            </button>
        </div>
    `;
    document.body.appendChild(menu);
    
    // Position the menu near the clicked item
    const item = document.querySelector(`[data-index="${position}"]`);
    if (item) {
        const rect = item.getBoundingClientRect();
        menu.style.top = rect.top + window.scrollY + 'px';
        menu.style.left = rect.left + window.scrollX + 'px';
    }
}

// Insert files before a specific position
window.insertFilesBefore = async function(position) {
    const files = await selectFiles();
    if (files.length > 0) {
        const newItems = createFileItems(files);
        filesArray.splice(position, 0, ...newItems);
        closeInsertMenu();
        renderFileList();
    }
};

// Insert files after a specific position
window.insertFilesAfter = async function(position) {
    const files = await selectFiles();
    if (files.length > 0) {
        const newItems = createFileItems(files);
        filesArray.splice(position + 1, 0, ...newItems);
        closeInsertMenu();
        renderFileList();
    }
};

// Replace file at position
window.replaceAtPosition = async function(position) {
    const files = await selectFiles();
    if (files.length > 0) {
        const newItems = createFileItems(files);
        filesArray.splice(position, 1, ...newItems);
        closeInsertMenu();
        renderFileList();
    }
};

// Close insert menu
window.closeInsertMenu = function() {
    const menu = document.querySelector('.insert-menu');
    if (menu) menu.remove();
};

// Select files via dialog
async function selectFiles() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        
        input.onchange = () => {
            const files = Array.from(input.files).filter(file => {
                const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                              file.name.toLowerCase().endsWith('.docx');
                return isPdf || isDocx;
            });
            resolve(files);
        };
        
        input.click();
    });
}

// Create file items from File objects
function createFileItems(files) {
    return files.map((file, i) => ({
        file: file,
        id: Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 8),
        name: file.name,
        size: file.size,
        type: file.type
    }));
}

// File click handler with multi-select
window.handleFileClick = function(event, index) {
    event.stopPropagation();
    
    if (event.ctrlKey || event.metaKey) {
        if (selectedIndices.has(index)) {
            selectedIndices.delete(index);
        } else {
            selectedIndices.add(index);
        }
        isMultiSelectMode = true;
    } else if (event.shiftKey && lastClickedIndex !== -1) {
        const start = Math.min(lastClickedIndex, index);
        const end = Math.max(lastClickedIndex, index);
        selectedIndices.clear();
        for (let i = start; i <= end; i++) {
            selectedIndices.add(i);
        }
    } else {
        if (!isMultiSelectMode) {
            selectedIndices.clear();
        }
        selectedIndices.add(index);
        lastClickedIndex = index;
        isMultiSelectMode = false;
    }
    
    renderFileList();
};

// Remove individual file
window.removeFile = function(index) {
    filesArray.splice(index, 1);
    const newSelected = new Set();
    selectedIndices.forEach(i => {
        if (i < index) newSelected.add(i);
        else if (i > index) newSelected.add(i - 1);
    });
    selectedIndices = newSelected;
    renderFileList();
};

// Drag and Drop with insert preview
function attachDragListeners() {
    const items = document.querySelectorAll('.file-item');
    const container = fileListContainer;
    
    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
    });
    
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('dragleave', handleDragLeave);
    container.addEventListener('drop', handleDrop);
}

let dragOverIndex = null;

function handleDragStart(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    if (!isNaN(index)) {
        draggedIndex = index;
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Find the closest file item or insert indicator
    const target = e.target.closest('.file-item') || e.target.closest('.insert-indicator');
    if (target) {
        const rect = target.getBoundingClientRect();
        const mouseY = e.clientY;
        const threshold = rect.top + rect.height / 2;
        
        if (target.classList.contains('file-item')) {
            const index = parseInt(target.dataset.index);
            if (mouseY < threshold) {
                dragOverIndex = index;
                showInsertIndicator(index, 'before');
            } else {
                dragOverIndex = index + 1;
                showInsertIndicator(index, 'after');
            }
        } else if (target.classList.contains('insert-indicator')) {
            dragOverIndex = parseInt(target.dataset.position);
        }
    }
}

function showInsertIndicator(index, position) {
    // Remove existing indicators
    document.querySelectorAll('.drag-insert-indicator').forEach(el => el.remove());
    
    // Create new indicator
    const indicator = document.createElement('div');
    indicator.className = 'drag-insert-indicator';
    indicator.innerHTML = '<i class="fas fa-arrow-down"></i> Drop here';
    indicator.dataset.insertIndex = index;
    
    // Position the indicator
    if (index === 0) {
        fileListContainer.insertBefore(indicator, fileListContainer.firstChild);
    } else {
        const targetItem = document.querySelector(`[data-index="${index - 1}"]`);
        if (targetItem) {
            targetItem.parentNode.insertBefore(indicator, targetItem.nextSibling);
        }
    }
}

function handleDragLeave(e) {
    document.querySelectorAll('.drag-insert-indicator').forEach(el => el.remove());
    dragOverIndex = null;
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove indicators
    document.querySelectorAll('.drag-insert-indicator').forEach(el => el.remove());
    
    if (draggedIndex === null) return;
    
    let targetIndex = dragOverIndex;
    
    if (targetIndex === null || targetIndex === undefined) {
        // Find drop position based on mouse
        const rect = fileListContainer.getBoundingClientRect();
        const mouseY = e.clientY;
        const items = document.querySelectorAll('.file-item');
        
        if (items.length === 0) {
            targetIndex = 0;
        } else {
            targetIndex = items.length;
            for (let i = 0; i < items.length; i++) {
                const itemRect = items[i].getBoundingClientRect();
                if (mouseY < itemRect.top + itemRect.height / 2) {
                    targetIndex = i;
                    break;
                }
            }
        }
    }
    
    // Reorder array
    const [movedItem] = filesArray.splice(draggedIndex, 1);
    
    // Adjust target index if moving from before to after
    if (draggedIndex < targetIndex) {
        targetIndex--;
    }
    
    filesArray.splice(targetIndex, 0, movedItem);
    
    // Adjust selected indices
    const newSelected = new Set();
    selectedIndices.forEach(i => {
        if (i === draggedIndex) {
            newSelected.add(targetIndex);
        } else if (i < draggedIndex && i < targetIndex) {
            newSelected.add(i);
        } else if (i > draggedIndex && i > targetIndex) {
            newSelected.add(i);
        } else if (i < draggedIndex && i >= targetIndex) {
            newSelected.add(i + 1);
        } else if (i > draggedIndex && i <= targetIndex) {
            newSelected.add(i - 1);
        } else {
            newSelected.add(i);
        }
    });
    selectedIndices = newSelected;
    
    renderFileList();
    draggedIndex = null;
    dragOverIndex = null;
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-insert-indicator').forEach(el => el.remove());
    draggedIndex = null;
    dragOverIndex = null;
}

// File Addition
function addFilesFromList(fileList) {
    if (!fileList) return;
    
    const newFiles = createFileItems(Array.from(fileList).filter(file => {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                      file.name.toLowerCase().endsWith('.docx');
        return isPdf || isDocx;
    }));
    
    if (newFiles.length > 0) {
        filesArray = [...filesArray, ...newFiles];
        renderFileList();
    } else {
        alert('Only PDF or DOCX files are accepted.');
    }
}

// Event Listeners for upload
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    addFilesFromList(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    addFilesFromList(e.target.files);
    fileInput.value = '';
});

// Clear all files
clearAllBtn.addEventListener('click', () => {
    filesArray = [];
    selectedIndices.clear();
    renderFileList();
});

// Sort by name
sortNameBtn.addEventListener('click', () => {
    filesArray.sort((a, b) => a.name.localeCompare(b.name));
    selectedIndices.clear();
    renderFileList();
});

// ============ ENHANCED REARRANGE FUNCTIONS ============

// Move selected to top
document.getElementById('moveTopBtn').addEventListener('click', () => {
    if (selectedIndices.size === 0) {
        alert('Please select files to move');
        return;
    }
    
    const selected = Array.from(selectedIndices).sort((a, b) => a - b);
    const selectedItems = selected.map(i => filesArray[i]);
    
    filesArray = filesArray.filter((_, i) => !selectedIndices.has(i));
    filesArray = [...selectedItems, ...filesArray];
    
    selectedIndices.clear();
    renderFileList();
});

// Move selected up
document.getElementById('moveUpBtn').addEventListener('click', () => {
    if (selectedIndices.size === 0) return;
    
    const indices = Array.from(selectedIndices).sort((a, b) => a - b);
    
    if (indices[0] === 0) {
        alert('Cannot move up: already at the top');
        return;
    }
    
    for (let i = 0; i < indices.length; i++) {
        const currentIdx = indices[i];
        const newIdx = currentIdx - 1;
        [filesArray[currentIdx], filesArray[newIdx]] = [filesArray[newIdx], filesArray[currentIdx]];
        indices[i] = newIdx;
    }
    
    const newSelected = new Set(indices);
    selectedIndices = newSelected;
    renderFileList();
});

// Move selected down
document.getElementById('moveDownBtn').addEventListener('click', () => {
    if (selectedIndices.size === 0) return;
    
    const indices = Array.from(selectedIndices).sort((a, b) => b - a);
    
    if (indices[0] === filesArray.length - 1) {
        alert('Cannot move down: already at the bottom');
        return;
    }
    
    for (let i = 0; i < indices.length; i++) {
        const currentIdx = indices[i];
        const newIdx = currentIdx + 1;
        [filesArray[currentIdx], filesArray[newIdx]] = [filesArray[newIdx], filesArray[currentIdx]];
        indices[i] = newIdx;
    }
    
    const newSelected = new Set(indices);
    selectedIndices = newSelected;
    renderFileList();
});

// Move selected to bottom
document.getElementById('moveBottomBtn').addEventListener('click', () => {
    if (selectedIndices.size === 0) {
        alert('Please select files to move');
        return;
    }
    
    const selected = Array.from(selectedIndices).sort((a, b) => b - a);
    const selectedItems = selected.map(i => filesArray[i]);
    
    filesArray = filesArray.filter((_, i) => !selectedIndices.has(i));
    filesArray = [...filesArray, ...selectedItems];
    
    selectedIndices.clear();
    renderFileList();
});

// Remove selected files
document.getElementById('removeSelectedBtn').addEventListener('click', () => {
    if (selectedIndices.size === 0) {
        alert('Please select files to remove');
        return;
    }
    
    filesArray = filesArray.filter((_, i) => !selectedIndices.has(i));
    selectedIndices.clear();
    renderFileList();
});

// Select all files
document.getElementById('selectAllBtn').addEventListener('click', () => {
    selectedIndices.clear();
    for (let i = 0; i < filesArray.length; i++) {
        selectedIndices.add(i);
    }
    renderFileList();
});

// Deselect all files
document.getElementById('deselectAllBtn').addEventListener('click', () => {
    selectedIndices.clear();
    renderFileList();
});

// Reverse order
document.getElementById('reverseOrderBtn').addEventListener('click', () => {
    filesArray.reverse();
    selectedIndices.clear();
    renderFileList();
});

// Shuffle order
document.getElementById('shuffleBtn').addEventListener('click', () => {
    for (let i = filesArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [filesArray[i], filesArray[j]] = [filesArray[j], filesArray[i]];
    }
    selectedIndices.clear();
    renderFileList();
});

// Update action buttons based on selection
function updateActionButtons() {
    const hasSelection = selectedIndices.size > 0;
    const moveButtons = ['moveTopBtn', 'moveUpBtn', 'moveDownBtn', 'moveBottomBtn', 'removeSelectedBtn'];
    
    moveButtons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.style.opacity = hasSelection ? '1' : '0.5';
            btn.style.pointerEvents = hasSelection ? 'auto' : 'none';
        }
    });
}

// Merge Functionality
mergeBtn.addEventListener('click', async () => {
    if (filesArray.length === 0) {
        alert('Please add some PDF or DOCX files first.');
        return;
    }

    const formData = new FormData();
    
    // Append files in the exact order shown in UI
    filesArray.forEach(item => {
        formData.append('files', item.file);
    });

    // Show loading state
    mergeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    mergeBtn.disabled = true;

    try {
        const response = await fetch('/merge', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Merge failed');
        }

        // Get the blob and trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'VaultMerge_Result.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        // Success animation
        mergeBtn.style.background = '#2ecc71';
        setTimeout(() => {
            mergeBtn.style.background = '#18344e';
        }, 500);

    } catch (err) {
        alert('Error merging files: ' + err.message);
    } finally {
        mergeBtn.innerHTML = '<i class="fas fa-compress-alt"></i> Merge all files';
        mergeBtn.disabled = false;
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case 'a':
                e.preventDefault();
                if (e.shiftKey) {
                    document.getElementById('deselectAllBtn').click();
                } else {
                    document.getElementById('selectAllBtn').click();
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (e.shiftKey) {
                    document.getElementById('moveTopBtn').click();
                } else {
                    document.getElementById('moveUpBtn').click();
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (e.shiftKey) {
                    document.getElementById('moveBottomBtn').click();
                } else {
                    document.getElementById('moveDownBtn').click();
                }
                break;
        }
    } else if (e.key === 'Delete') {
        document.getElementById('removeSelectedBtn').click();
    }
});

// Initial render
renderFileList();