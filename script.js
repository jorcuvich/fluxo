let nodes = [];
let links = [];
let variables = {};

let draggedNode = null;
let dragOffset = { x: 0, y: 0 };
let connectingData = null;
let tempLine = null;
let currentNode = null;
let currentZoom = 1;
let isAnimating = false;

const camera = document.getElementById('camera');
const workspace = document.getElementById('workspace');
const nodesLayer = document.getElementById('nodes-layer');
const svgLayer = document.getElementById('svg-layer');
const animLayer = document.getElementById('anim-layer');
const memoryUI = document.getElementById('memory-ui');
const connIndicator = document.getElementById('connecting-indicator');
const btnNext = document.getElementById('btn-next');

window.onload = () => {
    camera.scrollLeft = 2500 - window.innerWidth / 2;
    camera.scrollTop = 2500 - window.innerHeight / 2;
};

function changeZoom(delta) {
    currentZoom = Math.max(0.4, Math.min(currentZoom + delta, 2)); 
    document.documentElement.style.setProperty('--zoom', currentZoom);
    renderSVG(); 
}
function resetZoom() {
    currentZoom = 1;
    document.documentElement.style.setProperty('--zoom', currentZoom);
    renderSVG();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    document.querySelector('.close-mobile').style.display = window.innerWidth <= 768 ? 'block' : 'none';
}

function getRealCoords(e) {
    const rect = workspace.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) / currentZoom,
        y: (e.clientY - rect.top) / currentZoom
    };
}

function addNode(type) {
    const id = 'node_' + Date.now();
    const centerRealX = (camera.scrollLeft + camera.clientWidth / 2) / currentZoom;
    const centerRealY = (camera.scrollTop + camera.clientHeight / 2) / currentZoom;

    const node = { id, type, x: centerRealX - 75, y: centerRealY - 35, data: '' };
    nodes.push(node);
    renderNodes();
    renderSVG();
    if(window.innerWidth <= 768) toggleSidebar(); 
}

function updateNodeData(id, val) {
    const node = nodes.find(n => n.id === id);
    if (node) node.data = val;
}

function deleteNode(id, event) {
    event.stopPropagation(); 
    
    nodes = nodes.filter(n => n.id !== id);
    links = links.filter(l => l.from !== id && l.to !== id);
    
    if (currentNode && currentNode.id === id) {
        resetExecution();
    } else {
        renderNodes();
        renderSVG();
    }
}

function renderNodes() {
    nodesLayer.innerHTML = '';
    nodes.forEach(node => {
        const el = document.createElement('div');
        el.className = `node node-${node.type} ${currentNode === node ? 'active' : ''}`;
        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';
        el.id = node.id;

        el.onpointerdown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.classList.contains('port') || e.target.classList.contains('btn-delete')) return;
            e.stopPropagation(); 
            el.setPointerCapture(e.pointerId);
            draggedNode = node;
            const coords = getRealCoords(e);
            dragOffset = { x: coords.x - node.x, y: coords.y - node.y };
        };

        let html = `
            <div class="btn-delete" onpointerdown="deleteNode('${node.id}', event)">✖</div>
            <b>${node.type.toUpperCase()}</b>
        `;
        
        let ports = '';

        if (node.type !== 'inicio') ports += `<div class="port port-in" data-target-id="${node.id}"></div>`;

        if (node.type === 'decisao') {
            html += `<input placeholder="Ex: x > 5" value="${node.data}" oninput="updateNodeData('${node.id}', this.value)">`;
            ports += `
                <div class="port port-out-t" onpointerdown="startConnect('${node.id}', 'T', event)"></div>
                <span class="port-label-t">V</span>
                <div class="port port-out-f" onpointerdown="startConnect('${node.id}', 'F', event)"></div>
                <span class="port-label-f">F</span>
            `;
        } else if (['entrada', 'saida', 'processo'].includes(node.type)) {
            let placeholder = node.type === 'processo' ? "Ex: x = x + 1" : "Var: x";
            html += `<input placeholder="${placeholder}" value="${node.data}" oninput="updateNodeData('${node.id}', this.value)">`;
            ports += `<div class="port port-out" onpointerdown="startConnect('${node.id}', 'out', event)"></div>`;
        } else if (node.type === 'inicio') {
            ports += `<div class="port port-out" onpointerdown="startConnect('${node.id}', 'out', event)"></div>`;
        }

        el.innerHTML = html + ports;
        nodesLayer.appendChild(el);
    });
}

function startConnect(id, port, e) {
    e.stopPropagation();
    connectingData = { fromId: id, port: port };
    connIndicator.style.display = 'block';
    tempLine = { x1: 0, y1: 0, x2: 0, y2: 0 };
}

function cancelConnect() {
    connectingData = null;
    tempLine = null;
    connIndicator.style.display = 'none';
    renderSVG();
}

function getPortCoords(nodeId, portType) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return {x:0, y:0};

    let px = node.x; let py = node.y;
    const w = (node.type === 'decisao') ? 140 : 150;
    const h = (node.type === 'decisao') ? 140 : 70;

    if (portType === 'in') { px += w/2; py += (node.type === 'decisao' ? 12 : 0); }
    else if (portType === 'out') { px += w/2; py += h; }
    else if (portType === 'T') { px += 12; py += h/2; } 
    else if (portType === 'F') { px += w - 12; py += h/2; } 
    return {x: px, y: py};
}

function canvasMove(e) {
    if (draggedNode || connectingData) e.preventDefault(); 
    const coords = getRealCoords(e);

    if (draggedNode) {
        draggedNode.x = coords.x - dragOffset.x;
        draggedNode.y = coords.y - dragOffset.y;
        document.getElementById(draggedNode.id).style.left = draggedNode.x + 'px';
        document.getElementById(draggedNode.id).style.top = draggedNode.y + 'px';
        renderSVG();
    } else if (connectingData) {
        let p1 = getPortCoords(connectingData.fromId, connectingData.port);
        tempLine = { x1: p1.x, y1: p1.y, x2: coords.x, y2: coords.y };
        renderSVG();
    }
}

function canvasUp(e) {
    draggedNode = null;
    if (connectingData) {
        let targetEl = e.target;
        if (e.pointerType === 'touch' || e.pointerType === 'pen') {
            targetEl = document.elementFromPoint(e.clientX, e.clientY);
        }

        if (targetEl && targetEl.classList.contains('port-in')) {
            const toId = targetEl.getAttribute('data-target-id');
            if (toId && toId !== connectingData.fromId) {
                links = links.filter(l => !(l.from === connectingData.fromId && l.port === connectingData.port));
                links.push({ from: connectingData.fromId, port: connectingData.port, to: toId });
            }
        }
        cancelConnect();
    }
}

function getOrthogonalPath(p1, p2, portType) {
    const offset = 30; 
    let path = `M ${p1.x} ${p1.y} `;

    if (portType === 'T' || portType === 'F') {
        let dirX = (portType === 'T') ? -1 : 1; 
        let midX = p1.x + (dirX * 80); 
        let midY = p2.y - offset; 
        path += `L ${midX} ${p1.y} L ${midX} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
    } else {
        if (p2.y > p1.y + offset) {
            let midY = (p1.y + p2.y) / 2;
            path += `L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
        } else {
            let midY1 = p1.y + offset;
            let escapeX = p1.x - 130; 
            let midY2 = p2.y - offset;
            path += `L ${p1.x} ${midY1} L ${escapeX} ${midY1} L ${escapeX} ${midY2} L ${p2.x} ${midY2} L ${p2.x} ${p2.y}`;
        }
    }
    return path;
}

function renderSVG() {
    let html = '';
    const strokeW = Math.max(2, 3 / currentZoom); 

    links.forEach(l => {
        let p1 = getPortCoords(l.from, l.port);
        let p2 = getPortCoords(l.to, 'in');
        let color = l.port === 'T' ? 'var(--accent)' : l.port === 'F' ? 'var(--danger)' : '#555';
        let pathData = getOrthogonalPath(p1, p2, l.port);

        html += `<path d="${pathData}" stroke="${color}" stroke-width="${strokeW}" fill="none" stroke-linejoin="round"/>`;
        html += `<polygon points="${p2.x-6},${p2.y-10} ${p2.x+6},${p2.y-10} ${p2.x},${p2.y}" fill="${color}"/>`;
    });

    if (tempLine) {
        let p1 = getPortCoords(connectingData.fromId, connectingData.port);
        html += `<path d="M ${p1.x} ${p1.y} L ${tempLine.x2} ${tempLine.y2}" stroke="#aaa" stroke-width="${strokeW}" stroke-dasharray="5,5" fill="none"/>`;
    }
    svgLayer.innerHTML = html;
}

function evaluateExpr(expr) {
    let scope = { ...variables };
    try {
        const keys = Object.keys(scope);
        const values = Object.values(scope);
        const func = new Function(...keys, "return " + expr + ";");
        return func(...values);
    } catch (e) {
        alert(`Erro de Lógica: Verifique a expressão "${expr}"`);
        return null;
    }
}

function updateMemory() {
    if (Object.keys(variables).length === 0) { memoryUI.innerHTML = "Variáveis limpas..."; return; }
    memoryUI.innerHTML = Object.entries(variables).map(([k, v]) => `<div>${k} = <span style="color:var(--accent)">${v}</span></div>`).join('');
}

function resetExecution() { 
    currentNode = null; 
    variables = {}; 
    isAnimating = false;
    btnNext.disabled = false;
    animLayer.innerHTML = ''; 
    updateMemory(); 
    renderNodes(); 
}

function advance(port) {
    const link = links.find(l => l.from === currentNode.id && l.port === port);
    
    if (link) {
        isAnimating = true;
        btnNext.disabled = true; 

        let p1 = getPortCoords(link.from, link.port);
        let p2 = getPortCoords(link.to, 'in');
        let pathData = getOrthogonalPath(p1, p2, link.port);

        const glow = document.createElementNS("http://www.w3.org/2000/svg", "path");
        glow.setAttribute("d", pathData);
        
        let color = link.port === 'T' ? 'var(--accent)' : link.port === 'F' ? 'var(--danger)' : '#ffffff';
        
        glow.setAttribute("stroke", color);
        glow.setAttribute("stroke-width", Math.max(4, 6 / currentZoom));
        glow.setAttribute("fill", "none");
        glow.setAttribute("stroke-linecap", "round");
        glow.style.filter = `drop-shadow(0 0 10px ${color})`;
        
        animLayer.appendChild(glow);

        const len = glow.getTotalLength();
        glow.style.strokeDasharray = len;
        glow.style.strokeDashoffset = len;

        glow.getBoundingClientRect(); 

        glow.style.transition = "stroke-dashoffset 1s ease-in-out";
        glow.style.strokeDashoffset = "0";

        setTimeout(() => {
            glow.style.transition = "opacity 0.3s ease";
            glow.style.opacity = "0";
            setTimeout(() => glow.remove(), 300);

            currentNode = nodes.find(n => n.id === link.to);
            renderNodes(); 
            
            isAnimating = false;
            btnNext.disabled = false;
        }, 1000); 

    } else {
        alert("Fluxo interrompido: Ponto sem conexão.");
        currentNode = null;
        renderNodes();
    }
}

function runStep() {
    if (isAnimating) return; 

    if (!currentNode) {
        currentNode = nodes.find(n => n.type === 'inicio');
        if (!currentNode) return alert("Erro: O algoritmo exige um bloco de INÍCIO.");
        renderNodes();
        return;
    }

    switch (currentNode.type) {
        case 'inicio': 
            advance('out'); 
            break;
        case 'entrada':
            if(!currentNode.data) return alert("Erro: Defina a variável alvo.");
            let val = prompt(`Console: Entrada de dados para '${currentNode.data}':`);
            if(val !== null) { variables[currentNode.data.trim()] = Number(val); updateMemory(); advance('out'); }
            break;
        case 'processo':
            let parts = currentNode.data.split('=');
            if (parts.length === 2) {
                let varName = parts[0].trim(); let result = evaluateExpr(parts[1].trim());
                if(result !== null) { variables[varName] = result; updateMemory(); advance('out'); }
            } else { alert("A Atribuição requer: variavel = expressão."); }
            break;
        case 'decisao':
            let cond = evaluateExpr(currentNode.data);
            if(cond !== null) advance(cond ? 'T' : 'F');
            break;
        case 'saida':
            let outVal = evaluateExpr(currentNode.data);
            alert(`CONSOLE:\n\n> ${outVal}`); advance('out');
            break;
        case 'fim':
            alert("Execução Finalizada."); resetExecution(); break;
    }
}