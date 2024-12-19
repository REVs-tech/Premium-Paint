document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('paintCanvas');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0, lastY = 0;
    let currentTool = 'pencil';
    let startX, startY;
    let selectionStart = null;
    let selections = [];
    let shapes = [];
    let imageObj = new Image();
    let currentShape = null;
    let eyedropperData = null;
    
    // For undo/redo functionality
    let history = [];
    let historyIndex = -1;
    const MAX_HISTORY = 20;

    // Event listeners for buttons
    document.getElementById('pencilBtn').addEventListener('click', () => currentTool = 'pencil');
    document.getElementById('brushBtn').addEventListener('click', () => currentTool = 'brush');
    document.getElementById('shapeBtn').addEventListener('click', () => currentTool = 'shape');
    document.getElementById('selectionBtn').addEventListener('click', () => currentTool = 'selection');
    document.getElementById('eraserBtn').addEventListener('click', () => currentTool = 'eraser');
    document.getElementById('eyedropperBtn').addEventListener('click', () => currentTool = 'eyedropper');
    document.getElementById('clearBtn').addEventListener('click', clearCanvas);
    document.getElementById('saveBtn').addEventListener('click', saveImage);
    document.getElementById('imageLoader').addEventListener('change', loadImage, false);
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);

    // Keyboard shortcuts for undo/redo
    document.addEventListener('keydown', handleKeyPress);

    const shapeSelect = document.getElementById('shapeSelect');

    // Color wheel setup
    const colorWheelCanvas = document.getElementById('colorWheel');
    const colorWheelCtx = colorWheelCanvas.getContext('2d');
    const colorPickerInput = document.getElementById('colorPicker');

    // Function to create a color wheel
    function drawColorWheel() {
        const width = colorWheelCanvas.width;
        const height = colorWheelCanvas.height;
        const radius = width / 2;
        const centerX = width / 2;
        const centerY = height / 2;

        // Draw the color wheel
        for (let angle = 0; angle < 360; angle++) {
            const startAngle = (angle - 1) * Math.PI / 180;
            const endAngle = (angle + 1) * Math.PI / 180;
            colorWheelCtx.beginPath();
            colorWheelCtx.moveTo(centerX, centerY);
            colorWheelCtx.arc(centerX, centerY, radius, startAngle, endAngle);
            colorWheelCtx.closePath();
            
            const hue = angle;
            colorWheelCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            colorWheelCtx.fill();
        }

        // Add event listener for color selection
        colorWheelCanvas.addEventListener('click', function(event) {
            const rect = colorWheelCanvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            // Convert canvas coordinates to HSL
            const dx = x - centerX;
            const dy = y - centerY;
            const angle = Math.atan2(dy, dx);
            let hue = Math.round(angle * (180 / Math.PI)) + 90;
            if (hue < 0) hue += 360;
            if (hue > 360) hue -= 360;

            // Calculate saturation based on distance from center
            const distance = Math.sqrt(dx * dx + dy * dy);
            const saturation = Math.min(distance / radius, 1);

            // Set color picker value to HSL
            const selectedColor = `hsl(${hue}, ${Math.round(saturation * 100)}%, 50%)`;
            colorPickerInput.value = selectedColor;

            // Convert HSL to RGB for canvas drawing
            const rgb = hslToRgb(hue, saturation, 0.5);
            const rgbColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
            colorPickerInput.style.backgroundColor = rgbColor; // Update background for visual feedback
        });
    }

    // Helper function to convert HSL to RGB
    function hslToRgb(h, s, l) {
        let r, g, b;
        if (s == 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h / 360 + 1/3);
            g = hue2rgb(p, q, h / 360);
            b = hue2rgb(p, q, h / 360 - 1/3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    // Call this function to initialize the color wheel
    drawColorWheel();

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    function handleKeyPress(e) {
        if (e.ctrlKey) {
            if (e.key === 'z') {
                undo();
            } else if (e.shiftKey && e.key === 'X') {
                redo();
            }
        }
    }

    function startDrawing(e) {
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
        [startX, startY] = [e.offsetX, e.offsetY];

        if (currentTool === 'selection') {
            selectionStart = { x: e.offsetX, y: e.offsetY };
        } else if (currentTool === 'shape') {
            currentShape = {
                type: document.getElementById('shapeSelect').value,
                x: startX,
                y: startY,
                width: 0,
                height: 0,
                radius: 0,
                fill: document.getElementById('fillColor').checked,
                color: colorPickerInput.value,
                resizing: false
            };
        }
        // Save current state before any new action
        saveState();
    }

    function draw(e) {
        if (!isDrawing) return;

        let brushSize = document.getElementById('brushSize').value;
        let brushOpacity = document.getElementById('brushOpacity').value / 100;
        let color = colorPickerInput.value; // Use the color wheel's selected color

        switch(currentTool) {
            case 'pencil':
                ctx.globalAlpha = 1; 
                ctx.lineWidth = brushSize;
                ctx.strokeStyle = color;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(lastX, lastY);
                ctx.lineTo(e.offsetX, e.offsetY);
                ctx.stroke();
                [lastX, lastY] = [e.offsetX, e.offsetY];
                break;
            case 'brush':
                ctx.globalAlpha = brushOpacity;
                ctx.lineWidth = brushSize;
                ctx.strokeStyle = color;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(lastX, lastY);
                ctx.lineTo(e.offsetX, e.offsetY);
                ctx.stroke();
                [lastX, lastY] = [e.offsetX, e.offsetY];
                break;
            case 'eraser':
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath();
                ctx.arc(e.offsetX, e.offsetY, brushSize / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
                break;
            case 'selection':
                if (selectionStart) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    redrawAll();
                    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'; 
                    ctx.setLineDash([5, 5]);
                    ctx.strokeRect(selectionStart.x, selectionStart.y, e.offsetX - selectionStart.x, e.offsetY - selectionStart.y);
                    ctx.setLineDash([]);
                }
                break;
            case 'shape':
                if (currentShape) {
                    const previewArea = getPreviewArea(currentShape);
                    ctx.clearRect(previewArea.x, previewArea.y, previewArea.width, previewArea.height);
                    redrawAll();
                    updateShape(currentShape, e.offsetX, e.offsetY);
                    drawShape(currentShape);
                }
                break;
            case 'eyedropper':
                canvas.style.cursor = 'crosshair';
                break;
        }
    }

    function updateShape(shape, endX, endY) {
        switch(shape.type) {
            case 'circle':
                shape.radius = Math.sqrt(Math.pow(endX - shape.x, 2) + Math.pow(endY - shape.y, 2));
                break;
            case 'rectangle':
            case 'oval':
                shape.width = endX - shape.x;
                shape.height = endY - shape.y;
                break;
            case 'star':
                shape.radius = Math.sqrt(Math.pow(endX - shape.x, 2) + Math.pow(endY - shape.y, 2));
                break;
        }
    }

    function drawShape(shape) {
        ctx.beginPath();
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = 2; 
        if (shape.fill) {
            ctx.fillStyle = shape.color;
        }
        switch(shape.type) {
            case 'circle':
                ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
                break;
            case 'rectangle':
                ctx.rect(shape.x, shape.y, shape.width, shape.height);
                break;
            case 'star':
                const spikes = 5;
                const outerRadius = shape.radius;
                const innerRadius = outerRadius / 2;
                let rot = Math.PI / 2 * 3;
                ctx.moveTo(shape.x, shape.y - outerRadius);
                for (let i = 0; i < spikes; i++) {
                    let x = shape.x + Math.cos(rot) * outerRadius;
                    let y = shape.y + Math.sin(rot) * outerRadius;
                    ctx.lineTo(x, y);
                    rot += Math.PI / spikes;
                    x = shape.x + Math.cos(rot) * innerRadius;
                    y = shape.y + Math.sin(rot) * innerRadius;
                    ctx.lineTo(x, y);
                    rot += Math.PI / spikes;
                }
                ctx.closePath();
                break;
            case 'oval':
                ctx.ellipse(shape.x, shape.y, Math.abs(shape.width), Math.abs(shape.height), 0, 0, 2 * Math.PI);
                break;
        }
        if (shape.fill) {
            ctx.fill();
        }
        ctx.stroke();
    }

    function stopDrawing(e) {
        isDrawing = false;
        if (currentTool === 'selection' && selectionStart) {
            selections.push({
                x: selectionStart.x,
                y: selectionStart.y,
                width: e.offsetX - selectionStart.x,
                height: e.offsetY - selectionStart.y,
                data: ctx.getImageData(selectionStart.x, selectionStart.y, e.offsetX - selectionStart.x, e.offsetY - selectionStart.y)
            });
            selectionStart = null;
        } else if (currentTool === 'shape' && currentShape) {
            shapes.push(currentShape);
            currentShape = null;
        } else if (currentTool === 'eyedropper') {
            pickColor(e);
            canvas.style.cursor = 'default';
        }
        // Save state after action is completed
        saveState();
    }

    function redrawAll() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
        
        // Draw image if one has been loaded
        if (imageObj.src) {
            ctx.drawImage(imageObj, 0, 0, canvas.width, canvas.height);
        }

        // Redraw shapes
        shapes.forEach(shape => drawShape(shape));

        // Redraw selections if there are any
        selections.forEach(selection => {
            ctx.putImageData(selection.data, selection.x, selection.y);
            if (selection.dragging) {
                ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
                ctx.setLineDash([]);
            }
        });

        // Update eyedropperData for color picking
        eyedropperData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    function getPreviewArea(shape) {
        let x = Math.min(shape.x, startX);
        let y = Math.min(shape.y, startY);
        let width = Math.abs(shape.x - startX) + Math.abs(shape.width);
        let height = Math.abs(shape.y - startY) + Math.abs(shape.height);
        
        if (shape.type === 'circle' || shape.type === 'star') {
            width = height = Math.max(width, height);
        }

        return {x, y, width, height};
    }

    function saveState() {
        // Remove any redo states since we're creating a new history entry
        if (historyIndex < history.length - 1) {
            history.splice(historyIndex + 1);
        }
        history.push(canvas.toDataURL());
        historyIndex++;
        if (history.length > MAX_HISTORY) {
            history.shift();
            historyIndex--; 
        }
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            loadState(history[historyIndex]);
        }
    }

    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            loadState(history[historyIndex]);
        }
    }

    function loadState(state) {
        const img = new Image();
        img.onload = function() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            // Reset shapes and selections since they're not tracked in history
            shapes = [];
            selections = [];
            // Reapply image if there was one
            if (imageObj.src) {
                ctx.drawImage(imageObj, 0, 0, canvas.width, canvas.height);
            }
            // Redraw to ensure all current elements are visible
            redrawAll();
        };
        img.src = state;
    }

    function clearCanvas() {
        shapes = [];
        selections = [];
        imageObj.src = ''; 
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        saveState(); 
    }

    function saveImage() {
        const dataURL = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'my_painting.png';
        link.href = dataURL;
        link.click();
    }

    function loadImage(e) {
        const reader = new FileReader();
        reader.onload = function(event){
            imageObj.src = event.target.result;
            imageObj.onload = function(){
                redrawAll(); 
            }
        }
        reader.readAsDataURL(e.target.files[0]);
    }

    function pickColor(e) {
        if (currentTool === 'eyedropper') {
            const pixel = eyedropperData.data.slice((Math.floor(e.offsetY) * canvas.width + Math.floor(e.offsetX)) * 4, (Math.floor(e.offsetY) * canvas.width + Math.floor(e.offsetX)) * 4 + 4);
            const color = `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`;
            colorPickerInput.value = color; // Set the color picker input value
            const rgbColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
            colorPickerInput.style.backgroundColor = rgbColor; // Update visual feedback on color picker
            currentTool = 'pencil'; // Change back to pencil after picking color
        }
    }

    // Function to update the select's background image
    function updateShapeIcon() {
        const selectedOption = shapeSelect.options[shapeSelect.selectedIndex];
        const iconUrl = selectedOption.getAttribute('data-icon');
        shapeSelect.style.backgroundImage = `url(${iconUrl})`;
    }

    // Event listener for when a shape is selected
    shapeSelect.addEventListener('change', updateShapeIcon);

    // Call this once to set the initial icon based on the first option
    updateShapeIcon();

    // Drag and Drop functionality
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        let file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
            let reader = new FileReader();
            reader.onload = function(event){
                imageObj.src = event.target.result;
                imageObj.onload = function(){
                    redrawAll(); 
                }
            }
            reader.readAsDataURL(file);
        }
    });

    // Additional functionality for moving the selected area
    canvas.addEventListener('mousedown', (e) => {
        selections.forEach(selection => {
            if (e.offsetX >= selection.x && e.offsetX <= selection.x + selection.width && 
                e.offsetY >= selection.y && e.offsetY <= selection.y + selection.height) {
                selection.dragging = true;
                selection.dragOffset = { x: e.offsetX - selection.x, y: e.offsetY - selection.y };
            }
        });
    });

    canvas.addEventListener('mousemove', (e) => {
        selections.forEach(selection => {
            if (selection.dragging) {
                selection.x = e.offsetX - selection.dragOffset.x;
                selection.y = e.offsetY - selection.dragOffset.y;
                redrawAll(); // Redraw to show moving selection
            }
        });
    });

    canvas.addEventListener('mouseup', () => {
        selections.forEach(selection => {
            if (selection.dragging) {
                selection.dragging = false;
                saveState(); // Save state after moving selection
            }
        });
    });

    // Event listener for resizing shapes (basic, can be expanded):
    canvas.addEventListener('dblclick', (e) => {
        let clickedShape = shapes.find(shape => {
            switch(shape.type) {
                case 'circle':
                    return Math.sqrt(Math.pow(e.offsetX - shape.x, 2) + Math.pow(e.offsetY - shape.y, 2)) <= shape.radius;
                case 'rectangle':
                    return e.offsetX >= shape.x && e.offsetX <= shape.x + shape.width && 
                           e.offsetY >= shape.y && e.offsetY <= shape.y + shape.height;
                case 'star':
                    // Simplified hit detection for star
                    return Math.sqrt(Math.pow(e.offsetX - shape.x, 2) + Math.pow(e.offsetY - shape.y, 2)) <= shape.radius;
                case 'oval':
                    return Math.pow((e.offsetX - shape.x) / (shape.width / 2), 2) +
                           Math.pow((e.offsetY - shape.y) / (shape.height / 2), 2) <= 1;
            }
        });
        
        if (clickedShape) {
            clickedShape.resizing = true;
            currentShape = clickedShape;
            redrawAll(); // redraw to show that shape is now selected for resizing
            saveState(); // Save state before resizing
        }
    });

    // Resizing logic in draw function:
    canvas.addEventListener('mousemove', (e) => {
        if (currentShape && currentShape.resizing) {
            updateShape(currentShape, e.offsetX, e.offsetY);
            redrawAll();
        }
    });

    canvas.addEventListener('mouseup', () => {
        if (currentShape && currentShape.resizing) {
            currentShape.resizing = false;
            currentShape = null;
            saveState(); // Save state after resizing
        }
    });

    // Helper function to update canvas state
    function updateCanvasState() {
        redrawAll();
    }

    // Initial draw to ensure canvas is not blank at start
    saveState(); // Initial state
});