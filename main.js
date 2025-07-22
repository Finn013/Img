// main.js
// Основная логика приложения для рисования по сетке

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ ---
let gridType = 'square';
let gridScale = 50;
let userLines = [];
let fills = [];
let selectedNode = null;
let tempLine = null;
let isDrawing = false;
let currentLineColor = '#000000';
let hoveredLineIdx = -1;
let hoveredSegment = null;

// --- НОВЫЕ ПЕРЕМЕННЫЕ ДЛЯ РУЧНОЙ ЗАЛИВКИ ---
let fillContourMode = false;
let currentContour = [];
let removeFillMode = false;

// --- НОВЫЕ ПЕРЕМЕННЫЕ ДЛЯ КАМЕРЫ (PAN & ZOOM) ---
const camera = { x: 0, y: 0, zoom: 1 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let lastTouchDistance = 0;

// --- РЕЖИМЫ РАБОТЫ ---
let deleteMode = false;
let deleteBetweenMode = false;

// --- DOM ЭЛЕМЕНТЫ ---
const canvasContainer = document.querySelector('.scroll-container');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const gridTypeSelect = document.getElementById('gridType');
const clearBtn = document.getElementById('clearBtn');
const undoBtn = document.getElementById('undoBtn');
const deleteLineBtn = document.getElementById('deleteLineBtn');
const deleteBetweenBtn = document.getElementById('deleteBetweenBtn');
const lineColorInput = document.getElementById('lineColor');
const startFillBtn = document.getElementById('startFillBtn');
const removeFillBtn = document.getElementById('removeFillBtn');
const savePngBtn = document.getElementById('savePngBtn');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const loadProjectBtn = document.getElementById('loadProjectBtn');
const toggleControlsBtn = document.getElementById('toggleControlsBtn');
const controlsContent = document.getElementById('controls-content');

// --- ИНИЦИАЛИЗАЦИЯ РАЗМЕРОВ CANVAS ---
function resizeCanvas() {
    canvas.width = canvasContainer.clientWidth;
    canvas.height = canvasContainer.clientHeight;
    draw();
}
window.addEventListener('resize', resizeCanvas);

// --- ФУНКЦИИ ТРАНСФОРМАЦИИ КООРДИНАТ ---
function screenToWorld(x, y) { return { x: (x - camera.x) / camera.zoom, y: (y - camera.y) / camera.zoom }; }
function worldToScreen(x, y) { return { x: x * camera.zoom + camera.x, y: y * camera.zoom + camera.y }; }

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function getLineCoord(node) { if (!node) return null; if (node.isIntersection) return { x: node.x, y: node.y }; if (gridLogics[node.type]) return gridLogics[node.type].getNodeCoord(node); return null; }
function getNodeKey(node) { const c = getLineCoord(node); if (!c) return null; return `${c.x.toFixed(3)},${c.y.toFixed(3)}`; }
function segmentIntersection(a1, a2, b1, b2) { const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x); if (Math.abs(d) < 1e-10) return null; const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d; const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d; if (t > 1e-8 && t < 1 - 1e-8 && u > 1e-8 && u < 1 - 1e-8) { return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) }; } return null; }
function getAllIntersectionPoints() { const points = []; for (let i = 0; i < userLines.length; i++) { for (let j = i + 1; j < userLines.length; j++) { const a1 = getLineCoord(userLines[i].from), a2 = getLineCoord(userLines[i].to); const b1 = getLineCoord(userLines[j].from), b2 = getLineCoord(userLines[j].to); if (a1 && a2 && b1 && b2) { const pt = segmentIntersection(a1, a2, b1, b2); if (pt) points.push(pt); } } } return points; }
function pointToSegmentDist(px, py, a, b) { const dx = b.x - a.x, dy = b.y - a.y; if (dx === 0 && dy === 0) return Math.hypot(px - a.x, py - a.y); const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)); }
function pointOnSegment(pt, a, b) { const distAP = Math.hypot(pt.x - a.x, pt.y - a.y), distPB = Math.hypot(pt.x - b.x, pt.y - b.y), distAB = Math.hypot(a.x - b.x, a.y - b.y); return Math.abs(distAP + distPB - distAB) < 1e-6; }
function nodesAreEqual(n1, n2) { if (!n1 || !n2) return false; const c1 = getLineCoord(n1), c2 = getLineCoord(n2); if (!c1 || !c2) return false; return Math.hypot(c1.x - c2.x, c1.y - c2.y) < 1e-6; }
function coordToNode(coord) { return { x: coord.x, y: coord.y, isIntersection: true, type: 'intersection' }; }
const gridLogics = {
    square: { getNodeCoord(node) { return { x: node.xIdx * gridScale, y: node.yIdx * gridScale }; }, getNearestNode(x, y) { const xIdx = Math.round(x / gridScale), yIdx = Math.round(y / gridScale); const { x: px, y: py } = this.getNodeCoord({ xIdx, yIdx }); if (Math.hypot(px - x, py - y) > 20 / camera.zoom) return null; return { xIdx, yIdx }; }, drawGrid() { ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1 / camera.zoom; const worldTl = screenToWorld(0, 0); const worldBr = screenToWorld(canvas.width, canvas.height); for (let x = Math.floor(worldTl.x / gridScale) * gridScale; x < worldBr.x; x += gridScale) { ctx.beginPath(); ctx.moveTo(x, worldTl.y); ctx.lineTo(x, worldBr.y); ctx.stroke(); } for (let y = Math.floor(worldTl.y / gridScale) * gridScale; y < worldBr.y; y += gridScale) { ctx.beginPath(); ctx.moveTo(worldTl.x, y); ctx.lineTo(worldBr.x, y); ctx.stroke(); } } },
    triangle: { getNodeCoord(node) { const a = gridScale, h = a * Math.sqrt(3) / 2, x = node.col * (a / 2), y = node.row * h; if ((node.row + node.col) % 2 === 0) { if (node.vertex === 0) return { x: x, y: y }; if (node.vertex === 1) return { x: x + a / 2, y: y + h }; if (node.vertex === 2) return { x: x - a / 2, y: y + h }; } else { if (node.vertex === 0) return { x: x, y: y + h }; if (node.vertex === 1) return { x: x + a / 2, y: y }; if (node.vertex === 2) return { x: x - a / 2, y: y }; } return null; }, getNearestNode(x, y) { const a = gridScale, h = a * Math.sqrt(3) / 2; let minDist = Infinity, best = null; const worldTl = screenToWorld(0, 0); const worldBr = screenToWorld(canvas.width, canvas.height); for (let row = Math.floor(worldTl.y / h) - 1; row * h < worldBr.y + h; row++) { for (let col = Math.floor(worldTl.x / (a/2)) - 1; col * a / 2 < worldBr.x + a; col++) { for (let vertex = 0; vertex < 3; vertex++) { const node = { row, col, vertex }; const coord = this.getNodeCoord(node); if (!coord) continue; const dist = Math.hypot(coord.x - x, coord.y - y); if (dist < minDist) { minDist = dist; best = node; } } } } if (minDist > 20 / camera.zoom) return null; return best; }, drawGrid() { ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1 / camera.zoom; const a = gridScale, h = a * Math.sqrt(3) / 2; const worldTl = screenToWorld(0, 0); const worldBr = screenToWorld(canvas.width, canvas.height); for (let row = Math.floor(worldTl.y / h) - 1; row * h < worldBr.y + h; row++) { for (let col = Math.floor(worldTl.x / (a/2)) - 1; col * a / 2 < worldBr.x + a; col++) { ctx.beginPath(); if ((row + col) % 2 === 0) { ctx.moveTo(col * a / 2, row * h); ctx.lineTo(col * a / 2 + a / 2, row * h + h); ctx.lineTo(col * a / 2 - a / 2, row * h + h); } else { ctx.moveTo(col * a / 2, row * h + h); ctx.lineTo(col * a / 2 + a / 2, row * h); ctx.lineTo(col * a / 2 - a / 2, row * h); } ctx.closePath(); ctx.stroke(); } } } },
    hexagon: { getNodeCoord(node) { const r = gridScale / 2, dx = r * Math.sqrt(3), dy = r * 1.5, x = r + (node.row % 2) * (dx / 2) + node.col * dx, y = r + node.row * dy, theta = Math.PI / 6 + (Math.PI / 3) * node.vertex; return { x: x + r * Math.cos(theta), y: y + r * Math.sin(theta) }; }, getNearestNode(x, y) { const r = gridScale / 2, dx = r * Math.sqrt(3), dy = r * 1.5; let minDist = Infinity, best = null; const worldTl = screenToWorld(0, 0); const worldBr = screenToWorld(canvas.width, canvas.height); for (let row = Math.floor((worldTl.y - r) / dy) - 1; (r + row * dy) < worldBr.y + r; row++) { for (let col = Math.floor((worldTl.x - r) / dx) - 1; (r + (row % 2) * (dx / 2) + col * dx) < worldBr.x + r; col++) { for (let vertex = 0; vertex < 6; vertex++) { const node = { row, col, vertex }; const coord = this.getNodeCoord(node); const dist = Math.hypot(coord.x - x, coord.y - y); if (dist < minDist) { minDist = dist; best = node; } } } } if (minDist > 20 / camera.zoom) return null; return best; }, drawGrid() { ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1 / camera.zoom; const r = gridScale / 2, dx = r * Math.sqrt(3), dy = r * 1.5; const worldTl = screenToWorld(0, 0); const worldBr = screenToWorld(canvas.width, canvas.height); for (let row = Math.floor((worldTl.y - r) / dy) - 1; (r + row * dy) < worldBr.y + r; row++) { for (let col = Math.floor((worldTl.x - r) / dx) - 1; (r + (row % 2) * (dx / 2) + col * dx) < worldBr.x + r; col++) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const coord = this.getNodeCoord({ row, col, vertex: i }); if (i === 0) ctx.moveTo(coord.x, coord.y); else ctx.lineTo(coord.x, coord.y); } ctx.closePath(); ctx.stroke(); } } } }
};
function pointInPolygon(pt, poly) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j++) { const xi = poly[i].x, yi = poly[i].y; const xj = poly[j].x, yj = poly[j].y; if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-9) + xi)) { inside = !inside; } } return inside; }

// --- ОСНОВНАЯ ФУНКЦИЯ ОТРИСОВКИ ---

function draw() {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);
    if (gridLogics[gridType]) { gridLogics[gridType].drawGrid(); }
    drawFills();
    drawUserLines();
    drawHoveredSegment();
    drawCurrentContour();
    drawTempLine();
    drawSelectedNode();
    ctx.restore();
}

// --- ФУНКЦИИ ОТРИСОВКИ КОМПОНЕНТОВ ---

function drawCurrentContour() { if (currentContour.length === 0) return; ctx.save(); ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 3 / camera.zoom; ctx.beginPath(); currentContour.forEach((node, i) => { const coord = getLineCoord(node); if (i === 0) ctx.moveTo(coord.x, coord.y); else ctx.lineTo(coord.x, coord.y); }); ctx.stroke(); ctx.restore(); }
function drawFills() { ctx.save(); fills.forEach(fill => { ctx.beginPath(); const polygon = fill.contour.map(getLineCoord); polygon.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath(); ctx.fillStyle = fill.color; ctx.globalAlpha = 0.4; ctx.fill(); }); ctx.restore(); }
function drawUserLines() { ctx.save(); userLines.forEach((line, idx) => { const from = getLineCoord(line.from); const to = getLineCoord(line.to); if (!from || !to) return; ctx.strokeStyle = (deleteMode && idx === hoveredLineIdx) ? '#e53935' : (line.color || '#000'); ctx.lineWidth = (deleteMode && idx === hoveredLineIdx) ? 6 / camera.zoom : 4 / camera.zoom; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); }); ctx.restore(); }
function drawHoveredSegment() { if (!deleteBetweenMode || !hoveredSegment) return; ctx.save(); ctx.strokeStyle = '#e53935'; ctx.lineWidth = 8 / camera.zoom; const from = getLineCoord(hoveredSegment.from); const to = getLineCoord(hoveredSegment.to); ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore(); }
function drawTempLine() { if (!tempLine) return; const from = getLineCoord(tempLine.from); const to = getLineCoord(tempLine.to); if (!from || !to) return; ctx.save(); ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 3 / camera.zoom; ctx.setLineDash([8 / camera.zoom, 6 / camera.zoom]); ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore(); }
function drawSelectedNode() { if (!selectedNode) return; const coord = getLineCoord(selectedNode); if (!coord) return; ctx.save(); ctx.beginPath(); ctx.arc(coord.x, coord.y, 7 / camera.zoom, 0, 2 * Math.PI); ctx.fillStyle = '#ff9800'; ctx.globalAlpha = 0.7; ctx.fill(); ctx.restore(); }
function getNearestAnyNode(screenX, screenY) { let minDist = Infinity; let bestNode = null; const worldPoint = screenToWorld(screenX, screenY); if (gridLogics[gridType]) { const gridNode = gridLogics[gridType].getNearestNode(worldPoint.x, worldPoint.y); if (gridNode) { const coord = gridLogics[gridType].getNodeCoord(gridNode); const dist = Math.hypot(coord.x - worldPoint.x, coord.y - worldPoint.y); if (dist < minDist) { minDist = dist; bestNode = { ...gridNode, type: gridType }; } } } const intersections = getAllIntersectionPoints(); intersections.forEach(p => { const dist = Math.hypot(p.x - worldPoint.x, p.y - worldPoint.y); if (dist < minDist && dist < 20 / camera.zoom) { minDist = dist; bestNode = { x: p.x, y: p.y, isIntersection: true, type: 'intersection' }; } }); if (minDist > 20 / camera.zoom) return null; return bestNode; }

// --- ОБРАБОТЧИКИ СОБЫТИЙ MOUSE & TOUCH ---

function handlePanStart(x, y) { isPanning = true; panStart.x = x - camera.x; panStart.y = y - camera.y; canvasContainer.style.cursor = 'grabbing'; }
function handlePanMove(x, y) { if (!isPanning) return; camera.x = x - panStart.x; camera.y = y - panStart.y; draw(); }
function handlePanEnd() { isPanning = false; canvasContainer.style.cursor = 'grab'; }
function handleZoom(delta, x, y) { const worldPos = screenToWorld(x, y); const newZoom = Math.max(0.1, Math.min(10, camera.zoom * delta)); camera.x = x - worldPos.x * newZoom; camera.y = y - worldPos.y * newZoom; camera.zoom = newZoom; draw(); }

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1) { handlePanStart(e.clientX, e.clientY); e.preventDefault(); return; }
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (fillContourMode) { const node = getNearestAnyNode(x, y); if (!node) return; if (currentContour.length > 0 && nodesAreEqual(node, currentContour[0])) { currentContour.push(node); if (currentContour.length > 2) { fills.push({ contour: [...currentContour], color: currentLineColor }); } currentContour = []; fillContourMode = false; startFillBtn.disabled = false; canvas.style.cursor = ''; tempLine = null; } else { currentContour.push(node); } draw(); return; }
    if (deleteMode || deleteBetweenMode || removeFillMode) { return; }
    const node = getNearestAnyNode(x, y);
    if (node) { isDrawing = true; selectedNode = node; draw(); }
});

canvas.addEventListener('mousemove', (e) => {
    if (isPanning) { handlePanMove(e.clientX, e.clientY); return; }
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (fillContourMode && currentContour.length > 0) { const lastNode = currentContour[currentContour.length - 1]; const hoverNode = getNearestAnyNode(x, y); tempLine = { from: lastNode, to: hoverNode || coordToNode(screenToWorld(x, y)) }; draw(); return; }
    if (deleteMode) { hoveredLineIdx = userLines.reduce((bestIdx, line, idx) => { const from = getLineCoord(line.from), to = getLineCoord(line.to); if (!from || !to) return bestIdx; const worldPoint = screenToWorld(x, y); const dist = pointToSegmentDist(worldPoint.x, worldPoint.y, from, to); return dist < 10 / camera.zoom && (bestIdx === -1 || dist < pointToSegmentDist(worldPoint.x, worldPoint.y, getLineCoord(userLines[bestIdx].from), getLineCoord(userLines[bestIdx].to))) ? idx : bestIdx; }, -1); draw(); return; }
    if (deleteBetweenMode) { hoveredSegment = null; let minSegmentDist = Infinity; const worldPoint = screenToWorld(x, y); userLines.forEach((line, lineIdx) => { const from = getLineCoord(line.from), to = getLineCoord(line.to); if (!from || !to) return; const breakPoints = [line.from]; getAllIntersectionPoints().forEach(pt => { if (pointOnSegment(pt, from, to)) breakPoints.push(coordToNode(pt)); }); breakPoints.push(line.to); const uniqueBreakPoints = []; breakPoints.forEach(bp => { if (!uniqueBreakPoints.some(ubp => nodesAreEqual(ubp, bp))) uniqueBreakPoints.push(bp); }); uniqueBreakPoints.sort((a, b) => Math.hypot(getLineCoord(a).x - from.x, getLineCoord(a).y - from.y) - Math.hypot(getLineCoord(b).x - from.x, getLineCoord(b).y - from.y)); for (let i = 0; i < uniqueBreakPoints.length - 1; i++) { const p1 = uniqueBreakPoints[i], p2 = uniqueBreakPoints[i+1]; const p1Coord = getLineCoord(p1), p2Coord = getLineCoord(p2); const dist = pointToSegmentDist(worldPoint.x, worldPoint.y, p1Coord, p2Coord); if (dist < 10 / camera.zoom && dist < minSegmentDist) { minSegmentDist = dist; hoveredSegment = { from: p1, to: p2, lineIdx: lineIdx, originalLine: line }; } } }); draw(); return; }
    if (isDrawing && selectedNode) { const hoverNode = getNearestAnyNode(x, y); tempLine = { from: selectedNode, to: hoverNode || coordToNode(screenToWorld(x, y)) }; draw(); }
});

canvas.addEventListener('mouseup', (e) => {
    if (isPanning) { handlePanEnd(); return; }
    if (!isDrawing || !selectedNode) { isDrawing = false; return; }
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const endNode = getNearestAnyNode(x, y);
    if (endNode) { const startCoord = getLineCoord(selectedNode), endCoord = getLineCoord(endNode); if (startCoord && endCoord && Math.hypot(startCoord.x - endCoord.x, startCoord.y - endCoord.y) > 1e-6) { userLines.push({ from: selectedNode, to: endNode, color: currentLineColor }); } }
    isDrawing = false; selectedNode = null; tempLine = null; draw();
});

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (removeFillMode) { let removed = false; const worldPoint = screenToWorld(x, y); for (let i = fills.length - 1; i >= 0; i--) { const polygon = fills[i].contour.map(getLineCoord); if (pointInPolygon(worldPoint, polygon)) { fills.splice(i, 1); removed = true; break; } } if (!removed) alert('Здесь нет заливки для удаления.'); removeFillMode = false; removeFillBtn.disabled = false; canvas.style.cursor = ''; draw(); return; }
    if (deleteMode) { if (hoveredLineIdx !== -1) userLines.splice(hoveredLineIdx, 1); deleteMode = false; deleteLineBtn.disabled = false; hoveredLineIdx = -1; canvas.style.cursor = ''; draw(); return; }
    if (deleteBetweenMode) { if (hoveredSegment) { const { from, to, lineIdx, originalLine } = hoveredSegment; userLines.splice(lineIdx, 1); if (!nodesAreEqual(originalLine.from, from)) { userLines.push({ from: originalLine.from, to: from, color: originalLine.color }); } if (!nodesAreEqual(originalLine.to, to)) { userLines.push({ from: to, to: originalLine.to, color: originalLine.color }); } } deleteBetweenMode = false; deleteBetweenBtn.disabled = false; hoveredSegment = null; canvas.style.cursor = ''; draw(); return; }
});

canvas.addEventListener('wheel', (e) => { e.preventDefault(); const delta = e.deltaY > 0 ? 0.9 : 1.1; handleZoom(delta, e.clientX, e.clientY); });
canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { const rect = canvas.getBoundingClientRect(); const x = e.touches[0].clientX - rect.left; const y = e.touches[0].clientY - rect.top; if (fillContourMode || deleteMode || deleteBetweenMode || removeFillMode) { canvas.dispatchEvent(new MouseEvent('click', { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY })); } else { handlePanStart(e.touches[0].clientX, e.touches[0].clientY); const node = getNearestAnyNode(x, y); if (node) { isDrawing = true; selectedNode = node; draw(); } } } else if (e.touches.length === 2) { isPanning = false; lastTouchDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (e.touches.length === 1 && isDrawing) { const rect = canvas.getBoundingClientRect(); const x = e.touches[0].clientX - rect.left; const y = e.touches[0].clientY - rect.top; const hoverNode = getNearestAnyNode(x, y); tempLine = { from: selectedNode, to: hoverNode || coordToNode(screenToWorld(x, y)) }; draw(); } else if (e.touches.length === 2) { const newTouchDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); const delta = newTouchDistance / lastTouchDistance; const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2; const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2; handleZoom(delta, centerX, centerY); lastTouchDistance = newTouchDistance; } });
canvas.addEventListener('touchend', (e) => {
    if (isDrawing) {
        // Явная логика для завершения линии, вместо симуляции mouseup
        const rect = canvas.getBoundingClientRect();
        const touch = e.changedTouches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const endNode = getNearestAnyNode(x, y);
        if (endNode) {
            const startCoord = getLineCoord(selectedNode), endCoord = getLineCoord(endNode);
            if (startCoord && endCoord && Math.hypot(startCoord.x - endCoord.x, startCoord.y - endCoord.y) > 1e-6) {
                userLines.push({ from: selectedNode, to: endNode, color: currentLineColor });
            }
        }
        isDrawing = false;
        selectedNode = null;
        tempLine = null;
        draw();
    }
    handlePanEnd();
    lastTouchDistance = 0;
});

// --- ОБРАБОТЧИКИ КНОПОК ---
startFillBtn.addEventListener('click', () => { fillContourMode = true; currentContour = []; startFillBtn.disabled = true; canvas.style.cursor = 'copy'; });
removeFillBtn.addEventListener('click', () => { removeFillMode = true; removeFillBtn.disabled = true; canvas.style.cursor = 'not-allowed'; });
clearBtn.addEventListener('click', () => { userLines = []; fills = []; selectedNode = null; tempLine = null; currentContour = []; startFillBtn.disabled = false; draw(); });
undoBtn.addEventListener('click', () => { userLines.pop(); draw(); });
lineColorInput.addEventListener('input', (e) => { currentLineColor = e.target.value; });
deleteLineBtn.addEventListener('click', () => { deleteMode = true; deleteBetweenMode = false; removeFillMode = false; fillContourMode = false; deleteLineBtn.disabled = true; canvas.style.cursor = 'crosshair'; });
deleteBetweenBtn.addEventListener('click', () => { deleteBetweenMode = true; deleteMode = false; removeFillMode = false; fillContourMode = false; deleteBetweenBtn.disabled = true; canvas.style.cursor = 'crosshair'; });
gridTypeSelect.addEventListener('change', (e) => { gridType = e.target.value; draw(); });

savePngBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'drawing.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
});


// --- ЛОГИКА УПРАВЛЕНИЯ ПРОЕКТАМИ ---
const projectList = document.getElementById('projectList');
const deleteProjectBtn = document.getElementById('deleteProjectBtn');

function getProjects() {
    return JSON.parse(localStorage.getItem('gridProjects')) || [];
}

function saveProjects(projects) {
    localStorage.setItem('gridProjects', JSON.stringify(projects));
}

function populateProjectList() {
    const projects = getProjects();
    projectList.innerHTML = '';
    if (projects.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'Проектов нет';
        option.disabled = true;
        projectList.appendChild(option);
    } else {
        projects.forEach((p, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = p.name;
            projectList.appendChild(option);
        });
    }
}

saveProjectBtn.addEventListener('click', () => {
    const name = prompt('Введите имя проекта:', 'Новый проект');
    if (!name) return;

    const projects = getProjects();
    const projectData = {
        name,
        userLines,
        fills,
        camera,
        gridType,
        gridScale,
        timestamp: new Date().toISOString()
    };
    projects.push(projectData);
    saveProjects(projects);
    populateProjectList();
    alert(`Проект "${name}" сохранен!`);
});

loadProjectBtn.addEventListener('click', () => {
    const projects = getProjects();
    const selectedIndex = projectList.value;
    if (selectedIndex < 0 || selectedIndex >= projects.length) {
        alert('Проект для загрузки не выбран.');
        return;
    }

    const projectData = projects[selectedIndex];
    userLines = projectData.userLines || [];
    fills = projectData.fills || [];
    Object.assign(camera, projectData.camera);
    gridType = projectData.gridType;
    gridScale = projectData.gridScale;

    gridTypeSelect.value = gridType;
    draw();
    alert(`Проект "${projectData.name}" загружен!`);
});

deleteProjectBtn.addEventListener('click', () => {
    const projects = getProjects();
    const selectedIndex = projectList.value;
    if (selectedIndex < 0 || selectedIndex >= projects.length) {
        alert('Проект для удаления не выбран.');
        return;
    }

    const projectName = projects[selectedIndex].name;
    if (confirm(`Вы уверены, что хотите удалить проект "${projectName}"?`)) {
        projects.splice(selectedIndex, 1);
        saveProjects(projects);
        populateProjectList();
        alert(`Проект "${projectName}" удален.`);
    }
});


// --- ИНИЦИАЛИЗАЦИЯ ---
resizeCanvas();
populateProjectList(); // Заполняем список проектов при запуске

toggleControlsBtn.addEventListener('click', () => {
    const isHidden = controlsContent.style.display === 'none';
    controlsContent.style.display = isHidden ? '' : 'none';
    toggleControlsBtn.innerHTML = isHidden ? '&#9660;' : '&#9650;';
    // Даем небольшую задержку перед перерисовкой canvas, чтобы layout успел обновиться
    setTimeout(resizeCanvas, 50);
});
